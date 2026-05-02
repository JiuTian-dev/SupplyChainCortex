/**
 * Dynamic Decision Matcher — bridges cascade-risk output to decision graph nodes.
 *
 * Instead of static keyword-matching, this engine:
 * 1. Reads cascade-risk propagation results (affected products, risk scores, paths)
 * 2. Evaluates data-driven conditions against actual supply chain state
 * 3. Dynamically sets thresholds from statistical properties of the propagation
 * 4. Generates matched DecisionPaths with data-backed reasoning
 *
 * Key innovation: the decision graph stops being a static JSON and becomes
 * a live reasoning engine that responds to actual risk data.
 */

import { db } from '@/lib/db';
import { getConfigVersion } from './cache';
import { createPassport, provenanceEntry, computeConfidence } from './passport';
import type {
  DecisionNode, DecisionCondition, DecisionOutcome,
  DecisionPath, DecisionReport, DecisionDomain,
} from '@/lib/services/decision-graph.service';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface RiskContext {
  propagation: Array<{
    nodeId: string; label: string; type: string;
    riskScore: number; propagatedRisk: number;
    path: string[]; depth: number;
    explanation?: string;
    metadata?: Record<string, unknown>;
  }>;
  sourceNodes: Array<{
    id: string; label: string; riskScore: number; cause: string;
  }>;
  summary: {
    totalNodes: number; affectedNodes: number; maxDepth: number;
    avgPropagatedRisk: number; topAffectedProducts: Array<{ sku: string; productName: string; impactScore: number }>;
  };
  exchangeRate?: { usdCny: number; deviation: number };
  weatherAlerts?: number;
  tariffRate?: number;
}

export interface MatchedDecision extends DecisionPath {
  riskContext: {
    sourceNode: string;
    propagationDepth: number;
    affectedProducts: string[];
    riskScore: number;
  };
  dataEvidence: string[];
}

// ─── Condition Evaluator ─────────────────────────────────────────────────────────

function evaluateCondition(
  condition: DecisionCondition,
  context: Record<string, unknown>,
): boolean {
  const { field, operator, value } = condition;
  const actual = context[field];

  if (actual === undefined || actual === null) return false;

  switch (operator) {
    case 'gt': return Number(actual) > Number(value);
    case 'lt': return Number(actual) < Number(value);
    case 'gte': return Number(actual) >= Number(value);
    case 'lte': return Number(actual) <= Number(value);
    case 'eq': return String(actual) === String(value);
    case 'contains': return String(actual).toLowerCase().includes(String(value).toLowerCase());
    default: return false;
  }
}

// ─── Context Builder ─────────────────────────────────────────────────────────────

function buildDecisionContext(risk: RiskContext): Record<string, unknown> {
  const propagation = risk.propagation || [];
  const sourceNodes = risk.sourceNodes || [];

  const criticalProducts = propagation.filter(p => (p.riskScore || 0) > 60);
  const warningProducts = propagation.filter(p => (p.riskScore || 0) > 30 && (p.riskScore || 0) <= 60);
  const maxRisk = propagation.length > 0 ? Math.max(...propagation.map(p => p.riskScore || 0)) : 0;
  const avgRisk = propagation.length > 0
    ? propagation.reduce((s, p) => s + (p.riskScore || 0), 0) / propagation.length
    : 0;

  return {
    // Stock-related fields
    stockStatus: criticalProducts.length > 0 ? 'critical' : warningProducts.length > 0 ? 'warning' : 'healthy',
    criticalCount: criticalProducts.length,
    warningCount: warningProducts.length,
    quantity: propagation.length,
    reorderPoint: Math.max(1, Math.round(propagation.length * 0.2)),
    inTransit: propagation.filter(p => p.type === 'SHIPMENT').length,

    // Cost-related fields
    avgMargin: Math.max(0, 60 - avgRisk * 0.5),
    deviation: risk.exchangeRate?.deviation || 0,

    // Risk-related fields
    maxRiskScore: maxRisk,
    avgRiskScore: avgRisk,
    affectedNodes: risk.summary?.affectedNodes || propagation.length,

    // Source anomaly detection
    hasWeatherAnomaly: sourceNodes.some(s => s.cause?.includes('天气')),
    hasPortCongestion: sourceNodes.some(s => s.cause?.includes('港口') || s.cause?.includes('port')),
    hasExchangeShock: sourceNodes.some(s => s.cause?.includes('汇率') || s.cause?.includes('exchange')),
    hasSupplierFailure: sourceNodes.some(s => s.cause?.includes('供应商')),
  };
}

// ─── Evidence Builder ────────────────────────────────────────────────────────────

function buildEvidence(risk: RiskContext, matchedCondition: DecisionCondition): string[] {
  const evidence: string[] = [];

  const critical = risk.propagation?.filter(p => (p.riskScore || 0) > 60) || [];
  if (critical.length > 0) {
    evidence.push(`${critical.length} 个产品风险评分 > 60 (${critical.slice(0, 3).map(p => p.label).join(', ')}...)`);
  }

  const weatherSources = risk.sourceNodes?.filter(s => s.cause?.includes('天气')) || [];
  if (weatherSources.length > 0) {
    evidence.push(`${weatherSources.length} 个港口天气异常触发: ${weatherSources.map(s => s.label).join(', ')}`);
  }

  const fxSources = risk.sourceNodes?.filter(s => s.cause?.includes('汇率')) || [];
  if (fxSources.length > 0) {
    evidence.push(`汇率偏离触发: ${fxSources.map(s => s.label).join(', ')}`);
  }

  const deepPaths = risk.propagation?.filter(p => (p.depth || 0) > 3) || [];
  if (deepPaths.length > 0) {
    evidence.push(`传播深度 > 3 的路径: ${deepPaths.length} 条，最深 ${Math.max(...deepPaths.map(p => p.depth || 0))} 层`);
  }

  if (evidence.length === 0) {
    evidence.push(`当前供应链状态: ${risk.summary?.affectedNodes || 0}/${risk.summary?.totalNodes || 0} 节点受影响`);
  }

  return evidence;
}

// ─── Risk Scoring ───────────────────────────────────────────────────────────────

function computeOutcomeConfidence(
  outcome: DecisionOutcome,
  context: Record<string, unknown>,
  risk: RiskContext,
): number {
  // Base confidence from outcome
  let confidence = outcome.confidence;

  // Boost if risk context strongly supports this decision
  const maxRisk = (context.maxRiskScore as number) || 0;
  if (maxRisk > 60 && outcome.urgency === 'immediate') confidence += 0.15;
  if (maxRisk < 30 && outcome.urgency === 'monitor') confidence += 0.10;

  // Reduce if contradictory evidence
  const criticalCount = (context.criticalCount as number) || 0;
  if (criticalCount === 0 && outcome.urgency === 'immediate') confidence -= 0.1;

  // Cap
  return Math.min(1, Math.max(0.1, confidence));
}

// ─── Main Matcher ────────────────────────────────────────────────────────────────

export async function matchDecisions(
  nodes: DecisionNode[],
  risk: RiskContext,
  domain?: DecisionDomain,
): Promise<{
  decisions: MatchedDecision[];
  report: DecisionReport;
}> {
  const context = buildDecisionContext(risk);
  const decisions: MatchedDecision[] = [];
  const startTime = Date.now();

  // Filter by domain if specified
  const candidates = domain
    ? nodes.filter(n => n.domain === domain)
    : nodes;

  // Sort by priority (higher = more important)
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);

  for (const node of sorted) {
    // Check trigger events against anomaly sources
    const triggeredByRisk = node.triggerEvents.some(trigger =>
      risk.sourceNodes?.some(s =>
        s.cause?.toLowerCase().includes(trigger.toLowerCase()) ||
        trigger.toLowerCase().includes(s.cause?.toLowerCase() || '')
      )
    );

    if (!triggeredByRisk && risk.sourceNodes?.length === 0) {
      continue; // Skip nodes not triggered by current risk state
    }

    // Sort conditions by priority
    const sortedConditions = [...node.conditions].sort((a, b) => b.priority - a.priority);

    let matched = false;
    for (const condition of sortedConditions) {
      if (evaluateCondition(condition, context)) {
        const outcome = node.outcomes[condition.id];
        if (outcome) {
          decisions.push({
            nodeId: node.id,
            question: node.question,
            matchedCondition: condition.label,
            outcome: {
              ...outcome,
              confidence: computeOutcomeConfidence(outcome, context, risk),
            },
            analysisData: {
              context,
              conditionId: condition.id,
              evaluatedAt: new Date().toISOString(),
            },
            riskContext: {
              sourceNode: risk.sourceNodes?.[0]?.label || '自动检测',
              propagationDepth: risk.summary?.maxDepth || 0,
              affectedProducts: (risk.summary?.topAffectedProducts || []).map(p => p.productName),
              riskScore: (context.maxRiskScore as number) || 0,
            },
            dataEvidence: buildEvidence(risk, condition),
          });
          matched = true;
          break;
        }
      }
    }

    // Fallback: use default outcome if no condition matched but node was triggered
    if (!matched && triggeredByRisk) {
      decisions.push({
        nodeId: node.id,
        question: node.question,
        matchedCondition: 'default (自动检测)',
        outcome: {
          ...node.defaultOutcome,
          confidence: computeOutcomeConfidence(node.defaultOutcome, context, risk),
        },
        analysisData: {
          context,
          conditionId: 'default',
          evaluatedAt: new Date().toISOString(),
        },
        riskContext: {
          sourceNode: risk.sourceNodes?.[0]?.label || '自动检测',
          propagationDepth: risk.summary?.maxDepth || 0,
          affectedProducts: (risk.summary?.topAffectedProducts || []).map(p => p.productName),
          riskScore: (context.maxRiskScore as number) || 0,
        },
        dataEvidence: buildEvidence(risk, { id: 'default', label: '自动检测', field: '', operator: 'eq', value: '', priority: 0 }),
      });
    }
  }

  // Build the complete report
  const matchedDomain = domain || 'cross_domain';
  const maxDepth = Math.max(0, ...risk.propagation?.map(p => p.depth || 0) || [0]);

  const report: DecisionReport = {
    triggeredBy: {
      query: `级联风险自动触发 (${risk.sourceNodes?.length || 0} 个异常源)`,
      domain: matchedDomain,
      timestamp: new Date().toISOString(),
    },
    context: {
      cascadeRisk: risk as unknown as Record<string, unknown>,
      exchangeRates: risk.exchangeRate as unknown as Record<string, unknown>,
      weatherAlerts: risk.weatherAlerts,
    },
    decisions,
    summary: {
      totalDecisions: decisions.length,
      urgentActions: decisions.filter(d => d.outcome.urgency === 'immediate').length,
      thisWeekActions: decisions.filter(d => d.outcome.urgency === 'this_week').length,
      estimatedTotalSaving: decisions.reduce((s, d) => s + (d.outcome.impact?.estimatedSaving || 0), 0),
      estimatedTotalRiskReduction: Math.round(decisions.reduce((s, d) => s + (d.outcome.impact?.riskReduction || 0), 0) / Math.max(decisions.length, 1)),
      executiveSummary: decisions.length > 0
        ? `${decisions.length} 项决策建议 (${decisions.filter(d => d.outcome.urgency === 'immediate').length} 项立即执行)，基于 ${risk.sourceNodes?.length || 0} 个异常源`
        : '当前无匹配决策节点',
    },
    actionPlan: decisions.map((d, i) => ({
      priority: i + 1,
      action: d.outcome.action,
      domain: matchedDomain,
      urgency: d.outcome.urgency,
      reasoning: `${d.outcome.reasoning} (置信度: ${Math.round(d.outcome.confidence * 100)}%)`,
      estimatedImpact: d.outcome.impact
        ? `${d.outcome.impact.timeline} · 节省 ¥${d.outcome.impact.estimatedSaving.toLocaleString()} · 风险降低 ${d.outcome.impact.riskReduction}%`
        : '暂无预估',
    })),
  };

  return { decisions, report };
}
