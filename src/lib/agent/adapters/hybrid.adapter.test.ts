/**
 * Hybrid Adapter Tests — complexity-based provider routing, fallback, cost tracking.
 *
 * Uses injectable mock adapters to avoid real API calls.
 * Covers:
 *   - Routing: simple→DeepSeek, medium→DeepSeek, complex→Claude, tool-intensive→GPT-4o
 *   - Fallback: DeepSeek failure → retry → GPT-4o → Claude
 *   - Cost tracking: records per-call, aggregates by provider/complexity
 *   - Complexity assessor: all dimensions (length, tools, keywords, cross-domain)
 *   - Env var gating: HYBRID_PROVIDER_ENABLED
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type {
  ProviderAdapter,
  StreamOpts,
  ToolStreamOpts,
  TokenChunk,
  ToolCallChunk,
  Classification,
} from '../adapter';
import type { ChatMessage } from '@/lib/services/ai-providers.service';
import type { MCPTool } from '@/lib/mcp/tools';
import type { ToolCall } from '../fsm-types';
import { HybridAdapter } from './hybrid.adapter';
import { assessComplexity } from '../complexity-assessor';
import {
  CostTracker,
  calculateCost,
  estimateTokens,
  PROVIDER_PRICING,
} from '../cost-tracker';

// ─── Mock Adapter Factory ──────────────────────────────────────────────────────

interface MockAdapterOpts {
  /** If set, callWithTools throws this error. */
  failCallWithTools?: Error;
  /** If set, streamWithTools yields an error chunk. */
  failStreamWithTools?: boolean;
  /** If set, streamText yields an error chunk. */
  failStreamText?: boolean;
  /** If set, classify throws this error. */
  failClassify?: Error;
  /** Tool calls to return from callWithTools. */
  toolCalls?: ToolCall[];
  /** Content to return from callWithTools / streamText. */
  content?: string;
  /** Track call count. */
  callCount?: { callWithTools: number; classify: number; streamText: number; streamWithTools: number };
}

function createMockAdapter(
  providerId: string,
  opts: MockAdapterOpts = {},
): ProviderAdapter {
  const defaultCallCount = { callWithTools: 0, classify: 0, streamText: 0, streamWithTools: 0 };
  const counter = opts.callCount ?? defaultCallCount;

  return {
    providerId,
    defaultModel: `mock-${providerId}`,

    normalizeMessages(messages: ChatMessage[]): unknown[] {
      return messages.map(m => ({ role: m.role, content: m.content }));
    },

    normalizeTools(tools: MCPTool[]): unknown[] {
      return tools.map(t => ({ name: t.name, description: t.description }));
    },

    async *streamText(_messages: ChatMessage[], _opts: StreamOpts): AsyncGenerator<TokenChunk> {
      counter.streamText++;
      if (opts.failStreamText) {
        yield { type: 'error', error: `${providerId} streamText failed` };
        return;
      }
      const content = opts.content || `response from ${providerId}`;
      yield { type: 'token', content };
      yield { type: 'done' };
    },

    async *streamWithTools(_messages: ChatMessage[], _opts: ToolStreamOpts): AsyncGenerator<ToolCallChunk> {
      counter.streamWithTools++;
      if (opts.failStreamWithTools) {
        yield { type: 'error', error: `${providerId} streamWithTools failed` };
        return;
      }
      const content = opts.content || `tool response from ${providerId}`;
      yield { type: 'token', content };
      for (const tc of opts.toolCalls ?? []) {
        yield { type: 'tool_call', toolCall: { name: tc.name, arguments: JSON.stringify(tc.params) } };
      }
      yield { type: 'done' };
    },

    async callWithTools(_messages: ChatMessage[], _tools: MCPTool[], _opts?: StreamOpts): Promise<{ toolCalls: ToolCall[]; content: string }> {
      counter.callWithTools++;
      if (opts.failCallWithTools) throw opts.failCallWithTools;
      return {
        toolCalls: opts.toolCalls ?? [],
        content: opts.content || `content from ${providerId}`,
      };
    },

    async classify(_query: string, _systemPrompt: string, _opts?: StreamOpts): Promise<Classification> {
      counter.classify++;
      if (opts.failClassify) throw opts.failClassify;
      return {
        intent: 'supply_chain_data',
        confidence: 0.9,
        reason: `classified by ${providerId}`,
      };
    },

    parseToolCalls(_rawContent: string, structured: unknown[]): ToolCall[] {
      return structured as ToolCall[];
    },

    resolveApiKey(): string | undefined { return `mock-key-${providerId}`; },
    resolveModel(): string { return `mock-${providerId}`; },
  };
}

// ─── Test Helpers ──────────────────────────────────────────────────────────────

function makeMessage(content: string, role: ChatMessage['role'] = 'user'): ChatMessage {
  return { role, content };
}

function makeTool(name: string): MCPTool {
  return {
    name,
    description: `Mock tool ${name}`,
    parameters: { type: 'object', properties: {}, required: [] },
    handler: async () => ({}),
  };
}

function makeTools(count: number): MCPTool[] {
  return Array.from({ length: count }, (_, i) => makeTool(`tool_${i}`));
}

// ─── Complexity Assessor Tests ─────────────────────────────────────────────────

describe('Complexity Assessor', () => {
  it('classifies short query with few tools as simple', () => {
    const result = assessComplexity({
      messages: [makeMessage('查一下库存')],
      availableTools: makeTools(1),
    });
    expect(result.level).toBe('simple');
    expect(result.factors.messageLength).toBeLessThan(500);
    expect(result.factors.toolCount).toBe(1);
  });

  it('classifies long query (>500 chars) as medium', () => {
    const longText = '请帮我分析'.repeat(101); // ~505 chars
    const result = assessComplexity({
      messages: [makeMessage(longText)],
      availableTools: makeTools(2),
    });
    expect(result.level).toBe('medium');
    expect(result.factors.messageLength).toBeGreaterThan(500);
  });

  it('classifies very long query (>1500 chars) as complex', () => {
    const veryLongText = '供应链分析'.repeat(400); // ~2000 chars
    const result = assessComplexity({
      messages: [makeMessage(veryLongText)],
      availableTools: makeTools(2),
    });
    expect(result.level).toBe('complex');
    expect(result.factors.messageLength).toBeGreaterThan(1500);
  });

  it('classifies >3 available tools as tool-intensive', () => {
    const result = assessComplexity({
      messages: [makeMessage('查询')],
      availableTools: makeTools(4),
    });
    expect(result.level).toBe('tool-intensive');
    expect(result.factors.toolCount).toBe(4);
  });

  it('detects numeric computation keywords → medium', () => {
    const result = assessComplexity({
      messages: [makeMessage('请计算EOQ')],
      availableTools: makeTools(2),
    });
    expect(result.level).toBe('medium');
    expect(result.factors.hasNumericKeywords).toBe(true);
    expect(result.factors.matchedNumericKeywords).toContain('计算');
  });

  it('detects multi-step reasoning keywords → complex', () => {
    const result = assessComplexity({
      messages: [makeMessage('首先查库存，然后分析成本，接着给出建议')],
      availableTools: makeTools(2),
    });
    expect(result.level).toBe('complex');
    expect(result.factors.hasMultiStepKeywords).toBe(true);
    expect(result.factors.matchedMultiStepKeywords).toContain('首先');
    expect(result.factors.matchedMultiStepKeywords).toContain('然后');
  });

  it('detects cross-domain query (库存+成本+物流) → complex', () => {
    const result = assessComplexity({
      messages: [makeMessage('查询库存和成本以及物流状态')],
      availableTools: makeTools(2),
    });
    expect(result.level).toBe('complex');
    expect(result.factors.hasCrossDomainQuery).toBe(true);
    expect(result.factors.matchedDomains).toContain('inventory');
    expect(result.factors.matchedDomains).toContain('cost');
    expect(result.factors.matchedDomains).toContain('logistics');
    expect(result.factors.matchedDomains.length).toBeGreaterThanOrEqual(2);
  });

  it('tool-intensive takes priority over complex', () => {
    const result = assessComplexity({
      messages: [makeMessage('首先查库存，然后分析成本')],
      availableTools: makeTools(5), // >3 tools
    });
    expect(result.level).toBe('tool-intensive');
  });

  it('complex takes priority over medium', () => {
    const result = assessComplexity({
      messages: [makeMessage('计算成本'.repeat(400))], // long + numeric
      availableTools: makeTools(2),
    });
    expect(result.level).toBe('complex');
  });

  it('uses explicit query override when provided', () => {
    const result = assessComplexity({
      messages: [makeMessage('short')],
      availableTools: makeTools(1),
      query: '首先查库存然后查成本接着做决策',
    });
    expect(result.level).toBe('complex');
    expect(result.factors.hasMultiStepKeywords).toBe(true);
  });
});

// ─── Cost Tracker Tests ────────────────────────────────────────────────────────

describe('Cost Tracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  it('records a single call with correct fields', () => {
    tracker.record({
      provider: 'deepseek',
      inputTokens: 100,
      outputTokens: 50,
      cost: calculateCost('deepseek', 100, 50),
      success: true,
      complexity: 'simple',
    });
    expect(tracker.size).toBe(1);
    const records = tracker.getAll();
    expect(records[0].provider).toBe('deepseek');
    expect(records[0].inputTokens).toBe(100);
    expect(records[0].timestamp).toBeGreaterThan(0);
  });

  it('aggregates summary by provider', () => {
    tracker.record({ provider: 'deepseek', inputTokens: 100, outputTokens: 50, cost: 0.001, success: true, complexity: 'simple' });
    tracker.record({ provider: 'deepseek', inputTokens: 200, outputTokens: 100, cost: 0.002, success: false, complexity: 'medium' });
    tracker.record({ provider: 'openai', inputTokens: 150, outputTokens: 80, cost: 0.005, success: true, complexity: 'complex' });

    const summary = tracker.getSummary();
    expect(summary.totalCalls).toBe(3);
    expect(summary.byProvider.deepseek.calls).toBe(2);
    expect(summary.byProvider.openai.calls).toBe(1);
    expect(summary.byProvider.deepseek.successRate).toBe(0.5);
    expect(summary.byProvider.openai.successRate).toBe(1);
  });

  it('aggregates summary by complexity', () => {
    tracker.record({ provider: 'deepseek', inputTokens: 100, outputTokens: 50, cost: 0.001, success: true, complexity: 'simple' });
    tracker.record({ provider: 'openai', inputTokens: 200, outputTokens: 100, cost: 0.005, success: true, complexity: 'complex' });

    const summary = tracker.getSummary();
    expect(summary.byComplexity.simple?.calls).toBe(1);
    expect(summary.byComplexity.complex?.calls).toBe(1);
  });

  it('filters by time range', () => {
    const now = Date.now();
    tracker.record({ provider: 'deepseek', inputTokens: 10, outputTokens: 5, cost: 0.001, success: true });
    const records = tracker.getByTimeRange(now - 1000, now + 1000);
    expect(records).toHaveLength(1);
  });

  it('generates human-readable report', () => {
    tracker.record({ provider: 'deepseek', inputTokens: 100, outputTokens: 50, cost: 0.001, success: true, complexity: 'simple' });
    tracker.record({ provider: 'openai', inputTokens: 200, outputTokens: 100, cost: 0.005, success: true, complexity: 'complex' });
    const report = tracker.generateReport();
    expect(report).toContain('LLM Cost Report');
    expect(report).toContain('deepseek');
    expect(report).toContain('openai');
    expect(report).toContain('simple');
    expect(report).toContain('complex');
  });

  it('calculates cost correctly per provider pricing', () => {
    const deepseekCost = calculateCost('deepseek', 1000, 500);
    const openaiCost = calculateCost('openai', 1000, 500);
    const anthropicCost = calculateCost('anthropic', 1000, 500);
    // DeepSeek should be cheapest, Claude most expensive
    expect(deepseekCost).toBeLessThan(openaiCost);
    expect(openaiCost).toBeLessThan(anthropicCost);
    // Verify exact values
    expect(deepseekCost).toBeCloseTo(0.001 + 0.001, 5); // 1K input * 0.001 + 0.5K output * 0.002
  });

  it('estimates tokens from text length', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('hello world')).toBeGreaterThan(0);
    // ~2.5 chars per token
    const text = 'a'.repeat(25);
    expect(estimateTokens(text)).toBe(10);
  });

  it('clears all records', () => {
    tracker.record({ provider: 'deepseek', inputTokens: 10, outputTokens: 5, cost: 0.001, success: true });
    expect(tracker.size).toBe(1);
    tracker.clear();
    expect(tracker.size).toBe(0);
  });
});

// ─── Hybrid Adapter Routing Tests ──────────────────────────────────────────────

describe('HybridAdapter Routing', () => {
  let deepseek: ProviderAdapter;
  let openai: ProviderAdapter;
  let anthropic: ProviderAdapter;
  let deepseekCounter: NonNullable<MockAdapterOpts['callCount']>;
  let openaiCounter: NonNullable<MockAdapterOpts['callCount']>;
  let anthropicCounter: NonNullable<MockAdapterOpts['callCount']>;

  beforeEach(() => {
    deepseekCounter = { callWithTools: 0, classify: 0, streamText: 0, streamWithTools: 0 };
    openaiCounter = { callWithTools: 0, classify: 0, streamText: 0, streamWithTools: 0 };
    anthropicCounter = { callWithTools: 0, classify: 0, streamText: 0, streamWithTools: 0 };

    deepseek = createMockAdapter('deepseek', { callCount: deepseekCounter });
    openai = createMockAdapter('openai', { callCount: openaiCounter });
    anthropic = createMockAdapter('anthropic', { callCount: anthropicCounter });
  });

  it('routes simple task to DeepSeek', async () => {
    const adapter = new HybridAdapter({ deepseek, openai, anthropic, enabled: true });
    const messages = [makeMessage('查一下库存')]; // short, 1 tool
    const tools = makeTools(1);

    await adapter.callWithTools(messages, tools);

    expect(deepseekCounter.callWithTools).toBe(1);
    expect(openaiCounter.callWithTools).toBe(0);
    expect(anthropicCounter.callWithTools).toBe(0);
    expect(adapter.lastRouting?.providerId).toBe('deepseek');
    expect(adapter.lastRouting?.complexity).toBe('simple');
  });

  it('routes medium task to DeepSeek (with fallback available)', async () => {
    const adapter = new HybridAdapter({ deepseek, openai, anthropic, enabled: true });
    const longText = '请帮我分析'.repeat(101); // >500 chars
    const messages = [makeMessage(longText)];
    const tools = makeTools(2);

    await adapter.callWithTools(messages, tools);

    expect(deepseekCounter.callWithTools).toBe(1);
    expect(adapter.lastRouting?.complexity).toBe('medium');
  });

  it('routes complex task to Claude (Anthropic)', async () => {
    const adapter = new HybridAdapter({ deepseek, openai, anthropic, enabled: true });
    const messages = [makeMessage('首先查库存，然后分析成本，接着给出建议')]; // multi-step
    const tools = makeTools(2);

    await adapter.callWithTools(messages, tools);

    expect(anthropicCounter.callWithTools).toBe(1);
    expect(deepseekCounter.callWithTools).toBe(0);
    expect(openaiCounter.callWithTools).toBe(0);
    expect(adapter.lastRouting?.providerId).toBe('anthropic');
    expect(adapter.lastRouting?.complexity).toBe('complex');
  });

  it('routes tool-intensive task to GPT-4o (OpenAI)', async () => {
    const adapter = new HybridAdapter({ deepseek, openai, anthropic, enabled: true });
    const messages = [makeMessage('查询')];
    const tools = makeTools(5); // >3 tools

    await adapter.callWithTools(messages, tools);

    expect(openaiCounter.callWithTools).toBe(1);
    expect(deepseekCounter.callWithTools).toBe(0);
    expect(anthropicCounter.callWithTools).toBe(0);
    expect(adapter.lastRouting?.providerId).toBe('openai');
    expect(adapter.lastRouting?.complexity).toBe('tool-intensive');
  });
});

// ─── Hybrid Adapter Fallback Tests ─────────────────────────────────────────────

describe('HybridAdapter Fallback', () => {
  let deepseekCounter: NonNullable<MockAdapterOpts['callCount']>;
  let openaiCounter: NonNullable<MockAdapterOpts['callCount']>;
  let anthropicCounter: NonNullable<MockAdapterOpts['callCount']>;

  beforeEach(() => {
    deepseekCounter = { callWithTools: 0, classify: 0, streamText: 0, streamWithTools: 0 };
    openaiCounter = { callWithTools: 0, classify: 0, streamText: 0, streamWithTools: 0 };
    anthropicCounter = { callWithTools: 0, classify: 0, streamText: 0, streamWithTools: 0 };
  });

  it('upgrades from DeepSeek to GPT-4o on medium task failure (after retry)', async () => {
    const deepseek = createMockAdapter('deepseek', {
      callCount: deepseekCounter,
      failCallWithTools: new Error('DeepSeek API error 500'),
    });
    const openai = createMockAdapter('openai', {
      callCount: openaiCounter,
      content: 'recovered by openai',
    });
    const anthropic = createMockAdapter('anthropic', { callCount: anthropicCounter });

    const adapter = new HybridAdapter({ deepseek, openai, anthropic, enabled: true });
    const longText = '请帮我分析'.repeat(101); // medium complexity
    const messages = [makeMessage(longText)];
    const tools = makeTools(2);

    const result = await adapter.callWithTools(messages, tools);

    // DeepSeek retried once (2 attempts) then upgraded
    expect(deepseekCounter.callWithTools).toBe(2);
    expect(openaiCounter.callWithTools).toBe(1);
    expect(anthropicCounter.callWithTools).toBe(0);
    expect(result.content).toBe('recovered by openai');
  });

  it('upgrades from DeepSeek to GPT-4o on simple task failure', async () => {
    const deepseek = createMockAdapter('deepseek', {
      callCount: deepseekCounter,
      failCallWithTools: new Error('DeepSeek down'),
    });
    const openai = createMockAdapter('openai', {
      callCount: openaiCounter,
      content: 'openai fallback',
    });
    const anthropic = createMockAdapter('anthropic', { callCount: anthropicCounter });

    const adapter = new HybridAdapter({ deepseek, openai, anthropic, enabled: true });
    const messages = [makeMessage('查库存')]; // simple
    const tools = makeTools(1);

    const result = await adapter.callWithTools(messages, tools);

    expect(deepseekCounter.callWithTools).toBe(2); // retried once
    expect(openaiCounter.callWithTools).toBe(1);
    expect(result.content).toBe('openai fallback');
  });

  it('upgrades from GPT-4o to Claude on tool-intensive failure', async () => {
    const deepseek = createMockAdapter('deepseek', { callCount: deepseekCounter });
    const openai = createMockAdapter('openai', {
      callCount: openaiCounter,
      failCallWithTools: new Error('OpenAI rate limit'),
    });
    const anthropic = createMockAdapter('anthropic', {
      callCount: anthropicCounter,
      content: 'claude recovered',
    });

    const adapter = new HybridAdapter({ deepseek, openai, anthropic, enabled: true });
    const messages = [makeMessage('查询')];
    const tools = makeTools(5); // tool-intensive → starts at OpenAI

    const result = await adapter.callWithTools(messages, tools);

    expect(openaiCounter.callWithTools).toBe(1);
    expect(anthropicCounter.callWithTools).toBe(1);
    expect(deepseekCounter.callWithTools).toBe(0);
    expect(result.content).toBe('claude recovered');
  });

  it('does NOT retry DeepSeek when retryDeepseek=false', async () => {
    const deepseek = createMockAdapter('deepseek', {
      callCount: deepseekCounter,
      failCallWithTools: new Error('DeepSeek error'),
    });
    const openai = createMockAdapter('openai', {
      callCount: openaiCounter,
      content: 'openai ok',
    });

    const adapter = new HybridAdapter({
      deepseek, openai, anthropic: createMockAdapter('anthropic'),
      enabled: true, retryDeepseek: false,
    });
    const messages = [makeMessage('查库存')]; // simple
    const tools = makeTools(1);

    await adapter.callWithTools(messages, tools);

    expect(deepseekCounter.callWithTools).toBe(1); // no retry
    expect(openaiCounter.callWithTools).toBe(1);
  });

  it('throws when all providers exhausted', async () => {
    const deepseek = createMockAdapter('deepseek', {
      callCount: deepseekCounter,
      failCallWithTools: new Error('DeepSeek down'),
    });
    const openai = createMockAdapter('openai', {
      callCount: openaiCounter,
      failCallWithTools: new Error('OpenAI down'),
    });
    const anthropic = createMockAdapter('anthropic', {
      callCount: anthropicCounter,
      failCallWithTools: new Error('Anthropic down'),
    });

    const adapter = new HybridAdapter({
      deepseek, openai, anthropic, enabled: true, retryDeepseek: false,
    });
    const messages = [makeMessage('查库存')]; // simple → DeepSeek → OpenAI → (no Claude for simple)
    const tools = makeTools(1);

    await expect(adapter.callWithTools(messages, tools)).rejects.toThrow('All providers exhausted');
  });
});

// ─── Hybrid Adapter Cost Tracking Tests ────────────────────────────────────────

describe('HybridAdapter Cost Tracking', () => {
  it('records cost on successful call', async () => {
    const tracker = new CostTracker();
    const deepseek = createMockAdapter('deepseek', { content: 'response content here' });
    const adapter = new HybridAdapter({
      deepseek,
      openai: createMockAdapter('openai'),
      anthropic: createMockAdapter('anthropic'),
      costTracker: tracker,
      enabled: true,
    });

    await adapter.callWithTools([makeMessage('查库存')], makeTools(1));

    expect(tracker.size).toBe(1);
    const records = tracker.getAll();
    expect(records[0].provider).toBe('deepseek');
    expect(records[0].success).toBe(true);
    expect(records[0].complexity).toBe('simple');
    expect(records[0].cost).toBeGreaterThan(0);
  });

  it('records cost on failed call (after fallback)', async () => {
    const tracker = new CostTracker();
    const deepseek = createMockAdapter('deepseek', {
      failCallWithTools: new Error('fail'),
    });
    const openai = createMockAdapter('openai', { content: 'ok' });
    const adapter = new HybridAdapter({
      deepseek, openai, anthropic: createMockAdapter('anthropic'),
      costTracker: tracker, enabled: true, retryDeepseek: false,
    });

    await adapter.callWithTools([makeMessage('查库存')], makeTools(1));

    // Should have 2 records: failed DeepSeek + successful OpenAI
    expect(tracker.size).toBe(2);
    const records = tracker.getAll();
    expect(records[0].provider).toBe('deepseek');
    expect(records[0].success).toBe(false);
    expect(records[1].provider).toBe('openai');
    expect(records[1].success).toBe(true);
  });

  it('attaches cost tracker after construction', async () => {
    const tracker = new CostTracker();
    const adapter = new HybridAdapter({
      deepseek: createMockAdapter('deepseek'),
      openai: createMockAdapter('openai'),
      anthropic: createMockAdapter('anthropic'),
      enabled: true,
    });

    expect(adapter.getCostTracker()).toBeNull();
    adapter.attachCostTracker(tracker);
    expect(adapter.getCostTracker()).toBe(tracker);

    await adapter.callWithTools([makeMessage('查库存')], makeTools(1));
    expect(tracker.size).toBe(1);
  });
});

// ─── Hybrid Adapter: classify, parseToolCalls, env gating ──────────────────────

describe('HybridAdapter: classify & delegation', () => {
  it('classify uses DeepSeek first (cheapest)', async () => {
    const deepseekCounter = { callWithTools: 0, classify: 0, streamText: 0, streamWithTools: 0 };
    const deepseek = createMockAdapter('deepseek', { callCount: deepseekCounter });
    const adapter = new HybridAdapter({
      deepseek,
      openai: createMockAdapter('openai'),
      anthropic: createMockAdapter('anthropic'),
      enabled: true,
    });

    const result = await adapter.classify('查库存', 'system prompt');

    expect(deepseekCounter.classify).toBe(1);
    expect(result.reason).toBe('classified by deepseek');
  });

  it('classify falls back to OpenAI when DeepSeek fails', async () => {
    const deepseek = createMockAdapter('deepseek', { failClassify: new Error('down') });
    const openaiCounter = { callWithTools: 0, classify: 0, streamText: 0, streamWithTools: 0 };
    const openai = createMockAdapter('openai', { callCount: openaiCounter });
    const adapter = new HybridAdapter({
      deepseek, openai, anthropic: createMockAdapter('anthropic'), enabled: true,
    });

    const result = await adapter.classify('查库存', 'system prompt');

    expect(openaiCounter.classify).toBe(1);
    expect(result.reason).toBe('classified by openai');
  });

  it('parseToolCalls delegates to DeepSeek parser', () => {
    const deepseek = createMockAdapter('deepseek');
    const adapter = new HybridAdapter({
      deepseek, openai: createMockAdapter('openai'), anthropic: createMockAdapter('anthropic'),
      enabled: true,
    });

    const structured = [{ name: 'query_inventory', params: { action: 'overview' } }];
    const result = adapter.parseToolCalls('', structured);
    expect(result).toBe(structured);
  });

  it('normalizeMessages delegates to DeepSeek', () => {
    const deepseek = createMockAdapter('deepseek');
    const adapter = new HybridAdapter({
      deepseek, openai: createMockAdapter('openai'), anthropic: createMockAdapter('anthropic'),
      enabled: true,
    });

    const messages = [makeMessage('test')];
    const result = adapter.normalizeMessages(messages) as Array<{ role: string; content: string }>;
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('test');
  });

  it('exposes lastRouting after callWithTools', async () => {
    const adapter = new HybridAdapter({
      deepseek: createMockAdapter('deepseek'),
      openai: createMockAdapter('openai'),
      anthropic: createMockAdapter('anthropic'),
      enabled: true,
    });

    expect(adapter.lastRouting).toBeNull();

    await adapter.callWithTools([makeMessage('查库存')], makeTools(1));

    expect(adapter.lastRouting).not.toBeNull();
    expect(adapter.lastRouting?.providerId).toBe('deepseek');
    expect(adapter.lastRouting?.complexity).toBe('simple');
    expect(adapter.lastRouting?.reason).toContain('简单任务');
  });
});

// ─── Hybrid Adapter: env var gating ────────────────────────────────────────────

describe('HybridAdapter: environment variable gating', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it('is disabled by default (no env var set)', () => {
    delete process.env.HYBRID_PROVIDER_ENABLED;
    delete process.env.ADAPTER_MODE;
    const adapter = new HybridAdapter({
      deepseek: createMockAdapter('deepseek'),
      openai: createMockAdapter('openai'),
      anthropic: createMockAdapter('anthropic'),
    });
    expect(adapter.isEnabled).toBe(false);
  });

  it('is enabled when HYBRID_PROVIDER_ENABLED=true', () => {
    process.env.HYBRID_PROVIDER_ENABLED = 'true';
    const adapter = new HybridAdapter({
      deepseek: createMockAdapter('deepseek'),
      openai: createMockAdapter('openai'),
      anthropic: createMockAdapter('anthropic'),
    });
    expect(adapter.isEnabled).toBe(true);
  });

  it('is enabled when ADAPTER_MODE=hybrid', () => {
    delete process.env.HYBRID_PROVIDER_ENABLED;
    process.env.ADAPTER_MODE = 'hybrid';
    const adapter = new HybridAdapter({
      deepseek: createMockAdapter('deepseek'),
      openai: createMockAdapter('openai'),
      anthropic: createMockAdapter('anthropic'),
    });
    expect(adapter.isEnabled).toBe(true);
  });

  it('explicit enabled option overrides env var', () => {
    process.env.HYBRID_PROVIDER_ENABLED = 'true';
    const adapter = new HybridAdapter({
      deepseek: createMockAdapter('deepseek'),
      openai: createMockAdapter('openai'),
      anthropic: createMockAdapter('anthropic'),
      enabled: false,
    });
    expect(adapter.isEnabled).toBe(false);
  });
});

// ─── Provider Pricing Model Tests ──────────────────────────────────────────────

describe('Provider Pricing Model', () => {
  it('DeepSeek is cheapest per token', () => {
    const d = PROVIDER_PRICING.deepseek;
    const o = PROVIDER_PRICING.openai;
    const a = PROVIDER_PRICING.anthropic;
    expect(d.input).toBeLessThan(o.input);
    expect(d.output).toBeLessThan(o.output);
    expect(d.input).toBeLessThan(a.input);
    expect(d.output).toBeLessThan(a.output);
  });

  it('Claude is most expensive per token', () => {
    const o = PROVIDER_PRICING.openai;
    const a = PROVIDER_PRICING.anthropic;
    expect(a.input).toBeGreaterThan(o.input);
    expect(a.output).toBeGreaterThan(o.output);
  });

  it('returns 0 cost for unknown provider', () => {
    expect(calculateCost('unknown', 1000, 500)).toBe(0);
  });
});
