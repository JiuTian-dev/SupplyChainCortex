/**
 * Supplier Analytics — getSupplierPerformanceAnalytics, getSupplierPerformanceAnalyticsEnhanced.
 * Extracted from services/analytics.service.ts.
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { roundTo } from '@/lib/utils/format';

// ─── Private Helper ──────────────────────────────────────────────────────────────

function getSupplierRecommendation(
  onTimeRate: number,
  qualityScore: number,
  leadTimeScore: number,
  riskLevel: string
): string {
  if (riskLevel === "high") {
    if (onTimeRate < 70) return "交货准时率低，建议寻找替代供应商并建立备选方案";
    if (qualityScore < 60) return "质量评分低，建议加强来料检验并要求供应商改善";
    return "整体风险较高，建议密切监控并准备备选供应商";
  }
  if (onTimeRate > 90 && qualityScore > 80) {
    return "优秀供应商，建议深化合作关系，争取更优价格";
  }
  if (leadTimeScore < 60) {
    return "交货周期较长，建议协商缩短提前期或增加安全库存";
  }
  return "供应商表现稳定，保持当前合作水平";
}

// ─── 1. Supplier Performance Analytics (Legacy) ──────────────────────────────

export async function getSupplierPerformanceAnalytics() {
  return cachedFetch(
    cacheKey('analytics', 'supplier-performance'),
    async () => {
      const suppliers = await db.supplier.findMany({
        where: { status: "active" },
      });

      const shipments = await db.shipmentItem.findMany();
      const costRecords = await db.costRecord.findMany({
        include: { product: true },
      });

      const supplierAnalysis = suppliers.map((supplier) => {
        const supplierShipments = shipments.filter(
          (s) => s.origin === supplier.region || s.carrier.includes(supplier.code)
        );
        const onTimeDeliveries = supplierShipments.filter((s) => s.delayDays === 0);
        const onTimeRate =
          supplierShipments.length > 0
            ? Math.round((onTimeDeliveries.length / supplierShipments.length) * 100)
            : 85 + Math.round(supplier.rating * 3);

        const categoryProducts = costRecords.filter(
          (c) => c.product?.category === supplier.category
        );
        const avgMargin =
          categoryProducts.length > 0
            ? categoryProducts.reduce((sum, c) => sum + c.grossMargin, 0) /
              categoryProducts.length
            : 50;
        const qualityScore = Math.min(100, Math.max(0, Math.round(avgMargin * 1.5)));

        const leadTimeScore = Math.max(
          0,
          Math.min(100, 100 - (supplier.leadTime - 7) * 3)
        );

        const riskScore = Math.round(
          (100 - onTimeRate) * 0.3 +
            (100 - qualityScore) * 0.3 +
            (100 - leadTimeScore) * 0.2 +
            (supplier.leadTime > 30 ? 20 : 0) +
            (supplier.rating < 3 ? 15 : 0)
        );
        const riskLevel =
          riskScore > 60 ? "high" : riskScore > 35 ? "medium" : "low";

        const overallScore = Math.round(
          onTimeRate * 0.3 + qualityScore * 0.3 + leadTimeScore * 0.2 + (100 - riskScore) * 0.2
        );

        return {
          code: supplier.code,
          name: supplier.name,
          region: supplier.region,
          category: supplier.category,
          rating: supplier.rating,
          leadTime: supplier.leadTime,
          metrics: {
            onTimeDeliveryRate: onTimeRate,
            qualityScore,
            leadTimeConsistency: leadTimeScore,
            riskScore: Math.min(100, riskScore),
            overallScore,
          },
          riskLevel,
          recommendation: getSupplierRecommendation(onTimeRate, qualityScore, leadTimeScore, riskLevel),
        };
      });

      supplierAnalysis.sort((a, b) => b.metrics.overallScore - a.metrics.overallScore);

      const ranked = supplierAnalysis.map((s, i) => ({
        ...s,
        rank: i + 1,
      }));

      return {
        suppliers: ranked,
        summary: {
          totalSuppliers: suppliers.length,
          avgOnTimeRate:
            ranked.length > 0
              ? Math.round(
                  ranked.reduce((s, r) => s + r.metrics.onTimeDeliveryRate, 0) /
                    ranked.length
                )
              : 0,
          avgQualityScore:
            ranked.length > 0
              ? Math.round(
                  ranked.reduce((s, r) => s + r.metrics.qualityScore, 0) /
                    ranked.length
                )
              : 0,
          highRiskCount: ranked.filter((s) => s.riskLevel === "high").length,
          topPerformer: ranked[0]?.name || "无",
        },
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

// ─── 2. Supplier Performance Analytics (Enhanced) ────────────────────────────

export async function getSupplierPerformanceAnalyticsEnhanced(months: number = 6) {
  return cachedFetch(
    cacheKey('analytics', 'supplier_performance_enhanced', months),
    async () => {
      const [suppliers, shipments, costRecords, reorderOrders, inventory] = await Promise.all([
        db.supplier.findMany({ where: { status: "active" } }),
        db.shipmentItem.findMany(),
        db.costRecord.findMany({ include: { product: true } }),
        db.reorderOrder.findMany(),
        db.inventory.findMany(),
      ]);

      const supplierMetrics = suppliers.map(supplier => {
        const relatedShipments = shipments.filter(s => {
          if (supplier.category === "物流运输") return s.carrier.includes("顺达") || s.carrier.includes("物流");
          if (supplier.category === "清关服务") return s.status === "customs";
          if (supplier.region === "华南") return s.origin.includes("深圳") || s.origin.includes("东莞") || s.origin.includes("佛山");
          if (supplier.region === "华东") return s.origin.includes("上海") || s.origin.includes("义乌") || s.origin.includes("宁波");
          return false;
        });

        const onTimeDeliveries = relatedShipments.filter(s => s.delayDays === 0).length;
        const totalDeliveries = relatedShipments.length;
        const onTimeRate = totalDeliveries > 0
          ? Math.round((onTimeDeliveries / totalDeliveries) * 100)
          : null;

        const qualityScore = Math.round(supplier.rating * 20);

        const delays = relatedShipments.map(s => s.delayDays);
        const avgDelay = delays.length > 0
          ? delays.reduce((a, b) => a + b, 0) / delays.length
          : 0;
        const delayVariance = delays.length > 1
          ? delays.reduce((sum, d) => sum + Math.pow(d - avgDelay, 2), 0) / delays.length
          : 0;
        const leadTimeConsistency = delayVariance < 1 ? 95 : delayVariance < 4 ? 80 : delayVariance < 9 ? 65 : 50;

        const relatedCosts = costRecords.filter(c => {
          if (supplier.category === "塑料/五金件" || supplier.category === "电子元器件") return true;
          return false;
        });
        const avgLandedCost = relatedCosts.length > 0
          ? relatedCosts.reduce((sum, c) => sum + c.totalLanded, 0) / relatedCosts.length
          : 0;
        const overallAvgCost = costRecords.length > 0
          ? costRecords.reduce((sum, c) => sum + c.totalLanded, 0) / costRecords.length
          : 0;
        const costCompetitiveness = overallAvgCost > 0
          ? Math.round(Math.min(100, (overallAvgCost / Math.max(avgLandedCost, 0.01)) * 80))
          : 70;

        const relatedOrders = reorderOrders.filter(o => {
          if (supplier.category === "成品代工") return o.priority === "常规" || o.priority === "紧急";
          return o.sku.startsWith(supplier.category.substring(0, 2));
        });
        const fulfilledOrders = relatedOrders.filter(o => o.status === "delivered" || o.status === "shipped").length;
        const fulfillmentRate = relatedOrders.length > 0
          ? Math.round((fulfilledOrders / relatedOrders.length) * 100)
          : null;

        const riskFlags: Array<{ type: string; severity: string }> = [];
        const sameCategorySuppliers = suppliers.filter(s => s.category === supplier.category);
        if (sameCategorySuppliers.length === 1) riskFlags.push({ type: "单一来源", severity: "high" });
        else if (sameCategorySuppliers.length === 2) riskFlags.push({ type: "来源集中", severity: "medium" });
        if (supplier.leadTime > 20) riskFlags.push({ type: "交期过长", severity: "medium" });
        if (supplier.rating < 3.5) riskFlags.push({ type: "评分偏低", severity: "medium" });

        const metrics: number[] = [];
        const weights: number[] = [];
        if (onTimeRate !== null) { metrics.push(onTimeRate); weights.push(0.3); }
        metrics.push(qualityScore); weights.push(0.25);
        metrics.push(leadTimeConsistency); weights.push(0.2);
        metrics.push(costCompetitiveness); weights.push(0.15);
        if (fulfillmentRate !== null) { metrics.push(fulfillmentRate); weights.push(0.1); }
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        const healthIndex = Math.round(
          metrics.reduce((sum, m, i) => sum + m * (weights[i] / totalWeight), 0)
        );

        return {
          code: supplier.code,
          name: supplier.name,
          region: supplier.region,
          category: supplier.category,
          leadTime: supplier.leadTime,
          rating: supplier.rating,
          onTimeRate,
          qualityScore,
          leadTimeConsistency,
          costCompetitiveness,
          fulfillmentRate,
          healthIndex,
          riskFlags,
        };
      });

      // Trends: month-over-month performance trends based on shipment data
      const shipmentMonths = [...new Set(shipments.map(s => s.createdAt.toISOString().substring(0, 7)))].sort();
      const recentMonths = shipmentMonths.slice(-months);

      const trendData = recentMonths.map(month => {
        const monthShipments = shipments.filter(s => s.createdAt.toISOString().substring(0, 7) === month);
        const monthOnTime = monthShipments.filter(s => s.delayDays === 0).length;
        const monthTotal = monthShipments.length;
        const monthDelayed = monthShipments.filter(s => s.delayDays > 0).length;

        return {
          month,
          onTimeDeliveryRate: monthTotal > 0 ? Math.round(monthOnTime / monthTotal * 100) : null,
          delayedShipments: monthDelayed,
          totalShipments: monthTotal,
          avgDelayDays: monthDelayed > 0
            ? Math.round(monthShipments.filter(s => s.delayDays > 0).reduce((sum, s) => sum + s.delayDays, 0) / monthDelayed * 10) / 10
            : 0,
        };
      });

      // Comparisons: Category-level and region-level comparisons
      const categoryComparison: Record<string, { category: string; suppliers: number; avgRating: number; avgHealthIndex: number; avgLeadTime: number }> = {};
      supplierMetrics.forEach(s => {
        if (!categoryComparison[s.category]) {
          categoryComparison[s.category] = { category: s.category, suppliers: 0, avgRating: 0, avgHealthIndex: 0, avgLeadTime: 0 };
        }
        categoryComparison[s.category].suppliers++;
        categoryComparison[s.category].avgRating += s.rating;
        categoryComparison[s.category].avgHealthIndex += s.healthIndex;
        categoryComparison[s.category].avgLeadTime += s.leadTime;
      });
      Object.values(categoryComparison).forEach(c => {
        c.avgRating = Math.round(c.avgRating / c.suppliers * 10) / 10;
        c.avgHealthIndex = Math.round(c.avgHealthIndex / c.suppliers);
        c.avgLeadTime = Math.round(c.avgLeadTime / c.suppliers);
      });

      const regionComparison: Record<string, { region: string; suppliers: number; avgRating: number; avgHealthIndex: number }> = {};
      supplierMetrics.forEach(s => {
        if (!regionComparison[s.region]) {
          regionComparison[s.region] = { region: s.region, suppliers: 0, avgRating: 0, avgHealthIndex: 0 };
        }
        regionComparison[s.region].suppliers++;
        regionComparison[s.region].avgRating += s.rating;
        regionComparison[s.region].avgHealthIndex += s.healthIndex;
      });
      Object.values(regionComparison).forEach(r => {
        r.avgRating = Math.round(r.avgRating / r.suppliers * 10) / 10;
        r.avgHealthIndex = Math.round(r.avgHealthIndex / r.suppliers);
      });

      // Performance ranking with delta from average
      const avgOverallHealth = supplierMetrics.length > 0
        ? Math.round(supplierMetrics.reduce((s, m) => s + m.healthIndex, 0) / supplierMetrics.length)
        : 0;

      const rankedSuppliers = [...supplierMetrics]
        .sort((a, b) => b.healthIndex - a.healthIndex)
        .map((s, idx) => ({
          rank: idx + 1,
          code: s.code,
          name: s.name,
          category: s.category,
          region: s.region,
          healthIndex: s.healthIndex,
          deltaFromAverage: s.healthIndex - avgOverallHealth,
          rating: s.rating,
          onTimeRate: s.onTimeRate,
          riskFlagCount: s.riskFlags.length,
        }));

      // Risk summary
      const allRiskFlags = supplierMetrics.flatMap(s => s.riskFlags);
      const riskSummary = {
        totalRiskFlags: allRiskFlags.length,
        highSeverity: allRiskFlags.filter(r => r.severity === "high").length,
        mediumSeverity: allRiskFlags.filter(r => r.severity === "medium").length,
        byType: allRiskFlags.reduce<Record<string, number>>((acc, r) => {
          acc[r.type] = (acc[r.type] || 0) + 1;
          return acc;
        }, {}),
      };

      return {
        title: "供应商绩效分析",
        generatedAt: new Date().toISOString(),
        summary: {
          totalSuppliers: suppliers.length,
          avgHealthIndex: avgOverallHealth,
          topPerformer: rankedSuppliers[0]?.name || "无",
          worstPerformer: rankedSuppliers[rankedSuppliers.length - 1]?.name || "无",
        },
        trends: {
          months: recentMonths,
          deliveryPerformance: trendData,
          trendDirection: trendData.length >= 2
            ? (() => {
                const rates = trendData.filter(t => t.onTimeDeliveryRate !== null).map(t => t.onTimeDeliveryRate!);
                if (rates.length < 2) return "insufficient_data" as const;
                const lastHalf = rates.slice(-Math.ceil(rates.length / 2));
                const firstHalf = rates.slice(0, Math.ceil(rates.length / 2));
                const lastAvg = lastHalf.reduce((a, b) => a + b, 0) / lastHalf.length;
                const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
                return lastAvg > firstAvg + 5 ? "improving" as const : lastAvg < firstAvg - 5 ? "declining" as const : "stable" as const;
              })()
            : "insufficient_data" as const,
        },
        comparisons: {
          byCategory: Object.values(categoryComparison),
          byRegion: Object.values(regionComparison),
        },
        ranking: rankedSuppliers,
        riskSummary,
      };
    },
    CACHE_TTL.VERY_LONG
  );
}
