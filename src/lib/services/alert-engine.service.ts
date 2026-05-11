/**
 * Alert Engine — auto-trigger alerts from cascade risk results
 *
 * Watches the cascade risk report and matches against AlertRule entries.
 * When thresholds are breached, creates SupplyChainEvent + sends to NotificationCenter.
 *
 * No manual intervention needed — runs automatically after each cascade risk cycle.
 */

import { db } from '@/lib/db';
import type { CascadeReport, PropagationStep } from '@/lib/services/cascade-risk.service';

// ─── Types ───────────────────────────────────────────────────────────────────────

interface TriggeredAlert {
  ruleId: string;
  ruleName: string;
  severity: 'warning' | 'critical';
  message: string;
  entity: string;
}

// ─── Rule Evaluation ─────────────────────────────────────────────────────────────

function evaluateThreshold(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case '<': return value < threshold;
    case '>': return value > threshold;
    case '<=': return value <= threshold;
    case '>=': return value >= threshold;
    case '==': return Math.abs(value - threshold) < 0.01;
    default: return false;
  }
}

async function checkRules(report: CascadeReport): Promise<TriggeredAlert[]> {
  const rules = await db.alertRule.findMany({ where: { enabled: true } });
  const alerts: TriggeredAlert[] = [];

  for (const rule of rules) {
    let currentValue = 0;
    let entity = rule.field;

    // Map rule fields to cascade report values
    switch (rule.field) {
      case 'overallRisk':
        currentValue = report.overallRisk || 0;
        break;
      case 'affectedNodes':
        currentValue = report.summary?.affectedNodes || 0;
        break;
      case 'maxRisk':
        currentValue = report.summary?.maxRisk || 0;
        break;
      case 'totalLoss':
        currentValue = report.summary?.totalMonthlyLoss || 0;
        break;
      case 'propagationDepth':
        currentValue = report.maxDepth || 0;
        entity = '级联深度';
        break;
      case 'commodityChange':
        // Check for commodity shock in source nodes
        currentValue = (report as any).sourceNodes
          ?.filter((s: any) => s.category === 'supplier')
          ?.reduce((max: number, s: any) => Math.max(max, s.riskScore), 0) || 0;
        break;
      case 'fxDeviation':
        // Check exchange rate deviation
        currentValue = (report as any).sourceNodes
          ?.filter((s: any) => s.category === 'exchange')
          ?.reduce((max: number, s: any) => Math.max(max, s.riskScore), 0) || 0;
        break;
      default:
        continue;
    }

    if (evaluateThreshold(currentValue, rule.operator, rule.threshold)) {
      const unit = rule.unit || '';
      alerts.push({
        ruleId: rule.ruleId,
        ruleName: rule.name,
        severity: rule.severity as 'warning' | 'critical',
        message: `${rule.name}: ${rule.field}=${currentValue}${unit}（${rule.operator} ${rule.threshold}${unit}）`,
        entity,
      });
    }
  }

  return alerts;
}

// ─── Propagation step alerts ─────────────────────────────────────────────────────

function checkPropagationAlerts(propagation: PropagationStep[]): TriggeredAlert[] {
  const alerts: TriggeredAlert[] = [];

  for (const step of propagation) {
    // Alert on high monetary impact
    if ((step.monetaryImpact || 0) > 5000) {
      alerts.push({
        ruleId: 'propagation-monetary',
        ruleName: '单节点高额损失',
        severity: 'critical',
        message: `${step.label}: 预估月损失 $${step.monetaryImpact?.toLocaleString()} — ${step.impactBreakdown}`,
        entity: step.label || 'unknown',
      });
    }

    // Alert on deep propagation (risk spreading far)
    if ((step.depth || 0) >= 4 && (step.riskScore || 0) > 30) {
      alerts.push({
        ruleId: 'propagation-deep',
        ruleName: '级联风险深度传播',
        severity: 'warning',
        message: `${step.label}: 风险经 ${step.depth} 层传播未衰减，当前风险 ${step.riskScore}%`,
        entity: step.label || 'unknown',
      });
    }
  }

  return alerts;
}

// ─── Main Export ─────────────────────────────────────────────────────────────────

export async function evaluateAlerts(report: CascadeReport): Promise<{
  ruleAlerts: TriggeredAlert[];
  propagationAlerts: TriggeredAlert[];
  eventsCreated: number;
}> {
  const ruleAlerts = await checkRules(report);
  const propagationAlerts = checkPropagationAlerts(report.propagation || []);
  const allAlerts = [...ruleAlerts, ...propagationAlerts];
  let eventsCreated = 0;

  for (const alert of allAlerts) {
    try {
      // Check for dedup: same alert in last 4 hours
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
      const existing = await db.supplyChainEvent.findFirst({
        where: {
          type: 'alert',
          title: alert.message,
          createdAt: { gte: fourHoursAgo },
        },
      });
      if (existing) continue;

      await db.supplyChainEvent.create({
        data: {
          type: 'alert',
          title: alert.message,
          description: `规则: ${alert.ruleName}`,
          icon: alert.severity === 'critical' ? '🚨' : '⚠️',
          color: alert.severity === 'critical' ? '#ef4444' : '#f59e0b',
          severity: alert.severity,
        },
      });
      eventsCreated++;
    } catch { continue; }
  }

  return { ruleAlerts, propagationAlerts, eventsCreated };
}

/** Run after cascade risk to auto-trigger alerts */
export async function runAlertCycle(report: CascadeReport): Promise<number> {
  const { eventsCreated } = await evaluateAlerts(report);
  return eventsCreated;
}
