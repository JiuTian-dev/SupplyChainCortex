/**
 * CRUD Query Tools — inventory, cost, sales, logistics, suppliers, dashboard, risk.
 * New tools added in v2.0: query_supplier_trend, query_procurement, query_warehouse_capacity, query_supplier_location
 */

import type { MCPTool } from './tools';
import { summarize } from './helpers';

import {
  getInventoryOverview, getInventoryList, getInventoryForecast,
  getStockoutRiskAnalysis, getInventoryHealth, getSlowMovingItems,
  getReorderRecommendations, computeStockStatus,
  type InventoryListFilters,
} from '@/lib/services/inventory.service';

import {
  getCostOverview, getCostList, getCostBenchmark,
  getCostOptimization, getCostTrend, getLandedCostDetail,
} from '@/lib/services/cost.service';

import {
  getSalesOverview, getDailySales, getSalesSummaryForSku, generateSalesForecast,
} from '@/lib/services/sales.service';

import {
  getShipmentList, getShipmentStats, getShipmentByTracking, updateShipmentStatus,
  type ShipmentStatusUpdate,
} from '@/lib/services/logistics.service';

import { getSuppliersList, getSupplierPerformance } from '@/lib/services/suppliers.service';

// ─── Region-based supplier-shipment matching ─────────────────────────
// Maps supplier region keywords to shipment origin keywords.
// Used by query_supplier_trend to correlate shipments with suppliers.
const SUPPLIER_REGION_MATCH: Record<string, string[]> = {
  '华东': ['上海', '义乌', '宁波', '杭州', '苏州', '南京', '合肥'],
  '华南': ['深圳', '东莞', '佛山', '广州', '珠海', '中山'],
  '华北': ['北京', '天津', '青岛', '大连', '石家庄'],
  '华中': ['武汉', '郑州', '长沙', '南昌'],
};

import {
  getDashboardMetrics, getDashboardSummary, getInventoryDistribution,
  getSalesTrend, getCriticalAlerts,
} from '@/lib/queries/dashboard.queries';

import {
  getRiskDashboard, getRiskMatrix, getRiskMitigations, getRiskAlerts,
} from '@/lib/services/risk.service';

// ─── Tool Definitions ───────────────────────────────────────────────────────────

export const crudTools: MCPTool[] = [

  // ─── 1. query_inventory ───────────────────────────────────────────────────
  {
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
  },

  // ─── 2. query_cost ────────────────────────────────────────────────────────
  {
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
  },

  // ─── 3. query_sales ───────────────────────────────────────────────────────
  {
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
  },

  // ─── 4. query_logistics ───────────────────────────────────────────────────
  {
    name: 'query_logistics',
    description: '查询物流货运状态、跟踪信息、物流统计和风险。可以查看货运列表、货运统计、单号追踪和物流风险。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '查询类型: list(货运列表), stats(统计), track(单号追踪), risks(物流风险)',
          enum: ['list', 'stats', 'track', 'risks'],
        },
        trackingNumber: {
          type: 'string',
          description: '货运追踪号，用于单号追踪',
        },
        status: {
          type: 'string',
          description: '状态筛选: pending, in_transit, customs, delivered, delayed, exception',
          enum: ['pending', 'in_transit', 'customs', 'delivered', 'delayed', 'exception'],
        },
        carrier: {
          type: 'string',
          description: '承运商筛选',
        },
      },
      required: ['action'],
    },
    handler: async (params) => {
      const { action, trackingNumber, status, carrier } = params;
      switch (action) {
        case 'list':
          return summarize(await getShipmentList({
            status: status as string | undefined,
            carrier: carrier as string | undefined,
          }));
        case 'stats':
          return await getShipmentStats();
        case 'track':
          if (!trackingNumber) throw new Error('追踪货运需要提供 trackingNumber 参数');
          return await getShipmentByTracking(trackingNumber as string);
        case 'risks': {
          const { getLogisticsRisks } = await import('@/lib/services/logistics.service');
          return getLogisticsRisks();
        }
        default:
          throw new Error(`未知的物流查询类型: ${action}`);
      }
    },
  },

  // ─── 5. query_suppliers ───────────────────────────────────────────────────
  {
    name: 'query_suppliers',
    description: '查询供应商信息、评分、绩效和分布。可以查看供应商列表、供应商绩效分析和评分详情。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '查询类型: list(列表), performance(绩效分析)',
          enum: ['list', 'performance'],
        },
        region: {
          type: 'string',
          description: '地区筛选，如: 华东, 华南, 华北',
        },
        category: {
          type: 'string',
          description: '品类筛选',
        },
        status: {
          type: 'string',
          description: '状态筛选: active, suspended, inactive',
          enum: ['active', 'suspended', 'inactive'],
        },
      },
      required: ['action'],
    },
    handler: async (params) => {
      const { action, region, category, status } = params;
      switch (action) {
        case 'list':
          return summarize(await getSuppliersList({
            region: region as string | undefined,
            category: category as string | undefined,
            status: status as string | undefined,
            page: 1,
            pageSize: 20,
          }));
        case 'performance':
          return summarize(await getSupplierPerformance());
        default:
          throw new Error(`未知的供应商查询类型: ${action}`);
      }
    },
  },

  // ─── 6. query_dashboard ───────────────────────────────────────────────────
  {
    name: 'query_dashboard',
    description: '获取供应链仪表盘概览数据，包括核心指标、库存分布、销售趋势和紧急预警。这是获取全局视角的最佳工具。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '查询类型: metrics(核心指标), summary(摘要), distribution(库存分布), sales_trend(销售趋势), alerts(紧急预警)',
          enum: ['metrics', 'summary', 'distribution', 'sales_trend', 'alerts'],
        },
        warehouse: {
          type: 'string',
          description: '仓库筛选(用于distribution)',
        },
        startDate: {
          type: 'string',
          description: '开始日期 YYYY-MM-DD(用于sales_trend)',
        },
        endDate: {
          type: 'string',
          description: '结束日期 YYYY-MM-DD(用于sales_trend)',
        },
      },
      required: ['action'],
    },
    handler: async (params) => {
      const { action, warehouse, startDate, endDate } = params;
      switch (action) {
        case 'metrics':
          return await getDashboardMetrics();
        case 'summary':
          return await getDashboardSummary();
        case 'distribution':
          return await getInventoryDistribution(warehouse as string | undefined);
        case 'sales_trend':
          return await getSalesTrend(
            startDate as string | undefined,
            endDate as string | undefined
          );
        case 'alerts':
          return await getCriticalAlerts();
        default:
          throw new Error(`未知的仪表盘查询类型: ${action}`);
      }
    },
  },

  // ─── 8. query_supplier_trend ────────────────────────────────────────────
  {
    name: 'query_supplier_trend',
    description: '获取供应商历史绩效趋势（月度及时交货率、平均延误天数、货运量）。可按供应商编码筛选，或查看全部供应商趋势。数据来源：货运记录月度聚合，用于评估供应商长期表现变化。',
    parameters: {
      type: 'object',
      properties: {
        supplierCode: {
          type: 'string',
          description: '供应商编码（可选），不传则返回所有活跃供应商的趋势数据',
        },
        months: {
          type: 'number',
          description: '回溯月数，默认6',
        },
      },
      required: [],
    },
    handler: async (params) => {
      const { supplierCode, months } = params;
      const monthsBack = Math.min(24, Math.max(1, (months as number) ?? 6));
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - monthsBack);

      const { db } = await import('@/lib/db');

      const [suppliers, shipments] = await Promise.all([
        db.supplier.findMany({
          where: supplierCode ? { code: supplierCode as string } : { status: 'active' },
        }),
        db.shipmentItem.findMany({
          where: { createdAt: { gte: startDate } },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

      if (suppliers.length === 0) {
        throw new Error(supplierCode ? `未找到供应商编码: ${supplierCode}` : '未找到活跃供应商');
      }

      // Match shipments to suppliers using region/category heuristics
      function getRelatedShipments(supplier: typeof suppliers[0]): typeof shipments {
        return shipments.filter(s => {
          // Check region-based match
          const regionKeywords = SUPPLIER_REGION_MATCH[supplier.region];
          if (regionKeywords) {
            const originMatch = regionKeywords.some(kw => s.origin.includes(kw));
            if (originMatch) return true;
          }
          // Logistics carrier match
          if (supplier.category === '物流运输') {
            return s.carrier.includes(supplier.name.slice(0, 2)) || s.carrier.includes('物流');
          }
          // Customs clearance match
          if (supplier.category === '清关服务') {
            return s.status === 'customs';
          }
          return false;
        });
      }

      const result: Array<{
        supplierCode: string;
        name: string;
        region: string;
        category: string;
        trend: Array<{ month: string; onTimeRate: number; avgDelay: number; shipmentCount: number }>;
      }> = [];

      for (const supplier of suppliers) {
        const relatedShipments = getRelatedShipments(supplier);

        // Group by month (YYYY-MM)
        const monthGroups: Record<string, Array<{ delayDays: number }>> = {};
        for (const s of relatedShipments) {
          const monthKey = `${s.createdAt.getFullYear()}-${String(s.createdAt.getMonth() + 1).padStart(2, '0')}`;
          if (!monthGroups[monthKey]) monthGroups[monthKey] = [];
          monthGroups[monthKey].push(s);
        }

        const trend = Object.entries(monthGroups)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, items]) => {
            const onTimeCount = items.filter(i => i.delayDays === 0).length;
            return {
              month,
              onTimeRate: items.length > 0 ? Math.round((onTimeCount / items.length) * 100) : 0,
              avgDelay: items.length > 0
                ? Math.round((items.reduce((s, i) => s + i.delayDays, 0) / items.length) * 10) / 10
                : 0,
              shipmentCount: items.length,
            };
          });

        result.push({
          supplierCode: supplier.code,
          name: supplier.name,
          region: supplier.region,
          category: supplier.category,
          trend,
        });
      }

      // Sort by supplier code for deterministic output
      result.sort((a, b) => a.supplierCode.localeCompare(b.supplierCode));

      return summarize({
        _disclaimer: '供应商-货运匹配基于区域/承运商启发式匹配，指标为近似值。',
        suppliers: result,
        months: monthsBack,
        generatedAt: new Date().toISOString(),
      });
    },
  },

  // ─── 9. query_procurement ──────────────────────────────────────────────
  {
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
  },

  // ─── 7. query_risk ────────────────────────────────────────────────────────
  {
    name: 'query_risk',
    description: '查询供应链风险状态和数据，包括整体风险评分、风险矩阵、缓解措施和风险预警。如需进行情景模拟（供应中断、需求激增、汇率冲击、关税上调等），请使用 query_cascade_risk 工具。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '查询类型: dashboard(风险仪表盘), matrix(风险矩阵), mitigations(缓解措施), alerts(风险预警)',
          enum: ['dashboard', 'matrix', 'mitigations', 'alerts'],
        },
      },
      required: ['action'],
    },
    handler: async (params) => {
      const { action } = params;
      switch (action) {
        case 'dashboard':
          return await getRiskDashboard();
        case 'matrix':
          return summarize(await getRiskMatrix());
        case 'mitigations':
          return await getRiskMitigations();
        case 'alerts':
          return await getRiskAlerts();
        default:
          throw new Error(`未知的风险查询类型: ${action}`);
      }
    },
  },

  // ─── 10. query_supplier_location ──────────────────────────────────────
  {
    name: 'query_supplier_location',
    description: 'Find suppliers by geographic region or category. Returns suppliers grouped by region with counts and details.',
    parameters: {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          description: '地区筛选: 华东/华南/华北/华中/海外',
        },
        category: {
          type: 'string',
          description: '品类筛选: 电子元器件/塑料五金件/成品代工/物流运输/清关服务/包装材料',
        },
      },
      required: [],
    },
    handler: async (params) => {
      const { region, category } = params;
      const { db } = await import('@/lib/db');

      const where: Record<string, unknown> = {};
      if (region) where.region = region;
      if (category) where.category = category;

      const suppliers = await db.supplier.findMany({
        where,
        orderBy: [{ region: 'asc' }, { code: 'asc' }],
      });

      // Group by region
      const regionMap: Record<string, Array<{
        code: string; name: string; category: string; leadTime: number; rating: number;
      }>> = {};

      for (const s of suppliers) {
        if (!regionMap[s.region]) regionMap[s.region] = [];
        regionMap[s.region].push({
          code: s.code,
          name: s.name,
          category: s.category,
          leadTime: s.leadTime,
          rating: s.rating,
        });
      }

      const byRegion = Object.entries(regionMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([regionName, supplierList]) => ({
          region: regionName,
          count: supplierList.length,
          suppliers: supplierList,
        }));

      return {
        byRegion,
        totalSuppliers: suppliers.length,
        generatedAt: new Date().toISOString(),
      };
    },
  },

  // ─── 11. query_warehouse_capacity ─────────────────────────────────────
  {
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
  },
];
