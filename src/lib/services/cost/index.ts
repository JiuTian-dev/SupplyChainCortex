/**
 * Cost Service barrel — re-exports all public APIs.
 *
 * 公共 import 路径：`@/lib/services/cost.service`（薄 barrel）或 `@/lib/services/cost`。
 */

// Types
export type {
  CostBreakdownItem,
  MarginAnalysis,
  CostOverview,
  ExchangeRateEntry,
  ExchangeRateResponse,
} from './types';

// Calculations
export {
  computeCostBreakdown,
  computeMarginAnalysis,
  simulateCostImpact,
  getLandedCostDetail,
  getLandedCostOrThrow,
  getCostBreakdownForSku,
  simulateCosts,
  getCostOptimization,
} from './calculations';

// Queries (incl. FX cache + SSE)
export {
  setCostSseBroadcaster,
  getLiveExchangeRates,
  invalidateFxCache,
  getRateForCurrency,
  getCostOverview,
  getCostOverviewWithMargin,
  getCostList,
  getCostBenchmark,
  getCostTrend,
} from './queries';
