/**
 * Sales Reports — getSalesReport, getSalesReportEnhanced.
 * Extracted from services/reports.service.ts.
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { roundTo } from '@/lib/utils/format';
import type { SalesReportResult, SalesReportEnhancedResult } from './reports-types';

// ─── Legacy: Sales Report ───────────────────────────────────────────────────────

export async function getSalesReport(): Promise<SalesReportResult> {
  return cachedFetch(
    cacheKey('reports', 'sales-report'),
    async () => {
      const [salesRecords, products] = await Promise.all([
        db.salesRecord.findMany(), db.product.findMany(),
      ]);

      const totalRevenue = salesRecords.reduce((sum, r) => sum + r.revenue, 0);
      const totalQuantity = salesRecords.reduce((sum, r) => sum + r.quantity, 0);

      const platformSummary: Record<string, { platform: string; revenue: number; quantity: number; orders: number }> = {};
      salesRecords.forEach(r => {
        if (!platformSummary[r.platform]) platformSummary[r.platform] = { platform: r.platform, revenue: 0, quantity: 0, orders: 0 };
        platformSummary[r.platform].revenue += r.revenue;
        platformSummary[r.platform].quantity += r.quantity;
        platformSummary[r.platform].orders += 1;
      });

      const categorySummary: Record<string, { category: string; revenue: number; quantity: number }> = {};
      salesRecords.forEach(r => {
        const product = products.find(p => p.id === r.productId);
        const category = product?.category || '未分类';
        if (!categorySummary[category]) categorySummary[category] = { category, revenue: 0, quantity: 0 };
        categorySummary[category].revenue += r.revenue;
        categorySummary[category].quantity += r.quantity;
      });

      return {
        title: '销售报告',
        generatedAt: new Date().toISOString(),
        summary: {
          totalRevenue: Math.round(totalRevenue), totalQuantity,
          totalOrders: salesRecords.length,
          avgOrderValue: salesRecords.length > 0 ? roundTo(totalRevenue / salesRecords.length, 2) : 0,
        },
        byPlatform: Object.values(platformSummary).map(p => ({ ...p, revenue: Math.round(p.revenue) })),
        byCategory: Object.values(categorySummary).map(c => ({ ...c, revenue: Math.round(c.revenue) })),
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

// ─── Type-param: Sales Report Enhanced ──────────────────────────────────────────

export async function getSalesReportEnhanced(): Promise<SalesReportEnhancedResult> {
  return cachedFetch(
    cacheKey('reports', 'sales-report-enhanced'),
    async () => {
      const [salesRecords, products] = await Promise.all([
        db.salesRecord.findMany(), db.product.findMany(),
      ]);

      const totalRevenue = salesRecords.reduce((s, r) => s + r.revenue, 0);
      const totalQuantity = salesRecords.reduce((s, r) => s + r.quantity, 0);
      const uniqueDays = [...new Set(salesRecords.map(r => r.date))];
      const avgDailyRevenue = uniqueDays.length > 0 ? Math.round(totalRevenue / uniqueDays.length) : 0;

      const today = new Date();
      const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sixtyDaysAgo = new Date(today); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
      const sixtyDaysAgoStr = sixtyDaysAgo.toISOString().split('T')[0];
      const todayStr = today.toISOString().split('T')[0];
      const recentRevenue = salesRecords.filter(r => r.date >= thirtyDaysAgoStr && r.date <= todayStr).reduce((s, r) => s + r.revenue, 0);
      const priorRevenue = salesRecords.filter(r => r.date >= sixtyDaysAgoStr && r.date < thirtyDaysAgoStr).reduce((s, r) => s + r.revenue, 0);
      const growthRate = priorRevenue > 0 ? roundTo((recentRevenue - priorRevenue) / priorRevenue * 100, 1) : 0;

      const platformBreakdown: Record<string, { platform: string; revenue: number; quantity: number; orders: number; avgOrderValue: number }> = {};
      salesRecords.forEach(r => {
        if (!platformBreakdown[r.platform]) platformBreakdown[r.platform] = { platform: r.platform, revenue: 0, quantity: 0, orders: 0, avgOrderValue: 0 };
        platformBreakdown[r.platform].revenue += r.revenue;
        platformBreakdown[r.platform].quantity += r.quantity;
        platformBreakdown[r.platform].orders++;
      });
      Object.values(platformBreakdown).forEach(p => {
        p.revenue = Math.round(p.revenue);
        p.avgOrderValue = p.orders > 0 ? roundTo(p.revenue / p.orders, 2) : 0;
      });

      const revenueByProduct: Record<string, { sku: string; productName: string; revenue: number; quantity: number; category: string }> = {};
      salesRecords.forEach(r => {
        const product = products.find(p => p.id === r.productId);
        if (!revenueByProduct[r.sku]) {
          revenueByProduct[r.sku] = { sku: r.sku, productName: r.productName, revenue: 0, quantity: 0, category: product?.category || '未分类' };
        }
        revenueByProduct[r.sku].revenue += r.revenue;
        revenueByProduct[r.sku].quantity += r.quantity;
      });
      const topByRevenue = Object.values(revenueByProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 5).map(p => ({ ...p, revenue: Math.round(p.revenue) }));
      const topByQuantity = Object.values(revenueByProduct).sort((a, b) => b.quantity - a.quantity).slice(0, 5).map(p => ({ ...p, revenue: Math.round(p.revenue) }));

      const salesTrend: Array<{ date: string; revenue: number; quantity: number; orders: number }> = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayRecords = salesRecords.filter(r => r.date === dateStr);
        salesTrend.push({ date: dateStr, revenue: Math.round(dayRecords.reduce((s, r) => s + r.revenue, 0)), quantity: dayRecords.reduce((s, r) => s + r.quantity, 0), orders: dayRecords.length });
      }

      const categoryAnalysis: Record<string, { category: string; revenue: number; quantity: number; products: number }> = {};
      salesRecords.forEach(r => {
        const product = products.find(p => p.id === r.productId);
        const cat = product?.category || '未分类';
        if (!categoryAnalysis[cat]) categoryAnalysis[cat] = { category: cat, revenue: 0, quantity: 0, products: 0 };
        categoryAnalysis[cat].revenue += r.revenue;
        categoryAnalysis[cat].quantity += r.quantity;
      });
      Object.keys(categoryAnalysis).forEach(cat => {
        categoryAnalysis[cat].products = new Set(salesRecords.filter(r => products.find(p => p.id === r.productId)?.category === cat).map(r => r.sku)).size;
        categoryAnalysis[cat].revenue = Math.round(categoryAnalysis[cat].revenue);
      });

      return {
        title: '销售报告',
        generatedAt: new Date().toISOString(),
        revenueSummary: { totalRevenue: Math.round(totalRevenue), avgDailyRevenue, totalQuantity, totalOrders: salesRecords.length, growthRate },
        platformBreakdown: Object.values(platformBreakdown),
        topPerformingProducts: { byRevenue: topByRevenue, byQuantity: topByQuantity },
        salesTrend,
        categoryAnalysis: Object.values(categoryAnalysis),
      };
    },
    CACHE_TTL.VERY_LONG
  );
}
