/**
 * Dashboard Queries — dashboard data aggregation for /api/dashboard.
 * Uses database-level aggregation (groupBy, aggregate, count) to avoid
 * loading full tables into JavaScript memory.
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { todayISO, daysAgo, startOfMonth, endOfMonth } from '@/lib/utils/date';
import { roundTo } from '@/lib/utils/format';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface DashboardMetrics {
  totalProducts: number;
  totalInventory: number;
  totalRevenue: number;
  revenueGrowth: number;
  activeShipments: number;
  delayedShipments: number;
  avgTurnoverDays: number;
  avgGrossMargin: number;
  lowStockAlerts: number;
  costAlerts: number;
}

export interface InventoryDistribution {
  status: string;
  count: number;
  label: string;
  color: string;
}

export interface CriticalAlert {
  type: string;
  message: string;
  severity: string;
}

// ─── Status display map ──────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  healthy: { label: '健康', color: '#22c55e' },
  warning: { label: '预警', color: '#f59e0b' },
  critical: { label: '紧急', color: '#ef4444' },
  overstock: { label: '积压', color: '#8b5cf6' },
};

// ─── Core ────────────────────────────────────────────────────────────────────────

/** Get dashboard metrics — uses DB aggregation, no full-table loads */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  return cachedFetch(
    cacheKey('dashboard', 'metrics'),
    async () => {
      const currentMonthStart = startOfMonth();
      const prevMonthStart = startOfMonth(-1);
      const prevMonthEnd = endOfMonth(-1);

      const [
        productCount,
        invAgg,
        invStatusCounts,
        totalRevenueAgg,
        shipmentStatusCounts,
        costAgg,
        costAlertsCount,
        currRevenueAgg,
        prevRevenueAgg,
      ] = await Promise.all([
        db.product.count(),
        // Inventory: sum quantity + avg turnover (DB-level)
        db.inventory.aggregate({
          _sum: { quantity: true },
          _avg: { turnoverDays: true },
        }),
        // Inventory status distribution (DB-level)
        db.inventory.groupBy({
          by: ['stockStatus'],
          _count: true,
        }),
        // Total revenue (DB-level aggregate)
        db.salesRecord.aggregate({ _sum: { revenue: true } }),
        // Shipment status counts (DB-level)
        db.shipmentItem.groupBy({
          by: ['status'],
          _count: true,
        }),
        // Cost: avg margin (DB-level)
        db.costRecord.aggregate({ _avg: { grossMargin: true } }),
        // Low margin count
        db.costRecord.count({ where: { grossMargin: { lt: 48 } } }),
        // Current month revenue
        db.salesRecord.aggregate({
          where: { date: { gte: currentMonthStart } },
          _sum: { revenue: true },
        }),
        // Previous month revenue
        db.salesRecord.aggregate({
          where: { date: { gte: prevMonthStart, lte: prevMonthEnd } },
          _sum: { revenue: true },
        }),
      ]);

      const totalInventory = invAgg._sum.quantity || 0;
      const totalRevenue = totalRevenueAgg._sum.revenue || 0;
      const avgTurnoverDays = Math.round(invAgg._avg.turnoverDays || 0);
      const avgGrossMargin = roundTo(costAgg._avg.grossMargin || 0, 1);

      // Shipment counts from groupBy
      const statusCountMap = new Map(
        shipmentStatusCounts.map(g => [g.status, g._count])
      );
      const activeShipments = [...statusCountMap.entries()]
        .filter(([s]) => s !== 'delivered')
        .reduce((sum, [, c]) => sum + c, 0);
      const delayedCount = (statusCountMap.get('delayed') || 0) + (statusCountMap.get('exception') || 0);

      // Low stock alerts from groupBy
      const lowStockAlerts = invStatusCounts
        .filter(g => g.stockStatus === 'critical' || g.stockStatus === 'warning')
        .reduce((sum, g) => sum + g._count, 0);

      // Revenue growth
      const prevRevenue = prevRevenueAgg._sum.revenue || 0;
      const currRevenue = currRevenueAgg._sum.revenue || 0;
      const revenueGrowth = prevRevenue > 0
        ? roundTo(((currRevenue - prevRevenue) / prevRevenue) * 100, 1)
        : 0;

      return {
        totalProducts: productCount,
        totalInventory,
        totalRevenue: Math.round(totalRevenue),
        revenueGrowth,
        activeShipments,
        delayedShipments: delayedCount,
        avgTurnoverDays,
        avgGrossMargin,
        lowStockAlerts,
        costAlerts: costAlertsCount,
      };
    },
    CACHE_TTL.SHORT
  );
}

/** Get inventory distribution grouped by stock status — uses groupBy */
export async function getInventoryDistribution(warehouse?: string): Promise<InventoryDistribution[]> {
  return cachedFetch(
    cacheKey('dashboard', 'distribution', warehouse || 'all'),
    async () => {
      const groups = await db.inventory.groupBy({
        by: ['stockStatus'],
        where: warehouse ? { warehouse } : {},
        _count: true,
      });

      return groups.map(g => ({
        status: g.stockStatus,
        count: g._count,
        label: STATUS_MAP[g.stockStatus]?.label || g.stockStatus,
        color: STATUS_MAP[g.stockStatus]?.color || '#999',
      }));
    },
    CACHE_TTL.SHORT
  );
}

/** Get sales trend for charting — uses groupBy, not loading all rows */
export async function getSalesTrend(startDate?: string, endDate?: string): Promise<Array<{ date: Date; revenue: number }>> {
  return cachedFetch(
    cacheKey('dashboard', 'salesTrend', startDate || 'default', endDate || 'default'),
    async () => {
      const trendStartDate = startDate || daysAgo(7);
      const trendEndDate = endDate || todayISO();

      const dailyGroups = await db.salesRecord.groupBy({
        by: ['date'],
        where: { date: { gte: trendStartDate, lte: trendEndDate } },
        _sum: { revenue: true },
      });

      return dailyGroups
        .map(g => ({ date: g.date, revenue: Math.round(g._sum.revenue || 0) }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    },
    CACHE_TTL.SHORT
  );
}

/** Get top critical alerts for dashboard — already uses take limits */
export async function getCriticalAlerts(): Promise<CriticalAlert[]> {
  const [criticalInv, lowMarginCosts, delayedShipments] = await Promise.all([
    db.inventory.count({ where: { stockStatus: 'critical' } }),
    db.costRecord.findMany({
      where: { grossMargin: { lt: 45 } },
      select: { productName: true, grossMargin: true },
      take: 1,
    }),
    db.shipmentItem.count({ where: { delayDays: { gt: 3 } } }),
  ]);

  const alerts: CriticalAlert[] = [];

  if (criticalInv > 0) {
    alerts.push({ type: '库存紧急', message: `${criticalInv} 个SKU库存量低于安全库存`, severity: 'critical' });
  }

  lowMarginCosts.forEach(item => {
    alerts.push({ type: '成本预警', message: `${item.productName} 毛利率 ${item.grossMargin.toFixed(1)}% 严重偏低`, severity: 'critical' });
  });

  if (delayedShipments > 0) {
    alerts.push({ type: '物流延误', message: `${delayedShipments} 批货物延误超过3天`, severity: 'high' });
  }

  return alerts.slice(0, 3);
}

/** Lightweight summary for WebSocket polling — uses DB aggregation, no full-table loads */
export async function getDashboardSummary() {
  const [
    products,
    invStatusCounts,
    shipmentStatusCounts,
    costAgg,
    costLowCount,
    revenueAgg,
  ] = await Promise.all([
    db.product.count(),
    db.inventory.groupBy({ by: ['stockStatus'], _count: true }),
    db.shipmentItem.groupBy({ by: ['status'], _count: true }),
    db.costRecord.aggregate({ _avg: { grossMargin: true } }),
    db.costRecord.count({ where: { grossMargin: { lt: 48 } } }),
    db.salesRecord.aggregate({ _sum: { revenue: true } }),
  ]);

  const totalRevenue = Math.round(revenueAgg._sum.revenue || 0);

  // Shipment stats
  const statusCountMap = new Map(shipmentStatusCounts.map(g => [g.status, g._count]));
  const totalShipments = [...statusCountMap.values()].reduce((a, b) => a + b, 0);
  const activeShipments = [...statusCountMap.entries()]
    .filter(([s]) => s !== 'delivered')
    .reduce((sum, [, c]) => sum + c, 0);
  const delayedShipments = (statusCountMap.get('delayed') || 0) + (statusCountMap.get('exception') || 0);

  // Inventory health from groupBy (no full-table load)
  const criticalInv = invStatusCounts.find(g => g.stockStatus === 'critical')?._count || 0;
  const warningInv = invStatusCounts.find(g => g.stockStatus === 'warning')?._count || 0;
  const totalInv = invStatusCounts.reduce((sum, g) => sum + g._count, 0);
  const invHealth = totalInv > 0 ? Math.round(((totalInv - criticalInv - warningInv) / totalInv) * 25) : 25;

  const avgMargin = costAgg._avg.grossMargin || 50;
  const costHealth = Math.min(25, Math.round((avgMargin / 50) * 25));

  const problemShipments = (statusCountMap.get('delayed') || 0) + (statusCountMap.get('exception') || 0);
  const logHealth = totalShipments > 0 ? Math.round(((totalShipments - problemShipments) / totalShipments) * 25) : 25;

  const revenuePerProduct = products > 0 ? totalRevenue / products : 100000;
  const salesHealth = Math.min(25, Math.round((revenuePerProduct / 100000) * 25));

  const healthScore = invHealth + costHealth + logHealth + salesHealth;

  const criticalAlerts = await getCriticalAlerts();

  return {
    totalProducts: products,
    totalRevenue,
    activeShipments,
    delayedShipments,
    healthScore,
    healthBreakdown: { inventory: invHealth, cost: costHealth, logistics: logHealth, sales: salesHealth },
    criticalAlerts,
    timestamp: new Date().toISOString(),
  };
}
