/**
 * LLM-Driven Multi-Agent Sandbox — structured prompts → LLM → decisions.
 *
 * Each supply chain role (warehouse/supplier/forwarder/market) gets a
 * specialized system prompt and state context. The LLM returns a structured
 * JSON decision. Falls back to the existing rule-based logic when LLM is
 * unavailable (zero-dependency degradation).
 *
 * Architecture:
 *   SandboxState → LLMAgent.run(role, state) → AgentDecision (JSON)
 *
 * Compatible with: DeepSeek, OpenAI, Anthropic, Ollama (via AI provider config)
 */

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface AgentDecision {
  action: string;
  reasoning: string;
  confidence: number;
  impact: {
    delayDays?: number;
    costChange?: number;
    stockChange?: number;
    demandChange?: number;
    riskChange?: number;
  };
  recommendations: string[];
  fallback: boolean;  // true if LLM failed and rule-based logic was used
}

export interface AgentContext {
  role: 'warehouse' | 'supplier' | 'forwarder' | 'market';
  state: {
    round: number;
    weatherSeverity: number;
    exchangeRate: number;
    tariffRate: number;
    marketDemand: number;
    inventory: Array<{ sku: string; quantity: number; safetyStock: number; status: string }>;
    shipments: Array<{ id: string; delayDays: number; status: string; eta: number }>;
    suppliers: Array<{ name: string; rating: number; leadTime: number }>;
    stockoutEvents: number;
    totalDelays: number;
  };
}

// ─── Role Prompts ────────────────────────────────────────────────────────────────

const ROLE_PROMPTS: Record<AgentContext['role'], string> = {
  warehouse: `你是仓库经理Agent。基于当前供应链状态，决定库存策略。
输出JSON: {"action":"...", "reasoning":"...", "confidence":0.8, "impact":{"stockChange":0}, "recommendations":["..."]}
决策因素: 库存水位 vs 安全库存、周转天数、在途货物ETA、市场需求的趋势。`,

  supplier: `你是供应商管理Agent。基于当前供应链状态，评估供应商风险并决定应对策略。
输出JSON: {"action":"...", "reasoning":"...", "confidence":0.8, "impact":{"delayDays":0}, "recommendations":["..."]}
决策因素: 供应商评分与可靠性、天气中断概率(weatherSeverity/100)、汇率波动对成本影响、lead time余量。`,

  forwarder: `你是货代/物流Agent。基于当前供应链状态，评估货运风险并决定路线/缓冲策略。
输出JSON: {"action":"...", "reasoning":"...", "confidence":0.8, "impact":{"delayDays":0}, "recommendations":["..."]}
决策因素: 天气对海运的影响(weatherSeverity × 0.43衰减)、关税对港口选择的影响、延误概率与ETA偏差。`,

  market: `你是市场需求分析Agent。基于当前供应链状态，预测需求变化并建议定价/促销策略。
输出JSON: {"action":"...", "reasoning":"...", "confidence":0.8, "impact":{"demandChange":0}, "recommendations":["..."]}
决策因素: 汇率对购买力影响、关税对零售价影响、季节性波动、库存压力对定价的影响。`,
};

// ─── State Formatter ─────────────────────────────────────────────────────────────

function formatState(role: AgentContext['role'], ctx: AgentContext): string {
  const { state } = ctx;
  const lines = [
    `轮次: ${state.round}`,
    `天气严重度: ${state.weatherSeverity}/100`,
    `汇率(USD/CNY): ${state.exchangeRate.toFixed(2)} (偏离: ${((state.exchangeRate - 7.25) / 7.25 * 100).toFixed(1)}%)`,
    `关税率: ${state.tariffRate}%`,
    `市场需求指数: ${state.marketDemand} (100=基准)`,
    `断货事件累计: ${state.stockoutEvents}`,
    `总延误天数: ${state.totalDelays}`,
  ];

  if (role === 'warehouse' || role === 'supplier') {
    lines.push(`库存概览(${state.inventory.length} SKU):`);
    for (const inv of state.inventory.slice(0, 5)) {
      lines.push(`  ${inv.sku}: 库存${inv.quantity}, 安全库存${inv.safetyStock}, 状态:${inv.status}`);
    }
    lines.push(`供应商(${state.suppliers.length}家):`);
    for (const sup of state.suppliers.slice(0, 3)) {
      lines.push(`  ${sup.name}: 评分${sup.rating}, lead time ${sup.leadTime}天`);
    }
  }

  if (role === 'forwarder') {
    lines.push(`货运状态(${state.shipments.length}批):`);
    for (const sh of state.shipments.slice(0, 5)) {
      lines.push(`  ${sh.id}: 延误${sh.delayDays}天, 状态:${sh.status}, ETA:${sh.eta}天`);
    }
  }

  return lines.join('\n');
}

// ─── LLM Call ────────────────────────────────────────────────────────────────────

async function callLLM(
  systemPrompt: string,
  userMessage: string,
  provider = 'deepseek',
  model = 'deepseek-chat',
): Promise<string | null> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userMessage,
        stream: false,
        provider,
        model,
        systemPrompt,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.reply || data?.reply || null;
  } catch {
    return null;
  }
}

// ─── JSON Parser ─────────────────────────────────────────────────────────────────

function parseAgentResponse(text: string): Partial<AgentDecision> | null {
  try {
    // Extract JSON block
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// ─── Main Agent Runner ───────────────────────────────────────────────────────────

export async function runLLMAgent(
  ctx: AgentContext,
  options?: { provider?: string; model?: string },
): Promise<AgentDecision> {
  const systemPrompt = ROLE_PROMPTS[ctx.role];
  const stateText = formatState(ctx.role, ctx);
  const userMessage = `当前供应链状态:\n${stateText}\n\n请作为${ctx.role}Agent做出决策。`;

  const provider = options?.provider || 'deepseek';
  const model = options?.model || 'deepseek-chat';

  // Try LLM
  const llmResponse = await callLLM(systemPrompt, userMessage, provider, model);

  if (llmResponse) {
    const parsed = parseAgentResponse(llmResponse);
    if (parsed && parsed.action) {
      return {
        action: parsed.action,
        reasoning: parsed.reasoning || 'LLM Agent 分析',
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.7)),
        impact: parsed.impact || {},
        recommendations: parsed.recommendations || [],
        fallback: false,
      };
    }
  }

  // ── Fallback: rule-based logic ──────────────────────────────────────────
  return ruleBasedFallback(ctx);
}

// ─── Rule-Based Fallback ─────────────────────────────────────────────────────────

function ruleBasedFallback(ctx: AgentContext): AgentDecision {
  const { role, state } = ctx;

  switch (role) {
    case 'warehouse': {
      const criticalCount = state.inventory.filter(i => i.quantity < i.safetyStock).length;
      return {
        action: criticalCount > 0 ? `紧急补货 ${criticalCount} SKU` : '维持当前库存',
        reasoning: `${criticalCount} SKU 低于安全库存 (规则引擎)`,
        confidence: 0.7,
        impact: { stockChange: criticalCount * 50 },
        recommendations: criticalCount > 0 ? ['立即创建补货订单', '检查供应商lead time'] : ['继续监控'],
        fallback: true,
      };
    }
    case 'supplier': {
      const avgRating = state.suppliers.reduce((s, sp) => s + sp.rating, 0) / (state.suppliers.length || 1);
      const riskLevel = avgRating < 3.5 ? 'high' : avgRating < 4.0 ? 'medium' : 'low';
      return {
        action: riskLevel === 'high' ? '评估替代供应商' : '维持现有供应商',
        reasoning: `供应商平均评分 ${avgRating.toFixed(1)}/5 (规则引擎)`,
        confidence: 0.65,
        impact: {},
        recommendations: riskLevel === 'high' ? ['评估备选供应商', '协商缩短lead time'] : ['定期评审'],
        fallback: true,
      };
    }
    case 'forwarder': {
      const weatherRisk = state.weatherSeverity / 100;
      const delayProb = weatherRisk * 0.43 + (state.tariffRate > 15 ? 0.2 : 0);
      return {
        action: delayProb > 0.3 ? '增加货运缓冲时间' : '正常货运安排',
        reasoning: `天气风险 ${(weatherRisk * 100).toFixed(0)}%, 关税压力 ${state.tariffRate}% (规则引擎)`,
        confidence: 0.6,
        impact: { delayDays: Math.round(delayProb * 5) },
        recommendations: delayProb > 0.3 ? ['增加2-3天缓冲', '评估替代航线'] : [],
        fallback: true,
      };
    }
    case 'market': {
      const demandChange = (state.exchangeRate - 7.25) / 7.25 * -15 + (state.tariffRate > 10 ? -5 : 0);
      return {
        action: demandChange < -5 ? '考虑促销刺激需求' : '维持当前定价',
        reasoning: `汇率对需求影响 ${demandChange.toFixed(1)}% (规则引擎)`,
        confidence: 0.55,
        impact: { demandChange: Math.round(demandChange) },
        recommendations: [],
        fallback: true,
      };
    }
  }
}

// ─── Batch Runner ────────────────────────────────────────────────────────────────

export async function runAllAgents(
  state: AgentContext['state'],
  options?: { provider?: string; model?: string },
): Promise<Record<string, AgentDecision>> {
  const roles: AgentContext['role'][] = ['warehouse', 'supplier', 'forwarder', 'market'];
  const results: Record<string, AgentDecision> = {};

  // Run agents in parallel
  const decisions = await Promise.all(
    roles.map(role =>
      runLLMAgent({ role, state }, options).then(d => ({ role, decision: d }))
    )
  );

  for (const { role, decision } of decisions) {
    results[role] = decision;
  }

  return results;
}
