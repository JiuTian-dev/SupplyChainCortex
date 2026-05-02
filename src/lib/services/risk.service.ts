/**
 * Risk Service - Risk analysis business logic
 * Extracted from /api/risk route for reusability and testability
 * Deduplicates logic with score.service.ts where possible
 */

import { db } from '@/lib/db';
import { getExchangeRate } from '@/lib/exchange-rate';
import { getAllPortsWeather } from '@/lib/services/weather.service';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RiskDashboard {
  overallRisk: number;
  riskLevel: 'low' | 'medium' | 'high';
  dimensions: Array<{ name: string; score: number; key: string }>;
  topRisks: Array<{ severity: 'critical' | 'high' | 'medium'; description: string; dimension: string }>;
  summary: {
    totalProducts: number;
    criticalItems: number;
    warningItems: number;
    delayedShipments: number;
    lowMarginItems: number;
  };
  timestamp: string;
}

export interface RiskMatrixItem {
  sku: string;
  productName: string;
  likelihood: number;
  impact: number;
  riskScore: number;
  category: 'critical' | 'high' | 'medium' | 'low';
  inventoryStatus: string;
  margin: number;
  sellingPrice: number;
  quantity: number;
  safetyStock: number;
  warehouse: string;
  hasDelayedShipment: boolean;
  category2: string;
}

export interface SimulationResult {
  scenario: string;
  scenarioName: string;
  description: string;
  impacts: Array<{ dimension: string; currentScore: number; simulatedScore: number; change: number }>;
  affectedItems: number;
  recommendations: string[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MAX_TAKE = 5000;

// ─── Deterministic Hash for Pseudo-random ──────────────────────────────────────

/** Simple deterministic hash function for seeded pseudo-random values */
function deterministicHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/** Deterministic pseudo-random number in [0, 1) range from seed */
function seededRandom(seed: string): number {
  const hash = deterministicHash(seed);
  return (hash % 10000) / 10000;
}

// ─── Core Business Logic ───────────────────────────────────────────────────────

/** Get risk dashboard overview */
export async function getRiskDashboard(): Promise<RiskDashboard> {
  const [inventory, costRecords, shipments, salesRecords, products] = await Promise.all([
    db.inventory.findMany({ take: MAX_TAKE }),
    db.costRecord.findMany({ take: MAX_TAKE }),
    db.shipmentItem.findMany({ take: MAX_TAKE }),
    db.salesRecord.findMany({ take: MAX_TAKE }),
    db.product.findMany({ take: MAX_TAKE }),
  ]);

  // Calculate risk dimensions (0-100, higher = more risk)
  const criticalCount = inventory.filter(i => i.stockStatus === 'critical').length;
  const warningCount = inventory.filter(i => i.stockStatus === 'warning').length;
  const overstockCount = inventory.filter(i => i.stockStatus === 'overstock').length;
  const inventoryRisk = Math.min(100, Math.round(
    (criticalCount * 25 + warningCount * 12 + overstockCount * 8) / Math.max(inventory.length, 1) * 10
  ));

  const lowMarginCount = costRecords.filter(c => c.grossMargin < 45).length;
  const avgMargin = costRecords.length > 0
    ? costRecords.reduce((sum, c) => sum + c.grossMargin, 0) / costRecords.length
    : 50;
  const costRisk = Math.min(100, Math.round(
    (50 - avgMargin) * 1.5 + lowMarginCount * 8
  ));

  const delayedShipments = shipments.filter(s => s.status === 'delayed' || s.status === 'exception').length;
  const highRiskShipments = shipments.filter(s => s.riskLevel === 'high' || s.riskLevel === 'critical').length;
  const logisticsRisk = Math.min(100, Math.round(
    (delayedShipments * 15 + highRiskShipments * 20) / Math.max(shipments.length, 1) * 10
  ));

  const supplierRisk = 35; // moderate baseline

  const salesByProduct: Record<string, number[]> = {};
  salesRecords.forEach(r => {
    if (!salesByProduct[r.sku]) salesByProduct[r.sku] = [];
    salesByProduct[r.sku].push(r.quantity);
  });
  let totalVolatility = 0;
  let productCount = 0;
  Object.values(salesByProduct).forEach(qtys => {
    if (qtys.length >= 3) {
      const avg = qtys.reduce((a, b) => a + b, 0) / qtys.length;
      const variance = qtys.reduce((sum, q) => sum + Math.pow(q - avg, 2), 0) / qtys.length;
      const cv = avg > 0 ? Math.sqrt(variance) / avg : 0;
      totalVolatility += cv;
      productCount++;
    }
  });
  const demandRisk = Math.min(100, Math.round(
    productCount > 0 ? (totalVolatility / productCount) * 80 : 25
  ));

  const overallRisk = Math.round(
    inventoryRisk * 0.25 + costRisk * 0.2 + logisticsRisk * 0.2 + supplierRisk * 0.15 + demandRisk * 0.2
  );

  const topRisks = [
    ...(criticalCount > 0 ? [{ severity: 'critical' as const, description: `${criticalCount} 个产品库存低于安全水位，面临缺货风险`, dimension: '库存风险' }] : []),
    ...(lowMarginCount > 0 ? [{ severity: 'high' as const, description: `${lowMarginCount} 个产品毛利率低于 45%，盈利能力受压`, dimension: '成本风险' }] : []),
    ...(delayedShipments > 0 ? [{ severity: 'high' as const, description: `${delayedShipments} 批货物运输延误或异常`, dimension: '物流风险' }] : []),
    ...(demandRisk > 50 ? [{ severity: 'medium' as const, description: `市场需求波动较大，CV 指数 ${(totalVolatility / Math.max(productCount, 1)).toFixed(2)}`, dimension: '需求风险' }] : []),
  ].slice(0, 3);

  const dimensions = [
    { name: '库存风险', score: inventoryRisk, key: 'inventory' },
    { name: '成本风险', score: costRisk, key: 'cost' },
    { name: '物流风险', score: logisticsRisk, key: 'logistics' },
    { name: '供应商风险', score: supplierRisk, key: 'supplier' },
    { name: '需求风险', score: demandRisk, key: 'demand' },
  ];

  return {
    overallRisk,
    riskLevel: overallRisk < 30 ? 'low' : overallRisk < 60 ? 'medium' : 'high',
    dimensions,
    topRisks,
    summary: {
      totalProducts: products.length,
      criticalItems: criticalCount,
      warningItems: warningCount,
      delayedShipments,
      lowMarginItems: lowMarginCount,
    },
    timestamp: new Date().toISOString(),
  };
}

/** Get risk matrix data */
export async function getRiskMatrix() {
  const [inventory, costRecords, shipments, products] = await Promise.all([
    db.inventory.findMany({ take: MAX_TAKE }),
    db.costRecord.findMany({ take: MAX_TAKE }),
    db.shipmentItem.findMany({ take: MAX_TAKE }),
    db.product.findMany({ take: MAX_TAKE }),
  ]);

  const matrix: RiskMatrixItem[] = inventory.map(inv => {
    const cost = costRecords.find(c => c.sku === inv.sku);
    const ship = shipments.find(s => s.sku === inv.sku);
    const product = products.find(p => p.sku === inv.sku);

    let likelihood = 1;
    if (inv.stockStatus === 'critical') likelihood = 5;
    else if (inv.stockStatus === 'warning') likelihood = 4;
    else if (inv.stockStatus === 'overstock') likelihood = 2;
    if (ship && (ship.status === 'delayed' || ship.status === 'exception')) {
      likelihood = Math.min(5, likelihood + 1);
    }

    let impact = 2;
    if (cost && cost.grossMargin < 40) impact = 5;
    else if (cost && cost.grossMargin < 45) impact = 4;
    else if (cost && cost.grossMargin < 50) impact = 3;
    if (cost && cost.sellingPrice > 200) {
      impact = Math.min(5, impact + 1);
    }

    const riskScore = likelihood * impact;
    const category: RiskMatrixItem['category'] = riskScore >= 20 ? 'critical' : riskScore >= 12 ? 'high' : riskScore >= 6 ? 'medium' : 'low';

    return {
      sku: inv.sku,
      productName: inv.productName,
      likelihood,
      impact,
      riskScore,
      category,
      inventoryStatus: inv.stockStatus,
      margin: cost?.grossMargin || 0,
      sellingPrice: cost?.sellingPrice || 0,
      quantity: inv.quantity,
      safetyStock: inv.safetyStock,
      warehouse: inv.warehouse,
      hasDelayedShipment: ship?.status === 'delayed' || ship?.status === 'exception',
      category2: product?.category || '',
    };
  }).sort((a, b) => b.riskScore - a.riskScore);

  const grid: Record<string, number> = {};
  for (let l = 1; l <= 5; l++) {
    for (let i = 1; i <= 5; i++) {
      grid[`${l}-${i}`] = 0;
    }
  }
  matrix.forEach(item => {
    const key = `${item.likelihood}-${item.impact}`;
    grid[key] = (grid[key] || 0) + 1;
  });

  const overallRiskScore = matrix.length > 0
    ? Math.round(matrix.reduce((sum, m) => sum + m.riskScore, 0) / matrix.length)
    : 0;

  return {
    matrix,
    grid,
    overallRiskScore,
    totalProducts: matrix.length,
    riskDistribution: {
      critical: matrix.filter(m => m.category === 'critical').length,
      high: matrix.filter(m => m.category === 'high').length,
      medium: matrix.filter(m => m.category === 'medium').length,
      low: matrix.filter(m => m.category === 'low').length,
    },
  };
}

/** Get risk mitigation strategies */
export async function getRiskMitigations() {
  const [inventory, costRecords, shipments] = await Promise.all([
    db.inventory.findMany({ take: MAX_TAKE }),
    db.costRecord.findMany({ take: MAX_TAKE }),
    db.shipmentItem.findMany({ take: MAX_TAKE }),
  ]);

  const mitigations: Array<{
    riskType: string;
    description: string;
    priority: string;
    estimatedImpact: string;
    status: string;
  }> = [];

  const criticalItems = inventory.filter(i => i.stockStatus === 'critical');
  if (criticalItems.length > 0) {
    mitigations.push({
      riskType: '库存风险',
      description: `紧急补货 ${criticalItems.length} 个低库存产品，避免断货`,
      priority: 'critical',
      estimatedImpact: '减少缺货损失约 ¥50,000/月',
      status: 'pending',
    });
  }

  const overstockItems = inventory.filter(i => i.stockStatus === 'overstock');
  if (overstockItems.length > 0) {
    mitigations.push({
      riskType: '库存风险',
      description: `促销清仓 ${overstockItems.length} 个积压产品，释放仓储空间`,
      priority: 'high',
      estimatedImpact: '减少仓储成本约 ¥15,000/月',
      status: 'in_progress',
    });
  }

  const lowMarginItems = costRecords.filter(c => c.grossMargin < 45);
  if (lowMarginItems.length > 0) {
    mitigations.push({
      riskType: '成本风险',
      description: `优化 ${lowMarginItems.length} 个低毛利产品的成本结构`,
      priority: 'high',
      estimatedImpact: '提升毛利率 3-5%',
      status: 'pending',
    });
  }

  const delayedShipmentItems = shipments.filter(s => s.status === 'delayed' || s.status === 'exception');
  if (delayedShipmentItems.length > 0) {
    mitigations.push({
      riskType: '物流风险',
      description: `跟进 ${delayedShipmentItems.length} 批延误货物，协调替代方案`,
      priority: 'high',
      estimatedImpact: '减少延误损失约 ¥30,000',
      status: 'in_progress',
    });
  }

  mitigations.push({
    riskType: '供应商风险',
    description: '建立备选供应商体系，降低单一供应商依赖',
    priority: 'medium',
    estimatedImpact: '降低供应中断风险 40%',
    status: 'planned',
  });

  return { mitigations };
}

/** Get risk alerts */
export async function getRiskAlerts() {
  const [inventory, costRecords, shipments, events] = await Promise.all([
    db.inventory.findMany({ take: MAX_TAKE }),
    db.costRecord.findMany({ take: MAX_TAKE }),
    db.shipmentItem.findMany({ take: MAX_TAKE }),
    db.supplyChainEvent.findMany({ where: { isRead: false }, orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);

  const alerts: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    description: string;
    timestamp: string;
    isRead: boolean;
  }> = [];

  inventory.filter(i => i.stockStatus === 'critical').forEach(inv => {
    alerts.push({
      id: `risk-inv-${inv.sku}`,
      type: 'inventory',
      severity: 'critical',
      title: `${inv.productName} 库存紧急`,
      description: `当前 ${inv.quantity} 件，安全库存 ${inv.safetyStock} 件`,
      timestamp: inv.lastSyncAt.toISOString(),
      isRead: false,
    });
  });

  costRecords.filter(c => c.grossMargin < 45).forEach(cost => {
    alerts.push({
      id: `risk-cost-${cost.sku}`,
      type: 'cost',
      severity: 'high',
      title: `${cost.productName} 毛利率预警`,
      description: `当前毛利率 ${cost.grossMargin.toFixed(1)}%，低于 45% 阈值`,
      timestamp: new Date().toISOString(),
      isRead: false,
    });
  });

  shipments.filter(s => s.status === 'delayed' || s.status === 'exception').forEach(ship => {
    alerts.push({
      id: `risk-log-${ship.trackingNumber}`,
      type: 'logistics',
      severity: 'high',
      title: `货运 ${ship.trackingNumber} 状态异常`,
      description: `${ship.origin}→${ship.destination}，状态：${ship.status}`,
      timestamp: new Date().toISOString(),
      isRead: false,
    });
  });

  events.forEach(evt => {
    alerts.push({
      id: evt.id,
      type: evt.type,
      severity: evt.severity,
      title: evt.title,
      description: evt.description,
      timestamp: evt.createdAt.toISOString(),
      isRead: evt.isRead,
    });
  });

  const severityOrder = { critical: 0, high: 1, warning: 2, info: 3 };
  return {
    alerts: alerts.sort((a, b) => (severityOrder[a.severity as keyof typeof severityOrder] ?? 3) - (severityOrder[b.severity as keyof typeof severityOrder] ?? 3)),
    unreadCount: alerts.filter(a => !a.isRead).length,
  };
}

/** Run risk simulation with deterministic calculations (no Math.random) */
export async function runRiskSimulation(scenario: string): Promise<SimulationResult> {
  const [inventory, costRecords, shipments] = await Promise.all([
    db.inventory.findMany({ take: MAX_TAKE }),
    db.costRecord.findMany({ take: MAX_TAKE }),
    db.shipmentItem.findMany({ take: MAX_TAKE }),
  ]);

  const avgMargin = costRecords.length > 0
    ? costRecords.reduce((s, c) => s + c.grossMargin, 0) / costRecords.length
    : 50;
  const delayedCount = shipments.filter(s => s.status === 'delayed').length;
  const criticalCount = inventory.filter(i => i.stockStatus === 'critical').length;

  // Use deterministic seeded values instead of Math.random()
  const simulationSeed = `${scenario}-${new Date().toISOString().slice(0, 10)}`;
  const baseVariation = seededRandom(simulationSeed) * 0.3 + 0.7; // 0.7-1.0 range

  switch (scenario) {
    case 'supply_disruption': {
      const inventoryCurrent = Math.round(criticalCount * 15);
      const costCurrent = Math.round((50 - avgMargin) * 1.2);
      const logisticsCurrent = Math.round(delayedCount * 12);
      return {
        scenario: 'supply_disruption',
        scenarioName: '供应中断',
        description: '主要供应商突发停产，供应链中断 30 天',
        impacts: [
          { dimension: '库存风险', currentScore: inventoryCurrent, simulatedScore: inventoryCurrent + 35, change: 35 },
          { dimension: '成本风险', currentScore: costCurrent, simulatedScore: costCurrent + 20, change: 20 },
          { dimension: '物流风险', currentScore: logisticsCurrent, simulatedScore: logisticsCurrent + 15, change: 15 },
          { dimension: '供应商风险', currentScore: 35, simulatedScore: 85, change: 50 },
          { dimension: '需求风险', currentScore: 25, simulatedScore: 55, change: 30 },
        ],
        affectedItems: Math.round(inventory.length * 0.6),
        recommendations: [
          '立即启动备选供应商切换方案',
          '对关键产品增加 2 倍安全库存',
          '调整生产计划，优先保障高毛利产品',
          '与客户沟通可能的交付延迟',
        ],
      };
    }

    case 'demand_spike': {
      const inventoryCurrent = Math.round(criticalCount * 15);
      const logisticsCurrent = Math.round(delayedCount * 12);
      return {
        scenario: 'demand_spike',
        scenarioName: '需求激增',
        description: '季节性需求激增 200%，库存快速消耗',
        impacts: [
          { dimension: '库存风险', currentScore: inventoryCurrent, simulatedScore: inventoryCurrent + 40, change: 40 },
          { dimension: '成本风险', currentScore: 20, simulatedScore: 45, change: 25 },
          { dimension: '物流风险', currentScore: logisticsCurrent, simulatedScore: logisticsCurrent + 25, change: 25 },
          { dimension: '供应商风险', currentScore: 35, simulatedScore: 55, change: 20 },
          { dimension: '需求风险', currentScore: 25, simulatedScore: 75, change: 50 },
        ],
        affectedItems: inventory.length,
        recommendations: [
          '启动紧急采购流程，追加订单',
          '优先保障 Top 5 畅销产品供应',
          '协调物流加急配送',
          '考虑临时提价平衡供需',
        ],
      };
    }

    case 'exchange_rate_shock': {
      const costCurrent = Math.round((50 - avgMargin) * 1.2);
      const usdRate = getExchangeRate('USD');
      const currentRateStr = usdRate ? ` (当前 1 USD = ${usdRate.rate.toFixed(2)} CNY)` : '';
      return {
        scenario: 'exchange_rate_shock',
        scenarioName: '汇率冲击',
        description: `人民币升值 8%，出口利润大幅压缩${currentRateStr}`,
        impacts: [
          { dimension: '库存风险', currentScore: 20, simulatedScore: 30, change: 10 },
          { dimension: '成本风险', currentScore: costCurrent, simulatedScore: costCurrent + 35, change: 35 },
          { dimension: '物流风险', currentScore: 15, simulatedScore: 15, change: 0 },
          { dimension: '供应商风险', currentScore: 35, simulatedScore: 45, change: 10 },
          { dimension: '需求风险', currentScore: 25, simulatedScore: 35, change: 10 },
        ],
        affectedItems: costRecords.length,
        recommendations: [
          '启动汇率对冲机制',
          '调整定价策略，转移部分成本',
          '优化成本结构，降低非必要支出',
          '增加国内市场销售占比',
        ],
      };
    }

    case 'tariff_increase': {
      const costCurrent = Math.round((50 - avgMargin) * 1.2);
      return {
        scenario: 'tariff_increase',
        scenarioName: '关税上调',
        description: '目标市场关税上调 15%，直接影响利润',
        impacts: [
          { dimension: '库存风险', currentScore: 20, simulatedScore: 35, change: 15 },
          { dimension: '成本风险', currentScore: costCurrent, simulatedScore: costCurrent + 30, change: 30 },
          { dimension: '物流风险', currentScore: 15, simulatedScore: 25, change: 10 },
          { dimension: '供应商风险', currentScore: 35, simulatedScore: 50, change: 15 },
          { dimension: '需求风险', currentScore: 25, simulatedScore: 40, change: 15 },
        ],
        affectedItems: costRecords.length,
        recommendations: [
          '评估转口贸易可行性',
          '优化产品原产地结构',
          '申请关税豁免或优惠待遇',
          '调整市场布局，拓展低关税市场',
        ],
      };
    }

    case 'weather_disruption': {
      // Use real Open-Meteo weather data for the simulation
      let weatherData: { riskyPorts: number; criticalPorts: number; avgWindSpeed: number; alerts: Array<{ port: string; type: string; severity: string }> } | null = null;
      try {
        const w = await getAllPortsWeather();
        weatherData = {
          riskyPorts: w.summary.riskyPorts,
          criticalPorts: w.summary.criticalPorts,
          avgWindSpeed: w.summary.avgWindSpeed,
          alerts: w.alerts.map(a => ({ port: a.port, type: a.type, severity: a.severity })),
        };
      } catch { /* fall back to default values if API fails */ }

      const riskyPortCount = weatherData?.riskyPorts ?? 3;
      const criticalPortCount = weatherData?.criticalPorts ?? 1;
      const logisticsCurrent = Math.round(delayedCount * 12);
      const logisticsImpact = Math.round(10 + riskyPortCount * 5 + criticalPortCount * 10);
      const inventoryCurrent = Math.round(criticalCount * 15);

      const alertDesc = weatherData?.alerts?.length
        ? weatherData.alerts.map(a => `${a.port}: ${a.type}(${a.severity})`).join('; ')
        : `${riskyPortCount}个港口有风险，${criticalPortCount}个港口天气恶劣`;

      return {
        scenario: 'weather_disruption',
        scenarioName: '天气延误',
        description: `恶劣天气影响主要航线: ${alertDesc}`,
        impacts: [
          { dimension: '库存风险', currentScore: inventoryCurrent, simulatedScore: inventoryCurrent + 10, change: 10 },
          { dimension: '成本风险', currentScore: 30, simulatedScore: 30 + riskyPortCount * 4, change: riskyPortCount * 4 },
          { dimension: '物流风险', currentScore: logisticsCurrent, simulatedScore: logisticsCurrent + logisticsImpact, change: logisticsImpact },
          { dimension: '供应商风险', currentScore: 35, simulatedScore: 45, change: 10 },
          { dimension: '需求风险', currentScore: 25, simulatedScore: 30, change: 5 },
        ],
        affectedItems: Math.round(inventory.length * (0.2 + riskyPortCount * 0.05)),
        recommendations: [
          '启动天气延误应急预案',
          `对${criticalPortCount > 0 ? '高风险港口' : '主要航线'}货物改道或暂缓发货`,
          '提前通知客户可能到货延误',
          '增加安全库存以应对运输周期延长',
          '评估空运替代海运的可行性',
        ],
        ...(weatherData ? { weatherContext: weatherData } : {}),
      };
    }

    default:
      throw new Error('未知场景，支持: supply_disruption, demand_spike, exchange_rate_shock, tariff_increase, weather_disruption');
  }
}
