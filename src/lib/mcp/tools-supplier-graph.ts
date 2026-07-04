/**
 * MCP Tools — Supplier Graph Intelligence
 *
 * Exposes Neo4j graph analytics as LLM-callable tools, enabling the
 * AI agent to query supply chain topology, dependency networks, and
 * data source health directly.
 *
 * Registered in tools.ts alongside the existing tool families.
 */

import type { MCPTool } from './tools';
import { supplierApi } from '@/lib/services/supplier-api.client';
import { getHealthReport } from '@/lib/services/scraper-health';

export const supplierGraphTools: MCPTool[] = [
  // ── Graph: Network ────────────────────────────────────────────────
  {
    name: 'query_supplier_graph',
    description: '查询企业供应商图谱网络（节点+边），按指定深度遍历供应链关系。支持按零部件类型筛选。',
    parameters: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: '企业股票代码（如 MIDE, AAPL）' },
        depth: { type: 'number', description: '遍历深度（1-4层，默认2）' },
        component: { type: 'string', description: '按零部件类型筛选（如 压缩机, MCU芯片）' },
      },
      required: ['ticker'],
    },
    handler: async (params) => {
      const { ticker, depth = 2, component } = params;
      return supplierApi.getNetwork(
        ticker as string,
        depth as number,
        component as string | undefined,
      );
    },
  },

  // ── Graph: Dependency ─────────────────────────────────────────────
  {
    name: 'query_supplier_dependency',
    description: '查询企业供应商依赖度分析（依赖度分数、HHI 集中度、风险标记）。了解目标企业的供应商依赖健康度。',
    parameters: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: '企业股票代码（如 MIDE）' },
        region: { type: 'string', description: '地区代码（CN/US，默认 CN）' },
      },
      required: ['ticker'],
    },
    handler: async (params) => {
      const { ticker, region = 'CN' } = params;
      return supplierApi.getDependency(ticker as string, region as string);
    },
  },

  // ── Graph: Impact ─────────────────────────────────────────────────
  {
    name: 'query_supplier_impact',
    description: '模拟供应商中断影响分析：如果某个供应商停产，哪些下游企业会受影响？传播路径是什么？',
    parameters: {
      type: 'object',
      properties: {
        supplier: { type: 'string', description: '供应商股票代码' },
        depth: { type: 'number', description: '影响传播深度（1-5层，默认3）' },
      },
      required: ['supplier'],
    },
    handler: async (params) => {
      const { supplier, depth = 3 } = params;
      return supplierApi.getImpact(supplier as string, depth as number);
    },
  },

  // ── Graph: Chokepoints ────────────────────────────────────────────
  {
    name: 'query_supplier_chokepoints',
    description: '查询供应链卡脖子供应商（同时为多家企业供货的共享瓶颈）。识别单一故障点风险。',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回结果数量（默认20）' },
      },
      required: [],
    },
    handler: async (params) => {
      const limit = (params.limit as number) || 20;
      const pageSize = Math.min(limit, 200);
      return supplierApi.getChokepoints(1, pageSize);
    },
  },

  // ── Graph: Geo-risk ───────────────────────────────────────────────
  {
    name: 'query_supplier_geo_risk',
    description: '分析供应商地理集中度风险（制造基地分布、自然灾害暴露）。按珠三角/长三角/成渝等制造带聚类。',
    parameters: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: '企业股票代码' },
      },
      required: ['ticker'],
    },
    handler: async (params) => {
      const { ticker } = params;
      return supplierApi.getGeoRisk(ticker as string);
    },
  },

  // ── Graph: Tiers ──────────────────────────────────────────────────
  {
    name: 'query_supplier_tiers',
    description: '查询企业供应商层级结构：Tier-1 直接供应商、Tier-2 间接供应商、各层数量统计。',
    parameters: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: '企业股票代码' },
      },
      required: ['ticker'],
    },
    handler: async (params) => {
      const { ticker } = params;
      return supplierApi.getTiers(ticker as string);
    },
  },

  // ── Health: Scraper health ────────────────────────────────────────
  {
    name: 'query_scraper_health',
    description: '查询所有数据源的运行健康状态（抓取成功率、连续失败次数、SLA）。识别哪些数据源可能不新鲜。',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async () => {
      return getHealthReport();
    },
  },

  // ── Graph: Evolution ──────────────────────────────────────────────
  {
    name: 'query_supplier_evolution',
    description: '追踪供应商网络随时间变化：供应商数量趋势、HHI 集中度变化、新增/消失的风险标记。',
    parameters: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: '企业股票代码' },
        months: { type: 'number', description: '追溯月数（1-24，默认6）' },
      },
      required: ['ticker'],
    },
    handler: async (params) => {
      const { ticker, months = 6 } = params;
      return supplierApi.getEvolution(ticker as string, months as number);
    },
  },

  // ── Graph: Component tree ─────────────────────────────────────────
  {
    name: 'query_component_tree',
    description: '查询零部件分类树：按行业分类（压缩机/电机/芯片/PCB 等）组织的供应商统计。了解供应链零部件构成。',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async () => {
      return supplierApi.getComponentTree();
    },
  },
];
