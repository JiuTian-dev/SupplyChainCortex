/**
 * Universal Chat API Route — Supports DeepSeek, OpenAI, Anthropic, local Ollama.
 *
 * 2026 upgrade: ReAct agent loop replaces keyword-based tool matching.
 * Uses <tool>/<params> XML protocol for DeepSeek compatibility.
 *
 * Streaming SSE: POST /api/chat  { message, stream: true, provider, model, apiKey }
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, apiSuccess, apiError } from '@/lib/api-utils';
import { withChatRateLimit } from '@/lib/api-protection';
import { getAuth } from '@/lib/auth-helpers';
import { getToolSchemas, executeTool } from '@/lib/mcp/tools';
import { retrieveKnowledge, augmentPrompt } from '@/lib/engine/rag';
import { webSearch, webSearchWithQuality, formatSearchContext } from '@/lib/services/web-search.service';
import type { RoutingDecision } from '@/lib/services/information-router';
import { runReActAgent } from '@/lib/engine/react-agent';
import { buildDynamicSystemContext, rememberConversationTurn } from '@/lib/engine/context-builder';
import { episodeStore } from '@/lib/engine/episode-store';
import { enforceMARC } from '@/lib/services/marc-validator';

/** Apply MARC protocol validation to chat reply, appending audit footer if needed */
function wrapReply(raw: string): string {
  const { text } = enforceMARC(raw);
  return text;
}

import {
  chatCompletionStream,
  chatCompletion,
  getProvider,
  getDefaultModel,
  type ChatMessage,
} from '@/lib/services/ai-providers.service';
import {
  formatSSE,
  formatToolResult,
  isToolCallText,
  extractToolCallsFromText,
  DEFAULT_TOOL_ACTIONS,
  getRoutingDecision,
  matchToolsToQuery,
  type ToolAction,
} from './chat.helpers';
import { SYSTEM_PROMPT } from './chat.prompt';
import { generateReport } from '@/lib/chart/report-generator';

export const dynamic = 'force-dynamic';

// ─── ReAct Agent Stream Handler ──────────────────────────────────────────────────

async function handleReActStream(
  message: string,
  history: ChatMessage[],
  provider: string,
  model: string,
  apiKey?: string,
  webSearchEnabled?: boolean,
  currency = 'CNY',
  timeHorizon = '30d',
  tieredSystemPrompt?: string,
  routing?: RoutingDecision,
): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Build dynamic context from live supply chain state
        enqueue('thinking', { status: 'context' });
        const dynamicContext = await buildDynamicSystemContext(message);
    const currencySymbols: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€' };
    const timeLabels: Record<string, string> = { '7d': '7天', '30d': '30天', '90d': '90天', '6M': '6个月', '1Y': '1年' };
    const userConfigCtx = `\n## 用户偏好\n- 货币: ${currencySymbols[currency] || currency} (${currency})\n- 分析周期: ${timeLabels[timeHorizon] || timeHorizon}`;
    const fullContext = userConfigCtx + dynamicContext;

        enqueue('thinking', { status: 'analyzing' });

        const eventStream = runReActAgent(message, history, fullContext, {
          provider,
          model,
          apiKey,
          enableWebSearch: webSearchEnabled,
          enableRAG: true,
          maxRounds: 8,
          temperature: 0.7,
          maxTokens: 4000,
          tieredSystemPrompt,
        });

        for await (const event of eventStream) {
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
              let claimsExtracted = 0;
              if (event.content) {
                try {
                  claimsExtracted = JSON.parse(event.content).claimsExtracted ?? 0;
                } catch {
                  claimsExtracted = 0;
                }
              }
              enqueue('done', {
                toolsUsed: event.toolsUsed,
                steps: event.steps?.length,
                durationMs: event.durationMs,
                mode: 'react',
                tier: routing?.primaryTier,
                claimsExtracted,
                passport: event.passport,
              });
              break;
            case 'error':
              enqueue('error', { message: event.error });
              break;
          }
        }
      } catch (err) {
        enqueue('error', { message: (err as Error).message || 'ReAct Agent processing failed' });
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

// ─── ReAct Non-Streaming Handler ──────────────────────────────────────────────────

async function handleReActNonStream(
  message: string,
  history: ChatMessage[],
  provider: string,
  model: string,
  apiKey?: string,
  webSearchEnabled?: boolean,
  currency = 'CNY',
  timeHorizon = '30d',
  tieredSystemPrompt?: string,
  routing?: RoutingDecision,
): Promise<NextResponse> {
  let fullResponse = '';
  const toolsUsed: string[] = [];
  const steps: unknown[] = [];
  let durationMs = 0;
  let hadError = false;
  let errorMsg = '';
  let passport: Record<string, unknown> | undefined;

  try {
    const dynamicContext = await buildDynamicSystemContext(message);
    const currencySymbols: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€' };
    const timeLabels: Record<string, string> = { '7d': '7天', '30d': '30天', '90d': '90天', '6M': '6个月', '1Y': '1年' };
    const userConfigCtx = `\n## 用户偏好\n- 货币: ${currencySymbols[currency] || currency} (${currency})\n- 分析周期: ${timeLabels[timeHorizon] || timeHorizon}`;
    const fullContext = userConfigCtx + dynamicContext;

    const eventStream = runReActAgent(message, history, fullContext, {
      provider,
      model,
      apiKey,
      enableWebSearch: webSearchEnabled,
      enableRAG: true,
      maxRounds: 8,
      tieredSystemPrompt,
    });

    for await (const event of eventStream) {
      if (event.type === 'token' && event.content) {
        fullResponse += event.content;
      }
      if (event.type === 'error') {
        hadError = true;
        errorMsg = event.error || 'Unknown ReAct error';
        console.error('[ReAct] Agent error:', errorMsg);
      }
      if (event.type === 'done') {
        if (event.toolsUsed) toolsUsed.push(...event.toolsUsed);
        if (event.steps) steps.push(...event.steps);
        if (event.durationMs) durationMs = event.durationMs;
        if (event.passport) passport = event.passport;
      }
    }

    // If ReAct produced no content (likely API error), fall back to hybrid
    if (!fullResponse.trim() && hadError) {
      console.warn('[ReAct] No content produced, falling back to hybrid mode. Error:', errorMsg);
      return handleHybrid(message, history, provider, model, apiKey, webSearchEnabled, tieredSystemPrompt, routing);
    }

    // Remember this conversation turn for multi-turn context
    if (fullResponse.trim()) {
      rememberConversationTurn(message, fullResponse);

      // Record as episodic memory
      try {
        episodeStore.record({
          userQuery: message,
          agentResponse: fullResponse,
          toolsUsed,
        });
      } catch { /* non-blocking */ }
    }

    return NextResponse.json({
      success: true,
      data: {
        reply: wrapReply(fullResponse),
        toolsUsed,
        steps: steps.length,
        durationMs,
        mode: 'react',
        intent: routing?.intent,
        tier: routing?.primaryTier,
        passport,
        ...(durationMs > 8000 ? {
          hint: '本次查询耗时较长。对于复杂分析（仿真、多维报告），建议使用流式模式（stream: true）实时查看进度。',
        } : {}),
      },
    });
  } catch (err) {
    console.error('[ReAct] Exception, falling back to hybrid:', err);
    return handleHybrid(message, history, provider, model, apiKey, webSearchEnabled, tieredSystemPrompt, routing);
  }
}

// ─── POST Handler ───────────────────────────────────────────────────────────────

async function handlePost(request: NextRequest) {
  // Use raw text + manual parse to avoid UTF-8 corruption in Turbopack
  const raw = await request.text();
  const body = JSON.parse(raw) as Record<string, unknown>;
  const message = (body.message as string)?.trim();
  const stream = body.stream === true;
  const provider = (body.provider as string) || 'deepseek';
  const model = (body.model as string) || getDefaultModel(provider);
  const apiKey = body.apiKey as string | undefined;
  const history = (body.history as ChatMessage[]) || [];
  // Auto-enable web search based on routing decision: Tier 3 enables search, Tier 0/2 skip it
  const routing = getRoutingDecision(message);
  const webSearchEnabled = body.webSearch === false ? false
    : (body.webSearch === true || routing.shouldSearch);
  const currency = (body.currency as string) || 'CNY';
  const timeHorizon = (body.timeHorizon as string) || '30d';

  if (!message) {
    return apiError('请输入消息内容');
  }

  // Optional auth — gets user session if logged in, null otherwise
  await getAuth();

  // Build messages array
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-10),
    { role: 'user', content: message },
  ];

  const hasApiKey = !!(apiKey || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

  // Inject routing decision into system prompt so LLM knows intent and tier
  const verbosityHints: Record<string, string> = {
    chat_greeting: '≤3句话。友好直接。不调用工具。',
    opinion_recommendation: '≤3句话。给观点，不展开分析。不调用工具。',
    general_knowledge: '≤200字。定义+例子。用 [T2-KB] 或 [T0-LLM] 标注。',
    supply_chain_knowledge: '≤300字。核心概念+供应链关联。优先 MCP 工具查数据。',
    supply_chain_data: '≤300字。数据优先。所有数字必须带 [T1-MCP] 标签。',
    news_event: '要点式。每部分3-5条。所有声明带来源标签和置信度。',
  };
  const verbosityHint = verbosityHints[routing.intent] || '要点式回答。';
  const routingContext = `\n## 当前问题路由\n- 意图: ${routing.intent} | 主信息层: Tier${routing.primaryTier} | ${routing.shouldSearch ? '可联网搜索' : '不触发搜索'} | ${routing.shouldUseTools ? 'MCP工具可用' : '不调用工具'}\n- 简洁度要求: ${verbosityHint}\n- 原因: ${routing.reason}`;
  // Pre-generate charts when user asks for visualization (DeepSeek tool-calling unreliable)
  let preGeneratedCharts = '';
  if (/(画出|做图|图表|可视化|柱状|饼图|折线|散点|帕累托|热力图|生成报告|生成.*图)/.test(message)) {
    try {
      const report = await generateReport('full_health');
      preGeneratedCharts = '\n## 已生成的图表（可直接在回复中使用）\n' +
        report.charts.map(c => `![${c.title}](${c.url})`).join('\n') +
        '\n使用以上图片URL嵌入回复，不要编造其他 /charts/ 路径。';
    } catch { /* chart gen failed, let LLM handle without charts */ }
  }
  const tieredSystemPrompt = SYSTEM_PROMPT + routingContext + preGeneratedCharts;

  if (stream) {
    if (hasApiKey) return handleReActStream(message, history, provider, model, apiKey, webSearchEnabled, currency, timeHorizon, tieredSystemPrompt, routing);
    return handleLocalModeStream(message, routing);
  }
  if (hasApiKey) return handleReActNonStream(message, history, provider, model, apiKey, webSearchEnabled, currency, timeHorizon, tieredSystemPrompt, routing);
  return handleLocalMode(message, routing);
}

// ─── Hybrid Mode: keyword matching → tool execution → LLM summarization ──────────

async function executeMatchedTools(message: string): Promise<{
  toolResults: Array<{ tool: string; result: string }>;
  toolsUsed: string[];
}> {
  const actions = matchToolsToQuery(message);
  const toolResults: Array<{ tool: string; result: string }> = [];
  const toolsUsed: string[] = [];

  for (const a of actions) {
    try {
      const data = await executeTool(a.tool, a.params);
      const formatted = formatToolResult(a.tool, a.action, data);
      toolResults.push({ tool: a.tool, result: formatted });
      toolsUsed.push(a.tool);
    } catch (err) {
      toolResults.push({ tool: a.tool, result: `查询失败: ${(err as Error).message}` });
    }
  }

  if (toolResults.length === 0) {
    toolResults.push({ tool: 'query_dashboard', result: '没有匹配到具体查询，请尝试更具体的问题。' });
  }

  return { toolResults, toolsUsed };
}

async function handleHybrid(
  message: string, history: ChatMessage[], provider: string, model: string, apiKey?: string, webSearchEnabled?: boolean, tieredSystemPrompt?: string, routing?: RoutingDecision,
): Promise<NextResponse> {
  // Respect router: Tier 0/2 skip tools and search
  if (routing && (routing.primaryTier === 0 || routing.primaryTier === 2)) {
    return NextResponse.json({
      success: true,
      data: {
        reply: wrapReply(`[T${routing.primaryTier}] ${routing.reason}。该问题适合从模型知识或Wikipedia获取答案，不需要搜索或工具调用。`),
        mode: routing.primaryTier === 0 ? 'tier0-skip' : 'tier2-skip',
        intent: routing.intent,
      },
    });
  }

  const { toolResults, toolsUsed } = await executeMatchedTools(message);
  const dataContext = toolResults.map(r => r.result).join('\n\n');
  const ragResults = retrieveKnowledge(message, 2);
  const ragContext = augmentPrompt(message, ragResults);

  // Web search (if enabled) — quality pipeline: rewrite → multi-source → guard → rerank → cross-validate
  let webContext = '';
  if (webSearchEnabled) {
    const searchResult = await webSearchWithQuality(message, history as any);
    if (searchResult.results.length > 0) {
      webContext = `\n\n联网搜索结果 (${searchResult.source}):\n${formatSearchContext(searchResult.results)}`;
    }
  }

  try {
    const summaryMsg: ChatMessage[] = [
      { role: 'system', content: tieredSystemPrompt || SYSTEM_PROMPT },
      ...history.slice(-6),  // last 3 user-assistant exchanges
      { role: 'user', content: `用户问题: ${message}\n\n实时数据:\n${dataContext}\n${ragContext}${webContext}\n请综合分析。` },
    ];

    const llmResult = await chatCompletion({
      provider, model, messages: summaryMsg, stream: false, apiKey,
      maxTokens: 4000, temperature: 0.7,
    });

    return NextResponse.json({
      success: true,
      data: {
        reply: wrapReply(llmResult.content),
        toolsUsed,
        dataContext: dataContext.slice(0, 1000),
        mode: 'hybrid',
      },
    });
  } catch {
    // LLM failed — return tool results, respecting router
    if (routing && (routing.primaryTier === 0 || routing.primaryTier === 2)) {
      return NextResponse.json({
        success: true,
        data: {
          reply: wrapReply(`[T${routing.primaryTier}] ${routing.reason}。该问题适合从模型知识获取答案。LLM 服务暂不可用。`),
          mode: 'local-fallback-routed',
          intent: routing.intent,
        },
      });
    }
    return NextResponse.json({
      success: true,
      data: {
        reply: wrapReply(toolResults.map(r => r.result).join('\n\n')),
        toolsUsed,
        mode: 'local-fallback',
        note: 'LLM 调用失败，显示原始数据。',
      },
    });
  }
}

function handleHybridStream(
  message: string, history: ChatMessage[], provider: string, model: string, apiKey?: string, webSearchEnabled?: boolean,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(formatSSE(event, data)));
      };

      try {
        enqueue('thinking', { status: 'analyzing' });

        // Build tool definitions for native function calling
        const toolSchemas = getToolSchemas();
        const tools = toolSchemas.map(t => ({
          type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.parameters || { type: 'object', properties: {} } },
        }));

        // RAG + web search context
        const ragResults = retrieveKnowledge(message, 2);
        const ragContext = augmentPrompt(message, ragResults);

        let webContext = '';
        if (webSearchEnabled) {
          const searchResult = await webSearchWithQuality(message, history as any);
          if (searchResult.results.length > 0) {
            webContext = `\n\n联网搜索结果 (${searchResult.source}):\n${formatSearchContext(searchResult.results)}`;
            enqueue('tool_call', { tool: 'web_search' });
            enqueue('tool_result', { tool: 'web_search', result: `从 ${searchResult.source} 获取 ${searchResult.results.length} 条结果 (置信度: ${searchResult.diagnostics?.crossValidation?.confidence || 'unknown'})` });
          }
        }

        // Build LLM messages
        const llmMessages: ChatMessage[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history.slice(-6),
          { role: 'user', content: `${message}\n\n${ragContext}${webContext}` },
        ];

        // Function calling loop — up to 3 rounds (multi-step tool chain)
        const MAX_ROUNDS = 3;
        const toolsUsed: string[] = [];
        let accumulatedContent = '';
        const allToolResults: string[] = [];  // accumulate across rounds for fallback

        for (let round = 0; round < MAX_ROUNDS; round++) {
          let toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = [];
          let roundContent = '';
          let streamedTokens = false;

          for await (const chunk of chatCompletionStream({
            provider, model, messages: llmMessages, stream: true, apiKey,
            maxTokens: 4000, temperature: 0.7, tools,
          })) {
            if (chunk.type === 'token' && chunk.content) {
              roundContent += chunk.content;
              if (!toolCalls.length && !isToolCallText(chunk.content)) {
                streamedTokens = true;
                enqueue('token', { content: chunk.content });
              }
            }
            if (chunk.type === 'tool_call' && chunk.toolCall) {
              toolCalls.push({ id: crypto.randomUUID(), function: chunk.toolCall });
            }
            if (chunk.type === 'done') break;
          }

          // DeepSeek bug: tool calls emitted as plain text instead of tool_calls field
          if (toolCalls.length === 0) {
            const extracted = extractToolCallsFromText(roundContent);
            if (extracted.length > 0) {
              toolCalls = extracted;
              roundContent = '';
              streamedTokens = false;
            }
          }

          // Stream buffered tokens that were held back (real text, not tool calls)
          if (!streamedTokens && toolCalls.length === 0 && roundContent) {
            enqueue('token', { content: roundContent });
          }

          // No tool calls → final answer done
          if (toolCalls.length === 0) {
            accumulatedContent += roundContent;
            enqueue('done', { toolsUsed, rounds: round + 1 });
            controller.close();
            return;
          }

          // Execute tool calls and collect results
          const toolOutputs: Array<{ role: 'tool'; tool_call_id: string; content: string }> = [];
          for (const tc of toolCalls) {
            const name = tc.function.name;
            let params: Record<string, unknown> = {};
            try { params = JSON.parse(tc.function.arguments); } catch { /* use empty */ }
            // Auto-fill action when LLM omits it (common with DeepSeek function calling)
            if (!params.action && DEFAULT_TOOL_ACTIONS[name]) {
              params.action = DEFAULT_TOOL_ACTIONS[name];
            }
            toolsUsed.push(name);
            enqueue('tool_call', { tool: name, params: params.action || Object.keys(params)[0] });

            try {
              const data = await executeTool(name, params);
              const formatted = formatToolResult(name, params.action as string || '', data);
              toolOutputs.push({ role: 'tool', tool_call_id: tc.id, content: formatted.slice(0, 2000) });
              allToolResults.push(formatted);
              enqueue('tool_result', { tool: name, result: formatted.slice(0, 300) });
            } catch (err) {
              toolOutputs.push({ role: 'tool', tool_call_id: tc.id, content: `错误: ${(err as Error).message}` });
              allToolResults.push(`错误: ${(err as Error).message}`);
            }
          }

          // Feed tool results back into conversation for next round
          // Use null content (not empty string) when assistant only called tools — avoids DeepSeek API error
          llmMessages.push({
            role: 'assistant', content: roundContent || null,
            tool_calls: toolCalls.map(tc => ({
              id: tc.id, type: 'function' as const,
              function: { name: tc.function.name, arguments: tc.function.arguments },
            })),
          } as ChatMessage);
          llmMessages.push(...toolOutputs.map(r => ({
            role: r.role, content: r.content, tool_call_id: r.tool_call_id,
          } as ChatMessage)));
        }

        // Max rounds — force final summary (without tools to guarantee text output)
        llmMessages.push({ role: 'user', content: '请基于以上所有工具调用结果，用中文给出综合分析。不要继续调用工具，直接回答。' });
        let forceContent = '';
        for await (const chunk of chatCompletionStream({
          provider, model, messages: llmMessages, stream: true, apiKey,
          maxTokens: 4000, temperature: 0.7,  // no tools — force text-only response
        })) {
          if (chunk.type === 'token' && chunk.content) {
            forceContent += chunk.content;
            enqueue('token', { content: chunk.content });
          }
        }
        // If LLM still returned nothing, generate a basic summary from tool results
        if (!forceContent.trim()) {
          const fallback = allToolResults.join('\n\n');
          enqueue('token', { content: '\n\n基于工具查询结果:\n\n' + fallback });
        }
        enqueue('done', { toolsUsed, rounds: MAX_ROUNDS });

      } catch (err) {
        enqueue('error', { message: (err as Error).message || '处理失败' });
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

// ─── Local Mode (no API key) ─────────────────────────────────────────────────────

async function handleLocalMode(message: string, routing?: RoutingDecision): Promise<NextResponse> {
  // For Tier 0 queries (chat/opinion), skip tools entirely — LLM would handle these
  if (routing && routing.primaryTier === 0) {
    return NextResponse.json({
      success: true,
      data: {
        reply: wrapReply(`[T0-LLM] ${routing.reason}。请在设置中配置 DEEPSEEK_API_KEY 以启用 AI 驱动的自然语言回答。当前问题类型: ${routing.intent}`),
        mode: 'local-tier0',
        intent: routing.intent,
      },
    });
  }

  // For Tier 2 queries (general knowledge), skip tools, suggest Wikipedia
  if (routing && routing.primaryTier === 2) {
    return NextResponse.json({
      success: true,
      data: {
        reply: wrapReply(`[T2-KB] ${routing.reason}。该问题适合从 Wikipedia 或知识库获取答案。请在设置中配置 DEEPSEEK_API_KEY 以启用 AI 驱动的知识回答。当前问题类型: ${routing.intent}`),
        mode: 'local-tier2',
        intent: routing.intent,
      },
    });
  }

  const actions = matchToolsToQuery(message);
  const results: Array<{ tool: string; result: string }> = [];

  for (const a of actions) {
    try {
      const data = await executeTool(a.tool, a.params);
      const formatted = formatToolResult(a.tool, a.action, data);
      results.push({ tool: a.tool, result: formatted });
    } catch (err) {
      results.push({ tool: a.tool, result: `查询失败: ${(err as Error).message}` });
    }
  }

  if (results.length === 0) {
    return NextResponse.json({ success: true, data: { reply: '我没有找到相关的数据。请尝试更具体的问题，例如"当前库存情况"或"最近的销售数据"。' } });
  }

  const reply = results.map(r => r.result).join('\n\n');
  return NextResponse.json({
    success: true,
    data: {
      reply,
      toolsUsed: results.map(r => r.tool),
      mode: 'local',
      note: 'Local mode — no AI provider configured. Set DEEPSEEK_API_KEY for AI-powered responses.',
    },
  });
}

function handleLocalModeStream(message: string, routing?: RoutingDecision): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(formatSSE(event, data)));
      };

      try {
        // Tier 0/2: skip tools, return routing info
        if (routing && (routing.primaryTier === 0 || routing.primaryTier === 2)) {
          const tierLabel = routing.primaryTier === 0 ? 'T0-LLM' : 'T2-KB';
          const msg = `[${tierLabel}] ${routing.reason}。请在设置中配置 DEEPSEEK_API_KEY 以启用 AI 回答。`;
          enqueue('token', { content: msg });
          enqueue('done', { toolsUsed: [], mode: routing.primaryTier === 0 ? 'local-tier0' : 'local-tier2', intent: routing.intent, complete: true });
          controller.close();
          return;
        }

        enqueue('thinking', { status: 'analyzing' });

        const actions = matchToolsToQuery(message);

        const toolResults: string[] = [];
        for (const a of actions) {
          enqueue('tool_call', { tool: a.tool, parameters: a.params });
          try {
            const data = await executeTool(a.tool, a.params);
            const formatted = formatToolResult(a.tool, a.action, data);
            enqueue('tool_result', { tool: a.tool, result: formatted });
            toolResults.push(formatted);
          } catch (err) {
            enqueue('tool_result', { tool: a.tool, error: (err as Error).message });
          }
        }

        if (toolResults.length === 0) {
          const fallback = '我没有找到相关的数据。请尝试更具体的问题，例如"当前库存情况"或"最近的销售数据"。';
          enqueue('token', { content: fallback });
          enqueue('done', { toolsUsed: [], complete: true });
          controller.close();
          return;
        }

        const reply = toolResults.join('\n\n') +
          '\n\n---\n💡 本地模式 — 未配置 AI 提供商。设置 DEEPSEEK_API_KEY 环境变量以启用 AI 驱动的自然语言回答。';

        // Stream the reply word by word to simulate typing
        const words = reply.split(/(\s+)/);
        for (const word of words) {
          enqueue('token', { content: word });
          // Small delay to simulate streaming
          await new Promise(r => setTimeout(r, 15));
        }

        enqueue('done', { toolsUsed: actions.map(a => a.tool), mode: 'local', complete: true });
      } catch (err) {
        enqueue('token', { content: `处理出错: ${(err as Error).message}` });
        enqueue('done', { complete: true, error: (err as Error).message });
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

// ─── Streaming Handler ──────────────────────────────────────────────────────────

function handleStreaming(
  messages: ChatMessage[],
  tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>,
  provider: string,
  model: string,
  apiKey?: string,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(formatSSE(event, data)));
      };

      try {
        // Step 1: Get initial AI response (may include tool calls)
        enqueue('thinking', { status: 'analyzing' });

        let fullContent = '';
        const toolsUsed: string[] = [];

        for await (const chunk of chatCompletionStream({ provider, model, messages: messages as ChatMessage[], stream: true, apiKey, tools })) {
          if (chunk.type === 'error') {
            enqueue('token', { content: chunk.error });
            enqueue('done', { complete: true, error: chunk.error });
            controller.close();
            return;
          }
          if (chunk.type === 'token') {
            fullContent += chunk.content || '';
            enqueue('token', { content: chunk.content });
          }
          if (chunk.type === 'tool_call' && chunk.toolCall) {
            enqueue('tool_call', { tool: chunk.toolCall.name, parameters: {} });

            // Execute the tool
            try {
              const params = JSON.parse(chunk.toolCall.arguments || '{}');
              const result = await executeTool(chunk.toolCall.name, params);
              toolsUsed.push(chunk.toolCall.name);

              const formatted = formatToolResult(chunk.toolCall.name, params.action || '', result);
              enqueue('tool_result', { tool: chunk.toolCall.name, result: formatted });

              // Feed tool result back for follow-up
              messages.push({ role: 'assistant', content: null as unknown as string, tool_calls: [{ type: 'function', function: { name: chunk.toolCall.name, arguments: chunk.toolCall.arguments } }] } as unknown as ChatMessage);
              messages.push({ role: 'tool', content: formatted, tool_call_id: `${chunk.toolCall.name}_0`, name: chunk.toolCall.name });
            } catch (toolErr) {
              enqueue('tool_result', { tool: chunk.toolCall.name, error: (toolErr as Error).message });
            }
          }
          if (chunk.type === 'done') {
            // If tools were called and no text was returned, get a follow-up
            if (toolsUsed.length > 0 && !fullContent.trim()) {
              enqueue('thinking', { status: 'summarizing' });
              for await (const fchunk of chatCompletionStream({ provider, model, messages: messages as ChatMessage[], stream: true, apiKey })) {
                if (fchunk.type === 'token') {
                  fullContent += fchunk.content || '';
                  enqueue('token', { content: fchunk.content });
                }
                if (fchunk.type === 'done') break;
                if (fchunk.type === 'error') {
                  enqueue('token', { content: fchunk.error });
                  break;
                }
              }
            }
            enqueue('done', { toolsUsed, complete: true });
            break;
          }
        }
      } catch (err) {
        enqueue('token', { content: `处理出错: ${(err as Error).message}` });
        enqueue('done', { complete: true, error: (err as Error).message });
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

// ─── Non-Streaming Handler ──────────────────────────────────────────────────────

async function handleNonStreaming(
  messages: ChatMessage[],
  tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>,
  provider: string,
  model: string,
  apiKey?: string,
): Promise<NextResponse> {
  try {
    const result = await chatCompletion({ provider, model, messages: messages as ChatMessage[], stream: false, apiKey, tools });

    // Execute any tool calls
    const toolsUsed: string[] = [];
    const toolResults: Array<{ tool: string; result: string }> = [];

    if (result.toolCalls) {
      for (const tc of result.toolCalls) {
        try {
          const parsed = (typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments) || {};
          const execResult = await executeTool(tc.name, parsed);
          toolsUsed.push(tc.name);
          const formatted = formatToolResult(tc.name, parsed?.action as string || '', execResult);
          toolResults.push({ tool: tc.name, result: formatted });
        } catch (toolErr) {
          toolResults.push({ tool: tc.name, result: `执行失败: ${(toolErr as Error).message}` });
        }
      }
    }

    // If tools were used, get a follow-up summary
    let reply = result.content;
    if (toolsUsed.length > 0) {
      const toolContext = toolResults.map(tr => `${tr.tool}: ${tr.result}`).join('\n');
      messages.push({ role: 'assistant', content: '' });
      messages.push({ role: 'user', content: `基于以下数据回答用户问题:\n${toolContext}` });
      const followUp = await chatCompletion({ provider, model, messages: messages as ChatMessage[], stream: false, apiKey });
      reply = followUp.content || toolResults.map(tr => tr.result).join('\n');
    }

    return apiSuccess({ reply, toolsUsed, model });
  } catch (err) {
    return apiError((err as Error).message || 'AI 服务调用失败，请检查 API Key 和网络连接');
  }
}

// ─── Export ─────────────────────────────────────────────────────────────────────

export const POST = withChatRateLimit(withErrorHandler(handlePost as unknown as Parameters<typeof withErrorHandler>[0]));
