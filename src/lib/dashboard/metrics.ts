/**
 * Configurable Metrics Hook — Power-BI-style formatted display.
 *
 * Every visualization component MUST use this hook instead of
 * hardcoding units, thresholds, colors, or currency symbols.
 *
 * Usage:
 *   const { formatCurrency, formatRiskLevel, getRiskColor } = useConfigurableMetric();
 */

'use client';

import {
  type DashboardConfig,
  type RiskLevel,
  CURRENCY_SYMBOLS,
  RISK_LABELS,
  RISK_COLORS,
  classifyRisk,
} from './config';

export interface ConfigurableMetrics {
  config: DashboardConfig;

  // Currency formatting
  formatCurrency(amountCny: number): string;
  convertCurrency(amountCny: number): number;

  // Risk classification
  formatRiskLevel(score: number): { label: string; color: string; level: RiskLevel };
  getRiskColor(score: number): string;
  getRiskLabel(score: number): string;

  // Unit display
  formatQuantity(qty: number): string;
  formatUnit(): string;

  // Time
  formatTimeWindow(days: number): string;

  // Percentage
  formatPercent(value: number): string;
}

/**
 * Factory: creates a metrics formatter bound to a specific config.
 * Use this in Zustand selectors or when config comes from a store.
 */
export function createMetricsFormatter(config: DashboardConfig): ConfigurableMetrics {
  const { currency, currencyRate, riskThresholds, unit } = config;

  return {
    config,

    formatCurrency(amountCny: number): string {
      const converted = amountCny / currencyRate;
      const symbol = CURRENCY_SYMBOLS[currency];
      if (Math.abs(converted) >= 1e6) {
        return `${symbol}${(converted / 1e6).toFixed(2)}M`;
      }
      if (Math.abs(converted) >= 1e4) {
        return `${symbol}${(converted / 1e4).toFixed(1)}万`;
      }
      return `${symbol}${converted.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    },

    convertCurrency(amountCny: number): number {
      return Math.round(amountCny / currencyRate * 100) / 100;
    },

    formatRiskLevel(score: number) {
      const level = classifyRisk(score, riskThresholds);
      return {
        label: RISK_LABELS[level],
        color: RISK_COLORS[level],
        level,
      };
    },

    getRiskColor(score: number): string {
      return RISK_COLORS[classifyRisk(score, riskThresholds)];
    },

    getRiskLabel(score: number): string {
      return RISK_LABELS[classifyRisk(score, riskThresholds)];
    },

    formatQuantity(qty: number): string {
      if (qty >= 1e6) return `${(qty / 1e6).toFixed(2)}M`;
      if (qty >= 1e4) return `${(qty / 1e4).toFixed(1)}万`;
      return qty.toLocaleString('zh-CN');
    },

    formatUnit(): string {
      return unit === 'pieces' ? '件' : unit === 'TEU' ? 'TEU' : '吨';
    },

    formatTimeWindow(days: number): string {
      if (days <= 1) return '24小时';
      if (days <= 7) return `${days}天`;
      if (days <= 30) return `${Math.round(days / 7)}周`;
      return `${Math.round(days / 30)}个月`;
    },

    formatPercent(value: number): string {
      return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
    },
  };
}

/**
 * Hook: derive metrics formatter from a config object.
 * Re-memoizes only when config values change.
 */
export function useConfigurableMetric(config: DashboardConfig): ConfigurableMetrics {
  return createMetricsFormatter(config);
}
