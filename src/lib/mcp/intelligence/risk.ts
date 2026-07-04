/**
 * MCP Tools: Risk Intelligence (cascade risk, CPSC recalls, port congestion, coherence audit, recall risk).
 * Extracted from tools-intelligence.ts.
 */

import type { MCPTool } from '../tools';
import { getCascadeRisk } from '@/lib/services/cascade-risk.service';

export const riskIntelligence: MCPTool[] = [
  // ── query_cascade_risk ──
  {
    name: 'query_cascade_risk',
    description: '供应链级联风险综合传播模拟（核心创新算法）。情景驱动式仿真，模拟风险事件（供应中断、汇率冲击、关税上调、天气恶劣、港口拥堵、供应商故障等）如何沿供应链依赖关系（港口→货运→仓库→产品→客户）逐级传播，计算受影响产品排名、传播路径和预估收入影响。这是"级联影响综合评估"工具——必须跨多个环节推演传播效应。不要用于查询单一风险因子的当前状态：仅查当前天气用 query_weather、仅查当前汇率用 query_exchange_rates、仅查当前港口拥堵用 query_port_congestion、仅查风险仪表盘/矩阵用 query_risk。query_cascade_risk 的关键特征是"如果X发生，会怎样传播"的情景推演，而非"X现在是什么状态"的查询。',
    parameters: {
      type: 'object',
      properties: {
        scenario: {
          type: 'string',
          enum: ['weather_disruption', 'port_congestion', 'exchange_shock', 'exchange_rate_shock', 'supplier_failure', 'supply_disruption', 'demand_spike', 'tariff_increase', 'tariff_escalation', 'auto'],
          description: '模拟场景: weather_disruption(天气,使用实时Open-Meteo数据), port_congestion(港口拥堵), exchange_shock/exchange_rate_shock(汇率冲击,使用实时Frankfurter数据), supplier_failure(供应商故障), supply_disruption(供应中断), demand_spike(需求激增), tariff_increase/tariff_escalation(关税上调,使用实时关税数据), auto(自动检测)',
        },
        sourcePort: {
          type: 'string',
          description: '当scenario=port_congestion时，指定拥堵的港口名称',
        },
      },
      required: [],
    },
    handler: async (params) => {
      const rawScenario = (params.scenario as string) || 'auto';
      const sourcePort = params.sourcePort as string | undefined;

      // Map user-facing scenario names to engine-compatible names
      const scenarioMap: Record<string, string> = {
        'exchange_rate_shock': 'exchange_shock',
        'supply_disruption': 'supplier_failure',
        'tariff_increase': 'tariff_escalation',
        'demand_spike': 'auto',
      };
      const mappedScenario = scenarioMap[rawScenario] || rawScenario;

      return await getCascadeRisk({
        scenario: mappedScenario as 'weather_disruption' | 'port_congestion' | 'exchange_shock' | 'supplier_failure' | 'tariff_escalation' | 'auto',
        sourcePort,
      });
    },
  },

  // ── query_cpsc_recalls ──
  {
    name: 'query_cpsc_recalls',
    description: '查询美国CPSC消费品召回数据(中国产小家电)。数据来源: 江苏省公平贸易预警平台(CCPIT贸促会)，每日更新。用于合规风险评估。',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async () => {
      const { fetchProductRecalls } = await import('@/lib/sources/cpsc-recall');
      const recalls = await fetchProductRecalls();
      if (recalls.length === 0) return { message: '近期无小家电相关CPSC召回', totalChecked: 'CCPIT最近30天数据' };
      return {
        totalRecalls: recalls.length,
        recalls: recalls.map(r => ({
          title: r.title, date: r.date, hazard: r.hazard,
          country: r.country, productName: r.productName, remedy: r.remedy,
        })),
        riskSummary: recalls.map(r => `[${r.hazard}] ${r.title}`).join('\n'),
        complianceNote: '以上召回涉及中国产小家电，请检查自有产品是否涉及类似缺陷',
      };
    },
  },

  // ── query_port_congestion ──
  {
    name: 'query_port_congestion',
    description: '查询全球10大港口拥堵状况。综合GSCPI(纽约联储供应链压力指数)和公开港口报告。',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async () => {
      const { getPortCongestion } = await import('@/lib/sources/port-congestion');
      const data = await getPortCongestion();
      return {
        globalLevel: data.globalLevel,
        affectedRoutes: data.affectedRoutes,
        source: data.source,
        ports: data.ports.map(p => ({
          port: p.port, country: p.country,
          congestion: p.congestionLevel, waitDays: p.avgWaitDays,
          vesselsWaiting: p.vesselsWaiting, trend: p.trend,
        })),
      };
    },
  },

  // ── Decision Coherence Audit ──
  {
    name: 'query_coherence_audit',
    description: '决策一致性审计 — 扫描全部SKU，检测跨系统矛盾: HS编码vs关税不匹配、安全库存vs实际交货期脱节、认证缺失或过期、产地vs关税率冲突、售价无法覆盖成本。输出审计评分和修复建议。这是市场上独有的功能。',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async () => {
      const { runCoherenceAudit } = await import('@/lib/engine/coherence-audit');
      const report = await runCoherenceAudit();
      return {
        ...report,
        note: '决策一致性审计是SupplyChain Cortex独有功能。30-40%的跨境物流延误来自跨系统数据不一致(Forbes 2026)。定期审计可避免海关稽查、平台下架和资金损失。',
      };
    },
  },

  // ── Product Recall Early Warning ──
  {
    name: 'query_recall_risk',
    description: '产品召回风险预警 — 基于CPSC历史召回数据+产品品类模式匹配，分析你的SKU是否存在召回隐患。输出风险评分、匹配的召回模式、建议的预防性修复措施及成本估算。提前预警，防止成为下一个召回。',
    parameters: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: '可选: 只分析特定SKU' },
      },
      required: [],
    },
    handler: async (params) => {
      const { runRecallRiskAnalysis } = await import('@/lib/engine/recall-early-warning');
      const report = await runRecallRiskAnalysis();
      if (params.sku) {
        const product = report.products.find(p => p.sku === params.sku);
        return {
          product,
          allSkusCount: report.totalSkusAnalyzed,
          note: product
            ? `${product.sku} 召回风险: ${product.riskLevel}, 评分 ${product.riskScore}/100`
            : `未找到SKU ${params.sku}`,
        };
      }
      return {
        ...report,
        note: '召回模式基于CPSC 2024-2026历史数据。预防性修复措施的成本为行业估算值。高危SKU建议优先安排工厂审核。',
      };
    },
  },
];
