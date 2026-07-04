#!/usr/bin/env tsx
/**
 * A/B 测试运行脚本 — DeepSeek-only (A) vs Hybrid 路由策略 (B)。
 *
 * 策略 A (Baseline):
 *   - 所有 82 个工具一次性暴露给 LLM
 *   - 通用 system prompt
 *   - 当前生产配置
 *
 * 策略 B (Hybrid Routing):
 *   - 基于关键词的家族分类器（crud/operations/intelligence/supply-chain/supplier-graph）
 *   - 仅向 LLM 暴露相关家族的工具（+ 少量跨家族通用工具）
 *   - 家族专属 system prompt（含针对性 few-shot 示例）
 *   - 目标：减少 WRONG_TOOL 失败（基线 5/6 失败为 WRONG_TOOL）
 *
 * 用法:
 *   npx tsx tests/reliability/run-ab-test.ts                    # 全部 121 用例 A/B 对比
 *   npx tsx tests/reliability/run-ab-test.ts --limit 30         # 仅前 30 用例（快速验证）
 *   npx tsx tests/reliability/run-ab-test.ts --family intelligence  # 仅 intelligence 家族
 *
 * 环境变量:
 *   OPENCODE_API_KEY    OpenCode Go 套餐密钥（必需）
 *   OPENCODE_BASE_URL   上游 API 地址（默认: https://opencode.ai/zen/go/v1）
 *   OPENCODE_MODEL      模型 ID（默认: deepseek-v4-pro）
 */

import {
  runBenchmark,
  formatJsonReport,
  DEFAULT_CONFIG,
  type BenchmarkConfig,
  type BenchmarkReport,
} from './provider-benchmark';
import { getCaseCount, getFamilyStats, getCoveredTools } from './tool-cases';
import { getAllToolNames } from './tool-schema-validator';
import type { ToolFamily } from './tool-cases';
import type {
  ProviderAdapter,
  StreamOpts,
  TokenChunk,
  ToolCallChunk,
  Classification,
} from '@/lib/agent/adapter';
import type { ChatMessage } from '@/lib/services/ai-providers.service';
import type { MCPTool } from '@/lib/mcp/tools';
import type { ToolCall } from '@/lib/agent/fsm-types';
import { TOOL_DISPLAY_NAMES } from '@/lib/agent/fsm-types';
import { crudTools } from '@/lib/mcp/tools-crud';
import { operationsTools } from '@/lib/mcp/tools-operations';
import { intelligenceTools } from '@/lib/mcp/tools-intelligence';
import { supplyChainTools } from '@/lib/mcp/tools-supply-chain';
import { supplierGraphTools } from '@/lib/mcp/tools-supplier-graph';
import * as fs from 'fs';
import * as path from 'path';

// ─── 配置 ────────────────────────────────────────────────────────────────────

const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1';
const OPENCODE_MODEL = process.env.OPENCODE_MODEL || 'deepseek-v4-pro';

// ─── 家族分类器（关键词路由） ────────────────────────────────────────────────

/**
 * 基于关键词的查询家族分类器。
 * 模拟生产环境中的轻量级意图路由（非 LLM 分类，零延迟）。
 */
const FAMILY_KEYWORDS: Record<ToolFamily, string[]> = {
  'supplier-graph': [
    '依赖', 'dependency', '影响分析', 'impact', '瓶颈', 'chokepoint',
    '地理风险', 'geo', '层级', 'tier', '供应商健康', 'health',
    '演化', 'evolution', '组件树', 'component tree', '供应商网络图', 'supplier graph',
    '供应链图谱', '网络图',
  ],
  'supply-chain': [
    'EOQ', '经济订货', '安全库存', 'safety stock', '再订货点', 'ROP',
    'ABC分类', 'abc', '需求预测', 'forecast', '季节性', 'seasonal',
    '蒙特卡洛', 'monte carlo', ' Wagner-Whitin', '瓦格纳', '牛鞭效应',
    'DRP', '分销资源', '仓库选址', 'warehouse location', '路径优化', 'route',
    '多级库存', 'multi-echelon', 'KPI', 'fill rate', '订单满足率',
    '交付周期', 'lead time', '采购批量', '采购价', '总成本', 'TCO',
    '供应商评分', 'supplier score', '学习曲线', 'learning curve',
    '盈亏平衡', 'break-even', '定价', 'pricing', '联合补货', '财务分析',
    'financial analysis', '生产计划',
  ],
  'intelligence': [
    '综合分析', 'analytics', '级联风险', 'cascade', '决策图', 'decision graph',
    '因果', 'causal', '反事实', '汇率', 'exchange rate', '天气', 'weather',
    '港口拥堵', 'port congestion', '运费指数', 'scfi', '碳排放', 'carbon',
    '财务模拟', 'financial simulation', '亚马逊', 'amazon', '情感分析',
    'sentiment', '供应链金融', 'cpsc', '合规', 'compliance',
    '关税', 'tariff', '沙盒', 'sandbox', '工作流', 'workflow',
    '召回', 'recall', '一致性', 'coherence', '套利', 'arbitrage',
    '发现', 'discovery', '网页', 'web search', '图表', 'chart',
    '分析报告', '趋势分析', '综合评估', '风险传播', '连锁影响',
  ],
  'operations': [
    '补货', 'reorder', '批量补货', '发货', 'shipment', '运输状态',
    '库存调整', 'adjust', '成本更新', 'cost update', '备注', 'note',
    '告警', 'alert', '供应商状态', 'supplier status', '创建供应商',
    '更新供应商', '调拨', '转移', 'transfer', '创建转移',
  ],
  'crud': [
    '查询', '查一下', '查看', '库存情况', '成本分解', '销售数据',
    '物流', '供应商列表', '仪表盘', 'dashboard', '风险分析',
    '仓库容量', '采购订单', '趋势', '概览', '详情', '列表',
  ],
};

/**
 * 对用户输入进行家族分类。
 * 返回最匹配的家族；若多家族命中，返回命中关键词最多的家族。
 */
function classifyFamily(userInput: string): ToolFamily {
  const lower = userInput.toLowerCase();
  const scores: Record<ToolFamily, number> = {
    'crud': 0,
    'operations': 0,
    'intelligence': 0,
    'supply-chain': 0,
    'supplier-graph': 0,
  };

  for (const [family, keywords] of Object.entries(FAMILY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        scores[family as ToolFamily]++;
      }
    }
  }

  // 返回得分最高的家族；平局时按优先级（更具体的家族优先）
  const priority: ToolFamily[] = [
    'supplier-graph', 'supply-chain', 'intelligence', 'operations', 'crud',
  ];
  let best: ToolFamily = 'crud';
  let bestScore = 0;
  for (const f of priority) {
    if (scores[f] > bestScore) {
      bestScore = scores[f];
      best = f;
    }
  }
  return best;
}

// ─── 家族专属 System Prompt ──────────────────────────────────────────────────

const FAMILY_PROMPTS: Record<ToolFamily, string> = {
  'crud': `You are a supply chain data query assistant. The user wants to query basic CRUD data (inventory, cost, sales, logistics, suppliers, dashboard, risk, warehouse).
Available tools are filtered to the CRUD family. Select the most specific tool matching the user's request.
- query_inventory: 库存查询（overview/list/forecast/risk/detail/slow_moving/reorder）
- query_cost: 成本查询（overview/list/detail/benchmark/optimization/trend）
- query_sales: 销售查询
- query_logistics: 物流查询
- query_suppliers: 供应商列表查询
- query_supplier_location: 供应商地理位置查询
- query_supplier_trend: 供应商趋势分析
- query_dashboard: 仪表盘概览
- query_risk: 风险查询
- query_procurement: 采购订单查询
- query_warehouse_capacity: 仓库容量查询
Call the most appropriate tool.`,

  'operations': `You are a supply chain operations assistant. The user wants to perform operational actions (reorder, shipment, inventory adjust, cost update, notes, alerts, supplier management, transfers).
Available tools are filtered to the Operations family. Key distinctions:
- create_reorder / batch_reorder: 创建补货订单（单SKU / 多SKU批量）
- query_shipment_status: 查询发货状态
- adjust_inventory: 调整库存
- update_cost: 更新成本
- create_note: 创建备注
- create_alert: 创建告警
- update_supplier_status: 更新供应商状态
- create_supplier: 创建供应商
- update_supplier: 更新供应商信息
- create_transfer: 创建库存转移/调拨操作（从A仓转到B仓）。注意：不是查询库存，是执行转移。
Call the most appropriate tool.`,

  'intelligence': `You are a supply chain intelligence assistant. The user wants advanced analytics, risk assessment, decision support, market intelligence, or business simulation.
Available tools are filtered to the Intelligence family. Key distinctions:
- query_analytics: 综合分析多个数据源（库存+成本+销售+供应商），用于"分析报告""综合评估""趋势分析"。不要用于查询单一数据源。
- query_cascade_risk: 级联风险评估（多风险因子传播），用于"级联风险""风险传播""综合风险""连锁影响"。不要用于查询单一风险因子（天气用 query_weather、汇率用 query_exchange_rates、港口用 query_port_congestion）。
- query_decision_graph: 决策推理图（因果分析+反事实推理），用于"决策图""因果分析""反事实""推理链"。不要用于查看仪表盘概览。
- execute_workflow: 执行自动化工作流，用于"执行工作流""自动化流程""批量操作"。
- query_weather / query_exchange_rates / query_port_congestion: 单一风险因子查询
- query_tariff: 关税查询
- run_sandbox: 沙盒模拟
- query_compliance: 合规检查
- query_sentiment: 情感分析
- query_chart / analyze_chart: 图表生成与分析
- generate_report: 生成分析报告
Call the most appropriate tool.`,

  'supply-chain': `You are a supply chain optimization assistant. The user wants to use supply chain models and algorithms (EOQ, safety stock, forecasting, network optimization, financial analysis, pricing).
Available tools are filtered to the Supply Chain optimization family. Select the algorithm matching the user's request.
- calculate_eoq: 经济订货批量
- calculate_safety_stock: 安全库存
- calculate_reorder_point: 再订货点
- abc_analysis: ABC分类
- forecast_demand: 需求预测
- analyze_seasonality: 季节性分析
- monte_carlo_simulation: 蒙特卡洛模拟
- wagner_whitin: Wagner-Whitin 算法
- analyze_bullwhip: 牛鞭效应分析
- drp_optimization: 分销资源计划
- optimize_warehouse_location: 仓库选址
- optimize_route: 路径优化
- multi_echelon_optimization: 多级库存优化
- calculate_kpi: KPI 计算
- calculate_fill_rate: 订单满足率
- analyze_lead_time: 交付周期分析
- calculate_purchase_quantity: 采购批量
- calculate_total_cost: 总成本分析
- score_supplier: 供应商评分
- analyze_learning_curve: 学习曲线
- break_even_analysis: 盈亏平衡
- optimize_pricing: 定价优化
- joint_replenishment: 联合补货
- financial_analysis: 财务分析
Call the most appropriate tool.`,

  'supplier-graph': `You are a supplier network graph analysis assistant. The user wants to analyze supplier dependencies, impacts, chokepoints, geographic risks, tiers, health, evolution, or component trees.
Available tools are filtered to the Supplier Graph family. Select the graph analysis tool matching the user's request.
- query_supplier_graph: 供应商网络图
- query_supplier_dependency: 依赖关系
- query_supplier_impact: 影响分析
- query_chokepoints: 瓶颈分析
- query_geo_risk: 地理风险
- query_supplier_tiers: 层级分析
- query_supplier_health: 供应商健康
- query_supplier_evolution: 演化分析
- query_component_tree: 组件树
Call the most appropriate tool.`,
};

// ─── 家族工具子集映射 ────────────────────────────────────────────────────────

const FAMILY_TOOLS: Record<ToolFamily, MCPTool[]> = {
  'crud': crudTools,
  'operations': operationsTools,
  'intelligence': intelligenceTools,
  'supply-chain': supplyChainTools,
  'supplier-graph': supplierGraphTools,
};

// ─── OpenCode Go Adapter（基线，全工具） ─────────────────────────────────────

class OpenCodeGoAdapter implements ProviderAdapter {
  readonly providerId = 'opencode-go';
  readonly defaultModel = OPENCODE_MODEL;

  protected apiKey: string;
  protected model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || this.defaultModel;
  }

  normalizeMessages(messages: ChatMessage[]): unknown[] {
    return messages.map(m => {
      const normalized: Record<string, unknown> = { role: m.role, content: m.content || '' };
      if (m.name) normalized.name = m.name;
      if (m.tool_call_id) normalized.tool_call_id = m.tool_call_id;
      return normalized;
    });
  }

  normalizeTools(tools: MCPTool[]): unknown[] {
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  async *streamText(): AsyncGenerator<TokenChunk> {
    yield { type: 'done' };
  }

  async *streamWithTools(): AsyncGenerator<ToolCallChunk> {
    yield { type: 'done' };
  }

  async callWithTools(
    messages: ChatMessage[],
    tools: MCPTool[],
    _opts?: StreamOpts,
  ): Promise<{ toolCalls: ToolCall[]; content: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(`${OPENCODE_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: this.normalizeMessages(messages),
          tools: this.normalizeTools(tools),
          tool_choice: 'auto',
          thinking: { type: 'disabled' },
          max_tokens: 2000,
          temperature: 0,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`OpenCode Go API error ${response.status}: ${errText.slice(0, 300)}`);
      }

      const data = await response.json() as {
        choices?: Array<{
          message?: {
            tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
            content?: string;
          };
        }>;
      };

      const msg = data.choices?.[0]?.message;
      const content = msg?.content || '';
      const rawCalls = (msg?.tool_calls as unknown[]) || [];

      const toolCalls: ToolCall[] = [];
      for (const raw of rawCalls) {
        const tc = raw as { function?: { name?: string; arguments?: string } };
        if (tc?.function?.name) {
          try {
            const params = JSON.parse(tc.function.arguments || '{}');
            toolCalls.push({
              name: tc.function.name,
              params,
              displayName: TOOL_DISPLAY_NAMES[tc.function.name] || tc.function.name,
            });
          } catch {
            // 参数 JSON 解析失败，跳过
          }
        }
      }

      if (toolCalls.length === 0 && content) {
        const textCalls = this.parseToolCallsFromText(content);
        toolCalls.push(...textCalls);
      }

      return { toolCalls, content };
    } finally {
      clearTimeout(timeout);
    }
  }

  async classify(): Promise<Classification> {
    return { intent: 'supply_chain_data', confidence: 0.5, reason: 'benchmark' };
  }

  parseToolCalls(_rawContent: string, structuredToolCalls: unknown[]): ToolCall[] {
    const calls: ToolCall[] = [];
    for (const raw of structuredToolCalls) {
      const tc = raw as { function?: { name?: string; arguments?: string } };
      if (tc?.function?.name) {
        try {
          const params = JSON.parse(tc.function.arguments || '{}');
          calls.push({
            name: tc.function.name,
            params,
            displayName: TOOL_DISPLAY_NAMES[tc.function.name] || tc.function.name,
          });
        } catch { /* skip */ }
      }
    }
    return calls;
  }

  protected parseToolCallsFromText(text: string): ToolCall[] {
    const results: ToolCall[] = [];
    const jsonBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g;
    let match;
    while ((match = jsonBlockRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.name && parsed.params) {
          results.push({
            name: parsed.name,
            params: parsed.params,
            displayName: TOOL_DISPLAY_NAMES[parsed.name] || parsed.name,
          });
        }
      } catch { /* skip */ }
    }
    const xmlRegex = /<tool>\s*([\w_]+)\s*<\/tool>\s*<params>\s*(\{[\s\S]*?\})\s*<\/params>/g;
    while ((match = xmlRegex.exec(text)) !== null) {
      try {
        const params = JSON.parse(match[2]);
        results.push({
          name: match[1],
          params,
          displayName: TOOL_DISPLAY_NAMES[match[1]] || match[1],
        });
      } catch { /* skip */ }
    }
    return results;
  }

  resolveApiKey(): string | undefined { return this.apiKey; }
  resolveModel(): string { return this.model; }
}

// ─── Hybrid Adapter（策略 B：家族路由 + 工具过滤） ───────────────────────────

/**
 * HybridAdapter — 在 OpenCodeGoAdapter 基础上增加：
 * 1. 基于关键词的家族分类
 * 2. 工具子集过滤（仅暴露相关家族工具）
 * 3. 家族专属 system prompt
 *
 * 注意：callWithTools 接收的 messages[0] 是通用 system prompt，
 * 此处会替换为家族专属 prompt，并对 tools 进行过滤。
 */
class HybridAdapter extends OpenCodeGoAdapter {
  /** 路由统计：记录分类器对每个用例的家族判断 */
  routingLog: Array<{ userInput: string; classifiedFamily: ToolFamily; toolCount: number }> = [];

  async callWithTools(
    messages: ChatMessage[],
    tools: MCPTool[],
    opts?: StreamOpts,
  ): Promise<{ toolCalls: ToolCall[]; content: string }> {
    // 从 user message 提取输入文本进行分类
    const userMessage = messages.find(m => m.role === 'user');
    const userInput = userMessage?.content || '';
    const family = classifyFamily(userInput);
    const filteredTools = FAMILY_TOOLS[family];

    this.routingLog.push({
      userInput: userInput.slice(0, 80),
      classifiedFamily: family,
      toolCount: filteredTools.length,
    });

    // 替换 system prompt 为家族专属
    const familyPrompt = FAMILY_PROMPTS[family];
    const newMessages: ChatMessage[] = [
      { role: 'system', content: familyPrompt },
      ...messages.filter(m => m.role !== 'system'),
    ];

    return super.callWithTools(newMessages, filteredTools, opts);
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

interface CliArgs {
  limit: number;
  family?: ToolFamily;
  output: string;
  concurrency: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: CliArgs = {
    limit: 0,
    output: './tests/reliability/reports',
    concurrency: 3,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    switch (arg) {
      case '--limit':
        if (next) { parsed.limit = parseInt(next, 10) || 0; i++; }
        break;
      case '--family':
        if (next && ['crud', 'operations', 'intelligence', 'supply-chain', 'supplier-graph'].includes(next)) {
          parsed.family = next as ToolFamily; i++;
        }
        break;
      case '--output':
        if (next) { parsed.output = next; i++; }
        break;
      case '--concurrency':
        if (next) { parsed.concurrency = parseInt(next, 10) || 3; i++; }
        break;
    }
  }
  return parsed;
}

// ─── A/B 对比报告 ────────────────────────────────────────────────────────────

interface ABComparison {
  strategyA: BenchmarkReport;
  strategyB: BenchmarkReport;
  routingLog: Array<{ userInput: string; classifiedFamily: ToolFamily; toolCount: number }>;
  deltaSuccessRate: number;
  deltaP95Latency: number;
  perFamilyComparison: Array<{
    family: ToolFamily;
    aPassed: number;
    aTotal: number;
    aSuccessRate: number;
    bPassed: number;
    bTotal: number;
    bSuccessRate: number;
    delta: number;
  }>;
  flippedCases: Array<{
    caseId: string;
    aResult: 'pass' | 'fail';
    bResult: 'pass' | 'fail';
    flip: 'A→B improved' | 'A→B regressed';
  }>;
  summary: string;
}

function buildComparison(
  reportA: BenchmarkReport,
  reportB: BenchmarkReport,
  routingLog: Array<{ userInput: string; classifiedFamily: ToolFamily; toolCount: number }>,
): ABComparison {
  const deltaSuccessRate = reportB.stats.successRate - reportA.stats.successRate;
  const deltaP95Latency = reportB.stats.p95LatencyMs - reportA.stats.p95LatencyMs;

  // 按家族对比
  const families: ToolFamily[] = ['crud', 'operations', 'intelligence', 'supply-chain', 'supplier-graph'];
  const perFamilyComparison = families.map(family => {
    const aCases = reportA.stats.caseResults.filter(cr => {
      const id = cr.caseId;
      return id.startsWith(family === 'supply-chain' ? 'sc-' : family === 'supplier-graph' ? 'sg-' : family === 'crud' ? 'crud-' : family === 'operations' ? 'op-' : 'intel-');
    });
    const bCases = reportB.stats.caseResults.filter(cr => {
      const id = cr.caseId;
      return id.startsWith(family === 'supply-chain' ? 'sc-' : family === 'supplier-graph' ? 'sg-' : family === 'crud' ? 'crud-' : family === 'operations' ? 'op-' : 'intel-');
    });
    const aPassed = aCases.filter(c => c.passed).length;
    const bPassed = bCases.filter(c => c.passed).length;
    const aTotal = aCases.length;
    const bTotal = bCases.length;
    return {
      family,
      aPassed,
      aTotal,
      aSuccessRate: aTotal > 0 ? Math.round((aPassed / aTotal) * 1000) / 10 : 0,
      bPassed,
      bTotal,
      bSuccessRate: bTotal > 0 ? Math.round((bPassed / bTotal) * 1000) / 10 : 0,
      delta: bTotal > 0 && aTotal > 0 ? Math.round(((bPassed / bTotal) - (aPassed / aTotal)) * 1000) / 10 : 0,
    };
  });

  // 翻转用例（A 通过 B 失败，或 A 失败 B 通过）
  const flippedCases: ABComparison['flippedCases'] = [];
  for (const crA of reportA.stats.caseResults) {
    const crB = reportB.stats.caseResults.find(c => c.caseId === crA.caseId);
    if (!crB) continue;
    if (crA.passed && !crB.passed) {
      flippedCases.push({
        caseId: crA.caseId,
        aResult: 'pass',
        bResult: 'fail',
        flip: 'A→B regressed',
      });
    } else if (!crA.passed && crB.passed) {
      flippedCases.push({
        caseId: crA.caseId,
        aResult: 'fail',
        bResult: 'pass',
        flip: 'A→B improved',
      });
    }
  }

  // 总结
  const improved = flippedCases.filter(f => f.flip === 'A→B improved').length;
  const regressed = flippedCases.filter(f => f.flip === 'A→B regressed').length;
  let summary: string;
  if (deltaSuccessRate > 0) {
    summary = `策略 B（Hybrid 路由）优于策略 A（Baseline）：成功率 +${deltaSuccessRate}pp，改善 ${improved} 例，回退 ${regressed} 例`;
  } else if (deltaSuccessRate < 0) {
    summary = `策略 A（Baseline）优于策略 B（Hybrid 路由）：成功率 ${deltaSuccessRate}pp，改善 ${improved} 例，回退 ${regressed} 例`;
  } else {
    summary = `两策略成功率持平：改善 ${improved} 例，回退 ${regressed} 例（净变化 ${improved - regressed}）`;
  }

  return {
    strategyA: reportA,
    strategyB: reportB,
    routingLog,
    deltaSuccessRate,
    deltaP95Latency,
    perFamilyComparison,
    flippedCases,
    summary,
  };
}

function formatComparisonMarkdown(cmp: ABComparison): string {
  const { strategyA: a, strategyB: b } = cmp;
  const lines: string[] = [
    '# A/B 测试对比报告：DeepSeek-only vs Hybrid 路由策略',
    '',
    `**生成时间**: ${new Date().toISOString()}`,
    `**模型**: ${OPENCODE_MODEL}`,
    `**测试用例数**: ${a.stats.totalCases}`,
    '',
    '## 策略说明',
    '',
    '| 策略 | 描述 | 工具数 | System Prompt |',
    '|------|------|--------|---------------|',
    `| **A (Baseline)** | 全工具暴露 + 通用 prompt | 82 | 通用 |`,
    `| **B (Hybrid)** | 家族路由 + 工具过滤 + 专属 prompt | 动态 (10-27) | 家族专属 |`,
    '',
    '## 核心指标对比',
    '',
    '| 指标 | 策略 A (Baseline) | 策略 B (Hybrid) | 差值 (B-A) |',
    '|------|-------------------|-----------------|------------|',
    `| 成功率 | ${a.stats.successRate}% | ${b.stats.successRate}% | ${cmp.deltaSuccessRate >= 0 ? '+' : ''}${cmp.deltaSuccessRate}pp |`,
    `| 通过/失败 | ${a.stats.passed}/${a.stats.failed} | ${b.stats.passed}/${b.stats.failed} | - |`,
    `| 平均延迟 | ${a.stats.avgLatencyMs}ms | ${b.stats.avgLatencyMs}ms | ${b.stats.avgLatencyMs - a.stats.avgLatencyMs}ms |`,
    `| P50 延迟 | ${a.stats.p50LatencyMs}ms | ${b.stats.p50LatencyMs}ms | ${b.stats.p50LatencyMs - a.stats.p50LatencyMs}ms |`,
    `| P95 延迟 | ${a.stats.p95LatencyMs}ms | ${b.stats.p95LatencyMs}ms | ${cmp.deltaP95Latency}ms |`,
    `| 总耗时 | ${a.stats.durationMs}ms | ${b.stats.durationMs}ms | ${b.stats.durationMs - a.stats.durationMs}ms |`,
    '',
    '## 按家族对比',
    '',
    '| 家族 | A 通过率 | B 通过率 | 差值 |',
    '|------|----------|----------|------|',
  ];

  for (const f of cmp.perFamilyComparison) {
    lines.push(`| ${f.family} | ${f.aPassed}/${f.aTotal} (${f.aSuccessRate}%) | ${f.bPassed}/${f.bTotal} (${f.bSuccessRate}%) | ${f.delta >= 0 ? '+' : ''}${f.delta}pp |`);
  }

  lines.push('');
  lines.push('## 失败模式对比');
  lines.push('');
  lines.push('| 失败类别 | 策略 A | 策略 B |');
  lines.push('|----------|--------|--------|');
  const allCats = new Set([
    ...Object.keys(a.stats.failureDistribution.byCategory),
    ...Object.keys(b.stats.failureDistribution.byCategory),
  ]);
  for (const cat of allCats) {
    const aCount = (a.stats.failureDistribution.byCategory as Record<string, number>)[cat] || 0;
    const bCount = (b.stats.failureDistribution.byCategory as Record<string, number>)[cat] || 0;
    lines.push(`| ${cat} | ${aCount} | ${bCount} |`);
  }

  lines.push('');
  lines.push('## 翻转用例（A/B 结果不同）');
  lines.push('');

  if (cmp.flippedCases.length === 0) {
    lines.push('无翻转用例 — 两策略在所有用例上结果一致。');
  } else {
    lines.push('| 用例 ID | 策略 A | 策略 B | 翻转方向 |');
    lines.push('|---------|--------|--------|----------|');
    for (const fc of cmp.flippedCases) {
      const icon = fc.flip === 'A→B improved' ? '✅' : '⚠️';
      lines.push(`| ${fc.caseId} | ${fc.aResult === 'pass' ? '✅ 通过' : '❌ 失败'} | ${fc.bResult === 'pass' ? '✅ 通过' : '❌ 失败'} | ${icon} ${fc.flip} |`);
    }
  }

  lines.push('');
  lines.push('## 路由分类统计（策略 B）');
  lines.push('');
  const routingStats: Record<string, number> = {};
  for (const r of cmp.routingLog) {
    routingStats[r.classifiedFamily] = (routingStats[r.classifiedFamily] || 0) + 1;
  }
  lines.push('| 家族 | 路由用例数 |');
  lines.push('|------|-----------|');
  for (const [family, count] of Object.entries(routingStats).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${family} | ${count} |`);
  }

  lines.push('');
  lines.push('## 结论');
  lines.push('');
  lines.push(cmp.summary);
  lines.push('');

  if (cmp.deltaSuccessRate > 0) {
    lines.push('**推荐**: 采用策略 B（Hybrid 路由）作为生产配置。');
  } else if (cmp.deltaSuccessRate < 0) {
    lines.push('**推荐**: 维持策略 A（Baseline），Hybrid 路由未带来改善。');
  } else {
    lines.push('**推荐**: 两策略效果相当，可根据延迟/成本选择。策略 B 平均工具数更少，可能降低 token 成本。');
  }

  return lines.join('\n');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function runStrategy(
  name: string,
  adapter: ProviderAdapter,
  cliArgs: CliArgs,
): Promise<BenchmarkReport> {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  运行策略 ${name}`);
  console.log(`${'═'.repeat(60)}`);

  const config: BenchmarkConfig = {
    ...DEFAULT_CONFIG,
    provider: 'deepseek' as never,
    limit: cliArgs.limit,
    family: cliArgs.family,
    outputDir: cliArgs.output,
    concurrency: cliArgs.concurrency,
    realApi: true,
    timeoutMs: 60000,
    maxRetries: 1,
  };

  const startTime = Date.now();
  const report = await runBenchmark(config, adapter);
  const elapsed = Date.now() - startTime;
  const elapsedMin = Math.floor(elapsed / 60000);
  const elapsedSec = Math.floor((elapsed % 60000) / 1000);

  console.log(`\n策略 ${name} 结果:`);
  console.log(`  成功率: ${report.stats.successRate}% (${report.stats.passed}/${report.stats.totalCases})`);
  console.log(`  P95 延迟: ${report.stats.p95LatencyMs}ms`);
  console.log(`  耗时: ${elapsedMin}分${elapsedSec}秒`);

  return report;
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENCODE_API_KEY;
  if (!apiKey) {
    console.error('❌ 请设置 OPENCODE_API_KEY 环境变量');
    process.exit(1);
  }

  const cliArgs = parseArgs();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  A/B 测试：DeepSeek-only (A) vs Hybrid 路由 (B)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();
  console.log('📊 测试套件概览:');
  console.log(`   总测试用例数: ${getCaseCount()}`);
  console.log(`   覆盖工具数: ${getCoveredTools().length} / ${getAllToolNames().length}`);
  console.log(`   家族分布: ${JSON.stringify(getFamilyStats())}`);
  console.log();
  console.log('⚙️  配置:');
  console.log(`   上游 API: ${OPENCODE_BASE_URL}`);
  console.log(`   模型: ${OPENCODE_MODEL}`);
  console.log(`   用例限制: ${cliArgs.limit === 0 ? '全部' : cliArgs.limit}`);
  console.log(`   家族筛选: ${cliArgs.family || '全部'}`);
  console.log(`   并发数: ${cliArgs.concurrency}`);
  console.log();
  console.log('策略说明:');
  console.log('  A (Baseline): 全工具暴露 + 通用 prompt（当前生产配置）');
  console.log('  B (Hybrid):   家族路由 + 工具过滤 + 专属 prompt');
  console.log();
  console.log('⏱  预计耗时: 每策略约 2-4 分钟，总计约 4-8 分钟');
  console.log();

  // ─── 策略 A: Baseline ─────────────────────────────────────────────────
  const adapterA = new OpenCodeGoAdapter(apiKey, OPENCODE_MODEL);
  const reportA = await runStrategy('A (Baseline)', adapterA as unknown as ProviderAdapter, cliArgs);

  // ─── 策略 B: Hybrid ──────────────────────────────────────────────────
  const adapterB = new HybridAdapter(apiKey, OPENCODE_MODEL);
  const reportB = await runStrategy('B (Hybrid)', adapterB as unknown as ProviderAdapter, cliArgs);

  // ─── 对比分析 ─────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  A/B 对比分析');
  console.log('═══════════════════════════════════════════════════════════\n');

  const comparison = buildComparison(reportA, reportB, adapterB.routingLog);

  console.log('📊 核心指标对比:');
  console.log(`   成功率: A=${reportA.stats.successRate}% → B=${reportB.stats.successRate}% (${comparison.deltaSuccessRate >= 0 ? '+' : ''}${comparison.deltaSuccessRate}pp)`);
  console.log(`   P95 延迟: A=${reportA.stats.p95LatencyMs}ms → B=${reportB.stats.p95LatencyMs}ms (${comparison.deltaP95Latency}ms)`);
  console.log();

  console.log('📊 按家族对比:');
  for (const f of comparison.perFamilyComparison) {
    console.log(`   ${f.family}: A=${f.aSuccessRate}% → B=${f.bSuccessRate}% (${f.delta >= 0 ? '+' : ''}${f.delta}pp)`);
  }
  console.log();

  if (comparison.flippedCases.length > 0) {
    console.log('🔄 翻转用例:');
    for (const fc of comparison.flippedCases) {
      console.log(`   ${fc.caseId}: ${fc.aResult} → ${fc.bResult} (${fc.flip})`);
    }
    console.log();
  }

  console.log('💡 结论:');
  console.log(`   ${comparison.summary}`);
  console.log();

  // ─── 写入报告 ─────────────────────────────────────────────────────────
  const outputDir = path.resolve(cliArgs.output);
  fs.mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  const mdPath = path.join(outputDir, `ab-test-${timestamp}.md`);
  const jsonPath = path.join(outputDir, `ab-test-${timestamp}.json`);

  fs.writeFileSync(mdPath, formatComparisonMarkdown(comparison), 'utf8');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model: OPENCODE_MODEL,
        strategyA: JSON.parse(formatJsonReport(reportA)),
        strategyB: JSON.parse(formatJsonReport(reportB)),
        routingLog: comparison.routingLog,
        deltaSuccessRate: comparison.deltaSuccessRate,
        deltaP95Latency: comparison.deltaP95Latency,
        perFamilyComparison: comparison.perFamilyComparison,
        flippedCases: comparison.flippedCases,
        summary: comparison.summary,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log('📁 报告已生成:');
  console.log(`   Markdown: ${mdPath}`);
  console.log(`   JSON: ${jsonPath}`);
  console.log();

  // SLO 评估
  console.log('🎯 SLO 评估:');
  const aSlo = reportA.stats.successRate >= 95;
  const bSlo = reportB.stats.successRate >= 95;
  console.log(`   策略 A 成功率 ≥ 95%: ${aSlo ? '✅ 达标' : '❌ 未达标'} (${reportA.stats.successRate}%)`);
  console.log(`   策略 B 成功率 ≥ 95%: ${bSlo ? '✅ 达标' : '❌ 未达标'} (${reportB.stats.successRate}%)`);
  console.log();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
