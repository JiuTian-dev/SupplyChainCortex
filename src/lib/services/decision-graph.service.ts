/**
 * Decision Formalization Reasoning Engine (DecisionGraph)
 *
 * Core innovation: encodes supply chain decisions as a structured, traversable
 * decision tree. Each node represents a decision point with branching conditions.
 * AI agents can traverse this graph to produce structured, explainable recommendations.
 *
 * From "what will happen?" (cascade risk) → "what should you do?" (DecisionGraph)
 *
 * Architecture:
 *   Analysis Layer (cascade-risk) → Decision Layer (this) → Action Layer (MCP tools)
 */

import { db } from '@/lib/db';
import { getExchangeRate } from '@/lib/exchange-rate';
import { agentMemory } from '@/lib/engine/memory';
import { getCascadeRisk } from '@/lib/services/cascade-risk.service';
import { getLatestRates } from '@/lib/queries/exchange-rate.queries';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type DecisionDomain = 'inventory' | 'cost' | 'logistics' | 'supplier' | 'risk' | 'cross_domain' | 'tariff';

export interface DecisionCondition {
  id: string;
  label: string;
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'contains';
  value: number | string;
  priority: number; // Higher = checked first
}

export interface DecisionOutcome {
  id: string;
  action: string;
  reasoning: string;
  confidence: number; // 0-1
  urgency: 'immediate' | 'this_week' | 'this_month' | 'monitor';
  impact: {
    estimatedSaving: number;
    riskReduction: number;
    timeline: string;
    effort: 'easy' | 'medium' | 'complex';
  };
  prerequisites?: string[];
  followUpDecisions: string[];
  fallbackAction?: string;
}

export interface DecisionNode {
  id: string;
  domain: DecisionDomain;
  question: string;
  description: string;
  analysisStep: {
    tool: string;             // MCP tool to gather data
    params: Record<string, string>;
  };
  conditions: DecisionCondition[];
  outcomes: Record<string, DecisionOutcome>; // conditionId → outcome
  defaultOutcome: DecisionOutcome;
  priority: number;
  triggerEvents: string[];    // What triggers this decision check
}

export interface DecisionPath {
  nodeId: string;
  question: string;
  matchedCondition: string;
  outcome: DecisionOutcome;
  analysisData: Record<string, unknown>;
}

export interface DecisionReport {
  triggeredBy: {
    query: string;
    domain: DecisionDomain;
    timestamp: string;
  };
  context: {
    cascadeRisk?: Record<string, unknown>;
    exchangeRates?: Record<string, unknown>;
    weatherAlerts?: number;
  };
  decisions: DecisionPath[];
  summary: {
    totalDecisions: number;
    urgentActions: number;
    thisWeekActions: number;
    estimatedTotalSaving: number;
    estimatedTotalRiskReduction: number;
    executiveSummary: string;
  };
  actionPlan: Array<{
    priority: number;
    action: string;
    domain: DecisionDomain;
    urgency: string;
    reasoning: string;
    estimatedImpact: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Decision Graph Definition
// ═══════════════════════════════════════════════════════════════════════════════

export const DECISION_GRAPH: DecisionNode[] = [
  // ── Inventory Domain ──────────────────────────────────────────────────────
  {
    id: 'dg-inventory-reorder',
    domain: 'inventory',
    question: '是否需要补货？',
    description: '基于当前库存水位、在途货物和安全库存，判断是否需要立即补货',
    analysisStep: { tool: 'query_inventory', params: { action: 'list' } },
    conditions: [
      { id: 'c-stock-critical', label: '库存状态为紧急(critical)', field: 'stockStatus', operator: 'eq', value: 'critical', priority: 100 },
      { id: 'c-stock-warning', label: '库存状态为预警(warning)', field: 'stockStatus', operator: 'eq', value: 'warning', priority: 80 },
      { id: 'c-below-reorder', label: '当前库存低于再订购点', field: 'quantity', operator: 'lt', value: 'reorderPoint', priority: 70 },
      { id: 'c-in-transit', label: '有在途货物但未到达', field: 'inTransit', operator: 'gt', value: 0, priority: 50 },
    ],
    outcomes: {
      'c-stock-critical': {
        id: 'o-reorder-urgent', action: '立即创建紧急补货订单',
        reasoning: '库存处于紧急状态，断货风险极高',
        confidence: 0.95, urgency: 'immediate',
        impact: { estimatedSaving: 5000, riskReduction: 90, timeline: '3-5 天', effort: 'easy' },
        followUpDecisions: ['dg-supplier-select', 'dg-cost-optimize'],
        fallbackAction: '如果供应商无法快速响应，联系备选供应商',
      },
      'c-stock-warning': {
        id: 'o-reorder-plan', action: '计划补货，3天内下单',
        reasoning: '库存处于预警状态，需尽快补充',
        confidence: 0.85, urgency: 'this_week',
        impact: { estimatedSaving: 3000, riskReduction: 70, timeline: '1 周', effort: 'easy' },
        followUpDecisions: ['dg-cost-optimize'],
      },
      'c-below-reorder': {
        id: 'o-reorder-standard', action: '创建标准补货订单',
        reasoning: '库存已低于再订购点',
        confidence: 0.80, urgency: 'this_week',
        impact: { estimatedSaving: 2000, riskReduction: 60, timeline: '1-2 周', effort: 'easy' },
        followUpDecisions: ['dg-supplier-select'],
      },
    },
    defaultOutcome: {
      id: 'o-monitor', action: '继续监控库存水位',
      reasoning: '当前库存充足，无需立即行动',
      confidence: 0.90, urgency: 'monitor',
      impact: { estimatedSaving: 0, riskReduction: 0, timeline: '持续', effort: 'easy' },
      followUpDecisions: [],
    },
    priority: 100,
    triggerEvents: ['库存预警', '库存低于安全线', '库存紧急'],
  },

  // ── Cost Domain ───────────────────────────────────────────────────────────
  {
    id: 'dg-cost-fx-impact',
    domain: 'cost',
    question: '汇率波动是否影响利润？需要提价或对冲吗？',
    description: '检测汇率变化对产品毛利率的影响，推荐定价策略或对冲措施',
    analysisStep: { tool: 'query_exchange_rates', params: { action: 'latest' } },
    conditions: [
      { id: 'c-fx-severe', label: '汇率偏离 > 5%', field: 'deviation', operator: 'gt', value: 0.05, priority: 100 },
      { id: 'c-fx-moderate', label: '汇率偏离 2%-5%', field: 'deviation', operator: 'gt', value: 0.02, priority: 80 },
      { id: 'c-margin-low', label: '平均毛利率 < 45%', field: 'avgMargin', operator: 'lt', value: 45, priority: 70 },
    ],
    outcomes: {
      'c-fx-severe': {
        id: 'o-fx-hedge', action: '启动汇率对冲 + 评估调价',
        reasoning: '汇率大幅偏离，利润可能被严重压缩',
        confidence: 0.90, urgency: 'immediate',
        impact: { estimatedSaving: 15000, riskReduction: 80, timeline: '立即', effort: 'medium' },
        followUpDecisions: ['dg-cost-optimize', 'dg-price-adjust'],
        fallbackAction: '联系银行办理远期结汇',
      },
      'c-fx-moderate': {
        id: 'o-fx-monitor', action: '密切关注汇率并设定触发线',
        reasoning: '汇率有一定波动，但尚未达到紧急水平',
        confidence: 0.80, urgency: 'this_week',
        impact: { estimatedSaving: 5000, riskReduction: 50, timeline: '1 周', effort: 'easy' },
        followUpDecisions: ['dg-cost-optimize'],
      },
      'c-margin-low': {
        id: 'o-cost-reduce', action: '启动成本优化审查',
        reasoning: '毛利率偏低，需要优化成本结构',
        confidence: 0.85, urgency: 'this_week',
        impact: { estimatedSaving: 8000, riskReduction: 40, timeline: '2-4 周', effort: 'medium' },
        followUpDecisions: ['dg-cost-optimize', 'dg-supplier-select'],
      },
    },
    defaultOutcome: {
      id: 'o-fx-stable', action: '维持当前策略',
      reasoning: '汇率稳定，利润在安全范围内',
      confidence: 0.90, urgency: 'monitor',
      impact: { estimatedSaving: 0, riskReduction: 0, timeline: '持续', effort: 'easy' },
      followUpDecisions: [],
    },
    priority: 90,
    triggerEvents: ['汇率波动', '汇率变化', '人民币升值', '人民币贬值', '利润下降'],
  },

  // ── Logistics Domain ──────────────────────────────────────────────────────
  {
    id: 'dg-logistics-delay',
    domain: 'logistics',
    question: '货运延误如何应对？是否需要改道？',
    description: '分析在途货运的延误风险，推荐改道或加速方案',
    analysisStep: { tool: 'query_logistics', params: { action: 'list' } },
    conditions: [
      { id: 'c-delay-severe', label: '延迟 > 5 天且有恶劣天气', field: 'delayDays', operator: 'gt', value: 5, priority: 100 },
      { id: 'c-delay-moderate', label: '延迟 2-5 天', field: 'delayDays', operator: 'gt', value: 2, priority: 80 },
      { id: 'c-customs-delay', label: '海关清关中', field: 'status', operator: 'eq', value: 'customs', priority: 70 },
    ],
    outcomes: {
      'c-delay-severe': {
        id: 'o-reroute', action: '评估替代路线或空运加速',
        reasoning: '严重延误将导致下游断货，需立即行动',
        confidence: 0.90, urgency: 'immediate',
        impact: { estimatedSaving: 12000, riskReduction: 85, timeline: '2-5 天', effort: 'complex' },
        followUpDecisions: ['dg-inventory-reorder'],
        fallbackAction: '联系货代评估空运可行性',
      },
      'c-delay-moderate': {
        id: 'o-expedite', action: '联系承运商加速，并通知客户',
        reasoning: '中等延误，可以通过催单缓解',
        confidence: 0.80, urgency: 'this_week',
        impact: { estimatedSaving: 4000, riskReduction: 50, timeline: '3-7 天', effort: 'medium' },
        followUpDecisions: [],
      },
      'c-customs-delay': {
        id: 'o-customs-help', action: '联系报关行加速清关',
        reasoning: '海关清关延迟，需要专业协助',
        confidence: 0.75, urgency: 'this_week',
        impact: { estimatedSaving: 3000, riskReduction: 40, timeline: '1-3 天', effort: 'easy' },
        followUpDecisions: [],
      },
    },
    defaultOutcome: {
      id: 'o-log-monitor', action: '继续监控货运状态',
      reasoning: '货运状态正常，无需干预',
      confidence: 0.90, urgency: 'monitor',
      impact: { estimatedSaving: 0, riskReduction: 0, timeline: '持续', effort: 'easy' },
      followUpDecisions: [],
    },
    priority: 80,
    triggerEvents: ['货运延误', '延迟', '海关', '改道', '缺货'],
  },

  // ── Cross-Domain: Comprehensive Risk Response ──────────────────────────────
  {
    id: 'dg-cross-risk-response',
    domain: 'cross_domain',
    question: '当前最重要的供应链风险是什么？应该优先采取什么行动？',
    description: '综合评估所有风险维度，输出优先级排序的行动方案',
    analysisStep: { tool: 'query_cascade_risk', params: { scenario: 'auto' } },
    conditions: [
      { id: 'c-multi-crisis', label: '多个风险源同时触发（天气+汇率+供应）', field: 'sourceCount', operator: 'gt', value: 2, priority: 100 },
      { id: 'c-high-impact', label: '已有产品影响 > 50%', field: 'maxImpact', operator: 'gt', value: 50, priority: 90 },
      { id: 'c-moderate-impact', label: '有产品受到影响', field: 'affectedCount', operator: 'gt', value: 0, priority: 70 },
    ],
    outcomes: {
      'c-multi-crisis': {
        id: 'o-emergency-plan', action: '启动供应链应急预案',
        reasoning: '多风险源同时触发，需跨领域协调应对',
        confidence: 0.90, urgency: 'immediate',
        impact: { estimatedSaving: 50000, riskReduction: 90, timeline: '立即', effort: 'complex' },
        followUpDecisions: ['dg-logistics-delay', 'dg-cost-fx-impact', 'dg-inventory-reorder', 'dg-supplier-select'],
        fallbackAction: '召开紧急供应链会议，启动所有应急预案',
      },
      'c-high-impact': {
        id: 'o-focused-response', action: '重点应对高风险产品',
        reasoning: '特定产品受到严重影响，需要针对性处理',
        confidence: 0.85, urgency: 'immediate',
        impact: { estimatedSaving: 20000, riskReduction: 75, timeline: '1-2 天', effort: 'medium' },
        followUpDecisions: ['dg-inventory-reorder', 'dg-logistics-delay'],
      },
      'c-moderate-impact': {
        id: 'o-preventive', action: '制定预防性措施',
        reasoning: '风险可控，但需要提前准备',
        confidence: 0.80, urgency: 'this_week',
        impact: { estimatedSaving: 8000, riskReduction: 50, timeline: '1 周', effort: 'medium' },
        followUpDecisions: ['dg-cost-optimize'],
      },
    },
    defaultOutcome: {
      id: 'o-all-clear', action: '供应链运行正常，保持监控',
      reasoning: '当前无重大风险，继续常规运营',
      confidence: 0.85, urgency: 'monitor',
      impact: { estimatedSaving: 0, riskReduction: 0, timeline: '持续', effort: 'easy' },
      followUpDecisions: [],
    },
    priority: 110,
    triggerEvents: ['供应链风险', '风险', '危机', '应急', '怎么办', '如何应对'],
  },

  // ── Tariff Domain ────────────────────────────────────────────────────────
  {
    id: 'dg-tariff-impact',
    domain: 'cost',
    question: '关税变化是否影响产品利润？是否需要调整原产地？',
    description: '检测关税税率对产品毛利的影响，推荐原产地变更或转口方案',
    analysisStep: { tool: 'query_tariff', params: { action: 'overview' } },
    conditions: [
      { id: 'c-tariff-critical', label: '关税 ≥ 25% 且毛利率 < 40%', field: 'tariffRate', operator: 'gte', value: 25, priority: 100 },
      { id: 'c-tariff-high', label: '关税 ≥ 7.5% 且毛利率 < 48%', field: 'tariffRate', operator: 'gte', value: 7.5, priority: 80 },
      { id: 'c-tariff-moderate', label: '关税 > 0% 且产品毛利偏低', field: 'tariffRate', operator: 'gt', value: 0, priority: 60 },
    ],
    outcomes: {
      'c-tariff-critical': {
        id: 'o-tariff-reroute', action: '立即评估原产地变更方案',
        reasoning: '高关税正在严重压缩利润，原产地变更（墨西哥/越南/马来西亚）可将关税降至 0%',
        confidence: 0.90, urgency: 'immediate',
        impact: { estimatedSaving: 30000, riskReduction: 85, timeline: '3-6 个月', effort: 'complex' },
        followUpDecisions: ['dg-cost-fx-impact', 'dg-supplier-select'],
        fallbackAction: '如无法变更原产地，评估提价 5-10% 分担关税成本',
      },
      'c-tariff-high': {
        id: 'o-tariff-optimize', action: '启动关税优化审查',
        reasoning: '关税负担较重，可通过HS编码优化、原产地评估降低',
        confidence: 0.85, urgency: 'this_week',
        impact: { estimatedSaving: 15000, riskReduction: 60, timeline: '1-3 个月', effort: 'medium' },
        followUpDecisions: ['dg-cost-optimize'],
        fallbackAction: '评估转口贸易（集散地中转）的可行性',
      },
      'c-tariff-moderate': {
        id: 'o-tariff-monitor', action: '监控关税政策变化',
        reasoning: '当前关税水平可控，但需关注政策变化',
        confidence: 0.80, urgency: 'this_month',
        impact: { estimatedSaving: 5000, riskReduction: 30, timeline: '持续', effort: 'easy' },
        followUpDecisions: [],
      },
    },
    defaultOutcome: {
      id: 'o-tariff-ok', action: '关税成本在正常范围',
      reasoning: '当前适用的贸易协定提供优惠关税',
      confidence: 0.90, urgency: 'monitor',
      impact: { estimatedSaving: 0, riskReduction: 0, timeline: '持续', effort: 'easy' },
      followUpDecisions: [],
    },
    priority: 95,
    triggerEvents: ['关税', '贸易战', '301', '原产地', '转口', '墨西哥', '越南'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Decision Engine
// ═══════════════════════════════════════════════════════════════════════════════

/** Evaluate a condition against actual data values */
function evaluateCondition(condition: DecisionCondition, data: Record<string, unknown>): boolean {
  const fieldValue = data[condition.field];
  if (fieldValue === undefined || fieldValue === null) return false;

  const numValue = Number(fieldValue);
  const numThreshold = Number(condition.value);

  switch (condition.operator) {
    case 'gt': return numValue > numThreshold;
    case 'lt': return numValue < numThreshold;
    case 'gte': return numValue >= numThreshold;
    case 'lte': return numValue <= numThreshold;
    case 'eq': return String(fieldValue) === String(condition.value);
    case 'contains': return String(fieldValue).includes(String(condition.value));
    default: return false;
  }
}

/** Gather context data from real data sources */
async function gatherContext(nodes: DecisionNode[]): Promise<{
  cascadeRisk?: Awaited<ReturnType<typeof getCascadeRisk>>;
  exchangeRates?: { rate: number; deviation: number };
  inventoryAlerts?: number;
  delayedShipments?: number;
}> {
  const context: Record<string, unknown> = {};

  try {
    const risk = await getCascadeRisk({ scenario: 'auto' });
    context.cascadeRisk = risk;
  } catch { /* skip */ }

  try {
    const live = await getLatestRates('CNY');
    if (live.rates?.USD) {
      const rate = 1 / live.rates.USD;
      context.exchangeRates = { rate: Math.round(rate * 100) / 100, deviation: Math.round(Math.abs(rate - 7.25) / 7.25 * 1000) / 10 };
    }
  } catch { /* skip */ }

  // Get inventory alerts
  try {
    const critical = await db.inventory.count({ where: { stockStatus: 'critical' } });
    const warning = await db.inventory.count({ where: { stockStatus: 'warning' } });
    context.inventoryAlerts = critical + warning;
  } catch { /* skip */ }

  // Get delayed shipments
  try {
    const delayed = await db.shipmentItem.count({ where: { delayDays: { gt: 0 } } });
    context.delayedShipments = delayed;
  } catch { /* skip */ }

  return context;
}

/** Extract data values from context for a specific decision node — uses real DB data */
async function extractDataForNode(node: DecisionNode, context: Record<string, unknown>): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {};

  switch (node.domain) {
    case 'inventory': {
      // Fetch real inventory counts grouped by status
      const realInv = await db.inventory.groupBy({
        by: ['stockStatus'],
        _count: { stockStatus: true },
      });
      const statusMap = Object.fromEntries(realInv.map(r => [r.stockStatus, r._count.stockStatus]));
      const critical = statusMap.critical || 0;
      const warning = statusMap.warning || 0;
      const total = Object.values(statusMap).reduce((a, b) => a + b, 0);

      data.stockStatus = critical > 0 ? 'critical' : warning > 0 ? 'warning' : 'healthy';
      data.quantity = total;
      data.criticalCount = critical;
      data.warningCount = warning;
      data.reorderPoint = 100;
      data.inTransit = (context.delayedShipments as number) || 0;
      break;
    }
    case 'cost': {
      // Real FX + real margin from DB
      const fx = context.exchangeRates as { rate: number; deviation: number } | undefined;
      data.deviation = fx?.deviation ? fx.deviation / 100 : 0;

      const realCosts = await db.costRecord.findMany({ take: 200 });
      const avgMargin = realCosts.length > 0
        ? Math.round(realCosts.reduce((s, c) => s + c.grossMargin, 0) / realCosts.length * 10) / 10
        : 48;
      data.avgMargin = avgMargin;
      break;
    }
    case 'logistics': {
      // Real delayed shipments with actual delay days
      const realDelayed = await db.shipmentItem.findMany({
        where: { status: { in: ['delayed', 'exception'] } },
        orderBy: { delayDays: 'desc' },
        take: 50,
      });
      const maxDelay = realDelayed.length > 0
        ? Math.max(...realDelayed.map(s => s.delayDays))
        : 0;
      const avgDelay = realDelayed.length > 0
        ? Math.round(realDelayed.reduce((s, sh) => s + sh.delayDays, 0) / realDelayed.length * 10) / 10
        : 0;

      data.delayDays = maxDelay;
      data.avgDelayDays = avgDelay;
      data.delayedCount = realDelayed.length;
      data.status = maxDelay > 5 ? 'customs' : maxDelay > 0 ? 'delayed' : 'in_transit';
      break;
    }
    case 'cross_domain': {
      const risk = context.cascadeRisk as Record<string, unknown> | undefined;
      const sourceNodes = (risk as any)?.sourceNodes as Array<Record<string, unknown>> | undefined;
      data.sourceCount = sourceNodes?.length || 0;
      data.maxImpact = (risk as any)?.summary?.totalMonthlyLoss || 0;
      data.affectedCount = (risk as any)?.summary?.affectedNodes || 0;
      break;
    }
  }

  return data;
}

/** Traverse decision graph and produce recommendations */
export async function executeDecisionGraph(options?: {
  query?: string;
  domains?: DecisionDomain[];
  includeAll?: boolean;
}): Promise<DecisionReport> {
  const { query = '', domains, includeAll = false } = options || {};

  // Determine which domains to check
  let activeDomains: DecisionDomain[] = domains || [];
  if (activeDomains.length === 0) {
    // Auto-detect from query keywords
    const q = query.toLowerCase();
    if (q.includes('库存') || q.includes('补货') || q.includes('缺货')) activeDomains.push('inventory');
    if (q.includes('汇率') || q.includes('成本') || q.includes('利润') || q.includes('价格')) activeDomains.push('cost');
    if (q.includes('物流') || q.includes('延误') || q.includes('货运') || q.includes('海关')) activeDomains.push('logistics');
    if (q.includes('关税') || q.includes('贸易') || q.includes('301') || q.includes('原产地') || q.includes('转口')) activeDomains.push('tariff');
    if (q.includes('风险') || q.includes('危机') || q.includes('应急') || q.includes('怎么办')) activeDomains.push('cross_domain');
    if (activeDomains.length === 0 || includeAll) activeDomains = ['cross_domain', 'inventory', 'cost', 'logistics', 'tariff'];
  }

  // Gather real-time context
  const context = await gatherContext(DECISION_GRAPH);

  // Filter relevant nodes
  const relevantNodes = DECISION_GRAPH
    .filter(n => activeDomains.includes(n.domain))
    .sort((a, b) => b.priority - a.priority);

  // Execute decisions
  const paths: DecisionPath[] = [];

  for (const node of relevantNodes) {
    const data = await extractDataForNode(node, context as unknown as Record<string, unknown>);

    // Evaluate conditions by priority (highest first)
    const sortedConditions = [...node.conditions].sort((a, b) => b.priority - a.priority);
    let matched = false;

    for (const cond of sortedConditions) {
      if (evaluateCondition(cond, data)) {
        const outcome = node.outcomes[cond.id];
        if (outcome) {
          paths.push({
            nodeId: node.id,
            question: node.question,
            matchedCondition: cond.label,
            outcome,
            analysisData: data,
          });
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      paths.push({
        nodeId: node.id,
        question: node.question,
        matchedCondition: '默认（无异常触发）',
        outcome: node.defaultOutcome,
        analysisData: data,
      });
    }
  }

  // Build action plan (sorted by urgency)
  const urgencyOrder = { immediate: 0, this_week: 1, this_month: 2, monitor: 3 };
  const urgentPaths = paths
    .filter(p => p.outcome.urgency !== 'monitor')
    .sort((a, b) => urgencyOrder[a.outcome.urgency] - urgencyOrder[b.outcome.urgency]);

  const actionPlan = urgentPaths.map((p, i) => ({
    priority: i + 1,
    action: p.outcome.action,
    domain: DECISION_GRAPH.find(n => n.id === p.nodeId)?.domain || 'cross_domain',
    urgency: p.outcome.urgency === 'immediate' ? '⚡ 立即' : p.outcome.urgency === 'this_week' ? '📅 本周' : '📋 本月',
    reasoning: `${p.question} → ${p.matchedCondition} → ${p.outcome.reasoning}`,
    estimatedImpact: `节省 $${p.outcome.impact.estimatedSaving.toLocaleString()}，风险降低 ${p.outcome.impact.riskReduction}%`,
  }));

  const totalSaving = paths.reduce((s, p) => s + p.outcome.impact.estimatedSaving, 0);
  const totalRiskReduction = paths.reduce((s, p) => s + p.outcome.impact.riskReduction, 0) / Math.max(paths.length, 1);

  // Generate executive summary
  const urgentCount = paths.filter(p => p.outcome.urgency === 'immediate').length;
  const weekCount = paths.filter(p => p.outcome.urgency === 'this_week').length;
  const executiveSummary = urgentCount > 0
    ? `⚠️ ${urgentCount} 项需要立即行动的决策，${weekCount} 项本周内行动。预计可节省 $${totalSaving.toLocaleString()}，平均风险降低 ${Math.round(totalRiskReduction)}%。`
    : weekCount > 0
      ? `📋 ${weekCount} 项需要本周内决策。整体供应链可控，预计可节省 $${totalSaving.toLocaleString()}。`
      : `✅ 当前供应链运行正常，所有指标在安全范围内。`;

  // Write to shared agent memory before returning
  agentMemory.updateShared('decisionGraph', {
    lastRun: new Date().toISOString(),
    urgentActions: urgentCount,
    thisWeekActions: weekCount,
    estimatedTotalSaving: totalSaving,
    actionPlan: actionPlan.map(a => ({
      priority: a.priority,
      action: a.action,
      domain: a.domain,
      urgency: a.urgency,
    })),
  });

  return {
    triggeredBy: {
      query: query || '自动检测',
      domain: activeDomains[0],
      timestamp: new Date().toISOString(),
    },
    context: {
      cascadeRisk: context.cascadeRisk ? { summary: context.cascadeRisk.summary } : undefined,
      exchangeRates: context.exchangeRates,
      weatherAlerts: (context.cascadeRisk as unknown as unknown as Record<string, unknown>)?.summary
        ? ((context.cascadeRisk as unknown as unknown as Record<string, unknown>).summary as unknown as unknown as Record<string, unknown>).affectedNodes as number
        : undefined,
    },
    decisions: paths,
    summary: {
      totalDecisions: paths.length,
      urgentActions: urgentCount,
      thisWeekActions: weekCount,
      estimatedTotalSaving: totalSaving,
      estimatedTotalRiskReduction: Math.round(totalRiskReduction),
      executiveSummary,
    },
    actionPlan,
  };
}

/** Get all decision domains for UI */
export function getDecisionDomains(): Array<{ id: DecisionDomain; label: string; description: string }> {
  return [
    { id: 'cross_domain', label: '综合风险', description: '跨领域综合评估' },
    { id: 'inventory', label: '库存', description: '补货与库存管理' },
    { id: 'cost', label: '成本', description: '汇率与利润优化' },
    { id: 'logistics', label: '物流', description: '货运延误应对' },
    { id: 'supplier', label: '供应商', description: '供应商评估与切换' },
  ];
}
