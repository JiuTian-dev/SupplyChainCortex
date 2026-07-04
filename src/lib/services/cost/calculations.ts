/**
 * Cost Service — Cost calculation logic.
 *
 * 包含：成本分解、毛利率分析、成本模拟、到岸成本明细、成本优化建议。
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { getRateHistory } from '@/lib/queries/exchange-rate.queries';
import { computeTariff } from '@/lib/services/tariff.service';
import { getExchangeRate } from '@/lib/exchange-rate';
import { AppError, NotFoundError } from '@/lib/api-utils';
import type { CostBreakdownItem, MarginAnalysis } from './types';
import { getLiveExchangeRates } from './queries';

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
    carbonPriceChange?: number; // EUA change in EUR/t
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

  // CBAM carbon cost for EU-bound products
  let carbonCost = 0;
  const carbonPriceChangePct = (params.carbonPriceChange ?? 0) / 100;
  if (costRecord.destination === 'EU' && Math.abs(carbonPriceChangePct) > 0.001) {
    try {
      const { fetchCarbonPrice } = await import('@/lib/sources/carbon-price');
      const carbon = await fetchCarbonPrice();
      if (carbon) {
        const euPrice = carbon.price * (1 + carbonPriceChangePct);
        // 1.5kg product, 2.5 kgCO2/kg intensity, 10% CBAM phase-out (2026)
        const embodiedCo2 = (1.5 * 2.5) / 1000; // tonnes CO2
        carbonCost = Math.round(euPrice * embodiedCo2 * 0.1 * 100) / 100;
      }
    } catch { /* carbon source unavailable */ }
  }

  const effRate = currentFxRate * (1 + fxChangePct);
  const newCnyTotal = effRate > 0 ? (newRawMaterial + newLabor) / effRate : 0;
  const newUsdTotal = newLogistics + newTariff + newPlatformFee + carbonCost;
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

  const _breakdown = computeCostBreakdown(cost);

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

/** Get landed cost detail or throw a specific error — used by /api/cost?action=landed_cost */
export async function getLandedCostOrThrow(params: {
  sku: string;
  minMargin?: number;
  maxMargin?: number;
  category?: string;
  asOfDate?: string;
}) {
  const { sku, minMargin, maxMargin, category, asOfDate } = params;
  const result = await getLandedCostDetail({ sku, minMargin, maxMargin, category, asOfDate });
  if (result) return result;

  // Determine specific error message
  const cost = await db.costRecord.findFirst({ where: { sku }, include: { product: true } });
  if (!cost) {
    throw NotFoundError(`未找到 SKU: ${sku}`);
  }
  if (minMargin !== undefined && cost.grossMargin < minMargin) {
    throw NotFoundError(`SKU: ${sku} 毛利率 ${cost.grossMargin}% 低于最小值 ${minMargin}%`);
  }
  if (maxMargin !== undefined && cost.grossMargin > maxMargin) {
    throw NotFoundError(`SKU: ${sku} 毛利率 ${cost.grossMargin}% 高于最大值 ${maxMargin}%`);
  }
  if (category && cost.product?.category !== category) {
    throw NotFoundError(`SKU: ${sku} 品类不匹配`);
  }
  throw NotFoundError(`未找到 SKU: ${sku}`);
}

/** Get cost breakdown for a specific SKU — used by /api/cost?action=breakdown */
export async function getCostBreakdownForSku(sku: string, category?: string) {
  const cost = await db.costRecord.findFirst({ where: { sku }, include: { product: true } });
  if (!cost) {
    throw NotFoundError(`未找到 SKU: ${sku}`);
  }

  // Apply category filter
  if (category && cost.product?.category !== category) {
    throw NotFoundError(`SKU: ${sku} 品类不匹配`);
  }

  const breakdown = computeCostBreakdown(cost);

  return {
    sku: cost.sku,
    productName: cost.productName,
    totalLanded: cost.totalLanded,
    breakdown,
    category: cost.product?.category,
  };
}

/** Simulate cost impact across filtered cost records — used by /api/cost?action=simulate */
export async function simulateCosts(params: {
  category?: string;
  minMargin?: number;
  maxMargin?: number;
  exchangeRateChange: number;
  freightChange: number;
  rawMaterialChange: number;
  tariffChange: number;
  laborChange: number;
  platformFeeChange: number;
  asOfDate?: string;
}) {
  const {
    category, minMargin, maxMargin,
    exchangeRateChange, freightChange, rawMaterialChange,
    tariffChange, laborChange, platformFeeChange, asOfDate,
  } = params;

  const where: Record<string, unknown> = {};
  if (category) {
    where.product = { category };
  }
  if (minMargin !== undefined || maxMargin !== undefined) {
    const marginFilter: Record<string, number> = {};
    if (minMargin !== undefined) marginFilter.gte = minMargin;
    if (maxMargin !== undefined) marginFilter.lte = maxMargin;
    where.grossMargin = marginFilter;
  }

  const costRecords = await db.costRecord.findMany({
    where,
    include: { product: true },
    take: 1000,
  });

  const results = await Promise.all(costRecords.map(async (cost) => {
    const simulated = await simulateCostImpact(cost, {
      exchangeRateChange,
      freightChange,
      rawMaterialChange,
      tariffChange,
      laborChange,
      platformFeeChange,
    });

    const newRawMaterial = cost.rawMaterial * (1 + rawMaterialChange / 100);
    const newLabor = cost.labor * (1 + laborChange / 100);
    const newLogistics = cost.logistics * (1 + freightChange / 100);
    const newTariff = cost.tariff * (1 + tariffChange / 100);
    const newPlatformFee = cost.platformFee * (1 + platformFeeChange / 100);

    return {
      product: cost.productName,
      sku: cost.sku,
      category: cost.product?.category,
      currentMargin: cost.grossMargin,
      simulatedMargin: simulated.simulatedMargin,
      marginChange: simulated.marginChange,
      currentTotalLanded: cost.totalLanded,
      simulatedTotalLanded: simulated.simulatedTotalLanded,
      totalLandedChange: simulated.totalLandedChange,
      costBreakdown: {
        current: {
          rawMaterial: cost.rawMaterial,
          labor: cost.labor,
          logistics: cost.logistics,
          tariff: cost.tariff,
          platformFee: cost.platformFee,
        },
        simulated: {
          rawMaterial: Math.round(newRawMaterial * 100) / 100,
          labor: Math.round(newLabor * 100) / 100,
          logistics: Math.round(newLogistics * 100) / 100,
          tariff: Math.round(newTariff * 100) / 100,
          platformFee: Math.round(newPlatformFee * 100) / 100,
        },
      },
    };
  }));

  const sortedResults = [...results].sort((a, b) => a.marginChange - b.marginChange);

  const currentUsdRate = getExchangeRate('USD')?.rate ?? 7.25;
  const referenceExchangeRate = asOfDate
    ? (() => {
        const dateNum = parseInt(asOfDate.replace(/-/g, ""), 10);
        const variation = ((dateNum % 100) - 50) * 0.001;
        return Math.round((currentUsdRate + variation) * 1000) / 1000;
      })()
    : currentUsdRate;

  return {
    parameters: {
      exchangeRateChange,
      freightChange,
      rawMaterialChange,
      tariffChange,
      laborChange,
      platformFeeChange,
      ...(asOfDate ? { asOfDate, referenceExchangeRate: Math.round(referenceExchangeRate * 1000) / 1000 } : {}),
    },
    results,
    summary: {
      avgMarginChange: results.length > 0 ? Math.round(results.reduce((sum, r) => sum + r.marginChange, 0) / results.length * 10) / 10 : 0,
      worstAffected: sortedResults.length > 0 ? sortedResults[0].product : "",
      worstAffectedChange: sortedResults.length > 0 ? sortedResults[0].marginChange : 0,
      bestPositioned: sortedResults.length > 0 ? sortedResults[sortedResults.length - 1].product : "",
      bestPositionedChange: sortedResults.length > 0 ? sortedResults[sortedResults.length - 1].marginChange : 0,
      productsAtRisk: results.filter(r => r.simulatedMargin < 48).length,
      avgTotalLandedChange: results.length > 0 ? Math.round(results.reduce((sum, r) => sum + r.totalLandedChange, 0) / results.length * 100) / 100 : 0,
    },
    filters: { minMargin: minMargin ?? null, maxMargin: maxMargin ?? null, category: category || null },
  };
}
