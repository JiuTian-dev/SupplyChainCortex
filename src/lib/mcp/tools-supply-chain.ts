/**
 * MCP Tools: Supply Chain Math (Python bridge).
 *
 * These tools call the Python mcp-server/bridge.py for computational
 * supply chain algorithms: EOQ, safety stock, forecasting, optimization, etc.
 *
 * 调用模式通过环境变量 PYTHON_BRIDGE_MODE 切换:
 * - "exec" (默认): 通过 execFile('python3', ...) 启动子进程，向后兼容
 * - "http": 优先通过 FastAPI 常驻服务 (mcp-server/server.py) HTTP 调用，
 *           服务不可用时自动降级到 execFile
 */

import type { MCPTool } from './tools';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { callBridgeHttp, BridgeHttpUnavailableError } from '../python-bridge/http-client';

const execFileAsync = promisify(execFile);

/** 通过 execFile 启动 Python 子进程调用 bridge.py（原始模式） */
function callBridgeExec(tool: string, params: Record<string, unknown>): Promise<unknown> {
  const bridgePath = path.join(process.cwd(), 'mcp-server', 'bridge.py');
  const argsJson = JSON.stringify(params);
  const timeout = tool === 'monte_carlo_inventory' ? 60000 : 15000;
  return execFileAsync('python3', [bridgePath, tool, argsJson], {
    timeout,
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  }).then(({ stdout }) => {
    const result = JSON.parse(stdout.trim());
    if (result.error) throw new Error(result.error);
    return result;
  });
}

/**
 * 统一桥接入口：根据 PYTHON_BRIDGE_MODE 环境变量选择调用路径。
 * - "http": 优先 HTTP 调用 FastAPI 服务，连接失败时自动降级到 execFile
 * - "exec" (默认): 直接使用 execFile 子进程模式
 */
function callBridge(tool: string, params: Record<string, unknown>): Promise<unknown> {
  const mode = process.env.PYTHON_BRIDGE_MODE || 'exec';

  if (mode === 'http') {
    return callBridgeHttp(tool, params).catch((err) => {
      if (err instanceof BridgeHttpUnavailableError) {
        // FastAPI 服务不可用，降级到 execFile 保持功能可用
        return callBridgeExec(tool, params);
      }
      throw err;
    });
  }

  return callBridgeExec(tool, params);
}

// ─── Tool Definitions ──────────────────────────────────────────────────────────

export const supplyChainTools: MCPTool[] = [
  // ── Inventory ──
  {
    name: 'calculate_eoq',
    description: '计算经济订货批量(EOQ)，支持全量折扣和增量折扣模型。输入年需求量、订货成本、单位持有成本，可选折扣计划。',
    parameters: {
      type: 'object',
      properties: {
        annual_demand: { type: 'number', description: '年需求量 D' },
        order_cost: { type: 'number', description: '每次订货固定成本 S' },
        holding_cost_per_unit: { type: 'number', description: '单位年持有成本 H' },
        discount_schedule: { type: ['string', 'array'], description: '折扣计划的JSON字符串或数组，格式: [{"break_qty": 0, "unit_cost": 10}, ...]' },
        discount_type: { type: 'string', description: '折扣类型: all_units | incremental', enum: ['all_units', 'incremental'] },
      },
      required: ['annual_demand', 'order_cost', 'holding_cost_per_unit'],
    },
    handler: async (p) => {
      const params = { ...p };
      if (typeof params.discount_schedule === 'string') {
        params.discount_schedule = JSON.parse(params.discount_schedule as string);
      }
      return callBridge('calculate_eoq', params);
    },
  },
  {
    name: 'calculate_safety_stock',
    description: '计算安全库存，支持任意服务水平(0.50-0.9999)和Type 2填充率。输入服务水平、需求标准差、提前期天数等。',
    parameters: {
      type: 'object',
      properties: {
        service_level: { type: 'number', description: '服务水平 (0.50-0.9999)' },
        demand_std: { type: 'number', description: '每日需求标准差' },
        lead_time_days: { type: 'number', description: '平均提前期（天）' },
        avg_daily_demand: { type: 'number', description: '日均需求量' },
        order_quantity: { type: 'number', description: '订货批量Q（用于计算填充率）' },
      },
      required: ['service_level', 'demand_std', 'lead_time_days'],
    },
    handler: (p) => callBridge('calculate_safety_stock', p),
  },
  {
    name: 'calculate_reorder_point',
    description: '计算再订货点(ROP)。ROP = d̄×LT + d̄×R + Z×√(LT×σ_d² + d̄²×σ_LT²)。支持连续盘点和定期盘点。',
    parameters: {
      type: 'object',
      properties: {
        avg_daily_demand: { type: 'number', description: '日均需求量' },
        demand_std: { type: 'number', description: '需求标准差' },
        lead_time_days: { type: 'number', description: '平均提前期（天）' },
        lead_time_std: { type: 'number', description: '提前期标准差' },
        service_level: { type: 'number', description: '服务水平，默认0.95' },
        review_period_days: { type: 'number', description: '盘点周期（天），0=连续盘点' },
      },
      required: ['avg_daily_demand', 'demand_std', 'lead_time_days'],
    },
    handler: (p) => callBridge('calculate_reorder_point', p),
  },
  {
    name: 'classify_abc_xyz',
    description: 'ABC-XYZ联合分类。ABC按收入累计占比分A/B/C类，XYZ按需求变异系数分X/Y/Z类，输出管理策略建议。',
    parameters: {
      type: 'object',
      properties: {
        records: { type: ['string', 'array'], description: '记录列表的JSON字符串或数组，每条含sku, revenue, demand_std, avg_demand' },
        abc_thresholds: { type: ['string', 'array'], description: 'ABC阈值JSON，如[0.80, 0.95]' },
      },
      required: ['records'],
    },
    handler: async (p) => {
      const params: Record<string, unknown> = {};
      if (typeof p.records === 'string') params.records = JSON.parse(p.records as string);
      else params.records = p.records;
      if (p.abc_thresholds) params.abc_thresholds = typeof p.abc_thresholds === 'string' ? JSON.parse(p.abc_thresholds as string) : p.abc_thresholds;
      return callBridge('classify_abc_xyz', params);
    },
  },

  // ── Forecasting ──
  {
    name: 'forecast_demand',
    description: '多方法需求预测：移动平均SMA(3)、指数平滑ES、线性回归、Winters季节预测、Croston间歇需求。输出各方法预测值和置信区间。',
    parameters: {
      type: 'object',
      properties: {
        demand_history: { type: ['string', 'array'], description: '历史需求数据JSON数组，如[120,135,142,...]。可传字符串或直接传数组。' },
        periods: { type: 'number', description: '预测期数' },
        alpha: { type: 'number', description: 'ES平滑参数(0-1)，默认0.3' },
        beta: { type: 'number', description: '趋势平滑参数(0-1)，默认0.1' },
        gamma: { type: 'number', description: '季节平滑参数(0-1)，默认0.2' },
        season_length: { type: 'number', description: '季节周期长度，0=无季节性' },
        method: { type: 'string', description: '预测方法: all, sma, es, linear_trend, winters, croston' },
      },
      required: ['demand_history', 'periods'],
    },
    handler: async (p) => {
      const params: Record<string, unknown> = { ...p };
      if (typeof params.demand_history === 'string') {
        params.demand_history = JSON.parse(params.demand_history as string);
      }
      return callBridge('forecast_demand', params);
    },
  },
  {
    name: 'calculate_seasonal_decompose',
    description: '季节分解（比率移动平均法）。将时间序列分解为趋势和季节成分，输出去季节化数据和下一周期预测。',
    parameters: {
      type: 'object',
      properties: {
        demand_history: { type: ['string', 'array'], description: '历史需求数据JSON数组。可传字符串或直接传数组。' },
        period_length: { type: 'number', description: '季节周期长度（如12=月度，4=季度）' },
      },
      required: ['demand_history', 'period_length'],
    },
    handler: async (p) => {
      const params: Record<string, unknown> = { ...p };
      if (typeof params.demand_history === 'string') {
        params.demand_history = JSON.parse(params.demand_history as string);
      }
      return callBridge('calculate_seasonal_decompose', params);
    },
  },

  {
    name: 'monte_carlo_inventory',
    description: '蒙特卡洛库存仿真。(Q,R)连续盘点策略，多次仿真计算平均缺货天数、服务水平、缺货概率等指标。',
    parameters: {
      type: 'object',
      properties: {
        avg_daily_demand: { type: 'number', description: '日均需求量' },
        demand_std: { type: 'number', description: '需求标准差' },
        lead_time_days: { type: 'number', description: '平均提前期' },
        lead_time_std: { type: 'number', description: '提前期标准差' },
        reorder_point: { type: 'number', description: '再订货点' },
        order_qty: { type: 'number', description: '订货批量' },
        simulations: { type: 'number', description: '仿真次数，默认1000' },
        days: { type: 'number', description: '仿真天数，默认365' },
      },
      required: ['avg_daily_demand', 'demand_std', 'lead_time_days', 'lead_time_std', 'reorder_point', 'order_qty'],
    },
    handler: (p) => callBridge('monte_carlo_inventory', p),
  },

  // ── Optimization ──
  {
    name: 'calculate_wagner_whitin',
    description: 'Wagner-Whitin动态批量算法（最优解）。前向递推动态规划，返回每期订货量、总成本和详细计划表。',
    parameters: {
      type: 'object',
      properties: {
        demands: { type: ['string', 'array'], description: '每期需求量JSON数组，如[100,200,150,80]。可传字符串或直接传数组。' },
        order_cost: { type: 'number', description: '固定订货成本' },
        holding_cost_per_unit: { type: 'number', description: '单位持有成本/期' },
      },
      required: ['demands', 'order_cost', 'holding_cost_per_unit'],
    },
    handler: async (p) => {
      const params: Record<string, unknown> = { ...p };
      if (typeof params.demands === 'string') params.demands = JSON.parse(params.demands as string);
      return callBridge('calculate_wagner_whitin', params);
    },
  },
  {
    name: 'calculate_newsvendor',
    description: '报童模型。单周期最优订货量，基于临界比率CR=Cu/(Cu+Co)。输出最优订货量、期望销售、期望剩余、期望利润。',
    parameters: {
      type: 'object',
      properties: {
        selling_price: { type: 'number', description: '售价' },
        purchase_cost: { type: 'number', description: '采购成本' },
        salvage_value: { type: 'number', description: '残值' },
        demand_mean: { type: 'number', description: '需求均值' },
        demand_std: { type: 'number', description: '需求标准差' },
      },
      required: ['selling_price', 'purchase_cost', 'salvage_value', 'demand_mean', 'demand_std'],
    },
    handler: (p) => callBridge('calculate_newsvendor', p),
  },

  // ── Network ──
  {
    name: 'calculate_drp',
    description: '分销需求计划(DRP)。时间分段计划，驱动从下游需求向上游补货。输出每期预计可用、净需求、计划订单接收和下达。',
    parameters: {
      type: 'object',
      properties: {
        initial_inventory: { type: 'number', description: '期初库存' },
        scheduled_receipts: { type: ['string', 'array'], description: '已排程接收JSON数组。可传字符串或直接传数组。' },
        demand_schedule: { type: ['string', 'array'], description: '需求计划JSON数组。可传字符串或直接传数组。' },
        lead_time_days: { type: 'number', description: '提前期（周期数）' },
        order_quantity: { type: 'number', description: '固定订货批量，0=按需订货' },
        safety_stock: { type: 'number', description: '安全库存量' },
      },
      required: ['initial_inventory', 'scheduled_receipts', 'demand_schedule', 'lead_time_days', 'order_quantity', 'safety_stock'],
    },
    handler: async (p) => {
      const params: Record<string, unknown> = { ...p };
      for (const k of ['scheduled_receipts', 'demand_schedule']) {
        if (typeof params[k] === 'string') params[k] = JSON.parse(params[k] as string);
      }
      return callBridge('calculate_drp', params);
    },
  },
  {
    name: 'calculate_warehouse_location',
    description: '仓库选址优化（重心法）。根据各个位置的需求量和坐标，计算最优仓库位置。X*=Σ(xi×di)/Σdi, Y*=Σ(yi×di)/Σdi。',
    parameters: {
      type: 'object',
      properties: {
        locations: { type: ['string', 'array'], description: '位置列表JSON或数组，每条含name, x, y, demand' },
      },
      required: ['locations'],
    },
    handler: async (p) => {
      const params: Record<string, unknown> = {};
      if (typeof p.locations === 'string') params.locations = JSON.parse(p.locations as string);
      else params.locations = p.locations;
      return callBridge('calculate_warehouse_location', params);
    },
  },
  {
    name: 'calculate_transport_route',
    description: '运输路线优化（TSP最近邻启发式）。给定一系列点的坐标，计算最短路径。每步选最近未访问点，最后返回起点。',
    parameters: {
      type: 'object',
      properties: {
        points: { type: ['string', 'array'], description: '点列表JSON或数组，每条含name, x, y' },
        start_point: { type: 'string', description: '起始点名称' },
      },
      required: ['points'],
    },
    handler: async (p) => {
      const params: Record<string, unknown> = {};
      if (typeof p.points === 'string') params.points = JSON.parse(p.points as string);
      else params.points = p.points;
      if (p.start_point) params.start_point = p.start_point;
      return callBridge('calculate_transport_route', params);
    },
  },
  {
    name: 'calculate_multi_echelon_ss',
    description: '多级安全库存优化。比较分散策略（每级独立SS）与集中策略（风险池化），计算池化节省的安全库存量和百分比。',
    parameters: {
      type: 'object',
      properties: {
        demand_per_period: { type: 'number', description: '每期平均需求' },
        demand_std: { type: 'number', description: '需求标准差' },
        lead_time: { type: 'number', description: '每级提前期' },
        lead_time_std: { type: 'number', description: '提前期标准差' },
        service_level: { type: 'number', description: '目标服务水平(0.50-0.9999)' },
        echelons: { type: 'number', description: '级数，默认2' },
      },
      required: ['demand_per_period', 'demand_std', 'lead_time', 'lead_time_std', 'service_level'],
    },
    handler: (p) => callBridge('calculate_multi_echelon_ss', p),
  },

  // ── Metrics ──
  {
    name: 'calculate_inventory_kpi',
    description: '库存KPI仪表板。计算周转率、供货天数/周数、满足率、GMROI、持有成本率、呆滞库存比、完美订单率等综合指标。',
    parameters: {
      type: 'object',
      properties: {
        annual_cogs: { type: 'number', description: '年销售成本' },
        avg_inventory: { type: 'number', description: '平均库存价值' },
        annual_demand: { type: 'number', description: '年需求量（单位）' },
        orders_filled: { type: 'number', description: '完全满足的订单数' },
        total_orders: { type: 'number', description: '总订单数' },
        lead_time_days: { type: 'number', description: '平均提前期' },
        avg_daily_demand: { type: 'number', description: '日均需求' },
      },
      required: ['annual_cogs', 'avg_inventory', 'annual_demand', 'orders_filled', 'total_orders', 'lead_time_days', 'avg_daily_demand'],
    },
    handler: (p) => callBridge('calculate_inventory_kpi', p),
  },
  {
    name: 'calculate_fill_rate',
    description: '计算Type 1（周期服务水平）和Type 2（填充率）指标。填充率=1-E[缺货]/Q，考虑安全库存和(S,Q)策略。',
    parameters: {
      type: 'object',
      properties: {
        service_level: { type: 'number', description: '目标Type 1服务水平(0.50-0.9999)' },
        demand_std: { type: 'number', description: '需求标准差' },
        lead_time_days: { type: 'number', description: '平均提前期' },
        order_quantity: { type: 'number', description: '订货批量Q' },
        avg_daily_demand: { type: 'number', description: '日均需求量' },
      },
      required: ['service_level', 'demand_std', 'lead_time_days', 'order_quantity', 'avg_daily_demand'],
    },
    handler: (p) => callBridge('calculate_fill_rate', p),
  },
  {
    name: 'calculate_lead_time_analysis',
    description: '提前期分析。CV分类（稳定/一般/不稳定）+安全库存+ROP。支持任意服务水平(0.50-0.9999)。',
    parameters: {
      type: 'object',
      properties: {
        lead_times: { type: ['string', 'array'], description: '历史提前期数据JSON数组。可传字符串或直接传数组。' },
        demand_rate: { type: 'number', description: '需求速率' },
        service_level: { type: 'number', description: '服务水平(0.50-0.9999)' },
      },
      required: ['lead_times', 'demand_rate', 'service_level'],
    },
    handler: async (p) => {
      const params: Record<string, unknown> = { ...p };
      if (typeof params.lead_times === 'string') params.lead_times = JSON.parse(params.lead_times as string);
      return callBridge('calculate_lead_time_analysis', params);
    },
  },
  {
    name: 'calculate_purchase_variance',
    description: '采购价格差异分析。计算采购价差(PPV)、用量差异和总差异，判断有利/不利差异，验证PPV+用量差异=总差异。',
    parameters: {
      type: 'object',
      properties: {
        actual_price: { type: 'number', description: '实际单价' },
        standard_price: { type: 'number', description: '标准（预算）单价' },
        actual_qty: { type: 'number', description: '实际采购/使用量' },
        standard_qty: { type: 'number', description: '标准（预算）量' },
      },
      required: ['actual_price', 'standard_price', 'actual_qty', 'standard_qty'],
    },
    handler: (p) => callBridge('calculate_purchase_variance', p),
  },

  // ── Finance ──
  {
    name: 'calculate_total_cost',
    description: '总供应链成本模型。综合计算EOQ、订货成本、持有成本、采购成本、安全库存和缺货成本，输出成本占比分析。',
    parameters: {
      type: 'object',
      properties: {
        annual_demand: { type: 'number', description: '年需求量' },
        order_cost: { type: 'number', description: '每次订货成本' },
        holding_cost_per_unit: { type: 'number', description: '单位年持有成本' },
        unit_cost: { type: 'number', description: '单位采购成本' },
        stockout_cost_per_unit: { type: 'number', description: '单位缺货成本' },
        service_level: { type: 'number', description: '服务水平，默认0.95' },
        demand_std: { type: 'number', description: '需求标准差' },
        lead_time_days: { type: 'number', description: '提前期天数' },
      },
      required: ['annual_demand', 'order_cost', 'holding_cost_per_unit', 'unit_cost'],
    },
    handler: (p) => callBridge('calculate_total_cost', p),
  },
  {
    name: 'calculate_supplier_scoring',
    description: '供应商综合评分。加权评分：质量0.30/交付0.25/成本0.20/服务0.15/柔性0.10。输出排名、评级(A/B/C/D)、优劣势和改进建议。',
    parameters: {
      type: 'object',
      properties: {
        suppliers: { type: ['string', 'array'], description: '供应商列表JSON或数组，每条含name, quality_score, delivery_score, cost_score, service_score, flexibility_score' },
      },
      required: ['suppliers'],
    },
    handler: async (p) => {
      const params: Record<string, unknown> = {};
      if (typeof p.suppliers === 'string') params.suppliers = JSON.parse(p.suppliers as string);
      else params.suppliers = p.suppliers;
      return callBridge('calculate_supplier_scoring', params);
    },
  },

  // ── Production ──
  {
    name: 'calculate_learning_curve',
    description: '学习曲线（Wright模型）。Y=a·X^b，产量翻倍时单位成本降至原有LR%。计算目标产量的单位成本、平均成本、总成本、学习节省，含成本轨迹表。',
    parameters: {
      type: 'object',
      properties: {
        first_unit_cost: { type: 'number', description: '首件成本' },
        cumulative_units: { type: 'number', description: '目标累计产量' },
        learning_rate: { type: 'number', description: '学习率(0.70-0.95)，如0.85=85%学习曲线' },
        current_cumulative: { type: 'number', description: '当前累计产量（0=从首件开始）' },
        detailed: { type: 'boolean', description: '是否输出轨迹表，默认true' },
      },
      required: ['first_unit_cost', 'cumulative_units', 'learning_rate'],
    },
    handler: (p) => callBridge('calculate_learning_curve', p),
  },
  {
    name: 'calculate_break_even',
    description: '盈亏平衡分析。计算BEP单位/收入、现金BEP、目标利润量、安全边际、经营杠杆。支持多场景what-if分析（价格/变动成本/固定成本变化）。',
    parameters: {
      type: 'object',
      properties: {
        fixed_costs: { type: 'number', description: '固定成本总额' },
        unit_price: { type: 'number', description: '单价' },
        unit_variable_cost: { type: 'number', description: '单位变动成本' },
        target_profit: { type: 'number', description: '目标利润（税后，默认0=盈亏平衡）' },
        depreciation: { type: 'number', description: '固定成本中的折旧（用于现金BEP）' },
        tax_rate: { type: 'number', description: '税率(0-1)，默认0' },
        scenarios: { type: ['string', 'array'], description: '场景JSON数组或数组，每条可选label,price,vc,fc' },
      },
      required: ['fixed_costs', 'unit_price', 'unit_variable_cost'],
    },
    handler: async (p) => {
      const params: Record<string, unknown> = { ...p };
      if (typeof params.scenarios === 'string') params.scenarios = JSON.parse(params.scenarios as string);
      return callBridge('calculate_break_even', params);
    },
  },

  // ── Pricing ──
  {
    name: 'calculate_optimal_pricing',
    description: '最优定价模型。基于需求价格弹性计算利润最大化定价。支持弹性模型P*=C·ε/(ε-1)和线性需求模型。含价格敏感度分析和涨价/降价what-if。',
    parameters: {
      type: 'object',
      properties: {
        unit_cost: { type: 'number', description: '单位成本' },
        current_price: { type: 'number', description: '当前售价' },
        current_demand: { type: 'number', description: '当前需求量' },
        elasticity: { type: 'number', description: '需求价格弹性(>1)，如2.5。弹性模型必填' },
        demand_at_zero_price: { type: 'number', description: '零价格时的理论需求（线性模型必填）' },
        model: { type: 'string', description: '模型: elasticity(默认) 或 linear' },
        detailed: { type: 'boolean', description: '是否输出价格敏感度表，默认true' },
      },
      required: ['unit_cost', 'current_price', 'current_demand'],
    },
    handler: (p) => callBridge('calculate_optimal_pricing', p),
  },

  // ── Planning ──
  {
    name: 'calculate_joint_replenishment',
    description: '联合补货优化(JRP)。多产品共用主订货费时，计算最优联合订货周期和各自倍数。对比独立vs联合的总成本、年节省额和节省百分比。',
    parameters: {
      type: 'object',
      properties: {
        items: { type: ['string', 'array'], description: '产品列表JSON或数组，每条含annual_demand,unit_cost,minor_setup_cost,name' },
        major_setup_cost: { type: 'number', description: '主订货费（所有产品共用，如卡车调度费）' },
        interest_rate: { type: 'number', description: '年持有成本率(0.05-1.0)，默认0.25' },
        detailed: { type: 'boolean', description: '是否输出逐项明细，默认true' },
      },
      required: ['items', 'major_setup_cost'],
    },
    handler: async (p) => {
      const params: Record<string, unknown> = { ...p };
      if (typeof params.items === 'string') params.items = JSON.parse(params.items as string);
      return callBridge('calculate_joint_replenishment', params);
    },
  },
  {
    name: 'calculate_forecast_accuracy',
    description: '预测准确度追踪。多SKU多周期精度评估：MAD/MAPE/WMAPE/RMSE/MASE/偏差、追踪信号(TS)、偏差趋势(改善/恶化)、最差SKU识别、方法推荐。',
    parameters: {
      type: 'object',
      properties: {
        forecasts: { type: ['string', 'array'], description: '预测列表JSON或数组，每条含sku,category(可选),period_values(每期预测值数组)' },
        actuals: { type: ['string', 'array'], description: '实际值JSON数组（每期）' },
        period_labels: { type: ['string', 'array'], description: '周期标签JSON数组，如["1月","2月",...]' },
      },
      required: ['forecasts', 'actuals'],
    },
    handler: async (p) => {
      const params: Record<string, unknown> = {};
      for (const k of ['forecasts', 'actuals', 'period_labels']) {
        if (typeof p[k] === 'string') params[k] = JSON.parse(p[k] as string);
        else if (p[k] !== undefined) params[k] = p[k];
      }
      return callBridge('calculate_forecast_accuracy', params);
    },
  },
];
