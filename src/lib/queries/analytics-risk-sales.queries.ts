/**
 * Risk & Sales Analytics — getSupplyChainRiskAnalytics, getSalesForecastAnalytics.
 * Extracted from services/analytics.service.ts.
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { roundTo } from '@/lib/utils/format';

// ─── 5. Supply Chain Risk Analytics ──────────────────────────────────────────

export async function getSupplyChainRiskAnalytics() {
  return cachedFetch(
    cacheKey('analytics', 'supply-chain-risk'),
    async () => {
      const suppliers = await db.supplier.findMany({
        where: { status: "active" },
      });
      const inventory = await db.inventory.findMany();
      const costRecords = await db.costRecord.findMany();
      const shipments = await db.shipmentItem.findMany();
      const products = await db.product.findMany();

      const categorySupplierCount: Record<string, string[]> = {};
      suppliers.forEach((s) => {
        if (!categorySupplierCount[s.category]) {
          categorySupplierCount[s.category] = [];
        }
        categorySupplierCount[s.category].push(s.code);
      });

      const concentrationRisk = Object.entries(categorySupplierCount).map(
        ([category, supplierCodes]) => {
          const isSingleSource = supplierCodes.length === 1;
          const productCount = costRecords.filter(
            (c) => products.find(p => p.sku === c.sku)?.category === category
          ).length;

          return {
            category,
            supplierCount: supplierCodes.length,
            suppliers: supplierCodes,
            isSingleSource,
            productCount,
            riskLevel: isSingleSource ? "high" : supplierCodes.length <= 2 ? "medium" : "low",
            recommendation: isSingleSource
              ? `品类"${category}"仅有单一供应商，建议开发备选供应商以降低断供风险`
              : supplierCodes.length <= 2
                ? `品类"${category}"供应商较少，建议增加1-2家备选`
                : `品类"${category}"供应商多样性良好`,
          };
        }
      );

      const regionSupplierCount: Record<string, number> = {};
      suppliers.forEach((s) => {
        regionSupplierCount[s.region] = (regionSupplierCount[s.region] || 0) + 1;
      });

      const totalSuppliers = suppliers.length;
      const geographicRisk = Object.entries(regionSupplierCount).map(
        ([region, count]) => {
          const concentrationPercent = Math.round((count / totalSuppliers) * 100);
          return {
            region,
            supplierCount: count,
            concentrationPercent,
            riskLevel:
              concentrationPercent > 70
                ? "high"
                : concentrationPercent > 50
                  ? "medium"
                  : "low",
            recommendation:
              concentrationPercent > 70
                ? `供应商高度集中在"${region}"地区，地缘政治或自然灾害风险高，建议分散到其他地区`
                : concentrationPercent > 50
                  ? `供应商较集中在"${region}"地区，建议适当分散`
                  : `地区分布合理`,
          };
        }
      );

      const leadTimeRisk = inventory
        .map((inv) => {
          const invProduct = products.find(p => p.id === inv.productId);
          if (!invProduct) return null;
          const categorySupplier = suppliers.find(
            (s) => s.category === invProduct?.category
          );
          const leadTime = categorySupplier?.leadTime || 14;
          const bufferDays =
            inv.safetyStock > 0 && inv.quantity > 0
              ? Math.round((inv.safetyStock / inv.quantity) * leadTime)
              : 0;

          const isAtRisk =
            inv.quantity <= inv.reorderPoint || bufferDays < leadTime * 0.5;
          const isCritical =
            inv.quantity <= inv.safetyStock || bufferDays < leadTime * 0.3;

          return {
            sku: inv.sku,
            productName: inv.productName,
            category: invProduct?.category,
            currentStock: inv.quantity,
            safetyStock: inv.safetyStock,
            leadTime,
            bufferDays,
            stockStatus: inv.stockStatus,
            riskLevel: isCritical ? "critical" : isAtRisk ? "high" : "low",
            recommendation: isCritical
              ? "库存低于安全线且缓冲不足，需紧急补货"
              : isAtRisk
                ? "缓冲库存不足，建议提前下达补货订单"
                : "库存水平健康",
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null && item.riskLevel !== "low");

      const riskMatrix = {
        concentration: {
          score: Math.round(
            concentrationRisk.reduce((s, r) => {
              const score = r.riskLevel === "high" ? 80 : r.riskLevel === "medium" ? 50 : 20;
              return s + score;
            }, 0) / Math.max(concentrationRisk.length, 1)
          ),
          level:
            concentrationRisk.some((r) => r.riskLevel === "high")
              ? "high"
              : concentrationRisk.some((r) => r.riskLevel === "medium")
                ? "medium"
                : "low",
        },
        geographic: {
          score: Math.round(
            geographicRisk.reduce((s, r) => {
              const score = r.riskLevel === "high" ? 80 : r.riskLevel === "medium" ? 50 : 20;
              return s + score;
            }, 0) / Math.max(geographicRisk.length, 1)
          ),
          level:
            geographicRisk.some((r) => r.riskLevel === "high")
              ? "high"
              : geographicRisk.some((r) => r.riskLevel === "medium")
                ? "medium"
                : "low",
        },
        leadTime: {
          score: Math.round(
            leadTimeRisk.length > 0
              ? leadTimeRisk.reduce((s, r) => {
                  const score = r.riskLevel === "critical" ? 90 : r.riskLevel === "high" ? 70 : 30;
                  return s + score;
                }, 0) / leadTimeRisk.length
              : 20
          ),
          level:
            leadTimeRisk.some((r) => r.riskLevel === "critical")
              ? "critical"
              : leadTimeRisk.some((r) => r.riskLevel === "high")
                ? "high"
                : "low",
        },
      };

      const overallRiskScore = Math.round(
        riskMatrix.concentration.score * 0.3 +
          riskMatrix.geographic.score * 0.3 +
          riskMatrix.leadTime.score * 0.4
      );

      const mitigations: string[] = [];
      if (riskMatrix.concentration.level !== "low") {
        mitigations.push("开发更多品类备选供应商，降低单一供应商依赖");
      }
      if (riskMatrix.geographic.level !== "low") {
        mitigations.push("将部分采购分散到不同地区，降低地区集中风险");
      }
      if (riskMatrix.leadTime.level !== "low") {
        mitigations.push("增加安全库存水平，提前下达补货订单");
      }
      if (overallRiskScore > 60) {
        mitigations.push("建立供应链应急预案，定期审查风险指标");
      }
      if (mitigations.length === 0) {
        mitigations.push("当前供应链风险较低，建议保持定期监控");
      }

      return {
        riskMatrix,
        overallRiskScore,
        overallRiskLevel:
          overallRiskScore > 60 ? "high" : overallRiskScore > 35 ? "medium" : "low",
        concentrationRisk,
        geographicRisk,
        leadTimeRisk,
        mitigations,
        summary: {
          totalSuppliers: suppliers.length,
          singleSourceCategories: concentrationRisk.filter(
            (c) => c.isSingleSource
          ).length,
          highConcentrationRegions: geographicRisk.filter(
            (g) => g.riskLevel === "high"
          ).length,
          itemsAtLeadTimeRisk: leadTimeRisk.length,
          delayedShipments: shipments.filter(
            (s) => s.status === "delayed" || s.status === "exception"
          ).length,
        },
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

// ─── 6. Sales Forecast Analytics ─────────────────────────────────────────────

export async function getSalesForecastAnalytics(forecastDays: number = 30) {
  return cachedFetch(
    cacheKey('analytics', 'sales_forecast', forecastDays),
    async () => {
      const smoothingAlpha = 0.3;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);
      const cutoffStr = cutoffDate.toISOString().split("T")[0];

      const salesRecords = await db.salesRecord.findMany({
        where: { date: { gte: cutoffStr } },
        orderBy: { date: "asc" },
      });

      const products = await db.product.findMany();
      const inventory = await db.inventory.findMany();

      const salesByProduct: Record<string, Array<{ date: Date; quantity: number; revenue: number }>> = {};
      salesRecords.forEach(r => {
        if (!salesByProduct[r.productId]) {
          salesByProduct[r.productId] = [];
        }
        salesByProduct[r.productId].push({ date: r.date, quantity: r.quantity, revenue: r.revenue });
      });

      const forecasts = Object.entries(salesByProduct).map(([productId, sales]) => {
        const product = products.find(p => p.id === productId);
        const inv = inventory.find(i => i.productId === productId);

        if (sales.length < 7) {
          return {
            productId,
            sku: product?.sku || "",
            productName: product?.name || "未知产品",
            category: product?.category || "未分类",
            currentStock: inv?.quantity || 0,
            forecastPoints: [],
            summary: { totalForecast30d: 0, avgDailyForecast: 0, trend: "insufficient_data" as const },
          };
        }

        const quantities = sales.map(s => s.quantity);
        let smoothed = quantities[0];
        for (let i = 1; i < quantities.length; i++) {
          smoothed = smoothingAlpha * quantities[i] + (1 - smoothingAlpha) * smoothed;
        }

        const recentHalf = quantities.slice(-Math.max(7, Math.floor(quantities.length / 2)));
        const olderHalf = quantities.slice(0, Math.max(7, Math.floor(quantities.length / 2)));
        const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length;
        const olderAvg = olderHalf.reduce((a, b) => a + b, 0) / olderHalf.length;
        const trendSlope = (recentAvg - olderAvg) / recentHalf.length;
        const trend = trendSlope > 0.5 ? "up" as const : trendSlope < -0.5 ? "down" as const : "stable" as const;

        const forecastPoints: { day: number; date: string; forecastDemand: number; lowerBound: number; upperBound: number }[] = [];
        const stdDev = Math.sqrt(
          quantities.reduce((sum, q) => sum + Math.pow(q - smoothed, 2), 0) / quantities.length
        );

        let cumForecast = 0;
        for (let d = 1; d <= forecastDays; d++) {
          const forecastValue = Math.max(0, Math.round(smoothed + trendSlope * d));
          const confidenceWidth = Math.round(1.96 * stdDev * Math.sqrt(d / 7));
          cumForecast += forecastValue;

          forecastPoints.push({
            day: d,
            date: new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            forecastDemand: forecastValue,
            lowerBound: Math.max(0, forecastValue - confidenceWidth),
            upperBound: forecastValue + confidenceWidth,
          });
        }

        const avgDailyForecast = Math.round(cumForecast / forecastDays * 10) / 10;

        return {
          productId,
          sku: product?.sku || "",
          productName: product?.name || "未知产品",
          category: product?.category || "未分类",
          currentStock: inv?.quantity || 0,
          forecastPoints,
          summary: {
            totalForecast30d: cumForecast,
            avgDailyForecast,
            trend,
            confidence: quantities.length >= 60 ? "high" as const : quantities.length >= 30 ? "medium" as const : "low" as const,
          },
        };
      });

      forecasts.sort((a, b) => (b.summary.totalForecast30d || 0) - (a.summary.totalForecast30d || 0));

      const trendingUp = forecasts.filter(f => f.summary.trend === "up").length;
      const trendingDown = forecasts.filter(f => f.summary.trend === "down").length;

      return {
        forecastDays,
        smoothingAlpha,
        forecasts,
        summary: {
          totalProducts: forecasts.length,
          productsTrendingUp: trendingUp,
          productsTrendingDown: trendingDown,
          productsStable: forecasts.filter(f => f.summary.trend === "stable").length,
          insufficientData: forecasts.filter(f => f.summary.trend === "insufficient_data").length,
          avgDailyForecastAcrossProducts: forecasts.length > 0
            ? Math.round(forecasts.reduce((s, f) => s + (f.summary.avgDailyForecast || 0), 0) / forecasts.length * 10) / 10
            : 0,
        },
      };
    },
    CACHE_TTL.LONG
  );
}

