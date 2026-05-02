/**
 * Inventory Reports — getInventoryReport, getInventorySummary, getInventoryReportEnhanced.
 * Extracted from services/reports.service.ts.
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { roundTo } from '@/lib/utils/format';
import { daysAgo } from '@/lib/utils/date';
import type { InventoryReportResult, InventorySummaryResult, InventoryReportEnhancedResult } from './reports-types';

// ─── Legacy: Inventory Report ───────────────────────────────────────────────────

export async function getInventoryReport(): Promise<InventoryReportResult> {
  return cachedFetch(
    cacheKey('reports', 'inventory-report'),
    async () => {
      const [inventory, products, costRecords] = await Promise.all([
        db.inventory.findMany(),
        db.product.findMany(),
        db.costRecord.findMany(),
      ]);

      const totalStock = inventory.reduce((sum, i) => sum + i.quantity, 0);
      const totalValue = inventory.reduce((sum, i) => {
        const cost = costRecords.find(c => c.sku === i.sku);
        return sum + i.quantity * (cost?.totalLanded || 0);
      }, 0);
      const criticalCount = inventory.filter(i => i.stockStatus === 'critical').length;
      const warningCount = inventory.filter(i => i.stockStatus === 'warning').length;
      const overstockCount = inventory.filter(i => i.stockStatus === 'overstock').length;
      const avgTurnoverDays = inventory.length > 0
        ? Math.round(inventory.reduce((sum, i) => sum + i.turnoverDays, 0) / inventory.length)
        : 0;

      const categorySummary: Record<string, { category: string; quantity: number; value: number; items: number }> = {};
      inventory.forEach(inv => {
        const product = products.find(p => p.sku === inv.sku);
        const cost = costRecords.find(c => c.sku === inv.sku);
        const category = product?.category || '未分类';
        if (!categorySummary[category]) {
          categorySummary[category] = { category, quantity: 0, value: 0, items: 0 };
        }
        categorySummary[category].quantity += inv.quantity;
        categorySummary[category].value += inv.quantity * (cost?.totalLanded || 0);
        categorySummary[category].items += 1;
      });

      return {
        title: '库存报告',
        generatedAt: new Date().toISOString(),
        summary: {
          totalSKUs: inventory.length,
          totalStock,
          totalValue: Math.round(totalValue),
          criticalCount, warningCount, overstockCount, avgTurnoverDays,
          healthRate: inventory.length > 0 ? Math.round((inventory.length - criticalCount - warningCount) / inventory.length * 100) : 100,
        },
        byCategory: Object.values(categorySummary),
        items: inventory.map(inv => {
          const product = products.find(p => p.sku === inv.sku);
          const cost = costRecords.find(c => c.sku === inv.sku);
          return {
            sku: inv.sku, productName: inv.productName, category: product?.category || '未分类',
            warehouse: inv.warehouse, quantity: inv.quantity, safetyStock: inv.safetyStock,
            stockStatus: inv.stockStatus, turnoverDays: inv.turnoverDays,
            unitCost: cost?.totalLanded || 0,
            totalValue: Math.round(inv.quantity * (cost?.totalLanded || 0)),
          };
        }),
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

// ─── Enhanced: Inventory Summary ────────────────────────────────────────────────

export async function getInventorySummary(): Promise<InventorySummaryResult> {
  return cachedFetch(
    cacheKey('reports', 'inventory-summary'),
    async () => {
      const [inventory, products, costRecords, salesRecords, reorderOrders] = await Promise.all([
        db.inventory.findMany({ include: { product: true } }),
        db.product.findMany(),
        db.costRecord.findMany(),
        db.salesRecord.findMany(),
        db.reorderOrder.findMany(),
      ]);

      const totalProducts = products.length;
      const totalStockValue = inventory.reduce((sum, i) => {
        const cost = costRecords.find(c => c.sku === i.sku);
        return sum + i.quantity * (cost?.totalLanded || 0);
      }, 0);

      const warehouseSummary: Record<string, { warehouse: string; totalItems: number; totalQuantity: number; totalValue: number; criticalCount: number; warningCount: number }> = {};
      inventory.forEach(inv => {
        if (!warehouseSummary[inv.warehouse]) {
          warehouseSummary[inv.warehouse] = { warehouse: inv.warehouse, totalItems: 0, totalQuantity: 0, totalValue: 0, criticalCount: 0, warningCount: 0 };
        }
        warehouseSummary[inv.warehouse].totalItems += 1;
        warehouseSummary[inv.warehouse].totalQuantity += inv.quantity;
        const cost = costRecords.find(c => c.sku === inv.sku);
        warehouseSummary[inv.warehouse].totalValue += inv.quantity * (cost?.totalLanded || 0);
        if (inv.stockStatus === 'critical') warehouseSummary[inv.warehouse].criticalCount++;
        if (inv.stockStatus === 'warning') warehouseSummary[inv.warehouse].warningCount++;
      });

      const stockStatusDistribution = {
        healthy: inventory.filter(i => i.stockStatus === 'healthy').length,
        warning: inventory.filter(i => i.stockStatus === 'warning').length,
        critical: inventory.filter(i => i.stockStatus === 'critical').length,
        overstock: inventory.filter(i => i.stockStatus === 'overstock').length,
      };

      const avgTurnoverDays = inventory.length > 0
        ? Math.round(inventory.reduce((sum, i) => sum + i.turnoverDays, 0) / inventory.length)
        : 0;

      const overstockItems = inventory
        .filter(i => i.safetyStock > 0)
        .map(i => ({
          sku: i.sku, productName: i.productName, category: i.product?.category || '未分类',
          quantity: i.quantity, safetyStock: i.safetyStock,
          ratio: roundTo(i.quantity / i.safetyStock, 1), warehouse: i.warehouse,
        }))
        .sort((a, b) => b.ratio - a.ratio).slice(0, 5);

      const criticalItems = inventory
        .filter(i => i.safetyStock > 0 && i.stockStatus !== 'overstock')
        .map(i => ({
          sku: i.sku, productName: i.productName, category: i.product?.category || '未分类',
          quantity: i.quantity, safetyStock: i.safetyStock, reorderPoint: i.reorderPoint,
          deficit: Math.max(0, i.safetyStock - i.quantity), warehouse: i.warehouse,
        }))
        .sort((a, b) => a.quantity / a.safetyStock - b.quantity / b.safetyStock).slice(0, 5);

      const reorderRecommendationsCount = inventory.filter(
        i => i.quantity <= i.reorderPoint || i.quantity <= i.safetyStock
      ).length;
      const pendingReorderCount = reorderOrders.filter(o => o.status === 'pending').length;

      const abcDistribution: Record<string, number> = {};
      inventory.forEach(inv => {
        const abc = inv.product?.abcClass || '未分类';
        abcDistribution[abc] = (abcDistribution[abc] || 0) + 1;
      });

      const now = Date.now();
      const agingBuckets = { fresh: 0, week: 0, month: 0, stale: 0 };
      inventory.forEach(inv => {
        const ageDays = Math.floor((now - inv.lastSyncAt.getTime()) / (1000 * 60 * 60 * 24));
        if (ageDays <= 1) agingBuckets.fresh++;
        else if (ageDays <= 7) agingBuckets.week++;
        else if (ageDays <= 30) agingBuckets.month++;
        else agingBuckets.stale++;
      });

      const thirtyDaysAgoDate = new Date(); thirtyDaysAgoDate.setDate(thirtyDaysAgoDate.getDate() - 30);
      const recentSales = salesRecords.filter(r => new Date(r.date) >= thirtyDaysAgoDate);
      const salesVelocityByProduct: Record<string, { sku: string; productName: string; totalQuantity: number; dailyAvg: number }> = {};
      recentSales.forEach(r => {
        if (!salesVelocityByProduct[r.sku]) {
          salesVelocityByProduct[r.sku] = { sku: r.sku, productName: r.productName, totalQuantity: 0, dailyAvg: 0 };
        }
        salesVelocityByProduct[r.sku].totalQuantity += r.quantity;
      });
      Object.values(salesVelocityByProduct).forEach(v => {
        v.dailyAvg = roundTo(v.totalQuantity / 30, 1);
      });

      return {
        title: '库存汇总报告',
        generatedAt: new Date().toISOString(),
        summary: { totalProducts, totalStockValue: Math.round(totalStockValue), stockStatusDistribution },
        warehouseUtilization: Object.values(warehouseSummary).map(w => ({
          ...w, totalValue: Math.round(w.totalValue),
          healthRate: w.totalItems > 0 ? Math.round((w.totalItems - w.criticalCount - w.warningCount) / w.totalItems * 100) : 100,
        })),
        topOverstockItems: overstockItems,
        topCriticalItems: criticalItems,
        reorderRecommendations: { count: reorderRecommendationsCount, pendingOrders: pendingReorderCount },
        avgTurnoverDays,
        abcClassDistribution: abcDistribution,
        agingSummary: agingBuckets,
        salesVelocityTop: Object.values(salesVelocityByProduct).sort((a, b) => b.dailyAvg - a.dailyAvg).slice(0, 10),
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

// ─── Type-param: Inventory Report Enhanced ──────────────────────────────────────

export async function getInventoryReportEnhanced(): Promise<InventoryReportEnhancedResult> {
  return cachedFetch(
    cacheKey('reports', 'inventory-report-enhanced'),
    async () => {
      const [inventory, products, costRecords, salesRecords] = await Promise.all([
        db.inventory.findMany({ include: { product: true } }),
        db.product.findMany(),
        db.costRecord.findMany(),
        db.salesRecord.findMany(),
      ]);

      const totalItems = inventory.reduce((sum, i) => sum + i.quantity, 0);
      const totalValue = inventory.reduce((sum, i) => {
        const cost = costRecords.find(c => c.sku === i.sku);
        return sum + i.quantity * (cost?.totalLanded || 0);
      }, 0);

      const stockDistribution = {
        healthy: inventory.filter(i => i.stockStatus === 'healthy').length,
        warning: inventory.filter(i => i.stockStatus === 'warning').length,
        critical: inventory.filter(i => i.stockStatus === 'critical').length,
        overstock: inventory.filter(i => i.stockStatus === 'overstock').length,
      };

      const avgTurnoverRate = inventory.length > 0
        ? roundTo(inventory.reduce((s, i) => s + i.turnoverRate, 0) / inventory.length, 2)
        : 0;
      const avgTurnoverDays = inventory.length > 0
        ? Math.round(inventory.reduce((s, i) => s + i.turnoverDays, 0) / inventory.length)
        : 0;
      const bestPerformers = [...inventory].sort((a, b) => b.turnoverRate - a.turnoverRate).slice(0, 5).map(i => ({
        sku: i.sku, productName: i.productName, turnoverRate: i.turnoverRate, turnoverDays: i.turnoverDays,
      }));
      const worstPerformers = [...inventory].sort((a, b) => a.turnoverRate - b.turnoverRate).slice(0, 5).map(i => ({
        sku: i.sku, productName: i.productName, turnoverRate: i.turnoverRate, turnoverDays: i.turnoverDays,
      }));

      const warehouseUtilization: Record<string, { warehouse: string; totalItems: number; totalQuantity: number; totalValue: number; healthRate: number }> = {};
      inventory.forEach(inv => {
        if (!warehouseUtilization[inv.warehouse]) {
          warehouseUtilization[inv.warehouse] = { warehouse: inv.warehouse, totalItems: 0, totalQuantity: 0, totalValue: 0, healthRate: 0 };
        }
        warehouseUtilization[inv.warehouse].totalItems++;
        warehouseUtilization[inv.warehouse].totalQuantity += inv.quantity;
        const cost = costRecords.find(c => c.sku === inv.sku);
        warehouseUtilization[inv.warehouse].totalValue += inv.quantity * (cost?.totalLanded || 0);
      });
      Object.values(warehouseUtilization).forEach(w => {
        const healthy = inventory.filter(i => i.warehouse === w.warehouse && (i.stockStatus === 'healthy' || i.stockStatus === 'overstock')).length;
        w.totalValue = Math.round(w.totalValue);
        w.healthRate = w.totalItems > 0 ? Math.round(healthy / w.totalItems * 100) : 100;
      });

      const reorderItems = inventory
        .filter(i => i.quantity <= i.reorderPoint || i.quantity <= i.safetyStock)
        .map(i => ({
          sku: i.sku, productName: i.productName, quantity: i.quantity,
          safetyStock: i.safetyStock, reorderPoint: i.reorderPoint,
          deficit: Math.max(0, i.reorderPoint - i.quantity),
          warehouse: i.warehouse, stockStatus: i.stockStatus,
        }))
        .sort((a, b) => a.quantity - b.quantity);

      const abcAnalysis: Record<string, { class: string; count: number; totalValue: number; avgMargin: number }> = {};
      inventory.forEach(inv => {
        const abc = inv.product?.abcClass || 'C';
        if (!abcAnalysis[abc]) abcAnalysis[abc] = { class: abc, count: 0, totalValue: 0, avgMargin: 0 };
        abcAnalysis[abc].count++;
        const cost = costRecords.find(c => c.sku === inv.sku);
        abcAnalysis[abc].totalValue += inv.quantity * (cost?.totalLanded || 0);
        abcAnalysis[abc].avgMargin += cost?.grossMargin || 0;
      });
      Object.values(abcAnalysis).forEach(a => {
        a.totalValue = Math.round(a.totalValue);
        a.avgMargin = a.count > 0 ? roundTo(a.avgMargin / a.count, 1) : 0;
      });

      return {
        title: '库存报告',
        generatedAt: new Date().toISOString(),
        stockDistribution: { totalItems, totalValue: Math.round(totalValue), byStatus: stockDistribution },
        turnoverAnalysis: { avgTurnoverRate, avgTurnoverDays, bestPerformers, worstPerformers },
        warehouseUtilization: Object.values(warehouseUtilization),
        reorderRecommendations: { count: reorderItems.length, items: reorderItems },
        abcAnalysis: Object.values(abcAnalysis),
      };
    },
    CACHE_TTL.VERY_LONG
  );
}
