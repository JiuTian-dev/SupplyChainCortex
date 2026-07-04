/**
 * Inventory Service - Analytics methods (ABC classification, forecast, risk analysis, reorder)
 */

import { db } from '@/lib/db';
import type { InventoryForecastItem, StockoutRiskItem } from './types';
import { computeSafetyStock } from './types';

/** Generate inventory forecast for all items - optimized batch query */
export async function getInventoryForecast(
  forecastDays = 14,
  warehouse?: string
): Promise<{ forecasts: InventoryForecastItem[]; summary: { totalItems: number; itemsBelowReorder: number; itemsWithDecreasingTrend: number; avgDailyVelocity: number } }> {
  const inventoryRecords = await db.inventory.findMany({
    where: warehouse ? { warehouse } : {},
    include: { product: true },
    take: 5000,
  });

  // FIX N+1: Batch fetch all sales records at once, then distribute by productId
  const productIds = inventoryRecords.map(inv => inv.productId);
  const allSalesRecords = await db.salesRecord.findMany({
    where: { productId: { in: productIds } },
    orderBy: { date: 'asc' },
    take: 5000,
  });

  // Group sales records by productId
  const salesByProduct: Record<string, typeof allSalesRecords> = {};
  allSalesRecords.forEach(sr => {
    if (!salesByProduct[sr.productId]) salesByProduct[sr.productId] = [];
    salesByProduct[sr.productId].push(sr);
  });

  const forecasts = inventoryRecords.map((inv) => {
    const salesRecords = salesByProduct[inv.productId] || [];

    if (salesRecords.length < 7) {
      return {
        sku: inv.sku,
        productName: inv.productName,
        category: inv.product?.category,
        currentStock: inv.quantity,
        safetyStock: inv.safetyStock,
        reorderPoint: inv.reorderPoint,
        dailyVelocity: 0,
        forecastDays,
        projectedStock: inv.quantity,
        daysUntilReorder: inv.quantity > inv.reorderPoint
          ? Math.round((inv.quantity - inv.reorderPoint) / Math.max(1, inv.quantity / 30))
          : 0,
        trend: 'stable' as const,
      };
    }

    const recentSales = salesRecords.slice(-30);
    const dailyVelocity = recentSales.reduce((sum, r) => sum + r.quantity, 0) / recentSales.length;

    const olderSales = salesRecords.slice(-60, -30);
    const olderVelocity = olderSales.length > 0
      ? olderSales.reduce((sum, r) => sum + r.quantity, 0) / olderSales.length
      : dailyVelocity;

    const trendChange = olderVelocity > 0 ? (dailyVelocity - olderVelocity) / olderVelocity : 0;
    const trend: 'increasing' | 'decreasing' | 'stable' =
      trendChange > 0.1 ? 'increasing' : trendChange < -0.1 ? 'decreasing' : 'stable';

    const projectedStock = Math.max(0, Math.round(inv.quantity - dailyVelocity * forecastDays));
    const daysUntilReorder = dailyVelocity > 0
      ? Math.max(0, Math.round((inv.quantity - inv.reorderPoint) / dailyVelocity))
      : 999;

    return {
      sku: inv.sku,
      productName: inv.productName,
      category: inv.product?.category,
      currentStock: inv.quantity,
      safetyStock: inv.safetyStock,
      reorderPoint: inv.reorderPoint,
      dailyVelocity: Math.round(dailyVelocity * 100) / 100,
      forecastDays,
      projectedStock,
      daysUntilReorder,
      trend,
    };
  });

  return {
    forecasts,
    summary: {
      totalItems: forecasts.length,
      itemsBelowReorder: forecasts.filter(f => f.daysUntilReorder === 0).length,
      itemsWithDecreasingTrend: forecasts.filter(f => f.trend === 'decreasing').length,
      avgDailyVelocity: forecasts.length > 0
        ? Math.round((forecasts.reduce((s, f) => s + f.dailyVelocity, 0) / forecasts.length) * 100) / 100
        : 0,
    },
  };
}

/** Compute stockout risk analysis - optimized batch query */
export async function getStockoutRiskAnalysis(
  warehouse?: string
): Promise<{ items: StockoutRiskItem[]; summary: Record<string, number> }> {
  const riskPeriods = [7, 14, 30];
  const inventoryRecords = await db.inventory.findMany({
    where: warehouse ? { warehouse } : {},
    include: { product: true },
    take: 5000,
  });

  // FIX N+1: Batch fetch all sales records at once, then distribute by productId
  const productIds = inventoryRecords.map(inv => inv.productId);
  const allSalesRecords = await db.salesRecord.findMany({
    where: { productId: { in: productIds } },
    take: 5000,
  });

  // Group sales records by productId
  const salesByProduct: Record<string, typeof allSalesRecords> = {};
  allSalesRecords.forEach(sr => {
    if (!salesByProduct[sr.productId]) salesByProduct[sr.productId] = [];
    salesByProduct[sr.productId].push(sr);
  });

  const riskAnalysis = inventoryRecords.map((inv) => {
    const salesRecords = salesByProduct[inv.productId] || [];

    const dailyVelocity = salesRecords.length >= 7
      ? salesRecords.slice(-30).reduce((sum, r) => sum + r.quantity, 0) / 30
      : inv.quantity / 30;

    const availableStock = inv.quantity + inv.inTransit;

    const risks = riskPeriods.map((period) => {
      const projectedConsumption = dailyVelocity * period;
      const remainingStock = availableStock - projectedConsumption;
      const riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical' =
        remainingStock > inv.safetyStock * 2 ? 'safe'
        : remainingStock > inv.safetyStock ? 'low'
        : remainingStock > 0 ? 'medium'
        : remainingStock > -inv.safetyStock ? 'high'
        : 'critical';
      return { period, projectedConsumption: Math.round(projectedConsumption), remainingStock: Math.round(remainingStock), riskLevel };
    });

    const severityMap = { safe: 0, low: 1, medium: 2, high: 3, critical: 4 };
    const worstRisk = risks.reduce((worst, r) =>
      severityMap[r.riskLevel] > severityMap[worst.riskLevel] ? r : worst
    );

    const isBelowSafetyStock = inv.quantity < inv.safetyStock;
    const isCriticalStatus = inv.stockStatus === 'critical';

    let overallRisk = worstRisk.riskLevel;
    if (isCriticalStatus && severityMap[overallRisk] < severityMap['critical']) {
      overallRisk = 'critical';
    } else if (isBelowSafetyStock && severityMap[overallRisk] < severityMap['high']) {
      overallRisk = 'high';
    }

    return {
      sku: inv.sku,
      productName: inv.productName,
      category: inv.product?.category,
      currentStock: inv.quantity,
      inTransit: inv.inTransit,
      availableStock,
      safetyStock: inv.safetyStock,
      stockStatus: inv.stockStatus,
      belowSafetyStock: isBelowSafetyStock,
      dailyVelocity: Math.round(dailyVelocity * 100) / 100,
      risks,
      overallRisk,
    };
  });

  const riskOrder = { critical: 0, high: 1, medium: 2, low: 3, safe: 4 };
  const atRiskItems = riskAnalysis
    .filter(item => item.overallRisk !== 'safe')
    .sort((a, b) => riskOrder[a.overallRisk] - riskOrder[b.overallRisk]);

  return {
    items: atRiskItems,
    summary: {
      totalItems: riskAnalysis.length,
      totalAtRisk: riskAnalysis.filter(i => i.overallRisk !== 'safe').length,
      criticalRisk: riskAnalysis.filter(i => i.overallRisk === 'critical').length,
      highRisk: riskAnalysis.filter(i => i.overallRisk === 'high').length,
      mediumRisk: riskAnalysis.filter(i => i.overallRisk === 'medium').length,
      lowRisk: riskAnalysis.filter(i => i.overallRisk === 'low').length,
      safeItems: riskAnalysis.filter(i => i.overallRisk === 'safe').length,
      belowSafetyStock: riskAnalysis.filter(i => i.belowSafetyStock).length,
    },
  };
}

/** ABC classification analysis */
export async function getAbcAnalysis() {
  const products = await db.product.findMany({
    include: { salesRecords: true, inventory: true, cost: true },
    take: 5000,
  });

  const productRevenue = products.map((product) => {
    const totalRevenue = product.salesRecords.reduce((sum, sr) => sum + sr.revenue, 0);
    const totalQuantity = product.salesRecords.reduce((sum, sr) => sum + sr.quantity, 0);
    const grossMargin = product.cost?.grossMargin || 0;
    return {
      sku: product.sku,
      productName: product.name,
      category: product.category,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalQuantity,
      grossMargin,
      currentAbcClass: product.abcClass,
    };
  });

  const sortedByRevenue = [...productRevenue].sort((a, b) => b.totalRevenue - a.totalRevenue);
  const totalRevenue = sortedByRevenue.reduce((sum, p) => sum + p.totalRevenue, 0);

  let cumulativeRevenue = 0;
  const classified = sortedByRevenue.map((product) => {
    cumulativeRevenue += product.totalRevenue;
    const cumulativePercent = totalRevenue > 0 ? (cumulativeRevenue / totalRevenue) * 100 : 0;
    const newAbcClass: 'A' | 'B' | 'C' = cumulativePercent <= 80 ? 'A' : cumulativePercent <= 95 ? 'B' : 'C';

    return {
      ...product,
      revenueContribution: totalRevenue > 0 ? Math.round((product.totalRevenue / totalRevenue) * 1000) / 10 : 0,
      cumulativePercent: Math.round(cumulativePercent * 10) / 10,
      newAbcClass,
      classChanged: product.currentAbcClass !== newAbcClass,
    };
  });

  // Update database
  for (const item of classified) {
    if (item.classChanged) {
      await db.product.update({ where: { sku: item.sku }, data: { abcClass: item.newAbcClass } });
    }
  }

  const classSummary = {
    A: { count: classified.filter(p => p.newAbcClass === 'A').length, revenuePercent: Math.round(classified.filter(p => p.newAbcClass === 'A').reduce((s, p) => s + p.revenueContribution, 0) * 10) / 10 },
    B: { count: classified.filter(p => p.newAbcClass === 'B').length, revenuePercent: Math.round(classified.filter(p => p.newAbcClass === 'B').reduce((s, p) => s + p.revenueContribution, 0) * 10) / 10 },
    C: { count: classified.filter(p => p.newAbcClass === 'C').length, revenuePercent: Math.round(classified.filter(p => p.newAbcClass === 'C').reduce((s, p) => s + p.revenueContribution, 0) * 10) / 10 },
  };

  return { products: classified, classSummary, totalRevenue: Math.round(totalRevenue * 100) / 100, changesCount: classified.filter(p => p.classChanged).length };
}

/** Get reorder recommendations for all inventory */
export async function getReorderRecommendations(safetyDays = 14) {
  const inventoryRecords = await db.inventory.findMany({
    include: {
      product: { include: { cost: true } },
    },
    take: 1000,
  });

  const suppliers = await db.supplier.findMany({ where: { status: 'active' } });
  const avgLeadTime = suppliers.length > 0
    ? Math.round(suppliers.reduce((sum, s) => sum + s.leadTime, 0) / suppliers.length)
    : 14;

  // FIX N+1: Batch fetch all recent sales records at once
  const productIds = inventoryRecords.map(inv => inv.productId);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const allRecentSales = await db.salesRecord.findMany({
    where: {
      productId: { in: productIds },
      date: { gte: thirtyDaysAgo },
    },
    take: 5000,
  });

  // Group by productId
  const salesByProduct: Record<string, typeof allRecentSales> = {};
  allRecentSales.forEach(sr => {
    if (!salesByProduct[sr.productId]) salesByProduct[sr.productId] = [];
    salesByProduct[sr.productId].push(sr);
  });

  const recommendations = inventoryRecords.map((inv) => {
    const recentSales = salesByProduct[inv.productId] || [];

    const dailyVelocity = recentSales.length > 0
      ? recentSales.reduce((sum, r) => sum + r.quantity, 0) / 30
      : 0;

    const daysRemaining = dailyVelocity > 0
      ? Math.round(inv.quantity / dailyVelocity)
      : inv.quantity > 0 ? 999 : 0;

    const matchingSuppliers = suppliers.filter(s =>
      s.category.includes(inv.product?.category?.substring(0, 2) || '')
      || inv.product?.category?.includes(s.category.substring(0, 2) || '')
    );
    const leadTimeDays = matchingSuppliers.length > 0
      ? Math.round(matchingSuppliers.reduce((sum, s) => sum + s.leadTime, 0) / matchingSuppliers.length)
      : avgLeadTime;

    const safetyGap = Math.max(0, inv.safetyStock - inv.quantity);
    const velocityQty = Math.round(dailyVelocity * (leadTimeDays + safetyDays) - inv.quantity);
    const recommendedQty = Math.max(0, Math.round(Math.max(velocityQty, safetyGap)));

    const unitCost = inv.product?.cost?.totalLanded || inv.product?.unitCost || 0;
    const estimatedCost = Math.round(recommendedQty * unitCost * 100) / 100;

    let priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
    const belowSafety = inv.quantity < inv.safetyStock;
    if (daysRemaining < 7 || (belowSafety && inv.quantity < inv.safetyStock * 0.5)) priority = 'URGENT';
    else if (daysRemaining < 14 || belowSafety) priority = 'HIGH';
    else if (daysRemaining < 21) priority = 'MEDIUM';
    else priority = 'LOW';

    return {
      sku: inv.sku,
      productName: inv.productName,
      category: inv.product?.category,
      currentStock: inv.quantity,
      safetyStock: inv.safetyStock,
      inTransit: inv.inTransit,
      dailyVelocity: Math.round(dailyVelocity * 100) / 100,
      daysRemaining,
      leadTimeDays,
      safetyDays,
      recommendedQty,
      estimatedCost,
      unitCost,
      priority,
      stockStatus: inv.stockStatus,
      warehouse: inv.warehouse,
    };
  });

  const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sortedRecommendations = recommendations
    .filter(r => r.dailyVelocity > 0)
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  const urgentCount = sortedRecommendations.filter(r => r.priority === 'URGENT').length;
  const highCount = sortedRecommendations.filter(r => r.priority === 'HIGH').length;
  const totalEstimatedCost = Math.round(
    sortedRecommendations.reduce((sum, r) => sum + r.estimatedCost, 0) * 100
  ) / 100;
  const belowSafetyCount = sortedRecommendations.filter(r => r.currentStock < r.safetyStock).length;

  return {
    recommendations: sortedRecommendations,
    summary: {
      totalRecommendations: sortedRecommendations.length,
      urgentCount,
      highCount,
      totalEstimatedCost,
      belowSafetyCount,
      avgLeadTime,
      safetyDays,
    },
  };
}

/** Compute safety stock for a specific SKU — returns null if product not found */
export async function getSafetyStockForSku(sku: string, serviceLevel: number) {
  const product = await db.product.findUnique({ where: { sku } });
  if (!product) return null;

  const salesRecords = await db.salesRecord.findMany({
    where: { productId: product.id },
    take: 5000,
  });

  if (salesRecords.length === 0) {
    return {
      sku: product.sku,
      productName: product.name,
      serviceLevel,
      safetyStock: 0,
      formula: `安全库存 = Z(${serviceLevel}) × σ × √提前期(14天)`,
    };
  }

  const safetyStock = computeSafetyStock(salesRecords, serviceLevel, 14);

  return {
    sku: product.sku,
    productName: product.name,
    serviceLevel,
    safetyStock,
    formula: `安全库存 = Z(${serviceLevel}) × σ × √提前期(14天)`,
  };
}

/** Get reorder advice for a specific SKU — returns discriminated union for error handling */
export async function getReorderAdvice(sku: string, warehouse?: string): Promise<
  | { error: 'product_not_found' }
  | { error: 'inventory_not_found' }
  | {
      sku: string;
      productName: string;
      currentStock: number;
      safetyStock: number;
      inTransit: number;
      recommendedOrder: number;
      urgency: 'urgent' | 'normal' | 'low';
    }
> {
  const product = await db.product.findUnique({ where: { sku } });
  if (!product) return { error: 'product_not_found' };

  const where: Record<string, unknown> = { sku };
  if (warehouse) where.warehouse = warehouse;

  const inv = await db.inventory.findFirst({ where });
  if (!inv) return { error: 'inventory_not_found' };

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

  return {
    sku: inv.sku,
    productName: inv.productName,
    currentStock: inv.quantity,
    safetyStock,
    inTransit: inv.inTransit,
    recommendedOrder,
    urgency,
  };
}

/** Capital occupation analysis — top items by capital, ABC by capital, breakdowns */
export async function getCapitalAnalysis() {
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

  return {
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
  };
}

/** Inventory capital analysis — warehouse breakdown, turnover, slow-moving */
export async function getInventoryCapital(threshold: number) {
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

  return {
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
  };
}
