/**
 * Inventory Service - Query methods
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { serverCache } from '@/lib/cache';
import { createAuditLog } from '@/lib/services/audit.service';
import type { NextRequest } from 'next/server';
import { computeStockStatus } from './types';
import type { InventoryOverview, InventoryListFilters, StockStatus } from './types';

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

/** Get inventory health summary (no SKU) — DB-level groupBy for efficiency */
export async function getInventoryHealthSummary() {
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
  return {
    critical: criticalItems.map(i => ({ sku: i.sku, productName: i.productName, quantity: i.quantity, safetyStock: i.safetyStock })),
    warning: warningItems.map(i => ({ sku: i.sku, productName: i.productName, quantity: i.quantity, safetyStock: i.safetyStock })),
    healthyRate: totalSkus > 0 ? Math.round((healthyCount / totalSkus) * 100) : 100,
    totalSkus,
  };
}

/** Bulk update inventory records — returns per-record results + summary */
export async function bulkUpdateInventory(updates: Array<{
  id?: string;
  sku?: string;
  stockStatus?: string;
  quantity?: number;
  safetyStock?: number;
  reorderPoint?: number;
  warehouse?: string;
}>) {
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
    } catch {
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

  return {
    success: failureCount === 0,
    results,
    summary: {
      total: results.length,
      succeeded: successCount,
      failed: failureCount,
    },
  };
}

/** Adjust inventory (inbound/outbound) — updates stock, creates event + audit log */
export async function adjustInventory(params: {
  sku: string;
  quantity: number;
  reason: string;
  warehouse?: string;
  request: NextRequest;
}) {
  const { sku, quantity, reason, warehouse, request } = params;

  // Find the inventory record
  const where: Record<string, unknown> = { sku };
  if (warehouse) where.warehouse = warehouse;

  const inventory = await db.inventory.findFirst({ where });
  if (!inventory) {
    return {
      notFound: true as const,
      message: `未找到 SKU: ${sku}${warehouse ? ` 在仓库 ${warehouse}` : ""} 的库存记录`,
    };
  }

  // Calculate new quantity
  const newQuantity = inventory.quantity + quantity;

  if (newQuantity < 0) {
    return {
      validationError: true as const,
      message: `调整后库存不能为负数。当前库存: ${inventory.quantity}，调整量: ${quantity > 0 ? "+" : ""}${quantity}`,
    };
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

  return {
    success: true as const,
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
  };
}
