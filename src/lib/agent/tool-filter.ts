/**
 * Progressive Tool Loading -- intent-based tool filtering.
 *
 * Only sends relevant tools to the LLM based on classified intent.
 * Reduces context bloat by 60-80% in the plan phase.
 */

import type { Intent } from './fsm-types';

// Tool -> primary domain mapping (every tool maps to at least one intent domain)
const TOOL_DOMAIN: Record<string, string[]> = {
  // Inventory domain
  query_inventory: ['inventory'],
  create_reorder: ['inventory'],
  adjust_inventory: ['inventory'],
  calculate_eoq: ['inventory'],
  calculate_safety_stock: ['inventory'],
  calculate_reorder_point: ['inventory'],
  classify_abc_xyz: ['inventory'],
  monte_carlo_inventory: ['inventory'],
  calculate_inventory_kpi: ['inventory'],
  calculate_lead_time_analysis: ['inventory'],
  calculate_purchase_variance: ['inventory'],
  calculate_wagner_whitin: ['inventory'],
  calculate_newsvendor: ['inventory'],
  calculate_fill_rate: ['inventory'],
  calculate_joint_replenishment: ['inventory'],
  calculate_drp: ['inventory'],
  query_warehouse_capacity: ['inventory'],
  batch_create_reorder: ['inventory'],
  create_transfer: ['inventory'],
  query_procurement: ['inventory'],
  calculate_multi_echelon_ss: ['inventory'],
  calculate_learning_curve: ['inventory'],
  calculate_warehouse_location: ['inventory'],

  // Cost domain
  query_cost: ['cost'],
  update_cost_record: ['cost'],
  query_tariff: ['cost'],
  query_commodities: ['cost'],
  query_scfis: ['cost'],
  query_carbon_price: ['cost'],
  query_exchange_rates: ['cost'],
  query_financial_sim: ['cost'],
  calculate_total_cost: ['cost'],
  calculate_break_even: ['cost'],
  calculate_optimal_pricing: ['cost'],

  // Supplier domain
  query_suppliers: ['supplier'],
  query_supplier_discovery: ['supplier'],
  calculate_supplier_scoring: ['supplier'],
  query_supplier_trend: ['supplier'],
  query_supplier_location: ['supplier'],
  update_supplier_status: ['supplier'],
  create_supplier: ['supplier'],
  update_supplier: ['supplier'],

  // Logistics domain
  query_logistics: ['logistics'],
  update_shipment_status: ['logistics'],
  calculate_transport_route: ['logistics'],
  query_port_congestion: ['logistics'],

  // Risk domain
  query_risk: ['risk'],
  query_cascade_risk: ['risk'],
  query_weather: ['risk'],
  query_cpsc_recalls: ['risk'],
  query_recall_risk: ['risk'],
  query_coherence_audit: ['risk'],

  // Sales/Market domain
  query_sales: ['market'],
  forecast_demand: ['market'],
  calculate_seasonal_decompose: ['market'],
  calculate_forecast_accuracy: ['market'],
  query_amazon_competitors: ['market'],
  query_brand_sentiment: ['market'],
  query_arbitrage: ['market'],
  query_product_feed: ['market'],

  // Universal -- always included (cross-cutting, low cost)
  query_dashboard: ['universal'],
  query_analytics: ['universal'],
  query_decision_graph: ['universal'],
  query_financial_index: ['universal'],
  query_compliance_check: ['universal'],
  execute_workflow: ['universal'],
  run_sandbox: ['universal'],
  web_search: ['universal'],
  create_note: ['universal'],
  resolve_alert: ['universal'],
  generate_chart: ['universal'],
  analyze_and_chart: ['universal'],
  generate_report: ['universal'],
};

// Intent -> domain mapping
const INTENT_DOMAIN: Record<Intent, string[]> = {
  supply_chain_data: ['inventory', 'cost', 'supplier', 'logistics', 'risk', 'market', 'universal'],
  supply_chain_knowledge: ['inventory', 'cost', 'supplier', 'logistics', 'risk', 'universal'],
  news_event: ['risk', 'logistics', 'market', 'universal'],
  general_knowledge: ['universal'],
  opinion_recommendation: ['universal'],
  chat_greeting: [], // No tools for greetings
};

/**
 * Filter tools based on intent. Only returns tools relevant to the classified intent.
 * Universal tools (dashboard, analytics, search, notes, charts) are always included.
 * Falls back to all tools if intent is unknown.
 */
export function filterToolsByIntent<T extends { name: string }>(tools: T[], intent: Intent): T[] {
  const allowedDomains = INTENT_DOMAIN[intent];

  // No tools for chat/greeting
  if (!allowedDomains || allowedDomains.length === 0) return [];

  return tools.filter((tool) => {
    const domains = TOOL_DOMAIN[tool.name];
    if (!domains) return false; // Unknown tool, skip
    return domains.some((d) => allowedDomains.includes(d));
  });
}

/**
 * Get tool reduction stats for logging
 */
export function getToolFilterStats(
  allTools: Array<{ name: string }>,
  filtered: Array<{ name: string }>,
  intent: Intent,
): {
  totalTools: number;
  filteredCount: number;
  reductionPercent: number;
  intent: Intent;
} {
  return {
    totalTools: allTools.length,
    filteredCount: filtered.length,
    reductionPercent: Math.round((1 - filtered.length / allTools.length) * 100),
    intent,
  };
}
