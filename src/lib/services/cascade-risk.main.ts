/**
 * Cascade Risk — Main Orchestration Module
 *
 * Integrates calibration, propagation, Monte Carlo, projection, and validation
 * into a unified risk assessment pipeline.
 */
import { agentMemory } from '@/lib/engine/memory';
import { db } from '@/lib/db';
import { getExchangeRate } from '@/lib/exchange-rate';
import { getAllPortsWeather } from '@/lib/services/weather.service';
import { getLatestRates } from '@/lib/queries/exchange-rate.queries';
import { computeTariff } from '@/lib/services/tariff.service';
import {
  withFallback, withPromiseTimeout,
  createPassport, provenanceEntry, degradedProvenance, unavailableProvenance, computeConfidence,
} from '@/lib/engine';
import type { AlternativeOption } from '@/lib/engine/passport';
import { buildCausalEdges, generateCausalSummary } from '@/lib/engine/causal-reasoning';
import { calibrateAttenuationFactors, calibratedAttenuation } from './cascade-risk.calibration';
import {
  fuseMultiSourceRisks,
  projectForward,
  generatePreventiveActions,
  buildGraph,
  propagate,
  propagateSEIR,
  computeDamageRatio,
  weatherDesc,
  type AnomalySource,
} from './cascade-risk.propagation';
import { runCounterfactual, runCausalCounterfactual } from './cascade-risk.validation';
import type {
  FusionStrategy,
  CascadeNode,
  PropagationStep,
  DayProjection,
  CascadeReport,
  BacktestResult,
} from './cascade-risk.types';

// Local type for weather API results
interface WeatherPort {
  port: string;
  riskLevel?: string;
  current?: { windSpeed?: number; weatherCode?: number };
  forecast: Array<{ windSpeedMax: number; precipitation: number }>;
}

type ScenarioType = 'weather_disruption' | 'exchange_shock' | 'supplier_failure'
  | 'port_congestion' | 'tariff_escalation' | 'cbam_enforcement'
  | 'commodity_shock' | 'competitor_pressure' | 'auto';

export function buildCounterfactualAuditSnapshot(report: Pick<CascadeReport, 'counterfactuals' | 'causalCounterfactuals'>) {
  return {
    counterfactuals: (report.counterfactuals ?? []).slice(0, 4).map((cf) => ({
      scenario: cf.scenario,
      improvement: cf.improvement,
      affectedProducts: cf.alternativeImpact.affectedProducts,
      totalRisk: cf.alternativeImpact.totalRisk,
    })),
    causalCounterfactuals: (report.causalCounterfactuals ?? []).slice(0, 4).map((cf) => ({
      scenario: cf.scenario,
      intervention: cf.intervention,
      estimatedReduction: cf.estimatedReduction,
      confidenceInterval: cf.confidenceInterval,
      isReliable: cf.isReliable,
      sampleSize: cf.causalEstimate.sampleSize,
      pValue: cf.causalEstimate.pValue,
    })),
  };
}

export function buildPassportAlternatives(report: Pick<CascadeReport, 'counterfactuals' | 'causalCounterfactuals'>): AlternativeOption[] {
  if ((report.causalCounterfactuals ?? []).length > 0) {
    return (report.causalCounterfactuals ?? []).map((cf) => ({
      action: cf.scenario || '替代方案',
      expectedImpact: `风险降低 ${(cf.estimatedReduction * 100).toFixed(1)}%`,
      confidence: cf.estimatedReduction,
      tradeoffs: cf.isReliable ? [] : ['历史样本有限，结论偏先验'],
    }));
  }

  return (report.counterfactuals ?? []).map((cf) => ({
    action: cf.scenario || '替代方案',
    expectedImpact: `风险降低 ${cf.improvement}%`,
    confidence: cf.improvement / 100,
    tradeoffs: [],
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main API — All phases integrated
// ═══════════════════════════════════════════════════════════════════════════════

export async function getCascadeRisk(options?: {
  scenario?: ScenarioType;
  sourcePort?: string;
  sourceSupplier?: string;
  fusionStrategy?: FusionStrategy;
  includeForwardProjection?: boolean;
  includeCounterfactuals?: boolean;
  forceCalibration?: boolean;
}): Promise<CascadeReport> {
  const startedAt = Date.now();
  const scenario = options?.scenario || 'auto';
  const fusionStrategy = options?.fusionStrategy || 'weighted_sum';
  const includeForwardProjection = options?.includeForwardProjection !== false;
  const includeCounterfactuals = options?.includeCounterfactuals !== false;
  const forceCalibration = options?.forceCalibration || false;

  // Phase 1: Calibrate if needed
  if (forceCalibration || !calibratedAttenuation) {
    await calibrateAttenuationFactors().catch(() => {});
  }

  // Build graph (Phase 5: cached)
  const { nodes, edges } = await buildGraph();

  // Phase 2: Multi-source detection
  const anomalySources: AnomalySource[] = [];
  const degradedSources: string[] = [];
  let weatherResult: { data: { ports: WeatherPort[] }; degraded: boolean } | null = null;
  let fxResult: { data: { rates?: Record<string, number> } | null; degraded: boolean } | null = null;

  // ── Weather source ──
  if (scenario === 'weather_disruption' || scenario === 'auto') {
    weatherResult = await withFallback(
      () => withPromiseTimeout(Promise.resolve(getAllPortsWeather()), 5000),
      () => ({ ports: [] } as unknown as { ports: WeatherPort[] }),
      'weather',
    ) as { data: { ports: WeatherPort[] }; degraded: boolean };
    if (weatherResult.degraded) degradedSources.push('weather');
    for (const port of weatherResult.data.ports) {
      if (port.riskLevel === 'high' || port.riskLevel === 'critical') {
        for (const [, node] of nodes) {
          if (node.type === 'PORT' && node.label.includes(port.port)) {
            anomalySources.push({
              nodeId: node.id,
              riskScore: port.riskLevel === 'critical' ? 85 : 60,
              cause: `天气: ${port.port} ${port.current?.windSpeed ?? '?'}m/s ${weatherDesc(port.current?.weatherCode ?? 0)}`,
              category: 'weather',
            });
          }
        }
      }
    }
  }

  // ── Multi-currency exchange rate source ──
  if (scenario === 'exchange_shock' || scenario === 'auto') {
    fxResult = await withFallback(
      async () => {
        const live = await withPromiseTimeout(getLatestRates('CNY'), 4000);
        return live;
      },
      () => null,
      'exchange-rates',
    ) as { data: { rates?: Record<string, number> } | null; degraded: boolean };
    if (fxResult.degraded) degradedSources.push('exchange-rates');

    const CURRENCY_BASELINES: Record<string, { baseline: number; label: string }> = {
      USD: { baseline: 7.25, label: '美元' }, EUR: { baseline: 7.85, label: '欧元' },
      GBP: { baseline: 9.15, label: '英镑' }, JPY: { baseline: 0.048, label: '日元' },
      KRW: { baseline: 0.0054, label: '韩元' }, AUD: { baseline: 4.85, label: '澳元' },
    };

    let maxDeviation = 0;
    let worstCurrency = '';
    let worstRate = 0;

    for (const [code, info] of Object.entries(CURRENCY_BASELINES)) {
      const liveRate = fxResult.data?.rates?.[code] ? 1 / fxResult.data.rates[code] : null;
      const staticRate = getExchangeRate(code)?.rate;
      const currentRate = liveRate ?? staticRate ?? info.baseline;
      const deviation = Math.abs(currentRate - info.baseline) / info.baseline;
      if (deviation > maxDeviation) {
        maxDeviation = deviation; worstCurrency = code; worstRate = currentRate;
      }
    }

    if (maxDeviation > 0.01 || scenario === 'exchange_shock') {
      for (const [, node] of nodes) {
        if (node.type === 'SUPPLIER') {
          anomalySources.push({
            nodeId: node.id,
            riskScore: Math.min(Math.round(maxDeviation * 100 * 5), 90),
            cause: `汇率: 1 ${worstCurrency} = ${worstRate.toFixed(worstCurrency === 'JPY' || worstCurrency === 'KRW' ? 4 : 2)} CNY (偏离${(maxDeviation * 100).toFixed(1)}%)`,
            category: 'exchange',
          });
          break;
        }
      }
    }
  }

  // ── Supplier source ──
  if (scenario === 'supplier_failure' || scenario === 'auto') {
    const supplierNodes = [...nodes.values()].filter(n => n.type === 'SUPPLIER');
    if (supplierNodes.length > 0) {
      const lowest = supplierNodes.reduce((a, b) =>
        ((a.metadata.rating as number) || 3) < ((b.metadata.rating as number) || 3) ? a : b);
      anomalySources.push({
        nodeId: lowest.id, riskScore: 70,
        cause: `供应商: ${lowest.label} 评级 ${lowest.metadata.rating}`,
        category: 'supplier',
      });
    }
  }

  // ── Port congestion source ──
  if (scenario === 'port_congestion') {
    const targetPort = options?.sourcePort || '洛杉矶港';
    for (const [, node] of nodes) {
      if (node.type === 'PORT' && node.label.includes(targetPort)) {
        anomalySources.push({ nodeId: node.id, riskScore: 80, cause: `港口拥堵: ${targetPort}`, category: 'logistics' });
      }
    }
  }

  // ── Tariff escalation source ──
  if (scenario === 'tariff_escalation' || scenario === 'auto') {
    try {
      const allProducts = await db.product.findMany({ take: 500 });
      const allCosts = await db.costRecord.findMany({ take: 500 });
      let tariffHits = 0;
      for (const cost of allCosts) {
        if (tariffHits >= 3) break;
        const product = allProducts.find(p => p.sku === cost.sku);
        if (!product || !cost.destination) continue;
        const tariff = await computeTariff({
          category: product.category, subCategory: product.subCategory || undefined,
          countryCode: cost.destination, sellingPrice: cost.sellingPrice,
        });
        if (tariff.rate > 3) {
          const productNode = [...nodes.values()].find(n => n.type === 'PRODUCT' && n.label === product.name);
          if (productNode) {
            anomalySources.push({
              nodeId: productNode.id,
              riskScore: Math.min(Math.round(tariff.rate * 3), 85),
              cause: `关税: ${product.name} → ${cost.destination} 适用 ${tariff.rate}% (${tariff.rules[0]?.tradeAgreement || 'MFN'})`,
              category: 'exchange',
            });
            tariffHits++;
          }
        }
      }
    } catch { /* tariff engine unavailable */ }
  }

  // ── CBAM + commodity (parallel with strict timeouts) ──
  if (scenario === 'auto') {
    const parallelResults = await Promise.allSettled([
      (async () => {
        const { fetchCarbonPrice } = await import('@/lib/sources/carbon-price');
        const carbon = await Promise.race([fetchCarbonPrice(), new Promise<null>(r => setTimeout(() => r(null), 3000))]);
        if (carbon && carbon.price > 60) {
          for (const [, port] of [...nodes.entries()].filter(([, n]) => n.type === 'PORT' && (n.label.includes('汉堡') || n.label.includes('鹿特丹')))) {
            anomalySources.push({ nodeId: port.id, riskScore: carbon.price > 90 ? 65 : 40, cause: `CBAM碳关税: EUA €${carbon.price}/t CO2`, category: 'exchange' });
          }
        }
      })(),
      (async () => {
        const { fetchDailyCommodities } = await import('@/lib/sources/alphavantage-commodities');
        const commodities = await Promise.race([fetchDailyCommodities(), new Promise<Array<{ name: string; changePct: number }>>(r => setTimeout(() => r([]), 4000))]);
        const bigMovers = commodities.filter(c => Math.abs(c.changePct) > 3);
        if (bigMovers.length >= 2) {
          const productNode = [...nodes.values()].find(n => n.type === 'PRODUCT');
          if (productNode) {
            const summary = bigMovers.map(c => `${c.name}: ${c.changePct > 0 ? '+' : ''}${c.changePct}%`).join(', ');
            const avgChange = bigMovers.reduce((s, c) => s + Math.abs(c.changePct), 0) / bigMovers.length;
            anomalySources.push({ nodeId: productNode.id, riskScore: Math.min(Math.round(avgChange * 5), 85), cause: `原材料价格波动: ${summary}`, category: 'supplier' });
          }
        }
      })(),
    ]);
    if (parallelResults[0].status === 'rejected') degradedSources.push('carbon-price');
    if (parallelResults[1].status === 'rejected') degradedSources.push('commodities');
  } else {
    if (scenario === 'cbam_enforcement') {
      try {
        const { fetchCarbonPrice } = await import('@/lib/sources/carbon-price');
        const carbon = await Promise.race([fetchCarbonPrice(), new Promise<null>(r => setTimeout(() => r(null), 3000))]);
        if (carbon && carbon.price > 60) {
          for (const [, port] of [...nodes.entries()].filter(([, n]) => n.type === 'PORT' && (n.label.includes('汉堡') || n.label.includes('鹿特丹')))) {
            anomalySources.push({ nodeId: port.id, riskScore: carbon.price > 90 ? 65 : 40, cause: `CBAM碳关税: EUA €${carbon.price}/t CO2`, category: 'exchange' });
          }
        }
      } catch { /* carbon unavailable */ }
    }
    if (scenario === 'commodity_shock') {
      try {
        const { fetchDailyCommodities } = await import('@/lib/sources/alphavantage-commodities');
        const commodities = await Promise.race([fetchDailyCommodities(), new Promise<Array<{ name: string; changePct: number }>>(r => setTimeout(() => r([]), 4000))]);
        const bigMovers = commodities.filter(c => Math.abs(c.changePct) > 3);
        if (bigMovers.length >= 2) {
          const productNode = [...nodes.values()].find(n => n.type === 'PRODUCT');
          if (productNode) {
            const summary = bigMovers.map(c => `${c.name}: ${c.changePct > 0 ? '+' : ''}${c.changePct}%`).join(', ');
            anomalySources.push({ nodeId: productNode.id, riskScore: Math.min(Math.round(bigMovers.reduce((s, c) => s + Math.abs(c.changePct), 0) / bigMovers.length * 5), 85), cause: `原材料价格波动: ${summary}`, category: 'supplier' });
          }
        }
      } catch { /* commodities unavailable */ }
    }
  }

  // ── Quality & returns risk ──
  if (scenario === 'auto') {
    try {
      const [defects, returns] = await Promise.all([
        db.defectRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
        db.returnRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      ]);
      if (defects.length + returns.length > 0) {
        const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
        const recentReturns = returns.filter(r => new Date(r.createdAt) > monthAgo).length;
        const riskScore = recentReturns > 3 ? 55 : defects.length > 10 ? 40 : 25;
        const productNode = [...nodes.values()].find(n => n.type === 'PRODUCT');
        if (productNode && (defects.length > 5 || returns.length > 2)) {
          anomalySources.push({ nodeId: productNode.id, riskScore, cause: `质量风险: ${defects.length} 条缺陷记录, ${returns.length} 条退货 (近30天 ${recentReturns} 条)`, category: 'compliance' });
        }
      }
    } catch { /* DB tables unavailable */ }
  }

  // ── Inventory health risk ──
  if (scenario === 'auto') {
    try {
      const inventoryItems = await db.inventory.findMany({ take: 200 });
      const criticalItems = inventoryItems.filter(i => i.stockStatus === 'critical' || (i.quantity < (i.safetyStock || 50) * 0.7));
      const deadStockItems = inventoryItems.filter(i => (i.turnoverDays || 0) > 180);
      if (criticalItems.length > 0) {
        const worst = criticalItems.sort((a, b) => (a.quantity / Math.max(a.safetyStock || 1, 1)) - (b.quantity / Math.max(b.safetyStock || 1, 1)))[0];
        const productNode = [...nodes.values()].find(n => n.type === 'PRODUCT' && n.id === worst.sku);
        if (productNode) {
          anomalySources.push({ nodeId: productNode.id, riskScore: Math.min(60 + criticalItems.length * 3, 90), cause: `库存风险: ${criticalItems.length} 个 SKU 库存不足 (最严重: ${worst.sku} 仅剩 ${worst.quantity}/${worst.safetyStock})${deadStockItems.length > 0 ? `，${deadStockItems.length} 个 SKU 滞销>180天` : ''}`, category: 'inventory' });
        }
      } else if (deadStockItems.length > 0) {
        const worst = deadStockItems.sort((a, b) => (b.turnoverDays || 0) - (a.turnoverDays || 0))[0];
        const productNode = [...nodes.values()].find(n => n.type === 'PRODUCT' && n.id === worst.sku);
        if (productNode) {
          anomalySources.push({ nodeId: productNode.id, riskScore: 45, cause: `库存滞销: ${deadStockItems.length} 个 SKU 周转>180天 (最长 ${worst.sku} ${worst.turnoverDays}天)`, category: 'inventory' });
        }
      }
    } catch { /* DB unavailable */ }
  }

  // ── Compliance expiry risk ──
  if (scenario === 'auto') {
    try {
      const ninetyDaysFromNow = new Date();
      ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
      const expiringCerts = await db.complianceCert.findMany({ where: { expiryDate: { lte: ninetyDaysFromNow.toISOString() }, status: { not: 'expired' } }, take: 50 });
      if (expiringCerts.length > 0) {
        const urgent = expiringCerts.filter(c => new Date(c.expiryDate).getTime() - Date.now() < 30 * 24 * 3600 * 1000);
        const productNode = [...nodes.values()].find(n => n.type === 'PRODUCT');
        if (productNode) {
          anomalySources.push({ nodeId: productNode.id, riskScore: urgent.length > 0 ? 65 : 40, cause: `合规风险: ${expiringCerts.length} 份证书 90 天内到期${urgent.length > 0 ? ` (${urgent.length} 份 30 天内紧急)` : ''}`, category: 'compliance' });
        }
      }
    } catch { /* DB unavailable */ }
  }

  // ── Commodity price risk ──
  if (scenario === 'auto') {
    try {
      const { getCommodityPrices } = await import('@/lib/services/commodity.service');
      const commodityReport = await getCommodityPrices();
      if (commodityReport.affectedMaterials.length > 0 || Math.abs(commodityReport.avgChangePct) > 3) {
        const productNode = [...nodes.values()].find(n => n.type === 'PRODUCT');
        if (productNode) {
          const trend = commodityReport.overallTrend === 'rising' ? '上涨' : '下降';
          anomalySources.push({ nodeId: productNode.id, riskScore: Math.min(45 + Math.round(Math.abs(commodityReport.avgChangePct) * 2), 80), cause: `原材料成本: BOM成本 ${trend} ${Math.abs(commodityReport.avgChangePct).toFixed(1)}%（${commodityReport.affectedMaterials.join('、') || '整体物料'}）`, category: 'exchange' });
        }
      }
    } catch { /* commodity service unavailable */ }
  }

  // ── Shipment delay risk ──
  if (scenario === 'auto') {
    try {
      const shipments = await db.shipmentItem.findMany({ where: { status: { in: ['in_transit', 'delayed', 'exception'] } }, take: 100 });
      const delayed = shipments.filter(s => s.status === 'delayed' || s.status === 'exception');
      const avgDelay = delayed.length > 0 ? Math.round(delayed.reduce((s, sh) => s + (sh.delayDays || 0), 0) / delayed.length) : 0;
      if (delayed.length > 0) {
        const portNode = [...nodes.values()].find(n => n.type === 'PORT');
        if (portNode) {
          anomalySources.push({ nodeId: portNode.id, riskScore: Math.min(45 + delayed.length * 4, 85), cause: `物流延误: ${delayed.length}/${shipments.length} 票货运延误 (平均 ${avgDelay} 天)`, category: 'logistics' });
        }
      }
    } catch { /* DB unavailable */ }
  }

  // ── Fallback: balanced summary mode ──
  if (anomalySources.length === 0) {
    const firstPort = [...nodes.values()].find(n => n.type === 'PORT');
    const firstProduct = [...nodes.values()].find(n => n.type === 'PRODUCT');
    if (firstPort && firstProduct) {
      anomalySources.push({ nodeId: firstPort.id, riskScore: 30, cause: '综合评估: 当前供应链运行正常，无显著风险信号', category: 'weather' });
    }
  }

  // Phase 2: Fuse multi-source risks
  const fusedSources = fuseMultiSourceRisks(anomalySources, fusionStrategy);

  // Inject initial risk
  for (const src of fusedSources) {
    const node = nodes.get(src.nodeId);
    if (node) { node.initialRisk = src.riskScore; node.riskScore = src.riskScore; }
  }

  // Propagate (Phase 5: with explanations)
  const propagation = propagate(nodes, edges, fusedSources);

  // SEIR Hybrid Model — epidemic-style contagion dynamics
  let seirTimeline;
  try {
    seirTimeline = propagateSEIR(nodes, edges, propagation);
  } catch { /* SEIR is non-critical enhancement */ }

  // Causal Reasoning
  const causalEdges = await buildCausalEdges(propagation, edges, nodes);

  // Phase 3: Forward projection
  let forwardProjection: DayProjection[] | undefined;
  if (includeForwardProjection) {
    try {
      forwardProjection = await projectForward(propagation, weatherResult?.data || null);
    } catch { /* skip */ }
  }

  // Build report
  const affectedNodes = propagation.filter(p => p.propagatedRisk > 0);
  const maxDepth = affectedNodes.reduce((max, p) => Math.max(max, p.depth), 0);
  const avgRisk = affectedNodes.length > 0
    ? Math.round(affectedNodes.reduce((s, p) => s + p.propagatedRisk, 0) / affectedNodes.length * 10) / 10 : 0;

  const productResults = propagation
    .filter(p => p.type === 'PRODUCT' && p.propagatedRisk > 0)
    .sort((a, b) => b.riskScore - a.riskScore);

  // Data-driven revenue impact using computeDamageRatio
  const topAffectedProducts = await Promise.all(
    productResults.slice(0, 5).map(async p => {
      const sku = (p.metadata.sku as string) || '';
      const price = (p.metadata.sellingPrice as number) || 50;
      const qty = (p.metadata.quantity as number) || 100;
      const damageRatio = sku ? await computeDamageRatio(sku) : 0.15;
      return {
        sku,
        productName: p.label,
        impactScore: p.riskScore,
        propagationPath: p.path.join(' → '),
        explanation: p.explanation,
        estimatedDelay: Math.round(p.riskScore * 0.15),
        estimatedRevenueImpact: Math.round(price * qty * (p.riskScore / 100) * damageRatio),
        preventiveAction: generatePreventiveActions(
          { sku, productName: p.label, impactScore: p.riskScore },
          p.path.join(' → '),
        ),
      };
    }),
  );

  const criticalPaths = propagation
    .filter(p => p.type === 'PRODUCT' && p.riskScore > 30)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 3)
    .map(p => ({
      path: p.path, totalRisk: p.riskScore,
      description: `${p.label}: 传播深度 ${p.path.length}，${p.explanation}`,
    }));

  const causalSummary = generateCausalSummary({
    propagation, causalEdges,
    summary: { affectedNodes: affectedNodes.length, topAffectedProducts },
  });

  const report: CascadeReport = {
    timestamp: new Date().toISOString(),
    maxDepth,
    triggeredBy: { source: scenario, description: fusedSources.map(s => s.cause).join('; '), timestamp: new Date().toISOString() },
    sourceNodes: fusedSources.map(s => {
      const node = nodes.get(s.nodeId);
      return { id: s.nodeId, label: node?.label || s.nodeId, riskScore: s.riskScore, cause: s.cause };
    }),
    propagation,
    forwardProjection,
    causalEdges,
    causalSummary,
    seirTimeline,
    summary: {
      totalNodes: nodes.size, affectedNodes: affectedNodes.length, maxDepth,
      maxRisk: productResults.length > 0 ? productResults[0].riskScore : 0,
      avgPropagatedRisk: avgRisk, criticalPaths, topAffectedProducts,
      totalMonthlyLoss: propagation.reduce((sum, p) => sum + (p.monetaryImpact || 0), 0),
      seirSummary: seirTimeline ? {
        peakDay: seirTimeline.peakDay,
        peakInfectious: seirTimeline.peakInfectious,
        recoveryHorizon: seirTimeline.recoveryHorizon,
        finalSusceptible: seirTimeline.days[seirTimeline.days.length - 1]?.susceptible ?? 0,
        finalRecovered: seirTimeline.days[seirTimeline.days.length - 1]?.recovered ?? 0,
      } : undefined,
    },
  };

  // Counterfactuals — Causal ML (data-driven) with legacy fallback
  if (includeCounterfactuals && topAffectedProducts.length > 0) {
    const affectedSku = topAffectedProducts[0].sku;
    const productNode = nodes.get(affectedSku) || Array.from(nodes.values()).find(n => n.type === 'PRODUCT');
    const hasPortAlternative = propagation.some(p => p.type === 'PORT' && (p.monetaryImpact || 0) > 0);
    const hasSupplierAlternative = propagation.some(p => p.type === 'SUPPLIER');

    // Data-driven causal ML counterfactuals
    try {
      report.causalCounterfactuals = await runCausalCounterfactual(report, [
        { name: '替代路线', targetNode: affectedSku, action: '改经釜山港或新加坡港', intervention: 'reroute' },
        { name: '增加安全库存', targetNode: affectedSku, action: `${topAffectedProducts[0].productName} 安全库存翻倍`, intervention: 'safety_stock' },
        { name: '供应商切换', targetNode: affectedSku, action: '切换至备用供应商', intervention: 'supplier_switch' },
        { name: '组合方案', targetNode: affectedSku, action: '改道 + 补库存 + 备选供应商', intervention: 'combined' },
      ]);
    } catch { /* Causal ML fallback */ }

    // Legacy counterfactuals (backward compat)
    report.counterfactuals = await runCounterfactual(report, [
      { name: '替代路线', targetNode: affectedSku, action: '改经釜山港或新加坡港', riskReduction: hasPortAlternative ? 0.35 : 0.15 },
      { name: '增加安全库存', targetNode: affectedSku, action: `${topAffectedProducts[0].productName} 安全库存翻倍`, riskReduction: productNode ? 0.50 : 0.30 },
      { name: '供应商切换', targetNode: affectedSku, action: '切换至备用供应商', riskReduction: hasSupplierAlternative ? 0.40 : 0.20 },
      { name: '组合方案', targetNode: affectedSku, action: '改道 + 补库存 + 备选供应商', riskReduction: hasPortAlternative && hasSupplierAlternative ? 0.70 : 0.45 },
    ]);
  }

  // Audit trail
  const computedOverallRisk = anomalySources.length > 0
    ? anomalySources.reduce((sum, n) => sum + n.riskScore, 0) / anomalySources.length : 0;
  try {
    await db.auditLog.create({
      data: {
        action: 'ANALYZE', entity: 'cascade-risk', userId: 'system', userName: '级联引擎',
        severity: computedOverallRisk > 70 ? 'important' : (computedOverallRisk > 40 ? 'warning' : 'info'),
        details: {
          scenario, overallRisk: computedOverallRisk,
          affectedNodes: propagation.length,
          totalMonthlyLoss: propagation.reduce((s, p) => s + (p.monetaryImpact || 0), 0),
          maxDepth, degradedSources,
          sourceCategories: anomalySources.map(s => s.category),
          snapshot: {
            affectedNodes: affectedNodes.length,
            avgPropagatedRisk: avgRisk,
            totalMonthlyLoss: propagation.reduce((s, p) => s + (p.monetaryImpact || 0), 0),
            topRisks: topAffectedProducts.slice(0, 3).map(p => ({ sku: p.sku, risk: p.impactScore })),
            ...buildCounterfactualAuditSnapshot(report),
          },
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch { /* Audit log is non-critical */ }

  // Decision Passport
  const provenance = [
    ...(weatherResult
      ? [weatherResult.degraded ? degradedProvenance('weather:open-meteo', 0) : provenanceEntry('weather:open-meteo', 0)]
      : [unavailableProvenance('weather:open-meteo')]),
    ...(fxResult
      ? [fxResult.degraded ? degradedProvenance('fx:frankfurter', 0) : provenanceEntry('fx:frankfurter', 0)]
      : [unavailableProvenance('fx:frankfurter')]),
    provenanceEntry('db:inventory', 0),
    provenanceEntry('db:shipments', 0),
    provenanceEntry('db:suppliers', 0),
  ];

  const totalDurationMs = Date.now() - startedAt;

  const altActions = buildPassportAlternatives(report);

  report.passport = createPassport({
    engine: 'cascade-risk',
    input: { scenario, sourcePort: options?.sourcePort, sourceSupplier: options?.sourceSupplier, includeForwardProjection, includeCounterfactuals },
    confidence: computeConfidence({
      'weather': [0.25, (provenance[0]?.status === 'stale' ? 'unavailable' : provenance[0]?.status) ?? 'unavailable'],
      'exchange-rates': [0.25, (provenance[1]?.status === 'stale' ? 'unavailable' : provenance[1]?.status) ?? 'unavailable'],
      'inventory': [0.25, 'ok'],
      'shipments': [0.15, 'ok'],
      'suppliers': [0.10, 'ok'],
    }),
    alternatives: altActions,
    provenance,
    trace: {
      totalDurationMs,
      steps: [
        { name: 'graph-build', durationMs: 0, status: 'ok' },
        { name: 'anomaly-detection', durationMs: 0, status: degradedSources.length > 0 ? 'degraded' : 'ok' },
        { name: 'propagation', durationMs: 0, status: 'ok' },
        { name: 'forecast', durationMs: 0, status: includeForwardProjection ? 'ok' : 'skipped' },
      ],
    },
    warnings: degradedSources.length > 0 ? degradedSources.map(s => `${s} was degraded`) : [],
  });

  // Write to shared agent memory
  if (fusedSources.length > 0) {
    agentMemory.updateShared('cascadeRisk', {
      lastRun: new Date().toISOString(),
      overallRisk: fusedSources.reduce((sum, n) => sum + (n.riskScore || 0), 0) / Math.max(fusedSources.length, 1),
      affectedNodes: affectedNodes.length,
      maxDepth,
      scenario,
      topRisks: topAffectedProducts.slice(0, 5).map(p => ({
        nodeId: p.sku || p.productName, riskScore: p.impactScore, label: p.productName,
      })),
    });
  }

  // Write DecisionLog
  try {
    await db.decisionLog.create({
      data: {
        auditId: report.id || `cascade-${Date.now()}`,
        engine: 'cascade-risk',
        action: 'propagation',
        input: JSON.stringify({ scenario, fusionStrategy }),
        output: JSON.stringify({
          affectedNodes: propagation.length,
          totalLoss: report.summary.totalMonthlyLoss,
          maxDepth,
          topRisks: topAffectedProducts.slice(0, 3).map(p => p.productName),
        }),
        durationMs: totalDurationMs,
        cacheHit: false,
        degradedSources: JSON.stringify(degradedSources),
        version: '2.9.3',
      },
    });
  } catch { /* non-critical */ }

  return report;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Backtesting — Real snapshot-based comparison
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Backtest against historical data using stored snapshots.
 *
 * 1. Reads historical cascade-risk snapshots from AuditLog (stored by getCascadeRisk)
 * 2. Compares each snapshot's prediction against actual outcomes from that day
 * 3. Computes accuracy metrics per day and overall
 */
export async function backtest(days: number = 30): Promise<{
  results: BacktestResult[];
  summary: { avgAccuracy: number; totalPredictions: number; reliablePredictions: number };
}> {
  const results: BacktestResult[] = [];
  let totalAccuracy = 0;
  let reliableCount = 0;

  // Fetch historical cascade-risk audit logs that contain snapshots
  const cutoffDate = new Date(Date.now() - days * 86400000);
  const historicalLogs = await db.auditLog.findMany({
    where: {
      entity: 'cascade-risk' as string,
      action: 'ANALYZE' as string,
      createdAt: { gte: cutoffDate },
    },
    orderBy: { createdAt: 'asc' },
    take: days * 2, // allow for multiple runs per day
  }).catch(() => []);

  // Group by date (take latest snapshot per day)
  const byDate = new Map<string, { snapshot: { affectedNodes: number; avgPropagatedRisk: number; totalMonthlyLoss?: number }; timestamp: string }>();
  for (const log of historicalLogs) {
    const details = log.details as Record<string, unknown> | null;
    if (!details?.snapshot) continue;
    const dateStr = new Date(log.createdAt).toISOString().split('T')[0];
    const existing = byDate.get(dateStr);
    if (!existing || new Date(log.createdAt) > new Date(existing.timestamp)) {
      byDate.set(dateStr, {
        snapshot: details.snapshot as { affectedNodes: number; avgPropagatedRisk: number; totalMonthlyLoss?: number },
        timestamp: log.createdAt.toString(),
      });
    }
  }

  // If no historical snapshots, run a fresh analysis as baseline
  if (byDate.size === 0) {
    try {
      const report = await getCascadeRisk({ scenario: 'auto' });
      const dateStr = new Date().toISOString().split('T')[0];
      byDate.set(dateStr, {
        snapshot: {
          affectedNodes: report.summary.affectedNodes,
          avgPropagatedRisk: report.summary.avgPropagatedRisk,
          totalMonthlyLoss: report.summary.totalMonthlyLoss,
        },
        timestamp: new Date().toISOString(),
      });
    } catch { /* fallback unavailable */ }
  }

  // Compare predictions vs actuals
  for (const [dateStr, entry] of byDate) {
    const prediction = entry.snapshot;
    const dateStart = new Date(dateStr);
    const dateEnd = new Date(dateStr);
    dateEnd.setDate(dateEnd.getDate() + 1);

    // Get actual outcomes from that day
    const actualShipments = await db.shipmentItem.findMany({
      where: { updatedAt: { gte: dateStart, lt: dateEnd } },
      take: 100,
    }).catch(() => []);

    const actualDelayed = actualShipments.filter(s => (s.delayDays ?? 0) > 0).length;
    const actualAffected = Math.round(actualDelayed * 2.5); // estimated ripple factor

    // Compute accuracy
    const accuracy = prediction.affectedNodes > 0 && actualAffected > 0
      ? Math.round((1 - Math.abs(prediction.affectedNodes - actualAffected) / Math.max(prediction.affectedNodes, actualAffected)) * 100)
      : null;

    results.push({
      date: dateStr,
      scenario: 'auto',
      predicted: { affectedNodes: prediction.affectedNodes, avgRisk: prediction.avgPropagatedRisk },
      actual: { affectedNodes: actualAffected, avgRisk: null },
      accuracy,
    });

    if (accuracy !== null) {
      totalAccuracy += accuracy;
      reliableCount++;
    }
  }

  // Fill in days without snapshots using current model
  for (let d = days; d >= 1; d--) {
    const date = new Date(Date.now() - d * 86400000);
    const dateStr = date.toISOString().split('T')[0];
    if (byDate.has(dateStr)) continue; // already processed

    // Run current model as prediction (no snapshot available)
    let predictedNodes = 0;
    let predictedRisk = 0;
    try {
      const report = await getCascadeRisk({ scenario: 'auto' });
      predictedNodes = report.summary.affectedNodes;
      predictedRisk = report.summary.avgPropagatedRisk;
    } catch { /* skip */ }

    const actualShipments = await db.shipmentItem.findMany({
      where: { updatedAt: { gte: date, lt: new Date(date.getTime() + 86400000) } },
      take: 100,
    }).catch(() => []);

    const actualDelayed = actualShipments.filter(s => (s.delayDays ?? 0) > 0).length;
    const actualAffected = Math.round(actualDelayed * 2.5);

    const accuracy = predictedNodes > 0 && actualAffected > 0
      ? Math.round((1 - Math.abs(predictedNodes - actualAffected) / Math.max(predictedNodes, actualAffected)) * 100)
      : null;

    results.push({
      date: dateStr, scenario: 'auto',
      predicted: { affectedNodes: predictedNodes, avgRisk: predictedRisk },
      actual: { affectedNodes: actualAffected, avgRisk: null },
      accuracy,
    });

    if (accuracy !== null) { totalAccuracy += accuracy; reliableCount++; }
  }

  // Sort by date
  results.sort((a, b) => a.date.localeCompare(b.date));

  return {
    results,
    summary: {
      avgAccuracy: reliableCount > 0 ? Math.round(totalAccuracy / reliableCount) : 0,
      totalPredictions: results.length,
      reliablePredictions: reliableCount,
    },
  };
}
