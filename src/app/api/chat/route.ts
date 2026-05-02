/**
 * Universal Chat API Route — Supports DeepSeek, OpenAI, Anthropic, local Ollama.
 * Streaming SSE: POST /api/chat  { message, stream: true, provider, model, apiKey }
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, apiSuccess, apiError } from '@/lib/api-utils';
import { withChatRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { getToolSchemas, executeTool } from '@/lib/mcp/tools';
import {
  chatCompletionStream,
  chatCompletion,
  getProvider,
  getDefaultModel,
  type ChatMessage,
} from '@/lib/services/ai-providers.service';

export const dynamic = 'force-dynamic';

// ─── System Prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是"SupplyChain Cortex"的智能助手。你可以帮助用户查询和分析供应链数据，包括库存、成本、销售、物流、供应商和风险等信息。

你可以使用以下 MCP 工具来获取数据：

1. **query_inventory** - 查询库存状态、库存水平、安全库存 (action: overview/list/forecast/risk/detail/slow_moving/reorder)
2. **query_cost** - 查询成本分解、毛利率、趋势 (action: overview/list/detail/benchmark/optimization/trend)
3. **query_sales** - 查询销售数据、收入、预测 (action: overview/daily/detail/forecast)
4. **query_logistics** - 查询物流货运状态 (action: list/stats/track/risks)
5. **query_suppliers** - 查询供应商信息和评分 (action: list/performance)
6. **query_dashboard** - 查询仪表盘指标 (action: metrics/summary/distribution/sales_trend/alerts)
7. **query_risk** - 查询风险分析 (action: dashboard/matrix/mitigations/simulate)
8. **query_analytics** - 深度分析 (action: supplier_performance/cost_optimization/inventory_forecast/risk_analysis/sales_forecast)
9. **create_reorder** - 创建补货订单 (需要 sku/productName/quantity/warehouse)
10. **adjust_inventory** - 调整库存 (需要 sku/quantity/reason)
11. **create_note** - 创建供应链备注 (需要 content)
12. **query_exchange_rates** - 查询实时人民币汇率（来源：Frankfurter API）(action: latest/history, 可选 base/target/days)
13. **query_weather** - 查询全球港口实时天气和海况（来源：Open-Meteo API）(action: all/summary/marine)
14. **query_cascade_risk** - 供应链级联风险传播分析（核心创新算法）。模拟异常如何沿港口→货运→仓库→产品逐级传播。支持: weather_disruption/port_congestion/exchange_shock/supplier_failure/auto
15. **query_decision_graph** - 决策形式化推理引擎。输出"该怎么做"的结构化行动建议，而非仅展示数据。支持: inventory/cost/logistics/supplier/cross_domain
16. **execute_workflow** - MCP工具编排引擎。自动串联多个工具完成复杂分析(wf-fx-impact/wf-weather-disruption/wf-inventory-health/wf-full-health)

请基于工具返回的真实数据回答，不要编造数据。当用户提出问题时，选择合适的工具查询数据，然后用自然语言总结结果。`;

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
  const body = (await request.json()) as Record<string, unknown>;
  const message = (body.message as string)?.trim();
  const stream = body.stream === true;
  const provider = (body.provider as string) || 'deepseek';
  const model = (body.model as string) || getDefaultModel(provider);
  const apiKey = body.apiKey as string | undefined;
  const history = (body.history as ChatMessage[]) || [];

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

  // Get tool schemas for the AI
  const toolSchemas = getToolSchemas().map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as Record<string, unknown>,
    },
  }));

  // Check if any API key is available (env or frontend-provided)
  const hasApiKey = !!(apiKey || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

  if (stream) {
    if (!hasApiKey) return handleLocalModeStream(message);
    return handleStreaming(messages, toolSchemas, provider, model, apiKey);
  }
  if (!hasApiKey) return handleLocalMode(message);
  return handleNonStreaming(messages, toolSchemas, provider, model, apiKey);
}

// ─── Local Mode (no API key) ─────────────────────────────────────────────────────

type ToolAction = { tool: string; action: string; params: Record<string, unknown> };

function matchToolsToQuery(query: string): ToolAction[] {
  const q = query.toLowerCase();
  const actions: ToolAction[] = [];

  // Inventory-related
  if (/库存|缺货|补货|周转|滞销|安全库存/.test(q)) {
    actions.push({ tool: 'query_inventory', action: 'overview', params: { action: 'overview' } });
    if (/缺货|补货|紧急/.test(q)) actions.push({ tool: 'query_inventory', action: 'reorder', params: { action: 'reorder' } });
  }

  // Cost-related
  if (/成本|毛利|费用|利润|margin|cost/.test(q)) {
    actions.push({ tool: 'query_cost', action: 'overview', params: { action: 'overview' } });
  }

  // Sales-related
  if (/销售|收入|订单|增长/.test(q)) {
    actions.push({ tool: 'query_sales', action: 'overview', params: { action: 'overview', days: '7' } });
  }

  // Logistics
  if (/物流|货运|航运|港口|延迟|delivery/.test(q)) {
    actions.push({ tool: 'query_logistics', action: 'stats', params: { action: 'stats' } });
  }

  // Risk / Cascade risk
  if (/风险|risk|中断|传播/.test(q)) {
    actions.push({ tool: 'query_cascade_risk', action: '', params: { scenario: 'auto' } });
  }

  // Suppliers
  if (/供应商|supplier/.test(q)) {
    actions.push({ tool: 'query_suppliers', action: 'list', params: { action: 'list' } });
  }

  // Dashboard
  if (/概览|仪表|dashboard|整体|健康/.test(q)) {
    actions.push({ tool: 'query_dashboard', action: 'summary', params: { action: 'summary' } });
  }

  // Exchange rates
  if (/汇率|人民币|美元|欧元|外汇|FX/.test(q)) {
    actions.push({ tool: 'query_exchange_rates', action: 'latest', params: { action: 'latest', base: 'CNY' } });
  }

  // Weather
  if (/天气|台风|港口.*气候|海况/.test(q)) {
    actions.push({ tool: 'query_weather', action: 'summary', params: { action: 'summary' } });
  }

  // Decision
  if (/决策|建议|怎么办|如何|怎么|方案/.test(q)) {
    actions.push({ tool: 'query_decision_graph', action: '', params: { query } });
  }

  // If nothing matched, give a dashboard overview
  if (actions.length === 0) {
    actions.push({ tool: 'query_dashboard', action: 'summary', params: { action: 'summary' } });
    actions.push({ tool: 'query_inventory', action: 'overview', params: { action: 'overview' } });
  }

  return actions.slice(0, 4); // Max 4 tools
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
          const execResult = await executeTool(tc.name, tc.arguments);
          toolsUsed.push(tc.name);
          const formatted = formatToolResult(tc.name, tc.arguments?.action as string || '', execResult);
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
