import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, apiSuccess, apiError, parsePagination, NotFoundError, ValidationError } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import {
  getInventoryOverview, getInventoryList, getInventoryHealth, getInventoryHealthSummary,
  getSlowMovingItems, getReorderRecommendations, getAlertTimeline,
  getInventoryForecast, getStockoutRiskAnalysis, getAbcAnalysis,
  getSafetyStockForSku, getReorderAdvice, getCapitalAnalysis, getInventoryCapital,
  bulkUpdateInventory, adjustInventory,
} from "@/lib/services/inventory.service";

// GET /api/inventory - 库存数据查询
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "list";
  const sku = searchParams.get("sku");
  const serviceLevel = parseFloat(searchParams.get("serviceLevel") || "0.95");
  const days = parseInt(searchParams.get("days") || "90");
  const { page, pageSize } = parsePagination(searchParams);
  const warehouse = searchParams.get("warehouse") || undefined;
  const category = searchParams.get("category") || undefined;
  const skusParam = searchParams.get("skus");
  const skus = skusParam ? skusParam.split(',').map(s => s.trim()).filter(Boolean) : undefined;
  const sortBy = searchParams.get("sortBy") || undefined;
  const sortOrder = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";

  switch (action) {
    case "list": {
      const result = await getInventoryList({ warehouse, category, skus, sortBy, sortOrder, page, pageSize });
      return apiSuccess(result);
    }
    case "health": {
      if (sku) {
        const health = await getInventoryHealth(sku, warehouse);
        if (!health) throw NotFoundError(`未找到 SKU: ${sku}`);
        return apiSuccess(health);
      }
      const summary = await getInventoryHealthSummary();
      return apiSuccess(summary);
    }
    case "safety_stock": {
      if (!sku) throw ValidationError("缺少 sku 参数");
      const result = await getSafetyStockForSku(sku, serviceLevel);
      if (!result) throw NotFoundError(`未找到 SKU: ${sku}`);
      return NextResponse.json(result);
    }
    case "slow_moving": {
      const result = await getSlowMovingItems(days, warehouse, category);
      return NextResponse.json(result);
    }
    case "reorder": {
      if (!sku) throw ValidationError("缺少 sku 参数");
      const result = await getReorderAdvice(sku, warehouse);
      if ('error' in result) {
        if (result.error === 'product_not_found') throw NotFoundError(`未找到 SKU: ${sku}`);
        if (result.error === 'inventory_not_found') throw NotFoundError(`未找到 SKU 库存: ${sku}`);
      }
      return NextResponse.json(result);
    }
    case "forecast": {
      const forecastDays = parseInt(searchParams.get("forecastDays") || "14");
      const result = await getInventoryForecast(forecastDays, warehouse);
      return NextResponse.json({ forecastDays, ...result });
    }
    case "stockout-risk": {
      const result = await getStockoutRiskAnalysis(warehouse);
      return NextResponse.json({ riskPeriods: [7, 14, 30], ...result });
    }
    case "abc-analysis": {
      const result = await getAbcAnalysis();
      return NextResponse.json({
        ...result,
        changes: result.products
          .filter((p: Record<string, unknown>) => p.classChanged)
          .map((p: Record<string, unknown>) => ({
            sku: p.sku, productName: p.productName,
            from: p.currentAbcClass, to: p.newAbcClass,
          })),
      });
    }
    case "reorder_recommendations": {
      const safetyDays = parseInt(searchParams.get("safetyDays") || "14");
      const result = await getReorderRecommendations(safetyDays);
      return NextResponse.json(result);
    }
    case "alert_timeline": {
      const limit = parseInt(searchParams.get("limit") || "50");
      const typeFilter = searchParams.get("type") || undefined;
      const severityFilter = searchParams.get("severity") || undefined;
      const result = await getAlertTimeline(limit, typeFilter, severityFilter);
      return NextResponse.json(result);
    }
    case "overview": {
      const overview = await getInventoryOverview(warehouse);
      return NextResponse.json(overview);
    }
    case "capital_analysis": {
      const result = await getCapitalAnalysis();
      return apiSuccess(result);
    }
    case "inventory_capital": {
      const threshold = parseInt(searchParams.get("threshold") || "90");
      const result = await getInventoryCapital(threshold);
      return apiSuccess(result);
    }
    default:
      return apiError(`未知操作: ${action}`, 400, 'UNKNOWN_ACTION');
  }
}));

// PUT /api/inventory - Batch update inventory statuses
export const PUT = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "update";

  if (action === "bulk_update") {
    const body = await request.json();
    const { updates } = body as {
      updates: Array<{
        id?: string; sku?: string; stockStatus?: string;
        quantity?: number; safetyStock?: number; reorderPoint?: number; warehouse?: string;
      }>;
    };

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "缺少 updates 数组，格式: [{id, stockStatus?, quantity?, safetyStock?, reorderPoint?}]" },
        { status: 400 }
      );
    }
    if (updates.length > 100) {
      return NextResponse.json({ error: "批量更新最多支持 100 条记录" }, { status: 400 });
    }

    const result = await bulkUpdateInventory(updates);
    return NextResponse.json(result);
  }

  return apiError(`未知 PUT 操作: ${action}`, 400, 'UNKNOWN_ACTION');
}));

// POST /api/inventory - Stock adjustment
export const POST = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "adjustment";

  if (action === "adjustment") {
    const body = await request.json();
    const { sku, quantity, reason, warehouse } = body as {
      sku: string; quantity: number; reason: string; warehouse?: string;
    };

    if (!sku) throw ValidationError("缺少必填字段: sku");
    if (quantity === undefined || quantity === null) throw ValidationError("缺少必填字段: quantity（正数表示入库，负数表示出库）");
    if (!reason || !reason.trim()) throw ValidationError("缺少必填字段: reason（调整原因）");

    const result = await adjustInventory({ sku, quantity, reason, warehouse, request });
    if ('notFound' in result) throw NotFoundError(result.message ?? 'Not found');
    if ('validationError' in result) throw ValidationError(result.message ?? 'Validation error');

    return apiSuccess({ adjustment: result.adjustment });
  }

  return apiError(`未知 POST 操作: ${action}`, 400, 'UNKNOWN_ACTION');
}));
