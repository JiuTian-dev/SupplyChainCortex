/**
 * Tool Description Optimizer — augments tool descriptions with scenarios,
 * anti-examples, and parameter hints.
 *
 * Non-destructive: the original description is preserved and augmented text is appended.
 * Idempotent: if the tool is already optimized, returns it unchanged.
 */

import type { MCPTool } from '@/lib/mcp/tools';

/**
 * Optimize a single tool's description by augmenting it with:
 * - Usage scenario examples (when to use this tool)
 * - Anti-examples (when NOT to use this tool)
 * - Parameter constraints summary
 *
 * Non-destructive: the original description is preserved and augmented text is appended.
 * Idempotent: if the tool is already optimized, returns it unchanged.
 */
export function optimizeToolDescription(tool: Pick<MCPTool, 'name' | 'description'>): string {
  // Idempotency check
  if (tool.description.includes('【使用场景】')) {
    return tool.description;
  }

  const scenarios = getUsageScenarios(tool.name);
  const antiExamples = getAntiExamples(tool.name);
  const paramHints = getParameterHints(tool.name);

  const parts: string[] = [tool.description];

  if (scenarios.length > 0) {
    parts.push(`\n【使用场景】${scenarios.join('；')}`);
  }

  if (antiExamples.length > 0) {
    parts.push(`\n【不要用于】${antiExamples.join('；')}`);
  }

  if (paramHints.length > 0) {
    parts.push(`\n【参数要点】${paramHints.join('；')}`);
  }

  return parts.join('');
}

/**
 * Get usage scenario examples for a tool based on its name.
 * Returns real supply-chain scenarios where this tool is the right choice.
 */
function getUsageScenarios(toolName: string): string[] {
  const scenarios: Record<string, string[]> = {
    query_inventory: [
      '用户问"库存多少""还剩多少货"时使用',
      '查看指定仓库或品类的库存分布',
    ],
    query_cost: [
      '用户问"成本多少""毛利率"时使用',
      '查看单品成本分解或成本趋势',
    ],
    query_sales: [
      '用户问"卖了多少""销售额"时使用',
      '查看平台分布或销售预测',
    ],
    query_logistics: [
      '用户问"物流状态""到哪了"时使用',
      '追踪单号或查看物流风险',
    ],
    query_suppliers: [
      '用户问"有哪些供应商""供应商表现"时使用',
    ],
    query_risk: [
      '用户问"风险情况""有什么风险"时使用（仅查询，不模拟）',
    ],
    query_cascade_risk: [
      '用户问"如果港口拥堵会怎样""模拟汇率冲击"时使用（情景模拟）',
    ],
    query_dashboard: [
      '用户要全局概览或"仪表盘"数据时使用',
    ],
    create_reorder: [
      '用户要求"补货""下单"时使用（创建新订单）',
    ],
    adjust_inventory: [
      '用户要求"入库""出库""调整库存"时使用',
    ],
    update_shipment_status: [
      '用户要求"更新物流状态""标记已送达"时使用',
    ],
    calculate_eoq: [
      '用户问"经济订货量""EOQ""最优订货批量"时使用',
    ],
    calculate_safety_stock: [
      '用户问"安全库存""最低库存"时使用',
    ],
    web_search: [
      '用户问最新新闻、政策、价格走势等外部实时信息时使用',
    ],
  };
  return scenarios[toolName] || [];
}

/**
 * Get anti-examples for a tool — scenarios where the LLM should NOT use this tool.
 * This prevents common misrouting errors.
 */
function getAntiExamples(toolName: string): string[] {
  const anti: Record<string, string[]> = {
    query_risk: [
      '不要用于风险情景模拟（请用 query_cascade_risk）',
    ],
    query_cascade_risk: [
      '不要用于查询当前风险状态（请用 query_risk）',
    ],
    query_inventory: [
      '不要用于创建补货订单（请用 create_reorder）',
      '不要用于调整库存数量（请用 adjust_inventory）',
    ],
    query_suppliers: [
      '不要用于新增供应商（请用 create_supplier）',
      '不要用于修改供应商状态（请用 update_supplier_status）',
    ],
    query_logistics: [
      '不要用于更新货运状态（请用 update_shipment_status）',
    ],
    query_cost: [
      '不要用于更新成本记录（请用 update_cost_record）',
    ],
    web_search: [
      '不要用于查询系统内部数据（库存/成本/销售等有专用工具）',
    ],
    calculate_eoq: [
      '不要用于查询当前库存（请用 query_inventory）',
    ],
  };
  return anti[toolName] || [];
}

/**
 * Get parameter constraint hints for a tool.
 * Summarizes the most important parameter rules.
 */
function getParameterHints(toolName: string): string[] {
  const hints: Record<string, string[]> = {
    query_inventory: [
      'action 必填；detail 模式必须提供 sku',
      'slow_moving 模式 days 默认90',
    ],
    query_cost: [
      'action 必填；detail 模式必须提供 sku',
    ],
    query_logistics: [
      'action 必填；track 模式必须提供 trackingNumber',
    ],
    create_reorder: [
      'sku/productName/quantity/warehouse 均必填',
      'quantity 必须为正整数',
    ],
    adjust_inventory: [
      'quantity 正数=入库，负数=出库，不能为0',
      'quantity 必须为整数',
    ],
    update_shipment_status: [
      'trackingNumber 和 status 均必填',
      'status 必须在枚举值内',
    ],
    calculate_eoq: [
      'annual_demand/order_cost/holding_cost_per_unit 必填且为正数',
    ],
    query_cascade_risk: [
      'scenario 留空则自动检测',
      'port_congestion 场景需提供 sourcePort',
    ],
  };
  return hints[toolName] || [];
}
