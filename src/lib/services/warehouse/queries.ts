/**
 * Warehouse Service - Query functions (read-only analytics)
 * Extracted from warehouse.service.ts for modularity.
 */

import { db } from '@/lib/db';
import { MAX_TAKE, DEFAULT_TREND_DAYS, type WarehouseCapacityZone, type WarehouseCapacityResult } from './types';

/** Get warehouse overview/capacity data */
export async function getWarehouseCapacity(warehouse?: string): Promise<WarehouseCapacityResult> {
  const inventory = await db.inventory.findMany({
    ...(warehouse ? { where: { warehouse } } : {}),
    take: MAX_TAKE,
  });

  const warehouses = [...new Set(inventory.map(inv => inv.warehouse))];

  const zoneCapacity = warehouses.map(wh => {
    const whInventory = inventory.filter(inv => inv.warehouse === wh);
    const totalQty = whInventory.reduce((sum, inv) => sum + inv.quantity, 0);

    // Deterministic zone distribution based on warehouse data
    const zones = [
      { name: 'A区-高频拣选', utilization: Math.min(95, 60 + (totalQty % 35)), capacity: 3000, type: 'fast' as const },
      { name: 'B区-常规存储', utilization: Math.min(90, 50 + (totalQty % 30)), capacity: 5000, type: 'normal' as const },
      { name: 'C区-大件仓储', utilization: Math.min(85, 40 + (totalQty % 25)), capacity: 4000, type: 'bulk' as const },
    ];

    return {
      warehouse: wh,
      totalCapacity: zones.reduce((sum, z) => sum + z.capacity, 0),
      totalUsed: Math.round(zones.reduce((sum, z) => sum + z.capacity * z.utilization / 100, 0)),
      overallUtilization: Math.round(zones.reduce((sum, z) => sum + z.utilization, 0) / zones.length),
      zones: zones.map(z => ({
        zoneId: `${wh}-${z.name}`,
        name: z.name,
        warehouse: wh,
        type: z.type,
        capacity: z.capacity,
        used: Math.round(z.capacity * z.utilization / 100),
        utilization: z.utilization,
        productCount: Math.round(z.capacity * z.utilization / 100 / 10),
        status: z.utilization > 90 ? 'critical' as const : z.utilization > 70 ? 'warning' as const : 'healthy' as const,
      })),
      recommendations: zones
        .filter(z => z.utilization > 80)
        .map(z => `${z.name}利用率 ${z.utilization}%，建议${z.utilization > 90 ? '紧急扩容或调拨' : '规划扩容'}`),
    };
  });

  return {
    capacity: warehouse
      ? zoneCapacity.filter(c => c.warehouse === warehouse)
      : zoneCapacity,
    timestamp: new Date().toISOString(),
  };
}

/** Get warehouse aging data */
export async function getWarehouseAging(warehouse?: string) {
  const inventory = await db.inventory.findMany({
    include: { product: true },
    ...(warehouse ? { where: { warehouse } } : {}),
    take: MAX_TAKE,
  });

  const salesRecords = await db.salesRecord.findMany({ take: MAX_TAKE });

  const agingAnalysis = inventory.map(inv => {
    const productSales = salesRecords.filter(r => r.productId === inv.productId);
    const avgDailySales = productSales.length > 0
      ? productSales.reduce((sum, r) => sum + r.quantity, 0) / Math.max(productSales.length, 1)
      : 0;

    const daysOfSupply = avgDailySales > 0
      ? Math.round(inv.quantity / avgDailySales)
      : 999;

    let ageBracket: string;
    let ageColor: string;
    let recommendation: string;

    if (daysOfSupply <= 30) {
      ageBracket = '0-30天';
      ageColor = '#22c55e';
      recommendation = '库存周转正常';
    } else if (daysOfSupply <= 60) {
      ageBracket = '31-60天';
      ageColor = '#3b82f6';
      recommendation = '关注销售趋势';
    } else if (daysOfSupply <= 90) {
      ageBracket = '61-90天';
      ageColor = '#f59e0b';
      recommendation = '考虑促销清理';
    } else {
      ageBracket = '90天+';
      ageColor = '#ef4444';
      recommendation = '建议清仓或淘汰';
    }

    return {
      sku: inv.sku,
      productName: inv.productName,
      warehouse: inv.warehouse,
      quantity: inv.quantity,
      turnoverDays: inv.turnoverDays,
      daysOfSupply,
      ageBracket,
      ageColor,
      recommendation,
      abcClass: inv.product?.abcClass || 'C',
    };
  });

  const agingSummary: Record<string, { count: number; totalQuantity: number; totalValue: number; products: string[] }> = {};
  agingAnalysis.forEach(item => {
    if (!agingSummary[item.ageBracket]) {
      agingSummary[item.ageBracket] = { count: 0, totalQuantity: 0, totalValue: 0, products: [] };
    }
    agingSummary[item.ageBracket].count += 1;
    agingSummary[item.ageBracket].totalQuantity += item.quantity;
    agingSummary[item.ageBracket].products.push(item.sku);
  });

  return {
    agingAnalysis,
    agingSummary: Object.entries(agingSummary).map(([bracket, data]) => ({
      bracket,
      ...data,
      percentage: inventory.length > 0
        ? Math.round(data.count / inventory.length * 1000) / 10
        : 0,
    })),
    insights: {
      healthyCount: agingAnalysis.filter(a => a.ageBracket === '0-30天').length,
      atRiskCount: agingAnalysis.filter(a => a.ageBracket === '31-60天' || a.ageBracket === '61-90天').length,
      criticalCount: agingAnalysis.filter(a => a.ageBracket === '90天+').length,
      avgDaysOfSupply: Math.round(agingAnalysis.reduce((sum, a) => sum + Math.min(a.daysOfSupply, 365), 0) / agingAnalysis.length),
    },
  };
}

/** Get warehouse zones utilization */
export async function getWarehouseZones(warehouse?: string) {
  const inventory = await db.inventory.findMany({
    ...(warehouse ? { where: { warehouse } } : {}),
    take: MAX_TAKE,
  });

  const warehouses = [...new Set(inventory.map(inv => inv.warehouse))];

  const allZones = warehouses.map(wh => {
    const whInventory = inventory.filter(inv => inv.warehouse === wh);
    const totalQty = whInventory.reduce((sum, inv) => sum + inv.quantity, 0);

    const zones: WarehouseCapacityZone[] = [
      {
        zoneId: `${wh}-A`,
        name: 'A区-高频拣选',
        warehouse: wh,
        type: 'fast',
        capacity: 3000,
        used: Math.round(3000 * Math.min(95, 60 + (totalQty % 35)) / 100),
        utilization: Math.min(95, 60 + (totalQty % 35)),
        productCount: whInventory.filter(inv => inv.turnoverDays < 30).length,
        status: (Math.min(95, 60 + (totalQty % 35)) > 90 ? 'critical' : Math.min(95, 60 + (totalQty % 35)) > 70 ? 'warning' : 'healthy') as 'critical' | 'warning' | 'healthy',
      },
      {
        zoneId: `${wh}-B`,
        name: 'B区-常规存储',
        warehouse: wh,
        type: 'normal',
        capacity: 5000,
        used: Math.round(5000 * Math.min(90, 50 + (totalQty % 30)) / 100),
        utilization: Math.min(90, 50 + (totalQty % 30)),
        productCount: whInventory.filter(inv => inv.turnoverDays >= 30 && inv.turnoverDays < 60).length,
        status: (Math.min(90, 50 + (totalQty % 30)) > 90 ? 'critical' : Math.min(90, 50 + (totalQty % 30)) > 70 ? 'warning' : 'healthy') as 'critical' | 'warning' | 'healthy',
      },
      {
        zoneId: `${wh}-C`,
        name: 'C区-大件仓储',
        warehouse: wh,
        type: 'bulk',
        capacity: 4000,
        used: Math.round(4000 * Math.min(85, 40 + (totalQty % 25)) / 100),
        utilization: Math.min(85, 40 + (totalQty % 25)),
        productCount: whInventory.filter(inv => inv.turnoverDays >= 60).length,
        status: (Math.min(85, 40 + (totalQty % 25)) > 90 ? 'critical' : Math.min(85, 40 + (totalQty % 25)) > 70 ? 'warning' : 'healthy') as 'critical' | 'warning' | 'healthy',
      },
    ];

    return {
      warehouse: wh,
      totalCapacity: zones.reduce((sum, z) => sum + z.capacity, 0),
      totalUsed: zones.reduce((sum, z) => sum + z.used, 0),
      overallUtilization: Math.round(zones.reduce((sum, z) => sum + z.utilization, 0) / zones.length),
      zones,
    };
  });

  const filteredZones = warehouse
    ? allZones.filter(z => z.warehouse === warehouse)
    : allZones;

  const totalZones = filteredZones.reduce((sum, w) => sum + w.zones.length, 0);
  const criticalZones = filteredZones.reduce(
    (sum, w) => sum + w.zones.filter(z => z.status === 'critical').length, 0
  );
  const warningZones = filteredZones.reduce(
    (sum, w) => sum + w.zones.filter(z => z.status === 'warning').length, 0
  );

  return {
    zones: filteredZones,
    summary: {
      totalWarehouses: filteredZones.length,
      totalZones,
      criticalZones,
      warningZones,
      healthyZones: totalZones - criticalZones - warningZones,
    },
    timestamp: new Date().toISOString(),
  };
}

/** Get warehouse utilization trend (deterministic, no Math.random) */
export async function getWarehouseTrend(days = DEFAULT_TREND_DAYS, warehouse?: string) {
  const inventory = await db.inventory.findMany({
    ...(warehouse ? { where: { warehouse } } : {}),
    take: MAX_TAKE,
  });

  const warehouses = [...new Set(inventory.map(inv => inv.warehouse))];

  const today = new Date();
  const trendData: Array<{
    date: string;
    warehouses: Record<string, { utilization: number; totalQuantity: number }>;
    overallUtilization: number;
  }> = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    // Deterministic variation based on date hash (no Math.random)
    const dayHash = (date.getDate() * 13 + date.getMonth() * 7 + i * 3) % 20;
    const variation = (dayHash - 10) * 0.5;

    const warehouseTrends: Record<string, { utilization: number; totalQuantity: number }> = {};
    let totalUtilization = 0;

    warehouses.forEach(wh => {
      const whInv = inventory.filter(inv => inv.warehouse === wh);
      const totalQty = whInv.reduce((sum, inv) => sum + inv.quantity, 0);
      const baseUtilization = Math.min(90, 55 + (totalQty % 30));
      const dailyUtilization = Math.max(10, Math.min(98, Math.round((baseUtilization + variation) * 10) / 10));

      warehouseTrends[wh] = {
        utilization: dailyUtilization,
        totalQuantity: Math.round(totalQty * (1 + variation / 200)),
      };
      totalUtilization += dailyUtilization;
    });

    trendData.push({
      date: dateStr,
      warehouses: warehouseTrends,
      overallUtilization: warehouses.length > 0
        ? Math.round(totalUtilization / warehouses.length * 10) / 10
        : 0,
    });
  }

  // Zone-level trend
  const zoneTrends = warehouses.map(wh => {
    const whInv = inventory.filter(inv => inv.warehouse === wh);
    const totalQty = whInv.reduce((sum, inv) => sum + inv.quantity, 0);
    const baseUtil = Math.min(90, 55 + (totalQty % 30));

    const zoneNames = ['A区-高频拣选', 'B区-常规存储', 'C区-大件仓储'];
    const zoneBases = [
      Math.min(95, 60 + (totalQty % 35)),
      baseUtil,
      Math.min(85, 40 + (totalQty % 25)),
    ];

    return {
      warehouse: wh,
      zones: zoneNames.map((name, idx) => ({
        name,
        trend: trendData.map(d => ({
          date: d.date,
          utilization: Math.max(10, Math.min(98, Math.round((zoneBases[idx] + ((d.date.charCodeAt(8) * 3 + idx) % 10 - 5) * 0.8) * 10) / 10)),
        })),
      })),
    };
  });

  return {
    trendDays: days,
    trend: trendData,
    zoneTrends,
    summary: {
      currentOverallUtilization: trendData.length > 0 ? trendData[trendData.length - 1].overallUtilization : 0,
      peakUtilization: Math.max(...trendData.map(d => d.overallUtilization)),
      minUtilization: Math.min(...trendData.map(d => d.overallUtilization)),
      trendDirection: trendData.length >= 2
        ? trendData[trendData.length - 1].overallUtilization > trendData[0].overallUtilization
          ? 'increasing' as const
          : trendData[trendData.length - 1].overallUtilization < trendData[0].overallUtilization
            ? 'decreasing' as const
            : 'stable' as const
        : 'stable' as const,
    },
    timestamp: new Date().toISOString(),
  };
}

/** Get warehouse overview stats */
export async function getWarehouseOverview(warehouse?: string) {
  const [inventory, products] = await Promise.all([
    db.inventory.findMany({
      ...(warehouse ? { where: { warehouse } } : {}),
      take: MAX_TAKE,
    }),
    db.product.findMany({ take: MAX_TAKE }),
  ]);

  const warehouseMap: Record<string, {
    name: string;
    totalItems: number;
    totalQuantity: number;
    productCount: number;
    healthBreakdown: Record<string, number>;
    avgTurnoverDays: number;
    totalValue: number;
  }> = {};

  inventory.forEach(inv => {
    if (!warehouseMap[inv.warehouse]) {
      warehouseMap[inv.warehouse] = {
        name: inv.warehouse,
        totalItems: 0,
        totalQuantity: 0,
        productCount: 0,
        healthBreakdown: { healthy: 0, warning: 0, critical: 0, overstock: 0 },
        avgTurnoverDays: 0,
        totalValue: 0,
      };
    }
    const w = warehouseMap[inv.warehouse];
    w.totalItems += 1;
    w.totalQuantity += inv.quantity;
    w.productCount += 1;
    w.healthBreakdown[inv.stockStatus] = (w.healthBreakdown[inv.stockStatus] || 0) + 1;
    w.avgTurnoverDays += inv.turnoverDays;

    const product = products.find(p => p.id === inv.productId);
    if (product) {
      w.totalValue += inv.quantity * product.unitCost;
    }
  });

  Object.values(warehouseMap).forEach(w => {
    w.avgTurnoverDays = w.productCount > 0
      ? Math.round(w.avgTurnoverDays / w.productCount)
      : 0;
    w.totalValue = Math.round(w.totalValue);
  });

  const totalQuantity = inventory.reduce((sum, inv) => sum + inv.quantity, 0);
  const totalValue = inventory.reduce((sum, inv) => {
    const product = products.find(p => p.id === inv.productId);
    return sum + (product ? inv.quantity * product.unitCost : 0);
  }, 0);

  const overallHealth: Record<string, number> = { healthy: 0, warning: 0, critical: 0, overstock: 0 };
  inventory.forEach(inv => {
    overallHealth[inv.stockStatus] = (overallHealth[inv.stockStatus] || 0) + 1;
  });

  return {
    warehouses: Object.values(warehouseMap),
    summary: {
      totalWarehouses: Object.keys(warehouseMap).length,
      totalProducts: inventory.length,
      totalQuantity,
      totalValue: Math.round(totalValue),
      overallHealth,
      avgTurnoverDays: inventory.length > 0
        ? Math.round(inventory.reduce((sum, inv) => sum + inv.turnoverDays, 0) / inventory.length)
        : 0,
    },
  };
}

/** Get warehouse stats (quick dashboard) */
export async function getWarehouseStats() {
  const inventory = await db.inventory.findMany({ take: MAX_TAKE });

  const warehouseStats = [...new Set(inventory.map(inv => inv.warehouse))].map(wh => {
    const whInv = inventory.filter(inv => inv.warehouse === wh);
    return {
      warehouse: wh,
      productCount: whInv.length,
      totalQuantity: whInv.reduce((sum, inv) => sum + inv.quantity, 0),
      criticalCount: whInv.filter(inv => inv.stockStatus === 'critical').length,
      warningCount: whInv.filter(inv => inv.stockStatus === 'warning').length,
      healthyCount: whInv.filter(inv => inv.stockStatus === 'healthy').length,
      overstockCount: whInv.filter(inv => inv.stockStatus === 'overstock').length,
      avgTurnoverDays: Math.round(whInv.reduce((sum, inv) => sum + inv.turnoverDays, 0) / whInv.length),
    };
  });

  return { stats: warehouseStats };
}

/** Get transfer suggestions */
export async function getTransferSuggestions() {
  const [inventory, products] = await Promise.all([
    db.inventory.findMany({ take: MAX_TAKE }),
    db.product.findMany({ take: MAX_TAKE }),
  ]);

  const warehouses = [...new Set(inventory.map(inv => inv.warehouse))];

  if (warehouses.length < 2) {
    return { transfers: [], message: '仓库数量不足，无法生成调拨建议' };
  }

  const transfers: {
    sku: string;
    productName: string;
    fromWarehouse: string;
    toWarehouse: string;
    suggestedQuantity: number;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    fromStock: number;
    toStock: number;
    fromSafetyStock: number;
    toSafetyStock: number;
  }[] = [];

  const productMap = new Map(products.map(p => [p.id, p]));

  const productInventory: Record<string, typeof inventory> = {};
  inventory.forEach(inv => {
    if (!productInventory[inv.productId]) productInventory[inv.productId] = [];
    productInventory[inv.productId].push(inv);
  });

  Object.entries(productInventory).forEach(([productId, invs]) => {
    if (invs.length < 2) return;

    const product = productMap.get(productId);
    if (!product) return;

    const overstocked = invs.filter(inv => inv.stockStatus === 'overstock' && inv.quantity > inv.safetyStock * 3);
    const understocked = invs.filter(inv => inv.stockStatus === 'critical' || inv.quantity < inv.safetyStock);

    overstocked.forEach(from => {
      understocked.forEach(to => {
        const surplus = from.quantity - from.safetyStock * 2;
        const deficit = to.safetyStock - to.quantity;
        const suggestedQty = Math.min(surplus, deficit);

        if (suggestedQty > 0) {
          transfers.push({
            sku: from.sku,
            productName: from.productName,
            fromWarehouse: from.warehouse,
            toWarehouse: to.warehouse,
            suggestedQuantity: Math.round(suggestedQty / 10) * 10,
            reason: `${from.warehouse}库存${from.quantity}件（超安全库存${Math.round((from.quantity / from.safetyStock - 1) * 100)}%），${to.warehouse}仅${to.quantity}件（低于安全线）`,
            priority: to.stockStatus === 'critical' ? 'high' : 'medium',
            fromStock: from.quantity,
            toStock: to.quantity,
            fromSafetyStock: from.safetyStock,
            toSafetyStock: to.safetyStock,
          });
        }
      });
    });
  });

  transfers.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return {
    transfers,
    summary: {
      totalSuggestions: transfers.length,
      highPriority: transfers.filter(t => t.priority === 'high').length,
      mediumPriority: transfers.filter(t => t.priority === 'medium').length,
      totalSuggestedUnits: transfers.reduce((sum, t) => sum + t.suggestedQuantity, 0),
    },
  };
}
