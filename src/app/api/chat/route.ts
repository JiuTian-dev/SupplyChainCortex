/**
 * Universal Chat API Route — Agent Engine v2.
 *
 * Thin HTTP wrapper: parse request → create FSM context → run agent → stream SSE.
 * Provider-agnostic: provider/model from request body selects the adapter.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, apiError } from '@/lib/api-utils';
import { withChatRateLimit } from '@/lib/api-protection';
import { getAuth } from '@/lib/auth-helpers';
import { getDefaultModel, type ChatMessage } from '@/lib/services/ai-providers.service';
import { buildDynamicSystemContext, rememberConversationTurn } from '@/lib/engine/context-builder';
import { episodeStore } from '@/lib/engine/episode-store';
import { jiutianMemory } from '@/lib/engine/memory-adapter';
import { enforceMARC } from '@/lib/services/marc-validator';
import { createFSMContext, runAgent } from '@/lib/agent/fsm';
import { createHarness } from '@/lib/agent/harness';
import { type ProviderId, getAdapter, isFailoverEnabled, getDefaultAdapter } from '@/lib/agent/adapter-factory';
import type { FSMConfig } from '@/lib/agent/fsm-types';

export const dynamic = 'force-dynamic';

function wrapReply(raw: string): string {
  const { text } = enforceMARC(raw);
  return text;
}

// ─── SSE Stream Handler ──────────────────────────────────────────────────

// ─── 工具结果序列化（防止对象/数组导致前端 .slice 崩溃） ────────────────

function serializeToolResult(value: unknown, maxLen = 4000): string {
  if (typeof value === 'string') return value.length > maxLen ? value.slice(0, maxLen) + '…(截断)' : value;
  if (value == null) return '';
  try {
    const str = JSON.stringify(value);
    return str.length > maxLen ? str.slice(0, maxLen) + '…(截断)' : str;
  } catch {
    return String(value).slice(0, maxLen);
  }
}

async function handleStream(
  message: string,
  history: ChatMessage[],
  providerId: ProviderId,
  model: string,
  memoryMode: boolean,
  fsmConfig?: Partial<FSMConfig>,
): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const adapter = isFailoverEnabled() ? getDefaultAdapter(model) : getAdapter(providerId, model);
        enqueue('thinking', { status: 'context' });
        const dynamicContext = await buildDynamicSystemContext(message, memoryMode);
        const userConfigCtx = '\n## 用户配置\n- 分析周期: 30天';

        const ctx = createFSMContext({
          query: message,
          history,
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
                enqueue('tool_result', { tool: event.tool, result: serializeToolResult(event.result) });
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
                mode: isFailoverEnabled() ? 'failover' : event.mode,
                provider: isFailoverEnabled()
                  ? (adapter as import('@/lib/agent/adapters/failover.adapter').FailoverAdapter).lastProvider
                  : providerId,
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
  memoryMode: boolean,
  fsmConfig?: Partial<FSMConfig>,
): Promise<NextResponse> {
  try {
    const adapter = isFailoverEnabled() ? getDefaultAdapter(model) : getAdapter(providerId, model);
    const dynamicContext = await buildDynamicSystemContext(message, memoryMode);
    const userConfigCtx = '\n## 用户配置\n- 分析周期: 30天';

    const ctx = createFSMContext({
      query: message,
      history,
      startTimeMs: Date.now(),
    });
    ctx.dynamicContext = userConfigCtx + dynamicContext;

    let fullResponse = '';
    const toolsUsed: string[] = [];
    let steps = 0;
    let durationMs = 0;
    let routing: unknown;

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
      if (memoryMode) {
        rememberConversationTurn(message, fullResponse);
        try {
          episodeStore.record({ userQuery: message, agentResponse: fullResponse, toolsUsed });
        } catch { /* non-blocking */ }
        // Persistent memory — JiuTian bridge (dual-write, non-blocking)
        jiutianMemory.record(message, fullResponse).catch(() => {});
      }
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

// ─── Harness Stream Handler ─────────────────────────────────────────────

async function handleStreamHarness(
  message: string,
  history: ChatMessage[],
  providerId: ProviderId,
  model: string,
  memoryMode: boolean,
): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      let finalAnswer = '';
      let toolsUsed: string[] = [];

      try {
        const adapter = isFailoverEnabled() ? getDefaultAdapter(model) : getAdapter(providerId, model);
        enqueue('thinking', { status: 'Harness 启动 — 2026 Agent 架构 (Planner → Executor → Evaluator)' });

        const harness = createHarness(adapter, {
          maxIterations: 3,
          enableEvaluator: true,
          skipEvaluatorOnFirstSuccess: true,
          enableSkillRouting: true,
          enableHooks: true,
        });

        await harness.runStream(message, (event) => {
          switch (event.type) {
            case 'iteration-start':
              enqueue('thinking', { status: `第 ${event.iteration + 1} 轮规划中...` });
              break;
            case 'plan':
              for (const tc of event.toolCalls) {
                enqueue('tool_call', { tool: tc.name, params: tc.params });
              }
              break;
            case 'tool-result':
              if (event.success) {
                enqueue('tool_result', { tool: event.toolName, result: serializeToolResult(event.result) });
              } else {
                enqueue('tool_result', { tool: event.toolName, error: event.error });
              }
              break;
            case 'observe':
              enqueue('thinking', { status: event.observation });
              break;
            case 'evaluate':
              enqueue('thinking', {
                status: `评估: ${event.evaluation.overall.toFixed(1)}/10 ${event.evaluation.passed ? '✓ 通过' : '✗ 需调整'}`,
              });
              break;
            case 'adjust':
              enqueue('thinking', { status: event.adjustment });
              break;
            case 'token':
              finalAnswer += event.content;
              enqueue('token', { content: event.content });
              break;
            case 'answer':
              finalAnswer = event.answer;
              break;
            case 'done':
              toolsUsed = event.result.toolCalls.map(tc => tc.name);
              enqueue('done', {
                toolsUsed,
                steps: event.result.iterations.length,
                durationMs: event.result.durationMs,
                mode: 'harness',
                provider: isFailoverEnabled()
                  ? (adapter as import('@/lib/agent/adapters/failover.adapter').FailoverAdapter).lastProvider
                  : providerId,
                tier: 'harness-v1',
                claimsExtracted: 0,
                passport: null,
              });
              break;
            case 'error':
              enqueue('error', { message: event.error });
              break;
          }
        }, history);

        // Memory recording (non-blocking)
        if (memoryMode && finalAnswer.trim()) {
          rememberConversationTurn(message, finalAnswer);
          try {
            episodeStore.record({ userQuery: message, agentResponse: finalAnswer, toolsUsed });
          } catch { /* non-blocking */ }
          jiutianMemory.record(message, finalAnswer).catch(() => {});
        }
      } catch (err) {
        enqueue('error', { message: (err as Error).message || 'Harness processing failed' });
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

// ─── Harness Non-Stream Handler ─────────────────────────────────────────

async function handleNonStreamHarness(
  message: string,
  history: ChatMessage[],
  providerId: ProviderId,
  model: string,
  memoryMode: boolean,
): Promise<NextResponse> {
  try {
    const adapter = isFailoverEnabled() ? getDefaultAdapter(model) : getAdapter(providerId, model);
    const harness = createHarness(adapter, {
      maxIterations: 3,
      enableEvaluator: true,
      skipEvaluatorOnFirstSuccess: true,
      enableSkillRouting: true,
      enableHooks: true,
    });

    const result = await harness.run(message, history);
    const toolsUsed = result.toolCalls.map(tc => tc.name);

    if (result.success && result.answer.trim() && memoryMode) {
      rememberConversationTurn(message, result.answer);
      try {
        episodeStore.record({ userQuery: message, agentResponse: result.answer, toolsUsed });
      } catch { /* non-blocking */ }
      jiutianMemory.record(message, result.answer).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: {
        reply: wrapReply(result.answer),
        toolsUsed,
        steps: result.iterations.length,
        durationMs: result.durationMs,
        mode: 'harness',
        ...(result.durationMs > 8000 ? {
          hint: '本次查询耗时较长。对于复杂分析，建议使用流式模式（stream: true）实时查看进度。',
        } : {}),
      },
    });
  } catch (err) {
    console.error('[Harness] Exception:', err);
    return NextResponse.json({
      success: false,
      error: (err as Error).message || 'Harness processing failed',
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
  const history = (body.history as ChatMessage[]) || [];
  const memoryMode = body.memoryMode !== false; // default true

  if (!message) {
    return apiError('请输入消息内容');
  }

  await getAuth();

  const recentHistory: ChatMessage[] = [
    ...history.slice(-10),
    { role: 'user', content: message },
  ];

  const hasApiKey = !!(process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

  // Runtime selection: 'harness' (default, 2026 Agent 架构) | 'fsm' (legacy)
  const useHarness = process.env.AGENT_RUNTIME !== 'fsm';

  if (!hasApiKey) {
    return NextResponse.json({
      success: true,
      data: {
        reply: '[T0] 请在设置中配置 API Key 以启用 AI 驱动的供应链分析。支持 DeepSeek V4 Pro / OpenAI / Anthropic。',
        mode: 'no-api-key',
      },
    });
  }

  if (stream) {
    if (useHarness) {
      return handleStreamHarness(message, recentHistory, providerId, model, memoryMode);
    }
    return handleStream(message, recentHistory, providerId, model, memoryMode);
  }
  if (useHarness) {
    return handleNonStreamHarness(message, recentHistory, providerId, model, memoryMode);
  }
  return handleNonStream(message, recentHistory, providerId, model, memoryMode);
}

export const POST = withChatRateLimit(withErrorHandler(handlePost as unknown as Parameters<typeof withErrorHandler>[0]));
