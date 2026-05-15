/**
 * Inventory Service - Business logic for inventory operations
 * Extracted from API routes for reusability and testability
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL, serverCache } from '@/lib/cache';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type StockStatus = 'healthy' | 'warning' | 'critical' | 'overstock';

export interface InventoryOverview {
  totalItems: number;
  totalQuantity: number;
  byStatus: Record<StockStatus, number>;
  lowStockAlerts: number;
  avgTurnoverDays: number;
  avgTurnoverRate: number;
}

export interface InventoryForecastItem {
  sku: string;
  productName: string;
  category?: string;
  currentStock: number;
  safetyStock: number;
  reorderPoint: number;
  dailyVelocity: number;
  forecastDays: number;
  projectedStock: number;
  daysUntilReorder: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface StockoutRiskItem {
  sku: string;
  productName: string;
  category?: string;
  currentStock: number;
  inTransit: number;
  availableStock: number;
  safetyStock: number;
  stockStatus: string;
  belowSafetyStock: boolean;
  dailyVelocity: number;
  risks: Array<{
    period: number;
    projectedConsumption: number;
    remainingStock: number;
    riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  }>;
  overallRisk: 'safe' | 'low' | 'medium' | 'high' | 'critical';
}

// ─── Core Business Logic ───────────────────────────────────────────────────────

/** Compute stock status based on quantity vs safety stock ratios */
export function computeStockStatus(quantity: number, safetyStock: number): StockStatus {
  if (quantity <= safetyStock * 0.5) return 'critical';
  if (quantity <= safetyStock) return 'warning';
  if (quantity >= safetyStock * 3) return 'overstock';
  return 'healthy';
}

/** Compute inventory overview stats from database */
export async function getInventoryOverview(warehouse?: string): Promise<InventoryOverview> {
  return cachedFetch(
    cacheKey('inventory', 'overview', warehouse || 'all'),
    async () => {
      const where = warehouse ? { warehouse } : {};
      const inventory = await db.inventory.findMany({ where, take: 5000 });

      const totalItems = inventory.length;
      const totalQuantity = inventory.reduce((sum, inv) => sum + inv.quantity, 0);

      const byStatus: Record<StockStatus, number> = {
        healthy: 0, warning: 0, critical: 0, overstock: 0,
      };
      inventory.forEach(inv => {
        byStatus[inv.stockStatus as StockStatus] = (byStatus[inv.stockStatus as StockStatus] || 0) + 1;
      });

      const lowStockAlerts = inventory.filter(
        inv => inv.stockStatus === 'critical' || inv.stockStatus === 'warning'
      ).length;

      const avgTurnoverDays = totalItems > 0
        ? Math.round(inventory.reduce((sum, inv) => sum + inv.turnoverDays, 0) / totalItems)
        : 0;

      const avgTurnoverRate = totalItems > 0
        ? Math.round((inventory.reduce((sum, inv) => sum + inv.turnoverRate, 0) / totalItems) * 100) / 100
        : 0;

      return { totalItems, totalQuantity, byStatus, lowStockAlerts, avgTurnoverDays, avgTurnoverRate };
    },
    CACHE_TTL.MEDIUM
  );
}

/** Compute safety stock using Z-score method */
export function computeSafetyStock(
  salesRecords: { quantity: number }[],
  serviceLevel = 0.95,
  leadTimeDays = 14
): number {
  if (salesRecords.length === 0) return 0;

  const dailyQuantities = salesRecords.map(r => r.quantity);
  const mean = dailyQuantities.reduce((a, b) => a + b, 0) / dailyQuantities.length;
  const variance = dailyQuantities.reduce((sum, q) => sum + Math.pow(q - mean, 2), 0) / dailyQuantities.length;
  const stdDev = Math.sqrt(variance);

  const zScores: Record<number, number> = { 0.9: 1.28, 0.95: 1.65, 0.98: 2.05, 0.99: 2.33 };
  const z = zScores[serviceLevel] || 1.65;

  return Math.round(z * stdDev * Math.sqrt(leadTimeDays));
}

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

/** Inventory list filters */
export interface InventoryListFilters {
  warehouse?: string;
  category?: string;
  skus?: string[];  // comma-separated SKU list for multi-select filtering
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/** Get paginated/filtered inventory list with distribution */
export async function getInventoryList(filters: InventoryListFilters = {}) {
  const { warehouse, category, skus, sortBy, sortOrder = 'asc', page = 1, pageSize = 20 } = filters;

  return cachedFetch(
    cacheKey('inventory', 'list', warehouse || 'all', category || 'all', sortBy || 'none', sortOrder, page, pageSize, skus?.join(',') || 'all'),
    async () => {
      const where: Record<string, unknown> = {};
      if (warehouse) where.warehouse = warehouse;
      if (category) where.product = { category };
      if (skus && skus.length > 0) where.sku = { in: skus };

      const [inventory, distribution] = await Promise.all([
        db.inventory.findMany({ where, include: { product: true }, take: 1000 }),
        db.inventory.findMany({ where: warehouse ? { warehouse } : {}, take: 1000 }),
      ]);

      // Compute distribution
      const statusMap: Record<string, { label: string; color: string }> = {
        healthy: { label: '健康', color: '#22c55e' },
        warning: { label: '预警', color: '#f59e0b' },
        critical: { label: '紧急', color: '#ef4444' },
        overstock: { label: '积压', color: '#8b5cf6' },
      };
      const statusCounts: Record<string, number> = {};
      distribution.forEach(inv => {
        statusCounts[inv.stockStatus] = (statusCounts[inv.stockStatus] || 0) + 1;
      });
      const inventoryDistribution = Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
        label: statusMap[status]?.label || status,
        color: statusMap[status]?.color || '#999',
      }));

      // Format inventory
      let formattedInventory = inventory.map(inv => ({
        id: inv.id,
        productId: inv.productId,
        sku: inv.sku,
        productName: inv.productName,
        warehouse: inv.warehouse,
        quantity: inv.quantity,
        safetyStock: inv.safetyStock,
        reorderPoint: inv.reorderPoint,
        inTransit: inv.inTransit,
        turnoverRate: inv.turnoverRate,
        turnoverDays: inv.turnoverDays,
        stockStatus: inv.stockStatus,
        lastSyncAt: inv.lastSyncAt.toISOString(),
        abcClass: inv.product?.abcClass,
        fsnClass: inv.product?.fsnClass,
        category: inv.product?.category,
      }));

      // Apply sorting
      const validSortFields = ['quantity', 'turnoverDays', 'safetyStock', 'turnoverRate', 'stockStatus'];
      if (sortBy && validSortFields.includes(sortBy)) {
        formattedInventory = formattedInventory.sort((a, b) => {
          const aVal = a[sortBy as keyof typeof a];
          const bVal = b[sortBy as keyof typeof b];
          if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
          }
          if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
          }
          return 0;
        });
      }

      // Apply pagination
      const total = formattedInventory.length;
      const totalPages = Math.ceil(total / pageSize) || 1;
      const start = (page - 1) * pageSize;
      const paginatedData = formattedInventory.slice(start, start + pageSize);

      return {
        inventory: paginatedData,
        distribution: inventoryDistribution,
        pagination: { page, pageSize, total, totalPages },
        filters: { warehouse: warehouse || null, category: category || null, sortBy: sortBy || null, sortOrder },
      };
    },
    CACHE_TTL.MEDIUM
  );
}

/** Get inventory health for a specific SKU */
export async function getInventoryHealth(sku: string, warehouse?: string) {
  const where: Record<string, unknown> = { sku };
  if (warehouse) where.warehouse = warehouse;

  const inv = await db.inventory.findFirst({
    where,
    include: { product: true },
  });
  if (!inv || !inv.product) return null;

  return {
    sku: inv.sku,
    productName: inv.productName,
    warehouse: inv.warehouse,
    quantity: inv.quantity,
    safetyStock: inv.safetyStock,
    reorderPoint: inv.reorderPoint,
    inTransit: inv.inTransit,
    turnoverRate: inv.turnoverRate,
    turnoverDays: inv.turnoverDays,
    stockStatus: inv.stockStatus,
    abcClass: inv.product.abcClass,
    fsnClass: inv.product.fsnClass,
    category: inv.product.category,
  };
}

/** Get slow-moving inventory items */
export async function getSlowMovingItems(days: number, warehouse?: string, category?: string) {
  const where: Record<string, unknown> = { turnoverDays: { gt: days } };
  if (warehouse) where.warehouse = warehouse;
  if (category) where.product = { category };

  const slowItems = await db.inventory.findMany({
    where,
    include: { product: true },
    take: 1000,
  });

  return {
    threshold: days,
    count: slowItems.length,
    items: slowItems.map(inv => ({
      sku: inv.sku,
      productName: inv.productName,
      turnoverDays: inv.turnoverDays,
      quantity: inv.quantity,
      category: inv.product?.category,
      recommendation:
        inv.turnoverDays > 180
          ? '建议清仓促销或淘汰'
          : inv.turnoverDays > 120
            ? '建议减少采购量，评估是否继续销售'
            : '关注趋势，适度减少库存',
    })),
    filters: { warehouse: warehouse || null, category: category || null },
  };
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
  const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];

  const allRecentSales = await db.salesRecord.findMany({
    where: {
      productId: { in: productIds },
      date: { gte: cutoffDate },
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

    const recommendedQty = Math.max(0, Math.round(
      dailyVelocity * (leadTimeDays + safetyDays) - inv.quantity
    ));

    const unitCost = inv.product?.cost?.totalLanded || inv.product?.unitCost || 0;
    const estimatedCost = Math.round(recommendedQty * unitCost * 100) / 100;

    let priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
    if (daysRemaining < 7) priority = 'URGENT';
    else if (daysRemaining < 14) priority = 'HIGH';
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

/** Get inventory alert timeline */
export async function getAlertTimeline(limit = 50, typeFilter?: string, severityFilter?: string) {
  const eventWhere: Record<string, unknown> = {};
  if (typeFilter) {
    const typeMapping: Record<string, { types?: string[]; severities?: string[] }> = {
      critical: { types: ['库存预警', '库存调整'], severities: ['critical'] },
      warning: { types: ['库存预警'], severities: ['warning'] },
      adjustment: { types: ['库存调整'] },
      restocked: { types: ['补货订单', '库存调整'], severities: ['info'] },
      transfer: { types: ['库存调拨'] },
    };
    const mapping = typeMapping[typeFilter];
    if (mapping) {
      if (mapping.types) eventWhere.type = { in: mapping.types };
      if (mapping.severities) eventWhere.severity = { in: mapping.severities };
    }
  }
  if (severityFilter) {
    eventWhere.severity = severityFilter;
  }

  const supplyChainEvents = await db.supplyChainEvent.findMany({
    where: eventWhere,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const inventoryRecords = await db.inventory.findMany({
    include: { product: true },
    take: 1000,
  });

  const timelineEvents = supplyChainEvents.map((evt) => {
    let eventType: 'critical' | 'warning' | 'adjustment' | 'restocked' | 'transfer';
    if (evt.severity === 'critical' && (evt.type === '库存预警' || evt.description?.includes('安全库存'))) {
      eventType = 'critical';
    } else if (evt.severity === 'warning' && evt.type === '库存预警') {
      eventType = 'warning';
    } else if (evt.type === '库存调整') {
      eventType = evt.description?.includes('入库') ? 'restocked' : 'adjustment';
    } else if (evt.type === '补货订单') {
      eventType = 'restocked';
    } else if (evt.type === '库存调拨') {
      eventType = 'transfer';
    } else if (evt.severity === 'critical') {
      eventType = 'critical';
    } else if (evt.severity === 'warning') {
      eventType = 'warning';
    } else {
      eventType = 'adjustment';
    }

    let quantityBefore: number | null = null;
    let quantityAfter: number | null = null;
    const changeMatch = evt.description?.match(/从\s*(\d+)\s*变为\s*(\d+)/);
    if (changeMatch) {
      quantityBefore = parseInt(changeMatch[1]);
      quantityAfter = parseInt(changeMatch[2]);
    }

    const relatedInv = evt.sku
      ? inventoryRecords.find((inv) => inv.sku === evt.sku)
      : null;

    return {
      id: evt.id,
      eventType,
      title: evt.title,
      description: evt.description,
      timestamp: evt.createdAt.toISOString(),
      sku: evt.sku || null,
      productName: relatedInv?.productName || evt.title?.replace(/^[^:：]+[：:]\s*/, '') || null,
      warehouse: relatedInv?.warehouse || null,
      quantityBefore,
      quantityAfter,
      stockStatus: relatedInv?.stockStatus || null,
      icon: evt.icon,
      color: evt.color,
      severity: evt.severity,
      source: evt.type,
    };
  });

  const realtimeAlerts = inventoryRecords
    .filter((inv) => inv.stockStatus === 'critical' || inv.stockStatus === 'warning')
    .map((inv) => {
      const eventType = inv.stockStatus === 'critical' ? 'critical' as const : 'warning' as const;
      const isBelowSafety = inv.quantity < inv.safetyStock;
      return {
        id: `realtime-${inv.id}`,
        eventType,
        title: inv.stockStatus === 'critical'
          ? `库存紧急: ${inv.productName}`
          : `库存预警: ${inv.productName}`,
        description: isBelowSafety
          ? `${inv.productName} 当前库存 ${inv.quantity} 低于安全库存 ${inv.safetyStock}，请立即补货`
          : `${inv.productName} 当前库存 ${inv.quantity} 接近补货点 ${inv.reorderPoint}`,
        timestamp: inv.lastSyncAt.toISOString(),
        sku: inv.sku,
        productName: inv.productName,
        warehouse: inv.warehouse,
        quantityBefore: null,
        quantityAfter: inv.quantity,
        stockStatus: inv.stockStatus,
        icon: inv.stockStatus === 'critical' ? '🔴' : '🟡',
        color: inv.stockStatus === 'critical' ? '#ef4444' : '#f59e0b',
        severity: inv.stockStatus === 'critical' ? 'critical' : 'warning',
        source: '实时监控',
      };
    });

  const allEvents = [...realtimeAlerts, ...timelineEvents]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);

  const filteredEvents = typeFilter
    ? allEvents.filter((e) => e.eventType === typeFilter)
    : allEvents;

  const summary = {
    critical: allEvents.filter((e) => e.eventType === 'critical').length,
    warning: allEvents.filter((e) => e.eventType === 'warning').length,
    adjustment: allEvents.filter((e) => e.eventType === 'adjustment').length,
    restocked: allEvents.filter((e) => e.eventType === 'restocked').length,
    transfer: allEvents.filter((e) => e.eventType === 'transfer').length,
    total: allEvents.length,
  };

  return {
    events: filteredEvents,
    summary,
    filters: { type: typeFilter || null, severity: severityFilter || null, limit },
  };
}
