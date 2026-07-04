/**
 * Agent Engine v2 — 6-state FSM core.
 *
 * States: classify → plan → execute → observe → decide → synthesize
 * Model-agnostic. Provider-specific behavior is in the adapter layer.
 */

import type { ProviderAdapter } from './adapter';
import type { FSMContext, FSMState, FSMConfig, AgentEvent, ToolCall, ToolResult, Observation } from './fsm-types';
import { DEFAULT_FSM_CONFIG, TOOL_DISPLAY_NAMES } from './fsm-types';
import { classifyIntent } from './router';
import { filterToolsByIntent } from './tool-filter';
import {
  optimizeTools,
  buildOptimizedSystemPrompt,
  isPromptOptimizationEnabled,
} from './prompt-optimizer';
import { getToolSchemas } from '@/lib/mcp/tools';
import { executeWithPolicy } from '@/lib/engine/autonomy-policy';
import { createPassport, provenanceEntry } from '@/lib/engine/passport';
import type { DecisionPassport } from '@/lib/engine/passport';
import { buildRagContext } from '@/lib/knowledge/rag-pipeline';
import { buildGraphContext, formatGraphContext } from '@/lib/engine/graph-rag';
import { webSearchWithQuality, formatSearchContext } from '@/lib/services/web-search.service';
import { SYSTEM_PROMPT } from '@/lib/agent/prompts/system-prompt';
import type { ChatMessage } from '@/lib/services/ai-providers.service';
import {
  startOrchestrationSpan,
  startToolSpan,
  endSpan,
  endSpanWithError,
  withSpan,
  getCurrentTraceId,
} from '@/lib/audit/otel-tracing';

// ─── RAG Toggle ───────────────────────────────────────────────────────────

/**
 * Whether the 'retrieve' FSM state is active.
 * Gated by ENABLE_RAG env var (default: false for backward compatibility).
 * When enabled, FSM flow: START → retrieve → classify → plan → ...
 * When disabled, FSM flow: START → classify → plan → ... (legacy behavior)
 */
export function isRagEnabled(): boolean {
  return process.env.ENABLE_RAG === 'true' || process.env.ENABLE_RAG === '1';
}

// ─── Context Factory ─────────────────────────────────────────────────────

export function createFSMContext(input: {
  query: string;
  history: ChatMessage[];
  config?: Partial<FSMConfig>;
  startTimeMs: number;
}): FSMContext {
  return {
    query: input.query,
    history: input.history,
    config: { ...DEFAULT_FSM_CONFIG, ...input.config },
    round: 0,
    toolResults: [],
    observations: [],
    toolsUsed: [],
    startTimeMs: input.startTimeMs,
  };
}

// ─── Transition Table ────────────────────────────────────────────────────

export function getNextState(current: FSMState, ctx: FSMContext): FSMState | null {
  switch (current) {
    case 'retrieve':
      // retrieve → classify (always, after RAG context is built)
      return 'classify';

    case 'classify':
      return 'plan';

    case 'plan':
      if (ctx.round >= ctx.config.maxRounds) return 'synthesize';
      if (ctx.routing && !ctx.routing.shouldUseTools) return 'synthesize';
      if (ctx.plan !== undefined && ctx.plan.length === 0) return 'synthesize';
      return 'execute';

    case 'execute':
      return 'observe';

    case 'observe':
      return 'decide';

    case 'decide':
      if (ctx.round >= ctx.config.maxRounds) return 'synthesize';
      // Got data? Done. No successful results? Try again with different tools.
      if (ctx.toolResults.some(r => r.success)) return 'synthesize';
      return 'plan';

    case 'synthesize':
      return null;

    default:
      return null;
  }
}

// ─── State Handlers ──────────────────────────────────────────────────────

/**
 * Retrieve state — 检索相关知识 (RAG pipeline).
 * 仅在 ENABLE_RAG=true 时激活. 调用 buildRagContext 获取相关知识,
 * 将检索到的知识注入到 ctx.ragContext, 后续状态 (plan/synthesize) 可使用.
 *
 * Best-effort: 检索失败不阻塞主流程.
 */
async function* handleRetrieve(
  ctx: FSMContext,
  _adapter: ProviderAdapter,
): AsyncGenerator<AgentEvent> {
  yield { type: 'thinking', content: 'retrieving' };

  try {
    const { buildRagContext } = await import('@/lib/knowledge/rag-pipeline');
    const { getEffectiveTenantId } = await import('@/lib/tenant/context');
    const ragCtx = await buildRagContext(ctx.query, undefined, {
      tenantId: getEffectiveTenantId(),
    });

    if (ragCtx.context && ragCtx.context.trim().length > 0) {
      ctx.ragContext = ragCtx.context;
      ctx.dynamicContext = (ctx.dynamicContext || '') + '\n\n' + ragCtx.context;
      yield {
        type: 'thinking',
        content: `retrieved ${ragCtx.results.length} chunks (${ragCtx.totalTokens} tokens)`,
      };
    } else {
      yield { type: 'thinking', content: 'no relevant knowledge found' };
    }
  } catch (err) {
    // RAG 检索是 best-effort, 失败不阻塞主流程
    console.warn('[Retrieve] RAG context build failed:', (err as Error).message);
    yield { type: 'thinking', content: 'rag skipped (error)' };
  }
}

async function* handleClassify(
  ctx: FSMContext,
  adapter: ProviderAdapter,
): AsyncGenerator<AgentEvent> {
  yield { type: 'thinking', content: 'classifying' };
  const routing = await classifyIntent(ctx.query, adapter);
  ctx.routing = routing;
  yield {
    type: 'thinking',
    content: `Intent: ${routing.intent} (confidence: ${(routing.confidence * 100).toFixed(0)}%) — ${routing.reason}`,
  };
}

async function* handlePlan(
  ctx: FSMContext,
  adapter: ProviderAdapter,
): AsyncGenerator<AgentEvent> {
  yield { type: 'thinking', content: 'planning' };
  ctx.round++;

  const routing = ctx.routing!;

  // Knowledge injection: graph RAG enriches all paths (tools + no-tools)
  let graphContextBlock = '';
  try {
    const graphCtx = await buildGraphContext(ctx.query);
    graphContextBlock = formatGraphContext(graphCtx);
    ctx.dynamicContext = (ctx.dynamicContext || '') + graphContextBlock;
  } catch { /* graph RAG is best-effort */ }

  // Agent Skills: load matching SOPs (progressive disclosure)
  try {
    const { getSkillContext } = await import('./skill-loader');
    const skillContext = getSkillContext(ctx.query);
    if (skillContext) {
      ctx.dynamicContext = (ctx.dynamicContext || '') + skillContext;
    }
  } catch { /* skills are best-effort */ }

  if (!routing.shouldUseTools) {
    try {
      const ragCtx = await buildRagContext(ctx.query, routing.intent);
      if (ragCtx.context) {
        ctx.dynamicContext = (ctx.dynamicContext || '') + '\n' + ragCtx.context;
      }
    } catch { /* RAG is best-effort */ }

    if (routing.shouldSearch) {
      try {
        yield { type: 'thinking', content: 'searching' };
        const searchResult = await webSearchWithQuality(ctx.query, []);
        if (searchResult.results.length > 0) {
          ctx.dynamicContext = (ctx.dynamicContext || '') + '\n\n' + formatSearchContext(searchResult.results);
        }
      } catch { /* search is best-effort */ }
    }
    return;
  }

  const allTools = getToolSchemas();
  const toolSchemas = filterToolsByIntent(allTools, routing.intent);

  // Log reduction for observability
  if (toolSchemas.length < allTools.length) {
    console.log(
      `[Plan] Progressive loading: ${toolSchemas.length}/${allTools.length} tools ` +
      `(${Math.round((1 - toolSchemas.length / allTools.length) * 100)}% reduction) ` +
      `for intent: ${routing.intent}`,
    );
  }

  // Prompt optimization: augment tool descriptions and schemas for DeepSeek reliability.
  // Controlled by ENABLE_PROMPT_OPTIMIZATION env var (default: enabled).
  // Best-effort: if optimization fails, fall back to original tool schemas.
  let optimizedToolSchemas = toolSchemas;
  let optimizationGuidance = '';
  if (isPromptOptimizationEnabled()) {
    try {
      optimizedToolSchemas = optimizeTools(toolSchemas);
      optimizationGuidance = buildOptimizedSystemPrompt(toolSchemas, routing.intent);
    } catch (err) {
      console.warn('[Plan] Prompt optimization failed, using original schemas:', (err as Error).message);
      optimizedToolSchemas = toolSchemas;
    }
  }

  const toolDescriptions = optimizedToolSchemas.map(t => `- **${t.name}**: ${t.description}`).join('\n');

  // Round 1: force tool calls. Round 2+: let LLM decide if more data is needed.
  const isFirstRound = ctx.round === 1;
  const planMessages: ChatMessage[] = [
    {
      role: 'system',
      content: isFirstRound
        ? `You are a tool-calling function. Your ONLY job is to output function calls.

## Supply Chain Context
${graphContextBlock}

## Agent SOPs (Standard Operating Procedures)
${ctx.dynamicContext || '(none)'}

Available functions:
${toolDescriptions}

${optimizationGuidance}

CRITICAL RULES:
1. You MUST call at least one function. Not calling any function is a FAILURE.
2. Use the Supply Chain Context above to choose the most relevant functions.
3. Call all independent functions in parallel.
4. Maximum ${ctx.config.maxToolsPerRound} function calls.
5. Output ONLY function calls. No explanations, no greetings, no markdown.`
        : `Available functions:
${toolDescriptions}

${optimizationGuidance}

You have already executed some functions. Decide if you need MORE data:
- If existing data is sufficient to answer the user's question → output NO text, call NO functions
- If you still need more data → call the specific functions needed
Maximum ${ctx.config.maxToolsPerRound} function calls.`,
    },
    {
      role: 'user',
      content: `Task: ${ctx.query}\nIntent: ${routing.intent}\n\n## Supply Chain Knowledge Graph\n${graphContextBlock}\n\n${isFirstRound ? 'Call the right functions to answer this query.' : 'Do you need more data? If not, respond with nothing.'}`,
    },
  ];

  // Call adapter to get tool execution plan
  let toolCalls: ToolCall[] = [];
  try {
    const result = await adapter.callWithTools(
      planMessages,
      optimizedToolSchemas as import('@/lib/mcp/tools').MCPTool[],
      { toolChoice: isFirstRound ? 'required' : 'auto' },
    );
    toolCalls = result.toolCalls;
  } catch (err) {
    console.error('[Plan] callWithTools error:', (err as Error).message);
  }

  if (toolCalls.length > ctx.config.maxToolsPerRound) {
    toolCalls = toolCalls.slice(0, ctx.config.maxToolsPerRound);
  }

  for (const tc of toolCalls) {
    yield { type: 'tool_call', tool: tc.name, params: tc.params };
  }

  ctx.plan = toolCalls;
}

async function* handleExecute(
  ctx: FSMContext,
  _adapter: ProviderAdapter,
): AsyncGenerator<AgentEvent> {
  yield { type: 'thinking', content: 'executing' };

  const toolCalls = ctx.plan || [];
  if (toolCalls.length === 0) return;

  ctx.toolsUsed.push(...toolCalls.map(tc => tc.name));

  // Create promises (they run concurrently), await all, then yield results
  const pendingResults: Promise<ToolResult>[] = toolCalls.map(async (tc): Promise<ToolResult> => {
    const startMs = Date.now();
    // OTel: create a tool span for each tool execution
    const toolSpan = startToolSpan({ toolName: tc.name });
    try {
      const policyResult = await executeWithPolicy(tc.name, tc.params);
      if (!policyResult.executed) {
        endSpanWithError(toolSpan, policyResult.error || 'Tool rejected by policy');
        return { tool: tc.name, success: false, error: policyResult.error || 'Tool rejected by policy', latencyMs: Date.now() - startMs };
      }
      endSpan(toolSpan);
      return { tool: tc.name, success: true, data: policyResult.result, latencyMs: Date.now() - startMs };
    } catch (err) {
      endSpanWithError(toolSpan, err);
      return { tool: tc.name, success: false, error: (err as Error).message, latencyMs: Date.now() - startMs };
    }
  });

  const results = await Promise.all(pendingResults);

  // Emit results after all collected
  for (const result of results) {
    if (result.success) {
      yield {
        type: 'tool_result',
        tool: result.tool,
        result: typeof result.data === 'string'
          ? result.data.slice(0, 300)
          : JSON.stringify(result.data).slice(0, 300),
      };
    } else {
      yield { type: 'tool_result', tool: result.tool, error: result.error };
    }
  }

  ctx.toolResults.push(...results);
}

async function* handleObserve(
  ctx: FSMContext,
  _adapter: ProviderAdapter,
): AsyncGenerator<AgentEvent> {
  yield { type: 'thinking', content: 'observing' };

  const validResults = ctx.toolResults.filter(r => r.success);

  const overallConfidence = ctx.toolResults.length > 0
    ? validResults.length / ctx.toolResults.length
    : 0.5;

  const missingData = ctx.toolResults
    .filter(r => !r.success)
    .map(r => r.tool);

  ctx.observations.push({
    validResults,
    conflicts: [],
    overallConfidence,
    missingData,
  });
}

async function* handleDecide(
  ctx: FSMContext,
  adapter: ProviderAdapter,
): AsyncGenerator<AgentEvent> {
  yield { type: 'thinking', content: 'deciding' };
  // Decision logic: if no tools were called or confidence is high, the transition
  // table will route to synthesize. Otherwise re-plan for another round.
  // The actual re-plan/synthesize decision is in getNextState.
}

async function* handleSynthesize(
  ctx: FSMContext,
  adapter: ProviderAdapter,
): AsyncGenerator<AgentEvent> {
  yield { type: 'thinking', content: 'synthesizing' };

  const toolResultsContext = ctx.toolResults
    .filter(r => r.success)
    .map(r => `[${r.tool}] ${typeof r.data === 'string' ? r.data : JSON.stringify(r.data)}`)
    .join('\n\n');

  const synthesisMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}

## 当前任务
用户查询: ${ctx.query}
意图: ${ctx.routing?.intent || 'unknown'}

## 工具调用结果
${toolResultsContext || '（未调用工具）'}

${ctx.dynamicContext || ''}

## 输出要求
1. 每个数字带 [来源标签][置信度标签]
2. 先给结论再给支撑
3. 用中文功能描述替代内部函数名
4. 使用 [claim-N] 格式标注数据来源`,
    },
    ...ctx.history.slice(-6),
    { role: 'user', content: ctx.query },
  ];

  let fullResponse = '';

  for await (const chunk of adapter.streamText(synthesisMessages, {
    maxTokens: 4000,
    temperature: 0.7,
  })) {
    if (chunk.type === 'token' && chunk.content) {
      fullResponse += chunk.content;
      yield { type: 'token', content: chunk.content };
    }
    if (chunk.type === 'error') {
      yield { type: 'error', message: chunk.error || 'Synthesis error' };
      return;
    }
  }

  ctx.finalResponse = fullResponse;

  const claimsExtracted = (fullResponse.match(/\[claim-\d+\]/g) || []).length;
  const passport = createPassport({
    engine: 'fsm-agent-v2' as 'cascade-risk' | 'decision-graph' | 'tariff' | 'workflow' | 'cost',
    input: { query: ctx.query },
    confidence: ctx.observations.length > 0
      ? ctx.observations[ctx.observations.length - 1].overallConfidence
      : 0.75,
    alternatives: [],
    provenance: ctx.toolsUsed.map(t => provenanceEntry(`mcp:${t}`, 0, 'ok')),
    trace: {
      totalDurationMs: Date.now() - ctx.startTimeMs,
      steps: [{ name: 'fsm-v2', durationMs: Date.now() - ctx.startTimeMs, status: 'ok' as const }],
    },
  });

  // Persist trace for audit
  let traceId: string | null = null;
  try {
    const { writeTrace } = await import('@/lib/audit/trace-writer');
    traceId = await writeTrace(ctx, fullResponse, passport as DecisionPassport);
  } catch { /* trace persistence is best-effort, never blocks response */ }

  yield {
    type: 'done',
    toolsUsed: ctx.toolsUsed,
    steps: ctx.round,
    durationMs: Date.now() - ctx.startTimeMs,
    mode: 'fsm-v2',
    tier: ctx.routing?.shouldUseTools ? 1 : ctx.routing?.shouldSearch ? 3 : 0,
    passport: {
      auditId: passport.auditId,
      generatedAt: passport.generatedAt,
      confidence: passport.confidence,
      dataProvenance: passport.dataProvenance.map(p => ({ source: p.source, status: p.status })),
      alternatives: passport.alternatives.slice(0, 3),
      warnings: passport.warnings,
    },
    claimsExtracted,
    traceId,
  };
}

// ─── Main FSM Runner ─────────────────────────────────────────────────────

export async function* runAgent(
  ctx: FSMContext,
  adapter: ProviderAdapter,
): AsyncGenerator<AgentEvent> {
  // Start state: 'retrieve' if RAG enabled, otherwise 'classify' (legacy)
  let currentState: FSMState | null = isRagEnabled() ? 'retrieve' : 'classify';

  while (currentState) {
    // OTel: create an orchestration span for each FSM state transition
    const span = startOrchestrationSpan({
      intent: ctx.routing?.intent || 'unknown',
      fsmState: currentState,
      confidence: ctx.routing?.confidence,
      tier: ctx.routing ? (ctx.routing.shouldUseTools ? 1 : ctx.routing.shouldSearch ? 3 : 0) : undefined,
    });

    // Decision tracer: record state transition
    if (ctx.tracer) {
      const decision = currentState === 'retrieve'
        ? `Retrieving knowledge for: ${ctx.query.slice(0, 50)}`
        : currentState === 'classify'
          ? `Classifying: ${ctx.query.slice(0, 50)}`
          : currentState === 'plan'
            ? `Planning round ${ctx.round + 1}`
            : currentState === 'execute'
              ? `Executing ${ctx.plan?.length ?? 0} tool(s)`
              : currentState === 'observe'
                ? `Observing results`
                : currentState === 'decide'
                  ? `Deciding next action`
                  : `Synthesizing final response`;

      const reasoning = ctx.routing
        ? `Intent: ${ctx.routing.intent}, Confidence: ${(ctx.routing.confidence * 100).toFixed(0)}%`
        : currentState === 'retrieve'
          ? 'RAG retrieval (ENABLE_RAG=true)'
          : 'Initial state';

      ctx.tracer.addDecisionNode(
        currentState,
        ctx.round,
        decision,
        reasoning,
        ctx.toolsUsed.map(t => `tool:${t}`),
        [],
        ctx.routing?.confidence,
      );
    }

    try {
      switch (currentState) {
        case 'retrieve': yield* handleRetrieve(ctx, adapter); break;
        case 'classify': yield* handleClassify(ctx, adapter); break;
        case 'plan': yield* handlePlan(ctx, adapter); break;
        case 'execute': yield* handleExecute(ctx, adapter); break;
        case 'observe': yield* handleObserve(ctx, adapter); break;
        case 'decide': yield* handleDecide(ctx, adapter); break;
        case 'synthesize': yield* handleSynthesize(ctx, adapter); break;
        default:
          yield { type: 'error', message: `Unknown state: ${currentState}` };
          endSpanWithError(span, `Unknown state: ${currentState}`);
          return;
      }
      endSpan(span);
    } catch (err) {
      endSpanWithError(span, err);
      throw err;
    }

    currentState = getNextState(currentState, ctx);
  }
}
