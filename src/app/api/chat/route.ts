/**
 * Universal Chat API Route — Supports DeepSeek, OpenAI, Anthropic, local Ollama.
 * Streaming SSE: POST /api/chat  { message, stream: true, provider, model, apiKey }
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, apiSuccess, apiError } from '@/lib/api-utils';
import { withChatRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { getToolSchemas, executeTool } from '@/lib/mcp/tools';
import { retrieveKnowledge, augmentPrompt } from '@/lib/engine/rag';
import { webSearch, formatSearchContext } from '@/lib/services/web-search.service';
import {
  chatCompletionStream,
  chatCompletion,
  getProvider,
  getDefaultModel,
  type ChatMessage,
} from '@/lib/services/ai-providers.service';

export const dynamic = 'force-dynamic';

// ─── System Prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是"SupplyChain Cortex"的智能供应链决策助手，专门为跨境小家电供应链提供深度分析和决策支持。

你的特性：
- 配备 27 个 MCP 工具可实时查询供应链数据
- 内置联网搜索(web_search) — 可查SCFI运价、LME铜铝钢价格、EU碳价、CPSC召回、关税政策、港口新闻等
- 覆盖成本/库存/销售/物流/供应商/风险/决策全链路
- 上下文窗口大，可以处理复杂多步推理和长篇分析

MCP 工具清单：
【库存】query_inventory (overview/list/forecast/risk/detail/reorder)
【成本】query_cost (overview/list/detail/benchmark/optimization/trend)
【销售】query_sales (overview/daily/forecast)
【物流】query_logistics (list/stats/track/risks) · query_weather (all/summary/marine)
【汇率】query_exchange_rates (latest/history)
【大宗商品】query_commodities — 铜/铝/螺纹钢/PP/LLDPE/PVC 日度价格
【运价】query_scfis — SCFIS欧洲航线期货 → 推算集运运费
【碳价】query_carbon_price — EUA实时碳价 + CBAM成本计算例
【港口】query_port_congestion — 全球10港拥堵状况
【召回】query_cpsc_recalls — 美国CPSC中国产小家电召回
【供应商】query_suppliers (list/performance)
【风险】query_risk · query_cascade_risk (9种场景) · query_decision_graph
【综合】query_dashboard · execute_workflow · query_tariff · run_sandbox
【联网】web_search — 搜索最新公开信息(运价/商品价格/政策/新闻)
【操作】create_reorder · adjust_inventory · create_note · update_shipment_status

分析原则：
1. 先查数据再回答，绝不编造数字
2. 多维度交叉分析（铜价涨→查含铜SKU→算毛利影响→建议锁价）
3. 联网搜索优先用于获取最新外部数据(价格、政策、新闻)
4. 用中文回复，金额用美元/人民币单位，数字保留合理精度
5. 回复末尾可提出后续分析建议`;

// ─── SSE Helpers ────────────────────────────────────────────────────────────────

function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function streamSSE(controller: ReadableStreamDefaultController, event: string, data: unknown): void {
  controller.enqueue(new TextEncoder().encode(formatSSE(event, data)));
}

// ─── Tool Formatting ────────────────────────────────────────────────────────────

function formatToolResult(tool: string, action: string, result: unknown): string {
  if (!result || typeof result !== 'object') return '查询完成，但没有找到相关数据。';
  const data = result as Record<string, unknown>;

  switch (tool) {
    case 'query_inventory': {
      if (action === 'overview') return `📦 库存概览: 总产品${data.totalItems}项, 总库存${data.totalQuantity}, 低库存预警${data.lowStockAlerts}项, 平均周转${data.avgTurnoverDays}天`;
      if (action === 'reorder') { const s = data.summary as Record<string, unknown>; return `📋 补货建议: ${s?.totalRecommendations}项, 紧急${s?.urgentCount}项, 预估成本¥${s?.totalEstimatedCost}`; }
      return `📦 库存查询完成: ${JSON.stringify(data).substring(0, 400)}`;
    }
    case 'query_cost': {
      if (action === 'overview') return `💰 成本概览: ${data.totalProducts}产品, 平均毛利率${data.avgGrossMargin}%`;
      return `💰 成本查询完成: ${JSON.stringify(data).substring(0, 400)}`;
    }
    case 'query_sales': {
      if (action === 'overview') return `📈 销售概览(${data.period}): 总收入¥${data.totalRevenue}`;
      return `📈 销售查询完成: ${JSON.stringify(data).substring(0, 400)}`;
    }
    case 'query_logistics': {
      if (action === 'stats') return `🚢 物流统计: ${data.totalShipments}批, 准时率${data.onTimeDeliveryRate}%, 高风险${data.highRiskCount}批`;
      return `🚢 物流查询完成: ${JSON.stringify(data).substring(0, 400)}`;
    }
    case 'query_dashboard': {
      if (action === 'summary') return `📊 供应链概览: ${data.totalProducts}产品, 收入¥${data.totalRevenue}, 健康评分${data.healthScore}/100`;
      return `📊 仪表盘查询完成`;
    }
    case 'query_risk': {
      if (action === 'dashboard') return `⚠️ 风险评估: 评分${data.overallRisk}/100, 等级${data.riskLevel}`;
      return `⚠️ 风险查询完成`;
    }
    case 'query_suppliers': return `🏭 供应商查询完成: ${JSON.stringify(data).substring(0, 400)}`;
    case 'query_analytics': return `🔬 分析完成: ${JSON.stringify(data).substring(0, 400)}`;
    case 'adjust_inventory': {
      const adj = data.adjustment as Record<string, unknown> | undefined;
      return adj ? `📦 库存调整: ${adj.productName} ${adj.adjustment}件, ${adj.previousQuantity}→${adj.newQuantity}` : `📦 调整完成`;
    }
    case 'create_note': return `📝 备注已创建`;
    case 'query_exchange_rates': {
      if (action === 'latest') {
        const rates = data.rates as Record<string, number> | undefined;
        const trend = data.trend as Record<string, { direction: string; change: number }> | undefined;
        if (rates) {
          const parts = Object.entries(rates).map(([c, r]) => {
            const t = trend?.[c];
            const arrow = t?.direction === 'up' ? '↑' : t?.direction === 'down' ? '↓' : '→';
            return `${c}: ${r} ${arrow}${t?.change || 0}%`;
          });
          return `💱 人民币汇率 (${data.base}): ${parts.join(', ')}`;
        }
      }
      return `💱 汇率查询完成`;
    }
    case 'query_weather': {
      const alerts = data.activeAlerts as Array<{ port: string; type: string; severity: string }> | undefined;
      if (alerts?.length) {
        return `🌤 港口天气预警: ${alerts.map(a => `${a.port}(${a.type}/${a.severity})`).join(', ')}`;
      }
      return `🌤 港口天气: 所有港口海况正常，无恶劣天气预警`;
    }
    default: return `查询完成: ${JSON.stringify(data).substring(0, 400)}`;
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
  const webSearchEnabled = body.webSearch === true;

  if (!message) {
    return apiError('请输入消息内容');
  }

  // Auth check
  await optionalRequireAuth();

  // Build messages array
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-10),
    { role: 'user', content: message },
  ];

  const hasApiKey = !!(apiKey || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

  if (stream) {
    if (hasApiKey) return handleHybridStream(message, history, provider, model, apiKey, webSearchEnabled);
    return handleLocalModeStream(message);
  }
  if (hasApiKey) return handleHybrid(message, history, provider, model, apiKey, webSearchEnabled);
  return handleLocalMode(message);
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
  message: string, history: ChatMessage[], provider: string, model: string, apiKey?: string, webSearchEnabled?: boolean,
): Promise<NextResponse> {
  const { toolResults, toolsUsed } = await executeMatchedTools(message);
  const dataContext = toolResults.map(r => r.result).join('\n\n');
  const ragResults = retrieveKnowledge(message, 2);
  const ragContext = augmentPrompt(message, ragResults);

  // Web search (if enabled)
  let webContext = '';
  if (webSearchEnabled) {
    const searchResult = await webSearch(message);
    if (searchResult.results.length > 0) {
      webContext = `\n\n联网搜索结果 (${searchResult.source}):\n${formatSearchContext(searchResult.results)}`;
    }
  }

  try {
    const summaryMsg: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
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
        reply: llmResult.content,
        toolsUsed,
        dataContext: dataContext.slice(0, 1000),
        mode: 'hybrid',
      },
    });
  } catch {
    // LLM failed — return tool results directly
    return NextResponse.json({
      success: true,
      data: {
        reply: toolResults.map(r => r.result).join('\n\n'),
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
          const searchResult = await webSearch(message);
          if (searchResult.results.length > 0) {
            webContext = `\n\n联网搜索结果 (${searchResult.source}):\n${formatSearchContext(searchResult.results)}`;
            enqueue('tool_call', { tool: 'web_search' });
            enqueue('tool_result', { tool: 'web_search', result: '完成' });
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

        for (let round = 0; round < MAX_ROUNDS; round++) {
          let toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = [];
          let roundContent = '';

          for await (const chunk of chatCompletionStream({
            provider, model, messages: llmMessages, stream: true, apiKey,
            maxTokens: 4000, temperature: 0.7, tools,
          })) {
            if (chunk.type === 'token' && chunk.content) {
              roundContent += chunk.content;
              if (!toolCalls.length) enqueue('token', { content: chunk.content });
            }
            if (chunk.type === 'tool_call' && chunk.toolCall) {
              toolCalls.push({ id: crypto.randomUUID(), function: chunk.toolCall });
            }
            if (chunk.type === 'done') break;
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
            toolsUsed.push(name);
            enqueue('tool_call', { tool: name, params: params.action || Object.keys(params)[0] });

            try {
              const data = await executeTool(name, params);
              const formatted = formatToolResult(name, params.action as string || '', data);
              toolOutputs.push({ role: 'tool', tool_call_id: tc.id, content: formatted.slice(0, 2000) });
              enqueue('tool_result', { tool: name, result: formatted.slice(0, 300) });
            } catch (err) {
              toolOutputs.push({ role: 'tool', tool_call_id: tc.id, content: `错误: ${(err as Error).message}` });
            }
          }

          // Feed tool results back into conversation for next round
          llmMessages.push({
            role: 'assistant', content: roundContent,
            tool_calls: toolCalls.map(tc => ({
              id: tc.id, type: 'function' as const,
              function: { name: tc.function.name, arguments: tc.function.arguments },
            })),
          } as ChatMessage);
          llmMessages.push(...toolOutputs.map(r => ({
            role: r.role, content: r.content, tool_call_id: r.tool_call_id,
          } as ChatMessage)));
        }

        // Max rounds — force final summary
        llmMessages.push({ role: 'user', content: '请基于以上工具调用结果，给出最终综合分析。' });
        for await (const chunk of chatCompletionStream({
          provider, model, messages: llmMessages, stream: true, apiKey,
          maxTokens: 4000, temperature: 0.7,
        })) {
          if (chunk.type === 'token' && chunk.content) enqueue('token', { content: chunk.content });
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

type ToolAction = { tool: string; action: string; params: Record<string, unknown> };

function hasKeyword(text: string, keywords: string[]): boolean {
  return keywords.some(k => text.includes(k));
}

function matchToolsToQuery(query: string): ToolAction[] {
  const q = query.toLowerCase();
  const actions: ToolAction[] = [];

  // Inventory-related
  if (hasKeyword(q, ['库存', '缺货', '补货', '周转', '滞销', '安全库存', 'inventory'])) {
    actions.push({ tool: 'query_inventory', action: 'overview', params: { action: 'overview' } });
    if (hasKeyword(q, ['缺货', '补货', '紧急'])) actions.push({ tool: 'query_inventory', action: 'reorder', params: { action: 'reorder' } });
  }

  // Cost-related
  if (hasKeyword(q, ['成本', '毛利', '费用', '利润', 'margin', 'cost'])) {
    actions.push({ tool: 'query_cost', action: 'overview', params: { action: 'overview' } });
  }

  // Sales-related
  if (hasKeyword(q, ['销售', '收入', '订单', '增长', 'sales'])) {
    actions.push({ tool: 'query_sales', action: 'overview', params: { action: 'overview', days: '7' } });
  }

  // Logistics
  if (hasKeyword(q, ['物流', '货运', '航运', '港口', '延迟', 'delivery', 'ship'])) {
    actions.push({ tool: 'query_logistics', action: 'stats', params: { action: 'stats' } });
  }

  // Risk / Cascade risk
  if (hasKeyword(q, ['风险', 'risk', '中断', '传播', 'cascade'])) {
    actions.push({ tool: 'query_cascade_risk', action: '', params: { scenario: 'auto' } });
  }

  // Suppliers
  if (hasKeyword(q, ['供应商', 'supplier'])) {
    actions.push({ tool: 'query_suppliers', action: 'list', params: { action: 'list' } });
  }

  // Dashboard overview
  if (hasKeyword(q, ['概览', '仪表', 'dashboard', '整体', '健康', '总览'])) {
    actions.push({ tool: 'query_dashboard', action: 'summary', params: { action: 'summary' } });
  }

  // Exchange rates
  if (hasKeyword(q, ['汇率', '人民币', '美元', '欧元', '外汇', 'fx', 'cny', 'usd'])) {
    actions.push({ tool: 'query_exchange_rates', action: 'latest', params: { action: 'latest', base: 'CNY' } });
  }

  // Weather
  if (hasKeyword(q, ['天气', '台风', '海况', 'weather', '气候'])) {
    actions.push({ tool: 'query_weather', action: 'summary', params: { action: 'summary' } });
  }

  // Decision graph
  if (hasKeyword(q, ['决策', '建议', '怎么办', '如何', '怎么', '方案', '优化', '改善'])) {
    actions.push({ tool: 'query_decision_graph', action: '', params: { query } });
  }

  // If nothing matched, give a dashboard + inventory overview
  if (actions.length === 0) {
    actions.push({ tool: 'query_dashboard', action: 'summary', params: { action: 'summary' } });
    actions.push({ tool: 'query_inventory', action: 'overview', params: { action: 'overview' } });
  }

  return actions.slice(0, 4);
}

async function handleLocalMode(message: string): Promise<NextResponse> {
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

function handleLocalModeStream(message: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(formatSSE(event, data)));
      };

      try {
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
