/**
 * Stats Queries — statistics aggregation for /api/stats.
 * Uses database-level aggregation (groupBy, aggregate, count) to avoid
 * loading full tables into JavaScript memory.
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
  revenueTrend: Array<{ date: Date; revenue: number; quantity: number }>;
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

// ─── Core ────────────────────────────────────────────────────────────────────────

/** Get aggregated statistics for a given period — uses DB aggregation throughout */
export async function getStats(period = '30d', sku?: string): Promise<StatsResult> {
  return cachedFetch(
    cacheKey('stats', period, sku || 'all'),
    async () => {
      const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
      const startDateStr = daysAgo(days);
      const endDateStr = todayISO();

      const dateFilter = {
        date: { gte: startDateStr, lte: endDateStr },
        ...(sku ? { sku } : {}),
      };

      // 1. Revenue aggregates (DB-level)
      const revenueAgg = await db.salesRecord.aggregate({
        where: dateFilter,
        _sum: { revenue: true, quantity: true },
      });
      const totalRevenue = revenueAgg._sum.revenue || 0;
      const totalQuantity = revenueAgg._sum.quantity || 0;

      // 2. Revenue trend — groupBy date (DB-level)
      const trendGroups = await db.salesRecord.groupBy({
        by: ['date'],
        where: dateFilter,
        _sum: { revenue: true, quantity: true },
      });
      const revenueTrend = trendGroups
        .map(g => ({ date: g.date, revenue: g._sum.revenue || 0, quantity: g._sum.quantity || 0 }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

      // 3. Top 5 products — groupBy sku (DB-level)
      const productGroups = await db.salesRecord.groupBy({
        by: ['sku', 'productName'],
        where: dateFilter,
        _sum: { revenue: true, quantity: true },
        orderBy: { _sum: { revenue: 'desc' } },
        take: 5,
      });
      const topProducts = productGroups.map(g => ({
        sku: g.sku,
        name: g.productName,
        revenue: g._sum.revenue || 0,
        quantity: g._sum.quantity || 0,
      }));

      // 4. Platform distribution — groupBy platform (DB-level)
      const platformGroups = await db.salesRecord.groupBy({
        by: ['platform'],
        where: dateFilter,
        _sum: { revenue: true, quantity: true },
        _count: true,
      });
      const platformDistribution = platformGroups
        .map(g => ({
          platform: g.platform,
          revenue: g._sum.revenue || 0,
          quantity: g._sum.quantity || 0,
          orderCount: g._count,
        }))
        .sort((a, b) => b.revenue - a.revenue);

      // 5. Inventory health — groupBy (DB-level)
      const invGroups = await db.inventory.groupBy({
        by: ['stockStatus'],
        _count: true,
        _avg: { turnoverDays: true },
      });
      const totalInventory = invGroups.reduce((sum, g) => sum + g._count, 0);
      const inventoryHealth = {
        healthy: invGroups.find(g => g.stockStatus === 'healthy')?._count || 0,
        warning: invGroups.find(g => g.stockStatus === 'warning')?._count || 0,
        critical: invGroups.find(g => g.stockStatus === 'critical')?._count || 0,
        overstock: invGroups.find(g => g.stockStatus === 'overstock')?._count || 0,
        total: totalInventory,
        avgTurnoverDays: Math.round(
          invGroups.reduce((sum, g) => sum + (g._avg.turnoverDays || 0) * g._count, 0) / Math.max(totalInventory, 1)
        ),
      };

      // 6. Shipment stats — aggregate + count (DB-level)
      const [totalShipments, deliveredCount, delayedCount, deliveryAgg] = await Promise.all([
        db.shipmentItem.count(),
        db.shipmentItem.count({ where: { status: 'delivered' } }),
        db.shipmentItem.count({ where: { status: 'delayed' } }),
        db.shipmentItem.aggregate({
          where: { status: 'delivered', delayDays: { lte: 0 } },
          _count: true,
        }),
      ]);
      const onTimeDeliveries = deliveryAgg._count || 0;
      const deliveredTotal = await db.shipmentItem.count({ where: { status: 'delivered' } });
      const shipmentOnTimeRate = deliveredTotal > 0
        ? Math.round((onTimeDeliveries / deliveredTotal) * 100)
        : 0;

      // 7. Cost stats — aggregate (DB-level)
      const [costAgg, belowMarginThreshold] = await Promise.all([
        db.costRecord.aggregate({
          _avg: { grossMargin: true, totalLanded: true },
          _count: true,
        }),
        db.costRecord.count({ where: { grossMargin: { lt: 48 } } }),
      ]);

      // 8. Supplier stats — aggregate + count (DB-level)
      const [supplierTotal, supplierActive, supplierAgg] = await Promise.all([
        db.supplier.count(),
        db.supplier.count({ where: { status: 'active' } }),
        db.supplier.aggregate({ _avg: { leadTime: true, rating: true } }),
      ]);

      // 9. Reorder stats — counts (DB-level)
      const [reorderTotal, reorderPending, reorderUrgent] = await Promise.all([
        db.reorderOrder.count(),
        db.reorderOrder.count({ where: { status: 'pending' } }),
        db.reorderOrder.count({ where: { priority: '紧急' } }),
      ]);

      // 10. Notes stats — groupBy (DB-level)
      const noteGroups = await db.supplyChainNote.groupBy({
        by: ['isResolved'],
        _count: true,
      });
      const totalNotes = noteGroups.reduce((sum, n) => sum + n._count, 0);
      const unresolvedNotes = noteGroups.find(n => !n.isResolved)?._count || 0;

      return {
        period: { type: period, days, startDate: startDateStr, endDate: endDateStr },
        revenue: { total: Math.round(totalRevenue), quantity: totalQuantity, avgDailyRevenue: Math.round(totalRevenue / days) },
        revenueTrend,
        topProducts,
        platformDistribution,
        inventoryHealth,
        shipment: { onTimeRate: shipmentOnTimeRate, total: totalShipments, delivered: deliveredTotal, delayed: delayedCount },
        cost: {
          avgMargin: roundTo(costAgg._avg.grossMargin || 0, 1),
          avgLandedCost: roundTo(costAgg._avg.totalLanded || 0, 2),
          totalProducts: costAgg._count,
          belowMarginThreshold,
        },
        supplier: {
          total: supplierTotal,
          active: supplierActive,
          avgLeadTime: Math.round(supplierAgg._avg.leadTime || 0),
          avgRating: roundTo(supplierAgg._avg.rating || 0, 1),
        },
        reorder: { total: reorderTotal, pending: reorderPending, urgent: reorderUrgent },
        notes: { total: totalNotes, unresolved: unresolvedNotes },
      };
    },
    CACHE_TTL.LONG
  );
}
