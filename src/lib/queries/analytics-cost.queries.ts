/**
 * Cost Analytics — getCostOptimizationAnalytics, getCostTrendsAnalytics.
 * Extracted from services/analytics.service.ts.
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { roundTo } from '@/lib/utils/format';


// ─── 3. Cost Optimization Analytics ──────────────────────────────────────────

export async function getCostOptimizationAnalytics() {
  return cachedFetch(
    cacheKey('analytics', 'cost-optimization'),
    async () => {
      const costRecords = await db.costRecord.findMany({
        include: { product: true },
      });

      const inventoryRecords = await db.inventory.findMany();

      const optimizationItems = costRecords.map((cost) => {
        const totalLanded = cost.totalLanded;
        const logisticsPercent = Math.round((cost.logistics / totalLanded) * 1000) / 10;
        const tariffPercent = Math.round((cost.tariff / totalLanded) * 1000) / 10;
        const rawMaterialPercent = Math.round((cost.rawMaterial / totalLanded) * 1000) / 10;

        const opportunities: string[] = [];
        let potentialSaving = 0;

        if (logisticsPercent > 10) {
          opportunities.push("物流成本占比偏高，建议优化运输路线或合并发货");
          potentialSaving += cost.logistics * 0.1;
        }
        if (tariffPercent > 7) {
          opportunities.push("关税占比较高，建议评估原产地变更或关税优化策略");
          potentialSaving += cost.tariff * 0.15;
        }
        if (rawMaterialPercent > 25) {
          opportunities.push("原材料成本占比过高，建议寻找替代材料或议价");
          potentialSaving += cost.rawMaterial * 0.05;
        }

        const inv = inventoryRecords.find((i) => i.sku === cost.sku);
        const marginStatus =
          cost.grossMargin < 40
            ? "danger"
            : cost.grossMargin < 50
              ? "warning"
              : "healthy";

        const strategies: string[] = [];
        if (cost.exchangeRate < 7.2) {
          strategies.push("当前汇率有利，可考虑提前锁汇");
        }
        if (cost.product?.origin === "CN" && tariffPercent > 8) {
          strategies.push("评估东南亚产能转移以降低关税成本");
        }
        if (logisticsPercent > 8) {
          strategies.push("考虑海运替代空运或优化装箱方案");
        }

        return {
          sku: cost.sku,
          productName: cost.productName,
          category: cost.product?.category,
          totalLanded,
          grossMargin: cost.grossMargin,
          marginStatus,
          costStructure: {
            rawMaterialPercent,
            logisticsPercent,
            tariffPercent,
            laborPercent: Math.round((cost.labor / totalLanded) * 1000) / 10,
            platformFeePercent: Math.round((cost.platformFee / totalLanded) * 1000) / 10,
          },
          opportunities,
          strategies,
          potentialSaving: Math.round(potentialSaving * 100) / 100,
          turnoverDays: inv?.turnoverDays || 0,
        };
      });

      optimizationItems.sort((a, b) => b.potentialSaving - a.potentialSaving);

      const totalPotentialSaving = optimizationItems.reduce(
        (sum, item) => sum + item.potentialSaving,
        0
      );

      const decliningMarginProducts = optimizationItems.filter(
        (item) => item.marginStatus === "danger"
      );

      return {
        items: optimizationItems,
        summary: {
          totalProducts: costRecords.length,
          totalPotentialSaving: Math.round(totalPotentialSaving * 100) / 100,
          decliningMarginCount: decliningMarginProducts.length,
          highLogisticsCount: optimizationItems.filter(
            (i) => i.costStructure.logisticsPercent > 10
          ).length,
          highTariffCount: optimizationItems.filter(
            (i) => i.costStructure.tariffPercent > 7
          ).length,
          avgGrossMargin:
            costRecords.length > 0
              ? Math.round(
                  (costRecords.reduce((s, c) => s + c.grossMargin, 0) /
                    costRecords.length) *
                    10
                ) / 10
              : 0,
        },
      };
    },
    CACHE_TTL.VERY_LONG
  );
}
// ─── 8. Cost Trends Analytics ────────────────────────────────────────────────

export async function getCostTrendsAnalytics(months: number = 6) {
  return cachedFetch(
    cacheKey('analytics', 'cost_trends', months),
    async () => {
      const [costRecords, salesRecords, products] = await Promise.all([
        db.costRecord.findMany({ include: { product: true } }),
        db.salesRecord.findMany(),
        db.product.findMany(),
      ]);

      // Month-over-Month Cost Changes
      const salesByMonth: Record<string, { month: string; revenue: number; quantity: number; cogs: number }> = {};
      salesRecords.forEach(r => {
        const month = r.date.substring(0, 7);
        if (!salesByMonth[month]) {
          salesByMonth[month] = { month, revenue: 0, quantity: 0, cogs: 0 };
        }
        salesByMonth[month].revenue += r.revenue;
        salesByMonth[month].quantity += r.quantity;
        const cost = costRecords.find(c => c.productId === r.productId);
        if (cost) {
          salesByMonth[month].cogs += r.quantity * cost.totalLanded;
        }
      });

      const monthlyCostData = Object.values(salesByMonth)
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-months);

      const monthlyCostChanges = monthlyCostData.map((m, idx) => {
        const prev = idx > 0 ? monthlyCostData[idx - 1] : null;
        const avgUnitCost = m.quantity > 0 ? m.cogs / m.quantity : 0;
        const prevAvgUnitCost = prev && prev.quantity > 0 ? prev.cogs / prev.quantity : 0;

        return {
          month: m.month,
          totalRevenue: Math.round(m.revenue),
          totalCOGS: Math.round(m.cogs),
          totalQuantity: m.quantity,
          avgUnitCost: Math.round(avgUnitCost * 100) / 100,
          grossMargin: m.revenue > 0
            ? Math.round((m.revenue - m.cogs) / m.revenue * 100 * 10) / 10
            : 0,
          costChange: prevAvgUnitCost > 0
            ? Math.round((avgUnitCost - prevAvgUnitCost) / prevAvgUnitCost * 1000) / 10
            : null,
          revenueMoM: prev && prev.revenue > 0
            ? Math.round((m.revenue - prev.revenue) / prev.revenue * 1000) / 10
            : null,
          cogsMoM: prev && prev.cogs > 0
            ? Math.round((m.cogs - prev.cogs) / prev.cogs * 1000) / 10
            : null,
        };
      });

      // Margin Trend Analysis
      const marginTrend = monthlyCostChanges.map(m => ({
        month: m.month,
        grossMargin: m.grossMargin,
      }));

      const marginValues = marginTrend.map(m => m.grossMargin).filter(v => v > 0);
      const marginTrendDirection = marginValues.length >= 2
        ? (() => {
            const recent = marginValues.slice(-Math.ceil(marginValues.length / 2));
            const older = marginValues.slice(0, Math.ceil(marginValues.length / 2));
            const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
            const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
            if (recentAvg > olderAvg + 2) return "improving" as const;
            if (recentAvg < olderAvg - 2) return "declining" as const;
            return "stable" as const;
          })()
        : "insufficient_data" as const;

      // Margin by category
      const marginByCategory: Record<string, { category: string; avgMargin: number; count: number }> = {};
      costRecords.forEach(c => {
        const category = c.product?.category || "未分类";
        if (!marginByCategory[category]) {
          marginByCategory[category] = { category, avgMargin: 0, count: 0 };
        }
        marginByCategory[category].avgMargin += c.grossMargin;
        marginByCategory[category].count++;
      });
      Object.values(marginByCategory).forEach(mc => {
        mc.avgMargin = Math.round(mc.avgMargin / mc.count * 10) / 10;
      });

      // Cost Volatility Metrics
      const unitCosts = costRecords.map(c => c.totalLanded);
      const avgCost = unitCosts.length > 0
        ? unitCosts.reduce((a, b) => a + b, 0) / unitCosts.length
        : 0;
      const costStdDev = unitCosts.length > 1
        ? Math.sqrt(unitCosts.reduce((sum, v) => sum + Math.pow(v - avgCost, 2), 0) / unitCosts.length)
        : 0;
      const coefficientOfVariation = avgCost > 0 ? costStdDev / avgCost : 0;

      // Cost volatility by category
      const volatilityByCategory: Record<string, { category: string; avgCost: number; stdDev: number; cv: number; count: number; costs: number[] }> = {};
      costRecords.forEach(c => {
        const category = c.product?.category || "未分类";
        if (!volatilityByCategory[category]) {
          volatilityByCategory[category] = { category, avgCost: 0, stdDev: 0, cv: 0, count: 0, costs: [] };
        }
        volatilityByCategory[category].costs.push(c.totalLanded);
        volatilityByCategory[category].count++;
        volatilityByCategory[category].avgCost += c.totalLanded;
      });
      Object.values(volatilityByCategory).forEach(vc => {
        const costs = vc.costs;
        vc.avgCost = Math.round(vc.avgCost / vc.count * 100) / 100;
        if (costs.length > 1) {
          const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
          vc.stdDev = Math.round(Math.sqrt(costs.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / costs.length) * 100) / 100;
          vc.cv = mean > 0 ? Math.round(vc.stdDev / mean * 1000) / 1000 : 0;
        }
        // Remove the costs array from the response
        delete (vc as { costs?: number[] }).costs;
      });

      // Exchange rate volatility
      const exchangeRates = costRecords.map(c => c.exchangeRate);
      const avgFxRate = exchangeRates.length > 0
        ? exchangeRates.reduce((a, b) => a + b, 0) / exchangeRates.length
        : 7.25;
      const fxStdDev = exchangeRates.length > 1
        ? Math.sqrt(exchangeRates.reduce((sum, r) => sum + Math.pow(r - avgFxRate, 2), 0) / exchangeRates.length)
        : 0;

      return {
        title: "成本趋势分析",
        generatedAt: new Date().toISOString(),
        monthlyCostChanges,
        marginTrend: {
          data: marginTrend,
          direction: marginTrendDirection,
          byCategory: Object.values(marginByCategory),
        },
        costVolatility: {
          overall: {
            avgCost: Math.round(avgCost * 100) / 100,
            stdDev: Math.round(costStdDev * 100) / 100,
            coefficientOfVariation: Math.round(coefficientOfVariation * 1000) / 1000,
            volatilityLevel: coefficientOfVariation <= 0.1 ? "low" : coefficientOfVariation <= 0.3 ? "moderate" : "high",
          },
          byCategory: Object.values(volatilityByCategory),
          exchangeRate: {
            avgRate: Math.round(avgFxRate * 1000) / 1000,
            stdDev: Math.round(fxStdDev * 1000) / 1000,
            volatilityLevel: fxStdDev <= 0.02 ? "low" : fxStdDev <= 0.05 ? "moderate" : "high",
          },
        },
        summary: {
          totalProducts: costRecords.length,
          avgMargin: Math.round(costRecords.reduce((s, c) => s + c.grossMargin, 0) / (costRecords.length || 1) * 10) / 10,
          costTrendDirection: monthlyCostChanges.length >= 2
            ? (() => {
                const costs = monthlyCostChanges.map(m => m.avgUnitCost).filter(c => c > 0);
                if (costs.length < 2) return "stable" as const;
                const recent = costs.slice(-Math.ceil(costs.length / 2));
                const older = costs.slice(0, Math.ceil(costs.length / 2));
                const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
                const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
                if (recentAvg > olderAvg * 1.02) return "increasing" as const;
                if (recentAvg < olderAvg * 0.98) return "decreasing" as const;
                return "stable" as const;
              })()
            : "stable" as const,
        },
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

