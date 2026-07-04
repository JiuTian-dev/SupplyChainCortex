/**
 * Cost Service — Query methods and live FX rate logic.
 *
 * 包含：FX 缓存、SSE 广播、实时汇率获取、成本概览/列表/基准/趋势查询。
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { getLatestRates } from '@/lib/queries/exchange-rate.queries';
import { computeMarginAnalysis } from './calculations';
import type {
  CostOverview,
  ExchangeRateEntry,
  ExchangeRateResponse,
  FxCacheEntry,
  SseBroadcaster,
} from './types';

// ─── FX cache (30-min TTL) ─────────────────────────────────────────────────────

let fxCache: FxCacheEntry | null = null;
const FX_CACHE_TTL = 1800 * 1000; // 30 minutes in ms

/** Last-known-good rates — seeded from DB as ultimate fallback */
let lastKnownFxRates: ExchangeRateResponse | null = null;

// ─── SSE broadcast helper (injected by SSE route to avoid circular imports) ───

let sseBroadcast: SseBroadcaster | null = null;

export function setCostSseBroadcaster(fn: SseBroadcaster | null) {
  sseBroadcast = fn;
}

function broadcastCostUpdate(rates: ExchangeRateResponse) {
  if (sseBroadcast) {
    sseBroadcast('cost_metrics_updated', {
      rates: rates.rates,
      source: rates.source,
      updatedAt: rates.updatedAt,
    });
  }
}

// ─── Core Live FX Logic ────────────────────────────────────────────────────────

/** Get live exchange rates using shared exchange-rate.service, with 30-min caching and graceful degradation */
export async function getLiveExchangeRates(): Promise<ExchangeRateResponse> {
  const now = Date.now();

  // Return cached if fresh
  if (fxCache && fxCache.expiresAt > now) {
    return fxCache.data;
  }

  const nowISO = new Date().toISOString();
  let rates: ExchangeRateEntry[] = [];
  let source: 'external' | 'fallback' = 'external';

  try {
    const liveData = await getLatestRates('CNY');
    for (const [currency, rate] of Object.entries(liveData.rates)) {
      if (typeof rate === 'number') {
        rates.push({ currency, rate, updatedAt: nowISO });
      }
    }
  } catch {
    // API failed — use fallback
  }

  // If API call failed, degrade gracefully
  if (rates.length === 0) {
    if (lastKnownFxRates) {
      rates = lastKnownFxRates.rates.map(r => ({ ...r, updatedAt: nowISO }));
      source = 'fallback';
    } else {
      // Ultimate fallback: query DB
      const dbCosts = await db.costRecord.findMany({
        select: { exchangeRate: true, destination: true },
        take: 5,
        orderBy: { updatedAt: 'desc' },
      });
      const dbRate = dbCosts.length > 0 ? dbCosts[0].exchangeRate : 7.25;
      rates = ['USD', 'EUR', 'GBP', 'JPY'].map(currency => ({
        currency,
        rate: Math.round((1 / dbRate) * 100000) / 100000,
        updatedAt: nowISO,
      }));
      source = 'fallback';
    }
  }

  const response: ExchangeRateResponse = { rates, source, base: 'CNY', updatedAt: nowISO };

  fxCache = { data: response, expiresAt: now + FX_CACHE_TTL };
  lastKnownFxRates = response;

  if (source === 'external') broadcastCostUpdate(response);

  return response;
}

/** Force refresh the FX cache (useful after data mutation) */
export function invalidateFxCache() {
  fxCache = null;
}

/** Get a single rate for a target currency */
export async function getRateForCurrency(target: string): Promise<number> {
  const response = await getLiveExchangeRates();
  const entry = response.rates.find(r => r.currency === target);
  return typeof entry?.rate === 'number' ? entry.rate : (1 / 7.25); // fallback to ~USD rate
}

// ─── Query Methods ─────────────────────────────────────────────────────────────

/** Get cost overview stats with live exchange rates */
export async function getCostOverview(category?: string): Promise<CostOverview> {
  const where: Record<string, unknown> = {};
  if (category) where.product = { category };

  const [costRecords, exchangeRates] = await Promise.all([
    db.costRecord.findMany({ where, select: { totalLanded: true, grossMargin: true } }),
    getLiveExchangeRates(),
  ]);

  const total = costRecords.length;
  if (total === 0) {
    return {
      totalProducts: 0, avgTotalLanded: 0, avgGrossMargin: 0,
      totalLandedRange: { min: 0, max: 0 }, costAlerts: 0,
      exchangeRates,
    };
  }

  const totalLandedValues = costRecords.map(c => c.totalLanded);
  const avgTotalLanded = Math.round((totalLandedValues.reduce((a, b) => a + b, 0) / total) * 100) / 100;
  const avgGrossMargin = Math.round((costRecords.reduce((s, c) => s + c.grossMargin, 0) / total) * 10) / 10;
  const costAlerts = costRecords.filter(c => c.grossMargin < 48).length;

  return {
    totalProducts: total,
    avgTotalLanded,
    avgGrossMargin,
    totalLandedRange: {
      min: Math.round(Math.min(...totalLandedValues) * 100) / 100,
      max: Math.round(Math.max(...totalLandedValues) * 100) / 100,
    },
    costAlerts,
    exchangeRates,
  };
}

/** Get cost list with filters and pagination */
export async function getCostList(params: {
  minMargin?: number;
  maxMargin?: number;
  category?: string;
  skus?: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}) {
  const { minMargin, maxMargin, category, skus, sortBy, sortOrder = 'asc', page = 1, pageSize = 20 } = params;

  const where: Record<string, unknown> = {};
  if (minMargin !== undefined || maxMargin !== undefined) {
    const marginFilter: Record<string, number> = {};
    if (minMargin !== undefined) marginFilter.gte = minMargin;
    if (maxMargin !== undefined) marginFilter.lte = maxMargin;
    where.grossMargin = marginFilter;
  }
  if (category) where.product = { category };
  if (skus && skus.length > 0) where.sku = { in: skus };

  const costs = await db.costRecord.findMany({ where, include: { product: true }, take: 1000 });

  // Fetch live exchange rates for recalculation
  const liveRates: Record<string, number> = {};
  try {
    const liveData = await getLiveExchangeRates();
    for (const entry of liveData.rates) {
      // Convert CNY→Target rate to Target→CNY (1 unit = ? CNY)
      if (entry.rate > 0) liveRates[entry.currency] = 1 / entry.rate;
    }
  } catch { /* keep DB values */ }

  let formattedCosts = costs.map(cost => {
    const destCode = (cost.destination || 'US').toUpperCase();
    const rateMap: Record<string, string> = { US: 'USD', EU: 'EUR', GB: 'GBP', JP: 'JPY', KR: 'KRW' };
    const currency = rateMap[destCode] || 'USD';
    const liveRate = liveRates[currency];

    // Recalculate with live rate if available
    let liveTotalLanded = cost.totalLanded;
    let liveGrossMargin = cost.grossMargin;
    if (liveRate && liveRate > 0) {
      const cnyParts = (cost.rawMaterial || 0) + (cost.labor || 0);
      const usdParts = (cost.logistics || 0) + (cost.tariff || 0) + (cost.platformFee || 0);
      liveTotalLanded = Math.round((cnyParts / liveRate + usdParts) * 100) / 100;
      liveGrossMargin = cost.sellingPrice > 0
        ? Math.round(((cost.sellingPrice - liveTotalLanded) / cost.sellingPrice) * 1000) / 10
        : cost.grossMargin;
    }

    return {
      ...cost,
      category: cost.product?.category,
      exchangeRateStored: cost.exchangeRate,
      exchangeRateLive: liveRate || cost.exchangeRate,
      totalLandedStored: cost.totalLanded,
      totalLandedLive: liveTotalLanded,
      grossMarginStored: cost.grossMargin,
      grossMarginLive: liveGrossMargin,
      hasLiveRate: !!liveRate,
    };
  }) as Record<string, unknown>[];

  const validSortFields = ['grossMargin', 'totalLanded', 'rawMaterial', 'logistics', 'tariff'];
  if (sortBy && validSortFields.includes(sortBy)) {
    formattedCosts = formattedCosts.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal as string);
      }
      return 0;
    });
  }

  const total = formattedCosts.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const start = (page - 1) * pageSize;
  const paginatedData = formattedCosts.slice(start, start + pageSize);

  return {
    costs: paginatedData,
    liveExchangeRates: Object.keys(liveRates).length > 0 ? liveRates : undefined,
    pagination: { page, pageSize, total, totalPages },
    filters: { minMargin: minMargin ?? null, maxMargin: maxMargin ?? null, category: category || null, sortBy: sortBy || null, sortOrder },
  };
}

/** Get cost benchmark comparison */
export async function getCostBenchmark(category?: string) {
  const where: Record<string, unknown> = {};
  if (category) where.product = { category };

  const costRecords = await db.costRecord.findMany({ where, include: { product: true }, take: 1000 });

  const categoryStats: Record<string, {
    count: number; avgTotalLanded: number; avgGrossMargin: number;
    avgLogistics: number; avgTariff: number; avgRawMaterial: number; avgLabor: number;
  }> = {};

  costRecords.forEach((cost) => {
    const cat = cost.product?.category || '未分类';
    if (!categoryStats[cat]) {
      categoryStats[cat] = { count: 0, avgTotalLanded: 0, avgGrossMargin: 0, avgLogistics: 0, avgTariff: 0, avgRawMaterial: 0, avgLabor: 0 };
    }
    const stats = categoryStats[cat];
    stats.count++;
    stats.avgTotalLanded += cost.totalLanded;
    stats.avgGrossMargin += cost.grossMargin;
    stats.avgLogistics += cost.logistics;
    stats.avgTariff += cost.tariff;
    stats.avgRawMaterial += cost.rawMaterial;
    stats.avgLabor += cost.labor;
  });

  for (const stats of Object.values(categoryStats)) {
    const n = stats.count || 1;
    stats.avgTotalLanded = Math.round((stats.avgTotalLanded / n) * 100) / 100;
    stats.avgGrossMargin = Math.round((stats.avgGrossMargin / n) * 10) / 10;
    stats.avgLogistics = Math.round((stats.avgLogistics / n) * 100) / 100;
    stats.avgTariff = Math.round((stats.avgTariff / n) * 100) / 100;
    stats.avgRawMaterial = Math.round((stats.avgRawMaterial / n) * 100) / 100;
    stats.avgLabor = Math.round((stats.avgLabor / n) * 100) / 100;
  }

  const benchmarks = costRecords.map((cost) => {
    const cat = cost.product?.category || '未分类';
    const stats = categoryStats[cat];

    const totalLandedDiff = cost.totalLanded - stats.avgTotalLanded;
    const grossMarginDiff = cost.grossMargin - stats.avgGrossMargin;
    const logisticsDiff = cost.logistics - stats.avgLogistics;
    const tariffDiff = cost.tariff - stats.avgTariff;

    const totalLandedPercent = stats.avgTotalLanded > 0
      ? Math.round((totalLandedDiff / stats.avgTotalLanded) * 1000) / 10 : 0;

    type PerformanceLevel = 'excellent' | 'good' | 'average' | 'poor';
    let performance: PerformanceLevel = 'average';
    if (grossMarginDiff > 5 && totalLandedDiff < 0) performance = 'excellent';
    else if (grossMarginDiff > 2 || (grossMarginDiff > 0 && totalLandedDiff < 0)) performance = 'good';
    else if (grossMarginDiff < -5 || totalLandedPercent > 15) performance = 'poor';

    return {
      sku: cost.sku, productName: cost.productName, category: cat,
      totalLanded: cost.totalLanded, categoryAvgTotalLanded: stats.avgTotalLanded,
      totalLandedDiff: Math.round(totalLandedDiff * 100) / 100, totalLandedPercent,
      grossMargin: cost.grossMargin, categoryAvgGrossMargin: stats.avgGrossMargin, grossMarginDiff,
      logistics: cost.logistics, categoryAvgLogistics: stats.avgLogistics,
      logisticsDiff: Math.round(logisticsDiff * 100) / 100,
      tariff: cost.tariff, categoryAvgTariff: stats.avgTariff,
      tariffDiff: Math.round(tariffDiff * 100) / 100,
      performance,
      insight: getBenchmarkInsight(performance, totalLandedPercent, grossMarginDiff, logisticsDiff, tariffDiff),
    };
  });

  const performanceOrder = { excellent: 0, good: 1, average: 2, poor: 3 };
  benchmarks.sort((a, b) => performanceOrder[a.performance] - performanceOrder[b.performance]);

  return {
    benchmarks,
    categoryAverages: categoryStats,
    summary: {
      totalProducts: costRecords.length, categories: Object.keys(categoryStats).length,
      excellent: benchmarks.filter((b) => b.performance === 'excellent').length,
      good: benchmarks.filter((b) => b.performance === 'good').length,
      average: benchmarks.filter((b) => b.performance === 'average').length,
      poor: benchmarks.filter((b) => b.performance === 'poor').length,
    },
  };
}

/** Get cost trend analysis with live FX + commodity awareness */
export async function getCostTrend(category?: string, months = 6) {
  const key = cacheKey('cost', 'trend', category || 'all', months);

  return cachedFetch(key, async () => {
    const where: Record<string, unknown> = {};
    if (category) where.product = { category };

    const [costRecords, liveRates] = await Promise.all([
      db.costRecord.findMany({ where, include: { product: true }, take: 1000 }),
      getLiveExchangeRates(),
    ]);

    // Fetch live commodity trend data for BOM cost estimation
    const commodityTrend: Record<string, number> = {};
    try {
      const { fetchDailyCommodities } = await import('@/lib/sources/alphavantage-commodities');
      const commodities = await fetchDailyCommodities();
      for (const c of commodities) {
        commodityTrend[c.code] = c.changePct;
      }
    } catch { /* use zero trend */ }

    const trends = costRecords.map((cost) => {
      const monthlyData: { month: string; totalLanded: number; grossMargin: number; rawMaterial: number; logistics: number; tariff: number }[] = [];
      const cat = cost.product?.category || '厨房电器';

      for (let m = months; m >= 1; m--) {
        // Commodity-driven BOM variation replaces synthetic hash
        const bomVar = estimateBOMVariation(cat, m, commodityTrend);

        const _logisticsVariation = 0; // logistics doesn't vary much month-to-month without SCFI data
        const _tariffVariation = 0;     // tariffs are policy-driven, not monthly

        const rawMaterial = Math.round((cost.rawMaterial || 0) * (1 + bomVar) * 100) / 100;
        const logistics = Math.round((cost.logistics || 0) * 100) / 100;
        const tariff = Math.round((cost.tariff || 0) * 100) / 100;
        const totalLanded = Math.round((cost.totalLanded || 0) * (1 + bomVar * 0.7) * 100) / 100;
        const sellingPrice = cost.sellingPrice || 1;
        const grossMargin = Math.round(((sellingPrice - totalLanded) / sellingPrice) * 1000) / 10;

        const monthLabel = new Date(Date.now() - m * 30 * 86400000).toISOString().slice(0, 7);
        monthlyData.push({ month: monthLabel, totalLanded, grossMargin, rawMaterial, logistics, tariff });
      }

      monthlyData.push({
        month: new Date().toISOString().slice(0, 7),
        totalLanded: cost.totalLanded,
        grossMargin: cost.grossMargin,
        rawMaterial: cost.rawMaterial,
        logistics: cost.logistics,
        tariff: cost.tariff,
      });

      const firstHalf = monthlyData.slice(0, Math.ceil(monthlyData.length / 2));
      const secondHalf = monthlyData.slice(Math.ceil(monthlyData.length / 2));
      const avg1 = firstHalf.length > 0 ? firstHalf.reduce((s, d) => s + d.totalLanded, 0) / firstHalf.length : 0;
      const avg2 = secondHalf.length > 0 ? secondHalf.reduce((s, d) => s + d.totalLanded, 0) / secondHalf.length : 0;
      const trendDirection: "increasing" | "decreasing" | "stable" =
        avg2 > avg1 * 1.02 ? "increasing" : avg2 < avg1 * 0.98 ? "decreasing" : "stable";

      const firstMargin = monthlyData[0]?.grossMargin ?? 0;
      const lastMargin = monthlyData[monthlyData.length - 1]?.grossMargin ?? 0;
      const marginTrend: "improving" | "declining" | "stable" =
        lastMargin > firstMargin + 1 ? "improving" : lastMargin < firstMargin - 1 ? "declining" : "stable";

      return { sku: cost.sku, productName: cost.productName, category: cost.product?.category, currentTotalLanded: cost.totalLanded, currentMargin: cost.grossMargin, costTrend: trendDirection, marginTrend, monthlyData };
    });

    return {
      months, trends,
      exchangeRates: liveRates,
      summary: {
        totalProducts: costRecords.length,
        costIncreasing: trends.filter((t) => t.costTrend === "increasing").length,
        costDecreasing: trends.filter((t) => t.costTrend === "decreasing").length,
        marginDeclining: trends.filter((t) => t.marginTrend === "declining").length,
        marginImproving: trends.filter((t) => t.marginTrend === "improving").length,
      },
    };
  }, CACHE_TTL.MEDIUM);
}

// ─── Internal Helpers ──────────────────────────────────────────────────────────

/**
 * Estimate commodity-driven BOM cost variation for a product category.
 * Different product types have different material exposure:
 * - 厨房电器 (kitchen): more steel + copper (motors, heating elements)
 * - 清洁电器 (cleaning): more plastic + copper (motors, housings)
 * - 个护电器 (personal care): more plastic + aluminum
 * Returns a multiplier representing the relative change in raw material cost.
 */
function estimateBOMVariation(category: string, monthOffset: number, commodityTrend: Record<string, number>): number {
  // Material weights by product category
  const weights: Record<string, { cu: number; al: number; st: number; pp: number; pvc: number }> = {
    '厨房电器': { cu: 0.30, al: 0.10, st: 0.40, pp: 0.15, pvc: 0.05 },
    '清洁电器': { cu: 0.25, al: 0.05, st: 0.20, pp: 0.40, pvc: 0.10 },
    '个护电器': { cu: 0.15, al: 0.20, st: 0.10, pp: 0.45, pvc: 0.10 },
    '环境电器': { cu: 0.20, al: 0.15, st: 0.25, pp: 0.30, pvc: 0.10 },
  };

  const w = weights[category] || { cu: 0.25, al: 0.10, st: 0.25, pp: 0.30, pvc: 0.10 };

  // Weighted commodity change (monthOffset months ago)
  const change = (commodityTrend['COPPER'] || 0) * w.cu
    + (commodityTrend['ALUMINUM'] || 0) * w.al
    + (commodityTrend['STEEL_HRC'] || 0) * w.st
    + (commodityTrend['PLASTIC_PP'] || 0) * w.pp
    + (commodityTrend['PLASTIC_PVC'] || 0) * w.pvc;

  // Scale: 1% commodity change ≈ 0.6% BOM change (labor + overhead dampen the effect)
  return change * 0.006 * (1 + monthOffset * 0.1); // earlier months have less impact
}

function getBenchmarkInsight(
  performance: string, totalLandedPercent: number, grossMarginDiff: number,
  logisticsDiff: number, tariffDiff: number
): string {
  if (performance === 'excellent') return '成本控制优秀，毛利率高于品类平均，可作为标杆产品';
  if (performance === 'good') return '表现良好，略优于品类平均，仍有优化空间';
  if (performance === 'poor') {
    const reasons: string[] = [];
    if (totalLandedPercent > 10) reasons.push('总到岸成本显著高于品类平均');
    if (grossMarginDiff < -5) reasons.push('毛利率大幅低于品类平均');
    if (logisticsDiff > 0) reasons.push('物流成本高于品类平均');
    if (tariffDiff > 0) reasons.push('关税成本高于品类平均');
    return reasons.length > 0 ? `表现不佳：${reasons.join('，')}，需要重点优化` : '表现不佳，需综合优化成本结构';
  }
  return '表现接近品类平均水平，建议针对性优化以提升竞争力';
}

/** Get cost overview combined with margin analysis (used by /api/cost?action=overview) */
export async function getCostOverviewWithMargin(category?: string) {
  const [overview, costRecords] = await Promise.all([
    getCostOverview(category),
    db.costRecord.findMany({
      where: category ? { product: { category } } : {},
      take: 1000,
    }),
  ]);
  const marginAnalysis = computeMarginAnalysis(costRecords);
  return { overview, marginAnalysis };
}
