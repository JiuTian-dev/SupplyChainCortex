/**
 * Cost Reports — getCostReport, getCostAnalysis, getCostSummary, getCostReportEnhanced.
 * Extracted from services/reports.service.ts.
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { roundTo } from '@/lib/utils/format';
import type { CostReportResult, CostAnalysisResult, CostSummaryResult, CostReportEnhancedResult } from './reports-types';

// ─── Legacy: Cost Report ────────────────────────────────────────────────────────

export async function getCostReport(): Promise<CostReportResult> {
  return cachedFetch(
    cacheKey('reports', 'cost-report'),
    async () => {
      const [costRecords, products] = await Promise.all([
        db.costRecord.findMany(), db.product.findMany(),
      ]);

      const avgMargin = costRecords.length > 0
        ? roundTo(costRecords.reduce((sum, c) => sum + c.grossMargin, 0) / costRecords.length, 1)
        : 0;
      const totalLandedCost = costRecords.reduce((sum, c) => sum + c.totalLanded, 0);
      const avgLandedCost = costRecords.length > 0
        ? roundTo(totalLandedCost / costRecords.length, 2)
        : 0;

      const categoryCost: Record<string, { category: string; avgMargin: number; avgLanded: number; items: number }> = {};
      costRecords.forEach(cost => {
        const product = products.find(p => p.sku === cost.sku);
        const category = product?.category || '未分类';
        if (!categoryCost[category]) categoryCost[category] = { category, avgMargin: 0, avgLanded: 0, items: 0 };
        categoryCost[category].avgMargin += cost.grossMargin;
        categoryCost[category].avgLanded += cost.totalLanded;
        categoryCost[category].items += 1;
      });
      Object.values(categoryCost).forEach(cat => {
        cat.avgMargin = roundTo(cat.avgMargin / cat.items, 1);
        cat.avgLanded = roundTo(cat.avgLanded / cat.items, 2);
      });

      return {
        title: '成本报告',
        generatedAt: new Date().toISOString(),
        summary: {
          totalProducts: costRecords.length, avgGrossMargin: avgMargin, avgLandedCost,
          lowMarginCount: costRecords.filter(c => c.grossMargin < 45).length,
          costBreakdown: {
            rawMaterial: roundTo(costRecords.reduce((s, c) => s + c.rawMaterial, 0) / costRecords.length, 2),
            labor: roundTo(costRecords.reduce((s, c) => s + c.labor, 0) / costRecords.length, 2),
            logistics: roundTo(costRecords.reduce((s, c) => s + c.logistics, 0) / costRecords.length, 2),
            tariff: roundTo(costRecords.reduce((s, c) => s + c.tariff, 0) / costRecords.length, 2),
            platformFee: roundTo(costRecords.reduce((s, c) => s + c.platformFee, 0) / costRecords.length, 2),
          },
        },
        byCategory: Object.values(categoryCost),
        items: costRecords.map(c => ({
          sku: c.sku, productName: c.productName,
          totalLanded: roundTo(c.totalLanded, 2), grossMargin: c.grossMargin,
          exchangeRate: c.exchangeRate,
          breakdown: { rawMaterial: c.rawMaterial, labor: c.labor, logistics: c.logistics, tariff: c.tariff, platformFee: c.platformFee },
        })),
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

// ─── Enhanced: Cost Analysis ────────────────────────────────────────────────────

export async function getCostAnalysis(): Promise<CostAnalysisResult> {
  return cachedFetch(
    cacheKey('reports', 'cost-analysis'),
    async () => {
      const [costRecords, products, inventory] = await Promise.all([
        db.costRecord.findMany(),
        db.product.findMany(),
        db.inventory.findMany(),
      ]);

      const categoryBreakdown: Record<string, { category: string; count: number; avgRawMaterial: number; avgLabor: number; avgLogistics: number; avgTariff: number; avgPlatformFee: number; avgTotalLanded: number; avgMargin: number }> = {};
      costRecords.forEach(c => {
        const product = products.find(p => p.sku === c.sku);
        const category = product?.category || '未分类';
        if (!categoryBreakdown[category]) {
          categoryBreakdown[category] = { category, count: 0, avgRawMaterial: 0, avgLabor: 0, avgLogistics: 0, avgTariff: 0, avgPlatformFee: 0, avgTotalLanded: 0, avgMargin: 0 };
        }
        const cb = categoryBreakdown[category]; cb.count++;
        cb.avgRawMaterial += c.rawMaterial; cb.avgLabor += c.labor;
        cb.avgLogistics += c.logistics; cb.avgTariff += c.tariff;
        cb.avgPlatformFee += c.platformFee; cb.avgTotalLanded += c.totalLanded;
        cb.avgMargin += c.grossMargin;
      });
      Object.values(categoryBreakdown).forEach(cb => {
        cb.avgRawMaterial = roundTo(cb.avgRawMaterial / cb.count, 2);
        cb.avgLabor = roundTo(cb.avgLabor / cb.count, 2);
        cb.avgLogistics = roundTo(cb.avgLogistics / cb.count, 2);
        cb.avgTariff = roundTo(cb.avgTariff / cb.count, 2);
        cb.avgPlatformFee = roundTo(cb.avgPlatformFee / cb.count, 2);
        cb.avgTotalLanded = roundTo(cb.avgTotalLanded / cb.count, 2);
        cb.avgMargin = roundTo(cb.avgMargin / cb.count, 1);
      });

      const marginDistribution = { excellent: 0, good: 0, moderate: 0, low: 0, danger: 0 };
      costRecords.forEach(c => {
        if (c.grossMargin >= 60) marginDistribution.excellent++;
        else if (c.grossMargin >= 50) marginDistribution.good++;
        else if (c.grossMargin >= 40) marginDistribution.moderate++;
        else if (c.grossMargin >= 30) marginDistribution.low++;
        else marginDistribution.danger++;
      });

      const highestCostProducts = [...costRecords].sort((a, b) => b.totalLanded - a.totalLanded).slice(0, 5)
        .map(c => ({ sku: c.sku, productName: c.productName, category: products.find(p => p.sku === c.sku)?.category || '未分类', totalLanded: roundTo(c.totalLanded, 2), sellingPrice: c.sellingPrice, grossMargin: c.grossMargin }));

      const lowestMarginProducts = [...costRecords].sort((a, b) => a.grossMargin - b.grossMargin).slice(0, 5)
        .map(c => ({ sku: c.sku, productName: c.productName, category: products.find(p => p.sku === c.sku)?.category || '未分类', grossMargin: c.grossMargin, totalLanded: roundTo(c.totalLanded, 2), sellingPrice: c.sellingPrice }));

      const currentAvgRate = costRecords.length > 0
        ? costRecords.reduce((s, c) => s + c.exchangeRate, 0) / costRecords.length
        : 7.25;
      const rateImpact = {
        currentAvgRate: roundTo(currentAvgRate, 3),
        hypotheticalRate: 7.0,
        estimatedImpactPercent: roundTo((currentAvgRate - 7.0) / currentAvgRate * 100, 1),
        estimatedCostSaving: roundTo(costRecords.reduce((s, c) => s + (c.rawMaterial + c.labor) * (1 - 7.0 / c.exchangeRate), 0), 2),
        note: '假设汇率从当前水平变动到7.0的影响估算',
      };

      const tariffByOrigin: Record<string, { origin: string; count: number; avgTariff: number; avgTariffPercent: number; totalTariffExposure: number }> = {};
      costRecords.forEach(c => {
        const origin = products.find(p => p.sku === c.sku)?.origin || 'CN';
        if (!tariffByOrigin[origin]) tariffByOrigin[origin] = { origin, count: 0, avgTariff: 0, avgTariffPercent: 0, totalTariffExposure: 0 };
        const tbo = tariffByOrigin[origin]; tbo.count++;
        tbo.avgTariff += c.tariff; tbo.totalTariffExposure += c.tariff;
        if (c.totalLanded > 0) tbo.avgTariffPercent += (c.tariff / c.totalLanded) * 100;
      });
      Object.values(tariffByOrigin).forEach(tbo => {
        tbo.avgTariff = roundTo(tbo.avgTariff / tbo.count, 2);
        tbo.avgTariffPercent = roundTo(tbo.avgTariffPercent / tbo.count, 1);
        tbo.totalTariffExposure = roundTo(tbo.totalTariffExposure, 2);
      });

      return {
        title: '成本分析报告',
        generatedAt: new Date().toISOString(),
        costBreakdownByCategory: Object.values(categoryBreakdown),
        marginDistribution,
        topHighestCostProducts: highestCostProducts,
        topLowestMarginProducts: lowestMarginProducts,
        exchangeRateImpact: rateImpact,
        tariffExposureByOrigin: Object.values(tariffByOrigin),
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

// ─── Enhanced: Cost Summary ─────────────────────────────────────────────────────

export async function getCostSummary(): Promise<CostSummaryResult> {
  return cachedFetch(
    cacheKey('reports', 'cost-summary'),
    async () => {
      const [costRecords, products, inventory] = await Promise.all([
        db.costRecord.findMany(),
        db.product.findMany(),
        db.inventory.findMany(),
      ]);

      const avgLandedCost = costRecords.length > 0
        ? roundTo(costRecords.reduce((sum, c) => sum + c.totalLanded, 0) / costRecords.length, 2)
        : 0;
      const avgMargin = costRecords.length > 0
        ? roundTo(costRecords.reduce((sum, c) => sum + c.grossMargin, 0) / costRecords.length, 1)
        : 0;

      const highTurnoverSkus = new Set(inventory.filter(i => i.turnoverRate > 0).map(i => i.sku));
      const recentCosts = costRecords.filter(c => highTurnoverSkus.has(c.sku));
      const recentAvgMargin = recentCosts.length > 0
        ? recentCosts.reduce((sum, c) => sum + c.grossMargin, 0) / recentCosts.length
        : avgMargin;
      const marginDelta = roundTo(recentAvgMargin - avgMargin, 1);
      const costTrendDirection = marginDelta > 2 ? 'improving' : marginDelta < -2 ? 'declining' : 'stable';

      const safetyMargin = 40;
      const productsBelowSafetyMargin = costRecords
        .filter(c => c.grossMargin < safetyMargin)
        .map(c => ({
          sku: c.sku, productName: c.productName, category: products.find(p => p.sku === c.sku)?.category || '未分类',
          grossMargin: c.grossMargin, totalLanded: roundTo(c.totalLanded, 2),
          sellingPrice: c.sellingPrice, deficit: roundTo(safetyMargin - c.grossMargin, 1),
        }))
        .sort((a, b) => a.grossMargin - b.grossMargin);

      const categoryBreakdown: Record<string, { category: string; count: number; avgLandedCost: number; avgMargin: number; avgRawMaterial: number; avgLabor: number; avgLogistics: number; avgTariff: number; avgPlatformFee: number }> = {};
      costRecords.forEach(c => {
        const category = products.find(p => p.sku === c.sku)?.category || '未分类';
        if (!categoryBreakdown[category]) {
          categoryBreakdown[category] = { category, count: 0, avgLandedCost: 0, avgMargin: 0, avgRawMaterial: 0, avgLabor: 0, avgLogistics: 0, avgTariff: 0, avgPlatformFee: 0 };
        }
        const cb = categoryBreakdown[category]; cb.count++;
        cb.avgLandedCost += c.totalLanded; cb.avgMargin += c.grossMargin;
        cb.avgRawMaterial += c.rawMaterial; cb.avgLabor += c.labor;
        cb.avgLogistics += c.logistics; cb.avgTariff += c.tariff;
        cb.avgPlatformFee += c.platformFee;
      });
      Object.values(categoryBreakdown).forEach(cb => {
        cb.avgLandedCost = roundTo(cb.avgLandedCost / cb.count, 2);
        cb.avgMargin = roundTo(cb.avgMargin / cb.count, 1);
        cb.avgRawMaterial = roundTo(cb.avgRawMaterial / cb.count, 2);
        cb.avgLabor = roundTo(cb.avgLabor / cb.count, 2);
        cb.avgLogistics = roundTo(cb.avgLogistics / cb.count, 2);
        cb.avgTariff = roundTo(cb.avgTariff / cb.count, 2);
        cb.avgPlatformFee = roundTo(cb.avgPlatformFee / cb.count, 2);
      });

      const fxCurrentAvgRate = costRecords.length > 0
        ? costRecords.reduce((s, c) => s + c.exchangeRate, 0) / costRecords.length
        : 7.25;
      const rateStdDev = costRecords.length > 1
        ? Math.sqrt(costRecords.reduce((sum, c) => sum + Math.pow(c.exchangeRate - fxCurrentAvgRate, 2), 0) / costRecords.length)
        : 0;
      const fxExposedCost = costRecords.reduce((s, c) => s + c.rawMaterial + c.labor, 0);

      return {
        title: '成本汇总报告',
        generatedAt: new Date().toISOString(),
        summary: { avgLandedCost, avgMargin, costTrendDirection, totalProducts: costRecords.length, productsBelowSafetyMargin: productsBelowSafetyMargin.length },
        productsBelowSafetyMargin,
        costBreakdownByCategory: Object.values(categoryBreakdown),
        fxExposureAnalysis: {
          currentAvgRate: roundTo(fxCurrentAvgRate, 3),
          rateStdDev: roundTo(rateStdDev, 3),
          totalFxExposedCost: roundTo(fxExposedCost, 2),
          fxExposedPercent: costRecords.reduce((s, c) => s + c.totalLanded, 0) > 0
            ? roundTo(fxExposedCost / costRecords.reduce((s, c) => s + c.totalLanded, 0) * 100, 1)
            : 0,
          sensitivityAnalysis: {
            rateUp1Percent: roundTo(fxExposedCost * 0.01, 2),
            rateDown1Percent: roundTo(fxExposedCost * -0.01, 2),
            rateUp5Percent: roundTo(fxExposedCost * 0.05, 2),
            rateDown5Percent: roundTo(fxExposedCost * -0.05, 2),
          },
          rateDistribution: {
            below7: costRecords.filter(c => c.exchangeRate < 7.0).length,
            range7to72: costRecords.filter(c => c.exchangeRate >= 7.0 && c.exchangeRate < 7.2).length,
            range72to75: costRecords.filter(c => c.exchangeRate >= 7.2 && c.exchangeRate < 7.5).length,
            above75: costRecords.filter(c => c.exchangeRate >= 7.5).length,
          },
        },
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

// ─── Type-param: Cost Report Enhanced ───────────────────────────────────────────

export async function getCostReportEnhanced(): Promise<CostReportEnhancedResult> {
  return cachedFetch(
    cacheKey('reports', 'cost-report-enhanced'),
    async () => {
      const [costRecords, products, inventory, salesRecords] = await Promise.all([
        db.costRecord.findMany(),
        db.product.findMany(),
        db.inventory.findMany(),
        db.salesRecord.findMany(),
      ]);

      const totalLandedCost = costRecords.reduce((s, c) => s + c.totalLanded, 0);
      const avgMargin = costRecords.length > 0
        ? roundTo(costRecords.reduce((s, c) => s + c.grossMargin, 0) / costRecords.length, 1)
        : 0;

      const costComposition = costRecords.length > 0 ? {
        rawMaterial: roundTo(costRecords.reduce((s, c) => s + c.rawMaterial, 0) / totalLandedCost * 100, 1),
        labor: roundTo(costRecords.reduce((s, c) => s + c.labor, 0) / totalLandedCost * 100, 1),
        logistics: roundTo(costRecords.reduce((s, c) => s + c.logistics, 0) / totalLandedCost * 100, 1),
        tariff: roundTo(costRecords.reduce((s, c) => s + c.tariff, 0) / totalLandedCost * 100, 1),
        platformFee: roundTo(costRecords.reduce((s, c) => s + c.platformFee, 0) / totalLandedCost * 100, 1),
      } : { rawMaterial: 0, labor: 0, logistics: 0, tariff: 0, platformFee: 0 };

      const marginDistribution = {
        high: costRecords.filter(c => c.grossMargin > 30).length,
        medium: costRecords.filter(c => c.grossMargin >= 15 && c.grossMargin <= 30).length,
        low: costRecords.filter(c => c.grossMargin < 15).length,
      };

      const highTurnoverSkus2 = new Set(inventory.filter(i => i.turnoverRate > 2).map(i => i.sku));
      const recentCosts = costRecords.filter(c => highTurnoverSkus2.has(c.sku));
      const recentAvgMargin = recentCosts.length > 0
        ? recentCosts.reduce((s, c) => s + c.grossMargin, 0) / recentCosts.length
        : avgMargin;
      const costTrend = recentAvgMargin > avgMargin + 2 ? 'improving' : recentAvgMargin < avgMargin - 2 ? 'declining' : 'stable';

      const highestCostItems = [...costRecords].sort((a, b) => b.totalLanded - a.totalLanded).slice(0, 5)
        .map(c => ({ sku: c.sku, productName: c.productName, totalLanded: roundTo(c.totalLanded, 2), category: products.find(p => p.sku === c.sku)?.category || '未分类', grossMargin: c.grossMargin }));
      const highestMarginItems = [...costRecords].sort((a, b) => b.grossMargin - a.grossMargin).slice(0, 5)
        .map(c => ({ sku: c.sku, productName: c.productName, grossMargin: c.grossMargin, totalLanded: roundTo(c.totalLanded, 2), sellingPrice: c.sellingPrice }));

      return {
        title: '成本报告',
        generatedAt: new Date().toISOString(),
        costBreakdown: { totalLandedCost: Math.round(totalLandedCost), avgMargin, productCount: costRecords.length },
        costComposition, marginDistribution,
        costTrendIndicators: { trend: costTrend, recentAvgMargin: roundTo(recentAvgMargin, 1), overallAvgMargin: avgMargin, delta: roundTo(recentAvgMargin - avgMargin, 1) },
        topHighestCostItems: highestCostItems,
        topHighestMarginItems: highestMarginItems,
      };
    },
    CACHE_TTL.VERY_LONG
  );
}
