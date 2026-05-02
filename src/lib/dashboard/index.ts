/**
 * Dashboard Config — barrel exports.
 */

export {
  dashboardConfigSchema,
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig,
  resetConfig,
  classifyRisk,
  CURRENCY_SYMBOLS,
  UNIT_LABELS,
  RISK_LABELS,
  RISK_COLORS,
  RISK_BG_COLORS,
} from './config';
export type {
  DashboardConfig,
  Currency,
  DisplayUnit,
  TimeHorizon,
  Aggregation,
  RiskThresholds,
  RiskLevel,
  PanelVisibility,
} from './config';

export {
  createMetricsFormatter,
  useConfigurableMetric,
} from './metrics';
export type { ConfigurableMetrics } from './metrics';
