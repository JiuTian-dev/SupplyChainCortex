/**
 * CRUD Tools: Cost and Sales queries (query_cost, query_sales).
 * Extracted from tools-crud.ts.
 */

import type { MCPTool } from '../tools';
import { summarize } from '../helpers';

import {
  getCostOverview, getCostList, getCostBenchmark,
  getCostOptimization, getCostTrend, getLandedCostDetail,
} from '@/lib/services/cost.service';

import {
  getSalesOverview, getDailySales, getSalesSummaryForSku, generateSalesForecast,
} from '@/lib/services/sales.service';

export const queryCostTool: MCPTool = {
  name: 'query_cost',
  description: '查询成本分解、毛利率、成本趋势、成本基准对比和优化建议。可以查看整体成本概览、单品成本详情、成本趋势、基准对比和优化方案。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '查询类型: overview(概览), list(列表), detail(单品详情), benchmark(基准对比), optimization(优化建议), trend(趋势)',
        enum: ['overview', 'list', 'detail', 'benchmark', 'optimization', 'trend'],
      },
      sku: {
        type: 'string',
        description: '产品SKU，用于详情查询',
      },
      category: {
        type: 'string',
        description: '品类筛选',
      },
      months: {
        type: 'number',
        description: '趋势月数，默认6',
      },
    },
    required: ['action'],
  },
  handler: async (params) => {
    const { action, sku, category, months } = params;
    switch (action) {
      case 'overview':
        return await getCostOverview(category as string | undefined);
      case 'list':
        return summarize(await getCostList({
          category: category as string | undefined,
          page: 1,
          pageSize: 20,
        }));
      case 'detail':
        if (!sku) throw new Error('查询成本详情需要提供 sku 参数');
        return await getLandedCostDetail({ sku: sku as string });
      case 'benchmark':
        return summarize(await getCostBenchmark(category as string | undefined));
      case 'optimization':
        return summarize(await getCostOptimization(category as string | undefined));
      case 'trend':
        return summarize(await getCostTrend(category as string | undefined, (months as number) ?? 6));
      default:
        throw new Error(`未知的成本查询类型: ${action}`);
    }
  },
};

export const querySalesTool: MCPTool = {
  name: 'query_sales',
  description: '查询销售数据、收入、销量、增长率、平台分布和销售预测。可以查看整体销售概览、每日销售、单品销售和销售预测。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '查询类型: overview(概览), daily(每日销售), detail(单品销售), forecast(预测)',
        enum: ['overview', 'daily', 'detail', 'forecast'],
      },
      sku: {
        type: 'string',
        description: '产品SKU，用于单品查询',
      },
      days: {
        type: 'number',
        description: '查询天数，默认30',
      },
      platform: {
        type: 'string',
        description: '平台筛选，如: Amazon, Shopify, eBay, Walmart, Temu',
      },
      category: {
        type: 'string',
        description: '品类筛选',
      },
      horizon: {
        type: 'number',
        description: '预测天数，默认14',
      },
    },
    required: ['action'],
  },
  handler: async (params) => {
    const { action, sku, days, platform, category, horizon } = params;
    switch (action) {
      case 'overview':
        return summarize(await getSalesOverview({
          days: (days as number) ?? 30,
          platform: platform as string | undefined,
          category: category as string | undefined,
        }));
      case 'daily':
        return summarize(await getDailySales({
          days: (days as number) ?? 30,
          platform: platform as string | undefined,
        }));
      case 'detail':
        if (!sku) throw new Error('查询单品销售需要提供 sku 参数');
        return await getSalesSummaryForSku({
          sku: sku as string,
          days: (days as number) ?? 30,
          platform: platform as string | undefined,
        });
      case 'forecast':
        return summarize(await generateSalesForecast(
          (horizon as number) ?? 14,
          category as string | undefined
        ));
      default:
        throw new Error(`未知的销售查询类型: ${action}`);
    }
  },
};

export const queryProcurementTool: MCPTool = {
  name: 'query_procurement',
  description: '查询采购计划与补货订单。支持三种模式：plan(待处理采购计划，按优先级排序)、detail(指定SKU的订单详情)、summary(汇总统计包括总订单数、按优先级/状态分布、预估总成本)。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '查询类型: plan(采购计划), detail(单品详情), summary(汇总统计)',
        enum: ['plan', 'detail', 'summary'],
      },
      sku: {
        type: 'string',
        description: '产品SKU，用于detail模式查询指定SKU的订单历史',
      },
    },
    required: ['action'],
  },
  handler: async (params) => {
    const { action, sku } = params;
    const { db } = await import('@/lib/db');

    switch (action) {
      case 'plan': {
        // All non-delivered orders, sorted by priority then creation date
        const orders = await db.reorderOrder.findMany({
          where: { status: { not: 'delivered' } },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        });

        // Enrich with cost estimates from cost records
        const costRecords = await db.costRecord.findMany();
        const costMap = new Map(costRecords.map(c => [c.sku, c]));

        const items = orders.map(o => {
          const costRec = costMap.get(o.sku);
          return {
            id: o.id,
            sku: o.sku,
            productName: o.productName,
            quantity: o.quantity,
            warehouse: o.warehouse,
            priority: o.priority,
            status: o.status,
            estimatedCost: costRec ? Math.round(costRec.totalLanded * o.quantity * 100) / 100 : null,
            estimatedUnitCost: costRec?.totalLanded ?? null,
            createdAt: o.createdAt,
          };
        });

        return summarize({
          plan: items,
          totalOutstanding: items.length,
          note: '预估成本基于当前成本记录中的到岸成本 × 数量计算',
        });
      }

      case 'detail': {
        if (!sku) throw new Error('查询采购详情需要提供 sku 参数');
        const orders = await db.reorderOrder.findMany({
          where: { sku: sku as string },
          orderBy: { createdAt: 'desc' },
        });

        const costRec = await db.costRecord.findFirst({ where: { sku: sku as string } });

        return summarize({
          sku,
          productName: orders[0]?.productName || costRec?.productName || '未知',
          totalOrders: orders.length,
          currentUnitCost: costRec?.totalLanded ?? null,
          orders: orders.map(o => ({
            id: o.id,
            quantity: o.quantity,
            warehouse: o.warehouse,
            priority: o.priority,
            status: o.status,
            notes: o.notes,
            createdAt: o.createdAt,
            updatedAt: o.updatedAt,
          })),
        });
      }

      case 'summary': {
        const orders = await db.reorderOrder.findMany();

        const byPriority: Record<string, number> = {};
        const byStatus: Record<string, number> = {};
        let totalEstimatedCost = 0;
        let totalQuantity = 0;

        const costRecords = await db.costRecord.findMany();
        const costMap = new Map(costRecords.map(c => [c.sku, c]));

        for (const o of orders) {
          byPriority[o.priority] = (byPriority[o.priority] || 0) + 1;
          byStatus[o.status] = (byStatus[o.status] || 0) + 1;
          totalQuantity += o.quantity;
          if (costMap.has(o.sku)) {
            totalEstimatedCost += costMap.get(o.sku)!.totalLanded * o.quantity;
          }
        }

        return {
          totalOrders: orders.length,
          totalQuantity,
          totalEstimatedCost: Math.round(totalEstimatedCost * 100) / 100,
          currency: 'CNY',
          byPriority: Object.entries(byPriority)
            .map(([priority, count]) => ({ priority, count }))
            .sort((a, b) => b.count - a.count),
          byStatus: Object.entries(byStatus)
            .map(([status, count]) => ({ status, count }))
            .sort((a, b) => b.count - a.count),
          generatedAt: new Date().toISOString(),
        };
      }

      default:
        throw new Error(`未知的采购查询类型: ${action}`);
    }
  },
};
