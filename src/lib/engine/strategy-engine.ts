/**
 * Strategy Recommendation Engine — maps supply chain risks to response strategies.
 *
 * Inspired by PPO-based policy optimization (Cui et al., 2026) but uses
 * deterministic scoring instead of RL training. Evaluates each strategy
 * by expected benefit, execution cost, and risk reduction.
 *
 * Architecture:
 *   Risk detected → match strategies → score each → recommend top-N
 *
 * For the ReAct agent system prompt: instructs LLM to include a
 * "## 推荐策略" section with scored, ranked options.
 */

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface StrategyOption {
  id: string;
  name: string;
  description: string;
  category: 'inventory' | 'cost' | 'logistics' | 'supplier' | 'tariff' | 'compliance' | 'pricing';
  /** Expected CNY benefit (savings or avoided loss) */
  expectedBenefit: number;
  /** Execution cost in CNY */
  executionCost: number;
  /** Timeline to implement (days) */
  timelineDays: number;
  /** Risk reduction factor 0-1 (how much this strategy mitigates the risk) */
  riskReduction: number;
  /** Prerequisites or dependencies */
  prerequisites: string[];
}

export interface StrategyRecommendation {
  strategy: StrategyOption;
  /** Composite score: benefit × confidence − cost × riskFactor */
  score: number;
  /** Whether this strategy is recommended given current conditions */
  recommended: boolean;
  /** Context-specific rationale */
  rationale: string;
}

export interface RiskContext {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedEntities: string[];
  cascadeDepth: number;
  estimatedLossCny: number;
}

// ─── Strategy Library ────────────────────────────────────────────────────────────

const STRATEGY_LIBRARY: StrategyOption[] = [
  // ── Inventory Strategies ──────────────────────────────────────────────────
  {
    id: 'emergency-reorder',
    name: '紧急补货',
    description: '立即创建补货订单，优先安排生产和物流',
    category: 'inventory',
    expectedBenefit: 50000, executionCost: 8000, timelineDays: 3,
    riskReduction: 0.85,
    prerequisites: ['供应商产能充足', '物流通道可用'],
  },
  {
    id: 'safety-stock-buffer',
    name: '安全库存缓冲上调',
    description: '将安全库存水平临时提高30-50%，增加缓冲',
    category: 'inventory',
    expectedBenefit: 20000, executionCost: 5000, timelineDays: 1,
    riskReduction: 0.65,
    prerequisites: ['仓库空间充足'],
  },
  {
    id: 'inventory-redistribute',
    name: '跨仓库存调拨',
    description: '将库存从富余仓库调拨到紧缺仓库',
    category: 'inventory',
    expectedBenefit: 15000, executionCost: 3000, timelineDays: 2,
    riskReduction: 0.55,
    prerequisites: ['多仓库覆盖', '调拨物流可用'],
  },
  {
    id: 'demand-rationing',
    name: '需求配给',
    description: '优先供应高利润渠道/客户，低利润渠道暂缓',
    category: 'inventory',
    expectedBenefit: 25000, executionCost: 2000, timelineDays: 1,
    riskReduction: 0.45,
    prerequisites: ['渠道利润数据可用'],
  },

  // ── Cost Strategies ───────────────────────────────────────────────────────
  {
    id: 'price-lock-forward',
    name: '远期锁价',
    description: '通过期货/远期合约锁定未来3-6个月的原材料价格',
    category: 'cost',
    expectedBenefit: 80000, executionCost: 12000, timelineDays: 5,
    riskReduction: 0.75,
    prerequisites: ['期货账户', '价格预测模型'],
  },
  {
    id: 'supplier-negotiate',
    name: '供应商议价',
    description: '与现有供应商协商批量折扣或长期合同价格',
    category: 'cost',
    expectedBenefit: 40000, executionCost: 3000, timelineDays: 7,
    riskReduction: 0.55,
    prerequisites: ['供应商关系良好', '采购量达到谈判门槛'],
  },
  {
    id: 'material-substitution',
    name: '材料替代',
    description: '寻找低成本替代材料或国产化替代方案',
    category: 'cost',
    expectedBenefit: 60000, executionCost: 20000, timelineDays: 30,
    riskReduction: 0.7,
    prerequisites: ['替代材料认证', '质量验证流程'],
  },
  {
    id: 'cost-pass-through',
    name: '成本转嫁',
    description: '将原材料涨价部分转嫁到终端售价',
    category: 'pricing',
    expectedBenefit: 45000, executionCost: 1000, timelineDays: 3,
    riskReduction: 0.6,
    prerequisites: ['价格弹性分析', '竞品价格监控'],
  },

  // ── Logistics Strategies ──────────────────────────────────────────────────
  {
    id: 'route-diversify',
    name: '路线多样化',
    description: '启用备选航线和运输方式，降低单点依赖',
    category: 'logistics',
    expectedBenefit: 35000, executionCost: 8000, timelineDays: 7,
    riskReduction: 0.7,
    prerequisites: ['备选航线可用', '多物流商关系'],
  },
  {
    id: 'buffer-stock-pipeline',
    name: '管道库存缓冲',
    description: '增加在途库存量，即使运输延误也有缓冲',
    category: 'logistics',
    expectedBenefit: 25000, executionCost: 10000, timelineDays: 14,
    riskReduction: 0.6,
    prerequisites: ['仓储空间', '现金流支持'],
  },
  {
    id: 'air-freight-expedite',
    name: '空运加急',
    description: '关键SKU切换空运，牺牲成本换取时效',
    category: 'logistics',
    expectedBenefit: 30000, executionCost: 25000, timelineDays: 1,
    riskReduction: 0.9,
    prerequisites: ['空运仓位可用', 'SKU适合空运'],
  },

  // ── Supplier Strategies ───────────────────────────────────────────────────
  {
    id: 'supplier-diversify',
    name: '供应商多元化',
    description: '开发备选供应商，降低单一供应商依赖',
    category: 'supplier',
    expectedBenefit: 70000, executionCost: 15000, timelineDays: 30,
    riskReduction: 0.8,
    prerequisites: ['供应商审核流程', '打样验证周期'],
  },
  {
    id: 'china-plus-one',
    name: 'China+1 策略',
    description: '在越南/墨西哥/印度建立第二供应源',
    category: 'supplier',
    expectedBenefit: 100000, executionCost: 50000, timelineDays: 90,
    riskReduction: 0.85,
    prerequisites: ['海外供应商关系', '跨境质量管控'],
  },
  {
    id: 'supplier-scorecard',
    name: '供应商绩效强化',
    description: '收紧供应商评分标准，淘汰末尾10%，激励优质供应商',
    category: 'supplier',
    expectedBenefit: 30000, executionCost: 5000, timelineDays: 14,
    riskReduction: 0.5,
    prerequisites: ['供应商评分系统', '替代供应商清单'],
  },

  // ── Tariff/Compliance Strategies ──────────────────────────────────────────
  {
    id: 'tariff-exclusion',
    name: '关税豁免申请',
    description: '向USTR申请Section 301关税排除(exclusion)',
    category: 'tariff',
    expectedBenefit: 90000, executionCost: 15000, timelineDays: 60,
    riskReduction: 0.75,
    prerequisites: ['产品不在敏感清单', '法律顾问支持'],
  },
  {
    id: 'fta-origin',
    name: 'FTA原产地优化',
    description: '利用RCEP/USMCA等自贸协定降低关税，优化原产地证明',
    category: 'tariff',
    expectedBenefit: 50000, executionCost: 8000, timelineDays: 21,
    riskReduction: 0.6,
    prerequisites: ['FTA覆盖该品类', '原产地标准满足'],
  },
  {
    id: 'hs-reclassify',
    name: 'HS编码重新归类',
    description: '检查HS编码是否最优，零件vs整机可能税率更低',
    category: 'tariff',
    expectedBenefit: 35000, executionCost: 5000, timelineDays: 14,
    riskReduction: 0.5,
    prerequisites: ['海关归类专家', 'CBP ruling历史'],
  },
  {
    id: 'compliance-audit',
    name: '合规预审',
    description: '提前进行合规审计，确保证书有效，避免海关扣押',
    category: 'compliance',
    expectedBenefit: 20000, executionCost: 3000, timelineDays: 7,
    riskReduction: 0.4,
    prerequisites: ['合规证书清单', '第三方审计机构'],
  },
];

// ─── Strategy Engine ─────────────────────────────────────────────────────────────

/**
 * Match strategies to a given risk context and score them.
 */
export function recommendStrategies(
  risk: RiskContext,
  confidence = 0.7,
): StrategyRecommendation[] {
  const riskFactor = risk.severity === 'critical' ? 1.0
    : risk.severity === 'high' ? 0.7
    : risk.severity === 'medium' ? 0.4
    : 0.2;

  // Match strategies by risk type → category mapping
  const categoryMap: Record<string, StrategyOption['category'][]> = {
    inventory_shortage: ['inventory', 'supplier'],
    cost_surge: ['cost', 'pricing', 'supplier'],
    shipping_delay: ['logistics', 'inventory'],
    port_disruption: ['logistics', 'inventory'],
    supplier_failure: ['supplier', 'inventory'],
    tariff_hike: ['tariff', 'cost', 'pricing'],
    fx_shock: ['cost', 'pricing', 'tariff'],
    compliance_risk: ['compliance'],
    quality_issue: ['supplier', 'inventory'],
    demand_surge: ['inventory', 'pricing'],
    demand_drop: ['pricing', 'cost'],
  };

  const relevantCategories = categoryMap[risk.type] || ['inventory', 'cost'];

  const scored = STRATEGY_LIBRARY
    .filter(s => relevantCategories.includes(s.category))
    .map(s => {
      // Composite score: benefit × confidence × riskReduction − cost × riskFactor
      const benefitComponent = s.expectedBenefit * confidence * s.riskReduction;
      const costComponent = s.executionCost * riskFactor;
      const score = benefitComponent - costComponent;

      return {
        strategy: s,
        score: Math.round(score),
        recommended: score > 0,
        rationale: buildRationale(s, risk),
      };
    })
    .sort((a, b) => b.score - a.score);

  return scored;
}

function buildRationale(strategy: StrategyOption, risk: RiskContext): string {
  const riskLabel = risk.severity === 'critical' ? '严重' : risk.severity === 'high' ? '高' : '中低';
  return `针对${riskLabel}风险的"${risk.type}"类型，${strategy.name}预计${strategy.timelineDays}天内见效，风险降低约${(strategy.riskReduction * 100).toFixed(0)}%`;
}

/**
 * Format strategy recommendations for injection into ReAct system prompt.
 */
export function formatStrategyContext(
  risk: RiskContext,
  topK = 5,
): string {
  const recommendations = recommendStrategies(risk, 0.7)
    .filter(r => r.recommended)
    .slice(0, topK);

  if (recommendations.length === 0) return '';

  const lines = ['\n## 🎯 推荐响应策略'];
  lines.push(`风险: ${risk.type} (${risk.severity}), 预估损失 ¥${risk.estimatedLossCny.toLocaleString()}`);
  lines.push('');

  for (const rec of recommendations) {
    lines.push(`### ${rec.strategy.name} [评分: ${rec.score > 0 ? '+' : ''}${rec.score}]`);
    lines.push(`- 描述: ${rec.strategy.description}`);
    lines.push(`- 预计收益: ¥${rec.strategy.expectedBenefit.toLocaleString()} | 执行成本: ¥${rec.strategy.executionCost.toLocaleString()}`);
    lines.push(`- 时间: ${rec.strategy.timelineDays}天 | 风险降低: ${(rec.strategy.riskReduction * 100).toFixed(0)}%`);
    lines.push(`- 前提: ${rec.strategy.prerequisites.join(', ')}`);
    lines.push(`- ${rec.rationale}`);
    lines.push('');
  }

  lines.push('请在回答中引用这些策略，结合实时数据给出具体的执行建议。');
  return lines.join('\n');
}
