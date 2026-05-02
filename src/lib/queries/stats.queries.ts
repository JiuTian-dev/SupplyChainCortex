/**
 * Stats Queries — statistics aggregation for /api/stats.
 * Migrated from services/stats.service.ts. Caching contract preserved.
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { todayISO, daysAgo } from '@/lib/utils/date';
import { roundTo } from '@/lib/utils/format';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface StatsPeriod {
  type: string;
  days: number;
  startDate: string;
  endDate: string;
}

export interface StatsResult {
  period: StatsPeriod;
  revenue: {
    total: number;
    quantity: number;
    avgDailyRevenue: number;
  };
  revenueTrend: Array<{ date: string; revenue: number; quantity: number }>;
  topProducts: Array<{ sku: string; name: string; revenue: number; quantity: number }>;
  platformDistribution: Array<{ platform: string; revenue: number; quantity: number; orderCount: number }>;
  inventoryHealth: {
    healthy: number;
    warning: number;
    critical: number;
    overstock: number;
    total: number;
    avgTurnoverDays: number;
  };
  shipment: {
    onTimeRate: number;
    total: number;
    delivered: number;
    delayed: number;
  };
  cost: {
    avgMargin: number;
    avgLandedCost: number;
    totalProducts: number;
    belowMarginThreshold: number;
  };
  supplier: {
    total: number;
    active: number;
    avgLeadTime: number;
    avgRating: number;
  };
  reorder: {
    total: number;
    pending: number;
    urgent: number;
  };
  notes: {
    total: number;
    unresolved: number;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────────

const MAX_TAKE = 5000;

// ─── Core ────────────────────────────────────────────────────────────────────────

/** Get aggregated statistics for a given period */
export async function getStats(period = '30d', sku?: string): Promise<StatsResult> {
  return cachedFetch(
    cacheKey('stats', period, sku || 'all'),
    async () => {
      const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
      const startDateStr = daysAgo(days);
      const endDateStr = todayISO();

      // 1. Revenue stats
      const salesRecords = await db.salesRecord.findMany({
        where: {
          date: { gte: startDateStr, lte: endDateStr },
          ...(sku ? { sku } : {}),
        },
        take: MAX_TAKE,
      });

      const totalRevenue = salesRecords.reduce((sum, r) => sum + r.revenue, 0);
      const totalQuantity = salesRecords.reduce((sum, r) => sum + r.quantity, 0);

      // 2. Revenue trend
      const revenueByDate = new Map<string, { revenue: number; quantity: number }>();
      salesRecords.forEach(r => {
        const entry = revenueByDate.get(r.date) || { revenue: 0, quantity: 0 };
        entry.revenue += r.revenue;
        entry.quantity += r.quantity;
        revenueByDate.set(r.date, entry);
      });

      const revenueTrend = [...revenueByDate.entries()]
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // 3. Top 5 products
      const revenueByProduct = new Map<string, { sku: string; name: string; revenue: number; quantity: number }>();
      salesRecords.forEach(r => {
        const entry = revenueByProduct.get(r.sku) || { sku: r.sku, name: r.productName, revenue: 0, quantity: 0 };
        entry.revenue += r.revenue;
        entry.quantity += r.quantity;
        revenueByProduct.set(r.sku, entry);
      });

      const topProducts = [...revenueByProduct.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      // 4. Platform distribution
      const revenueByPlatform = new Map<string, { platform: string; revenue: number; quantity: number; orderCount: number }>();
      salesRecords.forEach(r => {
        const entry = revenueByPlatform.get(r.platform) || { platform: r.platform, revenue: 0, quantity: 0, orderCount: 0 };
        entry.revenue += r.revenue;
        entry.quantity += r.quantity;
        entry.orderCount += 1;
        revenueByPlatform.set(r.platform, entry);
      });
      const platformDistribution = [...revenueByPlatform.values()]
        .sort((a, b) => b.revenue - a.revenue);

      // 5. Inventory health — groupBy for counting
      const inventoryHealthCounts = await db.inventory.groupBy({
        by: ['stockStatus'],
        _count: true,
        _avg: { turnoverDays: true },
      });

      const totalInventory = inventoryHealthCounts.reduce((sum, g) => sum + g._count, 0);
      const inventoryHealth = {
        healthy: inventoryHealthCounts.find(g => g.stockStatus === 'healthy')?._count || 0,
        warning: inventoryHealthCounts.find(g => g.stockStatus === 'warning')?._count || 0,
        critical: inventoryHealthCounts.find(g => g.stockStatus === 'critical')?._count || 0,
        overstock: inventoryHealthCounts.find(g => g.stockStatus === 'overstock')?._count || 0,
        total: totalInventory,
        avgTurnoverDays: Math.round(
          inventoryHealthCounts.reduce((sum, g) => sum + (g._avg.turnoverDays || 0) * g._count, 0) / Math.max(totalInventory, 1)
        ),
      };

      // 6. Shipment stats
      const [totalShipments, deliveredCount, delayedCount] = await Promise.all([
        db.shipmentItem.count(),
        db.shipmentItem.count({ where: { status: 'delivered' } }),
        db.shipmentItem.count({ where: { status: 'delayed' } }),
      ]);

      const deliveredShipments = await db.shipmentItem.findMany({
        where: { status: 'delivered' },
        select: { delayDays: true },
        take: MAX_TAKE,
      });
      const onTimeDeliveries = deliveredShipments.filter(s => s.delayDays <= 0).length;
      const shipmentOnTimeRate = deliveredShipments.length > 0
        ? Math.round((onTimeDeliveries / deliveredShipments.length) * 100)
        : 0;

      // 7. Cost stats
      const costAggregate = await db.costRecord.aggregate({
        _avg: { grossMargin: true, totalLanded: true },
        _count: true,
      });

      const belowMarginThreshold = await db.costRecord.count({
        where: { grossMargin: { lt: 48 } },
      });

      // 8. Supplier stats
      const [supplierTotal, supplierActive, supplierAggregate] = await Promise.all([
        db.supplier.count(),
        db.supplier.count({ where: { status: 'active' } }),
        db.supplier.aggregate({ _avg: { leadTime: true, rating: true } }),
      ]);

      // 9. Reorder stats
      const [reorderTotal, reorderPending, reorderUrgent] = await Promise.all([
        db.reorderOrder.count(),
        db.reorderOrder.count({ where: { status: 'pending' } }),
        db.reorderOrder.count({ where: { priority: '紧急' } }),
      ]);

      // 10. Notes stats
      const noteStats = await db.supplyChainNote.groupBy({
        by: ['isResolved'],
        _count: true,
      });
      const totalNotes = noteStats.reduce((sum, n) => sum + n._count, 0);
      const unresolvedNotes = noteStats.find(n => !n.isResolved)?._count || 0;

      return {
        period: { type: period, days, startDate: startDateStr, endDate: endDateStr },
        revenue: { total: Math.round(totalRevenue), quantity: totalQuantity, avgDailyRevenue: Math.round(totalRevenue / days) },
        revenueTrend,
        topProducts,
        platformDistribution,
        inventoryHealth,
        shipment: { onTimeRate: shipmentOnTimeRate, total: totalShipments, delivered: deliveredCount, delayed: delayedCount },
        cost: {
          avgMargin: roundTo(costAggregate._avg.grossMargin || 0, 1),
          avgLandedCost: roundTo(costAggregate._avg.totalLanded || 0, 2),
          totalProducts: costAggregate._count,
          belowMarginThreshold,
        },
        supplier: {
          total: supplierTotal,
          active: supplierActive,
          avgLeadTime: Math.round(supplierAggregate._avg.leadTime || 0),
          avgRating: roundTo(supplierAggregate._avg.rating || 0, 1),
        },
        reorder: { total: reorderTotal, pending: reorderPending, urgent: reorderUrgent },
        notes: { total: totalNotes, unresolved: unresolvedNotes },
      };
    },
    CACHE_TTL.LONG
  );
}
