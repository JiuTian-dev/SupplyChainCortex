/**
 * Executive Reports — getFullReport, getExecutiveDashboard, getPerformanceDashboard, getLogisticsReport.
 * Extracted from services/reports.service.ts.
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { roundTo } from '@/lib/utils/format';
import { daysAgo, todayISO } from '@/lib/utils/date';
import type { FullReportResult, ExecutiveDashboardResult, PerformanceDashboardResult, LogisticsReportResult } from './reports-types';

// ─── Full Supply Chain Report ───────────────────────────────────────────────────

export async function getFullReport(): Promise<FullReportResult> {
  return cachedFetch(
    cacheKey('reports', 'full-report'),
    async () => {
      const [inventory, costRecords, salesRecords, shipments, suppliers, products] = await Promise.all([
        db.inventory.findMany(), db.costRecord.findMany(), db.salesRecord.findMany(),
        db.shipmentItem.findMany(), db.supplier.findMany(), db.product.findMany(),
      ]);

      const totalRevenue = salesRecords.reduce((sum, r) => sum + r.revenue, 0);
      const totalStock = inventory.reduce((sum, i) => sum + i.quantity, 0);
      const totalStockValue = inventory.reduce((sum, i) => {
        const cost = costRecords.find(c => c.sku === i.sku);
        return sum + i.quantity * (cost?.totalLanded || 0);
      }, 0);
      const avgMargin = costRecords.length > 0 ? roundTo(costRecords.reduce((sum, c) => sum + c.grossMargin, 0) / costRecords.length, 1) : 0;
      const criticalCount = inventory.filter(i => i.stockStatus === 'critical').length;
      const delayedShipments = shipments.filter(s => s.status === 'delayed' || s.status === 'exception').length;

      return {
        title: '供应链全景报告',
        generatedAt: new Date().toISOString(),
        overview: {
          totalProducts: products.length, totalRevenue: Math.round(totalRevenue),
          totalStock, totalStockValue: Math.round(totalStockValue),
          avgGrossMargin: avgMargin, criticalItems: criticalCount,
          delayedShipments, activeSuppliers: suppliers.filter(s => s.status === 'active').length,
        },
        inventory: {
          totalSKUs: inventory.length,
          healthy: inventory.filter(i => i.stockStatus === 'healthy').length,
          warning: inventory.filter(i => i.stockStatus === 'warning').length,
          critical: criticalCount,
          overstock: inventory.filter(i => i.stockStatus === 'overstock').length,
        },
        cost: { avgMargin, lowMarginCount: costRecords.filter(c => c.grossMargin < 45).length },
        logistics: {
          totalShipments: shipments.length,
          inTransit: shipments.filter(s => s.status === 'in_transit').length,
          delayed: delayedShipments,
          delivered: shipments.filter(s => s.status === 'delivered').length,
        },
        sales: {
          totalRevenue: Math.round(totalRevenue),
          totalQuantity: salesRecords.reduce((s, r) => s + r.quantity, 0),
          platforms: [...new Set(salesRecords.map(r => r.platform))],
        },
        suppliers: {
          total: suppliers.length, active: suppliers.filter(s => s.status === 'active').length,
          avgRating: suppliers.length > 0 ? roundTo(suppliers.reduce((s, sup) => s + sup.rating, 0) / suppliers.length, 1) : 0,
        },
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

// ─── Executive Dashboard ────────────────────────────────────────────────────────

export async function getExecutiveDashboard(): Promise<ExecutiveDashboardResult> {
  return cachedFetch(
    cacheKey('reports', 'executive-dashboard'),
    async () => {
      const [inventory, costRecords, salesRecords, shipments, suppliers, products, alertRules, events] = await Promise.all([
        db.inventory.findMany(), db.costRecord.findMany(), db.salesRecord.findMany(),
        db.shipmentItem.findMany(), db.supplier.findMany(), db.product.findMany(),
        db.alertRule.findMany({ where: { enabled: true } }),
        db.supplyChainEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      ]);

      // Health Score
      const totalInventory = inventory.length;
      const stockStatusCounts: Record<string, number> = {};
      inventory.forEach(inv => { stockStatusCounts[inv.stockStatus] = (stockStatusCounts[inv.stockStatus] || 0) + 1; });
      const healthyCount = stockStatusCounts['healthy'] || 0;
      const warningCount = stockStatusCounts['warning'] || 0;
      const criticalCount = stockStatusCounts['critical'] || 0;
      const overstockCount = stockStatusCounts['overstock'] || 0;

      const stockHealthScore = totalInventory > 0 ? Math.round((healthyCount * 60 + warningCount * 35 + overstockCount * 20 + criticalCount * 5) / totalInventory) : 30;
      const avgTurnoverRate = totalInventory > 0 ? inventory.reduce((sum, inv) => sum + inv.turnoverRate, 0) / totalInventory : 0;
      const turnoverScore = Math.min(40, avgTurnoverRate >= 8 ? 40 : avgTurnoverRate >= 6 ? 35 : avgTurnoverRate >= 4 ? 28 : avgTurnoverRate >= 2 ? 20 : avgTurnoverRate >= 1 ? 12 : 5);
      const inventoryScore = Math.min(100, stockHealthScore + turnoverScore);

      const totalCostRecords = costRecords.length;
      const avgMargin = totalCostRecords > 0 ? costRecords.reduce((sum, c) => sum + c.grossMargin, 0) / totalCostRecords : 0;
      const lowMarginCount = costRecords.filter(c => c.grossMargin < 40).length;
      const marginScore = Math.min(60, avgMargin >= 60 ? 60 : avgMargin >= 50 ? 50 : avgMargin >= 45 ? 40 : avgMargin >= 40 ? 30 : avgMargin >= 35 ? 20 : 10);
      const lowMarginPenalty = totalCostRecords > 0 ? Math.round((lowMarginCount / totalCostRecords) * 20) : 0;
      const totalLandedValues = costRecords.map(c => c.totalLanded);
      const avgTotalLanded = totalLandedValues.length > 0 ? totalLandedValues.reduce((a, b) => a + b, 0) / totalLandedValues.length : 0;
      const costVariance = totalLandedValues.length > 0 ? Math.sqrt(totalLandedValues.reduce((sum, v) => sum + Math.pow(v - avgTotalLanded, 2), 0) / totalLandedValues.length) : 0;
      const cv = avgTotalLanded > 0 ? costVariance / avgTotalLanded : 0;
      const varianceScore = Math.min(40, cv <= 0.1 ? 40 : cv <= 0.2 ? 35 : cv <= 0.3 ? 28 : cv <= 0.5 ? 18 : 8);
      const costScore = Math.max(0, Math.min(100, marginScore + varianceScore - lowMarginPenalty));

      const totalShipments = shipments.length;
      const onTimeDeliveries = shipments.filter(s => s.status === 'delivered' && s.delayDays <= 1).length;
      const onTimeRate = totalShipments > 0 ? (onTimeDeliveries / totalShipments) * 100 : 50;
      const deliveryScore = Math.round(onTimeRate >= 95 ? 60 : onTimeRate >= 90 ? 52 : onTimeRate >= 80 ? 42 : onTimeRate >= 70 ? 32 : onTimeRate >= 60 ? 22 : 10);
      const highRiskShipments = shipments.filter(s => s.riskLevel === 'high' || s.riskLevel === 'critical').length;
      const riskPenalty = totalShipments > 0 ? Math.round((highRiskShipments / totalShipments) * 30) : 0;
      const delayedShipments = shipments.filter(s => s.status === 'delayed' || s.status === 'exception').length;
      const delayPenalty = totalShipments > 0 ? Math.round((delayedShipments / totalShipments) * 15) : 0;
      const logisticsScore = Math.max(0, Math.min(100, deliveryScore + 40 - riskPenalty - delayPenalty));

      const totalRevenue = salesRecords.reduce((sum, r) => sum + r.revenue, 0);
      const thirtyDaysAgoStr = daysAgo(30);
      const sixtyDaysAgoStr = daysAgo(60);
      const todayStr = todayISO();
      const recentRevenue = salesRecords.filter(r => r.date >= new Date(thirtyDaysAgoStr) && r.date <= new Date(todayStr)).reduce((sum, r) => sum + r.revenue, 0);
      const priorRevenue = salesRecords.filter(r => r.date >= new Date(sixtyDaysAgoStr) && r.date < new Date(thirtyDaysAgoStr)).reduce((sum, r) => sum + r.revenue, 0);
      const growthRate = priorRevenue > 0 ? ((recentRevenue - priorRevenue) / priorRevenue) * 100 : 0;
      const growthScore = Math.min(40, growthRate >= 20 ? 40 : growthRate >= 10 ? 35 : growthRate >= 5 ? 30 : growthRate >= 0 ? 22 : growthRate >= -10 ? 14 : 5);
      const revenueByProduct: Record<string, number> = {};
      salesRecords.forEach(r => { revenueByProduct[r.sku] = (revenueByProduct[r.sku] || 0) + r.revenue; });
      const maxProductRevenue = Math.max(0, ...Object.values(revenueByProduct));
      const revenueConcentration = totalRevenue > 0 ? (maxProductRevenue / totalRevenue) * 100 : 0;
      const diversificationScore = Math.min(30, revenueConcentration <= 20 ? 30 : revenueConcentration <= 35 ? 25 : revenueConcentration <= 50 ? 18 : revenueConcentration <= 70 ? 10 : 5);
      const avgDailyRevenue = totalRevenue / 90;
      const volumeScore = Math.min(30, avgDailyRevenue >= 5000 ? 30 : avgDailyRevenue >= 3000 ? 25 : avgDailyRevenue >= 1000 ? 20 : avgDailyRevenue >= 500 ? 14 : 8);
      const salesScore = Math.min(100, growthScore + diversificationScore + volumeScore);

      const avgSupplierRating = suppliers.length > 0 ? suppliers.reduce((sum, s) => sum + s.rating, 0) / suppliers.length : 3;
      const avgLeadTime = suppliers.length > 0 ? suppliers.reduce((sum, s) => sum + s.leadTime, 0) / suppliers.length : 14;
      const inventoryRiskPenalty = totalInventory > 0 ? Math.round((criticalCount * 25 + warningCount * 12 + overstockCount * 8) / totalInventory * 10) : 0;
      const costRiskPenalty = totalCostRecords > 0 ? Math.round((50 - avgMargin) * 1.2 + lowMarginCount * 5) : 0;
      const logisticsRiskPenalty = totalShipments > 0 ? Math.round((delayedShipments * 15 + highRiskShipments * 20) / totalShipments * 10) : 0;
      const supplierRiskPenalty = Math.round((5 - avgSupplierRating) * 10 + Math.max(0, avgLeadTime - 14) * 2);
      const totalRiskPenalty = inventoryRiskPenalty + costRiskPenalty + logisticsRiskPenalty + supplierRiskPenalty + Math.min(10, alertRules.length * 2);
      const riskScore = Math.max(0, Math.min(100, 100 - totalRiskPenalty));

      const overallScore = Math.round(inventoryScore * 0.25 + costScore * 0.20 + logisticsScore * 0.20 + salesScore * 0.20 + riskScore * 0.15);
      const grade = overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : overallScore >= 60 ? 'D' : 'F';

      const totalStockValue = inventory.reduce((sum, i) => {
        const cost = costRecords.find(c => c.sku === i.sku);
        return sum + i.quantity * (cost?.totalLanded || 0);
      }, 0);

      const keyMetrics = {
        revenue: { total: Math.round(totalRevenue), recent30d: Math.round(recentRevenue), growthRate: roundTo(growthRate, 1) },
        cost: { avgLandedCost: totalCostRecords > 0 ? roundTo(costRecords.reduce((s, c) => s + c.totalLanded, 0) / totalCostRecords, 2) : 0, avgMargin: roundTo(avgMargin, 1), lowMarginProducts: lowMarginCount },
        inventory: { totalProducts: products.length, totalSKUs: inventory.length, totalStockValue: Math.round(totalStockValue), criticalItems: criticalCount, warningItems: warningCount, overstockItems: overstockCount },
        logistics: { totalShipments, onTimeDeliveryRate: Math.round(onTimeRate), delayedShipments, inTransit: shipments.filter(s => s.status === 'in_transit').length },
      };

      const criticalAlerts: { category: string; severity: string; message: string; action: string }[] = [];
      if (criticalCount > 0) criticalAlerts.push({ category: '库存', severity: 'critical', message: `${criticalCount} 个产品库存低于安全线`, action: '紧急补货' });
      if (warningCount > 0) criticalAlerts.push({ category: '库存', severity: 'warning', message: `${warningCount} 个产品库存偏低`, action: '安排补货' });
      if (lowMarginCount > 0) criticalAlerts.push({ category: '成本', severity: lowMarginCount > totalCostRecords * 0.3 ? 'critical' : 'warning', message: `${lowMarginCount} 个产品毛利率低于40%`, action: '优化成本结构' });
      if (delayedShipments > 0) criticalAlerts.push({ category: '物流', severity: delayedShipments > 3 ? 'critical' : 'warning', message: `${delayedShipments} 批货物延误`, action: '跟进延误货物' });
      const lowRatedSuppliers = suppliers.filter(s => s.rating < 3.5 && s.status === 'active');
      if (lowRatedSuppliers.length > 0) criticalAlerts.push({ category: '供应商', severity: 'warning', message: `${lowRatedSuppliers.length} 家供应商评分低于3.5`, action: '评估供应商表现' });

      const actionItems: { priority: 'high' | 'medium' | 'low'; title: string; description: string; category: string }[] = [];
      if (criticalCount > 0) actionItems.push({ priority: 'high', title: '紧急补货', description: `${criticalCount} 个产品低于安全库存，需立即安排补货`, category: '库存' });
      if (lowMarginCount > 0) actionItems.push({ priority: avgMargin < 40 ? 'high' : 'medium', title: '优化成本结构', description: `${lowMarginCount} 个产品毛利率低于40%，建议优化物流、关税和采购成本`, category: '成本' });
      if (delayedShipments > 0) actionItems.push({ priority: 'high', title: '跟进延误货物', description: `${delayedShipments} 批货物延误，需协调承运商和替代方案`, category: '物流' });
      if (growthRate < 0) actionItems.push({ priority: 'medium', title: '提升销售表现', description: `近期销售下降 ${Math.abs(Math.round(growthRate))}%，需调整销售策略`, category: '销售' });
      if (overallScore < 60) actionItems.push({ priority: 'high', title: '改善供应链健康', description: `供应链健康评分 ${overallScore}/100 (${grade}级)，需全面提升各维度表现`, category: '整体' });
      if (lowRatedSuppliers.length > 0) actionItems.push({ priority: 'medium', title: '优化供应商体系', description: `${lowRatedSuppliers.length} 家供应商评分偏低，建议评估和引入替代供应商`, category: '供应商' });
      if (overallScore >= 70) actionItems.push({ priority: 'low', title: '保持供应链优势', description: `供应链健康评分 ${overallScore}/100 (${grade}级)，保持当前管理水平`, category: '整体' });

      return {
        title: '高管仪表板报告',
        generatedAt: new Date().toISOString(),
        supplyChainHealth: {
          overallScore, grade,
          gradeLabel: overallScore >= 90 ? '优秀' : overallScore >= 80 ? '良好' : overallScore >= 70 ? '一般' : overallScore >= 60 ? '需改进' : '危险',
          subScores: {
            inventory: { score: inventoryScore, weight: '25%', label: '库存健康' },
            cost: { score: costScore, weight: '20%', label: '成本健康' },
            logistics: { score: logisticsScore, weight: '20%', label: '物流健康' },
            sales: { score: salesScore, weight: '20%', label: '销售健康' },
            risk: { score: riskScore, weight: '15%', label: '风险防控' },
          },
        },
        keyMetrics,
        criticalAlerts: { count: criticalAlerts.length, criticalCount: criticalAlerts.filter(a => a.severity === 'critical').length, warningCount: criticalAlerts.filter(a => a.severity === 'warning').length, items: criticalAlerts },
        actionItems: { total: actionItems.length, highPriority: actionItems.filter(a => a.priority === 'high').length, items: actionItems },
        recentEvents: events.slice(0, 10).map(e => ({ type: e.type, title: e.title, severity: e.severity, createdAt: e.createdAt.toISOString() })),
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

// ─── Performance Dashboard ──────────────────────────────────────────────────────

export async function getPerformanceDashboard(): Promise<PerformanceDashboardResult> {
  return cachedFetch(
    cacheKey('reports', 'performance-dashboard'),
    async () => {
      const [inventory, costRecords, salesRecords, shipments, suppliers] = await Promise.all([
        db.inventory.findMany(), db.costRecord.findMany(), db.salesRecord.findMany(),
        db.shipmentItem.findMany(), db.supplier.findMany({ where: { status: 'active' } }),
      ]);

      const totalRevenue = salesRecords.reduce((sum, r) => sum + r.revenue, 0);
      const avgMargin = costRecords.length > 0 ? roundTo(costRecords.reduce((sum, c) => sum + c.grossMargin, 0) / costRecords.length, 1) : 0;
      const avgTurnoverDays = inventory.length > 0 ? Math.round(inventory.reduce((sum, i) => sum + i.turnoverDays, 0) / inventory.length) : 0;
      const avgTurnoverRate = inventory.length > 0 ? roundTo(inventory.reduce((sum, i) => sum + i.turnoverRate, 0) / inventory.length, 1) : 0;

      const deliveredShipments = shipments.filter(s => s.status === 'delivered' || s.actualDelivery);
      const onTimeDeliveries = deliveredShipments.filter(s => s.delayDays === 0);
      const onTimeDeliveryRate = deliveredShipments.length > 0 ? Math.round(onTimeDeliveries.length / deliveredShipments.length * 100) : 0;

      const kpiSummary = {
        revenue: Math.round(totalRevenue), avgMargin, avgTurnoverDays, avgTurnoverRate,
        onTimeDeliveryRate, totalSKUs: inventory.length,
        criticalItems: inventory.filter(i => i.stockStatus === 'critical').length,
        activeSuppliers: suppliers.length,
        delayedShipments: shipments.filter(s => s.status === 'delayed' || s.status === 'exception').length,
      };

      const salesByMonth: Record<string, { month: string; revenue: number; quantity: number; orders: number }> = {};
      salesRecords.forEach(r => {
        const month = r.date.toISOString().substring(0, 7);
        if (!salesByMonth[month]) salesByMonth[month] = { month, revenue: 0, quantity: 0, orders: 0 };
        salesByMonth[month].revenue += r.revenue;
        salesByMonth[month].quantity += r.quantity;
        salesByMonth[month].orders += 1;
      });
      const monthlyData = Object.values(salesByMonth).sort((a, b) => a.month.localeCompare(b.month));
      const momComparisons = monthlyData.map((m, idx) => {
        const prev = idx > 0 ? monthlyData[idx - 1] : null;
        return { month: m.month, revenue: Math.round(m.revenue), quantity: m.quantity, orders: m.orders, revenueMoM: prev ? roundTo((m.revenue - prev.revenue) / prev.revenue * 100, 1) : null, quantityMoM: prev && prev.quantity > 0 ? roundTo((m.quantity - prev.quantity) / prev.quantity * 100, 1) : null };
      });

      const recentMonths = momComparisons.slice(-3);
      const trendIndicators = {
        revenueTrend: recentMonths.length >= 2 ? (recentMonths.every(m => (m.revenueMoM ?? 0) > 0) ? 'up' : recentMonths.every(m => (m.revenueMoM ?? 0) < 0) ? 'down' : 'stable') : 'stable',
        marginTrend: avgMargin >= 50 ? 'healthy' : avgMargin >= 40 ? 'warning' : 'danger',
        inventoryTrend: inventory.filter(i => i.stockStatus === 'critical').length > inventory.length * 0.2 ? 'critical' : inventory.filter(i => i.stockStatus === 'warning' || i.stockStatus === 'critical').length > inventory.length * 0.4 ? 'warning' : 'healthy',
        deliveryTrend: onTimeDeliveryRate >= 85 ? 'good' : onTimeDeliveryRate >= 70 ? 'warning' : 'poor',
      };

      return {
        title: '绩效仪表板报告',
        generatedAt: new Date().toISOString(),
        kpiSummary, monthOverMonth: momComparisons, trendIndicators,
        inventoryHealth: {
          healthy: inventory.filter(i => i.stockStatus === 'healthy').length,
          warning: inventory.filter(i => i.stockStatus === 'warning').length,
          critical: inventory.filter(i => i.stockStatus === 'critical').length,
          overstock: inventory.filter(i => i.stockStatus === 'overstock').length,
          healthRate: inventory.length > 0 ? Math.round(inventory.filter(i => i.stockStatus === 'healthy').length / inventory.length * 100) : 0,
        },
        shipmentSummary: {
          total: shipments.length,
          pending: shipments.filter(s => s.status === 'pending').length,
          inTransit: shipments.filter(s => s.status === 'in_transit').length,
          customs: shipments.filter(s => s.status === 'customs').length,
          delivered: shipments.filter(s => s.status === 'delivered').length,
          delayed: shipments.filter(s => s.status === 'delayed').length,
        },
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

// ─── Logistics Report ───────────────────────────────────────────────────────────

export async function getLogisticsReport(): Promise<LogisticsReportResult> {
  return cachedFetch(
    cacheKey('reports', 'logistics-report'),
    async () => {
      const shipments = await db.shipmentItem.findMany();

      const statusDistribution: Record<string, number> = {};
      shipments.forEach(s => { statusDistribution[s.status] = (statusDistribution[s.status] || 0) + 1; });

      const delivered = shipments.filter(s => s.status === 'delivered');
      const onTimeDelivered = delivered.filter(s => s.delayDays === 0);
      const onTimeDeliveryRate = delivered.length > 0 ? Math.round(onTimeDelivered.length / delivered.length * 100) : 0;

      const delayedShipments = shipments.filter(s => s.delayDays > 0);
      const avgDelayDays = delayedShipments.length > 0 ? roundTo(delayedShipments.reduce((s, sh) => s + sh.delayDays, 0) / delayedShipments.length, 1) : 0;

      const carrierPerformance: Record<string, { carrier: string; totalShipments: number; onTimeRate: number; avgDelayDays: number; delivered: number }> = {};
      shipments.forEach(s => {
        if (!carrierPerformance[s.carrier]) carrierPerformance[s.carrier] = { carrier: s.carrier, totalShipments: 0, onTimeRate: 0, avgDelayDays: 0, delivered: 0 };
        carrierPerformance[s.carrier].totalShipments++;
        if (s.status === 'delivered' && s.delayDays === 0) carrierPerformance[s.carrier].delivered++;
      });
      Object.values(carrierPerformance).forEach(c => {
        const carrierDelivered = shipments.filter(s => s.carrier === c.carrier && s.status === 'delivered').length;
        c.onTimeRate = carrierDelivered > 0 ? Math.round(c.delivered / carrierDelivered * 100) : 0;
        const carrierDelayed = shipments.filter(s => s.carrier === c.carrier && s.delayDays > 0);
        c.avgDelayDays = carrierDelayed.length > 0 ? roundTo(carrierDelayed.reduce((s, sh) => s + sh.delayDays, 0) / carrierDelayed.length, 1) : 0;
      });

      const riskDistribution: Record<string, number> = {};
      shipments.forEach(s => { riskDistribution[s.riskLevel] = (riskDistribution[s.riskLevel] || 0) + 1; });

      return {
        title: '物流报告',
        generatedAt: new Date().toISOString(),
        shipmentStatusDistribution: statusDistribution,
        onTimeDeliveryRate, averageDelayDays: avgDelayDays,
        carrierPerformance: Object.values(carrierPerformance),
        riskLevelDistribution: riskDistribution,
        totalShipments: shipments.length,
      };
    },
    CACHE_TTL.VERY_LONG
  );
}
