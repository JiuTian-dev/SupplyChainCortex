/**
 * Alert Rules Queries — CRUD for /api/alert-rules.
 * Migrated from services/alert-rules.service.ts.
 */

import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface AlertRuleFilters {
  enabled?: boolean;
}

export interface CreateAlertRuleData {
  ruleId: string;
  name: string;
  field: string;
  operator: string;
  threshold: number;
  unit: string;
  enabled?: boolean;
  severity?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────────

const MAX_TAKE = 100;
const VALID_SEVERITIES = ['warning', 'critical'] as const;

// ─── Core ────────────────────────────────────────────────────────────────────────

export async function getAlertRules(filters: AlertRuleFilters = {}) {
  const { enabled } = filters;
  const where: Record<string, unknown> = {};
  if (enabled !== undefined) where.enabled = enabled;

  const rules = await db.alertRule.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: MAX_TAKE,
  });

  return { rules };
}

export async function updateAlertRule(ruleId: string, data: {
  enabled?: boolean;
  threshold?: number;
  severity?: string;
}) {
  const existing = await db.alertRule.findUnique({ where: { ruleId } });

  if (!existing) {
    throw new Error(`未找到规则: ${ruleId}`);
  }

  if (data.enabled !== undefined && typeof data.enabled !== 'boolean') {
    throw new Error(`规则 ${ruleId} 的 enabled 必须为布尔值`);
  }
  if (data.threshold !== undefined && typeof data.threshold !== 'number') {
    throw new Error(`规则 ${ruleId} 的 threshold 必须为数值`);
  }
  if (data.severity !== undefined && !VALID_SEVERITIES.includes(data.severity as typeof VALID_SEVERITIES[number])) {
    throw new Error(`规则 ${ruleId} 的 severity 必须为 warning 或 critical`);
  }

  const updateData: Record<string, unknown> = {};
  if (data.enabled !== undefined) updateData.enabled = data.enabled;
  if (data.threshold !== undefined) updateData.threshold = data.threshold;
  if (data.severity !== undefined) updateData.severity = data.severity;

  return db.alertRule.update({ where: { ruleId }, data: updateData });
}

export async function createAlertRule(data: CreateAlertRuleData) {
  const { ruleId, name, field, operator, threshold, unit, enabled, severity } = data;

  if (!ruleId || !name || !field || !operator || threshold === undefined) {
    throw new Error('缺少必填字段: ruleId, name, field, operator, threshold');
  }

  const existing = await db.alertRule.findUnique({ where: { ruleId } });
  if (existing) {
    throw new Error(`规则ID ${ruleId} 已存在`);
  }

  return db.alertRule.create({
    data: {
      ruleId,
      name,
      field,
      operator,
      threshold,
      unit: unit || '',
      enabled: enabled !== undefined ? enabled : true,
      severity: severity || 'warning',
    },
  });
}

export async function bulkUpdateAlertRules(rules: Array<{ ruleId: string; enabled?: boolean; threshold?: number; severity?: string }>) {
  if (!rules || !Array.isArray(rules) || rules.length === 0) {
    throw new Error('缺少必填字段: rules (非空数组)');
  }

  for (const rule of rules) {
    if (!rule.ruleId) {
      throw new Error('每条规则必须包含 ruleId');
    }
  }

  const updatedRules: Awaited<ReturnType<typeof updateAlertRule>>[] = [];
  for (const rule of rules) {
    const updated = await updateAlertRule(rule.ruleId, {
      enabled: rule.enabled,
      threshold: rule.threshold,
      severity: rule.severity,
    });
    updatedRules.push(updated);
  }

  return updatedRules;
}
