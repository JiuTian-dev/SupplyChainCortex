/**
 * ReAct (Reasoning + Acting) Agent Loop.
 *
 * Replaces keyword-based tool matching with LLM-driven iterative reasoning.
 * DeepSeek-compatible: uses <tool>/<params> XML tags instead of native
 * function calling (avoids DeepSeek's text-emission bug).
 *
 * Architecture:
 *   User query → LLM thinks → emits <tool>...</tool> → execute → observe →
 *   LLM thinks again (up to 5 rounds) → final response with [claim-N] tags
 */

import { executeTool, getToolNames, type MCPTool } from '@/lib/mcp/tools';
import { executeWithPolicy } from '@/lib/engine/autonomy-policy';
import { createPassport, provenanceEntry, computeConfidence } from '@/lib/engine/passport';
import { chatCompletionStream, type ChatMessage } from '@/lib/services/ai-providers.service';
import { retrieveKnowledge, augmentPrompt } from '@/lib/engine/rag';
import { webSearch, formatSearchContext } from '@/lib/services/web-search.service';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface ReActStep {
  round: number;
  thinking: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  toolResult?: string;
  toolError?: string;
}

export interface ReActResult {
  finalResponse: string;
  steps: ReActStep[];
  toolsUsed: string[];
  totalDurationMs: number;
  claimsExtracted: number;
}

export interface ReActOptions {
  provider?: string;
  model?: string;
  apiKey?: string;
  maxRounds?: number;
  temperature?: number;
  maxTokens?: number;
  enableWebSearch?: boolean;
  enableRAG?: boolean;
  serverSide?: boolean;
}

// ─── Tool Registry for Prompt ────────────────────────────────────────────────────

function buildToolRegistryPrompt(): string {
  const toolNames = getToolNames();

  const toolDocs: Record<string, string> = {
    query_inventory: '库存查询 (action: overview/list/reorder/forecast/risk/detail, 可选: sku/warehouse/category)',
    query_cost: '成本查询 (action: overview/list/detail/benchmark/optimization/trend, 可选: sku)',
    query_sales: '销售查询 (action: overview/daily/forecast, 可选: days/platform/sku)',
    query_logistics: '物流查询 (action: list/stats/track/risks, 可选: status)',
    query_suppliers: '供应商查询 (action: list/performance, 可选: region/category)',
    query_dashboard: '仪表盘概览 (action: summary)',
    query_risk: '风险评估 (action: dashboard)',
    query_exchange_rates: '汇率查询 (action: latest/history, 可选: base)',
    query_weather: '港口天气 (action: all/summary/marine)',
    query_tariff: '关税查询 (action: overview/lookup/simulate, 可选: hsCode/country)',
    query_cascade_risk: '级联风险分析 (scenario: auto/weather/tariff/fx/supplier/port/combined)',
    query_decision_graph: '决策图查询 (query: 自然语言描述问题)',
    query_analytics: '数据分析 (action: supplier_performance/inventory_turnover/cost_trend)',
    query_commodities: '大宗商品价格 — 铜/铝/螺纹钢/PP/LLDPE/PVC 日度价格',
    query_scfis: 'SCFIS欧洲航线期货运价 → 推算集运运费',
    query_carbon_price: 'EUA实时碳价 + CBAM成本计算例',
    query_cpsc_recalls: '美国CPSC中国产小家电召回',
    query_port_congestion: '全球10港拥堵状况',
    query_financial_index: '金融指数 — QQQ/SPY/SMH/^IXIC',
    query_amazon_competitors: '亚马逊竞品数据(免费) — 品类价格趋势/竞品价格区间/单品查询',
    query_brand_sentiment: '品牌舆情监控(免费) — Reddit/Twitter/论坛的提及/情感分析/风险信号',
    query_compliance_check: '产品合规检查 — 输入产品+市场→所需认证清单+费用+时间线(US/EU/UK/JP)',
    query_financial_sim: '财务模拟器 — 输入采购价/售价/销量→到岸成本/P&L/盈亏平衡/关税情景',
    query_product_feed: 'AI代理商品Feed — 生成schema.org结构化商品数据供AI购物代理发现',
    query_arbitrage: '跨平台套利引擎 — 输入产品→1688采购价+Amazon售价+关税+合规=完整套利决策',
    query_coherence_audit: '决策一致性审计(独家) — 扫描HS编码/关税/安全库存/认证的跨系统矛盾',
    query_recall_risk: '召回风险预警 — 基于CPSC模式匹配，分析你的SKU离被召回有多远',
    query_supplier_discovery: 'AI供应商发现 — 搜索1688/Alibaba，按价格/交期/认证评分+生成询盘模板',
    execute_workflow: '执行工作流 (action: wf-full-health/wf-cost-audit/wf-risk-scan)',
    run_sandbox: '运行供应链仿真 (scenario: baseline/trade_war/typhoon_season/perfect_storm)',
    web_search: '联网搜索最新公开信息 (query: 英文关键词)',
    create_reorder: '创建补货订单 (sku/productName/quantity/warehouse/priority)',
    adjust_inventory: '调整库存 (sku/warehouse/adjustment/reason)',
    create_note: '创建备注 (sku/content/category/priority)',
    update_shipment_status: '更新货运状态 (trackingNumber/status/notes)',
  };

  const lines = ['## 可用工具'];
  for (const name of toolNames) {
    const doc = toolDocs[name];
    if (doc) lines.push(`- **${name}**: ${doc}`);
  }
  return lines.join('\n');
}

// ─── System Prompt Builder ───────────────────────────────────────────────────────

function buildReActSystemPrompt(context?: string): string {
  return `你是 SupplyChain Cortex 的智能供应链决策助手，专门为跨境小家电供应链提供深度分析和决策支持。

## 核心原则

1. **先查数据再回答** — 绝不编造数字。任何关于库存、成本、物流、汇率的陈述必须有工具查询结果支撑。
2. **多维度交叉分析** — 铜价涨→查含铜SKU→算毛利影响→建议锁价。不要孤立看数据。每个结论至少交叉2个数据源。
3. **每条结论标注来源+日期** — 使用 [claim-N] 格式标记，注明数据来源**和信息的发布日期**。搜索结果的日期决定其可信度。
4. **联网搜索用英文** — web_search 必须用英文关键词。首次搜索后，如数据不足，换个角度再搜一轮。
5. **中文回复** — 金额用美元/人民币，数字保留合理精度。

## ⚠️ 时效性检查（每次必须执行）

1. 对于联网搜索结果: 检查每条的发布日期。超过7天的标记"[最新]"，超过90天的标记"⚠️过时"且不作为主要依据。
2. 对于系统数据: query_* 返回的是实时数据，置信度为高。搜索结果中的数字如与系统数据冲突，以系统数据为准。
3. **绝对禁止** 使用过时的关税/政策数字。关税税率必须先查 query_tariff 获取当前适用税率。不同HS编码的税率不同——家电行业(HS 8509等)的关税和钢铁/半导体完全不同。
4. 对于新闻事件类信息: 构建时间线。先搜"最新进展"，再搜"背景"。区分"正在发生"、"已停火"、"已解除"。

## 推理流程

对于复杂问题（涉及多个领域或需要外部信息）：
1. **第一轮**: 并行调用系统工具获取实时数据（库存/成本/物流/风险）+ 联网搜索最新事件
2. **第二轮**: 根据第一轮发现，深入查询具体SKU/HS编码/历史对比
3. **第三轮**: 交叉分析，发现矛盾或缺口，补充查询
4. **最终轮**: 给出结论。如果数据足够，不要无意义地继续调工具。

对于简单问题（单一领域，不需要外部信息）：直接1-2轮完成。

## 输出规划（写报告前先规划结构）

对于需要生成完整报告的问题，先在心里规划报告结构：
- 如果需要历史对比 → 查询去年同期/上月数据做对比
- 如果需要关税分析 → 先用 query_tariff 查具体HS编码的适用税率
- 如果需要财务影响 → 先查具体SKU的成本和毛利
- 规划好后再逐段输出，最后给出带优先级的建议

## 工具调用协议

<tool>工具名称</tool>
<params>{"key": "value"}</params>

一次可并行调用多个工具，依次写出即可。系统会执行所有工具后返回结果。

${buildToolRegistryPrompt()}

${context || ''}

## 输出格式

最终报告使用以下结构：

## 分析
### 一、[背景/事件概述]
[claim-1] 事实陈述。数据源: tool_name。📅 日期。置信度: 高/中/低
[claim-2] ...

### 二、[对供应链的传导路径]
每条路径标注直接影响和间接影响

### 三、[情景推演]（如适用）
乐观/基准/悲观三种情景

## 结论
综合判断，突出核心矛盾

## 建议
按优先级排列: 🔴紧急 / 🟡短期 / 🟢中期
每条建议标注参考的系统策略（如有）`;
}

// ─── Tool Call Parser ────────────────────────────────────────────────────────────

interface ParsedToolCall {
  name: string;
  params: Record<string, unknown>;
}

export function parseToolCalls(text: string): ParsedToolCall[] {
  const results: ParsedToolCall[] = [];
  const regex = /<tool>\s*([\w_]+)\s*<\/tool>\s*<params>\s*(\{[\s\S]*?\})\s*<\/params>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const params = JSON.parse(match[2]);
      results.push({ name: match[1], params });
    } catch {
      // Skip malformed params
    }
  }
  return results;
}

function stripToolCalls(text: string): string {
  return text.replace(/<tool>[\s\S]*?<\/tool>\s*<params>[\s\S]*?<\/params>/g, '').trim();
}

// ─── Default Tool Actions ─────────────────────────────────────────────────────────

const DEFAULT_TOOL_ACTIONS: Record<string, string> = {
  query_inventory: 'overview',
  query_cost: 'overview',
  query_sales: 'overview',
  query_logistics: 'stats',
  query_suppliers: 'list',
  query_dashboard: 'summary',
  query_risk: 'dashboard',
  query_exchange_rates: 'latest',
  query_weather: 'summary',
  query_analytics: 'supplier_performance',
  query_tariff: 'overview',
  query_cascade_risk: 'auto',
  query_decision_graph: 'cross_domain',
  execute_workflow: 'wf-full-health',
};

function formatToolResult(tool: string, action: string, result: unknown): string {
  if (!result || typeof result !== 'object') return '查询完成，但没有找到相关数据。';
  const data = result as Record<string, unknown>;

  switch (tool) {
    case 'query_inventory': {
      if (action === 'overview') return `库存概览: 总产品${data.totalItems}项, 总库存${data.totalQuantity}, 低库存预警${data.lowStockAlerts}项, 平均周转${data.avgTurnoverDays}天`;
      if (action === 'reorder') { const s = data.summary as Record<string, unknown>; return `补货建议: ${s?.totalRecommendations}项, 紧急${s?.urgentCount}项, 预估成本¥${s?.totalEstimatedCost}`; }
      return `库存查询: ${JSON.stringify(data).substring(0, 500)}`;
    }
    case 'query_cost': {
      if (action === 'overview') return `成本概览: ${data.totalProducts}产品, 平均毛利率${data.avgGrossMargin}%`;
      if (action === 'detail') return `成本明细: ${JSON.stringify(data).substring(0, 600)}`;
      return `成本查询: ${JSON.stringify(data).substring(0, 500)}`;
    }
    case 'query_sales': {
      if (action === 'overview') return `销售概览(${data.period}): 总收入¥${data.totalRevenue}`;
      return `销售查询: ${JSON.stringify(data).substring(0, 500)}`;
    }
    case 'query_logistics': {
      if (action === 'stats') return `物流统计: ${data.totalShipments}批, 准时率${data.onTimeDeliveryRate}%, 高风险${data.highRiskCount}批`;
      return `物流查询: ${JSON.stringify(data).substring(0, 500)}`;
    }
    case 'query_dashboard': return `供应链概览: ${data.totalProducts}产品, 收入¥${data.totalRevenue}, 健康评分${data.healthScore}/100`;
    case 'query_risk': return `风险评估: 评分${data.overallRisk}/100, 等级${data.riskLevel}`;
    case 'query_suppliers': return `供应商: ${JSON.stringify(data).substring(0, 500)}`;
    case 'query_exchange_rates': {
      const rates = data.rates as Record<string, number> | undefined;
      if (rates) {
        const parts = Object.entries(rates).map(([c, r]) => `${c}: ${r}`);
        return `汇率 (${data.base}): ${parts.join(', ')}`;
      }
      return `汇率查询完成`;
    }
    case 'query_weather': {
      const alerts = data.activeAlerts as Array<{ port: string; type: string; severity: string }> | undefined;
      if (alerts?.length) return `港口天气预警: ${alerts.map(a => `${a.port}(${a.type}/${a.severity})`).join(', ')}`;
      return '港口天气: 所有港口海况正常';
    }
    case 'web_search': {
      const ctx = data.formattedContext as string | undefined;
      return `联网搜索结果 (${data.source}):\n${ctx || JSON.stringify(data.results).substring(0, 1000)}`;
    }
    case 'query_commodities': return `大宗商品: ${(data.summary as string) || `共${data.count}种商品`}`;
    case 'query_scfis': return `SCFIS运价: ${data.index}点, 约$${data.estimatedFreightUSD}/FEU, ${data.route}`;
    case 'query_carbon_price': return `EU碳价: €${data.euaPrice}/t CO2`;
    case 'query_cpsc_recalls': return `CPSC召回(${data.totalRecalls}条): ${(data.riskSummary as string) || ''}`;
    case 'query_port_congestion': return `港口拥堵: 全球${data.globalLevel}级`;
    case 'query_financial_index': return `金融指数: ${(data.summary as string) || JSON.stringify(data.indices)}`;
    case 'adjust_inventory': {
      const adj = data.adjustment as Record<string, unknown> | undefined;
      return adj ? `库存调整: ${adj.productName} ${adj.adjustment}件, ${adj.previousQuantity}→${adj.newQuantity}` : '调整完成';
    }
    case 'create_note': return '备注已创建';
    case 'create_reorder': return `补货订单: ${JSON.stringify(data).substring(0, 400)}`;
    case 'update_shipment_status': return `货运状态已更新`;
    case 'query_tariff': return `关税: ${JSON.stringify(data).substring(0, 500)}`;
    case 'query_cascade_risk': return `级联风险: ${JSON.stringify(data).substring(0, 500)}`;
    case 'query_decision_graph': return `决策图: ${JSON.stringify(data).substring(0, 500)}`;
    case 'execute_workflow': return `工作流: ${JSON.stringify(data).substring(0, 500)}`;
    case 'run_sandbox': return `仿真结果: ${JSON.stringify(data).substring(0, 500)}`;
    default: return `查询完成: ${JSON.stringify(data).substring(0, 800)}`;
  }
}

// ─── Main ReAct Runner ────────────────────────────────────────────────────────────

export async function* runReActAgent(
  query: string,
  history: ChatMessage[],
  dynamicContext: string,
  options: ReActOptions = {},
): AsyncGenerator<{
  type: 'thinking' | 'tool_call' | 'tool_result' | 'token' | 'done' | 'error' | 'confirm_required';
  content?: string;
  tool?: string;
  params?: Record<string, unknown>;
  result?: string;
  error?: string;
  steps?: ReActStep[];
  toolsUsed?: string[];
  durationMs?: number;
  passport?: Record<string, unknown>;
  confirmationCard?: Record<string, unknown>;
}> {
  const startTime = Date.now();
  const provider = options.provider || 'deepseek';
  const model = options.model || 'deepseek-chat';
  const maxRounds = options.maxRounds || 5;
  const steps: ReActStep[] = [];
  const toolsUsed: string[] = [];

  // Build initial context
  let ragContext = '';
  if (options.enableRAG !== false) {
    const ragResults = retrieveKnowledge(query, 3);
    ragContext = augmentPrompt(query, ragResults);
  }

  let webContext = '';
  if (options.enableWebSearch) {
    try {
      const searchResult = await webSearch(query);
      if (searchResult.results.length > 0) {
        webContext = `\n\n联网搜索结果 (${searchResult.source}):\n${formatSearchContext(searchResult.results)}`;
      }
    } catch { /* web search is best-effort */ }
  }

  const systemPrompt = buildReActSystemPrompt(dynamicContext);

  // Build message list
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6),
  ];

  const initialUserMsg = `${query}\n\n${ragContext}${webContext}`;
  messages.push({ role: 'user', content: initialUserMsg });

  yield { type: 'thinking', content: 'analyzing' };

  // ── ReAct Loop ──────────────────────────────────────────────────────────────
  for (let round = 0; round < maxRounds; round++) {
    const step: ReActStep = { round: round + 1, thinking: '' };
    let roundContent = '';

    // Stream LLM response
    for await (const chunk of chatCompletionStream({
      provider, model, messages, stream: true,
      apiKey: options.apiKey,
      maxTokens: options.maxTokens || 6000,
      temperature: options.temperature || 0.7,
    })) {
      if (chunk.type === 'token' && chunk.content) {
        roundContent += chunk.content;
      }
      if (chunk.type === 'error') {
        console.error(`[ReAct] LLM error in round ${round + 1}:`, chunk.error);
        yield { type: 'error', error: chunk.error };
        return;
      }
      if (chunk.type === 'done') break;
    }

    // If LLM returned empty content, treat as error
    if (!roundContent.trim()) {
      console.error(`[ReAct] Round ${round + 1}: LLM returned empty content`);
      yield { type: 'error', error: `LLM returned empty response in round ${round + 1}` };
      return;
    }

    step.thinking = roundContent;

    // Parse tool calls
    const toolCalls = parseToolCalls(roundContent);

    if (toolCalls.length === 0) {
      // No tools — this is the final response
      const cleanResponse = stripToolCalls(roundContent);
      const claimsExtracted = (cleanResponse.match(/\[claim-\d+\]/g) || []).length;

      // Build decision passport
      const passport = createPassport({
        engine: 'decision-graph',
        input: { query, historyRounds: history.length / 2 },
        confidence: 0.75,
        alternatives: [],
        provenance: [
          provenanceEntry('llm:deepseek', Date.now() - startTime, 'ok'),
          provenanceEntry('rag:knowledge-base', 0, 'ok'),
          ...toolsUsed.map(t => provenanceEntry(`mcp:${t}`, 0, 'ok')),
        ],
        trace: {
          totalDurationMs: Date.now() - startTime,
          steps: steps.map(s => ({
            name: `round-${s.round}`,
            durationMs: 0,
            status: s.toolError ? 'error' : 'ok',
          })),
        },
      });

      // Stream the cleaned response
      for (let i = 0; i < cleanResponse.length; i += 3) {
        yield { type: 'token', content: cleanResponse.slice(i, i + 3) };
        await new Promise(r => setTimeout(r, 5));
      }

      steps.push(step);
      yield {
        type: 'done',
        steps,
        toolsUsed,
        durationMs: Date.now() - startTime,
        passport: {
          auditId: passport.auditId,
          generatedAt: passport.generatedAt,
          confidence: passport.confidence,
          dataProvenance: passport.dataProvenance.map(p => ({ source: p.source, status: p.status })),
          alternatives: passport.alternatives.slice(0, 3),
          warnings: passport.warnings,
        },
        content: JSON.stringify({ claimsExtracted }),
      };
      return;
    }

    // Execute tool calls in parallel (independent calls don't depend on each other)
    const toolOutputTexts: string[] = [];
    const pendingConfirmations: Array<Record<string, unknown>> = [];

    // Auto-fill actions before execution
    for (const tc of toolCalls) {
      if (!tc.params.action && DEFAULT_TOOL_ACTIONS[tc.name]) {
        tc.params.action = DEFAULT_TOOL_ACTIONS[tc.name];
      }
      toolsUsed.push(tc.name);
    }

    // Emit all tool_call events upfront
    for (const tc of toolCalls) {
      yield { type: 'tool_call', tool: tc.name, params: tc.params };
    }

    // Execute all tool calls in parallel
    const executions = await Promise.all(
      toolCalls.map(async (tc) => {
        const policyResult = await executeWithPolicy(tc.name, tc.params);
        return { tc, policyResult };
      })
    );

    // Process results in original order
    for (const { tc, policyResult } of executions) {
      if (policyResult.needsConfirmation && policyResult.confirmationCard) {
        step.toolResult = `⏳ 等待确认: ${policyResult.confirmationCard.title}`;
        toolOutputTexts.push(`[${tc.name} 等待确认]\n${policyResult.confirmationCard.description}`);
        pendingConfirmations.push(policyResult.confirmationCard);
        yield { type: 'confirm_required', confirmationCard: policyResult.confirmationCard };
        yield { type: 'tool_result', tool: tc.name, result: '⏳ 此操作需要人工确认' };
      } else if (policyResult.executed) {
        try {
          const formatted = formatToolResult(tc.name, tc.params.action as string || '', policyResult.result);
          toolOutputTexts.push(`[${tc.name} 结果]\n${formatted.slice(0, 2000)}`);
          yield { type: 'tool_result', tool: tc.name, result: formatted.slice(0, 300) };
        } catch (err) {
          toolOutputTexts.push(`[${tc.name} 错误]\n${(err as Error).message}`);
          yield { type: 'tool_result', tool: tc.name, error: (err as Error).message };
        }
      } else {
        toolOutputTexts.push(`[${tc.name} 被拒绝]\n${policyResult.error}`);
        yield { type: 'tool_result', tool: tc.name, error: policyResult.error };
      }
    }

    steps.push(step);

    // If there are pending confirmations, tell the agent to wait
    if (pendingConfirmations.length > 0) {
      messages.push({ role: 'assistant', content: roundContent });
      messages.push({
        role: 'user',
        content: `以下操作需要人工确认:\n${pendingConfirmations.map(c => `- ${c.title}: ${c.description}`).join('\n')}\n\n请先基于已获取的只读数据给出分析。确认操作将在用户批准后执行。`,
      });

      // Force a final response since we can't proceed with unconfirmed writes
      messages.push({
        role: 'user',
        content: '请基于已获取的只读数据给出综合分析、结论和建议。需要人工确认的操作已标记，用户在确认后将自动执行。',
      });

      let finalContent = '';
      for await (const chunk of chatCompletionStream({
        provider, model, messages, stream: true,
        apiKey: options.apiKey,
        maxTokens: options.maxTokens || 6000,
        temperature: options.temperature || 0.7,
      })) {
        if (chunk.type === 'token' && chunk.content) {
          finalContent += chunk.content;
        }
        if (chunk.type === 'error') {
          yield { type: 'error', error: chunk.error };
          return;
        }
        if (chunk.type === 'done') break;
      }

      const cleanResponse = stripToolCalls(finalContent);
      for (let i = 0; i < cleanResponse.length; i += 3) {
        yield { type: 'token', content: cleanResponse.slice(i, i + 3) };
        await new Promise(r => setTimeout(r, 5));
      }

      const claimsExtracted = (cleanResponse.match(/\[claim-\d+\]/g) || []).length;
      yield {
        type: 'done',
        steps,
        toolsUsed,
        durationMs: Date.now() - startTime,
        content: JSON.stringify({ claimsExtracted, pendingConfirmations: pendingConfirmations.length }),
      };
      return;
    }

    // Feed tool results back as user message (ReAct XML protocol, not native function calling)
    messages.push({ role: 'assistant', content: roundContent });
    messages.push({
      role: 'user',
      content: `工具执行结果:\n\n${toolOutputTexts.join('\n\n')}\n\n请基于以上数据继续分析。如果数据足够，直接给出结论和建议。如果还需要更多数据，继续使用 <tool>/<params> 调用工具。`,
    });
  }

  // Max rounds reached — force final response
  messages.push({
    role: 'user',
    content: '已达到最大查询轮次。请基于已获取的所有数据，给出最终综合分析、结论和建议。使用 [claim-N] 格式标注每条结论的数据来源。不要继续调用工具。',
  });

  let finalContent = '';
  for await (const chunk of chatCompletionStream({
    provider, model, messages, stream: true,
    apiKey: options.apiKey,
    maxTokens: options.maxTokens || 4000,
    temperature: options.temperature || 0.7,
  })) {
    if (chunk.type === 'token' && chunk.content) {
      finalContent += chunk.content;
      yield { type: 'token', content: chunk.content };
    }
    if (chunk.type === 'error') {
      yield { type: 'error', error: chunk.error };
      return;
    }
    if (chunk.type === 'done') break;
  }

  yield {
    type: 'done',
    steps,
    toolsUsed,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Non-streaming ReAct runner — returns complete result.
 */
export async function runReActAgentSync(
  query: string,
  history: ChatMessage[],
  dynamicContext: string,
  options: ReActOptions = {},
): Promise<ReActResult> {
  let finalResponse = '';
  const steps: ReActStep[] = [];
  const toolsUsed: string[] = [];
  const startTime = Date.now();

  for await (const event of runReActAgent(query, history, dynamicContext, options)) {
    if (event.type === 'token' && event.content) {
      finalResponse += event.content;
    }
    if (event.type === 'done') {
      if (event.steps) steps.push(...event.steps);
      if (event.toolsUsed) toolsUsed.push(...event.toolsUsed);
    }
  }

  const claimsExtracted = (finalResponse.match(/\[claim-\d+\]/g) || []).length;

  return {
    finalResponse,
    steps,
    toolsUsed,
    totalDurationMs: Date.now() - startTime,
    claimsExtracted,
  };
}
