/**
 * Cost Service — Type definitions.
 *
 * 所有 interface 和 type 定义集中在此文件，供 calculations.ts / queries.ts 共享。
 */

export interface CostBreakdownItem {
  name: string;
  value: number;
  percentage: number;
}

export interface MarginAnalysis {
  avgMargin: number;
  lowMarginCount: number;
  highMarginCount: number;
  marginDistribution: Array<{ range: string; count: number }>;
}

export interface CostOverview {
  totalProducts: number;
  avgTotalLanded: number;
  avgGrossMargin: number;
  totalLandedRange: { min: number; max: number };
  costAlerts: number;
  exchangeRates: ExchangeRateResponse;
}

export interface ExchangeRateEntry {
  currency: string;
  rate: number;
  updatedAt: string;
}

export interface ExchangeRateResponse {
  rates: ExchangeRateEntry[];
  source: 'external' | 'fallback';
  base: string;
  updatedAt: string;
}

// ─── Internal types ────────────────────────────────────────────────────────────

/** FX 缓存条目（内部使用） */
export interface FxCacheEntry {
  data: ExchangeRateResponse;
  expiresAt: number;
}

/** SSE 广播器类型（由 SSE 路由注入以避免循环依赖） */
export type SseBroadcaster = (_event: string, _data: Record<string, unknown>) => void;
