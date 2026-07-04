/**
 * Few-Shot Example Generator — returns real supply-chain scenario examples
 * for intent-specific tool calls.
 */

import type { Intent } from '../fsm-types';

/**
 * Few-shot example for a tool call.
 */
export interface FewShotExample {
  /** The user's natural language input */
  userInput: string;
  /** The tool that should be called */
  toolName: string;
  /** The parameters that should be passed */
  params: Record<string, unknown>;
  /** Brief explanation of why this tool was chosen */
  reasoning: string;
}

/**
 * Generate few-shot examples for a specific intent.
 * Returns real supply-chain scenarios with correct tool calls.
 *
 * These examples are based on actual test cases from tests/reliability/tool-cases.ts
 * and represent the most common user query patterns.
 */
export function generateFewShotExamples(intent: Intent): FewShotExample[] {
  const examplesByIntent: Record<Intent, FewShotExample[]> = {
    supply_chain_data: [
      {
        userInput: '查一下 KA-RC4001 的库存情况',
        toolName: 'query_inventory',
        params: { action: 'detail', sku: 'KA-RC4001' },
        reasoning: '用户指定了SKU，使用 detail 模式查询单品库存',
      },
      {
        userInput: '深圳仓现在的库存概览',
        toolName: 'query_inventory',
        params: { action: 'overview', warehouse: '深圳仓' },
        reasoning: '用户要概览并指定了仓库，使用 overview 模式',
      },
      {
        userInput: 'KA-RC4001 的成本分解详情',
        toolName: 'query_cost',
        params: { action: 'detail', sku: 'KA-RC4001' },
        reasoning: '查询单品成本详情，使用 detail 模式并传入 sku',
      },
      {
        userInput: '追踪单号 SF1234567890 的物流',
        toolName: 'query_logistics',
        params: { action: 'track', trackingNumber: 'SF1234567890' },
        reasoning: '用户要追踪单号，使用 track 模式并传入 trackingNumber',
      },
      {
        userInput: '华南地区有哪些活跃供应商',
        toolName: 'query_suppliers',
        params: { action: 'list', region: '华南', status: 'active' },
        reasoning: '按地区和状态筛选供应商列表',
      },
    ],
    supply_chain_knowledge: [
      {
        userInput: '年需求3600件，订货成本100元，持有成本2元/件，计算EOQ',
        toolName: 'calculate_eoq',
        params: { annual_demand: 3600, order_cost: 100, holding_cost_per_unit: 2 },
        reasoning: '用户明确要求计算经济订货批量，传入三个必填参数',
      },
      {
        userInput: '服务水平95%，需求标准差10，提前期7天，算安全库存',
        toolName: 'calculate_safety_stock',
        params: { service_level: 0.95, demand_std: 10, lead_time_days: 7 },
        reasoning: '计算安全库存需要服务水平、需求标准差和提前期',
      },
      {
        userInput: '帮我分析下供应链决策建议',
        toolName: 'query_decision_graph',
        params: { query: '帮我分析下供应链决策建议' },
        reasoning: '用户要决策建议，使用决策图推理引擎',
      },
    ],
    news_event: [
      {
        userInput: '最近美元兑人民币汇率走势',
        toolName: 'query_exchange_rates',
        params: { action: 'history', base: 'CNY', target: 'USD', days: 90 },
        reasoning: '查询汇率历史趋势，指定 base/target/days',
      },
      {
        userInput: '当前铜价和铝价是多少',
        toolName: 'query_commodities',
        params: {},
        reasoning: '查询大宗商品价格，无需参数',
      },
    ],
    general_knowledge: [],
    opinion_recommendation: [
      {
        userInput: '推荐一下哪个供应商比较好',
        toolName: 'query_analytics',
        params: { action: 'supplier_performance' },
        reasoning: '用户要供应商推荐，先查绩效分析数据',
      },
    ],
    chat_greeting: [],
  };

  return examplesByIntent[intent] || [];
}
