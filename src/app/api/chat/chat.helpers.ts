/**
 * Chat API Helpers — utility functions extracted from route.ts for modularity.
 *
 * Contains: SSE formatting, tool result formatting, DeepSeek tool call detection,
 * default tool actions, routing decision, and local-mode keyword matching.
 */
import { classifyIntent } from '@/lib/services/information-router';
import type { RoutingDecision } from '@/lib/services/information-router';
import { formatToolResult, DEFAULT_TOOL_ACTIONS } from '@/lib/mcp/tool-formatters';

// ─── SSE Helpers ────────────────────────────────────────────────────────────────

export function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function streamSSE(controller: ReadableStreamDefaultController, event: string, data: unknown): void {
  controller.enqueue(new TextEncoder().encode(formatSSE(event, data)));
}

// Re-export shared tool formatters (route.ts imports these from chat.helpers)
export { formatToolResult, DEFAULT_TOOL_ACTIONS };

// ─── DeepSeek Tool Call Text Detection ────────────────────────────────────────────

/** Known tool names for detecting when DeepSeek emits tool calls as text */
export const KNOWN_TOOL_NAMES = [
  'query_inventory', 'query_cost', 'query_sales', 'query_logistics',
  'query_suppliers', 'query_dashboard', 'query_risk', 'query_analytics',
  'query_exchange_rates', 'query_weather', 'query_tariff', 'query_cascade_risk',
  'query_decision_graph', 'query_commodities', 'query_scfis', 'query_carbon_price',
  'query_cpsc_recalls', 'query_port_congestion', 'query_financial_index',
  'execute_workflow', 'run_sandbox',
  'web_search', 'adjust_inventory', 'create_reorder', 'create_note', 'update_shipment_status',
];

/**
 * Check if a text token looks like it might be the start of a tool call
 * (DeepSeek bug: emits function calls as plain text)
 */
export function isToolCallText(token: string): boolean {
  for (const name of KNOWN_TOOL_NAMES) {
    if (token.includes(name + '(') || token.startsWith(name)) return true;
  }
  return false;
}

/**
 * Extract tool calls that DeepSeek emitted as plain text instead of tool_calls.
 * Matches patterns like: `tool_name({"key": "value"})`
 */
export function extractToolCallsFromText(text: string): Array<{ id: string; function: { name: string; arguments: string } }> {
  const results: Array<{ id: string; function: { name: string; arguments: string } }> = [];
  const toolNames = KNOWN_TOOL_NAMES.join('|');
  const regex = new RegExp(`(${toolNames})\\s*\\(\\s*(\\{[\\s\\S]*?\\})\\s*\\)`, 'g');
  let match;
  while ((match = regex.exec(text)) !== null) {
    results.push({
      id: crypto.randomUUID(),
      function: { name: match[1], arguments: match[2].trim() },
    });
  }
  return results;
}

// ─── Intent-Aware Search Gating ───────────────────────────────────────────────────

export function getRoutingDecision(query: string): RoutingDecision {
  return classifyIntent(query);
}

// ─── Local Mode Keyword Matching ─────────────────────────────────────────────────

export type ToolAction = { tool: string; action: string; params: Record<string, unknown> };

export function hasKeyword(text: string, keywords: string[]): boolean {
  return keywords.some(k => text.includes(k));
}

export function matchToolsToQuery(query: string): ToolAction[] {
  const q = query.toLowerCase();
  const actions: ToolAction[] = [];

  // Inventory-related
  if (hasKeyword(q, ['库存', '缺货', '补货', '周转', '滞销', '安全库存', 'inventory'])) {
    actions.push({ tool: 'query_inventory', action: 'overview', params: { action: 'overview' } });
    if (hasKeyword(q, ['缺货', '补货', '紧急'])) actions.push({ tool: 'query_inventory', action: 'reorder', params: { action: 'reorder' } });
  }

  // Cost-related
  if (hasKeyword(q, ['成本', '毛利', '费用', '利润', 'margin', 'cost'])) {
    actions.push({ tool: 'query_cost', action: 'overview', params: { action: 'overview' } });
  }

  // Sales-related
  if (hasKeyword(q, ['销售', '收入', '订单', '增长', 'sales'])) {
    actions.push({ tool: 'query_sales', action: 'overview', params: { action: 'overview', days: '7' } });
  }

  // Logistics
  if (hasKeyword(q, ['物流', '货运', '航运', '港口', '延迟', 'delivery', 'ship'])) {
    actions.push({ tool: 'query_logistics', action: 'stats', params: { action: 'stats' } });
  }

  // Risk / Cascade risk
  if (hasKeyword(q, ['风险', 'risk', '中断', '传播', 'cascade'])) {
    actions.push({ tool: 'query_cascade_risk', action: '', params: { scenario: 'auto' } });
  }

  // Suppliers
  if (hasKeyword(q, ['供应商', 'supplier'])) {
    actions.push({ tool: 'query_suppliers', action: 'list', params: { action: 'list' } });
  }

  // Dashboard overview
  if (hasKeyword(q, ['概览', '仪表', 'dashboard', '整体', '健康', '总览'])) {
    actions.push({ tool: 'query_dashboard', action: 'summary', params: { action: 'summary' } });
  }

  // Exchange rates
  if (hasKeyword(q, ['汇率', '人民币', '美元', '欧元', '外汇', 'fx', 'cny', 'usd'])) {
    actions.push({ tool: 'query_exchange_rates', action: 'latest', params: { action: 'latest', base: 'CNY' } });
  }

  // Weather
  if (hasKeyword(q, ['天气', '台风', '海况', 'weather', '气候'])) {
    actions.push({ tool: 'query_weather', action: 'summary', params: { action: 'summary' } });
  }

  // Decision graph
  if (hasKeyword(q, ['决策', '建议', '怎么办', '如何', '怎么', '方案', '优化', '改善'])) {
    actions.push({ tool: 'query_decision_graph', action: '', params: { query } });
  }

  // If nothing matched, give a dashboard + inventory overview
  if (actions.length === 0) {
    actions.push({ tool: 'query_dashboard', action: 'summary', params: { action: 'summary' } });
    actions.push({ tool: 'query_inventory', action: 'overview', params: { action: 'overview' } });
  }

  return actions.slice(0, 4);
}
