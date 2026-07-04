/**
 * CRUD Tools: Dashboard and Risk queries (query_dashboard, query_risk).
 * Extracted from tools-crud.ts.
 */

import type { MCPTool } from '../tools';
import { summarize } from '../helpers';

import {
  getDashboardMetrics, getDashboardSummary, getInventoryDistribution,
  getSalesTrend, getCriticalAlerts,
} from '@/lib/queries/dashboard.queries';

import {
  getRiskDashboard, getRiskMatrix, getRiskMitigations, getRiskAlerts,
} from '@/lib/services/risk.service';

export const queryDashboardTool: MCPTool = {
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
};

export const queryRiskTool: MCPTool = {
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
};
