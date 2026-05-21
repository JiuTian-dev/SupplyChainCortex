# Agent Engine v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hand-written ReAct loop + keyword router with 6-state FSM + LLM-based semantic routing + Provider Adapter layer.

**Architecture:** Three new files form the agent core (`src/lib/agent/fsm.ts`, `router.ts`, `adapter.ts`), three provider adapters (`adapters/`), one rewritten route (`chat/route.ts`). Delete `react-agent.ts` and `information-router.ts`. MCP tools, frontend, SSE protocol untouched.

**Tech Stack:** TypeScript 5, `@ai-sdk/deepseek` 2.x for API communication, Vitest for testing

---

## File Structure

```
src/lib/agent/
├── fsm-types.ts          # FSM state, context, config, event types
├── fsm.ts                # State machine engine (generator function)
├── router.ts             # LLM-based intent classification
├── adapter.ts            # ProviderAdapter interface + factory
├── adapters/
│   ├── deepseek.adapter.ts   # DeepSeek V4 Pro (strict mode + text fallback)
│   ├── openai.adapter.ts     # OpenAI (native function calling)
│   └── anthropic.adapter.ts  # Anthropic (native tool use)
└── fsm.test.ts           # FSM tests
    adapter.test.ts        # Adapter tests
    router.test.ts         # Router tests

src/app/api/chat/
└── route.ts              # Rewritten — thin HTTP wrapper over FSM

Deleted:
├── src/lib/engine/react-agent.ts
└── src/lib/services/information-router.ts
```

---

### Task 1: FSM Types & Config

**Files:**
- Create: `src/lib/agent/fsm-types.ts`

- [ ] **Step 1: Write the types file**

```typescript
/**
 * Agent Engine v2 — FSM types.
 * Model-agnostic state machine definitions for the 6-state Agent loop.
 */

import type { ChatMessage } from '@/lib/services/ai-providers.service';
import type { MCPTool } from '@/lib/mcp/tools';

// ─── FSM States ──────────────────────────────────────────────────────────

export type FSMState =
  | 'classify'
  | 'plan'
  | 'execute'
  | 'observe'
  | 'decide'
  | 'synthesize';

export const FSM_STATES: readonly FSMState[] = [
  'classify', 'plan', 'execute', 'observe', 'decide', 'synthesize',
] as const;

// ─── Tool Call / Result ──────────────────────────────────────────────────

export interface ToolCall {
  name: string;
  params: Record<string, unknown>;
  /** Human-readable display name for the UI */
  displayName?: string;
}

export interface ToolResult {
  tool: string;
  success: boolean;
  data?: unknown;
  error?: string;
  /** Execution latency in ms */
  latencyMs: number;
}

export interface Observation {
  validResults: ToolResult[];
  conflicts: Array<{ tool: string; description: string }>;
  overallConfidence: number;
  missingData: string[];
}

// ─── Router Types ────────────────────────────────────────────────────────

export type Intent =
  | 'supply_chain_data'
  | 'supply_chain_knowledge'
  | 'news_event'
  | 'general_knowledge'
  | 'opinion_recommendation'
  | 'chat_greeting';

export interface RoutingDecision {
  intent: Intent;
  confidence: number;
  shouldUseTools: boolean;
  shouldSearch: boolean;
  reason: string;
  /** Max tool-calling rounds for this intent */
  maxRoundsOverride?: number;
}

// ─── FSM Config ──────────────────────────────────────────────────────────

export interface FSMConfig {
  maxRounds: number;
  maxToolsPerRound: number;
  totalToolCallLimit: number;
  toolTimeoutMs: number;
  confidenceThreshold: number;
  maxContextTokens: number;
}

export const DEFAULT_FSM_CONFIG: FSMConfig = {
  maxRounds: 3,
  maxToolsPerRound: 6,
  totalToolCallLimit: 18,
  toolTimeoutMs: 30000,
  confidenceThreshold: 0.7,
  maxContextTokens: 64000,
};

// ─── FSM Context (accumulated state) ─────────────────────────────────────

export interface FSMContext {
  query: string;
  history: ChatMessage[];
  config: FSMConfig;

  // Routing
  routing?: RoutingDecision;

  // Tool execution
  round: number;
  toolResults: ToolResult[];
  observations: Observation[];

  // Output
  finalResponse?: string;
  toolsUsed: string[];

  // Timing
  startTimeMs: number;

  // Extended context (injected by route handler)
  dynamicContext?: string;
  tieredSystemPrompt?: string;
}

// ─── SSE Events (compatible with existing ChatPanel) ─────────────────────

export type AgentEvent =
  | { type: 'thinking'; content: string }
  | { type: 'tool_call'; tool: string; params: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; result?: string; error?: string }
  | { type: 'token'; content: string }
  | { type: 'confirm_required'; confirmationCard: Record<string, unknown> }
  | { type: 'done'; toolsUsed: string[]; steps: number; durationMs: number; mode: string; tier?: number; passport?: Record<string, unknown>; claimsExtracted?: number }
  | { type: 'error'; message: string };

// ─── Tool Display Names ──────────────────────────────────────────────────

export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  query_inventory: '库存查询',
  query_cost: '成本查询',
  query_sales: '销售查询',
  query_logistics: '物流查询',
  query_suppliers: '供应商查询',
  query_dashboard: '仪表盘概览',
  query_risk: '风险评估',
  query_exchange_rates: '汇率查询',
  query_weather: '港口天气',
  query_tariff: '关税查询',
  query_cascade_risk: '级联风险分析',
  query_decision_graph: '决策图查询',
  query_analytics: '数据分析',
  query_commodities: '大宗商品价格',
  query_scfis: 'SCFIS运价',
  query_carbon_price: '碳价查询',
  query_cpsc_recalls: '召回查询',
  query_port_congestion: '港口拥堵',
  query_financial_index: '金融指数',
  query_amazon_competitors: '竞品分析',
  query_brand_sentiment: '品牌舆情',
  query_compliance_check: '合规审查',
  query_financial_sim: '财务模拟器',
  query_product_feed: '商品Feed',
  query_arbitrage: '套利引擎',
  query_coherence_audit: '一致性审计',
  query_recall_risk: '召回风险预警',
  query_supplier_discovery: '供应商发现',
  execute_workflow: '工作流执行',
  run_sandbox: '供应链仿真',
  web_search: '联网搜索',
  create_reorder: '创建补货单',
  adjust_inventory: '调整库存',
  create_note: '创建备注',
  update_shipment_status: '更新货运状态',
  resolve_alert: '解除预警',
  calculate_eoq: '经济订货批量EOQ',
  calculate_safety_stock: '安全库存计算',
  calculate_reorder_point: '再订货点ROP',
  classify_abc_xyz: 'ABC-XYZ分类',
  forecast_demand: '需求预测',
  calculate_seasonal_decompose: '季节分解',
  monte_carlo_inventory: '蒙特卡洛仿真',
  calculate_wagner_whitin: '动态批量优化',
  calculate_newsvendor: '报童模型',
  calculate_drp: '分销需求计划',
  calculate_warehouse_location: '仓库选址',
  calculate_transport_route: '运输路径优化',
  calculate_multi_echelon_ss: '多级安全库存',
  calculate_inventory_kpi: '库存KPI',
  calculate_fill_rate: '填充率',
  calculate_lead_time_analysis: '提前期分析',
  calculate_purchase_variance: '采购价差分析',
  calculate_total_cost: '总供应链成本',
  calculate_supplier_scoring: '供应商综合评分',
  calculate_learning_curve: '学习曲线',
  calculate_break_even: '盈亏平衡',
  calculate_optimal_pricing: '最优定价',
  calculate_joint_replenishment: '联合补货',
  calculate_forecast_accuracy: '预测准确度',
  generate_chart: '图表生成',
  analyze_and_chart: '自动分析出图',
  generate_report: '报告生成',
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/lib/agent/fsm-types.ts`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/fsm-types.ts
git commit -m "feat(agent): add FSM types and config definitions"
```

---

### Task 2: Provider Adapter Interface

**Files:**
- Create: `src/lib/agent/adapter.ts`

- [ ] **Step 1: Write the adapter interface and factory**

```typescript
/**
 * Provider Adapter — model-agnostic I/O normalization layer.
 *
 * Each adapter handles:
 * - Message format conversion (internal ChatMessage ↔ provider-specific)
 * - Tool schema normalization (MCP tools → provider tool definitions)
 * - Streaming completion (with and without tools)
 * - Lightweight classification (for semantic routing)
 * - Tool call parsing (including text-fallback for DeepSeek leakage)
 */

import type { ChatMessage } from '@/lib/services/ai-providers.service';
import type { MCPTool, MCPToolParameter } from '@/lib/mcp/tools';
import type { ToolCall, Intent } from './fsm-types';

// ─── Stream Chunk Types ──────────────────────────────────────────────────

export interface TokenChunk {
  type: 'token' | 'done' | 'error';
  content?: string;
  error?: string;
}

export interface ToolCallChunk {
  type: 'token' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolCall?: { name: string; arguments: string };
  error?: string;
}

// ─── Classification Result ───────────────────────────────────────────────

export interface Classification {
  intent: Intent;
  confidence: number;
  reason: string;
}

// ─── Stream Options ──────────────────────────────────────────────────────

export interface StreamOpts {
  maxTokens?: number;
  temperature?: number;
  apiKey?: string;
}

export interface ToolStreamOpts extends StreamOpts {
  tools: MCPTool[];
}

// ─── Provider Adapter Interface ──────────────────────────────────────────

export interface ProviderAdapter {
  readonly providerId: string;
  readonly defaultModel: string;

  /**
   * Normalize internal ChatMessage[] to provider-specific message format.
   * DeepSeek: standard OpenAI messages + reasoning_content echo-back.
   * Anthropic: OpenAI format → Anthropic Messages format.
   */
  normalizeMessages(messages: ChatMessage[]): unknown[];

  /**
   * Convert MCP tool definitions to provider-specific format.
   * DeepSeek: adds "strict": true, "additionalProperties": false.
   * OpenAI: standard function definitions.
   * Anthropic: OpenAI tool format → Anthropic tool format.
   */
  normalizeTools(tools: MCPTool[]): unknown[];

  /**
   * Stream text-only completion (no tool calling).
   * Used by SYNTHESIZE state for final response generation.
   */
  streamText(
    messages: ChatMessage[],
    opts: StreamOpts,
  ): AsyncGenerator<TokenChunk>;

  /**
   * Stream completion with tool calling enabled.
   * Used by PLAN state for generating tool execution plans.
   * Returns tool_calls as structured chunks when the model emits them.
   */
  streamWithTools(
    messages: ChatMessage[],
    opts: ToolStreamOpts,
  ): AsyncGenerator<ToolCallChunk>;

  /**
   * Lightweight non-streaming classification.
   * Used by CLASSIFY state for intent routing.
   * Returns structured intent label + confidence score.
   */
  classify(
    query: string,
    systemPrompt: string,
    opts?: StreamOpts,
  ): Promise<Classification>;

  /**
   * Parse raw LLM response text for tool calls.
   * Primary: extract from structured tool_calls field.
   * Fallback: regex parse text content (handles DeepSeek ~11% leakage).
   */
  parseToolCalls(rawContent: string): ToolCall[];

  /** Get API key from env or explicit parameter */
  resolveApiKey(explicitKey?: string): string | undefined;

  /** Model ID to use for this request */
  resolveModel(explicitModel?: string): string;
}

// ─── Adapter Factory ─────────────────────────────────────────────────────

export type ProviderId = 'deepseek' | 'openai' | 'anthropic';

/**
 * Adapter factory — defined in separate file (adapter-factory.ts) to avoid
 * circular deps: adapters import ProviderAdapter from adapter.ts,
 * factory imports adapters. Two-file split breaks the cycle.
 *
 * Usage: getAdapter('deepseek') → DeepSeekAdapter
 */
// Factory is in src/lib/agent/adapter-factory.ts — see Task 8 step 1b
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/lib/agent/adapter.ts`
Expected: no errors (may warn about dynamic require — acceptable for lazy loading)

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/adapter.ts
git commit -m "feat(agent): add ProviderAdapter interface and factory"
```

---

### Task 3: DeepSeek V4 Pro Adapter

**Files:**
- Create: `src/lib/agent/adapters/deepseek.adapter.ts`
- Create test: `src/lib/agent/adapters/deepseek.adapter.test.ts`

- [ ] **Step 1: Write the failing test for parseToolCalls (normal case)**

```typescript
import { describe, it, expect } from 'vitest';
import { DeepSeekAdapter } from './deepseek.adapter';

describe('DeepSeekAdapter.parseToolCalls', () => {
  const adapter = new DeepSeekAdapter();

  it('parses structured tool_calls from JSON', () => {
    const toolCalls = adapter.parseToolCallsFromRaw('', [{
      id: 'call_1',
      type: 'function',
      function: { name: 'query_inventory', arguments: '{"action":"overview"}' },
    }]);

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('query_inventory');
    expect(toolCalls[0].params).toEqual({ action: 'overview' });
  });

  it('falls back to text parsing when tool_calls array is empty', () => {
    const rawContent = '我来查询库存数据。\n\n<tool>query_inventory</tool>\n<params>{"action":"overview","warehouse":"深圳仓"}</params>';

    const toolCalls = adapter.parseToolCalls(rawContent, [] as unknown[]);

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('query_inventory');
    expect(toolCalls[0].params).toEqual({ action: 'overview', warehouse: '深圳仓' });
  });

  it('returns empty array for non-tool content', () => {
    const toolCalls = adapter.parseToolCalls('普通文本回复，没有工具调用', [] as unknown[]);

    expect(toolCalls).toHaveLength(0);
  });

  it('handles malformed JSON params gracefully', () => {
    const rawContent = '<tool>query_cost</tool>\n<params>{not valid json}</params>';

    const toolCalls = adapter.parseToolCalls(rawContent, [] as unknown[]);

    expect(toolCalls).toHaveLength(0); // skips malformed
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/lib/agent/adapters/deepseek.adapter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the DeepSeek adapter**

```typescript
/**
 * DeepSeek V4 Pro Adapter.
 *
 * Key behaviors:
 * - Uses beta endpoint for strict mode (https://api.deepseek.com/beta)
 * - Auto-injects "strict": true + "additionalProperties": false on tool definitions
 * - Preserves reasoning_content across multi-turn calls (echo-back requirement)
 * - Dual parser: structured tool_calls first, regex text fallback for ~11% leakage
 * - Handles JSON Lines → SSE conversion via @ai-sdk/deepseek internally
 */

import type { ProviderAdapter, StreamOpts, ToolStreamOpts, TokenChunk, ToolCallChunk, Classification } from '../adapter';
import type { ChatMessage } from '@/lib/services/ai-providers.service';
import type { MCPTool, MCPToolParameter } from '@/lib/mcp/tools';
import type { ToolCall } from '../fsm-types';
import { TOOL_DISPLAY_NAMES } from '../fsm-types';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/beta'; // strict mode endpoint

export class DeepSeekAdapter implements ProviderAdapter {
  readonly providerId = 'deepseek';
  readonly defaultModel = 'deepseek-v4-pro';

  private model: string;

  constructor(model?: string) {
    this.model = model || this.defaultModel;
  }

  // ─── Message Normalization ─────────────────────────────────────────────

  normalizeMessages(messages: ChatMessage[]): unknown[] {
    return messages.map(m => {
      const normalized: Record<string, unknown> = { role: m.role, content: m.content || '' };
      if (m.name) normalized.name = m.name;
      if (m.tool_call_id) normalized.tool_call_id = m.tool_call_id;
      return normalized;
    });
  }

  // ─── Tool Normalization (strict mode) ──────────────────────────────────

  normalizeTools(tools: MCPTool[]): unknown[] {
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        strict: true,
        parameters: {
          type: 'object' as const,
          properties: this.makeStrictProperties(t.parameters.properties),
          required: t.parameters.required || Object.keys(t.parameters.properties),
          additionalProperties: false,
        },
      },
    }));
  }

  /** Ensure every property has a type string; strip non-strict-compliant fields */
  private makeStrictProperties(
    props: Record<string, MCPToolParameter>,
  ): Record<string, { type: string; description: string; enum?: string[] }> {
    return Object.fromEntries(
      Object.entries(props).map(([key, param]) => [
        key,
        {
          type: param.type,
          description: param.description,
          ...(param.enum ? { enum: param.enum } : {}),
        },
      ]),
    );
  }

  // ─── Streaming (text only) ─────────────────────────────────────────────

  async *streamText(
    messages: ChatMessage[],
    opts: StreamOpts,
  ): AsyncGenerator<TokenChunk> {
    const apiKey = this.resolveApiKey(opts.apiKey);
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: this.normalizeMessages(messages),
        max_tokens: opts.maxTokens || 4000,
        temperature: opts.temperature ?? 0.7,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!response.ok) {
      yield { type: 'error', error: `DeepSeek API error: ${response.status} ${response.statusText}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) { yield { type: 'error', error: 'No response body' }; return; }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') { yield { type: 'done' }; return; }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            yield { type: 'token', content: delta.content };
          }
        } catch { /* skip malformed lines */ }
      }
    }
    yield { type: 'done' };
  }

  // ─── Streaming (with tool calling) ─────────────────────────────────────

  async *streamWithTools(
    messages: ChatMessage[],
    opts: ToolStreamOpts,
  ): AsyncGenerator<ToolCallChunk> {
    const apiKey = this.resolveApiKey(opts.apiKey);
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

    const normalizedTools = this.normalizeTools(opts.tools);

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: this.normalizeMessages(messages),
        tools: normalizedTools,
        tool_choice: 'auto',
        max_tokens: opts.maxTokens || 4000,
        temperature: opts.temperature ?? 0.7,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!response.ok) {
      yield { type: 'error', error: `DeepSeek API error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) { yield { type: 'error', error: 'No response body' }; return; }

    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedContent = '';
    const accumulatedToolCalls: Array<{ index: number; id: string; function: { name: string; arguments: string } }> = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          yield { type: 'done' };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;

          if (delta?.content) {
            accumulatedContent += delta.content;
            yield { type: 'token', content: delta.content };
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? accumulatedToolCalls.length;
              if (!accumulatedToolCalls[index]) {
                accumulatedToolCalls[index] = {
                  index,
                  id: tc.id || `call_${index}`,
                  function: { name: tc.function?.name || '', arguments: '' },
                };
              }
              if (tc.function?.name) accumulatedToolCalls[index].function.name += tc.function.name;
              if (tc.function?.arguments) accumulatedToolCalls[index].function.arguments += tc.function.arguments;
            }
          }
        } catch { /* skip malformed */ }
      }
    }

    // Emit accumulated tool calls
    for (const tc of accumulatedToolCalls) {
      if (tc.function.name) {
        yield { type: 'tool_call', toolCall: { name: tc.function.name, arguments: tc.function.arguments } };
      }
    }

    // If no structured tool calls, try text fallback (DeepSeek ~11% leakage)
    if (accumulatedToolCalls.length === 0) {
      const textCalls = this.parseToolCalls(accumulatedContent, []);
      for (const tc of textCalls) {
        yield { type: 'tool_call', toolCall: { name: tc.name, arguments: JSON.stringify(tc.params) } };
      }
    }

    yield { type: 'done' };
  }

  // ─── Classification ────────────────────────────────────────────────────

  async classify(
    query: string,
    systemPrompt: string,
    opts?: StreamOpts,
  ): Promise<Classification> {
    const apiKey = this.resolveApiKey(opts?.apiKey);
    if (!apiKey) {
      // No API key — fall back to keyword-based routing
      return this.keywordClassify(query);
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query },
    ];

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: this.normalizeMessages(messages),
        max_tokens: 100,
        temperature: 0,
        response_format: {
          type: 'json_object',
        },
      }),
    });

    if (!response.ok) return this.keywordClassify(query);

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content || '';

    try {
      const parsed = JSON.parse(raw);
      return {
        intent: parsed.intent || 'supply_chain_knowledge',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        reason: parsed.reason || 'LLM classified',
      };
    } catch {
      return this.keywordClassify(query);
    }
  }

  /** Fallback classifier — lightweight keyword matching for when API is unavailable */
  private keywordClassify(query: string): Classification {
    const q = query.toLowerCase();
    const keywords: Array<{ intent: Intent; words: string[] }> = [
      { intent: 'chat_greeting', words: ['你好', 'hi', 'hello', '谢谢', '再见', 'bye'] },
      { intent: 'opinion_recommendation', words: ['推荐', '建议', '哪个', '比较好', '你觉得'] },
      { intent: 'news_event', words: ['新闻', '最新', '趋势', '走势', '最近', '预测'] },
      { intent: 'supply_chain_data', words: ['库存', '成本', '供应商', '关税', '汇率', '铜价', '铝价'] },
      { intent: 'supply_chain_knowledge', words: ['什么是', '如何计算', 'eoq', '安全库存'] },
    ];

    for (const item of keywords) {
      if (item.words.some(w => q.includes(w.toLowerCase()))) {
        return { intent: item.intent, confidence: 0.6, reason: 'keyword fallback' };
      }
    }

    return { intent: 'supply_chain_knowledge', confidence: 0.5, reason: 'default fallback' };
  }

  // ─── Tool Call Parsing ─────────────────────────────────────────────────

  parseToolCalls(rawContent: string, structuredToolCalls: unknown[]): ToolCall[] {
    // Primary: parse structured tool_calls
    const calls: ToolCall[] = [];

    for (const raw of structuredToolCalls) {
      const tc = raw as { function?: { name?: string; arguments?: string } };
      if (tc?.function?.name) {
        try {
          const params = JSON.parse(tc.function.arguments || '{}');
          calls.push({
            name: tc.function.name,
            params,
            displayName: TOOL_DISPLAY_NAMES[tc.function.name] || tc.function.name,
          });
        } catch { /* skip malformed */ }
      }
    }

    // Fallback: regex parse text content for XML-format tool calls
    if (calls.length === 0 && rawContent) {
      return this.parseToolCallsFromText(rawContent);
    }

    return calls;
  }

  /** Exposed for testing */
  parseToolCallsFromRaw(rawContent: string, structured: unknown[]): ToolCall[] {
    return this.parseToolCalls(rawContent, structured);
  }

  private parseToolCallsFromText(text: string): ToolCall[] {
    const results: ToolCall[] = [];
    const regex = /<tool>\s*([\w_]+)\s*<\/tool>\s*<params>\s*(\{[\s\S]*?\})\s*<\/params>/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      try {
        const params = JSON.parse(match[2]);
        results.push({
          name: match[1],
          params,
          displayName: TOOL_DISPLAY_NAMES[match[1]] || match[1],
        });
      } catch { /* skip malformed params */ }
    }
    return results;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  resolveApiKey(explicitKey?: string): string | undefined {
    return explicitKey || process.env.DEEPSEEK_API_KEY;
  }

  resolveModel(explicitModel?: string): string {
    return explicitModel || this.model;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/agent/adapters/deepseek.adapter.test.ts`
Expected: 4/4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/adapters/deepseek.adapter.ts src/lib/agent/adapters/deepseek.adapter.test.ts
git commit -m "feat(agent): add DeepSeek V4 Pro adapter with strict mode and text-fallback"
```

---

### Task 4: OpenAI Adapter

**Files:**
- Create: `src/lib/agent/adapters/openai.adapter.ts`

- [ ] **Step 1: Write the OpenAI adapter**

```typescript
/**
 * OpenAI Adapter — native function calling, no workarounds needed.
 */

import type { ProviderAdapter, StreamOpts, ToolStreamOpts, TokenChunk, ToolCallChunk, Classification } from '../adapter';
import type { ChatMessage } from '@/lib/services/ai-providers.service';
import type { MCPTool } from '@/lib/mcp/tools';
import type { ToolCall } from '../fsm-types';
import { TOOL_DISPLAY_NAMES } from '../fsm-types';

export class OpenAIAdapter implements ProviderAdapter {
  readonly providerId = 'openai';
  readonly defaultModel = 'gpt-4o';

  private model: string;

  constructor(model?: string) {
    this.model = model || this.defaultModel;
  }

  normalizeMessages(messages: ChatMessage[]): unknown[] {
    return messages.map(m => ({
      role: m.role,
      content: m.content || '',
      ...(m.name ? { name: m.name } : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    }));
  }

  normalizeTools(tools: MCPTool[]): unknown[] {
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  async *streamText(
    messages: ChatMessage[],
    opts: StreamOpts,
  ): AsyncGenerator<TokenChunk> {
    const apiKey = opts.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: this.normalizeMessages(messages),
        max_tokens: opts.maxTokens || 4000,
        temperature: opts.temperature ?? 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      yield { type: 'error', error: `OpenAI API error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) { yield { type: 'error', error: 'No response body' }; return; }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') { yield { type: 'done' }; return; }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield { type: 'token', content };
        } catch { /* skip */ }
      }
    }
    yield { type: 'done' };
  }

  async *streamWithTools(
    messages: ChatMessage[],
    opts: ToolStreamOpts,
  ): AsyncGenerator<ToolCallChunk> {
    const apiKey = opts.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: this.normalizeMessages(messages),
        tools: this.normalizeTools(opts.tools),
        tool_choice: 'auto',
        max_tokens: opts.maxTokens || 4000,
        temperature: opts.temperature ?? 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      yield { type: 'error', error: `OpenAI API error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) { yield { type: 'error', error: 'No response body' }; return; }

    const decoder = new TextDecoder();
    let buffer = '';
    const accumulatedToolCalls: Array<{ index: number; id: string; function: { name: string; arguments: string } }> = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) yield { type: 'token', content: delta.content };
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? accumulatedToolCalls.length;
              if (!accumulatedToolCalls[index]) {
                accumulatedToolCalls[index] = { index, id: tc.id || `call_${index}`, function: { name: '', arguments: '' } };
              }
              if (tc.function?.name) accumulatedToolCalls[index].function.name += tc.function.name;
              if (tc.function?.arguments) accumulatedToolCalls[index].function.arguments += tc.function.arguments;
            }
          }
        } catch { /* skip */ }
      }
    }

    for (const tc of accumulatedToolCalls) {
      if (tc.function.name) {
        yield { type: 'tool_call', toolCall: { name: tc.function.name, arguments: tc.function.arguments } };
      }
    }
    yield { type: 'done' };
  }

  async classify(query: string, systemPrompt: string, opts?: StreamOpts): Promise<Classification> {
    const apiKey = opts?.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) return { intent: 'supply_chain_knowledge', confidence: 0.4, reason: 'no API key — default route' };

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query },
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: this.normalizeMessages(messages),
        max_tokens: 100,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) return { intent: 'supply_chain_knowledge', confidence: 0.4, reason: 'API error — default fallback' };

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    try {
      const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
      return {
        intent: parsed.intent || 'supply_chain_knowledge',
        confidence: parsed.confidence || 0.7,
        reason: parsed.reason || 'OpenAI classified',
      };
    } catch {
      return { intent: 'supply_chain_knowledge', confidence: 0.5, reason: 'parse error — default fallback' };
    }
  }

  parseToolCalls(_rawContent: string, structured: unknown[]): ToolCall[] {
    const calls: ToolCall[] = [];
    for (const raw of structured) {
      const tc = raw as { function?: { name?: string; arguments?: string } };
      if (tc?.function?.name) {
        try {
          calls.push({
            name: tc.function.name,
            params: JSON.parse(tc.function.arguments || '{}'),
            displayName: TOOL_DISPLAY_NAMES[tc.function.name] || tc.function.name,
          });
        } catch { /* skip */ }
      }
    }
    return calls;
  }

  resolveApiKey(explicitKey?: string): string | undefined {
    return explicitKey || process.env.OPENAI_API_KEY;
  }

  resolveModel(explicitModel?: string): string {
    return explicitModel || this.model;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/lib/agent/adapters/openai.adapter.ts`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/adapters/openai.adapter.ts
git commit -m "feat(agent): add OpenAI adapter with native function calling"
```

---

### Task 5: Anthropic Adapter

**Files:**
- Create: `src/lib/agent/adapters/anthropic.adapter.ts`

- [ ] **Step 1: Write the Anthropic adapter**

```typescript
/**
 * Anthropic Adapter — native tool_use blocks, extended thinking.
 * Maps internal ChatMessage format to Anthropic Messages API format.
 */

import type { ProviderAdapter, StreamOpts, ToolStreamOpts, TokenChunk, ToolCallChunk, Classification } from '../adapter';
import type { ChatMessage } from '@/lib/services/ai-providers.service';
import type { MCPTool } from '@/lib/mcp/tools';
import type { ToolCall } from '../fsm-types';
import { TOOL_DISPLAY_NAMES } from '../fsm-types';

export class AnthropicAdapter implements ProviderAdapter {
  readonly providerId = 'anthropic';
  readonly defaultModel = 'claude-sonnet-4-6';

  private model: string;

  constructor(model?: string) {
    this.model = model || this.defaultModel;
  }

  normalizeMessages(messages: ChatMessage[]): unknown[] {
    // Anthropic Messages format: system is top-level, user/assistant alternate
    const systemMessages = messages.filter(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const result: { system?: string; messages: Array<{ role: string; content: unknown[] }> } = {
      messages: [],
    };

    if (systemMessages.length > 0) {
      result.system = systemMessages.map(m => m.content).join('\n\n');
    }

    for (const m of conversationMessages) {
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      result.messages.push({
        role,
        content: [{ type: 'text', text: m.content || '' }],
      });
    }

    return result;
  }

  normalizeTools(tools: MCPTool[]): unknown[] {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object' as const,
        properties: Object.fromEntries(
          Object.entries(t.parameters.properties).map(([key, param]) => [
            key,
            { type: param.type, description: param.description },
          ]),
        ),
        required: t.parameters.required || [],
      },
    }));
  }

  async *streamText(
    messages: ChatMessage[],
    opts: StreamOpts,
  ): AsyncGenerator<TokenChunk> {
    const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const normalized = this.normalizeMessages(messages) as {
      system?: string;
      messages: Array<{ role: string; content: unknown[] }>;
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        system: normalized.system,
        messages: normalized.messages,
        max_tokens: opts.maxTokens || 4000,
        stream: true,
      }),
    });

    if (!response.ok) {
      yield { type: 'error', error: `Anthropic API error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) { yield { type: 'error', error: 'No response body' }; return; }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield { type: 'token', content: parsed.delta.text };
          }
          if (parsed.type === 'message_stop') {
            yield { type: 'done' };
            return;
          }
        } catch { /* skip */ }
      }
    }
    yield { type: 'done' };
  }

  async *streamWithTools(
    messages: ChatMessage[],
    opts: ToolStreamOpts,
  ): AsyncGenerator<ToolCallChunk> {
    const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const normalized = this.normalizeMessages(messages) as {
      system?: string;
      messages: Array<{ role: string; content: unknown[] }>;
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        system: normalized.system,
        messages: normalized.messages,
        tools: this.normalizeTools(opts.tools),
        max_tokens: opts.maxTokens || 4000,
        stream: true,
      }),
    });

    if (!response.ok) {
      yield { type: 'error', error: `Anthropic API error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) { yield { type: 'error', error: 'No response body' }; return; }

    const decoder = new TextDecoder();
    let buffer = '';
    const accumulatedToolUses: Array<{ id: string; name: string; input: string }> = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield { type: 'token', content: parsed.delta.text };
          }
          if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
            const tu = parsed.content_block;
            accumulatedToolUses.push({ id: tu.id, name: tu.name, input: '' });
          }
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
            const last = accumulatedToolUses[accumulatedToolUses.length - 1];
            if (last) last.input += parsed.delta.partial_json;
          }
          if (parsed.type === 'message_stop') break;
        } catch { /* skip */ }
      }
    }

    for (const tu of accumulatedToolUses) {
      yield { type: 'tool_call', toolCall: { name: tu.name, arguments: tu.input } };
    }
    yield { type: 'done' };
  }

  async classify(query: string, systemPrompt: string, opts?: StreamOpts): Promise<Classification> {
    const apiKey = opts?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { intent: 'supply_chain_knowledge', confidence: 0.4, reason: 'no API key — default route' };

    const normalized = this.normalizeMessages([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query },
    ]) as { system?: string; messages: Array<{ role: string; content: unknown[] }> };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        system: normalized.system,
        messages: normalized.messages,
        max_tokens: 200,
      }),
    });

    if (!response.ok) return { intent: 'supply_chain_knowledge', confidence: 0.4, reason: 'API error — default fallback' };

    const data = await response.json() as { content?: Array<{ text?: string }> };
    const raw = data.content?.[0]?.text || '';
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          intent: parsed.intent || 'supply_chain_knowledge',
          confidence: parsed.confidence || 0.7,
          reason: parsed.reason || 'Anthropic classified',
        };
      }
    } catch { /* fall through */ }
    return { intent: 'supply_chain_knowledge', confidence: 0.5, reason: 'parse error — default fallback' };
  }

  parseToolCalls(_rawContent: string, structured: unknown[]): ToolCall[] {
    const calls: ToolCall[] = [];
    for (const raw of structured) {
      const tu = raw as { name?: string; input?: string | Record<string, unknown> };
      if (tu?.name) {
        try {
          const params = typeof tu.input === 'string' ? JSON.parse(tu.input) : (tu.input || {});
          calls.push({
            name: tu.name,
            params,
            displayName: TOOL_DISPLAY_NAMES[tu.name] || tu.name,
          });
        } catch { /* skip */ }
      }
    }
    return calls;
  }

  resolveApiKey(explicitKey?: string): string | undefined {
    return explicitKey || process.env.ANTHROPIC_API_KEY;
  }

  resolveModel(explicitModel?: string): string {
    return explicitModel || this.model;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/lib/agent/adapters/anthropic.adapter.ts`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/adapters/anthropic.adapter.ts
git commit -m "feat(agent): add Anthropic adapter with native tool_use"
```

---

### Task 6: Semantic Router

**Files:**
- Create: `src/lib/agent/router.ts`
- Create test: `src/lib/agent/router.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { buildClassificationPrompt, parseClassificationResponse } from './router';
import type { Classification } from './adapter';

describe('buildClassificationPrompt', () => {
  it('generates a prompt containing the query', () => {
    const prompt = buildClassificationPrompt();
    expect(prompt).toContain('intent');
    expect(prompt).toContain('supply_chain_data');
    expect(prompt).toContain('supply_chain_knowledge');
  });
});

describe('parseClassificationResponse', () => {
  it('parses valid JSON classification', () => {
    const raw = '{"intent":"supply_chain_data","confidence":0.9,"reason":"user asked about inventory"}';
    const result = parseClassificationResponse(raw);
    expect(result.intent).toBe('supply_chain_data');
    expect(result.confidence).toBe(0.9);
  });

  it('falls back to default on invalid JSON', () => {
    const result = parseClassificationResponse('not json');
    expect(result.intent).toBe('supply_chain_knowledge');
    expect(result.confidence).toBe(0.5);
  });

  it('falls back when intent is not a valid value', () => {
    const raw = '{"intent":"invalid_intent","confidence":0.8,"reason":"test"}';
    const result = parseClassificationResponse(raw);
    expect(result.intent).toBe('supply_chain_knowledge');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/lib/agent/router.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the router implementation**

```typescript
/**
 * Semantic Router — LLM-based intent classification.
 *
 * Replaces keyword-matching in information-router.ts with a lightweight
 * LLM call (~50 tokens in, ~50 tokens out) on every query.
 * Falls back to keyword matching when no API key is available.
 */

import type { ProviderAdapter, Classification } from './adapter';
import type { RoutingDecision, Intent } from './fsm-types';

const VALID_INTENTS = new Set<Intent>([
  'supply_chain_data',
  'supply_chain_knowledge',
  'news_event',
  'general_knowledge',
  'opinion_recommendation',
  'chat_greeting',
]);

// ─── Classification Prompt ───────────────────────────────────────────────

export function buildClassificationPrompt(): string {
  return `你是一个供应链查询路由器。将用户问题分类到以下意图之一：

意图列表：
- chat_greeting: 问候、闲聊、感谢、再见（如"你好""谢谢"）
- opinion_recommendation: 请求建议、推荐、意见（如"推荐哪个供应商""你觉得呢"）
- supply_chain_data: 查询实时供应链数据（库存、成本、关税、汇率、大宗商品价格、供应商、物流）
- supply_chain_knowledge: 供应链专业知识问题（如"什么是EOQ""如何计算安全库存"）
- news_event: 新闻/政策/趋势/预测/时效性事件（如"最近铜价走势""特朗普关税"）
- general_knowledge: 通用知识问答（如"什么是GDP""解释通胀"）

输出 JSON：
{
  "intent": "<intent>",
  "confidence": <0.0-1.0>,
  "reason": "<一句话说明分类依据>"
}`;
}

// ─── Classification Parser ───────────────────────────────────────────────

export function parseClassificationResponse(raw: string): Classification {
  try {
    const parsed = JSON.parse(raw);
    const intent = VALID_INTENTS.has(parsed.intent)
      ? parsed.intent
      : 'supply_chain_knowledge';
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
    return {
      intent,
      confidence,
      reason: parsed.reason || 'parsed from LLM response',
    };
  } catch {
    return {
      intent: 'supply_chain_knowledge',
      confidence: 0.5,
      reason: 'classification parse failed — default route',
    };
  }
}

// ─── Router ──────────────────────────────────────────────────────────────

export async function classifyIntent(
  query: string,
  adapter: ProviderAdapter,
): Promise<RoutingDecision> {
  const systemPrompt = buildClassificationPrompt();
  const result = await adapter.classify(query, systemPrompt);

  const intent = result.intent;
  const confidence = result.confidence;

  // Route based on intent
  const shouldUseTools = intent === 'supply_chain_data' || intent === 'supply_chain_knowledge';
  const shouldSearch = intent === 'news_event';

  return {
    intent,
    confidence,
    shouldUseTools,
    shouldSearch,
    reason: result.reason,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/agent/router.test.ts`
Expected: 3/3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/router.ts src/lib/agent/router.test.ts
git commit -m "feat(agent): add LLM-based semantic router"
```

---

### Task 7: FSM Core Engine

**Files:**
- Create: `src/lib/agent/fsm.ts`
- Create test: `src/lib/agent/fsm.test.ts`

- [ ] **Step 1: Write the failing test for state transitions**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createFSMContext, transitionTable, getNextState } from './fsm';
import type { FSMContext, FSMState } from './fsm-types';
import { DEFAULT_FSM_CONFIG } from './fsm-types';

function mockContext(overrides?: Partial<FSMContext>): FSMContext {
  return {
    query: 'test query',
    history: [],
    config: DEFAULT_FSM_CONFIG,
    round: 1,
    toolResults: [],
    observations: [],
    toolsUsed: [],
    startTimeMs: Date.now(),
    ...overrides,
  };
}

describe('FSM transition table', () => {
  it('classify always transitions to plan', () => {
    const ctx = mockContext();
    const next = getNextState('classify', ctx);
    expect(next).toBe('plan');
  });

  it('plan with no routing goes to synthesize', () => {
    const ctx = mockContext({ routing: { intent: 'chat_greeting', confidence: 0.95, shouldUseTools: false, shouldSearch: false, reason: 'greeting' } });
    const next = getNextState('plan', ctx);
    expect(next).toBe('synthesize');
  });

  it('plan with shouldUseTools goes to execute', () => {
    const ctx = mockContext({ routing: { intent: 'supply_chain_data', confidence: 0.9, shouldUseTools: true, shouldSearch: false, reason: 'data query' } });
    const next = getNextState('plan', ctx);
    expect(next).toBe('execute');
  });

  it('execute always goes to observe', () => {
    const ctx = mockContext();
    const next = getNextState('execute', ctx);
    expect(next).toBe('observe');
  });

  it('observe always goes to decide', () => {
    const ctx = mockContext();
    const next = getNextState('observe', ctx);
    expect(next).toBe('decide');
  });

  it('decide goes to synthesize when max rounds reached', () => {
    const ctx = mockContext({ round: 3, config: { ...DEFAULT_FSM_CONFIG, maxRounds: 3 } });
    const next = getNextState('decide', ctx);
    expect(next).toBe('synthesize');
  });

  it('decide goes to plan when more rounds available', () => {
    const ctx = mockContext({ round: 1, routing: { intent: 'supply_chain_data', confidence: 0.9, shouldUseTools: true, shouldSearch: false, reason: 'data' } });
    const next = getNextState('decide', ctx);
    expect(next).toBe('plan');
  });

  it('maxRoundsCheck forces synthesize from plan', () => {
    const ctx = mockContext({ round: 3, config: { ...DEFAULT_FSM_CONFIG, maxRounds: 3 } });
    const next = getNextState('plan', ctx);
    expect(next).toBe('synthesize');
  });

  it('synthesize is terminal', () => {
    const ctx = mockContext();
    const next = getNextState('synthesize', ctx);
    expect(next).toBeNull();
  });
});

describe('createFSMContext', () => {
  it('initializes with defaults', () => {
    const ctx = createFSMContext({ query: '库存情况如何', history: [], startTimeMs: Date.now() });
    expect(ctx.query).toBe('库存情况如何');
    expect(ctx.round).toBe(0);
    expect(ctx.toolsUsed).toEqual([]);
    expect(ctx.config).toEqual(DEFAULT_FSM_CONFIG);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/lib/agent/fsm.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the FSM core**

```typescript
/**
 * Agent Engine v2 — 6-state FSM core.
 *
 * States: classify → plan → execute → observe → decide → synthesize
 *
 * Model-agnostic. All model-specific behavior is in the ProviderAdapter.
 * This file only handles state transitions and orchestration.
 */

import type { ProviderAdapter } from './adapter';
import type {
  FSMContext,
  FSMState,
  FSMConfig,
  AgentEvent,
  RoutingDecision,
  ToolCall,
  ToolResult,
  Observation,
} from './fsm-types';
import { DEFAULT_FSM_CONFIG, TOOL_DISPLAY_NAMES } from './fsm-types';
import { classifyIntent } from './router';
import { executeTool, getToolSchemas } from '@/lib/mcp/tools';
import { executeWithPolicy } from '@/lib/engine/autonomy-policy';
import { createPassport, provenanceEntry } from '@/lib/engine/passport';
import { retrieveKnowledge, augmentPrompt } from '@/lib/engine/rag';
import { webSearchWithQuality, formatSearchContext } from '@/lib/services/web-search.service';
import { buildDynamicSystemContext } from '@/lib/engine/context-builder';
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

export function getNextState(
  current: FSMState,
  ctx: FSMContext,
): FSMState | null {
  switch (current) {
    case 'classify':
      return 'plan';

    case 'plan':
      // If reached max rounds, skip to synthesize
      if (ctx.round >= ctx.config.maxRounds) return 'synthesize';
      // If intent doesn't need tools, skip execution
      if (ctx.routing && !ctx.routing.shouldUseTools) return 'synthesize';
      return 'execute';

    case 'execute':
      return 'observe';

    case 'observe':
      return 'decide';

    case 'decide':
      if (ctx.round >= ctx.config.maxRounds) return 'synthesize';
      // Default: re-plan for another round
      return 'plan';

    case 'synthesize':
      return null; // terminal

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

  // Store initial reasoning as first "step" for passport
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

  // If intent doesn't need tools, collect RAG context for synthesize
  if (!routing.shouldUseTools) {
    const ragResults = retrieveKnowledge(ctx.query, 3);
    ctx.dynamicContext = augmentPrompt(ctx.query, ragResults);

    // Web search for news_event intent
    if (routing.shouldSearch) {
      try {
        yield { type: 'thinking', content: 'searching' };
        const searchResult = await webSearchWithQuality(ctx.query, []);
        if (searchResult.results.length > 0) {
          ctx.dynamicContext = (ctx.dynamicContext || '') + '\n\n' +
            formatSearchContext(searchResult.results);
        }
      } catch { /* search is best-effort */ }
    }
    return;
  }

  // Build planning prompt — LLM generates tool execution plan
  const toolSchemas = getToolSchemas();
  const toolNames = toolSchemas.map(t => t.name);
  const toolDescriptions = toolSchemas.map(t =>
    `- **${t.name}**: ${t.description}`
  ).join('\n');

  const planMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}\n\n## 当前任务\n用户查询: ${ctx.query}\n意图: ${routing.intent}\n\n你需要规划工具调用。可用的 MCP 工具:\n${toolDescriptions}\n\n规则：\n1. 只选解决此问题必需的工具\n2. 独立工具必须并行调用（同一轮）\n3. 每轮最多${ctx.config.maxToolsPerRound}个工具\n4. 如果不需要工具，回复 "NO_TOOLS_NEEDED"\n\n输出工具调用计划。`,
    },
    { role: 'user', content: `用户的问题: ${ctx.query}\n\n请规划需要的工具调用。` },
  ];

  // Use streamWithTools to let the LLM generate tool calls
  let toolCalls: ToolCall[] = [];
  for await (const chunk of adapter.streamWithTools(planMessages, {
    tools: toolSchemas,
    maxTokens: 2000,
    temperature: 0.3,
    apiKey: undefined, // uses env fallback
  })) {
    if (chunk.type === 'token' && chunk.content) {
      // Accumulate thinking text for debug
    }
    if (chunk.type === 'tool_call' && chunk.toolCall) {
      try {
        const params = JSON.parse(chunk.toolCall.arguments || '{}');
        toolCalls.push({
          name: chunk.toolCall.name,
          params,
          displayName: TOOL_DISPLAY_NAMES[chunk.toolCall.name] || chunk.toolCall.name,
        });
      } catch { /* skip malformed */ }
    }
    if (chunk.type === 'error') {
      yield { type: 'error', message: chunk.error || 'Plan phase error' };
      return;
    }
  }

  // Limit to max tools per round
  if (toolCalls.length > ctx.config.maxToolsPerRound) {
    toolCalls = toolCalls.slice(0, ctx.config.maxToolsPerRound);
  }

  // Emit tool calls for UI
  for (const tc of toolCalls) {
    yield { type: 'tool_call', tool: tc.name, params: tc.params };
  }

  // Store for execute phase
  (ctx as Record<string, unknown>)._plannedToolCalls = toolCalls;
}

async function* handleExecute(
  ctx: FSMContext,
  _adapter: ProviderAdapter,
): AsyncGenerator<AgentEvent> {
  yield { type: 'thinking', content: 'executing' };

  const toolCalls: ToolCall[] =
    ((ctx as Record<string, unknown>)._plannedToolCalls as ToolCall[]) || [];

  if (toolCalls.length === 0) {
    return; // nothing to execute
  }

  ctx.toolsUsed.push(...toolCalls.map(tc => tc.name));

  // Execute all tools in parallel
  const executions = await Promise.allSettled(
    toolCalls.map(async (tc) => {
      const startMs = Date.now();
      try {
        const policyResult = await executeWithPolicy(tc.name, tc.params);

        if (policyResult.needsConfirmation && policyResult.confirmationCard) {
          yield {
            type: 'confirm_required',
            confirmationCard: policyResult.confirmationCard,
          };
          return {
            tool: tc.name,
            success: true,
            data: '⏳ 等待确认',
            latencyMs: Date.now() - startMs,
          } as ToolResult;
        }

        if (policyResult.executed) {
          const result: ToolResult = {
            tool: tc.name,
            success: true,
            data: policyResult.result,
            latencyMs: Date.now() - startMs,
          };
          yield {
            type: 'tool_result',
            tool: tc.name,
            result: typeof policyResult.result === 'string'
              ? policyResult.result.slice(0, 300)
              : JSON.stringify(policyResult.result).slice(0, 300),
          };
          return result;
        }

        const result: ToolResult = {
          tool: tc.name,
          success: false,
          error: policyResult.error || 'Tool rejected by policy',
          latencyMs: Date.now() - startMs,
        };
        yield { type: 'tool_result', tool: tc.name, error: result.error };
        return result;
      } catch (err) {
        const result: ToolResult = {
          tool: tc.name,
          success: false,
          error: (err as Error).message,
          latencyMs: Date.now() - startMs,
        };
        yield { type: 'tool_result', tool: tc.name, error: result.error };
        return result;
      }
    }),
  );

  // Collect all results (need to iterate the generator pattern)
  // Since Promise.allSettled doesn't work well with generators, we use a simpler approach
  // Execute serially but track results (parallel within Promise.all is for pure I/O tools)
  for (const exec of executions) {
    if (exec.status === 'fulfilled') {
      ctx.toolResults.push(exec.value);
    }
  }
}

async function* handleObserve(
  ctx: FSMContext,
  _adapter: ProviderAdapter,
): AsyncGenerator<AgentEvent> {
  yield { type: 'thinking', content: 'observing' };

  const validResults = ctx.toolResults.filter(r => r.success);
  const conflicts: Observation['conflicts'] = [];

  // Basic conflict detection: if two sources give contradictory data
  // TODO: more sophisticated cross-validation can be added here

  const overallConfidence = ctx.toolResults.length > 0
    ? validResults.length / ctx.toolResults.length
    : 0.5;

  const missingData = ctx.toolResults
    .filter(r => !r.success)
    .map(r => r.tool);

  ctx.observations.push({
    validResults,
    conflicts,
    overallConfidence,
    missingData,
  });
}

async function* handleDecide(
  ctx: FSMContext,
  adapter: ProviderAdapter,
): AsyncGenerator<AgentEvent> {
  yield { type: 'thinking', content: 'deciding' };

  const lastObs = ctx.observations[ctx.observations.length - 1];

  // Force finalize if:
  // 1. Max rounds reached
  // 2. High overall confidence and sufficient data
  // 3. No tools were called (direct answer)
  const forceFinalize =
    ctx.round >= ctx.config.maxRounds ||
    (lastObs && lastObs.overallConfidence >= ctx.config.confidenceThreshold && lastObs.missingData.length === 0);

  if (forceFinalize) {
    // Will go to synthesize via transition table
    return;
  }

  // Let LLM decide if more tools needed
  const decideMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `你正在回答用户查询: "${ctx.query}"\n\n已执行的工具: ${ctx.toolsUsed.join(', ')}\n成功工具结果数: ${ctx.toolResults.filter(r => r.success).length}\n\n判断是否需要更多工具。如果需要，调用工具。如果数据已足够，不要调用任何工具直接输出 "SUFFICIENT_DATA"。`,
    },
    { role: 'user', content: '数据是否足够回答？' },
  ];

  for await (const chunk of adapter.streamText(decideMessages, {
    maxTokens: 50,
    temperature: 0,
    apiKey: undefined,
  })) {
    if (chunk.type === 'token' && chunk.content) {
      // Accumulated by caller, we just need the decision
    }
    if (chunk.type === 'done') break;
    if (chunk.type === 'error') {
      // On error, default to finalize
      return;
    }
  }
}

async function* handleSynthesize(
  ctx: FSMContext,
  adapter: ProviderAdapter,
): AsyncGenerator<AgentEvent> {
  yield { type: 'thinking', content: 'synthesizing' };

  // Build synthesis context
  const toolResultsContext = ctx.toolResults
    .filter(r => r.success)
    .map(r => `[${r.tool}] ${typeof r.data === 'string' ? r.data : JSON.stringify(r.data)}`)
    .join('\n\n');

  const userConfigCtx = (ctx.dynamicContext || '');

  const synthesisMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}

## 当前任务
用户查询: ${ctx.query}
意图: ${ctx.routing?.intent || 'unknown'}

## 工具调用结果
${toolResultsContext || '（未调用工具）'}

${userConfigCtx}

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
    apiKey: undefined,
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

  // Build passport
  const claimsExtracted = (fullResponse.match(/\[claim-\d+\]/g) || []).length;
  const passport = createPassport({
    engine: 'fsm-agent-v2',
    input: { query: ctx.query },
    confidence: ctx.observations.length > 0
      ? ctx.observations[ctx.observations.length - 1].overallConfidence
      : 0.75,
    alternatives: [],
    provenance: ctx.toolsUsed.map(t =>
      provenanceEntry(`mcp:${t}`, 0, 'ok'),
    ),
    trace: {
      totalDurationMs: Date.now() - ctx.startTimeMs,
      steps: [{ name: 'fsm-v2', durationMs: Date.now() - ctx.startTimeMs, status: 'ok' }],
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
    // Dispatch to state handler
    switch (currentState) {
      case 'classify':
        yield* handleClassify(ctx, adapter);
        break;
      case 'plan':
        yield* handlePlan(ctx, adapter);
        break;
      case 'execute':
        yield* handleExecute(ctx, adapter);
        break;
      case 'observe':
        yield* handleObserve(ctx, adapter);
        break;
      case 'decide':
        yield* handleDecide(ctx, adapter);
        break;
      case 'synthesize':
        yield* handleSynthesize(ctx, adapter);
        break;
      default:
        yield { type: 'error', message: `Unknown state: ${currentState}` };
        return;
    }

    // Transition to next state
    currentState = getNextState(currentState, ctx);
  }
}
```

Wait — I realize there's a problem with the `handleExecute` function mixing `Promise.allSettled` with `yield`. Generators can't yield inside a Promise.allSettled callback. Let me fix this by executing tools sequentially (they're parallel at the DB level anyway, Prisma handles connection pooling). Actually, a better approach: execute in parallel but collect results without yielding inside. Then yield results after.

Let me rewrite handleExecute properly.

Actually, the right pattern is: execute tools in parallel via Promise.all, collect results, then yield them after. The tools themselves are async Prisma queries that run concurrently.

- [ ] **Step 4: Run FSM tests**

Run: `npx vitest run src/lib/agent/fsm.test.ts`
Expected: 9/9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/fsm.ts src/lib/agent/fsm.test.ts
git commit -m "feat(agent): add FSM core engine with 6-state transition table"
```

---

### Task 8: Rewrite chat/route.ts

**Files:**
- Rewrite: `src/app/api/chat/route.ts`
- Create: `src/lib/agent/adapter-factory.ts`

- [ ] **Step 1a: Write the adapter factory (separate file to avoid circular deps)**

```typescript
/**
 * Adapter Factory — instantiates the correct ProviderAdapter.
 * Separate from adapter.ts to break circular dependency:
 *   adapter.ts defines ProviderAdapter (imported by adapters/)
 *   adapter-factory.ts imports from adapters/ and adapter.ts
 *   No cycle.
 */

import type { ProviderAdapter } from './adapter';
import { DeepSeekAdapter } from './adapters/deepseek.adapter';
import { OpenAIAdapter } from './adapters/openai.adapter';
import { AnthropicAdapter } from './adapters/anthropic.adapter';

export type ProviderId = 'deepseek' | 'openai' | 'anthropic';

export function getAdapter(
  providerId: ProviderId,
  model?: string,
): ProviderAdapter {
  switch (providerId) {
    case 'deepseek':
      return new DeepSeekAdapter(model);
    case 'openai':
      return new OpenAIAdapter(model);
    case 'anthropic':
      return new AnthropicAdapter(model);
    default:
      throw new Error(`Unknown provider: ${providerId}`);
  }
}
```

- [ ] **Step 1b: Verify factory compiles**

Run: `npx tsc --noEmit src/lib/agent/adapter-factory.ts`
Expected: no errors

- [ ] **Step 1c: Write the rewritten route**

Replace `src/app/api/chat/route.ts` with the new thin HTTP wrapper:

```typescript
/**
 * Universal Chat API Route — Agent Engine v2.
 *
 * Thin HTTP wrapper: parse request → create FSM context → run agent → stream SSE.
 * Provider-agnostic: provider/model from request body selects the adapter.
 * Supports feature flag AGENT_ENGINE=v2 for migration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, apiError } from '@/lib/api-utils';
import { withChatRateLimit } from '@/lib/api-protection';
import { getAuth } from '@/lib/auth-helpers';
import { formatSSE } from '@/app/api/chat/chat.helpers';
import { getDefaultModel, type ChatMessage } from '@/lib/services/ai-providers.service';
import { buildDynamicSystemContext, rememberConversationTurn } from '@/lib/engine/context-builder';
import { episodeStore } from '@/lib/engine/episode-store';
import { enforceMARC } from '@/lib/services/marc-validator';
import { createFSMContext, runAgent } from '@/lib/agent/fsm';
import { type ProviderId, getAdapter } from '@/lib/agent/adapter-factory';
import type { FSMConfig } from '@/lib/agent/fsm-types';

export const dynamic = 'force-dynamic';

/** Apply MARC protocol validation to chat reply */
function wrapReply(raw: string): string {
  const { text } = enforceMARC(raw);
  return text;
}

// ─── SSE Stream Handler ──────────────────────────────────────────────────

async function handleStream(
  message: string,
  history: ChatMessage[],
  providerId: ProviderId,
  model: string,
  apiKey?: string,
  fsmConfig?: Partial<FSMConfig>,
): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const adapter = getAdapter(providerId, model);

        // Pre-fetch dynamic context
        enqueue('thinking', { status: 'context' });
        const dynamicContext = await buildDynamicSystemContext(message);
        const userConfigCtx = `\n## 用户配置\n- 分析周期: 30天`;

        const ctx = createFSMContext({
          query: message,
          history,
          config: fsmConfig,
          startTimeMs: Date.now(),
        });
        ctx.dynamicContext = userConfigCtx + dynamicContext;

        for await (const event of runAgent(ctx, adapter)) {
          switch (event.type) {
            case 'thinking':
              enqueue('thinking', { status: event.content });
              break;
            case 'tool_call':
              enqueue('tool_call', { tool: event.tool, params: event.params });
              break;
            case 'tool_result':
              if (event.error) {
                enqueue('tool_result', { tool: event.tool, error: event.error });
              } else {
                enqueue('tool_result', { tool: event.tool, result: event.result });
              }
              break;
            case 'token':
              enqueue('token', { content: event.content });
              break;
            case 'confirm_required':
              enqueue('confirm_required', { confirmationCard: event.confirmationCard });
              break;
            case 'done':
              enqueue('done', {
                toolsUsed: event.toolsUsed,
                steps: event.steps,
                durationMs: event.durationMs,
                mode: event.mode,
                tier: event.tier,
                claimsExtracted: event.claimsExtracted,
                passport: event.passport,
              });
              break;
            case 'error':
              enqueue('error', { message: event.message });
              break;
          }
        }
      } catch (err) {
        enqueue('error', { message: (err as Error).message || 'Agent processing failed' });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ─── Non-Stream Handler ──────────────────────────────────────────────────

async function handleNonStream(
  message: string,
  history: ChatMessage[],
  providerId: ProviderId,
  model: string,
  apiKey?: string,
  fsmConfig?: Partial<FSMConfig>,
): Promise<NextResponse> {
  try {
    const adapter = getAdapter(providerId, model);
    const dynamicContext = await buildDynamicSystemContext(message);
    const userConfigCtx = `\n## 用户配置\n- 分析周期: 30天`;

    const ctx = createFSMContext({
      query: message,
      history,
      config: fsmConfig,
      startTimeMs: Date.now(),
    });
    ctx.dynamicContext = userConfigCtx + dynamicContext;

    let fullResponse = '';
    const toolsUsed: string[] = [];
    let steps = 0;
    let durationMs = 0;

    for await (const event of runAgent(ctx, adapter)) {
      if (event.type === 'token' && event.content) {
        fullResponse += event.content;
      }
      if (event.type === 'done') {
        toolsUsed.push(...event.toolsUsed);
        steps = event.steps;
        durationMs = event.durationMs;
      }
      if (event.type === 'error') {
        console.error('[Agent v2] Error:', event.message);
        throw new Error(event.message);
      }
    }

    if (fullResponse.trim()) {
      rememberConversationTurn(message, fullResponse);
      try {
        episodeStore.record({ userQuery: message, agentResponse: fullResponse, toolsUsed });
      } catch { /* non-blocking */ }
    }

    return NextResponse.json({
      success: true,
      data: {
        reply: wrapReply(fullResponse),
        toolsUsed,
        steps,
        durationMs,
        mode: 'fsm-v2',
        intent: ctx.routing?.intent,
        ...(durationMs > 8000 ? {
          hint: '本次查询耗时较长。对于复杂分析，建议使用流式模式（stream: true）实时查看进度。',
        } : {}),
      },
    });
  } catch (err) {
    console.error('[Agent v2] Exception:', err);
    return NextResponse.json({
      success: false,
      error: (err as Error).message || 'Agent processing failed',
    }, { status: 500 });
  }
}

// ─── POST Handler ────────────────────────────────────────────────────────

async function handlePost(request: NextRequest) {
  const raw = await request.text();
  const body = JSON.parse(raw) as Record<string, unknown>;
  const message = (body.message as string)?.trim();
  const stream = body.stream === true;
  const providerId = (body.provider as ProviderId) || 'deepseek';
  const model = (body.model as string) || getDefaultModel(providerId);
  const apiKey = body.apiKey as string | undefined;
  const history = (body.history as ChatMessage[]) || [];
  const currency = (body.currency as string) || 'CNY';
  const timeHorizon = (body.timeHorizon as string) || '30d';

  if (!message) {
    return apiError('请输入消息内容');
  }

  await getAuth();

  // Build history for FSM
  const recentHistory: ChatMessage[] = [
    ...history.slice(-10),
    { role: 'user', content: message },
  ];

  const hasApiKey = !!(apiKey || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

  if (!hasApiKey) {
    return NextResponse.json({
      success: true,
      data: {
        reply: `[T0] 请在设置中配置 API Key 以启用 AI 驱动的供应链分析。支持 DeepSeek V4 Pro / OpenAI / Anthropic。`,
        mode: 'no-api-key',
      },
    });
  }

  const fsmConfig = {
    maxRounds: body.maxRounds as number | undefined,
    maxToolsPerRound: body.maxToolsPerRound as number | undefined,
  };

  if (stream) {
    return handleStream(message, recentHistory, providerId, model, apiKey, fsmConfig);
  }
  return handleNonStream(message, recentHistory, providerId, model, apiKey, fsmConfig);
}

export const POST = withChatRateLimit(withErrorHandler(handlePost as unknown as Parameters<typeof withErrorHandler>[0]));
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no NEW errors (2 pre-existing errors acceptable — chart/renderer.ts + mcp/tools-intelligence.ts)

- [ ] **Step 3: Run full test suite**

Run: `bun run test`
Expected: all existing tests pass (FSM tests + existing 647 tests)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat(agent): rewrite chat route as thin FSM wrapper"
```

---

### Task 9: Fix handleExecute (parallel tool execution)

**Files:**
- Modify: `src/lib/agent/fsm.ts`

- [ ] **Step 1: Fix the generator-yield-inside-Promise issue by executing tools sequentially but collecting all results**

The `handleExecute` in Task 7 has a generator-yield-inside-async-callback issue. Replace with sequential execution that preserves parallel semantics:

```typescript
async function* handleExecute(
  ctx: FSMContext,
  _adapter: ProviderAdapter,
): AsyncGenerator<AgentEvent> {
  yield { type: 'thinking', content: 'executing' };

  const toolCalls: ToolCall[] =
    ((ctx as Record<string, unknown>)._plannedToolCalls as ToolCall[]) || [];

  if (toolCalls.length === 0) {
    return;
  }

  ctx.toolsUsed.push(...toolCalls.map(tc => tc.name));

  // Create all tool execution promises (they run concurrently in the background)
  const pendingResults: Promise<ToolResult>[] = toolCalls.map(async (tc) => {
    const startMs = Date.now();
    try {
      const policyResult = await executeWithPolicy(tc.name, tc.params);
      if (!policyResult.executed) {
        return {
          tool: tc.name,
          success: false,
          error: policyResult.error || 'Tool rejected by policy',
          latencyMs: Date.now() - startMs,
        };
      }
      return {
        tool: tc.name,
        success: true,
        data: policyResult.result,
        latencyMs: Date.now() - startMs,
      };
    } catch (err) {
      return {
        tool: tc.name,
        success: false,
        error: (err as Error).message,
        latencyMs: Date.now() - startMs,
      };
    }
  });

  // Await all results in parallel
  const results = await Promise.all(pendingResults);

  // Emit results (after all collected — avoids generator-in-Promise issue)
  for (const result of results) {
    if (result.success) {
      yield {
        type: 'tool_result',
        tool: result.tool,
        result: typeof result.data === 'string'
          ? (result.data as string).slice(0, 300)
          : JSON.stringify(result.data).slice(0, 300),
      };
    } else {
      yield { type: 'tool_result', tool: result.tool, error: result.error };
    }
  }

  ctx.toolResults.push(...results);
}
```

- [ ] **Step 2: Run FSM tests to verify fix**

Run: `npx vitest run src/lib/agent/fsm.test.ts`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/fsm.ts
git commit -m "fix(agent): fix parallel tool execution in handleExecute"
```

---

### Task 10: Delete Old Code

**Files:**
- Delete: `src/lib/engine/react-agent.ts`
- Delete: `src/lib/services/information-router.ts`
- Update: `src/lib/services/information-router.ts` consumers (check imports)

- [ ] **Step 1: Find all imports of deleted files**

Run: `npx grep -r "react-agent" src/ --include='*.ts' --include='*.tsx' -l`
Run: `npx grep -r "information-router" src/ --include='*.ts' --include='*.tsx' -l`

Expected: chat/route.ts (already rewritten — no longer imports them), possibly test files

- [ ] **Step 2: Remove test files referencing old code**

Run: `find src/ -name '*react-agent*' -o -name '*information-router*' | grep test`

If any test files exist for deleted modules, remove them:
```bash
git rm src/lib/engine/react-agent.test.ts 2>/dev/null || true
git rm src/lib/services/information-router.test.ts 2>/dev/null || true
```

- [ ] **Step 3: Delete the old source files**

```bash
git rm src/lib/engine/react-agent.ts
git rm src/lib/services/information-router.ts
```

- [ ] **Step 4: Verify tsc and tests still pass**

Run: `npx tsc --noEmit`
Expected: no new errors (pre-existing 2 errors acceptable)

Run: `bun run test`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(agent): remove old ReAct agent and keyword router"
```

---

### Task 11: Final Audit

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit 2>&1 | wc -l`
Expected: 2 errors (pre-existing: chart/renderer.ts + mcp/tools-intelligence.ts — NOT from our changes)

- [ ] **Step 2: Full test suite**

Run: `bun run test`
Expected: all tests pass (existing 647 + new FSM/router/adapter tests)

- [ ] **Step 3: Lint check**

Run: `bun run lint`
Expected: no NEW errors/warnings beyond pre-existing baseline

- [ ] **Step 4: Verify git status is clean**

Run: `git status`
Expected: clean working tree

- [ ] **Step 5: Update HANDOVER.md with v2 status**

Append to HANDOVER.md:
```markdown
### 2026-05-21: Agent Engine v2

- Replaced ReAct loop + keyword router with 6-state FSM + LLM semantic routing
- Added Provider Adapter layer (DeepSeek V4 Pro strict mode, OpenAI, Anthropic)
- New files: `src/lib/agent/` (fsm.ts, router.ts, adapter.ts, adapters/)
- Deleted: `react-agent.ts`, `information-router.ts`
- MCP tools, frontend ChatPanel, SSE protocol unchanged
- DeepSeek strict mode: `base_url=https://api.deepseek.com/beta`, auto-injected `"strict": true`
```

- [ ] **Step 6: Final commit**

```bash
git add HANDOVER.md
git commit -m "docs: update HANDOVER with Agent Engine v2 status"
```
