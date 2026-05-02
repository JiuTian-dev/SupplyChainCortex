import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withErrorHandler, parseDateRange, apiError } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import {
  getDashboardMetrics,
  getInventoryDistribution,
  getSalesTrend,
  getCriticalAlerts,
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

  // Use service layer for optimized queries (avoids loading all records)
  const [metrics, inventoryDistribution, salesTrend, shipments, costRecords, products, salesRecords] = await Promise.all([
    getDashboardMetrics(),
    getInventoryDistribution(warehouse),
    getSalesTrend(dateRange.startDate, dateRange.endDate),
    db.shipmentItem.findMany({ select: { status: true } }),
    db.costRecord.findMany({ where: { grossMargin: { lt: 48 } }, select: { sku: true, productName: true, grossMargin: true } }),
    db.product.findMany({ select: { id: true, category: true } }),
    db.salesRecord.findMany({ select: { productId: true, revenue: true } }),
  ]);

  // Shipment status distribution
  const shipmentStatusDist: Record<string, number> = {};
  shipments.forEach(s => {
    shipmentStatusDist[s.status] = (shipmentStatusDist[s.status] || 0) + 1;
  });

  // Cost alert products
  const costAlerts = costRecords.map(c => ({
    sku: c.sku,
    productName: c.productName,
    grossMargin: c.grossMargin,
  }));

  // Category revenue
  const categoryRevenue: Record<string, number> = {};
  const productMap = new Map(products.map(p => [p.id, p.category]));
  salesRecords.forEach(r => {
    const category = productMap.get(r.productId);
    if (category) {
      categoryRevenue[category] = (categoryRevenue[category] || 0) + r.revenue;
    }
  });

  return NextResponse.json({
    metrics,
    inventoryDistribution,
    salesTrend,
    shipmentStatusDistribution: shipmentStatusDist,
    costAlerts,
    categoryRevenue: Object.entries(categoryRevenue).map(([category, revenue]) => ({
      category,
      revenue: Math.round(revenue),
    })),
  });
}));
