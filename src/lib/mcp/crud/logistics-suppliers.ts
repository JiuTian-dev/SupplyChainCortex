/**
 * CRUD Tools: Logistics and Suppliers queries.
 * Tools: query_logistics, query_suppliers, query_supplier_trend,
 *        query_supplier_location.
 * Extracted from tools-crud.ts.
 */

import type { MCPTool } from '../tools';
import { summarize } from '../helpers';

import {
  getShipmentList, getShipmentStats, getShipmentByTracking,
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

export const queryLogisticsTool: MCPTool = {
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
};

export const querySuppliersTool: MCPTool = {
  name: 'query_suppliers',
  description: '查询供应商业务信息列表与绩效分析（含评分、交货期、状态等业务属性）。可以查看供应商列表（按地区/品类/状态筛选）和供应商绩效分析报告。这是"供应商业务信息查询"工具——返回供应商的业务档案和绩效指标。不要与 query_supplier_location 混淆：query_supplier_location 专注于"地理分布"（按地区分组统计、地图可视化数据），而 query_suppliers 专注于"业务信息"（列表、评分、绩效）。当用户问"有哪些供应商"、"供应商绩效"、"供应商列表"时使用此工具。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '查询类型: list(供应商列表), performance(绩效分析)',
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
};

export const querySupplierTrendTool: MCPTool = {
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
};

export const querySupplierLocationTool: MCPTool = {
  name: 'query_supplier_location',
  description: '查询供应商地理分布（按地区分组统计、地图可视化数据）。返回按地区分组的供应商列表及计数，专注于"地理位置分布"分析。这是"供应商地理分布查询"工具——返回的是按地区聚合的地理分布数据。不要与 query_suppliers 混淆：query_suppliers 专注于"业务信息"（列表、评分、绩效），而 query_supplier_location 专注于"地理分布"（按地区分组统计、地图可视化数据）。当用户问"某地区有哪些供应商"、"供应商地理分布"、"供应商在哪些区域"时使用此工具。',
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
};
