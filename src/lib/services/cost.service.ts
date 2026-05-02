/**
 * Cost Service — Business logic for cost analytics with live FX rates.
 * Uses shared exchange-rate.service.ts for Frankfurter API integration.
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { getRateForDestination } from '@/lib/exchange-rate';
import { getLatestRates, getRateHistory } from '@/lib/queries/exchange-rate.queries';
import { computeTariff } from '@/lib/services/tariff.service';

// ─── Types ─────────────────────────────────────────────────────────────────────

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

// ─── FX cache (30-min TTL) ─────────────────────────────────────────────────────

interface FxCacheEntry {
  data: ExchangeRateResponse;
  expiresAt: number;
}

let fxCache: FxCacheEntry | null = null;
const FX_CACHE_TTL = 1800 * 1000; // 30 minutes in ms

/** Last-known-good rates — seeded from DB as ultimate fallback */
let lastKnownFxRates: ExchangeRateResponse | null = null;

// ─── SSE broadcast helper (injected by SSE route to avoid circular imports) ───

type SseBroadcaster = (event: string, data: Record<string, unknown>) => void;
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

// ─── Core Business Logic ───────────────────────────────────────────────────────

/** Compute cost breakdown percentages for a single record */
export function computeCostBreakdown(costRecord: {
  rawMaterial: number;
  labor: number;
  logistics: number;
  tariff: number;
  platformFee: number;
  totalLanded: number;
}): CostBreakdownItem[] {
  const total = costRecord.totalLanded || 1;
  return [
    { name: '原材料', value: costRecord.rawMaterial, percentage: Math.round((costRecord.rawMaterial / total) * 1000) / 10 },
    { name: '人工', value: costRecord.labor, percentage: Math.round((costRecord.labor / total) * 1000) / 10 },
    { name: '物流', value: costRecord.logistics, percentage: Math.round((costRecord.logistics / total) * 1000) / 10 },
    { name: '关税', value: costRecord.tariff, percentage: Math.round((costRecord.tariff / total) * 1000) / 10 },
    { name: '平台费', value: costRecord.platformFee, percentage: Math.round((costRecord.platformFee / total) * 1000) / 10 },
  ];
}

/** Compute margin analysis across cost records */
export function computeMarginAnalysis(costRecords: Array<{ grossMargin: number }>): MarginAnalysis {
  const total = costRecords.length;
  if (total === 0) {
    return { avgMargin: 0, lowMarginCount: 0, highMarginCount: 0, marginDistribution: [] };
  }

  const avgMargin = Math.round((costRecords.reduce((s, c) => s + c.grossMargin, 0) / total) * 10) / 10;
  const lowMarginCount = costRecords.filter(c => c.grossMargin < 40).length;
  const highMarginCount = costRecords.filter(c => c.grossMargin >= 60).length;

  const ranges = [
    { range: '< 30%', min: -Infinity, max: 30 },
    { range: '30-40%', min: 30, max: 40 },
    { range: '40-50%', min: 40, max: 50 },
    { range: '50-60%', min: 50, max: 60 },
    { range: '≥ 60%', min: 60, max: Infinity },
  ];

  const marginDistribution = ranges.map(r => ({
    range: r.range,
    count: costRecords.filter(c => c.grossMargin >= r.min && c.grossMargin < r.max).length,
  }));

  return { avgMargin, lowMarginCount, highMarginCount, marginDistribution };
}

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

/** Simulate cost changes using live exchange rates */
export async function simulateCostImpact(
  costRecord: {
    rawMaterial: number; labor: number; logistics: number;
    tariff: number; platformFee: number; totalLanded: number;
    sellingPrice: number; grossMargin: number; exchangeRate: number;
    sku?: string; category?: string; subCategory?: string; destination?: string;
  },
  params: {
    exchangeRateChange?: number; freightChange?: number; rawMaterialChange?: number;
    tariffChange?: number; laborChange?: number; platformFeeChange?: number;
  }
): Promise<{
  simulatedTotalLanded: number; simulatedMargin: number; marginChange: number;
  totalLandedChange: number; usedRate: number; rateSource: 'external' | 'fallback';
  liveTariffUsed: boolean; liveTariffRate: number; storedTariff: number;
}> {
  const liveRates = await getLiveExchangeRates();
  const usdEntry = liveRates.rates.find(r => r.currency === 'USD');
  const liveRate = typeof usdEntry?.rate === 'number' ? usdEntry.rate : (1 / (costRecord.exchangeRate || 7.25));
  const currentFxRate = 1 / liveRate;

  // Get live tariff from tariff engine
  let liveTariffRate = costRecord.tariff || 0;
  let liveTariffUsed = false;
  try {
    if (costRecord.category && costRecord.destination) {
      const tariffResult = await computeTariff({
        category: costRecord.category,
        subCategory: costRecord.subCategory,
        countryCode: costRecord.destination,
        sellingPrice: costRecord.sellingPrice,
      });
      if (tariffResult.rules.length > 0) {
        liveTariffRate = (tariffResult.rate / 100) * costRecord.sellingPrice; // Convert % → absolute
        liveTariffUsed = true;
      }
    }
  } catch { /* fall back to stored tariff */ }

  const fxChangePct = (params.exchangeRateChange ?? 0) / 100;
  const freightChangePct = (params.freightChange ?? 0) / 100;
  const rawMatChangePct = (params.rawMaterialChange ?? 0) / 100;
  const tariffChangePct = (params.tariffChange ?? 0) / 100;
  const laborChangePct = (params.laborChange ?? 0) / 100;
  const platformFeeChangePct = (params.platformFeeChange ?? 0) / 100;

  const newRawMaterial = (costRecord.rawMaterial || 0) * (1 + rawMatChangePct);
  const newLabor = (costRecord.labor || 0) * (1 + laborChangePct);
  const newLogistics = (costRecord.logistics || 0) * (1 + freightChangePct);
  // Use live tariff as base for simulation
  const baseTariff = liveTariffUsed ? liveTariffRate : (costRecord.tariff || 0);
  const newTariff = baseTariff * (1 + tariffChangePct);
  const newPlatformFee = (costRecord.platformFee || 0) * (1 + platformFeeChangePct);

  const effRate = currentFxRate * (1 + fxChangePct);
  const newCnyTotal = effRate > 0 ? (newRawMaterial + newLabor) / effRate : 0;
  const newUsdTotal = newLogistics + newTariff + newPlatformFee;
  const newTotalLanded = Math.round((newCnyTotal + newUsdTotal) * 100) / 100;

  const sellingPrice = costRecord.sellingPrice || 1;
  const newMargin = ((sellingPrice - newTotalLanded) / sellingPrice) * 100;
  const oldMargin = costRecord.grossMargin || 0;

  return {
    simulatedTotalLanded: newTotalLanded,
    simulatedMargin: Math.round(newMargin * 10) / 10,
    marginChange: Math.round((newMargin - oldMargin) * 10) / 10,
    totalLandedChange: Math.round((newTotalLanded - (costRecord.totalLanded || 0)) * 100) / 100,
    usedRate: Math.round(liveRate * 100000) / 100000,
    rateSource: liveRates.source,
    liveTariffUsed,
    liveTariffRate: Math.round(baseTariff * 100) / 100,
    storedTariff: costRecord.tariff || 0,
  };
}

/** Get cost list with filters and pagination */
export async function getCostList(params: {
  minMargin?: number;
  maxMargin?: number;
  category?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}) {
  const { minMargin, maxMargin, category, sortBy, sortOrder = 'asc', page = 1, pageSize = 20 } = params;

  const where: Record<string, unknown> = {};
  if (minMargin !== undefined || maxMargin !== undefined) {
    const marginFilter: Record<string, number> = {};
    if (minMargin !== undefined) marginFilter.gte = minMargin;
    if (maxMargin !== undefined) marginFilter.lte = maxMargin;
    where.grossMargin = marginFilter;
  }
  if (category) where.product = { category };

  const costs = await db.costRecord.findMany({ where, include: { product: true }, take: 1000 });

  // Fetch live exchange rates for recalculation
  let liveRates: Record<string, number> = {};
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

/** Get landed cost detail for a SKU — uses live FX rates */
export async function getLandedCostDetail(params: {
  sku: string;
  minMargin?: number;
  maxMargin?: number;
  category?: string;
  asOfDate?: string;
}) {
  const { sku, minMargin, maxMargin, category, asOfDate } = params;

  const cost = await db.costRecord.findFirst({ where: { sku }, include: { product: true } });
  if (!cost) return null;
  if (minMargin !== undefined && cost.grossMargin < minMargin) return null;
  if (maxMargin !== undefined && cost.grossMargin > maxMargin) return null;
  if (category && cost.product?.category !== category) return null;

  // Use live FX rate for current calculation
  const liveRates = await getLiveExchangeRates();
  const usdEntry = liveRates.rates.find(r => r.currency === 'USD');
  const liveUsdRate = typeof usdEntry?.rate === 'number' ? usdEntry.rate : (1 / (cost.exchangeRate || 7.25));

  let exchangeRateAsOf = 1 / liveUsdRate;
  if (asOfDate) {
    // Use shared exchange-rate service for historical rate
    try {
      const history = await getRateHistory('CNY', 'USD', 1);
      const histEntry = history.find(h => h.date === asOfDate);
      if (histEntry?.rate) {
        exchangeRateAsOf = 1 / histEntry.rate;
      }
    } catch { /* fall back to live rate */ }
  }

  const cnyComponents = (cost.rawMaterial || 0) + (cost.labor || 0);
  const usdComponents = (cost.logistics || 0) + (cost.tariff || 0) + (cost.platformFee || 0);
  const totalLandedAsOf = exchangeRateAsOf > 0
    ? Math.round((cnyComponents / exchangeRateAsOf + usdComponents) * 100) / 100
    : cost.totalLanded;
  const grossMarginAsOf = cost.sellingPrice > 0
    ? Math.round(((cost.sellingPrice - totalLandedAsOf) / cost.sellingPrice) * 1000) / 10
    : 0;
  const origTotalLanded = typeof cost.totalLanded === 'number' ? cost.totalLanded : 0;
  const origGrossMargin = typeof cost.grossMargin === 'number' ? cost.grossMargin : 0;

  const breakdown = computeCostBreakdown(cost);

  return {
    sku: cost.sku,
    productName: cost.productName,
    destination: cost.destination,
    breakdown: {
      rawMaterial: cost.rawMaterial,
      labor: cost.labor,
      logistics: cost.logistics,
      tariff: cost.tariff,
      platformFee: cost.platformFee,
    },
    exchangeRate: Math.round(exchangeRateAsOf * 10000) / 10000,
    totalLanded: totalLandedAsOf,
    sellingPrice: cost.sellingPrice,
    grossMargin: grossMarginAsOf,
    category: cost.product?.category,
    exchangeRates: liveRates,
    ...(asOfDate ? {
      asOfDate,
      originalExchangeRate: cost.exchangeRate,
      originalTotalLanded: origTotalLanded,
      originalGrossMargin: origGrossMargin,
    } : {}),
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

/** Get cost optimization suggestions */
export async function getCostOptimization(category?: string) {
  const key = cacheKey('cost', 'optimization', category || 'all');

  return cachedFetch(key, async () => {
    const where: Record<string, unknown> = {};
    if (category) where.product = { category };

    const costRecords = await db.costRecord.findMany({ where, include: { product: true }, take: 1000 });

    type OptType = "logistics" | "tariff" | "rawMaterial" | "platformFee" | "exchangeHedge";
    interface TypeConfig {
      key: OptType; label: string; description: string;
      effortLevel: "easy" | "medium" | "complex"; effortLabel: string;
      implementationSteps: string[]; savingRate: number;
      threshold: number; highThreshold: number;
    }

    const typeConfigs: TypeConfig[] = [
      { key: "logistics", label: "物流优化", description: "优化运输路线、合并发货、海运替代空运", effortLevel: "medium", effortLabel: "中等", implementationSteps: ["1. 分析当前运输路线", "2. 评估海运替代空运", "3. 合并小批量发货", "4. 与物流商重新议价", "5. 建立物流监控仪表盘"], savingRate: 0.15, threshold: 0.12, highThreshold: 0.18 },
      { key: "tariff", label: "关税策略", description: "利用自由贸易协定、调整原产地、优化报关品类", effortLevel: "complex", effortLabel: "复杂", implementationSteps: ["1. 审查HS编码分类", "2. 评估原产地优惠政策", "3. 研究FTA适用性", "4. 制定转口贸易方案", "5. 建立关税预警机制"], savingRate: 0.20, threshold: 0.08, highThreshold: 0.15 },
      { key: "rawMaterial", label: "原材料替代", description: "寻找替代材料、批量采购议价、供应商竞价", effortLevel: "medium", effortLabel: "中等", implementationSteps: ["1. 分析原材料成本构成", "2. 评估替代材料", "3. 开发备选供应商", "4. 实施批量采购", "5. 建立价格预警"], savingRate: 0.08, threshold: 0.45, highThreshold: 0.55 },
      { key: "platformFee", label: "平台费谈判", description: "与电商平台重新协商佣金、优化广告投放", effortLevel: "easy", effortLabel: "简单", implementationSteps: ["1. 梳理各平台佣金", "2. 分析议价筹码", "3. 沟通降费方案", "4. 优化广告ROI", "5. 评估多平台策略"], savingRate: 0.12, threshold: 0.06, highThreshold: 0.10 },
      { key: "exchangeHedge", label: "汇率对冲", description: "通过远期合约、期权等金融工具对冲汇率风险", effortLevel: "easy", effortLabel: "简单", implementationSteps: ["1. 评估汇率波动影响", "2. 商讨远期外汇合约", "3. 设定对冲比例50-70%", "4. 建立自动触发机制", "5. 定期评估对冲效果"], savingRate: 0.05, threshold: 0.0, highThreshold: 0.0 },
    ];

    const allSuggestions: {
      id: string; type: OptType; typeLabel: string; title: string; description: string;
      currentCost: number; potentialSaving: number; savingPercent: number;
      impact: "high" | "medium" | "low"; impactLabel: string;
      effort: "easy" | "medium" | "complex"; effortLabel: string; roi: number;
      affectedProducts: { sku: string; productName: string; currentMargin: number; optimizedMargin: number }[];
      implementationSteps: string[]; simulatedTotalSaving: number;
    }[] = [];

    let suggestionId = 0;
    for (const config of typeConfigs) {
      const qualifyingProducts: { cost: typeof costRecords[number]; currentComponent: number; savingAmount: number }[] = [];
      for (const cost of costRecords) {
        const totalLanded = cost.totalLanded || 1;
        let currentComponent = 0; let ratio = 0;
        switch (config.key) {
          case "logistics": currentComponent = cost.logistics; ratio = cost.logistics / totalLanded; break;
          case "tariff": currentComponent = cost.tariff; ratio = cost.tariff / totalLanded; break;
          case "rawMaterial": currentComponent = cost.rawMaterial; ratio = cost.rawMaterial / totalLanded; break;
          case "platformFee": currentComponent = cost.platformFee; ratio = cost.platformFee / totalLanded; break;
          case "exchangeHedge": currentComponent = ((cost.rawMaterial || 0) + (cost.labor || 0)) * 0.03; ratio = cost.exchangeRate > 0 ? 1 : 0; break;
        }
        if (ratio >= config.threshold) {
          qualifyingProducts.push({ cost, currentComponent, savingAmount: currentComponent * config.savingRate });
        }
      }
      if (qualifyingProducts.length === 0) continue;

      const totalSaving = qualifyingProducts.reduce((s, p) => s + p.savingAmount, 0);
      const totalCurrentCost = qualifyingProducts.reduce((s, p) => s + p.currentComponent, 0);
      const savingPercent = totalCurrentCost > 0 ? Math.round((totalSaving / totalCurrentCost) * 1000) / 10 : 0;

      let impact: "high" | "medium" | "low" = "low";
      if (totalSaving > 50 || qualifyingProducts.length >= 5) impact = "high";
      else if (totalSaving > 20 || qualifyingProducts.length >= 3) impact = "medium";

      const effortScore = config.effortLevel === "easy" ? 1 : config.effortLevel === "medium" ? 2 : 3;
      const roi = Math.round((totalSaving / effortScore) * 100) / 100;

      allSuggestions.push({
        id: `opt-${++suggestionId}`, type: config.key, typeLabel: config.label,
        title: `${config.label} — ${qualifyingProducts.length}个产品可优化`,
        description: config.description,
        currentCost: Math.round(totalCurrentCost * 100) / 100,
        potentialSaving: Math.round(totalSaving * 100) / 100,
        savingPercent, impact,
        impactLabel: impact === "high" ? "高" : impact === "medium" ? "中" : "低",
        effort: config.effortLevel, effortLabel: config.effortLabel, roi,
        affectedProducts: qualifyingProducts.map((p) => {
          const newTotalLanded = p.cost.totalLanded - p.savingAmount;
          const optimizedMargin = ((p.cost.sellingPrice - newTotalLanded) / p.cost.sellingPrice) * 100;
          return {
            sku: p.cost.sku, productName: p.cost.productName,
            currentMargin: p.cost.grossMargin,
            optimizedMargin: Math.round(optimizedMargin * 10) / 10,
          };
        }),
        implementationSteps: config.implementationSteps,
        simulatedTotalSaving: Math.round(totalSaving * 100) / 100,
      });
    }

    allSuggestions.sort((a, b) => b.roi - a.roi);

    const optimizations = costRecords.map((cost) => {
      const tl = cost.totalLanded || 1;
      const suggestions: { area: string; current: number; potential: number; saving: number; priority: "high" | "medium" | "low"; action: string }[] = [];
      if (cost.logistics / tl > 0.12) {
        const potential = cost.logistics * 0.85;
        suggestions.push({ area: "物流成本", current: cost.logistics, potential: Math.round(potential * 100) / 100, saving: Math.round((cost.logistics - potential) * 100) / 100, priority: cost.logistics / tl > 0.18 ? "high" : "medium", action: "优化运输路线，合并发货，海运替代空运" });
      }
      if (cost.tariff / tl > 0.08) {
        const potential = cost.tariff * 0.8;
        suggestions.push({ area: "关税成本", current: cost.tariff, potential: Math.round(potential * 100) / 100, saving: Math.round((cost.tariff - potential) * 100) / 100, priority: cost.tariff / tl > 0.15 ? "high" : "medium", action: "评估原产地变更或利用自由贸易协定" });
      }
      if (cost.rawMaterial / tl > 0.45) {
        const potential = cost.rawMaterial * 0.92;
        suggestions.push({ area: "原材料成本", current: cost.rawMaterial, potential: Math.round(potential * 100) / 100, saving: Math.round((cost.rawMaterial - potential) * 100) / 100, priority: cost.rawMaterial / tl > 0.55 ? "high" : "low", action: "寻找替代材料，批量采购议价，供应商竞价" });
      }
      if (cost.labor / tl > 0.2) {
        const potential = cost.labor * 0.9;
        suggestions.push({ area: "人工成本", current: cost.labor, potential: Math.round(potential * 100) / 100, saving: Math.round((cost.labor - potential) * 100) / 100, priority: "low", action: "提升生产自动化水平" });
      }
      const totalSaving = suggestions.reduce((s, sug) => s + sug.saving, 0);
      const optimizedMargin = ((cost.sellingPrice - (tl - totalSaving)) / cost.sellingPrice) * 100;
      return {
        sku: cost.sku, productName: cost.productName, category: cost.product?.category,
        currentTotalLanded: tl, currentMargin: cost.grossMargin,
        optimizedMargin: Math.round(optimizedMargin * 10) / 10,
        marginImprovement: Math.round((optimizedMargin - cost.grossMargin) * 10) / 10,
        totalPotentialSaving: Math.round(totalSaving * 100) / 100, suggestions,
      };
    });

    optimizations.sort((a, b) => b.totalPotentialSaving - a.totalPotentialSaving);

    return {
      suggestions: allSuggestions,
      products: optimizations,
      summary: {
        totalProducts: costRecords.length,
        totalPotentialSaving: Math.round(allSuggestions.reduce((s, o) => s + o.potentialSaving, 0) * 100) / 100,
        highImpactCount: allSuggestions.filter((s) => s.impact === "high").length,
        quickWinsCount: allSuggestions.filter((s) => s.effort === "easy").length,
        avgSavingPercent: allSuggestions.length > 0 ? Math.round(allSuggestions.reduce((s, o) => s + o.savingPercent, 0) / allSuggestions.length * 10) / 10 : 0,
        highPriorityCount: optimizations.filter((o) => o.suggestions.some((s) => s.priority === "high")).length,
        avgMarginImprovement: optimizations.length > 0 ? Math.round((optimizations.reduce((s, o) => s + o.marginImprovement, 0) / optimizations.length) * 10) / 10 : 0,
      },
    };
  }, CACHE_TTL.LONG);
}

/** Get cost trend analysis with live FX awareness */
export async function getCostTrend(category?: string, months = 6) {
  const key = cacheKey('cost', 'trend', category || 'all', months);

  return cachedFetch(key, async () => {
    const where: Record<string, unknown> = {};
    if (category) where.product = { category };

    const [costRecords, liveRates] = await Promise.all([
      db.costRecord.findMany({ where, include: { product: true }, take: 1000 }),
      getLiveExchangeRates(),
    ]);

    const trends = costRecords.map((cost) => {
      const monthlyData: { month: string; totalLanded: number; grossMargin: number; rawMaterial: number; logistics: number; tariff: number }[] = [];
      for (let m = months; m >= 1; m--) {
        const hash = (cost.sku.charCodeAt(0) * 31 + cost.sku.charCodeAt(cost.sku.length - 1) * 17 + m * 7) % 100;
        const costVariation = ((hash % 15) - 7) * 0.005;
        const logisticsVariation = (((hash * 3) % 11) - 5) * 0.004;
        const tariffVariation = (((hash * 7) % 9) - 4) * 0.003;

        const rawMaterial = Math.round((cost.rawMaterial || 0) * (1 + costVariation * 0.8) * 100) / 100;
        const logistics = Math.round((cost.logistics || 0) * (1 + logisticsVariation) * 100) / 100;
        const tariff = Math.round((cost.tariff || 0) * (1 + tariffVariation) * 100) / 100;
        const totalLanded = Math.round((cost.totalLanded || 0) * (1 + costVariation) * 100) / 100;
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

// ─── Helper ────────────────────────────────────────────────────────────────────

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
