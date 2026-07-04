/**
 * Tool Schema Optimizer — enhances JSON Schema with examples, enum descriptions,
 * and required-field emphasis.
 *
 * Returns a new tool object; the original is never mutated.
 * Idempotent: if already optimized, returns a shallow copy unchanged.
 */

import type { MCPTool, MCPToolParameter } from '@/lib/mcp/tools';

// ─── Optimized Types ──────────────────────────────────────────────────────────

/**
 * Extended parameter schema with `example` and `enumDescriptions`.
 * These are standard JSON Schema extension fields supported by most LLM providers.
 */
export interface OptimizedMCPToolParameter extends MCPToolParameter {
  /** Concrete example value to guide the LLM */
  example?: unknown;
  /** Human-readable explanation for each enum value */
  enumDescriptions?: Record<string, string>;
}

export interface OptimizedMCPTool extends Omit<MCPTool, 'parameters' | 'handler'> {
  parameters: {
    type: 'object';
    properties: Record<string, OptimizedMCPToolParameter>;
    required?: string[];
  };
  /** Marker for idempotency — if true, tool has already been optimized */
  __optimized?: boolean;
}

// ─── Parameter Example Library ────────────────────────────────────────────────

/**
 * Default example values for common parameter names across all tools.
 * These are real values from the seed data, ensuring LLM sees valid formats.
 */
const PARAMETER_EXAMPLES: Record<string, unknown> = {
  sku: 'KA-RC4001',
  warehouse: '深圳仓',
  category: '厨房电器',
  region: '华南',
  carrier: '顺丰速运',
  trackingNumber: 'SF1234567890',
  code: 'SUP-GD001',
  supplierCode: 'SUP-GD001',
  productName: '智能电饭煲',
  priority: '常规',
  status: 'in_transit',
  action: 'overview',
  days: 30,
  forecastDays: 14,
  months: 6,
  horizon: 14,
  base: 'CNY',
  target: 'USD',
  market: 'US',
  product_name: '智能咖啡机',
  ticker: 'MIDE',
  depth: 2,
  query: '深圳仓库存概览',
  scenario: 'port_congestion',
  sourcePort: 'Shanghai',
};

/**
 * Enum value descriptions for common action/status parameters.
 * Helps the LLM understand WHEN to use each enum value.
 */
const ENUM_DESCRIPTIONS: Record<string, Record<string, string>> = {
  // query_inventory action
  'query_inventory.action': {
    overview: '整体库存概览（汇总统计，无单品详情）',
    list: '库存列表（分页返回单品记录）',
    forecast: '未来N天库存预测',
    risk: '缺货风险分析（识别低库存SKU）',
    detail: '指定SKU的库存详情（需提供sku参数）',
    slow_moving: '滞销品分析（需提供days阈值）',
    reorder: '补货建议（系统自动计算）',
  },
  // query_cost action
  'query_cost.action': {
    overview: '成本概览（汇总）',
    list: '成本列表（分页）',
    detail: '单品成本详情（需提供sku）',
    benchmark: '基准对比（与行业均值对比）',
    optimization: '优化建议',
    trend: '成本趋势（需指定months）',
  },
  // query_logistics action
  'query_logistics.action': {
    list: '货运列表（可按状态/承运商筛选）',
    stats: '物流统计（汇总）',
    track: '单号追踪（需提供trackingNumber）',
    risks: '物流风险列表',
  },
  // query_suppliers action
  'query_suppliers.action': {
    list: '供应商列表（可按地区/品类/状态筛选）',
    performance: '供应商绩效分析',
  },
  // shipment status
  'query_logistics.status': {
    pending: '待发货',
    in_transit: '运输中',
    customs: '清关中',
    delivered: '已送达',
    delayed: '延误',
    exception: '异常',
  },
  // supplier status
  'update_supplier_status.status': {
    active: '激活供应商（恢复合作）',
    suspended: '暂停供应商（临时停止合作）',
  },
  // tariff action
  'query_tariff.action': {
    overview: '关税全景概览',
    compute: '计算特定产品关税（需category+countryCode）',
    simulate: '关税情景模拟（需scenario）',
  },
};

// ─── optimizeToolSchema ───────────────────────────────────────────────────────

/**
 * Optimize a tool's JSON Schema by:
 * - Adding `example` to each parameter (from PARAMETER_EXAMPLES or inferred)
 * - Adding `enumDescriptions` to clarify enum values
 * - Emphasizing required fields in their descriptions
 *
 * Returns a new tool object; the original is never mutated.
 * Idempotent: if already optimized, returns a shallow copy unchanged.
 */
export function optimizeToolSchema(tool: Omit<MCPTool, 'handler'>): OptimizedMCPTool {
  // If already optimized, return as-is (shallow copy for safety)
  if ((tool as OptimizedMCPTool).__optimized) {
    return { ...(tool as OptimizedMCPTool) };
  }

  const required = tool.parameters.required || [];
  const properties: Record<string, OptimizedMCPToolParameter> = {};

  for (const [paramName, paramSchema] of Object.entries(tool.parameters.properties)) {
    const optimized: OptimizedMCPToolParameter = { ...paramSchema };

    // Add example value
    if (optimized.example === undefined) {
      const example = inferExample(tool.name, paramName, paramSchema);
      if (example !== undefined) {
        optimized.example = example;
      }
    }

    // Add enum descriptions
    if (optimized.enum && optimized.enum.length > 0 && !optimized.enumDescriptions) {
      const enumDescs = ENUM_DESCRIPTIONS[`${tool.name}.${paramName}`];
      if (enumDescs) {
        optimized.enumDescriptions = enumDescs;
      }
    }

    // Emphasize required fields
    if (required.includes(paramName) && optimized.description) {
      if (!optimized.description.includes('【必填】')) {
        optimized.description = `【必填】${optimized.description}`;
      }
    }

    // Deep-copy items schema if present (for array params)
    if (optimized.items && typeof optimized.items === 'object') {
      optimized.items = JSON.parse(JSON.stringify(optimized.items));
    }

    properties[paramName] = optimized;
  }

  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: tool.parameters.type,
      properties,
      required,
    },
    __optimized: true,
  };
}

/**
 * Infer an example value for a parameter.
 * Priority: PARAMETER_EXAMPLES lookup → enum first value → type-based default.
 */
function inferExample(
  toolName: string,
  paramName: string,
  schema: MCPToolParameter,
): unknown {
  // 1. Check the example library
  if (paramName in PARAMETER_EXAMPLES) {
    return PARAMETER_EXAMPLES[paramName];
  }

  // 2. For enum params, use the first enum value as example
  if (schema.enum && schema.enum.length > 0) {
    return schema.enum[0];
  }

  // 3. Type-based defaults
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes('array')) return [];
  if (types.includes('object')) return {};
  if (types.includes('number')) return 1;
  if (types.includes('boolean')) return true;
  if (types.includes('string')) return 'example_value';
  return undefined;
}
