/**
 * CRUD Tools: Inventory queries (query_inventory).
 * Extracted from tools-crud.ts.
 */

import type { MCPTool } from '../tools';
import { summarize } from '../helpers';

import {
  getInventoryOverview, getInventoryList, getInventoryForecast,
  getStockoutRiskAnalysis, getInventoryHealth, getSlowMovingItems,
  getReorderRecommendations,
  type InventoryListFilters,
} from '@/lib/services/inventory.service';

export const queryInventoryTool: MCPTool = {
  name: 'query_inventory',
  description: '查询库存状态、库存水平、安全库存、库存分布。可以查看整体库存概览、按仓库筛选、查看库存详情、获取预测和缺货风险分析。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '查询类型: overview(概览), list(列表), forecast(预测), risk(缺货风险), detail(单品详情), slow_moving(滞销品), reorder(补货建议)',
        enum: ['overview', 'list', 'forecast', 'risk', 'detail', 'slow_moving', 'reorder'],
      },
      warehouse: {
        type: 'string',
        description: '仓库名称筛选，如: 深圳仓, 义乌仓',
      },
      sku: {
        type: 'string',
        description: '产品SKU，用于详情查询，如: KA-RC4001',
      },
      category: {
        type: 'string',
        description: '品类筛选，如: 厨房电器, 清洁电器, 个人护理',
      },
      days: {
        type: 'number',
        description: '滞销品阈值天数，默认90',
      },
      forecastDays: {
        type: 'number',
        description: '预测天数，默认14',
      },
    },
    required: ['action'],
  },
  handler: async (params) => {
    const { action, warehouse, sku, category, days, forecastDays } = params;
    switch (action) {
      case 'overview':
        return summarize(await getInventoryOverview(warehouse as string | undefined));
      case 'list':
        return summarize(await getInventoryList({
          warehouse: warehouse as string | undefined,
          category: category as string | undefined,
          page: 1,
          pageSize: 20,
        } as InventoryListFilters));
      case 'forecast':
        return summarize(await getInventoryForecast(
          (forecastDays as number) ?? 14,
          warehouse as string | undefined
        ));
      case 'risk':
        return summarize(await getStockoutRiskAnalysis(warehouse as string | undefined));
      case 'detail':
        if (!sku) throw new Error('查询库存详情需要提供 sku 参数');
        return await getInventoryHealth(sku as string, warehouse as string | undefined);
      case 'slow_moving':
        return summarize(await getSlowMovingItems(
          (days as number) ?? 90,
          warehouse as string | undefined,
          category as string | undefined
        ));
      case 'reorder':
        return summarize(await getReorderRecommendations());
      default:
        throw new Error(`未知的库存查询类型: ${action}`);
    }
  },
};

export const queryWarehouseCapacityTool: MCPTool = {
  name: 'query_warehouse_capacity',
  description: 'Query warehouse capacity and utilization across all warehouses. Groups inventory by warehouse and computes total quantity, SKU count, and stock health.',
  parameters: {
    type: 'object',
    properties: {
      warehouse: {
        type: 'string',
        description: '仓库名称（可选），如: 深圳仓, 义乌仓。不传则返回所有仓库',
      },
    },
    required: [],
  },
  handler: async (params) => {
    const { warehouse } = params;
    const { db } = await import('@/lib/db');

    const where = warehouse ? { warehouse: warehouse as string } : {};
    const inventory = await db.inventory.findMany({ where });

    // Group by warehouse
    const warehouseMap: Record<string, {
      totalQuantity: number;
      skuCount: number;
      statusBreakdown: Record<string, number>;
    }> = {};

    for (const inv of inventory) {
      if (!warehouseMap[inv.warehouse]) {
        warehouseMap[inv.warehouse] = {
          totalQuantity: 0,
          skuCount: 0,
          statusBreakdown: {},
        };
      }
      warehouseMap[inv.warehouse].totalQuantity += inv.quantity;
      warehouseMap[inv.warehouse].skuCount += 1;
      const status = inv.stockStatus;
      warehouseMap[inv.warehouse].statusBreakdown[status] =
        (warehouseMap[inv.warehouse].statusBreakdown[status] || 0) + 1;
    }

    const allQtys = Object.values(warehouseMap).map(w => w.totalQuantity);
    const totalInventory = allQtys.reduce((s, q) => s + q, 0);

    const warehouses = Object.entries(warehouseMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, data]) => ({
        name,
        totalQuantity: data.totalQuantity,
        skuCount: data.skuCount,
        shareOfTotal: totalInventory > 0 ? Math.round((data.totalQuantity / totalInventory) * 100) : 0,
        statusBreakdown: data.statusBreakdown,
      }));

    return {
      warehouses,
      summary: {
        totalWarehouses: warehouses.length,
        totalQuantity: allQtys.reduce((s, q) => s + q, 0),
        note: 'shareOfTotal = 该仓库库存占全部库存的百分比，非物理容量利用率',
      },
      generatedAt: new Date().toISOString(),
    };
  },
};
