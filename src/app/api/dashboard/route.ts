import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withErrorHandler, parseDateRange } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import {
  getDashboardMetrics,
  getInventoryDistribution,
  getSalesTrend,
  getDashboardSummary,
} from "@/lib/queries/dashboard.queries";

// GET /api/dashboard - 仪表盘概览数据
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  // ==================== Lightweight Summary for WebSocket ====================
  if (action === "summary") {
    const summary = await getDashboardSummary();
    return NextResponse.json(summary);
  }

  // ==================== Full Dashboard Data ====================
  const dateRange = parseDateRange(searchParams);
  if (dateRange.error) return dateRange.error;

  const warehouse = searchParams.get("warehouse") || undefined;

  // Metrics already includes inventory distribution, sales trend, shipment/cost stats
  // from DB-level aggregation. Only fetch additional category-level data here.
  const [metrics, inventoryDistribution, salesTrend, categoryAgg] = await Promise.all([
    getDashboardMetrics(),
    getInventoryDistribution(warehouse),
    getSalesTrend(dateRange.startDate, dateRange.endDate),
    // Category revenue via DB-level groupBy (not loading all records)
    db.salesRecord.groupBy({
      by: ['productId'],
      _sum: { revenue: true },
      orderBy: { _sum: { revenue: 'desc' } },
      take: 3000,
    }),
  ]);

  // Map product IDs to categories
  const productIds = [...new Set(categoryAgg.map((g: { productId: string }) => g.productId))];
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, category: true },
  });
  const productCategoryMap = new Map(products.map(p => [p.id, p.category]));

  // Aggregate category revenue
  const categoryRevenueMap: Record<string, number> = {};
  (categoryAgg as Array<{ productId: string; _sum: { revenue: number | null } }>).forEach(g => {
    const category = productCategoryMap.get(g.productId) || '其他';
    categoryRevenueMap[category] = (categoryRevenueMap[category] || 0) + (g._sum.revenue || 0);
  });

  // Shipment status distribution (DB-level, not full-table load)
  const shipmentStatusGroups = await db.shipmentItem.groupBy({
    by: ['status'],
    _count: true,
  });
  const shipmentStatusDist: Record<string, number> = {};
  shipmentStatusGroups.forEach(g => {
    shipmentStatusDist[g.status] = g._count;
  });

  // Top cost alerts (limited)
  const costAlerts = await db.costRecord.findMany({
    where: { grossMargin: { lt: 48 } },
    select: { sku: true, productName: true, grossMargin: true },
    take: 10,
  });

  return NextResponse.json({
    metrics,
    inventoryDistribution,
    salesTrend,
    shipmentStatusDistribution: shipmentStatusDist,
    costAlerts: costAlerts.map(c => ({
      sku: c.sku,
      productName: c.productName,
      grossMargin: c.grossMargin,
    })),
    categoryRevenue: Object.entries(categoryRevenueMap).map(([category, revenue]) => ({
      category,
      revenue: Math.round(revenue),
    })),
  });
}));
