/**
 * MCP Tool Orchestration Layer
 *
 * Enables AI agents to chain multiple MCP tools together in automated workflows.
 * Supports shared context between steps, conditional branching, and result aggregation.
 *
 * From "single tool call" → "multi-step intelligent analysis"
 */

import { executeTool } from '@/lib/mcp/tools';
import { agentMemory } from '@/lib/engine/memory';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface WorkflowStepConfig {
  tool: string;
  params: Record<string, unknown>;
  extractFields: string[];          // Fields to extract from result for shared context
  storeAs: string;                  // Key in shared context
  condition?: {                     // Optional: only run if condition met
    field: string;                  // Check this field in shared context
    operator: 'gt' | 'lt' | 'eq' | 'exists' | 'not_empty';
    value?: unknown;
  };
  onFailure?: 'skip' | 'abort' | 'fallback';
  fallbackResult?: Record<string, unknown>;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  triggerKeywords: string[];         // Auto-trigger on user query containing these
  steps: WorkflowStepConfig[];
  aggregation: {
    summaryTemplate: string;         // Template for final summary
    keyMetrics: string[];            // Fields to highlight in output
  };
}

export interface WorkflowExecutionResult {
  workflowId: string;
  workflowName: string;
  steps: Array<{
    stepIndex: number;
    tool: string;
    status: 'success' | 'failed' | 'skipped' | 'fallback';
    result: unknown;
    extract: Record<string, unknown>;
    duration: number;
  }>;
  sharedContext: Record<string, unknown>;
  summary: string;
  totalDuration: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pre-defined Workflows
// ═══════════════════════════════════════════════════════════════════════════════

export const WORKFLOWS: WorkflowDefinition[] = [
  // ── Workflow 1: Full FX Impact Analysis ───────────────────────────────────
  {
    id: 'wf-fx-impact',
    name: '汇率冲击完整分析',
    description: '当用户询问汇率对业务的影响时，自动串联汇率查询→成本模拟→风险级联分析→决策建议',
    triggerKeywords: ['汇率', '人民币', '美元', '汇率影响', '利润影响', '汇率冲击', 'FX', 'exchange'],
    steps: [
      {
        tool: 'query_exchange_rates',
        params: { action: 'latest', base: 'CNY' },
        extractFields: ['rates', 'timestamp', 'trend'],
        storeAs: 'exchangeData',
      },
      {
        tool: 'query_cost',
        params: {
          action: 'simulate',
          exchangeRateChange: 5, // Will be overridden by dynamic params
        },
        extractFields: ['summary', 'results'],
        storeAs: 'costSimulation',
        condition: { field: 'exchangeData.rates', operator: 'exists' },
      },
      {
        tool: 'query_cascade_risk',
        params: { scenario: 'exchange_shock' },
        extractFields: ['summary', 'propagation', 'sourceNodes'],
        storeAs: 'cascadeRisk',
      },
      {
        tool: 'query_decision_graph',
        params: { domains: ['cost', 'cross_domain'] },
        extractFields: ['actionPlan', 'summary'],
        storeAs: 'decisions',
      },
    ],
    aggregation: {
      summaryTemplate: '## 汇率冲击分析报告\n\n### 当前汇率\n{exchangeData.summary}\n\n### 成本影响\n{成本模拟摘要}\n\n### 级联风险\n{级联风险摘要}\n\n### 建议行动\n{决策建议}',
      keyMetrics: ['exchangeData.rates', 'costSimulation.summary.avgMarginChange', 'cascadeRisk.summary.topAffectedProducts', 'decisions.actionPlan'],
    },
  },

  // ── Workflow 2: Weather Disruption Assessment ─────────────────────────────
  {
    id: 'wf-weather-disruption',
    name: '天气中断评估',
    description: '当用户询问天气对供应链的影响时，串接天气查询→物流风险→级联分析→决策',
    triggerKeywords: ['天气', '台风', '暴雨', '港口', '延误', '天气影响', '风暴'],
    steps: [
      {
        tool: 'query_weather',
        params: { action: 'all' },
        extractFields: ['ports', 'alerts', 'summary'],
        storeAs: 'weatherData',
      },
      {
        tool: 'query_logistics',
        params: { action: 'risks' },
        extractFields: ['risks', 'weatherAlerts'],
        storeAs: 'logisticsRisks',
      },
      {
        tool: 'query_cascade_risk',
        params: { scenario: 'weather_disruption' },
        extractFields: ['summary', 'propagation', 'sourceNodes', 'forwardProjection'],
        storeAs: 'cascadeRisk',
      },
      {
        tool: 'query_decision_graph',
        params: { domains: ['logistics', 'cross_domain'] },
        extractFields: ['actionPlan', 'summary'],
        storeAs: 'decisions',
        condition: { field: 'cascadeRisk.summary.affectedNodes', operator: 'gt', value: 0 },
      },
    ],
    aggregation: {
      summaryTemplate: '## 天气中断评估\n\n### 港口天气\n{weatherData.summary}\n\n### 物流风险\n{logisticsRisks.summary}\n\n### 级联影响\n{级联风险摘要}\n\n### 建议',
      keyMetrics: ['weatherData.summary.riskyPorts', 'cascadeRisk.summary.topAffectedProducts', 'decisions.actionPlan'],
    },
  },

  // ── Workflow 3: Inventory Health Check ────────────────────────────────────
  {
    id: 'wf-inventory-health',
    name: '库存健康检查',
    description: '全面检查库存状态，识别风险产品，生成补货建议',
    triggerKeywords: ['库存', '补货', '缺货', '积压', '库存健康', '周转'],
    steps: [
      {
        tool: 'query_inventory',
        params: { action: 'list' },
        extractFields: ['inventory', 'pagination'],
        storeAs: 'inventory',
      },
      {
        tool: 'query_sales',
        params: { action: 'overview' },
        extractFields: ['productSummaries'],
        storeAs: 'sales',
      },
      {
        tool: 'query_decision_graph',
        params: { domains: ['inventory'] },
        extractFields: ['actionPlan', 'decisions'],
        storeAs: 'decisions',
      },
    ],
    aggregation: {
      summaryTemplate: '## 库存健康检查\n\n### 库存概览\n{inventory.summary}\n\n### 销售趋势\n{sales.summary}\n\n### 补货建议',
      keyMetrics: ['inventory.inventory', 'decisions.actionPlan'],
    },
  },

  // ── Workflow 4: Full Supply Chain Health ──────────────────────────────────
  {
    id: 'wf-full-health',
    name: '供应链全面体检',
    description: '一键运行完整供应链分析：仪表盘→风险→级联风险→决策建议',
    triggerKeywords: ['全面', '体检', '整体', '全局', '概况', '健康', '诊断'],
    steps: [
      {
        tool: 'query_dashboard',
        params: { days: 30 },
        extractFields: ['metrics'],
        storeAs: 'dashboard',
      },
      {
        tool: 'query_risk',
        params: { action: 'dashboard' },
        extractFields: ['overallRisk', 'riskLevel', 'dimensions'],
        storeAs: 'risk',
      },
      {
        tool: 'query_cascade_risk',
        params: { scenario: 'auto' },
        extractFields: ['summary', 'sourceNodes', 'propagation'],
        storeAs: 'cascadeRisk',
      },
      {
        tool: 'query_decision_graph',
        params: { domains: ['cross_domain', 'inventory', 'cost', 'logistics'], includeAll: true },
        extractFields: ['actionPlan', 'summary'],
        storeAs: 'decisions',
      },
    ],
    aggregation: {
      summaryTemplate: '## 供应链全面体检报告\n\n### 仪表盘\n{dashboard.summary}\n\n### 风险评估\n{risk.summary}\n\n### 级联风险\n{级联风险摘要}\n\n### 优先行动\n{决策建议}',
      keyMetrics: ['dashboard.metrics', 'risk.overallRisk', 'cascadeRisk.summary', 'decisions.actionPlan'],
    },
  },

  // ── Workflow 5: Product Deep Dive ─────────────────────────────────────────
  {
    id: 'wf-product-deep-dive',
    name: '产品深度分析',
    description: '对指定产品进行全面分析：成本结构→库存状态→销售趋势→风险影响',
    triggerKeywords: ['产品', '分析', '查看', 'SKU', '详情', '具体'],
    steps: [
      {
        tool: 'query_cost',
        params: { action: 'landed_cost', sku: '{{sku}}' },
        extractFields: ['breakdown', 'totalLanded', 'grossMargin', 'exchangeRate'],
        storeAs: 'cost',
      },
      {
        tool: 'query_inventory',
        params: { action: 'list' },
        extractFields: ['inventory'],
        storeAs: 'inventory',
      },
      {
        tool: 'query_sales',
        params: { action: 'overview' },
        extractFields: ['productSummaries'],
        storeAs: 'sales',
      },
    ],
    aggregation: {
      summaryTemplate: '## 产品分析\n\n### 成本结构\n{cost.breakdown}\n\n### 库存状态\n{inventory.status}\n\n### 销售表现\n{sales.trend}',
      keyMetrics: ['cost.grossMargin', 'inventory'],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Orchestration Engine
// ═══════════════════════════════════════════════════════════════════════════════

/** Get a value from nested shared context using dot notation */
function getFromContext(ctx: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = ctx;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Resolve template variables like {{sku}} from shared context */
function resolveTemplateParams(
  params: Record<string, unknown>,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
      const ctxKey = value.slice(2, -2);
      resolved[key] = getFromContext(context, ctxKey) ?? value;
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/** Check if a condition is met for executing a step */
function checkCondition(
  condition: WorkflowStepConfig['condition'],
  context: Record<string, unknown>,
): boolean {
  if (!condition) return true;

  const fieldValue = getFromContext(context, condition.field);

  switch (condition.operator) {
    case 'exists': return fieldValue !== undefined && fieldValue !== null;
    case 'not_empty': return fieldValue !== undefined && fieldValue !== null && fieldValue !== '' && (!Array.isArray(fieldValue) || fieldValue.length > 0);
    case 'gt': return Number(fieldValue) > Number(condition.value);
    case 'lt': return Number(fieldValue) < Number(condition.value);
    case 'eq': return String(fieldValue) === String(condition.value);
    default: return true;
  }
}

/** Extract specific fields from a tool result into shared context */
function extractFields(result: unknown, fields: string[]): Record<string, unknown> {
  const extracted: Record<string, unknown> = {};
  if (!result || typeof result !== 'object') return extracted;

  const data = result as Record<string, unknown>;
  for (const field of fields) {
    if (field in data) {
      extracted[field] = data[field];
    }
  }
  // Also store the full result
  extracted._full = result;
  return extracted;
}

/** Execute a single workflow */
export async function executeWorkflow(
  workflowId: string,
  initialContext: Record<string, unknown> = {},
): Promise<WorkflowExecutionResult> {
  const workflow = WORKFLOWS.find(w => w.id === workflowId);
  if (!workflow) throw new Error(`未找到工作流: ${workflowId}。可用: ${WORKFLOWS.map(w => w.id).join(', ')}`);

  const sharedContext: Record<string, unknown> = { ...initialContext };
  const stepResults: WorkflowExecutionResult['steps'] = [];
  const startTime = Date.now();

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    const stepStart = Date.now();

    // Check condition
    if (step.condition && !checkCondition(step.condition, sharedContext)) {
      stepResults.push({
        stepIndex: i, tool: step.tool, status: 'skipped',
        result: null, extract: {}, duration: Date.now() - stepStart,
      });
      continue;
    }

    // Resolve template params
    const resolvedParams = resolveTemplateParams(step.params, sharedContext);

    // Execute tool
    try {
      const result = await executeTool(step.tool, resolvedParams);
      const extract = extractFields(result, step.extractFields);

      // Store in shared context
      sharedContext[step.storeAs] = step.storeAs === 'inventory' && extract._full
        ? { summary: `${Array.isArray((extract._full as Record<string, unknown>).inventory) ? ((extract._full as Record<string, unknown>).inventory as unknown[]).length : 0} 条库存记录`, ...extract }
        : step.storeAs === 'cost' && extract._full
          ? { summary: `毛利率 ${(extract._full as Record<string, unknown>).grossMargin}%`, ...extract }
          : { ...extract, _summary: `${step.tool} 执行成功` };

      stepResults.push({
        stepIndex: i, tool: step.tool, status: 'success',
        result, extract, duration: Date.now() - stepStart,
      });
    } catch (err) {
      if (step.onFailure === 'abort') throw err;

      const fallback = step.onFailure === 'fallback' && step.fallbackResult
        ? step.fallbackResult
        : { error: String(err) };

      stepResults.push({
        stepIndex: i, tool: step.tool, status: step.onFailure === 'fallback' ? 'fallback' : 'failed',
        result: fallback, extract: fallback, duration: Date.now() - stepStart,
      });

      sharedContext[step.storeAs] = { error: String(err), _summary: `${step.tool} 失败: ${String(err)}` };
    }
  }

  // Build summary from template
  let summary = workflow.aggregation.summaryTemplate;
  for (const [key, value] of Object.entries(sharedContext)) {
    const strValue = typeof value === 'object' ? JSON.stringify(value).slice(0, 200) : String(value);
    summary = summary.replace(`{${key}.summary}`, strValue);
    summary = summary.replace(`{${key}}`, strValue);
  }
  // Clean unreplaced template vars
  summary = summary.replace(/\{[^}]+\}/g, '（数据暂缺）');

  // Write to shared agent memory (read sandbox context for cross-agent awareness)
  const sandboxCtx = agentMemory.getSharedContext().sandbox;
  agentMemory.updateShared('mcpOrchestrator', {
    lastRun: new Date().toISOString(),
    lastWorkflowId: workflow.id,
    lastSummary: summary,
    success: stepResults.every(s => s.status === 'success'),
  });

  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    steps: stepResults,
    sharedContext: { ...sharedContext, sandboxContext: sandboxCtx },
    summary,
    totalDuration: Date.now() - startTime,
  };
}

/** Auto-detect which workflow(s) to run based on user query */
export function detectWorkflows(query: string): WorkflowDefinition[] {
  const q = query.toLowerCase();
  return WORKFLOWS.filter(w =>
    w.triggerKeywords.some(kw => q.includes(kw.toLowerCase()))
  );
}

/** Get all registered workflows (for MCP tool listing) */
export function getWorkflows(): Array<{ id: string; name: string; description: string; triggerKeywords: string[]; stepCount: number }> {
  return WORKFLOWS.map(w => ({
    id: w.id, name: w.name, description: w.description,
    triggerKeywords: w.triggerKeywords, stepCount: w.steps.length,
  }));
}
