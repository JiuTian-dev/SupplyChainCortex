import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/services/audit.service";
import { withErrorHandler, apiSuccess, apiError, parsePagination, NotFoundError, ValidationError } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import { serverCache } from "@/lib/cache";
import {
  computeStockStatus,
  getInventoryOverview,
  computeSafetyStock,
  getInventoryForecast,
  getStockoutRiskAnalysis,
  getAbcAnalysis,
  getInventoryList,
  getInventoryHealth,
  getSlowMovingItems,
  getReorderRecommendations,
  getAlertTimeline,
} from "@/lib/services/inventory.service";

// GET /api/inventory - 库存数据查询
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "list";
  const sku = searchParams.get("sku");
  const serviceLevel = parseFloat(searchParams.get("serviceLevel") || "0.95");
  const days = parseInt(searchParams.get("days") || "90");

  // Pagination parameters (using centralized helper)
  const { page, pageSize } = parsePagination(searchParams);

  // Filter parameters
  const warehouse = searchParams.get("warehouse") || undefined;
  const category = searchParams.get("category") || undefined;
  const skusParam = searchParams.get("skus");
  const skus = skusParam ? skusParam.split(',').map(s => s.trim()).filter(Boolean) : undefined;
  const sortBy = searchParams.get("sortBy") || undefined;
  const sortOrder = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";

  switch (action) {
    case "list": {
      const result = await getInventoryList({
        warehouse,
        category,
        skus,
        sortBy,
        sortOrder,
        page,
        pageSize,
      });
      return apiSuccess(result);
    }

    case "health": {
      if (sku) {
        const health = await getInventoryHealth(sku, warehouse);
        if (!health) throw NotFoundError(`未找到 SKU: ${sku}`);
        return apiSuccess(health);
      }
      // No SKU → summary of inventory health using DB-level groupBy
      const [statusGroups, criticalItems, warningItems] = await Promise.all([
        db.inventory.groupBy({ by: ['stockStatus'], _count: true }),
        db.inventory.findMany({
          where: { stockStatus: 'critical' },
          select: { sku: true, productName: true, quantity: true, safetyStock: true },
          take: 20,
        }),
        db.inventory.findMany({
          where: { stockStatus: 'warning' },
          select: { sku: true, productName: true, quantity: true, safetyStock: true },
          take: 20,
        }),
      ]);
      const healthyCount = statusGroups.find(g => g.stockStatus === 'healthy')?._count || 0;
      const totalSkus = statusGroups.reduce((s, g) => s + g._count, 0);
      return apiSuccess({
        critical: criticalItems.map(i => ({ sku: i.sku, productName: i.productName, quantity: i.quantity, safetyStock: i.safetyStock })),
        warning: warningItems.map(i => ({ sku: i.sku, productName: i.productName, quantity: i.quantity, safetyStock: i.safetyStock })),
        healthyRate: totalSkus > 0 ? Math.round((healthyCount / totalSkus) * 100) : 100,
        totalSkus,
      });
    }

    case "safety_stock": {
      if (!sku) throw ValidationError("缺少 sku 参数");
      const product = await db.product.findUnique({ where: { sku } });
      if (!product) {
        throw NotFoundError(`未找到 SKU: ${sku}`);
      }

      // Get sales records for this product
      const salesRecords = await db.salesRecord.findMany({
        where: { productId: product.id },
        take: 5000,
      });

      if (salesRecords.length === 0) {
        return NextResponse.json({
          sku: product.sku,
          productName: product.name,
          serviceLevel,
          safetyStock: 0,
          formula: `安全库存 = Z(${serviceLevel}) × σ × √提前期(14天)`,
        });
      }

      // Use service function for safety stock computation
      const safetyStock = computeSafetyStock(salesRecords, serviceLevel, 14);

      return NextResponse.json({
        sku: product.sku,
        productName: product.name,
        serviceLevel,
        safetyStock,
        formula: `安全库存 = Z(${serviceLevel}) × σ × √提前期(14天)`,
      });
    }

    case "slow_moving": {
      const result = await getSlowMovingItems(days, warehouse, category);
      return NextResponse.json(result);
    }

    case "reorder": {
      if (!sku) {
        throw ValidationError("缺少 sku 参数");
      }
      const product = await db.product.findUnique({ where: { sku } });
      if (!product) {
        throw NotFoundError(`未找到 SKU: ${sku}`);
      }

      const where: Record<string, unknown> = { sku };
      if (warehouse) where.warehouse = warehouse;

      const inv = await db.inventory.findFirst({
        where,
      });
      if (!inv) {
        throw NotFoundError(`未找到 SKU 库存: ${sku}`);
      }

      // Use service function for safety stock computation
      const salesRecords = await db.salesRecord.findMany({
        where: { productId: product.id },
        take: 5000,
      });

      const safetyStock = salesRecords.length > 0
        ? computeSafetyStock(salesRecords, 0.95, 14)
        : inv.safetyStock;

      const gap = inv.reorderPoint - inv.quantity - inv.inTransit;
      const recommendedOrder = Math.max(0, gap + safetyStock);

      let urgency: "urgent" | "normal" | "low" = "normal";
      if (inv.quantity < inv.safetyStock) urgency = "urgent";
      else if (gap > 0) urgency = "normal";
      else urgency = "low";

      return NextResponse.json({
        sku: inv.sku,
        productName: inv.productName,
        currentStock: inv.quantity,
        safetyStock,
        inTransit: inv.inTransit,
        recommendedOrder,
        urgency,
      });
    }

    // ==================== Inventory forecast - use service ====================
    case "forecast": {
      const forecastDays = parseInt(searchParams.get("forecastDays") || "14");
      const result = await getInventoryForecast(forecastDays, warehouse);
      return NextResponse.json({
        forecastDays,
        ...result,
      });
    }

    // ==================== Stockout risk analysis - use service ====================
    case "stockout-risk": {
      const result = await getStockoutRiskAnalysis(warehouse);
      return NextResponse.json({
        riskPeriods: [7, 14, 30],
        ...result,
      });
    }

    // ==================== ABC classification - use service ====================
    case "abc-analysis": {
      const result = await getAbcAnalysis();
      return NextResponse.json({
        ...result,
        changes: result.products
          .filter((p: Record<string, unknown>) => p.classChanged)
          .map((p: Record<string, unknown>) => ({
            sku: p.sku,
            productName: p.productName,
            from: p.currentAbcClass,
            to: p.newAbcClass,
          })),
      });
    }

    // ==================== Smart reorder recommendations - use service ====================
    case "reorder_recommendations": {
      const safetyDays = parseInt(searchParams.get("safetyDays") || "14");
      const result = await getReorderRecommendations(safetyDays);
      return NextResponse.json(result);
    }

    // ==================== Inventory alert timeline - use service ====================
    case "alert_timeline": {
      const limit = parseInt(searchParams.get("limit") || "50");
      const typeFilter = searchParams.get("type") || undefined;
      const severityFilter = searchParams.get("severity") || undefined;

      const result = await getAlertTimeline(limit, typeFilter, severityFilter);
      return NextResponse.json(result);
    }

    // ==================== Inventory overview - use service ====================
    case "overview": {
      const overview = await getInventoryOverview(warehouse);
      return NextResponse.json(overview);
    }

    // ==================== Capital occupation analysis ====================
    case "capital_analysis": {
      const [inventoryRecords, products, costRecords, salesRecords] = await Promise.all([
        db.inventory.findMany({ include: { product: true }, take: 1000 }),
        db.product.findMany({ take: 1000 }),
        db.costRecord.findMany({ take: 1000 }),
        db.salesRecord.findMany({ take: 5000 }),
      ]);

      // Build cost lookup by productId
      const costByProduct: Record<string, { totalLanded: number; unitCost: number }> = {};
      costRecords.forEach(c => {
        costByProduct[c.productId] = { totalLanded: c.totalLanded, unitCost: c.totalLanded };
      });
      // Fallback: use product.unitCost if no cost record
      products.forEach(p => {
        if (!costByProduct[p.id]) {
          costByProduct[p.id] = { totalLanded: p.unitCost, unitCost: p.unitCost };
        }
      });

      // Per-item capital occupation
      const itemCapital = inventoryRecords.map(inv => {
        const unitCost = costByProduct[inv.productId]?.totalLanded || inv.product?.unitCost || 0;
        const capitalOccupied = inv.quantity * unitCost;
        return {
          sku: inv.sku,
          productName: inv.productName,
          category: inv.product?.category || '',
          warehouse: inv.warehouse,
          quantity: inv.quantity,
          unitCost: Math.round(unitCost * 100) / 100,
          capitalOccupied: Math.round(capitalOccupied * 100) / 100,
        };
      }).sort((a, b) => b.capitalOccupied - a.capitalOccupied);

      // Total capital occupied
      const totalCapital = itemCapital.reduce((sum, item) => sum + item.capitalOccupied, 0);

      // ABC analysis based on capital
      let cumulativeCapital = 0;
      const abcAnalysis = itemCapital.map(item => {
        cumulativeCapital += item.capitalOccupied;
        const cumulativePercent = totalCapital > 0 ? (cumulativeCapital / totalCapital) * 100 : 0;
        let abcClass: 'A' | 'B' | 'C';
        if (cumulativePercent <= 80) abcClass = 'A';
        else if (cumulativePercent <= 95) abcClass = 'B';
        else abcClass = 'C';
        return {
          ...item,
          cumulativePercent: Math.round(cumulativePercent * 100) / 100,
          abcClass,
        };
      });

      const aClassItems = abcAnalysis.filter(i => i.abcClass === 'A');
      const bClassItems = abcAnalysis.filter(i => i.abcClass === 'B');
      const cClassItems = abcAnalysis.filter(i => i.abcClass === 'C');

      // Category-wise capital breakdown
      const categoryCapital: Record<string, number> = {};
      itemCapital.forEach(item => {
        categoryCapital[item.category] = (categoryCapital[item.category] || 0) + item.capitalOccupied;
      });
      const categoryBreakdown = Object.entries(categoryCapital)
        .map(([category, capital]) => ({
          category,
          capital: Math.round(capital * 100) / 100,
          percent: totalCapital > 0 ? Math.round((capital / totalCapital) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.capital - a.capital);

      // Warehouse-wise capital breakdown
      const warehouseCapital: Record<string, number> = {};
      itemCapital.forEach(item => {
        warehouseCapital[item.warehouse] = (warehouseCapital[item.warehouse] || 0) + item.capitalOccupied;
      });
      const warehouseBreakdown = Object.entries(warehouseCapital)
        .map(([warehouse, capital]) => ({
          warehouse,
          capital: Math.round(capital * 100) / 100,
          percent: totalCapital > 0 ? Math.round((capital / totalCapital) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.capital - a.capital);

      // Capital turnover rate = total revenue / average capital
      const totalRevenue = salesRecords.reduce((sum, r) => sum + r.revenue, 0);
      const daysInData = salesRecords.length > 0
        ? Math.ceil((new Date(salesRecords[salesRecords.length - 1].date).getTime() - new Date(salesRecords[0].date).getTime()) / 86400000) + 1
        : 30;
      const annualizedRevenue = totalRevenue / daysInData * 365;
      const capitalTurnoverRate = totalCapital > 0 ? Math.round((annualizedRevenue / totalCapital) * 100) / 100 : 0;

      return apiSuccess({
        itemCapital: itemCapital.slice(0, 50), // Top 50 by capital
        totalCapital: Math.round(totalCapital * 100) / 100,
        capitalTurnoverRate,
        abcAnalysis: abcAnalysis.slice(0, 50),
        abcSummary: {
          A: { count: aClassItems.length, capital: Math.round(aClassItems.reduce((s, i) => s + i.capitalOccupied, 0) * 100) / 100 },
          B: { count: bClassItems.length, capital: Math.round(bClassItems.reduce((s, i) => s + i.capitalOccupied, 0) * 100) / 100 },
          C: { count: cClassItems.length, capital: Math.round(cClassItems.reduce((s, i) => s + i.capitalOccupied, 0) * 100) / 100 },
        },
        categoryBreakdown,
        warehouseBreakdown,
      });
    }

    // ==================== Inventory capital analysis ====================
    case "inventory_capital": {
      const threshold = parseInt(searchParams.get("threshold") || "90");
      const [inventoryRecords, costRecords, salesRecords] = await Promise.all([
        db.inventory.findMany({ include: { product: true }, take: 1000 }),
        db.costRecord.findMany({ take: 1000 }),
        db.salesRecord.findMany({ take: 5000 }),
      ]);

      // Cost lookup by productId
      const costByProduct: Record<string, number> = {};
      costRecords.forEach(c => { costByProduct[c.productId] = c.totalLanded; });

      // Warehouse capital breakdown
      const warehouseMap = new Map<string, { capital: number; items: number }>();
      let totalCapital = 0;
      for (const inv of inventoryRecords) {
        const unitCost = costByProduct[inv.productId] ?? inv.product?.unitCost ?? 0;
        const capital = inv.quantity * unitCost;
        totalCapital += capital;
        const w = warehouseMap.get(inv.warehouse) || { capital: 0, items: 0 };
        w.capital += capital;
        w.items++;
        warehouseMap.set(inv.warehouse, w);
      }
      const warehouseBreakdown = [...warehouseMap.entries()]
        .map(([warehouse, v]) => ({
          warehouse,
          capital: Math.round(v.capital * 100) / 100,
          items: v.items,
          percent: totalCapital > 0 ? Math.round((v.capital / totalCapital) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.capital - a.capital);

      // Turnover ratio = COGS / avg inventory
      const totalRevenue = salesRecords.reduce((s, r) => s + r.revenue, 0);
      const daysSpan = salesRecords.length > 1
        ? Math.max(1, Math.ceil(
            (new Date(salesRecords[salesRecords.length - 1].date).getTime() -
             new Date(salesRecords[0].date).getTime()) / 86400000))
        : 30;
      const annualizedRevenue = totalRevenue / daysSpan * 365;
      const turnoverRatio = totalCapital > 0
        ? Math.round((annualizedRevenue / totalCapital) * 100) / 100
        : 0;

      // Slow-moving SKUs
      const slowItems = inventoryRecords
        .filter(inv => inv.turnoverDays > threshold)
        .map(inv => ({
          sku: inv.sku,
          productName: inv.productName,
          warehouse: inv.warehouse,
          quantity: inv.quantity,
          turnoverDays: inv.turnoverDays,
          unitCost: costByProduct[inv.productId] ?? inv.product?.unitCost ?? 0,
          capital: Math.round(inv.quantity * (costByProduct[inv.productId] ?? inv.product?.unitCost ?? 0) * 100) / 100,
        }))
        .sort((a, b) => b.turnoverDays - a.turnoverDays);

      const slowCapital = slowItems.reduce((s, i) => s + i.capital, 0);

      return apiSuccess({
        totalCapital: Math.round(totalCapital * 100) / 100,
        turnoverRatio,
        warehouseBreakdown,
        slowMoving: {
          threshold,
          count: slowItems.length,
          capitalTied: Math.round(slowCapital * 100) / 100,
          percentOfTotal: totalCapital > 0 ? Math.round((slowCapital / totalCapital) * 1000) / 10 : 0,
          items: slowItems.slice(0, 30),
        },
      });
    }

    default:
      return apiError(`未知操作: ${action}`, 400, 'UNKNOWN_ACTION');
  }
}));

// PUT /api/inventory - Batch update inventory statuses
export const PUT = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "update";

    if (action === "bulk_update") {
      const body = await request.json();
      const { updates } = body as {
        updates: Array<{
          id?: string;
          sku?: string;
          stockStatus?: string;
          quantity?: number;
          safetyStock?: number;
          reorderPoint?: number;
          warehouse?: string;
        }>;
      };

      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return NextResponse.json(
          { error: "缺少 updates 数组，格式: [{id, stockStatus?, quantity?, safetyStock?, reorderPoint?}]" },
          { status: 400 }
        );
      }

      if (updates.length > 100) {
        return NextResponse.json(
          { error: "批量更新最多支持 100 条记录" },
          { status: 400 }
        );
      }

      const results: Array<{
        id: string;
        sku: string;
        success: boolean;
        error?: string;
      }> = [];

      for (const update of updates) {
        try {
          // Find inventory by id or sku+warehouse
          let inventory;
          if (update.id) {
            inventory = await db.inventory.findUnique({ where: { id: update.id } });
          } else if (update.sku && update.warehouse) {
            inventory = await db.inventory.findFirst({
              where: { sku: update.sku, warehouse: update.warehouse },
            });
          } else if (update.sku) {
            inventory = await db.inventory.findFirst({ where: { sku: update.sku } });
          }

          if (!inventory) {
            results.push({
              id: update.id || "",
              sku: update.sku || "",
              success: false,
              error: `未找到库存记录`,
            });
            continue;
          }

          // Build update data
          const updateData: Record<string, unknown> = {};
          if (update.quantity !== undefined) {
            if (update.quantity < 0) {
              results.push({
                id: inventory.id,
                sku: inventory.sku,
                success: false,
                error: "库存数量不能为负数",
              });
              continue;
            }
            updateData.quantity = update.quantity;
            // Use service function for stock status computation
            const safetyStock = update.safetyStock ?? inventory.safetyStock;
            updateData.stockStatus = computeStockStatus(update.quantity, safetyStock);
          }
          if (update.safetyStock !== undefined) {
            if (update.safetyStock < 0) {
              results.push({
                id: inventory.id,
                sku: inventory.sku,
                success: false,
                error: "安全库存不能为负数",
              });
              continue;
            }
            updateData.safetyStock = update.safetyStock;
            // Use service function for stock status computation
            if (update.quantity === undefined) {
              updateData.stockStatus = computeStockStatus(inventory.quantity, update.safetyStock);
            }
          }
          if (update.reorderPoint !== undefined) {
            updateData.reorderPoint = Math.max(0, update.reorderPoint);
          }
          if (update.stockStatus !== undefined) {
            const validStatuses = ["healthy", "warning", "critical", "overstock"];
            if (!validStatuses.includes(update.stockStatus)) {
              results.push({
                id: inventory.id,
                sku: inventory.sku,
                success: false,
                error: `无效的库存状态: ${update.stockStatus}`,
              });
              continue;
            }
            updateData.stockStatus = update.stockStatus;
          }

          updateData.lastSyncAt = new Date();

          await db.inventory.update({
            where: { id: inventory.id },
            data: updateData,
          });

          results.push({
            id: inventory.id,
            sku: inventory.sku,
            success: true,
          });
        } catch (itemError) {
          results.push({
            id: update.id || "",
            sku: update.sku || "",
            success: false,
            error: "更新失败",
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      // Invalidate cache after bulk update
      if (successCount > 0) {
        serverCache.invalidate('inventory');
        serverCache.invalidate('dashboard');
      }

      return NextResponse.json({
        success: failureCount === 0,
        results,
        summary: {
          total: results.length,
          succeeded: successCount,
          failed: failureCount,
        },
      });
    }

    return apiError(`未知 PUT 操作: ${action}`, 400, 'UNKNOWN_ACTION');
}));

// POST /api/inventory - Stock adjustment
export const POST = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "adjustment";

    if (action === "adjustment") {
      const body = await request.json();
      const { sku, quantity, reason, warehouse } = body as {
        sku: string;
        quantity: number;
        reason: string;
        warehouse?: string;
      };

      // Validate required fields
      if (!sku) throw ValidationError("缺少必填字段: sku");
      if (quantity === undefined || quantity === null) throw ValidationError("缺少必填字段: quantity（正数表示入库，负数表示出库）");
      if (!reason || !reason.trim()) throw ValidationError("缺少必填字段: reason（调整原因）");

      // Find the inventory record
      const where: Record<string, unknown> = { sku };
      if (warehouse) where.warehouse = warehouse;

      const inventory = await db.inventory.findFirst({ where });

      if (!inventory) throw NotFoundError(`未找到 SKU: ${sku}${warehouse ? ` 在仓库 ${warehouse}` : ""} 的库存记录`);

      // Calculate new quantity
      const newQuantity = inventory.quantity + quantity;

      if (newQuantity < 0) {
        throw ValidationError(`调整后库存不能为负数。当前库存: ${inventory.quantity}，调整量: ${quantity > 0 ? "+" : ""}${quantity}`);
      }

      // Use service function for stock status computation
      const newStatus = computeStockStatus(newQuantity, inventory.safetyStock);

      // Update inventory
      const updatedInventory = await db.inventory.update({
        where: { id: inventory.id },
        data: {
          quantity: newQuantity,
          stockStatus: newStatus,
          lastSyncAt: new Date(),
        },
      });

      // Create supply chain event for the adjustment
      const adjustmentType = quantity > 0 ? "入库" : "出库";
      const absQuantity = Math.abs(quantity);

      await db.supplyChainEvent.create({
        data: {
          type: "库存调整",
          title: `库存${adjustmentType}: ${inventory.productName}`,
          description: `${adjustmentType} ${absQuantity} 件，原因: ${reason.trim()}。库存从 ${inventory.quantity} 变为 ${newQuantity}`,
          icon: quantity > 0 ? "📥" : "📤",
          color: quantity > 0 ? "#22c55e" : "#f59e0b",
          severity: newStatus === "critical" ? "critical" : newStatus === "warning" ? "warning" : "info",
          sku,
        },
      });

      // Audit log for inventory adjustment
      await createAuditLog({
        action: 'ADJUST',
        entity: 'inventory',
        sku,
        details: { type: quantity > 0 ? 'inbound' : 'outbound', quantity, reason, beforeQty: inventory.quantity, afterQty: newQuantity },
        request,
      });

      // Invalidate cache after stock adjustment
      serverCache.invalidate('inventory');
      serverCache.invalidate('dashboard');

      return apiSuccess({
        adjustment: {
          sku: inventory.sku,
          productName: inventory.productName,
          warehouse: inventory.warehouse,
          previousQuantity: inventory.quantity,
          adjustment: quantity,
          newQuantity: updatedInventory.quantity,
          previousStatus: inventory.stockStatus,
          newStatus: updatedInventory.stockStatus,
          reason: reason.trim(),
        },
      });
    }

    return apiError(`未知 POST 操作: ${action}`, 400, 'UNKNOWN_ACTION');
}));
