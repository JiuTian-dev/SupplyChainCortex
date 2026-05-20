/**
 * Dashboard Configuration — Power-BI-style configurable metrics.
 *
 * All visualization components consume this config via useConfigurableMetric().
 * No hardcoded units, thresholds, or colors anywhere in the UI.
 *
 * Persistence: localStorage (key: 'dashboard-config') with Zod validation.
 */

import { z } from 'zod';

// ─── Schema ──────────────────────────────────────────────────────────────────────

export const currencySchema = z.enum(['CNY', 'USD', 'EUR']);
export const unitSchema = z.enum(['pieces', 'TEU', 'tons']);
export const timeHorizonSchema = z.enum(['7d', '30d', '90d', '6M', '1Y']);
export const aggregationSchema = z.enum(['daily', 'weekly', 'monthly']);

export const riskThresholdsSchema = z.object({
  low: z.number().min(0).max(100).default(15),
  medium: z.number().min(0).max(100).default(40),
  high: z.number().min(0).max(100).default(70),
});

export const panelsSchema = z.record(z.string(), z.boolean());

export const panelOrderSchema = z.array(z.string()).default([
  'monitor', 'cascade-risk', 'decision-center', 'sandbox', 'calibration',
  'inventory', 'cost', 'logistics', 'sales', 'supplier', 'risk',
]);

export const dashboardConfigSchema = z.object({
  currency: currencySchema.default('CNY'),
  currencyRate: z.number().positive().default(7.25),
  unit: unitSchema.default('pieces'),
  riskThresholds: riskThresholdsSchema.default({ low: 15, medium: 40, high: 70 }),
  timeHorizon: timeHorizonSchema.default('30d'),
  aggregation: aggregationSchema.default('daily'),
  panelOrder: panelOrderSchema,
  panels: panelsSchema.default({
    monitor: true, 'cascade-risk': true, 'decision-center': true, sandbox: false,
    inventory: true, cost: true, logistics: true, supplier: true, risk: true,
    sales: false, dashboard: false,
  }),
  showCounterfactual: z.boolean().default(true),
  enableFeedbackTracking: z.boolean().default(true),
});

export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;
export type Currency = z.infer<typeof currencySchema>;
export type DisplayUnit = z.infer<typeof unitSchema>;
export type TimeHorizon = z.infer<typeof timeHorizonSchema>;
export type Aggregation = z.infer<typeof aggregationSchema>;
export type RiskThresholds = z.infer<typeof riskThresholdsSchema>;
export type PanelVisibility = Record<string, boolean>;

// ─── Defaults ────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'dashboard-config';

export const DEFAULT_CONFIG: DashboardConfig = {
  currency: 'CNY',
  currencyRate: 7.25,
  unit: 'pieces',
  riskThresholds: { low: 15, medium: 40, high: 70 },
  timeHorizon: '30d',
  aggregation: 'daily',
  panelOrder: ['monitor', 'cascade-risk', 'decision-center', 'sandbox', 'calibration',
    'inventory', 'cost', 'logistics', 'sales', 'supplier', 'risk'],
  panels: { monitor: true, analysis: true, decision: true, simulation: true },
  showCounterfactual: true,
  enableFeedbackTracking: true,
};

// ─── Persistence ─────────────────────────────────────────────────────────────────

export function loadConfig(): DashboardConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_CONFIG };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    const result = dashboardConfigSchema.safeParse(parsed);
    return result.success ? result.data : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: DashboardConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* silently ignore */ }
}

export function resetConfig(): DashboardConfig {
  const defaults = { ...DEFAULT_CONFIG };
  if (typeof window !== 'undefined') {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
  return defaults;
}

// ─── Currency Display ────────────────────────────────────────────────────────────

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
};

export const UNIT_LABELS: Record<DisplayUnit, string> = {
  pieces: '件',
  TEU: 'TEU',
  tons: '吨',
};

// ─── Risk Level ──────────────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export function classifyRisk(score: number, thresholds: RiskThresholds): RiskLevel {
  if (score >= thresholds.high) return 'critical';
  if (score >= thresholds.medium) return 'high';
  if (score >= thresholds.low) return 'medium';
  return 'low';
}

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: '正常',
  medium: '关注',
  high: '预警',
  critical: '危险',
};

export const RISK_COLORS: Record<RiskLevel, string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

export const TIME_HORIZON_LABELS: Record<TimeHorizon, string> = {
  '7d': '7天',
  '30d': '30天',
  '90d': '90天',
  '6M': '6个月',
  '1Y': '1年',
};

export const TIME_HORIZON_DAYS: Record<TimeHorizon, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '6M': 180,
  '1Y': 365,
};

export const RISK_BG_COLORS: Record<RiskLevel, string> = {
  low: 'bg-green-50 dark:bg-green-950/20',
  medium: 'bg-yellow-50 dark:bg-yellow-950/20',
  high: 'bg-orange-50 dark:bg-orange-950/20',
  critical: 'bg-red-50 dark:bg-red-950/20',
};
