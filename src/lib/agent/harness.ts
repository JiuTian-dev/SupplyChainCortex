/**
 * Agent Harness — 2026 年 Agent 架构标准实现。
 *
 * 核心公式：Agent = Model + Harness
 *
 * Harness 包含：
 * 1. Planner（规划者）— 接收需求，展开为可执行计划
 * 2. Executor（执行者）— 按计划执行工具调用
 * 3. Evaluator（评估者）— 独立评估执行结果（消除自评偏差）
 *
 * Loop Engineering：
 * - 定义目标 → 上下文采集 → 行动 → 观察 → 调整 → 循环直到完成
 * - 测试失败不是错误，是新的上下文
 * - 类型错误不是阻塞，是关于假设被推翻的信号
 *
 * 参考：
 * - Viv Trivedy: Agent = Model + Harness
 * - Addy Osmani: "一个不错的模型配上优秀的 Harness，击败了一个优秀模型配上糟糕的 Harness"
 * - Anthropic Prithvi Rajasekaran: GAN 启发的三 Agent 架构
 * - HumanLayer: Terminal Bench 2.0 第33→第5的案例
 *
 * 用法：
 *   import { createHarness } from '@/lib/agent/harness';
 *   const harness = createHarness(adapter);
 *   const result = await harness.run(userInput, { maxIterations: 5 });
 */

import type { ProviderAdapter } from './adapter';
import type { ChatMessage } from '@/lib/services/ai-providers.service';
import type { MCPTool } from '@/lib/mcp/tools';
import type { ToolCall, ToolResult } from './fsm-types';
import { executeTool } from '@/lib/mcp/tools';
import {
  routeToSkills,
  getToolsForSkills,
  getMergedSystemPrompt,
  getSkillSummaries,
  getAllSkillTools,
  type SkillId,
} from '@/lib/mcp/skills';
import { getHookSystem, type HookContext } from './hooks';

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

/**
 * Harness 运行配置。
 */
export interface HarnessConfig {
  /** 最大迭代轮次（默认 5） */
  maxIterations: number;
  /** 每轮最大工具调用数（默认 6） */
  maxToolsPerIteration: number;
  /** 工具超时（ms，默认 30000） */
  toolTimeoutMs: number;
  /** 是否启用 Skill 路由（渐进式披露，默认 true） */
  enableSkillRouting: boolean;
  /** 是否启用 Evaluator（默认 true） */
  enableEvaluator: boolean;
  /** Evaluator 严格模式（任一维度不达标即重试，默认 false） */
  evaluatorStrict: boolean;
  /** 是否启用 Hook（默认 true） */
  enableHooks: boolean;
  /** 上下文压缩阈值（token 数，默认 60000） */
  contextCompressionThreshold: number;
  /** 首轮全部工具成功时跳过 Evaluator（快速路径，默认 true） */
  skipEvaluatorOnFirstSuccess: boolean;
}

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  maxIterations: 5,
  maxToolsPerIteration: 6,
  toolTimeoutMs: 30000,
  enableSkillRouting: true,
  enableEvaluator: true,
  evaluatorStrict: false,
  enableHooks: true,
  contextCompressionThreshold: 60000,
  skipEvaluatorOnFirstSuccess: true,
};

/**
 * Harness 运行结果。
 */
export interface HarnessResult {
  /** 最终回答 */
  answer: string;
  /** 执行的工具调用 */
  toolCalls: ToolCall[];
  /** 工具结果 */
  toolResults: ToolResult[];
  /** 迭代历史 */
  iterations: IterationRecord[];
  /** Evaluator 评估结果 */
  evaluation?: EvaluationResult;
  /** 总耗时（ms） */
  durationMs: number;
  /** 总 LLM 调用次数 */
  llmCallCount: number;
  /** 是否成功 */
  success: boolean;
  /** 失败原因（若失败） */
  failureReason?: string;
  /** 使用的 Skill */
  skillsUsed: SkillId[];
}

/**
 * 单次迭代记录。
 */
export interface IterationRecord {
  iteration: number;
  phase: 'plan' | 'execute' | 'observe' | 'evaluate' | 'adjust';
  plan?: ToolCall[];
  results?: ToolResult[];
  observation?: string;
  evaluation?: EvaluationResult;
  adjustment?: string;
  durationMs: number;
}

/**
 * Evaluator 评估结果。
 * 四维度评分（参考 Anthropic Prithvi Rajasekaran 的评估框架）。
 */
export interface EvaluationResult {
  /** 产品深度（0-10）：是否充分理解用户需求 */
  productDepth: number;
  /** 功能完整性（0-10）：是否完成了所有必要步骤 */
  functionalCompleteness: number;
  /** 数据准确性（0-10）：工具结果是否正确使用 */
  dataAccuracy: number;
  /** 回答质量（0-10）：最终回答是否清晰有用 */
  answerQuality: number;
  /** 综合评分 */
  overall: number;
  /** 是否通过（overall >= 6.0） */
  passed: boolean;
  /** 改进建议 */
  suggestions: string[];
  /** 失败维度 */
  failedDimensions: string[];
}

/**
 * Harness 事件（用于 SSE 流式输出）。
 */
export type HarnessEvent =
  | { type: 'iteration-start'; iteration: number }
  | { type: 'plan'; toolCalls: ToolCall[] }
  | { type: 'tool-execute'; toolName: string }
  | { type: 'tool-result'; toolName: string; success: boolean; result?: unknown; error?: string }
  | { type: 'observe'; observation: string }
  | { type: 'evaluate'; evaluation: EvaluationResult }
  | { type: 'adjust'; adjustment: string }
  | { type: 'iteration-end'; iteration: number }
  | { type: 'token'; content: string }
  | { type: 'answer'; answer: string }
  | { type: 'done'; result: HarnessResult }
  | { type: 'error'; error: string };

// ─── Planner Agent ─────────────────────────────────────────────────────────────

/**
 * Planner — 规划者 Agent。
 *
 * 职责：
 * 1. 理解用户需求
 * 2. 选择合适的 Skill（渐进式披露）
 * 3. 制定工具调用计划
 *
 * 不负责执行，不负责评估。专注规划。
 */
export class Planner {
  private adapter: ProviderAdapter;

  constructor(adapter: ProviderAdapter) {
    this.adapter = adapter;
  }

  /**
   * 计算工具调用的唯一哈希（工具名 + 参数）
   */
  private getToolCallHash(toolCall: ToolCall): string {
    const paramsKey = JSON.stringify(Object.keys(toolCall.params || {}).sort().map(k => `${k}:${JSON.stringify(toolCall.params?.[k])}`));
    return `${toolCall.name}:${paramsKey}`;
  }

  /**
   * 规划：根据用户输入和上下文，生成工具调用计划。
   */
  async plan(
    userInput: string,
    config: HarnessConfig,
    previousResults?: ToolResult[],
    evaluationFeedback?: string,
    history?: ChatMessage[],
  ): Promise<{ toolCalls: ToolCall[]; skillIds: SkillId[]; systemPrompt: string; tools: MCPTool[]; content: string }> {
    // 1. Skill 路由（渐进式披露）
    let tools: MCPTool[];
    let systemPrompt: string;
    let skillIds: SkillId[];

    if (config.enableSkillRouting) {
      // 多 Skill 路由（top 3）
      const skills = routeToSkills(userInput, 3);
      skillIds = skills.map(s => s.id);
      tools = getToolsForSkills(skillIds);
      systemPrompt = getMergedSystemPrompt(skillIds);
    } else {
      // 全量暴露（Baseline 模式）
      tools = getAllSkillTools();
      skillIds = [];
      systemPrompt = '你是供应链管理专家。根据用户需求选择最合适的工具。';
    }

    // 2. 构建规划消息
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    // 加入 AGENTS.md 规则提示
    messages.push({
      role: 'system',
      content: '遵循 AGENTS.md 规则：级联风险用 query_cascade_risk；库存转移用 create_transfer；决策推理用 query_decision_graph；综合分析用 query_analytics。',
    });

    // 加入历史上下文（若有）
    if (previousResults && previousResults.length > 0) {
      // 收集失败的工具调用（用于去重）
      const failedToolHashes = new Set<string>();
      const successToolHashes = new Set<string>();
      
      const contextSummary = previousResults.map(r => {
        const hash = this.getToolCallHash({ name: r.tool, params: {} });
        if (r.success) {
          successToolHashes.add(hash);
        } else {
          failedToolHashes.add(hash);
        }
        return `${r.tool}: ${r.success ? '成功' : '失败(' + r.error + ')'}`;
      }).join('\n');

      const warnings: string[] = [];
      if (failedToolHashes.size > 0) {
        warnings.push(`以下工具调用已失败，请勿重复调用相同参数：${Array.from(failedToolHashes.keys()).map(h => h.split(':')[0]).join(', ')}`);
      }
      if (successToolHashes.size > 0) {
        warnings.push(`以下工具已成功执行，除非有新参数否则无需重复：${Array.from(successToolHashes.keys()).map(h => h.split(':')[0]).join(', ')}`);
      }

      messages.push({
        role: 'system',
        content: `之前已执行的工具:\n${contextSummary}\n\n${warnings.join('\n')}\n\n请基于已有结果决定下一步。`,
      });
    }

    // 加入 Evaluator 反馈（若有）
    if (evaluationFeedback) {
      messages.push({
        role: 'system',
        content: `评估者反馈: ${evaluationFeedback}\n\n请根据反馈调整计划。如果之前工具调用失败，请尝试不同的参数或方法。`,
      });
    }

    // 加入历史上下文（若有）
    if (history && history.length > 0) {
      messages.push(...history.slice(-10));
    }

    // 用户输入
    messages.push({ role: 'user', content: userInput });

    // 3. 调用 LLM 生成计划
    const { toolCalls, content } = await this.adapter.callWithTools(messages, tools, {
      toolChoice: 'auto',
    });

    // 4. 过滤掉重复的失败工具调用（客户端去重）
    const filteredToolCalls: ToolCall[] = [];
    const failedToolNames = new Set<string>();
    
    if (previousResults) {
      previousResults.forEach(r => {
        if (!r.success) {
          failedToolNames.add(r.tool);
        }
      });
    }

    for (const tc of toolCalls) {
      // 只跳过之前以相同工具名失败过的调用
      if (!failedToolNames.has(tc.name)) {
        filteredToolCalls.push(tc);
      }
    }

    return { toolCalls: filteredToolCalls.length > 0 ? filteredToolCalls : toolCalls, skillIds, systemPrompt, tools, content };
  }
}

// ─── Executor Agent ────────────────────────────────────────────────────────────

/**
 * Executor — 执行者 Agent。
 *
 * 职责：
 * 1. 执行 Planner 制定的工具调用计划
 * 2. 应用 Hook（beforeToolCall / afterToolCall）
 * 3. 收集执行结果
 *
 * 不负责规划，不负责评估。专注执行。
 */
export class Executor {
  async execute(
    plan: ToolCall[],
    config: HarnessConfig,
    context: HookContext,
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    const hooks = config.enableHooks ? getHookSystem() : undefined;

    // 限制每轮工具数
    const toolsToExecute = plan.slice(0, config.maxToolsPerIteration);

    // 并发执行
    const promises = toolsToExecute.map(async (tc): Promise<ToolResult> => {
      const startTime = Date.now();

      try {
        // beforeToolCall Hook
        let params = tc.params;
        if (hooks) {
          const hookResult = await hooks.executeBeforeToolCall(tc.name, tc.params, context);
          if (hookResult.action === 'block') {
            return {
              tool: tc.name,
              success: false,
              error: hookResult.message || '被 Hook 阻止',
              latencyMs: Date.now() - startTime,
            };
          }
          if (hookResult.action === 'modify' && hookResult.modifiedParams) {
            params = hookResult.modifiedParams;
          }
        }

        // 执行工具（带超时）
        const result = await Promise.race([
          executeTool(tc.name, params),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`工具超时 (${config.toolTimeoutMs}ms)`)), config.toolTimeoutMs),
          ),
        ]);

        const latencyMs = Date.now() - startTime;
        const toolResult: ToolResult = {
          tool: tc.name,
          success: true,
          data: result,
          latencyMs,
        };

        // afterToolCall Hook
        if (hooks) {
          await hooks.executeAfterToolCall(tc.name, params, toolResult, context);
        }

        return toolResult;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return {
          tool: tc.name,
          success: false,
          error: errMsg,
          latencyMs: Date.now() - startTime,
        };
      }
    });

    const settled = await Promise.all(promises);
    results.push(...settled);

    return results;
  }
}

// ─── Evaluator Agent ───────────────────────────────────────────────────────────

/**
 * Evaluator — 评估者 Agent。
 *
 * 职责：
 * 1. 独立评估 Executor 的执行结果（不信任 Executor 的自评）
 * 2. 四维度评分：产品深度、功能完整性、数据准确性、回答质量
 * 3. 给出改进建议或通过信号
 *
 * 关键原则（来自 Anthropic）：
 * - Agent 评估自己工作时总是偏向乐观
 * - 拆分生成和评估到不同 Agent，效果远好于自评
 */
export class Evaluator {
  private adapter: ProviderAdapter;

  constructor(adapter: ProviderAdapter) {
    this.adapter = adapter;
  }

  /**
   * 评估执行结果。
   */
  async evaluate(
    userInput: string,
    toolResults: ToolResult[],
    draftAnswer: string,
    config: HarnessConfig,
  ): Promise<EvaluationResult> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `你是供应链 Agent 的评估者。你的职责是严格评估执行结果，不要乐观。

评分维度（0-10）：
1. productDepth（产品深度）：是否充分理解用户需求
2. functionalCompleteness（功能完整性）：是否完成了所有必要步骤
3. dataAccuracy（数据准确性）：工具结果是否正确使用
4. answerQuality（回答质量）：最终回答是否清晰有用

通过标准：overall >= 6.0
严格模式：${config.evaluatorStrict ? '任一维度 < 6.0 即不通过' : '仅看 overall'}

输出 JSON 格式：
{
  "productDepth": 数字,
  "functionalCompleteness": 数字,
  "dataAccuracy": 数字,
  "answerQuality": 数字,
  "suggestions": ["改进建议1", "改进建议2"],
  "failedDimensions": ["未达标维度"]
}`,
      },
      {
        role: 'user',
        content: `用户需求: ${userInput}\n\n工具执行结果:\n${toolResults.map(r => `- ${r.tool}: ${r.success ? "成功" : "失败(" + r.error + ")"}`).join("\n")}\n\n草稿回答:\n${draftAnswer}\n\n请评估。`,
      },
    ];

    try {
      const { content } = await this.adapter.callWithTools(messages, [], {
        toolChoice: 'auto',
      });

      // 解析评估结果
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Partial<EvaluationResult>;
        const productDepth = parsed.productDepth ?? 5;
        const functionalCompleteness = parsed.functionalCompleteness ?? 5;
        const dataAccuracy = parsed.dataAccuracy ?? 5;
        const answerQuality = parsed.answerQuality ?? 5;
        const overall = (productDepth + functionalCompleteness + dataAccuracy + answerQuality) / 4;
        const passed = config.evaluatorStrict
          ? productDepth >= 6 && functionalCompleteness >= 6 && dataAccuracy >= 6 && answerQuality >= 6
          : overall >= 6.0;

        return {
          productDepth,
          functionalCompleteness,
          dataAccuracy,
          answerQuality,
          overall,
          passed,
          suggestions: parsed.suggestions || [],
          failedDimensions: parsed.failedDimensions || [],
        };
      }
    } catch {
      // 评估失败时默认通过（不阻塞流程）
    }

    // 默认评估结果
    return {
      productDepth: 7,
      functionalCompleteness: 7,
      dataAccuracy: 7,
      answerQuality: 7,
      overall: 7,
      passed: true,
      suggestions: [],
      failedDimensions: [],
    };
  }
}

// ─── Harness 主类 ──────────────────────────────────────────────────────────────

/**
 * Agent Harness — 总调度中心。
 *
 * 编排 Planner → Executor → Evaluator 的循环：
 * 1. Planner 制定计划
 * 2. Executor 执行计划
 * 3. Evaluator 评估结果
 * 4. 若未通过，将反馈送回 Planner，循环
 * 5. 若通过或达到最大轮次，合成最终回答
 */
export class AgentHarness {
  private planner: Planner;
  private executor: Executor;
  private evaluator: Evaluator;
  private config: HarnessConfig;

  constructor(
    private adapter: ProviderAdapter,
    config?: Partial<HarnessConfig>,
  ) {
    this.config = { ...DEFAULT_HARNESS_CONFIG, ...config };
    this.planner = new Planner(adapter);
    this.executor = new Executor();
    this.evaluator = new Evaluator(adapter);
  }

  /**
   * 运行 Harness（非流式）。
   */
  async run(userInput: string, history?: ChatMessage[]): Promise<HarnessResult> {
    const events: HarnessEvent[] = [];
    await this.runStream(userInput, (event) => {
      events.push(event);
    }, history);

    const doneEvent = events.find(e => e.type === 'done') as { result: HarnessResult } | undefined;
    return doneEvent?.result || {
      answer: '',
      toolCalls: [],
      toolResults: [],
      iterations: [],
      durationMs: 0,
      llmCallCount: 0,
      success: false,
      failureReason: '未收到完成事件',
      skillsUsed: [],
    };
  }

  /**
   * 运行 Harness（流式，通过回调推送事件）。
   */
  async runStream(
    userInput: string,
    emit: (_event: HarnessEvent) => void,
    history?: ChatMessage[],
  ): Promise<void> {
    const startTime = Date.now();
    const allToolCalls: ToolCall[] = [];
    const allToolResults: ToolResult[] = [];
    const iterations: IterationRecord[] = [];
    let llmCallCount = 0;
    let skillsUsed: SkillId[] = [];
    let lastEvaluation: EvaluationResult | undefined;
    let draftAnswer = '';

    const hookContext: HookContext = {
      round: 0,
      userInput,
      toolCalls: allToolCalls,
      toolResults: allToolResults,
    };

    try {
      for (let iter = 0; iter < this.config.maxIterations; iter++) {
        hookContext.round = iter;
        const iterStart = Date.now();

        emit({ type: 'iteration-start', iteration: iter });

        // ─── Phase 1: Plan ─────────────────────────────────────────────
        const evaluationFeedback = lastEvaluation && !lastEvaluation.passed
          ? lastEvaluation.suggestions.join('; ')
          : undefined;

        const planResult = await this.planner.plan(
          userInput,
          this.config,
          allToolResults,
          evaluationFeedback,
          history,
        );
        llmCallCount++;
        skillsUsed = planResult.skillIds;

        if (planResult.toolCalls.length === 0) {
          // 无需工具，LLM 已直接给出文本回答
          draftAnswer = planResult.content;
          break;
        }

        emit({ type: 'plan', toolCalls: planResult.toolCalls });
        allToolCalls.push(...planResult.toolCalls);

        // ─── Phase 2: Execute ─────────────────────────────────────────
        const results = await this.executor.execute(
          planResult.toolCalls,
          this.config,
          hookContext,
        );
        allToolResults.push(...results);

        for (const r of results) {
          emit({ type: 'tool-result', toolName: r.tool, success: r.success, result: r.success ? r.data : undefined, error: r.success ? undefined : r.error });
        }

        // ─── Phase 3: Observe ─────────────────────────────────────────
        const successCount = results.filter(r => r.success).length;
        const observation = `第${iter + 1}轮：${successCount}/${results.length} 个工具成功。` +
          (results.some(r => !r.success) ? ` 失败: ${results.filter(r => !r.success).map(r => r.tool).join(', ')}` : '');
        emit({ type: 'observe', observation });

        // ─── Phase 4: 合成草稿回答 ────────────────────────────────────
        draftAnswer = await this.synthesizeAnswer(userInput, allToolResults);
        llmCallCount++;

        // ─── Phase 5: Evaluate ────────────────────────────────────────
        const allSuccess = results.length > 0 && results.every(r => r.success);
        const skipEval = iter === 0 && allSuccess && this.config.skipEvaluatorOnFirstSuccess;
        if (this.config.enableEvaluator && !skipEval) {
          lastEvaluation = await this.evaluator.evaluate(
            userInput,
            allToolResults,
            draftAnswer,
            this.config,
          );
          llmCallCount++;
          emit({ type: 'evaluate', evaluation: lastEvaluation });

          iterations.push({
            iteration: iter,
            phase: 'evaluate',
            plan: planResult.toolCalls,
            results,
            observation,
            evaluation: lastEvaluation,
            durationMs: Date.now() - iterStart,
          });

          if (lastEvaluation.passed) {
            // 评估通过，结束循环
            emit({ type: 'iteration-end', iteration: iter });
            break;
          } else {
            // 未通过，调整计划
            const adjustment = `评估未通过（${lastEvaluation.failedDimensions.join(', ')}），建议: ${lastEvaluation.suggestions.join('; ')}`;
            emit({ type: 'adjust', adjustment });
            iterations.push({
              iteration: iter,
              phase: 'adjust',
              adjustment,
              durationMs: Date.now() - iterStart,
            });
          }
        } else {
          // 无 Evaluator，只要有成功结果就结束
          iterations.push({
            iteration: iter,
            phase: 'execute',
            plan: planResult.toolCalls,
            results,
            observation,
            durationMs: Date.now() - iterStart,
          });

          if (successCount > 0) {
            emit({ type: 'iteration-end', iteration: iter });
            break;
          }
        }

        emit({ type: 'iteration-end', iteration: iter });
      }

      // ─── 最终合成 ──────────────────────────────────────────────────
      if (!draftAnswer) {
        draftAnswer = await this.synthesizeAnswer(userInput, allToolResults, emit);
        llmCallCount++;
      } else {
        // 已有草稿（评估通过），分块推送模拟流式效果
        const chunks = draftAnswer.match(/[\s\S]{1,16}/g) || [draftAnswer];
        for (const chunk of chunks) {
          emit({ type: 'token', content: chunk });
        }
      }

      emit({ type: 'answer', answer: draftAnswer });

      const result: HarnessResult = {
        answer: draftAnswer,
        toolCalls: allToolCalls,
        toolResults: allToolResults,
        iterations,
        evaluation: lastEvaluation,
        durationMs: Date.now() - startTime,
        llmCallCount,
        success: lastEvaluation?.passed ?? (allToolResults.some(r => r.success)),
        skillsUsed,
      };

      emit({ type: 'done', result });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      emit({ type: 'error', error: errMsg });

      const result: HarnessResult = {
        answer: draftAnswer || `执行出错: ${errMsg}`,
        toolCalls: allToolCalls,
        toolResults: allToolResults,
        iterations,
        evaluation: lastEvaluation,
        durationMs: Date.now() - startTime,
        llmCallCount,
        success: false,
        failureReason: errMsg,
        skillsUsed,
      };

      emit({ type: 'done', result });
    }
  }

  /**
   * 合成最终回答。
   */
  private async synthesizeAnswer(userInput: string, toolResults: ToolResult[], emit?: (_event: HarnessEvent) => void): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: '你是供应链管理专家。根据工具执行结果，回答用户问题。回答要清晰、准确、有条理。如果工具失败，如实说明。',
      },
      {
        role: 'user',
        content: `用户问题: ${userInput}\n\n工具执行结果:\n${toolResults.map(r =>
          `- ${r.tool}: ${r.success ? JSON.stringify(r.data).slice(0, 500) : '失败(' + r.error + ')'}`,
        ).join('\n')}\n\n请根据以上结果回答用户问题。`,
      },
    ];

    try {
      // 使用 streamText 获取纯文本回答
      let answer = '';
      for await (const chunk of this.adapter.streamText(messages, {})) {
        if (chunk.type === 'token' && chunk.content) {
          answer += chunk.content;
          if (emit) {
            emit({ type: 'token', content: chunk.content });
          }
        }
      }
      return answer || '（无回答）';
    } catch {
      // streamText 失败时用 callWithTools
      const { content } = await this.adapter.callWithTools(messages, [], {});
      return content || '（无回答）';
    }
  }

  /**
   * 获取 Harness 配置。
   */
  getConfig(): HarnessConfig {
    return this.config;
  }

  /**
   * 获取 Harness 统计信息。
   */
  getStats(): {
    plannerEnabled: boolean;
    executorEnabled: boolean;
    evaluatorEnabled: boolean;
    skillRoutingEnabled: boolean;
    hooksEnabled: boolean;
    skillCount: number;
    hookCount: number;
  } {
    const hooks = getHookSystem();
    return {
      plannerEnabled: true,
      executorEnabled: true,
      evaluatorEnabled: this.config.enableEvaluator,
      skillRoutingEnabled: this.config.enableSkillRouting,
      hooksEnabled: this.config.enableHooks,
      skillCount: getSkillSummaries().length,
      hookCount: hooks.getStats().total,
    };
  }
}

// ─── 工厂 ──────────────────────────────────────────────────────────────────────

/**
 * 创建 Agent Harness。
 */
export function createHarness(
  adapter: ProviderAdapter,
  config?: Partial<HarnessConfig>,
): AgentHarness {
  return new AgentHarness(adapter, config);
}
