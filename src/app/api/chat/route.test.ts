/**
 * Tests for /api/chat route — SSE streaming + non-streaming chat.
 *
 * Covers:
 *  - SSE stream response shape (Response, ReadableStream, headers, Content-Type)
 *  - SSE stream events (thinking, token, done, error)
 *  - Request validation (missing/empty/whitespace message)
 *  - Non-streaming JSON response (success, reply field, memory persistence)
 *  - Error handling (Agent exception → 500)
 *  - No-API-Key fallback mode
 *  - History truncation
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

vi.mock('@/lib/api-protection', () => ({
  withChatRateLimit: (handler: unknown) => handler,
}));

vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return {
    ...actual,
    withErrorHandler: (handler: unknown) => handler,
  };
});

vi.mock('@/lib/auth-helpers', () => ({
  getAuth: vi.fn().mockResolvedValue({ user: { id: 'test-user' } }),
}));

vi.mock('@/lib/services/ai-providers.service', () => ({
  getDefaultModel: vi.fn().mockReturnValue('deepseek-test-model'),
}));

vi.mock('@/lib/engine/context-builder', () => ({
  buildDynamicSystemContext: vi.fn().mockResolvedValue(''),
  rememberConversationTurn: vi.fn(),
}));

vi.mock('@/lib/engine/episode-store', () => ({
  episodeStore: {
    record: vi.fn(),
  },
}));

vi.mock('@/lib/engine/memory-adapter', () => ({
  jiutianMemory: {
    record: vi.fn().mockResolvedValue({ ok: true }),
    retrieve: vi.fn().mockResolvedValue([]),
    health: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('@/lib/services/marc-validator', () => ({
  enforceMARC: vi.fn((text: string) => ({ text, report: { passed: true } })),
}));

vi.mock('@/lib/agent/adapter-factory', () => ({
  getAdapter: vi.fn().mockReturnValue({ id: 'mock-adapter' }),
  getDefaultAdapter: vi.fn().mockReturnValue({ id: 'mock-adapter' }),
  isFailoverEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/agent/fsm', () => ({
  createFSMContext: vi.fn().mockReturnValue({
    query: '',
    history: [],
    config: {},
    round: 0,
    toolResults: [],
    observations: [],
    toolsUsed: [],
    startTimeMs: 0,
    dynamicContext: '',
    routing: { intent: 'test', confidence: 1, shouldUseTools: false, shouldSearch: false },
  }),
  runAgent: vi.fn(),
}));

import { POST } from './route';
import { runAgent, createFSMContext } from '@/lib/agent/fsm';
import { rememberConversationTurn } from '@/lib/engine/context-builder';
import { episodeStore } from '@/lib/engine/episode-store';
import { jiutianMemory } from '@/lib/engine/memory-adapter';

const mockRunAgent = vi.mocked(runAgent);
const mockCreateFSMContext = vi.mocked(createFSMContext);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

/** Default agent events: one token + done. */
function defaultAgentEvents(): AsyncGenerator {
  return (async function* () {
    yield { type: 'token', content: 'Hello' };
    yield { type: 'done', toolsUsed: [], steps: 1, durationMs: 100, mode: 'fsm-v2' };
  })();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('/api/chat route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEEPSEEK_API_KEY = 'test-key';
    process.env.AGENT_RUNTIME = 'fsm'; // 这些测试验证 FSM 路径；Harness 由 tests/reliability/ 覆盖
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    mockRunAgent.mockImplementation(defaultAgentEvents as any);
  });

  // ─── SSE Streaming: Response Shape ──────────────────────────────────────

  it('SSE 流式响应返回 Response 且 Content-Type 为 text/event-stream', async () => {
    const req = makeRequest({ message: '你好', stream: true });
    const response = await POST(req);
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
  });

  it('SSE 流式响应 body 为 ReadableStream', async () => {
    const req = makeRequest({ message: '你好', stream: true });
    const response = await POST(req);
    expect(response.body).toBeInstanceOf(ReadableStream);
  });

  it('SSE 流式响应包含正确的 SSE headers', async () => {
    const req = makeRequest({ message: '你好', stream: true });
    const response = await POST(req);
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('Connection')).toBe('keep-alive');
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');
  });

  // ─── SSE Streaming: Event Content ───────────────────────────────────────

  it('SSE 流中包含 thinking 事件', async () => {
    const req = makeRequest({ message: '你好', stream: true });
    const response = await POST(req);
    const text = await readStream(response.body as ReadableStream<Uint8Array>);
    expect(text).toContain('event: thinking');
  });

  it('SSE 流中包含 token 事件及内容', async () => {
    const req = makeRequest({ message: '你好', stream: true });
    const response = await POST(req);
    const text = await readStream(response.body as ReadableStream<Uint8Array>);
    expect(text).toContain('event: token');
    expect(text).toContain('Hello');
  });

  it('SSE 流中包含 done 事件', async () => {
    const req = makeRequest({ message: '你好', stream: true });
    const response = await POST(req);
    const text = await readStream(response.body as ReadableStream<Uint8Array>);
    expect(text).toContain('event: done');
  });

  it('SSE 流中 Agent 异常时包含 error 事件', async () => {
    mockRunAgent.mockImplementation(async function* () {
      throw new Error('Agent boom');
    } as any);
    const req = makeRequest({ message: '你好', stream: true });
    const response = await POST(req);
    const text = await readStream(response.body as ReadableStream<Uint8Array>);
    expect(text).toContain('event: error');
    expect(text).toContain('Agent boom');
  });

  it('SSE 流中包含 tool_call 与 tool_result 事件', async () => {
    mockRunAgent.mockImplementation((async function* () {
      yield { type: 'thinking', content: 'planning' };
      yield { type: 'tool_call', tool: 'query_inventory', params: { action: 'overview' } };
      yield { type: 'tool_result', tool: 'query_inventory', result: 'ok' };
      yield { type: 'token', content: 'Done' };
      yield { type: 'done', toolsUsed: ['query_inventory'], steps: 2, durationMs: 50, mode: 'fsm-v2' };
    }) as any);
    const req = makeRequest({ message: '查库存', stream: true });
    const response = await POST(req);
    const text = await readStream(response.body as ReadableStream<Uint8Array>);
    expect(text).toContain('event: tool_call');
    expect(text).toContain('query_inventory');
    expect(text).toContain('event: tool_result');
  });

  // ─── Request Validation ─────────────────────────────────────────────────

  it('缺少 message 字段返回错误响应', async () => {
    const req = makeRequest({ stream: true });
    const response = await POST(req);
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBeDefined();
  });

  it('空 message 返回错误响应', async () => {
    const req = makeRequest({ message: '', stream: true });
    const response = await POST(req);
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('纯空格 message 返回错误响应', async () => {
    const req = makeRequest({ message: '   ', stream: true });
    const response = await POST(req);
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  // ─── Non-Streaming JSON Response ────────────────────────────────────────

  it('非流式响应成功返回 JSON', async () => {
    const req = makeRequest({ message: '你好', stream: false });
    const response = await POST(req);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
  });

  it('非流式响应包含 reply 字段', async () => {
    const req = makeRequest({ message: '你好', stream: false });
    const response = await POST(req);
    const json = await response.json();
    expect(json.data.reply).toBeDefined();
    expect(typeof json.data.reply).toBe('string');
    expect(json.data.reply).toContain('Hello');
  });

  it('非流式响应 memoryMode 启用时保存会话历史', async () => {
    const req = makeRequest({ message: '你好', stream: false, memoryMode: true });
    await POST(req);
    expect(rememberConversationTurn).toHaveBeenCalledWith('你好', 'Hello');
    expect(episodeStore.record).toHaveBeenCalled();
    expect(jiutianMemory.record).toHaveBeenCalledWith('你好', 'Hello');
  });

  it('非流式响应 memoryMode 关闭时不保存会话历史', async () => {
    const req = makeRequest({ message: '你好', stream: false, memoryMode: false });
    await POST(req);
    expect(rememberConversationTurn).not.toHaveBeenCalled();
    expect(episodeStore.record).not.toHaveBeenCalled();
    expect(jiutianMemory.record).not.toHaveBeenCalled();
  });

  it('非流式响应 Agent 异常返回 500', async () => {
    mockRunAgent.mockImplementation(async function* () {
      throw new Error('Agent crashed');
    } as any);
    const req = makeRequest({ message: '你好', stream: false });
    const response = await POST(req);
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Agent crashed');
  });

  // ─── No-API-Key Fallback ────────────────────────────────────────────────

  it('无 API Key 时返回提示信息', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const req = makeRequest({ message: '你好', stream: false });
    const response = await POST(req);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.mode).toBe('no-api-key');
    expect(json.data.reply).toBeDefined();
  });

  // ─── History Truncation ─────────────────────────────────────────────────

  it('history 字段被截断到最近 10 条并追加当前消息', async () => {
    const longHistory = Array.from({ length: 15 }, (_, i) => ({
      role: 'user',
      content: `msg-${i}`,
    }));
    const req = makeRequest({ message: '你好', stream: false, history: longHistory });
    await POST(req);
    expect(mockCreateFSMContext).toHaveBeenCalledWith(
      expect.objectContaining({
        history: expect.arrayContaining([
          ...longHistory.slice(-10),
          { role: 'user', content: '你好' },
        ]),
      }),
    );
    const callArg = mockCreateFSMContext.mock.calls[0][0] as { history: unknown[] };
    expect(callArg.history).toHaveLength(11);
  });
});
