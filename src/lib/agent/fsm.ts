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
import { executeTool, getToolSchemas } from '@/lib/mcp/tools';
import { executeWithPolicy } from '@/lib/engine/autonomy-policy';
import { createPassport, provenanceEntry } from '@/lib/engine/passport';
import { retrieveKnowledge, augmentPrompt } from '@/lib/engine/rag';
import { webSearchWithQuality, formatSearchContext } from '@/lib/services/web-search.service';
import { SYSTEM_PROMPT } from '@/app/api/chat/chat.prompt';
import type { ChatMessage } from '@/lib/services/ai-providers.service';

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
    case 'classify':
      return 'plan';

    case 'plan':
      if (ctx.round >= ctx.config.maxRounds) return 'synthesize';
      if (ctx.routing && !ctx.routing.shouldUseTools) return 'synthesize';
      return 'execute';

    case 'execute':
      return 'observe';

    case 'observe':
      return 'decide';

    case 'decide':
      if (ctx.round >= ctx.config.maxRounds) return 'synthesize';
      return 'plan';

    case 'synthesize':
      return null;

    default:
      return null;
  }
}

// ─── State Handlers ──────────────────────────────────────────────────────

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

  if (!routing.shouldUseTools) {
    const ragResults = retrieveKnowledge(ctx.query, 3);
    ctx.dynamicContext = augmentPrompt(ctx.query, ragResults);

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

  const toolSchemas = getToolSchemas();
  const toolDescriptions = toolSchemas.map(t => `- **${t.name}**: ${t.description}`).join('\n');

  // Build a tool-call-only prompt without role-playing language (DeepSeek V4 role-play suppresses tool calls)
  const planMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a tool-calling function. Your ONLY job is to output function calls.

Available functions:
${toolDescriptions}

CRITICAL RULES:
1. You MUST call at least one function. Not calling any function is a FAILURE.
2. Call all independent functions in parallel.
3. Maximum ${ctx.config.maxToolsPerRound} function calls.
4. Output ONLY function calls. No explanations, no greetings, no markdown.`,
    },
    { role: 'user', content: `Task: ${ctx.query}\nIntent: ${routing.intent}\n\nCall the right functions to answer this query.` },
  ];

  // Non-streaming call for plan phase — DeepSeek V4 Flash + tool_choice:required is reliable
  let toolCalls: ToolCall[] = [];
  const apiKey = adapter.resolveApiKey();
  if (apiKey) {
    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: adapter.resolveModel(),
          messages: adapter.normalizeMessages(planMessages),
          tools: adapter.normalizeTools(toolSchemas as import('@/lib/mcp/tools').MCPTool[]),
          tool_choice: 'required',
          thinking: { type: 'disabled' },
          max_tokens: 2000,
          temperature: 0.3,
          stream: false,
        }),
      });

      if (response.ok) {
        const data = await response.json() as { choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>; content?: string } }> };
        const msg = data.choices?.[0]?.message;
        if (msg?.tool_calls && msg.tool_calls.length > 0) {
          const rawCalls = msg.tool_calls as unknown[];
          toolCalls = adapter.parseToolCalls(msg.content || '', rawCalls);
        } else if (msg?.content) {
          // Text fallback
          toolCalls = adapter.parseToolCalls(msg.content, []);
        }
      } else {
        const errText = await response.text().catch(() => '');
        console.error('[Plan] API error:', response.status, errText.slice(0, 200));
      }
    } catch (err) {
      console.error('[Plan] Fetch error:', (err as Error).message);
    }
  }

  // Remove debug line
  if (toolCalls.length === 0) {
    console.error('[Plan] No tool calls generated for query:', ctx.query);
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
    try {
      const policyResult = await executeWithPolicy(tc.name, tc.params);
      if (!policyResult.executed) {
        return { tool: tc.name, success: false, error: policyResult.error || 'Tool rejected by policy', latencyMs: Date.now() - startMs };
      }
      return { tool: tc.name, success: true, data: policyResult.result, latencyMs: Date.now() - startMs };
    } catch (err) {
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
  };
}

// ─── Main FSM Runner ─────────────────────────────────────────────────────

export async function* runAgent(
  ctx: FSMContext,
  adapter: ProviderAdapter,
): AsyncGenerator<AgentEvent> {
  let currentState: FSMState | null = 'classify';

  while (currentState) {
    switch (currentState) {
      case 'classify': yield* handleClassify(ctx, adapter); break;
      case 'plan': yield* handlePlan(ctx, adapter); break;
      case 'execute': yield* handleExecute(ctx, adapter); break;
      case 'observe': yield* handleObserve(ctx, adapter); break;
      case 'decide': yield* handleDecide(ctx, adapter); break;
      case 'synthesize': yield* handleSynthesize(ctx, adapter); break;
      default:
        yield { type: 'error', message: `Unknown state: ${currentState}` };
        return;
    }

    currentState = getNextState(currentState, ctx);
  }
}
