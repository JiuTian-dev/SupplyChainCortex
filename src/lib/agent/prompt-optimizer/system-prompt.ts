/**
 * Intent-Aware System Prompt Builder — assembles tool-selection guidance,
 * parameter rules, error hints, and few-shot examples into a system prompt.
 */

import type { MCPTool } from '@/lib/mcp/tools';
import type { Intent } from '../fsm-types';
import { generateFewShotExamples } from './few-shot';

// ─── Intent → Tool Selection Guidance ─────────────────────────────────────────

/**
 * Maps user intents to recommended tools and selection rules.
 * Used by buildOptimizedSystemPrompt to give the LLM explicit routing guidance.
 */
const INTENT_TOOL_GUIDANCE: Record<Intent, { rules: string[]; primaryTools: string[] }> = {
  supply_chain_data: {
    rules: [
      '库存相关 → query_inventory (action 选择: overview/list/forecast/risk/detail/slow_moving/reorder)',
      '成本/毛利 → query_cost (action: overview/list/detail/benchmark/optimization/trend)',
      '销售数据 → query_sales (action: overview/daily/detail/forecast)',
      '物流货运 → query_logistics (action: list/stats/track/risks)',
      '供应商信息 → query_suppliers (action: list/performance)',
      '风险状态 → query_risk (action: dashboard/matrix/mitigations/alerts)',
      '仪表盘概览 → query_dashboard (action: metrics/summary/distribution/sales_trend/alerts)',
      '采购计划 → query_procurement (action: plan/detail/summary)',
      '仓库容量 → query_warehouse_capacity',
    ],
    primaryTools: [
      'query_inventory', 'query_cost', 'query_sales', 'query_logistics',
      'query_suppliers', 'query_risk', 'query_dashboard', 'query_procurement',
    ],
  },
  supply_chain_knowledge: {
    rules: [
      '库存计算模型 → calculate_eoq / calculate_safety_stock / calculate_reorder_point',
      '需求预测 → forecast_demand / calculate_seasonal_decompose',
      '供应商评分 → calculate_supplier_scoring',
      '成本分析 → calculate_total_cost / calculate_break_even / calculate_optimal_pricing',
      '库存分类 → classify_abc_xyz',
      '仿真分析 → monte_carlo_inventory / run_sandbox',
      '决策推理 → query_decision_graph',
    ],
    primaryTools: [
      'calculate_eoq', 'calculate_safety_stock', 'forecast_demand',
      'calculate_supplier_scoring', 'query_decision_graph',
    ],
  },
  news_event: {
    rules: [
      '外部实时数据 → web_search (中文查询请先翻译为英文关键词)',
      '汇率走势 → query_exchange_rates (action: history)',
      '大宗商品 → query_commodities',
      '运价指数 → query_scfis',
      '港口拥堵 → query_port_congestion',
      '碳价/CBAM → query_carbon_price',
    ],
    primaryTools: ['web_search', 'query_exchange_rates', 'query_commodities', 'query_scfis'],
  },
  general_knowledge: {
    rules: [
      '通用知识问题通常不需要工具调用',
      '如需补充数据可使用 web_search',
    ],
    primaryTools: ['web_search'],
  },
  opinion_recommendation: {
    rules: [
      '推荐/建议类问题 → query_decision_graph (结构化行动建议)',
      '深度分析 → query_analytics (action: supplier_performance/cost_optimization/...)',
      '工作流编排 → execute_workflow (自动检测并运行多步骤工作流)',
    ],
    primaryTools: ['query_decision_graph', 'query_analytics', 'execute_workflow'],
  },
  chat_greeting: {
    rules: ['问候/闲聊不需要工具调用'],
    primaryTools: [],
  },
};

// ─── buildOptimizedSystemPrompt ───────────────────────────────────────────────

/**
 * Build an optimized system prompt for the plan phase.
 *
 * Combines:
 * - Tool selection guidance (intent-specific routing rules)
 * - Parameter filling standards (formats, units)
 * - Common error hints (what NOT to do)
 * - Few-shot examples (real scenarios)
 *
 * This prompt is APPENDED to the existing FSM plan prompt, not replacing it.
 */
export function buildOptimizedSystemPrompt(
  tools: Array<Pick<MCPTool, 'name' | 'description'>>,
  intent: Intent,
): string {
  const guidance = INTENT_TOOL_GUIDANCE[intent];
  if (!guidance || guidance.primaryTools.length === 0) {
    return '';
  }

  const sections: string[] = [];

  // Section 1: Tool Selection Guidance
  sections.push('## 工具选择指导');
  sections.push(`当前意图: ${intent}`);
  sections.push('根据用户查询选择最匹配的工具：');
  for (const rule of guidance.rules) {
    sections.push(`- ${rule}`);
  }

  // Section 2: Available Tools Summary (names only, to reinforce)
  const relevantTools = tools.filter(t => guidance.primaryTools.includes(t.name));
  if (relevantTools.length > 0) {
    sections.push('\n## 本次可用的核心工具');
    for (const t of relevantTools) {
      sections.push(`- **${t.name}**: ${t.description.split('\n')[0].slice(0, 80)}`);
    }
  }

  // Section 3: Parameter Filling Standards
  sections.push('\n## 参数填写规范');
  sections.push('- SKU格式: 大写字母+数字+连字符，如 KA-RC4001（不要用小写或空格）');
  sections.push('- 仓库名称: 深圳仓 / 义乌仓 / 上海仓（必须带"仓"字）');
  sections.push('- 供应商编码: SUP-XX000 格式，如 SUP-GD001');
  sections.push('- 追踪号: 完整的运单号，如 SF1234567890');
  sections.push('- 日期格式: YYYY-MM-DD，如 2026-06-18');
  sections.push('- 数量: 必须为正整数（除非明确允许小数）');
  sections.push('- action 参数: 必须从枚举值中选择，不要编造新的 action');
  sections.push('- 可选参数: 不确定时不要填，留空比填错好');

  // Section 4: Common Error Hints
  sections.push('\n## 常见错误提示');
  sections.push('- ❌ 不要编造不存在的参数（如 query_inventory 没有 limit 参数）');
  sections.push('- ❌ 不要混淆 query_risk（查询状态）和 query_cascade_risk（情景模拟）');
  sections.push('- ❌ 不要混淆 query_suppliers（查询）和 create_supplier（新增）');
  sections.push('- ❌ 不要在 detail 模式忘记提供 sku 参数');
  sections.push('- ❌ 不要把仓库名写成"深圳"（应为"深圳仓"）');
  sections.push('- ❌ 不要对中文查询直接调用 web_search（先翻译为英文关键词）');
  sections.push('- ✅ 并行调用多个独立工具以提高效率');
  sections.push('- ✅ 如果用户指定了SKU/仓库/品类，务必作为参数传入');

  // Section 5: Few-shot Examples
  const examples = generateFewShotExamples(intent);
  if (examples.length > 0) {
    sections.push('\n## 正确调用示例');
    for (const ex of examples) {
      sections.push(`用户: ${ex.userInput}`);
      sections.push(`调用: ${ex.toolName}(${JSON.stringify(ex.params)})`);
      sections.push('');
    }
  }

  return sections.join('\n');
}
