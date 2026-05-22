/**
 * Inventory Analytics — getInventoryForecastAnalytics, getInventoryOptimizationAnalytics, getInventoryTurnoverAnalytics.
 * Extracted from services/analytics.service.ts.
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { roundTo } from '@/lib/utils/format';

// ─── 4. Inventory Forecast Analytics ─────────────────────────────────────────

export async function getInventoryForecastAnalytics(
  forecastDays: number = 14,
  alpha: number = 0.3,
  beta: number = 0.1
) {
  return cachedFetch(
    cacheKey('analytics', 'inventory-forecast', forecastDays, alpha, beta),
    async () => {
      const [inventory, products] = await Promise.all([
        db.inventory.findMany(),
        db.product.findMany(),
      ]);

      const forecasts = await Promise.all(
        inventory.map(async (inv) => {
          const invProduct = products.find(p => p.id === inv.productId);
          const salesRecords = await db.salesRecord.findMany({
            where: { productId: inv.productId },
            orderBy: { date: "asc" },
          });

          if (salesRecords.length < 7) {
            return {
              sku: inv.sku,
              productName: inv.productName,
              category: invProduct?.category,
              currentStock: inv.quantity,
              dailyVelocity: 0,
              forecast: [],
              reorderRecommendation: {
                shouldReorder: inv.quantity <= inv.reorderPoint,
                quantity: inv.quantity <= inv.reorderPoint ? inv.safetyStock * 2 : 0,
                confidence: "low" as const,
              },
              stockoutDate: null,
            };
          }

          const recentSales = salesRecords.slice(-30);
          const dailyVelocity =
            recentSales.reduce((sum, r) => sum + r.quantity, 0) /
            recentSales.length;

          const dailyQuantities = salesRecords.map((r) => r.quantity);
          let level = dailyQuantities[0];
          let trend = dailyQuantities.length > 1
            ? dailyQuantities[1] - dailyQuantities[0]
            : 0;

          for (let i = 1; i < dailyQuantities.length; i++) {
            const newLevel = alpha * dailyQuantities[i] + (1 - alpha) * (level + trend);
            const newTrend = beta * (newLevel - level) + (1 - beta) * trend;
            level = newLevel;
            trend = newTrend;
          }

          const forecastData: { day: number; date: string; forecastDemand: number; projectedStock: number; lowerBound: number; upperBound: number }[] = [];
          let projectedStock = inv.quantity;

          for (let d = 1; d <= forecastDays; d++) {
            const forecastValue = Math.max(0, Math.round(level + trend * d));
            projectedStock -= dailyVelocity;

            const dayOfWeek = (new Date().getDay() + d) % 7;
            const seasonalityFactor =
              dayOfWeek === 0 || dayOfWeek === 6 ? 0.7 : 1.1;
            const adjustedForecast = Math.round(forecastValue * seasonalityFactor);

            const confidenceWidth = Math.round(1.96 * Math.sqrt(d) * dailyVelocity * 0.3);

            forecastData.push({
              day: d,
              date: new Date(
                Date.now() + d * 24 * 60 * 60 * 1000
              ).toISOString().split("T")[0],
              forecastDemand: adjustedForecast,
              projectedStock: Math.max(0, Math.round(projectedStock)),
              lowerBound: Math.max(0, adjustedForecast - confidenceWidth),
              upperBound: adjustedForecast + confidenceWidth,
            });
          }

          let stockoutDate: string | null = null;
          for (const fd of forecastData) {
            if (fd.projectedStock <= 0) {
              stockoutDate = fd.date;
              break;
            }
          }

          const daysOfStock = dailyVelocity > 0 ? Math.floor(inv.quantity / dailyVelocity) : 999;
          const shouldReorder =
            inv.quantity <= inv.reorderPoint || daysOfStock < 14;
          const reorderQuantity = shouldReorder
            ? Math.max(
                inv.safetyStock * 2,
                Math.round(dailyVelocity * 30 - inv.quantity - inv.inTransit)
              )
            : 0;

          const reorderConfidence =
            salesRecords.length > 60 ? "high" : salesRecords.length > 30 ? "medium" : "low";

          return {
            sku: inv.sku,
            productName: inv.productName,
            category: invProduct?.category,
            currentStock: inv.quantity,
            dailyVelocity: Math.round(dailyVelocity * 10) / 10,
            daysOfStock,
            forecast: forecastData,
            reorderRecommendation: {
              shouldReorder,
              quantity: Math.max(0, reorderQuantity),
              confidence: reorderConfidence as "high" | "medium" | "low",
            },
            stockoutDate,
          };
        })
      );

      const criticalItems = forecasts.filter(
        (f) => f.stockoutDate !== null || f.reorderRecommendation.shouldReorder
      );

      return {
        forecastDays,
        parameters: { alpha, beta },
        forecasts,
        criticalItems: criticalItems.map((c) => ({
          sku: c.sku,
          productName: c.productName,
          currentStock: c.currentStock,
          daysOfStock: c.daysOfStock,
          stockoutDate: c.stockoutDate,
          reorderQuantity: c.reorderRecommendation.quantity,
        })),
        summary: {
          totalItems: inventory.length,
          itemsAtRisk: criticalItems.length,
          itemsWithStockoutDate: forecasts.filter((f) => f.stockoutDate !== null).length,
          avgDaysOfStock:
            forecasts.length > 0
              ? Math.round(
                  (forecasts.reduce((s, f) => s + (f.daysOfStock ?? 0), 0) /
                    forecasts.length) *
                    10
                ) / 10
              : 0,
        },
      };
    },
    CACHE_TTL.LONG
  );
}

// ─── 7. Inventory Optimization Analytics ─────────────────────────────────────

export async function getInventoryOptimizationAnalytics() {
  return cachedFetch(
    cacheKey('analytics', 'inventory_optimization'),
    async () => {
      const [inventory, products, costRecords, salesRecords, suppliers] = await Promise.all([
        db.inventory.findMany(),
        db.product.findMany(),
        db.costRecord.findMany(),
        db.salesRecord.findMany(),
        db.supplier.findMany({ where: { status: "active" } }),
      ]);

      const optimizationItems = inventory.map(inv => {
        const product = products.find(p => p.id === inv.productId);
        const cost = costRecords.find(c => c.productId === inv.productId);
        const productSales = salesRecords.filter(s => s.productId === inv.productId);
        const categorySupplier = suppliers.find(s => s.category === product?.category);

        const recentSales = productSales.slice(-30);
        const dailyDemand = recentSales.length > 0
          ? recentSales.reduce((s, r) => s + r.quantity, 0) / 30
          : 0;

        const dailyQuantities = recentSales.map(r => r.quantity);
        const demandStdDev = dailyQuantities.length > 1
          ? Math.sqrt(dailyQuantities.reduce((sum, q) => sum + Math.pow(q - dailyDemand, 2), 0) / dailyQuantities.length)
          : dailyDemand * 0.3;

        const leadTimeDays = categorySupplier?.leadTime || inv.turnoverDays > 0 ? Math.min(inv.turnoverDays, 30) : 14;

        const zScore = 1.65;
        const recommendedSafetyStock = Math.ceil(zScore * demandStdDev * Math.sqrt(leadTimeDays));
        const reorderPoint = Math.ceil(dailyDemand * leadTimeDays + recommendedSafetyStock);

        const annualDemand = dailyDemand * 365;
        const unitCost = cost?.totalLanded || 10;
        const orderingCost = 50;
        const holdingCostRate = 0.25;
        const holdingCost = unitCost * holdingCostRate;
        const eoq = holdingCost > 0 ? Math.round(Math.sqrt(2 * annualDemand * orderingCost / holdingCost)) : 0;

        const isLowStock = inv.quantity <= inv.reorderPoint || inv.quantity <= recommendedSafetyStock;
        const suggestedOrderQty = isLowStock
          ? Math.max(eoq, reorderPoint - inv.quantity + recommendedSafetyStock)
          : 0;

        const daysOfSupply = dailyDemand > 0 ? Math.floor(inv.quantity / dailyDemand) : 999;

        return {
          sku: inv.sku,
          productName: inv.productName,
          category: product?.category || "未分类",
          warehouse: inv.warehouse,
          currentStock: inv.quantity,
          currentSafetyStock: inv.safetyStock,
          currentReorderPoint: inv.reorderPoint,
          dailyDemand: Math.round(dailyDemand * 100) / 100,
          demandStdDev: Math.round(demandStdDev * 100) / 100,
          leadTimeDays,
          recommendedSafetyStock,
          reorderPoint,
          eoq,
          suggestedOrderQty: Math.max(0, suggestedOrderQty),
          isLowStock,
          daysOfSupply,
          stockStatus: inv.stockStatus,
          unitCost: cost?.totalLanded || 0,
        };
      });

      optimizationItems.sort((a, b) => {
        if (a.isLowStock && !b.isLowStock) return -1;
        if (!a.isLowStock && b.isLowStock) return 1;
        return a.daysOfSupply - b.daysOfSupply;
      });

      const lowStockItems = optimizationItems.filter(i => i.isLowStock);
      const totalSuggestedOrderValue = lowStockItems.reduce(
        (sum, i) => sum + i.suggestedOrderQty * i.unitCost, 0
      );

      return {
        items: optimizationItems,
        lowStockItems: lowStockItems.map(i => ({
          sku: i.sku,
          productName: i.productName,
          category: i.category,
          currentStock: i.currentStock,
          suggestedOrderQty: i.suggestedOrderQty,
          daysOfSupply: i.daysOfSupply,
          unitCost: i.unitCost,
        })),
        summary: {
          totalItems: inventory.length,
          lowStockCount: lowStockItems.length,
          criticalCount: optimizationItems.filter(i => i.stockStatus === "critical").length,
          totalSuggestedOrderValue: Math.round(totalSuggestedOrderValue),
          avgDaysOfSupply: optimizationItems.length > 0
            ? Math.round(optimizationItems.reduce((s, i) => s + Math.min(i.daysOfSupply, 999), 0) / optimizationItems.length)
            : 0,
          avgRecommendedSafetyStock: optimizationItems.length > 0
            ? Math.round(optimizationItems.reduce((s, i) => s + i.recommendedSafetyStock, 0) / optimizationItems.length)
            : 0,
          avgEOQ: optimizationItems.length > 0
            ? Math.round(optimizationItems.reduce((s, i) => s + i.eoq, 0) / optimizationItems.length)
            : 0,
        },
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

// ─── 9. Inventory Turnover Analytics ─────────────────────────────────────────

export async function getInventoryTurnoverAnalytics() {
  return cachedFetch(
    cacheKey('analytics', 'inventory_turnover'),
    async () => {
      const [inventory, salesRecords, costRecords, products] = await Promise.all([
        db.inventory.findMany(),
        db.salesRecord.findMany(),
        db.costRecord.findMany(),
        db.product.findMany(),
      ]);

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const recentSales = salesRecords.filter(r => r.date >= ninetyDaysAgo);

      const salesByProduct: Record<string, { productId: string; sku: string; totalQuantity: number; totalRevenue: number }> = {};
      recentSales.forEach(r => {
        if (!salesByProduct[r.productId]) {
          salesByProduct[r.productId] = { productId: r.productId, sku: r.sku, totalQuantity: 0, totalRevenue: 0 };
        }
        salesByProduct[r.productId].totalQuantity += r.quantity;
        salesByProduct[r.productId].totalRevenue += r.revenue;
      });

      const turnoverAnalysis = inventory.map(inv => {
        const sales = salesByProduct[inv.productId];
        const cost = costRecords.find(c => c.sku === inv.sku);
        const product = products.find(p => p.id === inv.productId);

        const dailySalesVelocity = sales ? sales.totalQuantity / 90 : 0;
        const annualizedSales = dailySalesVelocity * 365;
        const turnoverRate = inv.quantity > 0
          ? Math.round(annualizedSales / inv.quantity * 100) / 100
          : 0;

        const daysOfInventory = dailySalesVelocity > 0
          ? Math.round(inv.quantity / dailySalesVelocity)
          : 999;

        const unitCost = cost?.totalLanded || 0;
        const inventoryValue = Math.round(inv.quantity * unitCost);

        const category = product?.category || "未分类";

        return {
          sku: inv.sku,
          productName: inv.productName,
          category,
          warehouse: inv.warehouse,
          currentStock: inv.quantity,
          safetyStock: inv.safetyStock,
          stockStatus: inv.stockStatus,
          turnoverRate,
          daysOfInventory: Math.min(daysOfInventory, 999),
          dailySalesVelocity: Math.round(dailySalesVelocity * 100) / 100,
          inventoryValue,
          abcClass: product?.abcClass || "C",
          fsnClass: product?.fsnClass || "N",
        };
      });

      const slowMovingItems = turnoverAnalysis
        .filter(i => i.turnoverRate < 2 || i.daysOfInventory > 90)
        .sort((a, b) => a.turnoverRate - b.turnoverRate)
        .map(i => ({
          sku: i.sku,
          productName: i.productName,
          category: i.category,
          warehouse: i.warehouse,
          turnoverRate: i.turnoverRate,
          daysOfInventory: i.daysOfInventory,
          currentStock: i.currentStock,
          inventoryValue: i.inventoryValue,
          stockStatus: i.stockStatus,
          recommendation: i.daysOfInventory > 180
            ? "严重滞销，建议清仓处理或促销"
            : i.daysOfInventory > 90
              ? "周转缓慢，建议适当降价促销"
              : "周转偏低，建议控制补货量",
        }));

      const fastMovingItems = turnoverAnalysis
        .filter(i => i.turnoverRate >= 6 || (i.dailySalesVelocity > 0 && i.daysOfInventory < 30))
        .sort((a, b) => b.turnoverRate - a.turnoverRate)
        .map(i => ({
          sku: i.sku,
          productName: i.productName,
          category: i.category,
          warehouse: i.warehouse,
          turnoverRate: i.turnoverRate,
          daysOfInventory: i.daysOfInventory,
          dailySalesVelocity: i.dailySalesVelocity,
          currentStock: i.currentStock,
          safetyStock: i.safetyStock,
          inventoryValue: i.inventoryValue,
          stockStatus: i.stockStatus,
          riskLevel: i.currentStock <= i.safetyStock ? "high" : i.currentStock <= i.safetyStock * 1.5 ? "medium" : "low",
          recommendation: i.currentStock <= i.safetyStock
            ? "库存低于安全线，需紧急补货"
            : i.currentStock <= i.safetyStock * 1.5
              ? "库存偏低，建议提前补货"
              : "库存充足，保持当前补货节奏",
        }));

      const avgTurnoverRate = turnoverAnalysis.length > 0
        ? Math.round(turnoverAnalysis.reduce((s, i) => s + i.turnoverRate, 0) / turnoverAnalysis.length * 100) / 100
        : 0;
      const avgDaysOfInventory = turnoverAnalysis.length > 0
        ? Math.round(turnoverAnalysis.reduce((s, i) => s + Math.min(i.daysOfInventory, 999), 0) / turnoverAnalysis.length)
        : 0;
      const totalInventoryValue = turnoverAnalysis.reduce((s, i) => s + i.inventoryValue, 0);

      const turnoverByCategory: Record<string, { category: string; avgTurnoverRate: number; avgDaysOfInventory: number; totalValue: number; itemCount: number }> = {};
      turnoverAnalysis.forEach(i => {
        if (!turnoverByCategory[i.category]) {
          turnoverByCategory[i.category] = { category: i.category, avgTurnoverRate: 0, avgDaysOfInventory: 0, totalValue: 0, itemCount: 0 };
        }
        turnoverByCategory[i.category].avgTurnoverRate += i.turnoverRate;
        turnoverByCategory[i.category].avgDaysOfInventory += Math.min(i.daysOfInventory, 999);
        turnoverByCategory[i.category].totalValue += i.inventoryValue;
        turnoverByCategory[i.category].itemCount++;
      });
      Object.values(turnoverByCategory).forEach(tc => {
        tc.avgTurnoverRate = Math.round(tc.avgTurnoverRate / tc.itemCount * 100) / 100;
        tc.avgDaysOfInventory = Math.round(tc.avgDaysOfInventory / tc.itemCount);
        tc.totalValue = Math.round(tc.totalValue);
      });

      const turnoverByWarehouse: Record<string, { warehouse: string; avgTurnoverRate: number; avgDaysOfInventory: number; totalValue: number; itemCount: number }> = {};
      turnoverAnalysis.forEach(i => {
        if (!turnoverByWarehouse[i.warehouse]) {
          turnoverByWarehouse[i.warehouse] = { warehouse: i.warehouse, avgTurnoverRate: 0, avgDaysOfInventory: 0, totalValue: 0, itemCount: 0 };
        }
        turnoverByWarehouse[i.warehouse].avgTurnoverRate += i.turnoverRate;
        turnoverByWarehouse[i.warehouse].avgDaysOfInventory += Math.min(i.daysOfInventory, 999);
        turnoverByWarehouse[i.warehouse].totalValue += i.inventoryValue;
        turnoverByWarehouse[i.warehouse].itemCount++;
      });
      Object.values(turnoverByWarehouse).forEach(tw => {
        tw.avgTurnoverRate = Math.round(tw.avgTurnoverRate / tw.itemCount * 100) / 100;
        tw.avgDaysOfInventory = Math.round(tw.avgDaysOfInventory / tw.itemCount);
        tw.totalValue = Math.round(tw.totalValue);
      });

      const turnoverByABC: Record<string, { abcClass: string; avgTurnoverRate: number; avgDaysOfInventory: number; itemCount: number }> = {};
      turnoverAnalysis.forEach(i => {
        if (!turnoverByABC[i.abcClass]) {
          turnoverByABC[i.abcClass] = { abcClass: i.abcClass, avgTurnoverRate: 0, avgDaysOfInventory: 0, itemCount: 0 };
        }
        turnoverByABC[i.abcClass].avgTurnoverRate += i.turnoverRate;
        turnoverByABC[i.abcClass].avgDaysOfInventory += Math.min(i.daysOfInventory, 999);
        turnoverByABC[i.abcClass].itemCount++;
      });
      Object.values(turnoverByABC).forEach(ab => {
        ab.avgTurnoverRate = Math.round(ab.avgTurnoverRate / ab.itemCount * 100) / 100;
        ab.avgDaysOfInventory = Math.round(ab.avgDaysOfInventory / ab.itemCount);
      });

      return {
        title: "库存周转分析",
        generatedAt: new Date().toISOString(),
        summary: {
          totalProducts: inventory.length,
          avgTurnoverRate,
          avgDaysOfInventory,
          totalInventoryValue: Math.round(totalInventoryValue),
          slowMovingCount: slowMovingItems.length,
          fastMovingCount: fastMovingItems.length,
          normalMovingCount: inventory.length - slowMovingItems.length - fastMovingItems.length,
        },
        turnoverByCategory: Object.values(turnoverByCategory),
        turnoverByWarehouse: Object.values(turnoverByWarehouse),
        turnoverByABCClass: Object.values(turnoverByABC),
        slowMovingItems,
        fastMovingItems,
        allProducts: turnoverAnalysis.sort((a, b) => b.turnoverRate - a.turnoverRate),
      };
    },
    CACHE_TTL.VERY_LONG
  );
}

