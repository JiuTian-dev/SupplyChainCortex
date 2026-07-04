/**
 * MCP Tools: Decision Intelligence (decision graph, workflow, sandbox, tariff).
 * Extracted from tools-intelligence.ts.
 */

import type { MCPTool } from '../tools';
import { executeDecisionGraph } from '@/lib/services/decision-graph.service';
// NOTE: mcp-orchestration.service is imported dynamically inside the handler
// to break the mcp ↔ services/mcp-orchestration circular dependency.
// (mcp-orchestration.service imports executeTool from '@/lib/mcp/tools')
import { computeTariff, getTariffOverview, simulateTariffScenario } from '@/lib/services/tariff.service';
import { runSandbox } from '@/lib/services/agent-sandbox.service';

export const decisionIntelligence: MCPTool[] = [
  // ── query_decision_graph ──
  {
    name: 'query_decision_graph',
    description: '供应链决策形式化推理引擎（"告诉我该怎么做"而非"告诉我数据是什么"）。基于实时数据（汇率、天气、库存、风险），遍历预定义的决策图，输出结构化的行动建议（如"建议补货X件"、"建议切换供应商Y"、"建议延迟发货Z天"）。支持: inventory/cost/logistics/cross_domain 领域。这是"决策推理"工具——必须输出"应该做什么"的行动建议。不要用于查看仪表盘概览或原始指标：查核心指标用 query_dashboard(action=metrics)、查库存分布用 query_dashboard(action=distribution)、查预警用 query_dashboard(action=alerts)。query_decision_graph 与 query_dashboard 的区别：dashboard 输出"现在是什么状态"，decision_graph 输出"接下来该怎么做"。',
    parameters: {
      type: 'object',
      properties: {
        domains: {
          type: 'string',
          description: '决策领域，逗号分隔。可选: inventory(补货), cost(汇率/利润), logistics(货运/延误), supplier, cross_domain(综合)。默认自动检测',
        },
        query: {
          type: 'string',
          description: '用户原始查询，用于自动检测相关领域',
        },
        includeAll: {
          type: 'boolean',
          description: '是否包含所有领域（默认 false，只自动检测相关领域）',
        },
      },
      required: [],
    },
    handler: async (params) => {
      const domainsStr = params.domains as string | undefined;
      const domains = domainsStr ? domainsStr.split(',').map(s => s.trim()) as Array<'inventory' | 'cost' | 'logistics' | 'supplier' | 'cross_domain'> : undefined;
      const query = (params.query as string) || '';
      const includeAll = params.includeAll === true || params.includeAll === 'true';
      return await executeDecisionGraph({ query, domains, includeAll });
    },
  },

  // ── execute_workflow ──
  {
    name: 'execute_workflow',
    description: 'MCP工具多步骤自动化编排引擎（执行预定义工作流，串联多个工具调用）。将多个MCP工具串联为自动化工作流，支持共享上下文和条件分支。可用工作流: wf-fx-impact(汇率冲击分析), wf-weather-disruption(天气中断评估), wf-inventory-health(库存健康检查), wf-full-health(全面体检), wf-product-deep-dive(产品深度分析)。自动根据用户查询检测合适的工作流。这是"执行自动化工作流"工具——必须运行一个多步骤编排流程。不要用于单一数据查询：查汇率用 query_exchange_rates、查天气用 query_weather、查仪表盘用 query_dashboard、查决策建议用 query_decision_graph。execute_workflow 的关键特征是"运行一个完整的多步骤流程"，而非"查一个数据"。当用户说"做个全面体检"、"汇率冲击分析"、"工作流"时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: '工作流ID。可选: wf-fx-impact, wf-weather-disruption, wf-inventory-health, wf-full-health, wf-product-deep-dive。留空则自动检测',
        },
        query: {
          type: 'string',
          description: '用户原始查询，用于自动检测合适的工作流',
        },
        autoDetect: {
          type: 'boolean',
          description: '是否自动检测并运行最匹配的工作流（默认 true）',
        },
      },
      required: [],
    },
    handler: async (params) => {
      const query = (params.query as string) || '';
      const autoDetect = params.autoDetect !== false && params.autoDetect !== 'false';
      // Dynamic import breaks the mcp ↔ mcp-orchestration circular dependency.
      const { executeWorkflow, detectWorkflows } = await import('@/lib/services/mcp-orchestration.service');

      if (autoDetect && !params.workflowId) {
        const workflows = detectWorkflows(query);
        if (workflows.length > 0) {
          return await executeWorkflow(workflows[0].id, { query });
        }
        // Fallback: run full health check
        return await executeWorkflow('wf-full-health', { query });
      }

      const workflowId = (params.workflowId as string) || 'wf-full-health';
      return await executeWorkflow(workflowId, { query });
    },
  },

  // ── query_tariff ──
  {
    name: 'query_tariff',
    description: '查询动态关税数据并模拟关税情景。基于真实HS编码、WTO MFN税率、Section 301、EU CBAM、RCEP、USMCA等贸易协定。支持关税计算、概览、情景模拟（如US加征至25%、墨西哥转口等）。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['overview', 'compute', 'simulate'],
          description: 'overview=关税全景, compute=计算特定产品关税, simulate=关税情景模拟',
        },
        category: { type: 'string', description: '产品品类 (compute模式)' },
        countryCode: { type: 'string', description: '目的国代码 e.g. US/EU/JP (compute模式)' },
        sellingPrice: { type: 'number', description: '售价USD (compute模式)' },
        scenario: { type: 'string', description: '情景名称 (simulate模式)。可用: US Section 301 escalation, EU CBAM full enforcement, RCEP tariff elimination, Mexico transshipment route, De minimis elimination' },
      },
      required: ['action'],
    },
    handler: async (params) => {
      switch (params.action) {
        case 'overview': return await getTariffOverview();
        case 'compute': {
          if (!params.category || !params.countryCode) throw new Error('compute 需要 category 和 countryCode');
          return await computeTariff({ category: params.category as string, countryCode: params.countryCode as string, sellingPrice: (params.sellingPrice as number) || 39.99 });
        }
        case 'simulate': {
          if (!params.scenario) throw new Error('simulate 需要 scenario');
          return await simulateTariffScenario(params.scenario as string);
        }
        default: throw new Error(`未知操作: ${params.action}`);
      }
    },
  },

  // ── run_sandbox ──
  {
    name: 'run_sandbox',
    description: '多Agent供应链沙盒模拟。4个角色Agent（仓库经理/供应商/货代/市场）在共享环境中交互N轮，测试供应链韧性。支持baseline/trade_war/typhoon_season/perfect_storm场景。纯规则驱动，无需LLM调用。',
    parameters: {
      type: 'object',
      properties: {
        scenario: {
          type: 'string',
          enum: ['baseline', 'trade_war', 'typhoon_season', 'perfect_storm'],
          description: '模拟场景: baseline(正常), trade_war(关税战), typhoon_season(台风季), perfect_storm(完美风暴-三重冲击)',
        },
        rounds: {
          type: 'number',
          description: '模拟轮数 (默认100, 最大200)',
        },
      },
      required: [],
    },
    handler: async (params) => {
      return await runSandbox({
        scenario: (params.scenario as 'baseline' | 'trade_war' | 'typhoon_season' | 'perfect_storm') || 'perfect_storm',
        rounds: Math.min((params.rounds as number) || 100, 200),
      });
    },
  },
];
