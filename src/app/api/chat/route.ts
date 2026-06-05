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
import { type ProviderId, getAdapter } from '@/lib/agent/adapter-factory';
import type { FSMConfig } from '@/lib/agent/fsm-types';

export const dynamic = 'force-dynamic';

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
        const adapter = getAdapter(providerId, model);
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
  memoryMode: boolean,
  fsmConfig?: Partial<FSMConfig>,
): Promise<NextResponse> {
  try {
    const adapter = getAdapter(providerId, model);
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
    return handleStream(message, recentHistory, providerId, model, memoryMode);
  }
  return handleNonStream(message, recentHistory, providerId, model, memoryMode);
}

export const POST = withChatRateLimit(withErrorHandler(handlePost as unknown as Parameters<typeof withErrorHandler>[0]));
