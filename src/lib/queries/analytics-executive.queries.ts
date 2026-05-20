/**
 * Executive Analytics — getKPIAnalytics, getTimeSeriesAnalytics, getComparisonAnalytics, getAnomaliesAnalytics.
 * Extracted from services/analytics.service.ts.
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { roundTo } from '@/lib/utils/format';
import { startOfMonth } from '@/lib/utils/date';

// ─── 10. KPI Analytics ───────────────────────────────────────────────────────

export async function getKPIAnalytics() {
  return cachedFetch(
    cacheKey('analytics', 'kpi'),
    async () => {
      const [inventory, costRecords, salesRecords, shipments, suppliers] = await Promise.all([
        db.inventory.findMany(),
        db.costRecord.findMany(),
        db.salesRecord.findMany(),
        db.shipmentItem.findMany(),
        db.supplier.findMany({ where: { status: "active" } }),
      ]);

      // Inventory turnover rate
      const avgTurnoverRate = inventory.length > 0
        ? Math.round(inventory.reduce((s, i) => s + i.turnoverRate, 0) / inventory.length * 100) / 100
        : 0;

      // Stock-out rate
      const criticalCount = inventory.filter(i => i.stockStatus === "critical" || i.quantity === 0).length;
      const stockOutRate = inventory.length > 0
        ? Math.round(criticalCount / inventory.length * 1000) / 10
        : 0;

      // Order fill rate
      const availableCount = inventory.filter(i => i.stockStatus === "healthy" || i.stockStatus === "overstock").length;
      const orderFillRate = inventory.length > 0
        ? Math.round(availableCount / inventory.length * 100)
        : 0;

      // On-time delivery rate
      const delivered = shipments.filter(s => s.status === "delivered");
      const onTimeDeliveryRate = delivered.length > 0
        ? Math.round(delivered.filter(s => s.delayDays === 0).length / delivered.length * 100)
        : 0;

      // Cost efficiency (avg margin)
      const costEfficiency = costRecords.length > 0
        ? Math.round(costRecords.reduce((s, c) => s + c.grossMargin, 0) / costRecords.length * 10) / 10
        : 0;

      // Revenue growth rate (MoM)
      const today = new Date();
      const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const thisMonthRevenue = salesRecords.filter(r => r.date >= thisMonthStart).reduce((s, r) => s + r.revenue, 0);
      const lastMonthRevenue = salesRecords.filter(r => r.date >= lastMonthStart && r.date < thisMonthStart).reduce((s, r) => s + r.revenue, 0);
      const revenueGrowthRate = lastMonthRevenue > 0
        ? Math.round((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue * 1000) / 10
        : 0;

      // Supplier reliability score
      const avgSupplierRating = suppliers.length > 0
        ? Math.round(suppliers.reduce((s, sup) => s + sup.rating, 0) / suppliers.length * 20 * 10) / 10
        : 0;

      return {
        generatedAt: new Date().toISOString(),
        kpis: {
          inventoryTurnoverRate: avgTurnoverRate,
          stockOutRate,
          orderFillRate,
          onTimeDeliveryRate,
          costEfficiency,
          revenueGrowthRate,
          supplierReliabilityScore: avgSupplierRating,
        },
        details: {
          totalProducts: inventory.length,
          criticalItems: criticalCount,
          totalShipments: shipments.length,
          activeSuppliers: suppliers.length,
          totalRevenue: Math.round(salesRecords.reduce((s, r) => s + r.revenue, 0)),
        },
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

// ─── 11. Time Series Analytics ───────────────────────────────────────────────

export interface TimeSeriesParams {
  metric?: string;
  days?: number;
}

export async function getTimeSeriesAnalytics(params: TimeSeriesParams = {}) {
  const { metric = "revenue", days = 30 } = params;

  return cachedFetch(
    cacheKey('analytics', 'time_series', metric, days),
    async () => {
      const [salesRecords, inventory, costRecords, shipments] = await Promise.all([
        db.salesRecord.findMany(),
        db.inventory.findMany(),
        db.costRecord.findMany(),
        db.shipmentItem.findMany(),
      ]);

      const today = new Date();
      const dataPoints: Array<{ date: string; value: number }> = [];

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];

        const byDate = (r: { date: Date }) => r.date.toISOString().split('T')[0] === dateStr;
        let value = 0;
        switch (metric) {
          case "revenue":
            value = Math.round(salesRecords.filter(byDate).reduce((s, r) => s + r.revenue, 0));
            break;
          case "quantity":
            value = salesRecords.filter(byDate).reduce((s, r) => s + r.quantity, 0);
            break;
          case "inventory_level":
            value = inventory.reduce((s, inv) => s + inv.quantity, 0);
            break;
          case "cost": {
            const daySales = salesRecords.filter(byDate);
            value = Math.round(daySales.reduce((s, r) => {
              const cost = costRecords.find(c => c.productId === r.productId);
              return s + r.quantity * (cost?.totalLanded || 0);
            }, 0));
            break;
          }
          case "shipments":
            value = shipments.filter(s => s.createdAt.toISOString().split("T")[0] === dateStr).length;
            break;
          default:
            value = Math.round(salesRecords.filter(byDate).reduce((s, r) => s + r.revenue, 0));
        }
        dataPoints.push({ date: dateStr, value });
      }

      return {
        generatedAt: new Date().toISOString(),
        metric,
        days,
        data: dataPoints,
        summary: {
          total: dataPoints.reduce((s, d) => s + d.value, 0),
          average: dataPoints.length > 0 ? Math.round(dataPoints.reduce((s, d) => s + d.value, 0) / dataPoints.length * 100) / 100 : 0,
          max: Math.max(0, ...dataPoints.map(d => d.value)),
          min: Math.min(0, ...dataPoints.filter(d => d.value > 0).map(d => d.value)),
          trend: dataPoints.length >= 7
            ? (() => {
                const recent = dataPoints.slice(-7).reduce((s, d) => s + d.value, 0) / 7;
                const older = dataPoints.slice(0, 7).reduce((s, d) => s + d.value, 0) / 7;
                return recent > older * 1.05 ? "increasing" : recent < older * 0.95 ? "decreasing" : "stable";
              })()
            : "insufficient_data",
        },
      };
    },
    CACHE_TTL.LONG
  );
}

// ─── 12. Comparison Analytics ────────────────────────────────────────────────

export async function getComparisonAnalytics() {
  return cachedFetch(
    cacheKey('analytics', 'comparison'),
    async () => {
      const [salesRecords, costRecords, inventory, shipments] = await Promise.all([
        db.salesRecord.findMany(),
        db.costRecord.findMany(),
        db.inventory.findMany(),
        db.shipmentItem.findMany(),
      ]);

      const today = new Date();
      const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

      // Current month metrics
      const currentRevenue = salesRecords.filter(r => r.date >= thisMonthStart).reduce((s, r) => s + r.revenue, 0);
      const currentCost = salesRecords.filter(r => r.date >= thisMonthStart).reduce((s, r) => {
        const cost = costRecords.find(c => c.productId === r.productId);
        return s + r.quantity * (cost?.totalLanded || 0);
      }, 0);
      const currentInventoryValue = inventory.reduce((s, i) => {
        const cost = costRecords.find(c => c.sku === i.sku);
        return s + i.quantity * (cost?.totalLanded || 0);
      }, 0);
      const currentShipmentCount = shipments.filter(s => s.createdAt >= thisMonthStart).length;

      // Previous month metrics
      const prevRevenue = salesRecords.filter(r => r.date >= lastMonthStart && r.date < thisMonthStart).reduce((s, r) => s + r.revenue, 0);
      const prevCost = salesRecords.filter(r => r.date >= lastMonthStart && r.date < thisMonthStart).reduce((s, r) => {
        const cost = costRecords.find(c => c.productId === r.productId);
        return s + r.quantity * (cost?.totalLanded || 0);
      }, 0);
      const prevShipmentCount = shipments.filter(s => s.createdAt >= lastMonthStart && s.createdAt < thisMonthStart).length;

      const pctChange = (curr: number, prev: number) => prev > 0 ? Math.round((curr - prev) / prev * 1000) / 10 : 0;

      return {
        generatedAt: new Date().toISOString(),
        currentMonth: { start: thisMonthStart, revenue: Math.round(currentRevenue), cost: Math.round(currentCost), inventoryValue: Math.round(currentInventoryValue), shipmentCount: currentShipmentCount },
        previousMonth: { start: lastMonthStart, revenue: Math.round(prevRevenue), cost: Math.round(prevCost), shipmentCount: prevShipmentCount },
        changes: {
          revenue: { absolute: Math.round(currentRevenue - prevRevenue), percentage: pctChange(currentRevenue, prevRevenue) },
          cost: { absolute: Math.round(currentCost - prevCost), percentage: pctChange(currentCost, prevCost) },
          inventoryValue: { absolute: 0, percentage: 0, note: "Inventory is point-in-time, not period-based" },
          shipmentCount: { absolute: currentShipmentCount - prevShipmentCount, percentage: pctChange(currentShipmentCount, prevShipmentCount) },
        },
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

// ─── 13. Anomalies Analytics ─────────────────────────────────────────────────

export async function getAnomaliesAnalytics() {
  return cachedFetch(
    cacheKey('analytics', 'anomalies'),
    async () => {
      const [inventory, costRecords, salesRecords, shipments] = await Promise.all([
        db.inventory.findMany({ include: { product: true } }),
        db.costRecord.findMany(),
        db.salesRecord.findMany(),
        db.shipmentItem.findMany(),
      ]);

      // Products with unusual stock levels
      const stockAnomalies = inventory
        .filter(i => i.safetyStock > 0 && (i.quantity > i.safetyStock * 5 || i.quantity < i.safetyStock * 0.3))
        .map(i => ({
          sku: i.sku,
          productName: i.productName,
          quantity: i.quantity,
          safetyStock: i.safetyStock,
          ratio: Math.round(i.quantity / i.safetyStock * 100) / 100,
          type: i.quantity > i.safetyStock * 5 ? "overstock" : "critical",
          severity: i.quantity < i.safetyStock * 0.2 ? "high" : "medium",
        }));

      // Cost records with margin below 5%
      const lowMarginAnomalies = costRecords
        .filter(c => c.grossMargin < 5)
        .map(c => ({
          sku: c.sku,
          productName: c.productName,
          grossMargin: c.grossMargin,
          totalLanded: Math.round(c.totalLanded * 100) / 100,
          sellingPrice: c.sellingPrice,
          severity: c.grossMargin < 0 ? "critical" : "high",
        }));

      // Shipments delayed more than 7 days
      const delayedShipments = shipments
        .filter(s => s.delayDays > 7)
        .map(s => ({
          trackingNumber: s.trackingNumber,
          sku: s.sku,
          productName: s.productName,
          delayDays: s.delayDays,
          status: s.status,
          carrier: s.carrier,
          severity: s.delayDays > 14 ? "critical" : "high",
        }));

      // Products with declining sales trend
      const today = new Date();
      const fifteenDaysAgo = new Date(today); fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
      const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentSales: Record<string, number> = {};
      const priorSales: Record<string, number> = {};
      salesRecords.forEach(r => {
        if (r.date >= fifteenDaysAgo && r.date <= today) {
          recentSales[r.sku] = (recentSales[r.sku] || 0) + r.quantity;
        }
        if (r.date >= thirtyDaysAgo && r.date < fifteenDaysAgo) {
          priorSales[r.sku] = (priorSales[r.sku] || 0) + r.quantity;
        }
      });

      const decliningProducts = Object.keys(recentSales)
        .filter(sku => priorSales[sku] && recentSales[sku] < priorSales[sku] * 0.5)
        .map(sku => {
          const inv = inventory.find(i => i.sku === sku);
          return {
            sku,
            productName: inv?.productName || sku,
            recentQuantity: recentSales[sku],
            priorQuantity: priorSales[sku],
            declineRate: priorSales[sku] > 0 ? Math.round((1 - recentSales[sku] / priorSales[sku]) * 100) : 0,
            severity: recentSales[sku] < priorSales[sku] * 0.25 ? "critical" : "high",
          };
        })
        .sort((a, b) => b.declineRate - a.declineRate);

      return {
        generatedAt: new Date().toISOString(),
        anomalies: {
          stockAnomalies: { count: stockAnomalies.length, items: stockAnomalies },
          lowMarginAnomalies: { count: lowMarginAnomalies.length, items: lowMarginAnomalies },
          delayedShipments: { count: delayedShipments.length, items: delayedShipments },
          decliningProducts: { count: decliningProducts.length, items: decliningProducts },
        },
        summary: {
          totalAnomalies: stockAnomalies.length + lowMarginAnomalies.length + delayedShipments.length + decliningProducts.length,
          criticalCount: [...stockAnomalies, ...lowMarginAnomalies, ...delayedShipments, ...decliningProducts].filter(a => a.severity === "critical").length,
          highCount: [...stockAnomalies, ...lowMarginAnomalies, ...delayedShipments, ...decliningProducts].filter(a => a.severity === "high").length,
        },
      };
    },
    CACHE_TTL.LONG
  );
}
