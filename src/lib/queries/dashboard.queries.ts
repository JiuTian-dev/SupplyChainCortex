/**
 * Dashboard Queries — dashboard data aggregation for /api/dashboard.
 * Migrated from services/dashboard.service.ts. Caching contract preserved.
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

/** Get dashboard metrics - optimized to avoid loading all records */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  return cachedFetch(
    cacheKey('dashboard', 'metrics'),
    async () => {
      const currentMonthStart = startOfMonth();
      const prevMonthStart = startOfMonth(-1);
      const prevMonthEnd = endOfMonth(-1);

      const [
        productCount,
        inventory,
        salesRevenue,
        shipments,
        costRecords,
        currentMonthRevenue,
        prevMonthRevenue,
      ] = await Promise.all([
        db.product.count(),
        db.inventory.findMany({ select: { quantity: true, stockStatus: true, turnoverDays: true } }),
        db.salesRecord.aggregate({ _sum: { revenue: true } }),
        db.shipmentItem.findMany({ select: { status: true, delayDays: true } }),
        db.costRecord.findMany({ select: { grossMargin: true } }),
        db.salesRecord.aggregate({ where: { date: { gte: currentMonthStart } }, _sum: { revenue: true } }),
        db.salesRecord.aggregate({ where: { date: { gte: prevMonthStart, lte: prevMonthEnd } }, _sum: { revenue: true } }),
      ]);

      const totalInventory = inventory.reduce((sum, inv) => sum + inv.quantity, 0);
      const totalRevenue = salesRevenue._sum.revenue || 0;
      const activeShipments = shipments.filter(s => s.status !== 'delivered').length;
      const delayedShipments = shipments.filter(s => s.delayDays > 0).length;
      const avgTurnoverDays = inventory.length > 0
        ? Math.round(inventory.reduce((sum, inv) => sum + inv.turnoverDays, 0) / inventory.length)
        : 0;
      const avgGrossMargin = costRecords.length > 0
        ? roundTo(costRecords.reduce((sum, c) => sum + c.grossMargin, 0) / costRecords.length, 1)
        : 0;
      const lowStockAlerts = inventory.filter(inv => inv.stockStatus === 'critical' || inv.stockStatus === 'warning').length;
      const costAlertsCount = costRecords.filter(c => c.grossMargin < 48).length;

      const prevRevenue = prevMonthRevenue._sum.revenue || 0;
      const currRevenue = currentMonthRevenue._sum.revenue || 0;
      const revenueGrowth = prevRevenue > 0
        ? roundTo(((currRevenue - prevRevenue) / prevRevenue) * 100, 1)
        : 0;

      return {
        totalProducts: productCount,
        totalInventory,
        totalRevenue: Math.round(totalRevenue),
        revenueGrowth,
        activeShipments,
        delayedShipments,
        avgTurnoverDays,
        avgGrossMargin,
        lowStockAlerts,
        costAlerts: costAlertsCount,
      };
    },
    CACHE_TTL.SHORT
  );
}

/** Get inventory distribution grouped by stock status */
export async function getInventoryDistribution(warehouse?: string): Promise<InventoryDistribution[]> {
  return cachedFetch(
    cacheKey('dashboard', 'distribution', warehouse || 'all'),
    async () => {
      const inventory = await db.inventory.findMany({
        where: warehouse ? { warehouse } : {},
        select: { stockStatus: true },
      });

      const counts = new Map<string, number>();
      inventory.forEach(inv => { counts.set(inv.stockStatus, (counts.get(inv.stockStatus) || 0) + 1); });

      return [...counts.entries()].map(([status, count]) => ({
        status,
        count,
        label: STATUS_MAP[status]?.label || status,
        color: STATUS_MAP[status]?.color || '#999',
      }));
    },
    CACHE_TTL.SHORT
  );
}

/** Get sales trend for charting */
export async function getSalesTrend(startDate?: string, endDate?: string): Promise<Array<{ date: string; revenue: number }>> {
  return cachedFetch(
    cacheKey('dashboard', 'salesTrend', startDate || 'default', endDate || 'default'),
    async () => {
      const trendStartDate = startDate || daysAgo(7);
      const trendEndDate = endDate || todayISO();

      const salesRecords = await db.salesRecord.findMany({
        where: { date: { gte: trendStartDate, lte: trendEndDate } },
        select: { date: true, revenue: true },
      });

      const dailyRevenue = new Map<string, number>();
      salesRecords.forEach(r => { dailyRevenue.set(r.date, (dailyRevenue.get(r.date) || 0) + r.revenue); });

      return [...dailyRevenue.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, revenue]) => ({ date, revenue: Math.round(revenue) }));
    },
    CACHE_TTL.SHORT
  );
}

/** Get top critical alerts for dashboard */
export async function getCriticalAlerts(): Promise<CriticalAlert[]> {
  const [inventory, costRecords, shipments] = await Promise.all([
    db.inventory.findMany({ where: { stockStatus: 'critical' }, select: { stockStatus: true }, take: 2 }),
    db.costRecord.findMany({ where: { grossMargin: { lt: 45 } }, select: { productName: true, grossMargin: true }, take: 1 }),
    db.shipmentItem.findMany({ where: { delayDays: { gt: 3 } }, select: { delayDays: true }, take: 1 }),
  ]);

  const alerts: CriticalAlert[] = [];

  inventory.forEach(() => {
    alerts.push({ type: '库存紧急', message: '库存量低于安全库存，当前状态：critical', severity: 'critical' });
  });

  costRecords.forEach(item => {
    alerts.push({ type: '成本预警', message: `${item.productName} 毛利率 ${item.grossMargin.toFixed(1)}% 严重偏低`, severity: 'critical' });
  });

  if (shipments.length > 0) {
    alerts.push({ type: '物流延误', message: `${shipments.length} 批货物延误超过3天`, severity: 'high' });
  }

  return alerts.slice(0, 3);
}

/** Lightweight summary for WebSocket polling */
export async function getDashboardSummary() {
  const [products, inventory, shipments, costRecords, salesRecords] = await Promise.all([
    db.product.count(),
    db.inventory.findMany({ select: { quantity: true, safetyStock: true, stockStatus: true, turnoverDays: true } }),
    db.shipmentItem.findMany({ select: { status: true, delayDays: true, riskLevel: true } }),
    db.costRecord.findMany({ select: { grossMargin: true, sku: true, productName: true } }),
    db.salesRecord.findMany({ select: { revenue: true } }),
  ]);

  const totalRevenue = Math.round(salesRecords.reduce((sum, r) => sum + r.revenue, 0));
  const activeShipments = shipments.filter(s => s.status !== 'delivered').length;
  const delayedShipments = shipments.filter(s => s.delayDays > 0).length;

  const criticalInv = inventory.filter(i => i.stockStatus === 'critical').length;
  const warningInv = inventory.filter(i => i.stockStatus === 'warning').length;
  const invHealth = inventory.length > 0 ? Math.round(((inventory.length - criticalInv - warningInv) / inventory.length) * 25) : 25;

  const avgMargin = costRecords.length > 0 ? costRecords.reduce((sum, c) => sum + c.grossMargin, 0) / costRecords.length : 50;
  const costHealth = Math.min(25, Math.round((avgMargin / 50) * 25));

  const problemShipments = shipments.filter(s => s.status === 'delayed' || s.status === 'exception').length;
  const logHealth = shipments.length > 0 ? Math.round(((shipments.length - problemShipments) / shipments.length) * 25) : 25;

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
