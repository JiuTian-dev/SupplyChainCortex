/**
 * Analytics Barrel — re-exports all analytics query functions.
 * Replace for the former services/analytics.service.ts.
 */

export { getSupplierPerformanceAnalytics, getSupplierPerformanceAnalyticsEnhanced } from './analytics-supplier.queries';
export { getCostOptimizationAnalytics, getCostTrendsAnalytics } from './analytics-cost.queries';
export { getInventoryForecastAnalytics, getInventoryOptimizationAnalytics, getInventoryTurnoverAnalytics } from './analytics-inventory.queries';
export { getSupplyChainRiskAnalytics, getSalesForecastAnalytics } from './analytics-risk-sales.queries';
export { getKPIAnalytics, getTimeSeriesAnalytics, getComparisonAnalytics, getAnomaliesAnalytics } from './analytics-executive.queries';
export type { TimeSeriesParams } from './analytics-executive.queries';
