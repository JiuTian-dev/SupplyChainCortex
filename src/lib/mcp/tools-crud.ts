/**
 * MCP Tools: CRUD operations (inventory, cost, sales, logistics, suppliers, dashboard, risk).
 * Extracted from tools.ts.
 */

import type { MCPTool } from './tools';

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

import {
  getDashboardMetrics, getDashboardSummary, getInventoryDistribution,
  getSalesTrend, getCriticalAlerts,
} from '@/lib/queries/dashboard.queries';

import {
  getRiskDashboard, getRiskMatrix, getRiskMitigations, runRiskSimulation,
} from '@/lib/services/risk.service';

// ─── Shared helpers ──────────────────────────────────────────────────────────────

function summarize<T>(data: T, maxItems = 20): T {
  if (Array.isArray(data)) {
    if (data.length > maxItems) return data.slice(0, maxItems) as T;
  }
  if (data && typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(value) && value.length > maxItems) {
        result[key] = { items: value.slice(0, maxItems), total: value.length, truncated: true, note: `显示前 ${maxItems} 条，共 ${value.length} 条` };
      } else {
        result[key] = value;
      }
    }
    return result as T;
  }
  return data;
}

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
            (forecastDays as number) || 14,
            warehouse as string | undefined
          ));
        case 'risk':
          return summarize(await getStockoutRiskAnalysis(warehouse as string | undefined));
        case 'detail':
          if (!sku) throw new Error('查询库存详情需要提供 sku 参数');
          return await getInventoryHealth(sku as string, warehouse as string | undefined);
        case 'slow_moving':
          return summarize(await getSlowMovingItems(
            (days as number) || 90,
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
          return summarize(await getCostTrend(category as string | undefined, (months as number) || 6));
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
            days: (days as number) || 30,
            platform: platform as string | undefined,
            category: category as string | undefined,
          }));
        case 'daily':
          return summarize(await getDailySales({
            days: (days as number) || 30,
            platform: platform as string | undefined,
          }));
        case 'detail':
          if (!sku) throw new Error('查询单品销售需要提供 sku 参数');
          return await getSalesSummaryForSku({
            sku: sku as string,
            days: (days as number) || 30,
            platform: platform as string | undefined,
          });
        case 'forecast':
          return summarize(await generateSalesForecast(
            (horizon as number) || 14,
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

  // ─── 7. query_risk ────────────────────────────────────────────────────────
  {
    name: 'query_risk',
    description: '获取供应链风险评估，包括整体风险评分、风险矩阵、缓解措施和情景模拟。支持供应中断、需求激增、汇率冲击、关税上调、天气延误等情景模拟。天气延误情景使用Open-Meteo实时港口天气数据。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '查询类型: dashboard(风险仪表盘), matrix(风险矩阵), mitigations(缓解措施), simulate(情景模拟)',
          enum: ['dashboard', 'matrix', 'mitigations', 'simulate'],
        },
        scenario: {
          type: 'string',
          description: '模拟情景: supply_disruption(供应中断), demand_spike(需求激增), exchange_rate_shock(汇率冲击), tariff_increase(关税上调), weather_disruption(天气延误-使用Open-Meteo实时数据)',
          enum: ['supply_disruption', 'demand_spike', 'exchange_rate_shock', 'tariff_increase', 'weather_disruption'],
        },
      },
      required: ['action'],
    },
    handler: async (params) => {
      const { action, scenario } = params;
      switch (action) {
        case 'dashboard':
          return await getRiskDashboard();
        case 'matrix':
          return summarize(await getRiskMatrix());
        case 'mitigations':
          return await getRiskMitigations();
        case 'simulate':
          if (!scenario) throw new Error('情景模拟需要提供 scenario 参数');
          return await runRiskSimulation(scenario as string);
        default:
          throw new Error(`未知的风险查询类型: ${action}`);
      }
    },
  },
];
