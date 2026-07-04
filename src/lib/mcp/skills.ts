/**
 * Agent Skill Registry — 渐进式披露（Progressive Disclosure）实现。
 *
 * 2026 年 Agent 架构标准：Skill = 工具组合 + 提示词 + 流程。
 * 启动时只加载 Skill 名称和描述（discovery），需要时才展开完整工具列表（expansion）。
 *
 * 设计参考：
 * - Anthropic Agent Skills（渐进式披露）
 * - Harness Engineering（Skill 作为 Harness 配置层）
 *
 * 10 个 Skill 覆盖 82 个工具，按业务域聚合：
 *   inventory-mgmt    (12)  库存管理
 *   cost-finance       (7)  成本与财务
 *   sales-forecast     (4)  销售与预测
 *   procurement        (5)  采购与补货
 *   logistics          (5)  物流与运输
 *   supplier-mgmt     (15)  供应商管理
 *   risk-compliance    (8)  风险与合规
 *   analytics          (4)  仪表盘与综合分析
 *   market-intel       (9)  市场情报
 *   visualization      (3)  可视化与报告
 *   misc               (7)  沙盒/备注/产品Feed/套利/发现/搜索/健康（未归入上述域）
 *
 * 用法：
 *   import { getSkillSummaries, expandSkill, routeToSkill } from '@/lib/mcp/skills';
 *   const summaries = getSkillSummaries();           // 启动时：10 条摘要
 *   const skill = routeToSkill(userInput);            // 路由：选 1 个 Skill
 *   const tools = expandSkill(skill.id);              // 展开：该 Skill 的工具
 */

import type { MCPTool } from './tools';
import { getTool, getToolSchemas } from './tools';

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

/**
 * Skill 摘要 — 启动时加载，仅含名称和描述，不含工具详情。
 * 这是渐进式披露的第一层：discovery。
 */
export interface SkillSummary {
  /** Skill 唯一标识 */
  id: SkillId;
  /** 人类可读名称 */
  name: string;
  /** 一句话描述（给 LLM 看，用于路由判断） */
  description: string;
  /** 触发关键词（用于关键词路由） */
  keywords: string[];
  /** 包含的工具数 */
  toolCount: number;
  /** 图标 emoji（UI 展示用） */
  icon: string;
}

/**
 * 完整 Skill — 展开后加载，含工具列表和专属 prompt。
 * 这是渐进式披露的第二层：expansion。
 */
export interface AgentSkill extends SkillSummary {
  /** 该 Skill 包含的所有工具 */
  tools: MCPTool[];
  /** Skill 专属 system prompt（含工具选择指引） */
  systemPrompt: string;
  /** 工具间区分性说明（易混淆工具的边界声明） */
  toolDistinctions?: string[];
}

/** Skill ID 联合类型 */
export type SkillId =
  | 'inventory-mgmt'
  | 'cost-finance'
  | 'sales-forecast'
  | 'procurement'
  | 'logistics'
  | 'supplier-mgmt'
  | 'risk-compliance'
  | 'analytics'
  | 'market-intel'
  | 'visualization'
  | 'misc';

// ─── 工具索引（按 name 快速查找） ──────────────────────────────────────────────

/**
 * 按名称列表获取工具（从 tools.ts 注册表获取，避免循环依赖）。
 */
function pickTools(names: string[]): MCPTool[] {
  const result: MCPTool[] = [];
  for (const name of names) {
    const tool = getTool(name);
    if (tool) {
      result.push(tool);
    }
  }
  return result;
}

// ─── Skill 定义 ────────────────────────────────────────────────────────────────

/**
 * Skill 定义模板（tools 在首次访问时懒加载，避免循环依赖）。
 */
interface SkillTemplate {
  id: SkillId;
  name: string;
  description: string;
  keywords: string[];
  icon: string;
  toolNames: string[];
  systemPrompt: string;
  toolDistinctions?: string[];
}

const SKILL_TEMPLATES: SkillTemplate[] = [
  {
    id: 'inventory-mgmt',
    name: '库存管理',
    description: '库存查询、仓库容量、库存调整、调拨、EOQ/安全库存/再订货点/ABC分类/蒙特卡洛仿真/多级库存/KPI/填充率/提前期分析',
    keywords: ['库存', 'inventory', '仓库', 'warehouse', 'EOQ', '安全库存', 'safety stock', '再订货', 'reorder', 'ABC分类', '蒙特卡洛', 'monte carlo', '多级库存', 'multi-echelon', 'KPI', 'fill rate', '填充率', '提前期', 'lead time', '调拨', 'transfer', '呆滞'],
    icon: '📦',
    toolNames: [
      'query_inventory', 'query_warehouse_capacity',
      'adjust_inventory', 'create_transfer',
      'calculate_eoq', 'calculate_safety_stock', 'calculate_reorder_point',
      'classify_abc_xyz', 'monte_carlo_inventory', 'calculate_multi_echelon_ss',
      'calculate_inventory_kpi', 'calculate_fill_rate', 'calculate_lead_time_analysis',
    ],
    systemPrompt: `你是库存管理专家。可用工具覆盖库存查询、操作、数学模型三个层次。

工具选择指引：
- 查询当前库存状态 → query_inventory（action: overview/list/forecast/risk/detail/slow_moving/reorder）
- 查询仓库容量利用率 → query_warehouse_capacity
- 调整库存数量（入库/出库）→ adjust_inventory
- 仓库间转移库存 → create_transfer
- 计算经济订货批量 → calculate_eoq
- 计算安全库存 → calculate_safety_stock
- 计算再订货点 → calculate_reorder_point
- ABC-XYZ 分类 → classify_abc_xyz
- 蒙特卡洛库存仿真 → monte_carlo_inventory
- 多级安全库存优化 → calculate_multi_echelon_ss
- 库存 KPI 仪表板 → calculate_inventory_kpi
- 填充率计算 → calculate_fill_rate
- 提前期分析（含 SS+ROP）→ calculate_lead_time_analysis

注意：calculate_lead_time_analysis 内部已计算 SS 和 ROP，若用户同时要提前期和安全库存，用此工具即可，无需重复调用。`,
    toolDistinctions: [
      'query_inventory(action=reorder) 是 DB 查询补货建议；calculate_reorder_point 是数学公式计算 ROP',
      'query_warehouse_capacity 按仓库聚合；query_inventory 按SKU/品类查询',
    ],
  },

  {
    id: 'cost-finance',
    name: '成本与财务',
    description: '成本查询、成本更新、总成本模型、采购差异、盈亏平衡、最优定价、财务模拟',
    keywords: ['成本', 'cost', '财务', 'financial', '毛利率', 'margin', '盈亏平衡', 'break-even', '定价', 'pricing', '总成本', 'TCO', '采购差异', 'PPV', 'variance', '到岸成本'],
    icon: '💰',
    toolNames: [
      'query_cost', 'update_cost_record',
      'calculate_total_cost', 'calculate_purchase_variance',
      'calculate_break_even', 'calculate_optimal_pricing',
      'query_financial_sim',
    ],
    systemPrompt: `你是成本与财务分析专家。可用工具覆盖成本查询、更新、数学模型、模拟四个层次。

工具选择指引：
- 查询成本分解/趋势/基准 → query_cost（action: overview/list/detail/benchmark/optimization/trend）
- 更新成本记录（自动重算到岸成本和毛利率）→ update_cost_record
- 总供应链成本模型（综合 EOQ+SS+缺货）→ calculate_total_cost
- 采购价格差异分析（PPV/用量差异）→ calculate_purchase_variance
- 盈亏平衡分析（多场景 what-if）→ calculate_break_even
- 最优定价模型（弹性/线性需求）→ calculate_optimal_pricing
- What-If 财务模拟器（到岸成本/12月P&L）→ query_financial_sim

注意：query_financial_sim 需要用户手动输入采购价/售价/销量；query_arbitrage（在 misc Skill 中）会自动搜索价格。若用户想自动找货源价格，提示使用套利分析。`,
  },

  {
    id: 'sales-forecast',
    name: '销售与预测',
    description: '销售数据查询、需求预测、季节分解、预测准确度追踪',
    keywords: ['销售', 'sales', '预测', 'forecast', '季节', 'seasonal', '准确度', 'accuracy', 'MAPE', 'RMSE', '收入', 'revenue', '增长率'],
    icon: '📈',
    toolNames: [
      'query_sales', 'forecast_demand',
      'calculate_seasonal_decompose', 'calculate_forecast_accuracy',
    ],
    systemPrompt: `你是销售与需求预测专家。

工具选择指引：
- 查询销售数据/收入/销量/增长率/平台分布 → query_sales
- 多方法需求预测（SMA/ES/线性/Winters/Croston）→ forecast_demand
- 季节分解（比率移动平均法）→ calculate_seasonal_decompose
- 预测准确度追踪（MAD/MAPE/RMSE/MASE/TS）→ calculate_forecast_accuracy

注意：forecast_demand 已包含季节预测能力（Winters 方法）。若用户仅要季节分解才用 calculate_seasonal_decompose。`,
  },

  {
    id: 'procurement',
    name: '采购与补货',
    description: '采购订单查询、补货创建（单/批量）、Wagner-Whitin、报童模型、联合补货',
    keywords: ['采购', 'procurement', '补货', 'reorder', '订单', 'order', 'Wagner', '报童', 'newsvendor', '联合补货', 'JRP', '批量', 'lot size'],
    icon: '🛒',
    toolNames: [
      'query_procurement', 'create_reorder', 'batch_create_reorder',
      'calculate_wagner_whitin', 'calculate_newsvendor', 'calculate_joint_replenishment',
    ],
    systemPrompt: `你是采购与补货专家。

工具选择指引：
- 查询采购计划/补货订单 → query_procurement（action: plan/detail/summary）
- 创建单个补货订单 → create_reorder
- 批量创建补货订单（多产品）→ batch_create_reorder
- Wagner-Whitin 动态批量（最优解）→ calculate_wagner_whitin
- 报童模型（单周期最优订货量）→ calculate_newsvendor
- 联合补货优化（JRP）→ calculate_joint_replenishment

注意：create_reorder 是单SKU；batch_create_reorder 是多SKU批量。写操作需要用户确认。`,
  },

  {
    id: 'logistics',
    name: '物流与运输',
    description: '物流查询、发货状态更新、DRP分销计划、仓库选址、运输路线优化',
    keywords: ['物流', 'logistics', '发货', 'shipment', '运输', 'transport', 'DRP', '分销', 'distribution', '仓库选址', 'warehouse location', '路线', 'route', 'TSP', '货运'],
    icon: '🚚',
    toolNames: [
      'query_logistics', 'update_shipment_status',
      'calculate_drp', 'calculate_warehouse_location', 'calculate_transport_route',
    ],
    systemPrompt: `你是物流与运输优化专家。

工具选择指引：
- 查询物流货运状态/跟踪/统计/风险 → query_logistics
- 更新货运状态（追踪号+新状态）→ update_shipment_status
- 分销需求计划（DRP）→ calculate_drp
- 仓库选址优化（重心法）→ calculate_warehouse_location
- 运输路线优化（TSP 最近邻启发式）→ calculate_transport_route

注意：update_shipment_status 是写操作，需要用户确认。`,
  },

  {
    id: 'supplier-mgmt',
    name: '供应商管理',
    description: '供应商查询（业务/地理/趋势）、供应商操作（创建/更新/状态）、供应商评分、供应商图谱（依赖/影响/瓶颈/层级/地理风险/演化/组件树）、供应商发现',
    keywords: ['供应商', 'supplier', '依赖', 'dependency', '影响', 'impact', '瓶颈', 'chokepoint', '地理风险', 'geo risk', '层级', 'tier', '健康', 'health', '演化', 'evolution', '组件树', 'component', '图谱', 'graph', '评分', 'scoring', '发现', 'discovery', '1688', 'Alibaba'],
    icon: '🏭',
    toolNames: [
      'query_suppliers', 'query_supplier_trend', 'query_supplier_location',
      'create_supplier', 'update_supplier', 'update_supplier_status',
      'calculate_supplier_scoring',
      'query_supplier_graph', 'query_supplier_dependency', 'query_supplier_impact',
      'query_supplier_chokepoints', 'query_supplier_geo_risk', 'query_supplier_tiers',
      'query_supplier_evolution', 'query_component_tree',
      'query_supplier_discovery',
    ],
    systemPrompt: `你是供应商管理专家。可用工具覆盖三个数据源：Prisma DB（业务档案）、Neo4j（网络图谱）、外部API（发现）。

工具选择指引：
【业务档案 - DB】
- 供应商列表/评分/绩效 → query_suppliers
- 供应商月度趋势（交货率/延误/货运量）→ query_supplier_trend
- 供应商地理分布统计 → query_supplier_location
- 创建/更新/暂停供应商 → create_supplier / update_supplier / update_supplier_status
- 供应商综合评分（质量/交付/成本/服务/柔性）→ calculate_supplier_scoring

【网络图谱 - Neo4j】
- 供应商网络图（节点+边）→ query_supplier_graph
- 依赖度分析（HHI集中度）→ query_supplier_dependency
- 中断影响分析（传播路径）→ query_supplier_impact
- 卡脖子供应商（共享瓶颈）→ query_supplier_chokepoints
- 地理集中度风险（制造带聚类）→ query_supplier_geo_risk
- 层级结构（Tier-1/Tier-2）→ query_supplier_tiers
- 网络演化追踪 → query_supplier_evolution
- 零部件分类树 → query_component_tree

【发现 - 外部API】
- AI 供应商发现（1688/Alibaba/GlobalSources）→ query_supplier_discovery

重要区分：
- query_suppliers（DB 业务档案）vs query_supplier_graph（Neo4j 拓扑网络）：前者查评分交货期，后者查关系网络
- query_supplier_location（DB 按地区分组）vs query_supplier_geo_risk（Neo4j 制造带风险聚类）：前者是静态分布，后者是风险分析
- update_supplier（更新除状态外字段）vs update_supplier_status（仅激活/暂停）`,
    toolDistinctions: [
      'query_suppliers 是 DB 业务档案；query_supplier_graph 是 Neo4j 拓扑网络',
      'query_supplier_location 是静态地理分布；query_supplier_geo_risk 是制造带风险聚类',
      'update_supplier 更新字段；update_supplier_status 仅激活/暂停',
    ],
  },

  {
    id: 'risk-compliance',
    name: '风险与合规',
    description: '风险查询、级联风险仿真、港口拥堵、CPSC召回、召回风险预警、一致性审计、合规检查、告警解除',
    keywords: ['风险', 'risk', '级联', 'cascade', '传播', 'propagation', '港口', 'port', '拥堵', 'congestion', '召回', 'recall', 'CPSC', '合规', 'compliance', '一致性', 'coherence', '告警', 'alert', 'CBAM', '认证'],
    icon: '⚠️',
    toolNames: [
      'query_risk', 'query_cascade_risk', 'query_port_congestion',
      'query_cpsc_recalls', 'query_recall_risk', 'query_coherence_audit',
      'query_compliance_check', 'resolve_alert',
    ],
    systemPrompt: `你是供应链风险与合规专家。

工具选择指引：
- 风险仪表盘/矩阵/缓解措施/预警 → query_risk
- 级联风险传播仿真（多因子情景）→ query_cascade_risk
- 港口拥堵状况（全球10大港口）→ query_port_congestion
- CPSC 历史召回数据查询 → query_cpsc_recalls
- 产品召回风险预警（基于CPSC模式匹配）→ query_recall_risk
- 决策一致性审计（跨系统矛盾检测）→ query_coherence_audit
- 产品合规自动检查（认证/费用/时间线）→ query_compliance_check
- 解除/调整预警规则 → resolve_alert

重要区分：
- query_cascade_risk（级联传播仿真）vs query_weather/query_exchange_rates/query_port_congestion（单因子查询）：前者是"如果X发生会怎样传播"，后者是"当前X是什么状态"
- query_cpsc_recalls（查历史召回数据）vs query_recall_risk（分析自身SKU召回风险）：前者是外部数据，后者是内部评估
- resolve_alert 是写操作，需要用户确认`,
    toolDistinctions: [
      'query_cascade_risk 是级联传播仿真；单因子查询在 market-intel Skill',
      'query_cpsc_recalls 查历史数据；query_recall_risk 评估自身风险',
    ],
  },

  {
    id: 'analytics',
    name: '仪表盘与综合分析',
    description: '仪表盘概览、综合深度分析、决策推理图、工作流自动化编排',
    keywords: ['仪表盘', 'dashboard', '概览', 'overview', '综合分析', 'analytics', '深度分析', '洞察', 'insight', '决策', 'decision', '推理', 'reasoning', '因果', 'causal', '反事实', 'counterfactual', '工作流', 'workflow', '自动化', '编排'],
    icon: '📊',
    toolNames: [
      'query_dashboard', 'query_analytics',
      'query_decision_graph', 'execute_workflow',
    ],
    systemPrompt: `你是供应链综合分析与决策支持专家。

工具选择指引：
- 仪表盘概览（核心指标/库存分布/销售趋势/预警）→ query_dashboard
- 综合深度分析报告（跨数据源聚合+趋势洞察+优化建议）→ query_analytics
- 决策推理图（因果分析+反事实推理+行动建议）→ query_decision_graph
- 多步骤自动化工作流编排 → execute_workflow

重要区分（三者层层递进）：
- query_dashboard → "现在是什么状态"（原始指标）
- query_analytics → "分析结论"（洞察+建议，非原始记录）
- query_decision_graph → "接下来该怎么做"（行动建议）

不要用 query_dashboard 做深度分析，不要用 query_analytics 做决策推理。`,
    toolDistinctions: [
      'query_dashboard 是原始指标；query_analytics 是洞察结论；query_decision_graph 是行动建议',
    ],
  },

  {
    id: 'market-intel',
    name: '市场情报',
    description: '汇率、天气、大宗商品、运价指数、碳价、金融指数、亚马逊竞品、品牌舆情、网页搜索',
    keywords: ['汇率', 'exchange rate', '天气', 'weather', '大宗商品', 'commodities', '铜', '铝', '钢', '运价', 'SCFI', 'SCFIS', '碳', 'carbon', 'EUA', 'CBAM', '金融', 'QQQ', 'SPY', '亚马逊', 'Amazon', '竞品', 'competitor', '舆情', 'sentiment', '品牌', 'brand', '搜索', 'search', '新闻', 'news'],
    icon: '🌐',
    toolNames: [
      'query_exchange_rates', 'query_weather', 'query_commodities',
      'query_scfis', 'query_carbon_price', 'query_financial_index',
      'query_amazon_competitors', 'query_brand_sentiment', 'web_search',
    ],
    systemPrompt: `你是市场情报专家。可用工具覆盖宏观经济、商品、金融、电商竞争、舆情五个维度。

工具选择指引：
- 人民币汇率（Frankfurter API）→ query_exchange_rates
- 港口天气和海况（Open-Meteo）→ query_weather
- 大宗商品价格（铜/铝/钢/PP/LLDPE/PVC）→ query_commodities
- SCFIS 欧洲航线运价指数 → query_scfis
- 欧盟碳排放配额价格（CBAM）→ query_carbon_price
- 金融市场指数（QQQ/SPY/SMH/^IXIC）→ query_financial_index
- 亚马逊竞品数据（价格趋势/对手区间）→ query_amazon_competitors
- 品牌社交媒体舆情（Reddit/Twitter/论坛）→ query_brand_sentiment
- 联网搜索最新公开信息 → web_search

注意：这些是单因子查询。若用户要"级联风险综合评估"（多因子传播仿真），应使用 risk-compliance Skill 的 query_cascade_risk。`,
  },

  {
    id: 'visualization',
    name: '可视化与报告',
    description: '图表生成、数据分析+图表、供应链分析报告',
    keywords: ['图表', 'chart', '可视化', 'visualization', '报告', 'report', '柱状图', '折线图', '饼图', '散点图', '数据分析', 'data analysis'],
    icon: '📋',
    toolNames: [
      'generate_chart', 'analyze_and_chart', 'generate_report',
    ],
    systemPrompt: `你是数据可视化与报告生成专家。

工具选择指引（三者层层递进，自动化程度递增）：
- 手动提供数据生成图表 → generate_chart（柱/线/饼/散点）
- 自动 DB 查询+聚合+图表 → analyze_and_chart（一键数据分析）
- 批量图表+摘要报告 → generate_report（2-5张图表+摘要）

若用户已有数据 → generate_chart
若用户要"分析一下X并画图" → analyze_and_chart
若用户要"生成报告" → generate_report`,
  },

  {
    id: 'misc',
    name: '其他工具',
    description: '沙盒模拟、备注创建、产品Feed、跨平台套利、关税查询、学习曲线、数据源健康',
    keywords: ['沙盒', 'sandbox', '模拟', 'simulate', '备注', 'note', '产品', 'product', 'feed', 'JSON-LD', '套利', 'arbitrage', '1688', 'Amazon', '关税', 'tariff', '学习曲线', 'learning curve', '健康', 'health', 'scraper'],
    icon: '🔧',
    toolNames: [
      'run_sandbox', 'create_note', 'query_product_feed',
      'query_arbitrage', 'query_tariff', 'calculate_learning_curve',
      'query_scraper_health',
    ],
    systemPrompt: `你是供应链辅助工具专家。

工具选择指引：
- 多 Agent 供应链沙盒模拟（4角色交互）→ run_sandbox
- 创建供应链备注（支持分类和优先级）→ create_note
- 生成 AI 代理可读的商品 Feed（JSON-LD）→ query_product_feed
- 跨平台套利分析（1688采购+Amazon竞品）→ query_arbitrage
- 动态关税查询并模拟关税情景 → query_tariff
- 学习曲线分析（Wright 模型，产量翻倍成本下降）→ calculate_learning_curve
- 数据源运行健康状态 → query_scraper_health

注意：create_note 是写操作。query_arbitrage 会自动搜索价格，与 cost-finance 的 query_financial_sim（手动输入价格）不同。`,
  },
];

// ─── 注册表操作 ────────────────────────────────────────────────────────────────

/**
 * 懒加载：从 SkillTemplate 构造完整的 AgentSkill。
 * 仅在调用时才通过 getTool(name) 获取工具，避免模块加载时的循环依赖。
 */
function getSkillWithTools(template: SkillTemplate): AgentSkill {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    keywords: template.keywords,
    icon: template.icon,
    toolCount: template.toolNames.length,
    tools: pickTools(template.toolNames),
    systemPrompt: template.systemPrompt,
    toolDistinctions: template.toolDistinctions,
  };
}

/** Skill ID → SkillTemplate 索引（轻量映射，不含工具实例） */
const templateMap = new Map<SkillId, SkillTemplate>();
for (const template of SKILL_TEMPLATES) {
  templateMap.set(template.id, template);
}

/** 已展开的 Skill 缓存（懒加载，避免重复 pickTools） */
const skillCache = new Map<SkillId, AgentSkill>();

/**
 * 获取所有 Skill 摘要（渐进式披露第一层：discovery）。
 * 启动时调用，返回 11 条摘要，不含工具详情。
 */
export function getSkillSummaries(): SkillSummary[] {
  return SKILL_TEMPLATES.map(({ toolNames, systemPrompt: _systemPrompt, toolDistinctions: _toolDistinctions, ...summary }) => ({
    ...summary,
    toolCount: toolNames.length,
  }));
}

/**
 * 展开某个 Skill 的完整信息（渐进式披露第二层：expansion）。
 * 返回该 Skill 的所有工具和专属 system prompt。
 */
export function expandSkill(skillId: SkillId): AgentSkill | undefined {
  const cached = skillCache.get(skillId);
  if (cached) {
    return cached;
  }
  const template = templateMap.get(skillId);
  if (!template) {
    return undefined;
  }
  const skill = getSkillWithTools(template);
  skillCache.set(skillId, skill);
  return skill;
}

/**
 * 获取所有 Skill 的完整定义（用于全量暴露模式 / Baseline）。
 */
export function getAllSkills(): AgentSkill[] {
  return SKILL_TEMPLATES.map(template => getSkillWithTools(template));
}

/**
 * 获取所有 Skill 包含的所有工具（等价于原来的 82 工具全量）。
 */
export function getAllSkillTools(): MCPTool[] {
  const allToolsFromSkills: MCPTool[] = [];
  const seen = new Set<string>();
  for (const template of SKILL_TEMPLATES) {
    for (const name of template.toolNames) {
      if (!seen.has(name)) {
        seen.add(name);
        const tool = getTool(name);
        if (tool) {
          allToolsFromSkills.push(tool);
        }
      }
    }
  }
  return allToolsFromSkills;
}

/**
 * 关键词路由 — 根据用户输入选择最匹配的 Skill。
 * 返回得分最高的 Skill；若多 Skill 命中，返回命中关键词最多的。
 */
export function routeToSkill(userInput: string): AgentSkill {
  const lower = userInput.toLowerCase();
  const scores = new Map<SkillId, number>();

  for (const template of SKILL_TEMPLATES) {
    let score = 0;
    for (const kw of template.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        score++;
      }
    }
    if (score > 0) {
      scores.set(template.id, score);
    }
  }

  if (scores.size === 0) {
    // 无匹配时回退到 analytics（最通用的 Skill）
    return expandSkill('analytics')!;
  }

  // 返回得分最高的 Skill
  let bestId: SkillId = 'analytics';
  let bestScore = 0;
  for (const [id, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  return expandSkill(bestId)!;
}

/**
 * 多 Skill 路由 — 返回前 N 个最匹配的 Skill（用于多 Skill 组合场景）。
 */
export function routeToSkills(userInput: string, topN: number = 3): AgentSkill[] {
  const lower = userInput.toLowerCase();
  const scored: Array<{ template: SkillTemplate; score: number }> = [];

  for (const template of SKILL_TEMPLATES) {
    let score = 0;
    for (const kw of template.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        score++;
      }
    }
    if (score > 0) {
      scored.push({ template, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const result = scored.slice(0, topN).map(s => getSkillWithTools(s.template));

  // 若无匹配，回退到 analytics
  if (result.length === 0) {
    return [expandSkill('analytics')!];
  }

  return result;
}

/**
 * 根据 Skill ID 列表获取合并的工具集（去重）。
 */
export function getToolsForSkills(skillIds: SkillId[]): MCPTool[] {
  const seen = new Set<string>();
  const result: MCPTool[] = [];
  for (const id of skillIds) {
    const template = templateMap.get(id);
    if (template) {
      for (const name of template.toolNames) {
        if (!seen.has(name)) {
          seen.add(name);
          const tool = getTool(name);
          if (tool) {
            result.push(tool);
          }
        }
      }
    }
  }
  return result;
}

/**
 * 根据 Skill ID 列表合并 system prompt。
 */
export function getMergedSystemPrompt(skillIds: SkillId[]): string {
  const prompts: string[] = [];
  for (const id of skillIds) {
    const template = templateMap.get(id);
    if (template) {
      prompts.push(`## ${template.name}\n\n${template.systemPrompt}`);
    }
  }
  return prompts.join('\n\n---\n\n');
}

/**
 * 获取 Skill 统计信息。
 */
export function getSkillStats(): {
  totalSkills: number;
  totalTools: number;
  bySkill: Array<{ id: SkillId; name: string; toolCount: number }>;
} {
  return {
    totalSkills: SKILL_TEMPLATES.length,
    totalTools: getAllSkillTools().length,
    bySkill: SKILL_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      toolCount: t.toolNames.length,
    })),
  };
}
