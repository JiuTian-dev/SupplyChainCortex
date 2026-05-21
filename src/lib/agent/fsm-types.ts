/**
 * Agent Engine v2 — FSM types.
 * Model-agnostic state machine definitions for the 6-state Agent loop.
 */

import type { ChatMessage } from '@/lib/services/ai-providers.service';
import type { MCPTool } from '@/lib/mcp/tools';

// ─── FSM States ──────────────────────────────────────────────────────────

export type FSMState =
  | 'classify'
  | 'plan'
  | 'execute'
  | 'observe'
  | 'decide'
  | 'synthesize';

export const FSM_STATES: readonly FSMState[] = [
  'classify', 'plan', 'execute', 'observe', 'decide', 'synthesize',
] as const;

// ─── Tool Call / Result ──────────────────────────────────────────────────

export interface ToolCall {
  name: string;
  params: Record<string, unknown>;
  /** Human-readable display name for the UI */
  displayName?: string;
}

export type ToolResult =
  | { tool: string; success: true; data: unknown; latencyMs: number }
  | { tool: string; success: false; error: string; latencyMs: number };

export interface Observation {
  validResults: ToolResult[];
  conflicts: Array<{ tool: string; description: string }>;
  overallConfidence: number;
  missingData: string[];
}

// ─── Router Types ────────────────────────────────────────────────────────

export type Intent =
  | 'supply_chain_data'
  | 'supply_chain_knowledge'
  | 'news_event'
  | 'general_knowledge'
  | 'opinion_recommendation'
  | 'chat_greeting';

export interface RoutingDecision {
  intent: Intent;
  confidence: number;
  shouldUseTools: boolean;
  shouldSearch: boolean;
  reason: string;
  maxRoundsOverride?: number;
}

// ─── FSM Config ──────────────────────────────────────────────────────────

export interface FSMConfig {
  maxRounds: number;
  maxToolsPerRound: number;
  totalToolCallLimit: number;
  toolTimeoutMs: number;
  confidenceThreshold: number;
  maxContextTokens: number;
}

export const DEFAULT_FSM_CONFIG: FSMConfig = {
  maxRounds: 3,
  maxToolsPerRound: 6,
  totalToolCallLimit: 18,
  toolTimeoutMs: 30000,
  confidenceThreshold: 0.7,
  maxContextTokens: 64000,
};

// ─── FSM Context ─────────────────────────────────────────────────────────

export interface FSMContext {
  query: string;
  history: ChatMessage[];
  config: FSMConfig;

  routing?: RoutingDecision;

  round: number;
  /** Tool execution plan from the 'plan' state — persists across execute/observe/decide */
  plan?: ToolCall[];
  toolResults: ToolResult[];
  observations: Observation[];

  finalResponse?: string;
  toolsUsed: string[];

  startTimeMs: number;

  dynamicContext?: string;
  tieredSystemPrompt?: string;
}

// ─── SSE Events ──────────────────────────────────────────────────────────

export type AgentEvent =
  | { type: 'thinking'; content: string }
  | { type: 'tool_call'; tool: string; params: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; result?: string; error?: string }
  | { type: 'token'; content: string }
  | { type: 'confirm_required'; confirmationCard: Record<string, unknown> }
  | { type: 'done'; toolsUsed: string[]; steps: number; durationMs: number; mode: string; tier?: number; passport?: Record<string, unknown>; claimsExtracted?: number; traceId?: string | null }
  | { type: 'error'; message: string };

// ─── Tool Display Names ──────────────────────────────────────────────────

export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  query_inventory: '库存查询',
  query_cost: '成本查询',
  query_sales: '销售查询',
  query_logistics: '物流查询',
  query_suppliers: '供应商查询',
  query_supplier_trend: '供应商趋势',
  query_dashboard: '仪表盘概览',
  query_risk: '风险评估',
  query_exchange_rates: '汇率查询',
  query_weather: '港口天气',
  query_tariff: '关税查询',
  query_cascade_risk: '级联风险分析',
  query_decision_graph: '决策图查询',
  query_analytics: '数据分析',
  query_commodities: '大宗商品价格',
  query_scfis: 'SCFIS运价',
  query_carbon_price: '碳价查询',
  query_cpsc_recalls: '召回查询',
  query_port_congestion: '港口拥堵',
  query_financial_index: '金融指数',
  query_amazon_competitors: '竞品分析',
  query_brand_sentiment: '品牌舆情',
  query_compliance_check: '合规审查',
  query_financial_sim: '财务模拟器',
  query_product_feed: '商品Feed',
  query_arbitrage: '套利引擎',
  query_coherence_audit: '一致性审计',
  query_recall_risk: '召回风险预警',
  query_supplier_discovery: '供应商发现',
  execute_workflow: '工作流执行',
  run_sandbox: '供应链仿真',
  web_search: '联网搜索',
  create_reorder: '创建补货单',
  adjust_inventory: '调整库存',
  create_transfer: '库存调拨',
  query_procurement: '采购计划',
  create_note: '创建备注',
  update_shipment_status: '更新货运状态',
  resolve_alert: '解除预警',
  calculate_eoq: '经济订货批量EOQ',
  calculate_safety_stock: '安全库存计算',
  calculate_reorder_point: '再订货点ROP',
  classify_abc_xyz: 'ABC-XYZ分类',
  forecast_demand: '需求预测',
  calculate_seasonal_decompose: '季节分解',
  monte_carlo_inventory: '蒙特卡洛仿真',
  calculate_wagner_whitin: '动态批量优化',
  calculate_newsvendor: '报童模型',
  calculate_drp: '分销需求计划',
  calculate_warehouse_location: '仓库选址',
  calculate_transport_route: '运输路径优化',
  calculate_multi_echelon_ss: '多级安全库存',
  calculate_inventory_kpi: '库存KPI',
  calculate_fill_rate: '填充率',
  calculate_lead_time_analysis: '提前期分析',
  calculate_purchase_variance: '采购价差分析',
  calculate_total_cost: '总供应链成本',
  calculate_supplier_scoring: '供应商综合评分',
  calculate_learning_curve: '学习曲线',
  calculate_break_even: '盈亏平衡',
  calculate_optimal_pricing: '最优定价',
  calculate_joint_replenishment: '联合补货',
  calculate_forecast_accuracy: '预测准确度',
  generate_chart: '图表生成',
  analyze_and_chart: '自动分析出图',
  generate_report: '报告生成',
};
