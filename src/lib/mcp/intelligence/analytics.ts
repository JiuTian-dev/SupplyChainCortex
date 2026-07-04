/**
 * MCP Tools: Analytics Intelligence (query_analytics).
 * Extracted from tools-intelligence.ts.
 */

import type { MCPTool } from '../tools';
import { summarize } from '../helpers';
import {
  getSupplierPerformanceAnalytics, getCostOptimizationAnalytics,
  getInventoryForecastAnalytics, getSupplyChainRiskAnalytics,
  getSalesForecastAnalytics, getInventoryOptimizationAnalytics,
} from '@/lib/queries/analytics.queries';

export const analyticsIntelligence: MCPTool[] = [
  {
    name: 'query_analytics',
    description: '获取供应链综合深度分析报告（跨数据源聚合+趋势洞察+优化建议）。包括库存周转分析、成本优化建议、销售预测、供应商绩效综合评估和供应链风险综合分析等高级分析。这是"分析"工具——对多源数据进行综合处理并输出洞察。不要用于查询单一数据源的原始数据：仅查库存用 query_inventory、仅查成本用 query_cost、仅查销售用 query_sales、仅查供应商列表用 query_suppliers。query_analytics 输出的是"分析结论"（如"周转率偏低，建议..."），而非原始记录列表。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '分析类型: supplier_performance(供应商绩效综合分析), cost_optimization(成本优化建议), inventory_forecast(库存预测分析), risk_analysis(供应链风险综合分析), sales_forecast(销售预测分析), inventory_optimization(库存优化建议)',
          enum: ['supplier_performance', 'cost_optimization', 'inventory_forecast', 'risk_analysis', 'sales_forecast', 'inventory_optimization'],
        },
        forecastDays: {
          type: 'number',
          description: '预测天数，默认14(用于inventory_forecast和sales_forecast)',
        },
      },
      required: ['action'],
    },
    handler: async (params) => {
      const { action, forecastDays } = params;
      switch (action) {
        case 'supplier_performance':
          return summarize(await getSupplierPerformanceAnalytics());
        case 'cost_optimization':
          return summarize(await getCostOptimizationAnalytics());
        case 'inventory_forecast':
          return summarize(await getInventoryForecastAnalytics((forecastDays as number) || 14));
        case 'risk_analysis':
          return summarize(await getSupplyChainRiskAnalytics());
        case 'sales_forecast':
          return summarize(await getSalesForecastAnalytics((forecastDays as number) || 30));
        case 'inventory_optimization':
          return summarize(await getInventoryOptimizationAnalytics());
        default:
          throw new Error(`未知的分析类型: ${action}`);
      }
    },
  },
];
