/**
 * Reliability Benchmark — Tool Call Test Cases
 *
 * 100+ test cases covering all 82 MCP tools across 5 families:
 * - crud (11 tools): inventory, cost, sales, logistics, suppliers, dashboard, risk
 * - operations (11 tools): reorder, shipment, inventory adjust, cost update, notes, alerts, supplier mgmt
 * - intelligence (27 tools): analytics, market, risk, decision, business, chart
 * - supply-chain (24 tools): EOQ, safety stock, forecasting, optimization, network, metrics, finance, production, pricing, planning
 * - supplier-graph (9 tools): network, dependency, impact, chokepoints, geo-risk, tiers, health, evolution, component tree
 *
 * Each case represents a REAL supply chain scenario a user would ask the agent.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ToolFamily = 'crud' | 'operations' | 'intelligence' | 'supply-chain' | 'supplier-graph';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface ToolTestCase {
  /** Unique case ID, e.g. "crud-inv-001" */
  id: string;
  /** Tool family for grouping */
  family: ToolFamily;
  /** Natural language user input (Chinese, as real users would ask) */
  userInput: string;
  /** Expected tool name that the LLM should call */
  expectedTool: string;
  /** Key parameters that MUST be present (partial match — other keys are allowed) */
  expectedParams: Record<string, unknown>;
  /** Optional: parameters that MUST NOT be present */
  forbiddenParams?: string[];
  /** Human-readable description of what this case tests */
  description: string;
  /** Difficulty: easy=direct mapping, medium=needs context, hard=ambiguous */
  difficulty: Difficulty;
  /** Whether multiple tools could be valid (if so, expectedTool is the primary) */
  multiToolOk?: boolean;
}

// ─── CRUD Family (11 tools, ~24 cases) ──────────────────────────────────────

const crudCases: ToolTestCase[] = [
  // query_inventory (7 actions: overview, list, forecast, risk, detail, slow_moving, reorder)
  {
    id: 'crud-inv-001',
    family: 'crud',
    userInput: '帮我查一下 KA-RC4001 的库存情况',
    expectedTool: 'query_inventory',
    expectedParams: { action: 'detail', sku: 'KA-RC4001' },
    description: '查询单品库存详情 — 用户指定了SKU',
    difficulty: 'easy',
  },
  {
    id: 'crud-inv-002',
    family: 'crud',
    userInput: '深圳仓现在的库存概览是什么样的',
    expectedTool: 'query_inventory',
    expectedParams: { action: 'overview', warehouse: '深圳仓' },
    description: '按仓库查询库存概览',
    difficulty: 'easy',
  },
  {
    id: 'crud-inv-003',
    family: 'crud',
    userInput: '哪些产品有缺货风险？给我看下风险分析',
    expectedTool: 'query_inventory',
    expectedParams: { action: 'risk' },
    description: '缺货风险分析 — 无仓库筛选',
    difficulty: 'medium',
  },
  {
    id: 'crud-inv-004',
    family: 'crud',
    userInput: '厨房电器品类有哪些滞销品？超过120天的',
    expectedTool: 'query_inventory',
    expectedParams: { action: 'slow_moving', category: '厨房电器', days: 120 },
    description: '滞销品查询 — 指定品类和天数阈值',
    difficulty: 'medium',
  },
  {
    id: 'crud-inv-005',
    family: 'crud',
    userInput: '未来14天库存预测',
    expectedTool: 'query_inventory',
    expectedParams: { action: 'forecast' },
    description: '库存预测 — 默认天数',
    difficulty: 'easy',
  },

  // query_cost (6 actions: overview, list, detail, benchmark, optimization, trend)
  {
    id: 'crud-cost-001',
    family: 'crud',
    userInput: 'KA-RC4001 的成本分解详情',
    expectedTool: 'query_cost',
    expectedParams: { action: 'detail', sku: 'KA-RC4001' },
    description: '单品成本详情',
    difficulty: 'easy',
  },
  {
    id: 'crud-cost-002',
    family: 'crud',
    userInput: '给我成本优化建议（action=optimization），看下清洁电器品类',
    expectedTool: 'query_cost',
    expectedParams: { action: 'optimization', category: '清洁电器' },
    description: '成本优化建议 — 按品类',
    difficulty: 'medium',
  },
  {
    id: 'crud-cost-003',
    family: 'crud',
    userInput: '最近6个月成本趋势',
    expectedTool: 'query_cost',
    expectedParams: { action: 'trend', months: 6 },
    description: '成本趋势 — 指定月数',
    difficulty: 'easy',
  },
  {
    id: 'crud-cost-004',
    family: 'crud',
    userInput: '我们的成本和行业基准对比如何',
    expectedTool: 'query_cost',
    expectedParams: { action: 'benchmark' },
    description: '成本基准对比 — 无品类筛选',
    difficulty: 'medium',
  },

  // query_sales (4 actions: overview, daily, detail, forecast)
  {
    id: 'crud-sales-001',
    family: 'crud',
    userInput: '最近30天 Amazon 平台销售概览',
    expectedTool: 'query_sales',
    expectedParams: { action: 'overview', days: 30, platform: 'Amazon' },
    description: '销售概览 — 指定天数和平台',
    difficulty: 'easy',
  },
  {
    id: 'crud-sales-002',
    family: 'crud',
    userInput: 'KA-RC4001 这款产品最近卖得怎么样',
    expectedTool: 'query_sales',
    expectedParams: { action: 'detail', sku: 'KA-RC4001' },
    description: '单品销售详情',
    difficulty: 'easy',
  },
  {
    id: 'crud-sales-003',
    family: 'crud',
    userInput: '未来30天销售预测',
    expectedTool: 'query_sales',
    expectedParams: { action: 'forecast', horizon: 30 },
    description: '销售预测 — 指定预测天数',
    difficulty: 'easy',
  },

  // query_logistics (4 actions: list, stats, track, risks)
  {
    id: 'crud-log-001',
    family: 'crud',
    userInput: '追踪号 SF20240115001 的物流状态',
    expectedTool: 'query_logistics',
    expectedParams: { action: 'track', trackingNumber: 'SF20240115001' },
    description: '单号追踪 — 指定追踪号',
    difficulty: 'easy',
  },
  {
    id: 'crud-log-002',
    family: 'crud',
    userInput: '在途中的货运有哪些',
    expectedTool: 'query_logistics',
    expectedParams: { action: 'list', status: 'in_transit' },
    description: '货运列表 — 按状态筛选',
    difficulty: 'medium',
  },
  {
    id: 'crud-log-003',
    family: 'crud',
    userInput: '物流风险有哪些',
    expectedTool: 'query_logistics',
    expectedParams: { action: 'risks' },
    description: '物流风险查询',
    difficulty: 'easy',
  },

  // query_suppliers (2 actions: list, performance)
  {
    id: 'crud-sup-001',
    family: 'crud',
    userInput: '华南地区有哪些活跃供应商',
    expectedTool: 'query_suppliers',
    expectedParams: { action: 'list', region: '华南', status: 'active' },
    description: '供应商列表 — 按地区和状态',
    difficulty: 'medium',
  },
  {
    id: 'crud-sup-002',
    family: 'crud',
    userInput: '供应商绩效分析报告（action=performance）',
    expectedTool: 'query_suppliers',
    expectedParams: { action: 'performance' },
    description: '供应商绩效分析',
    difficulty: 'easy',
  },

  // query_dashboard (5 actions: metrics, summary, distribution, sales_trend, alerts)
  {
    id: 'crud-dash-001',
    family: 'crud',
    userInput: '供应链仪表盘核心指标',
    expectedTool: 'query_dashboard',
    expectedParams: { action: 'metrics' },
    description: '仪表盘核心指标',
    difficulty: 'easy',
  },
  {
    id: 'crud-dash-002',
    family: 'crud',
    userInput: '深圳仓的库存分布情况',
    expectedTool: 'query_dashboard',
    expectedParams: { action: 'distribution', warehouse: '深圳仓' },
    description: '库存分布 — 按仓库',
    difficulty: 'medium',
  },
  {
    id: 'crud-dash-003',
    family: 'crud',
    userInput: '有什么紧急预警',
    expectedTool: 'query_dashboard',
    expectedParams: { action: 'alerts' },
    description: '紧急预警查询',
    difficulty: 'easy',
  },

  // query_supplier_trend
  {
    id: 'crud-trend-001',
    family: 'crud',
    userInput: 'SUP-GD001 供应商最近6个月交货趋势',
    expectedTool: 'query_supplier_trend',
    expectedParams: { supplierCode: 'SUP-GD001', months: 6 },
    description: '供应商趋势 — 指定编码和月数',
    difficulty: 'medium',
  },

  // query_procurement (3 actions: plan, detail, summary)
  {
    id: 'crud-proc-001',
    family: 'crud',
    userInput: '待处理的采购计划有哪些',
    expectedTool: 'query_procurement',
    expectedParams: { action: 'plan' },
    description: '采购计划 — 待处理订单',
    difficulty: 'easy',
  },
  {
    id: 'crud-proc-002',
    family: 'crud',
    userInput: 'KA-RC4001 的采购订单历史',
    expectedTool: 'query_procurement',
    expectedParams: { action: 'detail', sku: 'KA-RC4001' },
    description: '采购详情 — 指定SKU',
    difficulty: 'easy',
  },

  // query_risk (4 actions: dashboard, matrix, mitigations, alerts)
  {
    id: 'crud-risk-001',
    family: 'crud',
    userInput: '风险仪表盘',
    expectedTool: 'query_risk',
    expectedParams: { action: 'dashboard' },
    description: '风险仪表盘',
    difficulty: 'easy',
  },
  {
    id: 'crud-risk-002',
    family: 'crud',
    userInput: '风险矩阵和缓解措施',
    expectedTool: 'query_risk',
    expectedParams: { action: 'matrix' },
    description: '风险矩阵 — 用户问了多个，主选matrix',
    difficulty: 'hard',
    multiToolOk: true,
  },

  // query_supplier_location
  {
    id: 'crud-loc-001',
    family: 'crud',
    userInput: '华东地区电子元器件供应商有哪些',
    expectedTool: 'query_supplier_location',
    expectedParams: { region: '华东', category: '电子元器件' },
    description: '供应商地理分布 — 按地区和品类',
    difficulty: 'medium',
  },

  // query_warehouse_capacity
  {
    id: 'crud-wh-001',
    family: 'crud',
    userInput: '义乌仓的仓库容量利用率',
    expectedTool: 'query_warehouse_capacity',
    expectedParams: { warehouse: '义乌仓' },
    description: '仓库容量 — 指定仓库',
    difficulty: 'easy',
  },
];

// ─── Operations Family (11 tools, ~22 cases) ────────────────────────────────

const operationsCases: ToolTestCase[] = [
  // create_reorder
  {
    id: 'op-reorder-001',
    family: 'operations',
    userInput: '帮我创建一个补货订单：KA-RC4001 智能电饭煲，100件，发到深圳仓，紧急',
    expectedTool: 'create_reorder',
    expectedParams: {
      sku: 'KA-RC4001',
      productName: '智能电饭煲',
      quantity: 100,
      warehouse: '深圳仓',
      priority: '紧急',
    },
    description: '创建补货订单 — 完整参数',
    difficulty: 'easy',
  },
  {
    id: 'op-reorder-002',
    family: 'operations',
    userInput: '给 KB-VS2002 无线吸尘器补货50台到义乌仓',
    expectedTool: 'create_reorder',
    expectedParams: {
      sku: 'KB-VS2002',
      productName: '无线吸尘器',
      quantity: 50,
      warehouse: '义乌仓',
    },
    forbiddenParams: ['priority'],
    description: '创建补货订单 — 不指定优先级（默认常规）',
    difficulty: 'medium',
  },

  // batch_create_reorder
  {
    id: 'op-batch-001',
    family: 'operations',
    userInput: '批量补货：KA-RC4001 智能电饭煲 100件到深圳仓，KB-VS2002 无线吸尘器 50件到义乌仓',
    expectedTool: 'batch_create_reorder',
    expectedParams: {
      items: [
        { sku: 'KA-RC4001', productName: '智能电饭煲', quantity: 100, warehouse: '深圳仓' },
        { sku: 'KB-VS2002', productName: '无线吸尘器', quantity: 50, warehouse: '义乌仓' },
      ],
    },
    description: '批量补货 — 多产品多仓库',
    difficulty: 'hard',
  },

  // update_shipment_status
  {
    id: 'op-ship-001',
    family: 'operations',
    userInput: '把追踪号 SF20240115001 的货运状态更新为已送达',
    expectedTool: 'update_shipment_status',
    expectedParams: { trackingNumber: 'SF20240115001', status: 'delivered' },
    description: '更新货运状态 — 已送达',
    difficulty: 'easy',
  },
  {
    id: 'op-ship-002',
    family: 'operations',
    userInput: 'SF20240115002 这个货延误了，状态改成delayed，备注港口拥堵',
    expectedTool: 'update_shipment_status',
    expectedParams: {
      trackingNumber: 'SF20240115002',
      status: 'delayed',
      notes: '港口拥堵',
    },
    description: '更新货运状态 — 延误+备注',
    difficulty: 'medium',
  },

  // adjust_inventory
  {
    id: 'op-adjust-001',
    family: 'operations',
    userInput: 'KA-RC4001 入库100件到深圳仓，原因是采购入库',
    expectedTool: 'adjust_inventory',
    expectedParams: {
      sku: 'KA-RC4001',
      quantity: 100,
      warehouse: '深圳仓',
      reason: '采购入库',
    },
    description: '库存调整 — 入库正数',
    difficulty: 'easy',
  },
  {
    id: 'op-adjust-002',
    family: 'operations',
    userInput: 'KB-VS2002 从义乌仓出库50件，退货出库',
    expectedTool: 'adjust_inventory',
    expectedParams: {
      sku: 'KB-VS2002',
      quantity: -50,
      warehouse: '义乌仓',
      reason: '退货出库',
    },
    description: '库存调整 — 出库负数',
    difficulty: 'medium',
  },

  // create_transfer
  {
    id: 'op-transfer-001',
    family: 'operations',
    userInput: '把 KA-RC4001 从深圳仓调拨200件到义乌仓',
    expectedTool: 'create_transfer',
    expectedParams: {
      sku: 'KA-RC4001',
      sourceWarehouse: '深圳仓',
      targetWarehouse: '义乌仓',
      quantity: 200,
    },
    description: '库存调拨 — 跨仓库',
    difficulty: 'easy',
  },

  // update_cost_record
  {
    id: 'op-cost-001',
    family: 'operations',
    userInput: '更新 KA-RC4001 的原材料成本为85元，人工成本30元',
    expectedTool: 'update_cost_record',
    expectedParams: { sku: 'KA-RC4001', rawMaterial: 85, labor: 30 },
    description: '更新成本记录 — CNY组件',
    difficulty: 'medium',
  },
  {
    id: 'op-cost-002',
    family: 'operations',
    userInput: 'KA-RC4001 物流费涨到15美元，关税8美元',
    expectedTool: 'update_cost_record',
    expectedParams: { sku: 'KA-RC4001', logistics: 15, tariff: 8 },
    description: '更新成本记录 — USD组件',
    difficulty: 'medium',
  },

  // create_note
  {
    id: 'op-note-001',
    family: 'operations',
    userInput: '创建一条备注：KA-RC4001 供应商交期延长，分类库存，优先级重要',
    expectedTool: 'create_note',
    expectedParams: {
      content: 'KA-RC4001 供应商交期延长',
      sku: 'KA-RC4001',
      category: 'inventory',
      priority: 'important',
    },
    description: '创建备注 — 完整参数',
    difficulty: 'medium',
  },
  {
    id: 'op-note-002',
    family: 'operations',
    userInput: '记一下：本周五盘点深圳仓',
    expectedTool: 'create_note',
    expectedParams: { content: '本周五盘点深圳仓' },
    description: '创建备注 — 仅内容（LLM 可能合理地补充 category/priority，不再禁止）',
    difficulty: 'hard',
  },

  // resolve_alert
  {
    id: 'op-alert-001',
    family: 'operations',
    userInput: '禁用 low_stock_warning 这个预警规则',
    expectedTool: 'resolve_alert',
    expectedParams: { ruleId: 'low_stock_warning', enabled: false },
    description: '解除预警 — 禁用规则',
    difficulty: 'medium',
  },
  {
    id: 'op-alert-002',
    family: 'operations',
    userInput: '把 overstock_alert 的阈值调到500，严重级别设为critical',
    expectedTool: 'resolve_alert',
    expectedParams: {
      ruleId: 'overstock_alert',
      threshold: 500,
      severity: 'critical',
    },
    description: '解除预警 — 调整阈值和严重级别',
    difficulty: 'medium',
  },

  // update_supplier_status
  {
    id: 'op-sup-status-001',
    family: 'operations',
    userInput: '暂停供应商 SUP-GD001，原因是质量不达标',
    expectedTool: 'update_supplier_status',
    expectedParams: {
      code: 'SUP-GD001',
      status: 'suspended',
      reason: '质量不达标',
    },
    description: '供应商状态变更 — 暂停',
    difficulty: 'easy',
  },
  {
    id: 'op-sup-status-002',
    family: 'operations',
    userInput: '重新激活供应商 SUP-SH002',
    expectedTool: 'update_supplier_status',
    expectedParams: { code: 'SUP-SH002', status: 'active' },
    forbiddenParams: ['reason'],
    description: '供应商状态变更 — 激活（无原因）',
    difficulty: 'medium',
  },

  // create_supplier
  {
    id: 'op-sup-create-001',
    family: 'operations',
    userInput: '新增供应商：编码 SUP-GD003，名称东莞精密电子，华南地区，电子元器件，交货期15天',
    expectedTool: 'create_supplier',
    expectedParams: {
      code: 'SUP-GD003',
      name: '东莞精密电子',
      region: '华南',
      category: '电子元器件',
      leadTime: 15,
    },
    description: '新增供应商 — 必填参数',
    difficulty: 'medium',
  },

  // update_supplier
  {
    id: 'op-sup-update-001',
    family: 'operations',
    userInput: '把供应商 SUP-GD001 的评分改为4.2，交货期改为12天',
    expectedTool: 'update_supplier',
    expectedParams: { code: 'SUP-GD001', rating: 4.2, leadTime: 12 },
    description: '更新供应商 — 评分和交货期',
    difficulty: 'medium',
  },
  {
    id: 'op-sup-update-002',
    family: 'operations',
    userInput: 'SUP-SH002 联系人改成张经理，电话13800138000',
    expectedTool: 'update_supplier',
    expectedParams: { code: 'SUP-SH002', contact: '张经理', phone: '13800138000' },
    description: '更新供应商 — 联系信息',
    difficulty: 'medium',
  },
];

// ─── Intelligence Family (27 tools, ~35 cases) ──────────────────────────────

const intelligenceCases: ToolTestCase[] = [
  // query_analytics (6 actions)
  {
    id: 'intel-analytics-001',
    family: 'intelligence',
    userInput: '供应商绩效分析报告',
    expectedTool: 'query_analytics',
    expectedParams: { action: 'supplier_performance' },
    description: '分析 — 供应商绩效',
    difficulty: 'medium',
  },
  {
    id: 'intel-analytics-002',
    family: 'intelligence',
    userInput: '成本优化分析',
    expectedTool: 'query_analytics',
    expectedParams: { action: 'cost_optimization' },
    description: '分析 — 成本优化',
    difficulty: 'medium',
  },
  {
    id: 'intel-analytics-003',
    family: 'intelligence',
    userInput: '库存预测分析，预测30天',
    expectedTool: 'query_analytics',
    expectedParams: { action: 'inventory_forecast', forecastDays: 30 },
    description: '分析 — 库存预测（指定天数）',
    difficulty: 'medium',
  },
  {
    id: 'intel-analytics-004',
    family: 'intelligence',
    userInput: '销售预测分析',
    expectedTool: 'query_analytics',
    expectedParams: { action: 'sales_forecast' },
    description: '分析 — 销售预测',
    difficulty: 'medium',
  },

  // query_exchange_rates (2 actions)
  {
    id: 'intel-fx-001',
    family: 'intelligence',
    userInput: '最新人民币汇率',
    expectedTool: 'query_exchange_rates',
    expectedParams: { action: 'latest' },
    description: '汇率 — 最新',
    difficulty: 'easy',
  },
  {
    id: 'intel-fx-002',
    family: 'intelligence',
    userInput: '人民币对美元最近90天汇率走势',
    expectedTool: 'query_exchange_rates',
    expectedParams: { action: 'history', target: 'USD', days: 90 },
    description: '汇率 — 历史趋势',
    difficulty: 'medium',
  },

  // query_weather (3 actions)
  {
    id: 'intel-weather-001',
    family: 'intelligence',
    userInput: '全球港口天气摘要',
    expectedTool: 'query_weather',
    expectedParams: { action: 'summary' },
    description: '天气 — 摘要',
    difficulty: 'easy',
  },
  {
    id: 'intel-weather-002',
    family: 'intelligence',
    userInput: '所有港口详细天气和预警',
    expectedTool: 'query_weather',
    expectedParams: { action: 'all' },
    description: '天气 — 全部详情',
    difficulty: 'easy',
  },

  // query_commodities
  {
    id: 'intel-comm-001',
    family: 'intelligence',
    userInput: '铜价铝价钢价今天多少',
    expectedTool: 'query_commodities',
    expectedParams: {},
    description: '大宗商品价格',
    difficulty: 'easy',
  },

  // query_scfis
  {
    id: 'intel-scfis-001',
    family: 'intelligence',
    userInput: 'SCFIS欧洲航线运价指数',
    expectedTool: 'query_scfis',
    expectedParams: {},
    description: 'SCFIS运价指数',
    difficulty: 'medium',
  },

  // query_carbon_price
  {
    id: 'intel-carbon-001',
    family: 'intelligence',
    userInput: '欧盟碳价多少，CBAM成本怎么算',
    expectedTool: 'query_carbon_price',
    expectedParams: {},
    description: '碳价查询',
    difficulty: 'medium',
  },

  // query_financial_index
  {
    id: 'intel-fin-001',
    family: 'intelligence',
    userInput: '纳斯达克和半导体指数走势',
    expectedTool: 'query_financial_index',
    expectedParams: { symbols: ['QQQ', 'SMH'] },
    description: '金融指数 — 指定代码',
    difficulty: 'hard',
  },

  // query_amazon_competitors
  {
    id: 'intel-amz-001',
    family: 'intelligence',
    userInput: '亚马逊上咖啡机品类的竞品价格',
    expectedTool: 'query_amazon_competitors',
    expectedParams: { keyword: 'coffee maker', category: 'coffee-makers', action: 'overview' },
    description: '竞品分析 — 概览',
    difficulty: 'hard',
  },
  {
    id: 'intel-amz-002',
    family: 'intelligence',
    userInput: '吸尘器品类价格趋势',
    expectedTool: 'query_amazon_competitors',
    expectedParams: { category: 'vacuums', action: 'trends' },
    description: '竞品分析 — 趋势',
    difficulty: 'hard',
  },

  // query_brand_sentiment
  {
    id: 'intel-sentiment-001',
    family: 'intelligence',
    userInput: 'Cosori air fryer 的社交媒体舆情',
    expectedTool: 'query_brand_sentiment',
    expectedParams: { brand: 'Cosori air fryer', action: 'full' },
    description: '品牌舆情 — 完整报告',
    difficulty: 'medium',
  },
  {
    id: 'intel-sentiment-002',
    family: 'intelligence',
    userInput: 'Govee humidifier 有没有差评和质量问题',
    expectedTool: 'query_brand_sentiment',
    expectedParams: { brand: 'Govee humidifier', action: 'reviews' },
    description: '品牌舆情 — 差评监控',
    difficulty: 'hard',
  },

  // query_cascade_risk
  {
    id: 'intel-cascade-001',
    family: 'intelligence',
    userInput: '模拟港口拥堵对供应链的级联风险综合评估（使用级联风险引擎）',
    expectedTool: 'query_cascade_risk',
    expectedParams: { scenario: 'port_congestion' },
    description: '级联风险 — 港口拥堵',
    difficulty: 'medium',
  },
  {
    id: 'intel-cascade-002',
    family: 'intelligence',
    userInput: '如果汇率大幅波动，对供应链有什么级联风险影响（使用级联风险引擎综合评估）',
    expectedTool: 'query_cascade_risk',
    expectedParams: { scenario: 'exchange_shock' },
    description: '级联风险 — 汇率冲击',
    difficulty: 'medium',
  },
  {
    id: 'intel-cascade-003',
    family: 'intelligence',
    userInput: '台风天气对供应链的级联风险综合评估（使用级联风险引擎）',
    expectedTool: 'query_cascade_risk',
    expectedParams: { scenario: 'weather_disruption' },
    description: '级联风险 — 天气',
    difficulty: 'medium',
  },

  // query_cpsc_recalls
  {
    id: 'intel-cpsc-001',
    family: 'intelligence',
    userInput: '最近有没有中国产小家电被CPSC召回',
    expectedTool: 'query_cpsc_recalls',
    expectedParams: {},
    description: 'CPSC召回查询',
    difficulty: 'medium',
  },

  // query_port_congestion
  {
    id: 'intel-port-001',
    family: 'intelligence',
    userInput: '全球港口拥堵情况',
    expectedTool: 'query_port_congestion',
    expectedParams: {},
    description: '港口拥堵查询',
    difficulty: 'easy',
  },

  // query_coherence_audit
  {
    id: 'intel-coherence-001',
    family: 'intelligence',
    userInput: '做一次决策一致性审计，检查跨系统数据矛盾',
    expectedTool: 'query_coherence_audit',
    expectedParams: {},
    description: '一致性审计',
    difficulty: 'hard',
  },

  // query_recall_risk
  {
    id: 'intel-recall-001',
    family: 'intelligence',
    userInput: 'KA-RC4001 有没有召回风险',
    expectedTool: 'query_recall_risk',
    expectedParams: { sku: 'KA-RC4001' },
    description: '召回风险 — 指定SKU',
    difficulty: 'medium',
  },

  // query_decision_graph
  {
    id: 'intel-decision-001',
    family: 'intelligence',
    userInput: '库存决策建议，应该补货还是等一等',
    expectedTool: 'query_decision_graph',
    expectedParams: { domains: 'inventory' },
    description: '决策图 — 库存领域',
    difficulty: 'hard',
  },
  {
    id: 'intel-decision-002',
    family: 'intelligence',
    userInput: '综合决策建议，库存成本物流都看一下',
    expectedTool: 'query_decision_graph',
    expectedParams: { includeAll: true },
    description: '决策图 — 全领域',
    difficulty: 'hard',
  },

  // execute_workflow
  {
    id: 'intel-wf-001',
    family: 'intelligence',
    userInput: '做个全面体检',
    expectedTool: 'execute_workflow',
    expectedParams: { workflowId: 'wf-full-health' },
    description: '工作流 — 全面体检',
    difficulty: 'medium',
  },
  {
    id: 'intel-wf-002',
    family: 'intelligence',
    userInput: '汇率冲击分析',
    expectedTool: 'execute_workflow',
    expectedParams: { workflowId: 'wf-fx-impact' },
    description: '工作流 — 汇率冲击',
    difficulty: 'medium',
  },

  // query_tariff (3 actions)
  {
    id: 'intel-tariff-001',
    family: 'intelligence',
    userInput: '关税全景概览',
    expectedTool: 'query_tariff',
    expectedParams: { action: 'overview' },
    description: '关税 — 概览',
    difficulty: 'easy',
  },
  {
    id: 'intel-tariff-002',
    family: 'intelligence',
    userInput: '计算厨房电器出口到美国的关税，售价39.99美元',
    expectedTool: 'query_tariff',
    expectedParams: {
      action: 'compute',
      category: '厨房电器',
      countryCode: 'US',
      sellingPrice: 39.99,
    },
    description: '关税 — 计算特定产品',
    difficulty: 'hard',
  },
  {
    id: 'intel-tariff-003',
    family: 'intelligence',
    userInput: '模拟美国Section 301关税升级场景',
    expectedTool: 'query_tariff',
    expectedParams: { action: 'simulate', scenario: 'US Section 301 escalation' },
    description: '关税 — 情景模拟',
    difficulty: 'hard',
  },

  // run_sandbox
  {
    id: 'intel-sandbox-001',
    family: 'intelligence',
    userInput: '模拟完美风暴场景下的供应链韧性，100轮',
    expectedTool: 'run_sandbox',
    expectedParams: { scenario: 'perfect_storm', rounds: 100 },
    description: '沙盒 — 完美风暴',
    difficulty: 'medium',
  },

  // query_compliance_check
  {
    id: 'intel-compliance-001',
    family: 'intelligence',
    userInput: '蓝牙音箱出口美国需要什么认证',
    expectedTool: 'query_compliance_check',
    expectedParams: { product_name: '蓝牙音箱', market: 'US' },
    description: '合规检查 — 单市场',
    difficulty: 'medium',
  },
  {
    id: 'intel-compliance-002',
    family: 'intelligence',
    userInput: '智能咖啡机出口到美国欧盟英国日本分别需要什么认证，对比一下',
    expectedTool: 'query_compliance_check',
    expectedParams: { product_name: '智能咖啡机', action: 'multi' },
    description: '合规检查 — 多市场对比',
    difficulty: 'hard',
  },

  // query_financial_sim
  {
    id: 'intel-finsim-001',
    family: 'intelligence',
    userInput: '采购价80人民币，售价25美元，月销300台，这个品能不能做',
    expectedTool: 'query_financial_sim',
    expectedParams: {
      procurement_price_cny: 80,
      selling_price_usd: 25,
      monthly_sales: 300,
    },
    description: '财务模拟 — 快速判断',
    difficulty: 'hard',
  },

  // query_product_feed
  {
    id: 'intel-feed-001',
    family: 'intelligence',
    userInput: '生成JSON-LD格式的商品Feed',
    expectedTool: 'query_product_feed',
    expectedParams: { format: 'json-ld' },
    description: '商品Feed — JSON-LD',
    difficulty: 'medium',
  },

  // query_arbitrage
  {
    id: 'intel-arb-001',
    family: 'intelligence',
    userInput: '便携榨汁杯300ml USB充电，出口美国，1688采购，能套利吗',
    expectedTool: 'query_arbitrage',
    expectedParams: {
      product_description: '便携榨汁杯300ml USB充电',
      target_market: 'US',
      source_platform: '1688',
    },
    description: '套利分析',
    difficulty: 'hard',
  },

  // query_supplier_discovery
  {
    id: 'intel-disc-001',
    family: 'intelligence',
    userInput: '帮我找蓝牙音箱便携防水的供应商，目标市场美国',
    expectedTool: 'query_supplier_discovery',
    expectedParams: {
      product_description: '蓝牙音箱便携防水',
      target_market: 'US',
    },
    description: '供应商发现',
    difficulty: 'medium',
  },

  // web_search
  {
    id: 'intel-web-001',
    family: 'intelligence',
    userInput: '搜索一下 SCFI Shanghai container freight index May 2026',
    expectedTool: 'web_search',
    expectedParams: { query: 'SCFI Shanghai container freight index May 2026' },
    description: '联网搜索 — 英文关键词',
    difficulty: 'easy',
  },

  // generate_chart
  {
    id: 'intel-chart-001',
    family: 'intelligence',
    userInput: '画个柱状图：标题"各仓库库存量"，分类[深圳仓,义乌仓,北京仓]，数据[1500,800,600]',
    expectedTool: 'generate_chart',
    expectedParams: {
      type: 'bar',
      title: '各仓库库存量',
      categories: ['深圳仓', '义乌仓', '北京仓'],
      series: [{ name: '库存量', data: [1500, 800, 600] }],
    },
    description: '图表生成 — 柱状图',
    difficulty: 'hard',
  },

  // analyze_and_chart
  {
    id: 'intel-analyze-chart-001',
    family: 'intelligence',
    userInput: '按品类分析毛利率，画个饼图',
    expectedTool: 'analyze_and_chart',
    expectedParams: { metric: 'grossMargin', dimension: 'category', chartType: 'pie' },
    description: '自动分析出图 — 毛利率饼图',
    difficulty: 'medium',
  },

  // generate_report
  {
    id: 'intel-report-001',
    family: 'intelligence',
    userInput: '生成库存健康报告',
    expectedTool: 'generate_report',
    expectedParams: { type: 'inventory_health' },
    description: '报告生成 — 库存健康',
    difficulty: 'easy',
  },
];

// ─── Supply Chain Family (24 tools, ~24 cases) ──────────────────────────────

const supplyChainCases: ToolTestCase[] = [
  // calculate_eoq
  {
    id: 'sc-eoq-001',
    family: 'supply-chain',
    userInput: '计算EOQ：年需求10000件，订货成本200元，单位持有成本5元',
    expectedTool: 'calculate_eoq',
    expectedParams: {
      annual_demand: 10000,
      order_cost: 200,
      holding_cost_per_unit: 5,
    },
    description: 'EOQ计算 — 基本参数',
    difficulty: 'medium',
  },

  // calculate_safety_stock
  {
    id: 'sc-ss-001',
    family: 'supply-chain',
    userInput: '安全库存计算：服务水平0.95，需求标准差20，提前期14天',
    expectedTool: 'calculate_safety_stock',
    expectedParams: {
      service_level: 0.95,
      demand_std: 20,
      lead_time_days: 14,
    },
    description: '安全库存计算',
    difficulty: 'medium',
  },

  // calculate_reorder_point
  {
    id: 'sc-rop-001',
    family: 'supply-chain',
    userInput: '再订货点：日均需求50，需求标准差10，提前期7天，服务水平0.97',
    expectedTool: 'calculate_reorder_point',
    expectedParams: {
      avg_daily_demand: 50,
      demand_std: 10,
      lead_time_days: 7,
      service_level: 0.97,
    },
    description: 'ROP计算',
    difficulty: 'medium',
  },

  // classify_abc_xyz
  {
    id: 'sc-abc-001',
    family: 'supply-chain',
    userInput: 'ABC-XYZ分类，记录：[{"sku":"A001","revenue":100000,"demand_std":15,"avg_demand":300}]',
    expectedTool: 'classify_abc_xyz',
    expectedParams: {
      records: '[{"sku":"A001","revenue":100000,"demand_std":15,"avg_demand":300}]',
    },
    description: 'ABC-XYZ分类',
    difficulty: 'hard',
  },

  // forecast_demand
  {
    id: 'sc-forecast-001',
    family: 'supply-chain',
    userInput: '需求预测：历史数据[120,135,142,128,150,160]，预测3期',
    expectedTool: 'forecast_demand',
    expectedParams: {
      demand_history: '[120,135,142,128,150,160]',
      periods: 3,
    },
    description: '需求预测 — 多方法',
    difficulty: 'hard',
  },

  // calculate_seasonal_decompose
  {
    id: 'sc-seasonal-001',
    family: 'supply-chain',
    userInput: '季节分解：数据[100,120,140,130,110,130,150,140]，周期4',
    expectedTool: 'calculate_seasonal_decompose',
    expectedParams: {
      demand_history: '[100,120,140,130,110,130,150,140]',
      period_length: 4,
    },
    description: '季节分解',
    difficulty: 'hard',
  },

  // monte_carlo_inventory
  {
    id: 'sc-mc-001',
    family: 'supply-chain',
    userInput: '蒙特卡洛仿真：日均需求100，需求标准差25，提前期14天，提前期标准差3，再订货点1800，订货量500',
    expectedTool: 'monte_carlo_inventory',
    expectedParams: {
      avg_daily_demand: 100,
      demand_std: 25,
      lead_time_days: 14,
      lead_time_std: 3,
      reorder_point: 1800,
      order_qty: 500,
    },
    description: '蒙特卡洛库存仿真',
    difficulty: 'hard',
  },

  // calculate_wagner_whitin
  {
    id: 'sc-ww-001',
    family: 'supply-chain',
    userInput: 'Wagner-Whitin：需求[100,200,150,80,120]，订货成本100，持有成本2',
    expectedTool: 'calculate_wagner_whitin',
    expectedParams: {
      demands: '[100,200,150,80,120]',
      order_cost: 100,
      holding_cost_per_unit: 2,
    },
    description: 'Wagner-Whitin动态批量',
    difficulty: 'hard',
  },

  // calculate_newsvendor
  {
    id: 'sc-nv-001',
    family: 'supply-chain',
    userInput: '报童模型：售价30，采购成本15，残值5，需求均值200，需求标准差40',
    expectedTool: 'calculate_newsvendor',
    expectedParams: {
      selling_price: 30,
      purchase_cost: 15,
      salvage_value: 5,
      demand_mean: 200,
      demand_std: 40,
    },
    description: '报童模型',
    difficulty: 'hard',
  },

  // calculate_drp
  {
    id: 'sc-drp-001',
    family: 'supply-chain',
    userInput: 'DRP：期初库存500，已排程接收[200,0,0]，需求计划[150,180,200]，提前期1，订货量300，安全库存100',
    expectedTool: 'calculate_drp',
    expectedParams: {
      initial_inventory: 500,
      scheduled_receipts: '[200,0,0]',
      demand_schedule: '[150,180,200]',
      lead_time_days: 1,
      order_quantity: 300,
      safety_stock: 100,
    },
    description: '分销需求计划',
    difficulty: 'hard',
  },

  // calculate_warehouse_location
  {
    id: 'sc-wh-001',
    family: 'supply-chain',
    userInput: '仓库选址：位置[{"name":"A","x":10,"y":20,"demand":500},{"name":"B","x":30,"y":40,"demand":300}]',
    expectedTool: 'calculate_warehouse_location',
    expectedParams: {
      locations: '[{"name":"A","x":10,"y":20,"demand":500},{"name":"B","x":30,"y":40,"demand":300}]',
    },
    description: '仓库选址优化',
    difficulty: 'hard',
  },

  // calculate_transport_route
  {
    id: 'sc-route-001',
    family: 'supply-chain',
    userInput: '运输路线优化：点[{"name":"仓库","x":0,"y":0},{"name":"A点","x":10,"y":5},{"name":"B点","x":20,"y":15}]，从仓库出发',
    expectedTool: 'calculate_transport_route',
    expectedParams: {
      points: '[{"name":"仓库","x":0,"y":0},{"name":"A点","x":10,"y":5},{"name":"B点","x":20,"y":15}]',
      start_point: '仓库',
    },
    description: '运输路线TSP',
    difficulty: 'hard',
  },

  // calculate_multi_echelon_ss
  {
    id: 'sc-multi-001',
    family: 'supply-chain',
    userInput: '多级安全库存：每期需求200，标准差30，提前期5天，提前期标准差1，服务水平0.95，2级',
    expectedTool: 'calculate_multi_echelon_ss',
    expectedParams: {
      demand_per_period: 200,
      demand_std: 30,
      lead_time: 5,
      lead_time_std: 1,
      service_level: 0.95,
      echelons: 2,
    },
    description: '多级安全库存优化',
    difficulty: 'hard',
  },

  // calculate_inventory_kpi
  {
    id: 'sc-kpi-001',
    family: 'supply-chain',
    userInput: '库存KPI：年COGS 500万，平均库存100万，年需求10万件，满足订单9500，总订单10000，提前期14天，日均需求280',
    expectedTool: 'calculate_inventory_kpi',
    expectedParams: {
      annual_cogs: 5000000,
      avg_inventory: 1000000,
      annual_demand: 100000,
      orders_filled: 9500,
      total_orders: 10000,
      lead_time_days: 14,
      avg_daily_demand: 280,
    },
    description: '库存KPI仪表板',
    difficulty: 'hard',
  },

  // calculate_fill_rate
  {
    id: 'sc-fill-001',
    family: 'supply-chain',
    userInput: '填充率：服务水平0.95，需求标准差15，提前期10天，订货量200，日均需求40',
    expectedTool: 'calculate_fill_rate',
    expectedParams: {
      service_level: 0.95,
      demand_std: 15,
      lead_time_days: 10,
      order_quantity: 200,
      avg_daily_demand: 40,
    },
    description: '填充率计算',
    difficulty: 'hard',
  },

  // calculate_lead_time_analysis
  {
    id: 'sc-lt-001',
    family: 'supply-chain',
    userInput: '提前期分析：历史[12,14,11,13,15,12,14]，需求速率50，服务水平0.95',
    expectedTool: 'calculate_lead_time_analysis',
    expectedParams: {
      lead_times: '[12,14,11,13,15,12,14]',
      demand_rate: 50,
      service_level: 0.95,
    },
    description: '提前期分析',
    difficulty: 'hard',
  },

  // calculate_purchase_variance
  {
    id: 'sc-pv-001',
    family: 'supply-chain',
    userInput: '采购价差：实际价12，标准价10，实际量1000，标准量950',
    expectedTool: 'calculate_purchase_variance',
    expectedParams: {
      actual_price: 12,
      standard_price: 10,
      actual_qty: 1000,
      standard_qty: 950,
    },
    description: '采购价格差异分析',
    difficulty: 'medium',
  },

  // calculate_total_cost
  {
    id: 'sc-tc-001',
    family: 'supply-chain',
    userInput: '总供应链成本：年需求10000，订货成本200，持有成本5，采购单价50，缺货成本100，服务水平0.95',
    expectedTool: 'calculate_total_cost',
    expectedParams: {
      annual_demand: 10000,
      order_cost: 200,
      holding_cost_per_unit: 5,
      unit_cost: 50,
      stockout_cost_per_unit: 100,
      service_level: 0.95,
    },
    description: '总供应链成本模型',
    difficulty: 'hard',
  },

  // calculate_supplier_scoring
  {
    id: 'sc-score-001',
    family: 'supply-chain',
    userInput: '供应商评分：[{"name":"A","quality_score":90,"delivery_score":85,"cost_score":80,"service_score":88,"flexibility_score":75}]',
    expectedTool: 'calculate_supplier_scoring',
    expectedParams: {
      suppliers: '[{"name":"A","quality_score":90,"delivery_score":85,"cost_score":80,"service_score":88,"flexibility_score":75}]',
    },
    description: '供应商综合评分',
    difficulty: 'hard',
  },

  // calculate_learning_curve
  {
    id: 'sc-lc-001',
    family: 'supply-chain',
    userInput: '学习曲线：首件成本100，累计产量1000，学习率0.85',
    expectedTool: 'calculate_learning_curve',
    expectedParams: {
      first_unit_cost: 100,
      cumulative_units: 1000,
      learning_rate: 0.85,
    },
    description: '学习曲线计算',
    difficulty: 'medium',
  },

  // calculate_break_even
  {
    id: 'sc-be-001',
    family: 'supply-chain',
    userInput: '盈亏平衡：固定成本50000，单价100，单位变动成本60',
    expectedTool: 'calculate_break_even',
    expectedParams: {
      fixed_costs: 50000,
      unit_price: 100,
      unit_variable_cost: 60,
    },
    description: '盈亏平衡分析',
    difficulty: 'medium',
  },

  // calculate_optimal_pricing
  {
    id: 'sc-price-001',
    family: 'supply-chain',
    userInput: '最优定价：单位成本40，当前售价60，当前需求1000，弹性2.5',
    expectedTool: 'calculate_optimal_pricing',
    expectedParams: {
      unit_cost: 40,
      current_price: 60,
      current_demand: 1000,
      elasticity: 2.5,
    },
    description: '最优定价模型',
    difficulty: 'hard',
  },

  // calculate_joint_replenishment
  {
    id: 'sc-jrp-001',
    family: 'supply-chain',
    userInput: '联合补货：产品[{"annual_demand":10000,"unit_cost":50,"minor_setup_cost":50,"name":"A"}]，主订货费200',
    expectedTool: 'calculate_joint_replenishment',
    expectedParams: {
      items: '[{"annual_demand":10000,"unit_cost":50,"minor_setup_cost":50,"name":"A"}]',
      major_setup_cost: 200,
    },
    description: '联合补货优化',
    difficulty: 'hard',
  },

  // calculate_forecast_accuracy
  {
    id: 'sc-fa-001',
    family: 'supply-chain',
    userInput: '预测准确度：预测[{"sku":"A001","period_values":[100,110,105]}]，实际[98,112,108]',
    expectedTool: 'calculate_forecast_accuracy',
    expectedParams: {
      forecasts: '[{"sku":"A001","period_values":[100,110,105]}]',
      actuals: '[98,112,108]',
    },
    description: '预测准确度追踪',
    difficulty: 'hard',
  },
];

// ─── Supplier Graph Family (9 tools, ~12 cases) ─────────────────────────────

const supplierGraphCases: ToolTestCase[] = [
  // query_supplier_graph
  {
    id: 'sg-graph-001',
    family: 'supplier-graph',
    userInput: '查询 MIDE 企业的供应商图谱，2层深度',
    expectedTool: 'query_supplier_graph',
    expectedParams: { ticker: 'MIDE', depth: 2 },
    description: '供应商图谱 — 默认深度',
    difficulty: 'medium',
  },
  {
    id: 'sg-graph-002',
    family: 'supplier-graph',
    userInput: 'AAPL 供应链中压缩机相关的供应商，3层',
    expectedTool: 'query_supplier_graph',
    expectedParams: { ticker: 'AAPL', depth: 3, component: '压缩机' },
    description: '供应商图谱 — 按零部件筛选',
    difficulty: 'hard',
  },

  // query_supplier_dependency
  {
    id: 'sg-dep-001',
    family: 'supplier-graph',
    userInput: 'MIDE 的供应商依赖度分析',
    expectedTool: 'query_supplier_dependency',
    expectedParams: { ticker: 'MIDE' },
    description: '供应商依赖度',
    difficulty: 'medium',
  },

  // query_supplier_impact
  {
    id: 'sg-impact-001',
    family: 'supplier-graph',
    userInput: '如果供应商 SEMI 停产，下游哪些企业受影响，3层传播',
    expectedTool: 'query_supplier_impact',
    expectedParams: { supplier: 'SEMI', depth: 3 },
    description: '中断影响分析',
    difficulty: 'medium',
  },

  // query_supplier_chokepoints
  {
    id: 'sg-choke-001',
    family: 'supplier-graph',
    userInput: '供应链卡脖子供应商有哪些，看前10个',
    expectedTool: 'query_supplier_chokepoints',
    expectedParams: { limit: 10 },
    description: '卡脖子检测',
    difficulty: 'medium',
  },

  // query_supplier_geo_risk
  {
    id: 'sg-geo-001',
    family: 'supplier-graph',
    userInput: 'MIDE 的供应商地理集中度风险',
    expectedTool: 'query_supplier_geo_risk',
    expectedParams: { ticker: 'MIDE' },
    description: '地理风险分析',
    difficulty: 'medium',
  },

  // query_supplier_tiers
  {
    id: 'sg-tiers-001',
    family: 'supplier-graph',
    userInput: 'MIDE 的供应商层级结构，Tier-1和Tier-2',
    expectedTool: 'query_supplier_tiers',
    expectedParams: { ticker: 'MIDE' },
    description: '供应商层级',
    difficulty: 'easy',
  },

  // query_scraper_health
  {
    id: 'sg-health-001',
    family: 'supplier-graph',
    userInput: '数据源健康状态检查',
    expectedTool: 'query_scraper_health',
    expectedParams: {},
    description: '数据源健康',
    difficulty: 'easy',
  },

  // query_supplier_evolution
  {
    id: 'sg-evo-001',
    family: 'supplier-graph',
    userInput: 'MIDE 供应商网络最近6个月变化',
    expectedTool: 'query_supplier_evolution',
    expectedParams: { ticker: 'MIDE', months: 6 },
    description: '供应商网络演变',
    difficulty: 'medium',
  },

  // query_component_tree
  {
    id: 'sg-tree-001',
    family: 'supplier-graph',
    userInput: '零部件分类树',
    expectedTool: 'query_component_tree',
    expectedParams: {},
    description: '零部件分类树',
    difficulty: 'easy',
  },
];

// ─── Merged Export ──────────────────────────────────────────────────────────

export const allToolCases: ToolTestCase[] = [
  ...crudCases,
  ...operationsCases,
  ...intelligenceCases,
  ...supplyChainCases,
  ...supplierGraphCases,
];

export function getCasesByFamily(family: ToolFamily): ToolTestCase[] {
  return allToolCases.filter(c => c.family === family);
}

export function getCasesByTool(toolName: string): ToolTestCase[] {
  return allToolCases.filter(c => c.expectedTool === toolName);
}

export function getCaseById(id: string): ToolTestCase | undefined {
  return allToolCases.find(c => c.id === id);
}

export function getCaseCount(): number {
  return allToolCases.length;
}

export function getFamilyStats(): Record<ToolFamily, number> {
  const stats: Record<ToolFamily, number> = {
    'crud': 0,
    'operations': 0,
    'intelligence': 0,
    'supply-chain': 0,
    'supplier-graph': 0,
  };
  for (const c of allToolCases) {
    stats[c.family]++;
  }
  return stats;
}

export function getDifficultyStats(): Record<Difficulty, number> {
  const stats: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  for (const c of allToolCases) {
    stats[c.difficulty]++;
  }
  return stats;
}

/** Get all unique tool names covered by the test cases */
export function getCoveredTools(): string[] {
  return [...new Set(allToolCases.map(c => c.expectedTool))];
}
