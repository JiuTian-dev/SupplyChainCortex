import type { CostRecord } from '@prisma/client';
import type { SimParams, PreviewResult, SimulatedProductResult, TornadoItem, WaterfallItem, ScenarioPresetDef } from './CostSimulatorEnhanced.types';
import { DEFAULT_PARAMS, FACTOR_ORDER, SCENARIO_PRESETS } from './CostSimulatorEnhanced.constants';

export function computeLocalPreview(costs: CostRecord[], params: SimParams): PreviewResult | null {
  if (!costs || costs.length === 0) return null;

  const fxRate = params.exchangeRateChange / 100;
  const freightRate = params.freightChange / 100;
  const rawMatRate = params.rawMaterialChange / 100;
  const tariffRate = params.tariffChange / 100;
  const laborRate = params.laborChange / 100;
  const platformFeeRate = params.platformFeeChange / 100;

  const currentAvgMargin = costs.reduce((s, c) => s + c.grossMargin, 0) / costs.length;

  const simulatedMargins = costs.map(cost => {
    const newRawMaterial = cost.rawMaterial * (1 + rawMatRate);
    const newLabor = cost.labor * (1 + laborRate);
    const newLogistics = cost.logistics * (1 + freightRate);
    const newTariff = cost.tariff * (1 + tariffRate);
    const newPlatformFee = cost.platformFee * (1 + platformFeeRate);

    const newCnyTotal = (newRawMaterial + newLabor) / (cost.exchangeRate * (1 + fxRate));
    const newUsdTotal = newLogistics + newTariff + newPlatformFee;
    const newTotalLanded = newCnyTotal + newUsdTotal;
    const newMargin = ((cost.sellingPrice - newTotalLanded) / cost.sellingPrice) * 100;

    return {
      product: cost.productName,
      sku: cost.sku,
      currentMargin: cost.grossMargin,
      simulatedMargin: Math.round(newMargin * 10) / 10,
      marginChange: Math.round((newMargin - cost.grossMargin) * 10) / 10,
    };
  });

  const estimatedAvgMargin = simulatedMargins.reduce((s, r) => s + r.simulatedMargin, 0) / simulatedMargins.length;
  const productsAtRisk = simulatedMargins.filter(r => r.simulatedMargin < 48).length;

  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  const avgChange = estimatedAvgMargin - currentAvgMargin;
  if (avgChange >= -2 && productsAtRisk <= 1) riskLevel = 'low';
  else if (avgChange >= -5 && productsAtRisk <= 3) riskLevel = 'medium';
  else if (avgChange >= -10) riskLevel = 'high';
  else riskLevel = 'critical';

  return {
    currentAvgMargin: Math.round(currentAvgMargin * 10) / 10,
    estimatedAvgMargin: Math.round(estimatedAvgMargin * 10) / 10,
    marginChange: Math.round((estimatedAvgMargin - currentAvgMargin) * 10) / 10,
    productsAtRisk,
    totalProducts: costs.length,
    riskLevel,
    simulatedMargins,
  };
}

export function computeTornadoData(costs: CostRecord[]): TornadoItem[] {
  if (!costs || costs.length === 0) return [];

  const baseline = computeLocalPreview(costs, DEFAULT_PARAMS);
  if (!baseline) return [];

  const baselineMargin = baseline.estimatedAvgMargin;

  const items: TornadoItem[] = FACTOR_ORDER.map(factor => {
    const paramsLow: SimParams = { ...DEFAULT_PARAMS, [factor.key]: -10 };
    const paramsHigh: SimParams = { ...DEFAULT_PARAMS, [factor.key]: 10 };

    const previewLow = computeLocalPreview(costs, paramsLow);
    const previewHigh = computeLocalPreview(costs, paramsHigh);

    const lowMargin = previewLow?.estimatedAvgMargin ?? baselineMargin;
    const highMargin = previewHigh?.estimatedAvgMargin ?? baselineMargin;

    const impactLow = Math.round((lowMargin - baselineMargin) * 10) / 10;
    const impactHigh = Math.round((highMargin - baselineMargin) * 10) / 10;

    return {
      name: factor.label,
      lowImpact: impactLow,
      highImpact: impactHigh,
      totalRange: Math.round(Math.abs(impactHigh - impactLow) * 10) / 10,
    };
  });

  return items.sort((a, b) => b.totalRange - a.totalRange);
}

export function computeWaterfallData(costs: CostRecord[], params: SimParams, preview: PreviewResult | null): WaterfallItem[] {
  if (!costs || costs.length === 0) return [];

  const baselinePreview = computeLocalPreview(costs, DEFAULT_PARAMS);
  if (!baselinePreview) return [];

  const items: WaterfallItem[] = [];
  const startMargin = baselinePreview.estimatedAvgMargin;

  items.push({
    name: '起始毛利率', base: 0, value: startMargin, fill: '#94a3b8', isTotal: true,
  });

  let runningTotal = startMargin;

  const activeFactors = FACTOR_ORDER.filter(f => params[f.key] !== 0);

  if (activeFactors.length > 0) {
    const cumParams = { ...DEFAULT_PARAMS };

    for (const factor of activeFactors) {
      cumParams[factor.key] = params[factor.key];
      const currentPreview = computeLocalPreview(costs, cumParams);
      if (!currentPreview) continue;

      const currentMargin = currentPreview.estimatedAvgMargin;
      const delta = currentMargin - runningTotal;
      const absDelta = Math.abs(delta);

      if (absDelta < 0.05) continue;

      const isPositive = delta > 0;

      items.push({
        name: factor.label,
        base: isPositive ? runningTotal : runningTotal + delta,
        value: absDelta,
        fill: isPositive ? '#22c55e' : '#ef4444',
        isTotal: false,
      });

      runningTotal = currentMargin;
    }
  }

  const endMargin = preview?.estimatedAvgMargin ?? runningTotal;

  items.push({
    name: '最终毛利率', base: 0, value: endMargin, fill: '#6366f1', isTotal: true,
  });

  return items;
}

export function getWorstBestFromMargins(simulatedMargins: SimulatedProductResult[]): {
  worst: { product: string; marginChange: number } | null;
  best: { product: string; marginChange: number } | null;
} {
  if (!simulatedMargins || simulatedMargins.length === 0) {
    return { worst: null, best: null };
  }
  const sorted = [...simulatedMargins].sort((a, b) => a.marginChange - b.marginChange);
  return {
    worst: { product: sorted[0].product, marginChange: sorted[0].marginChange },
    best: { product: sorted[sorted.length - 1].product, marginChange: sorted[sorted.length - 1].marginChange },
  };
}

export function isPresetActive(preset: ScenarioPresetDef, params: SimParams): boolean {
  const keys = Object.keys(DEFAULT_PARAMS) as (keyof SimParams)[];
  return keys.every(key => params[key] === (preset.params[key] ?? 0));
}

export function getActivePresetKey(params: SimParams): string | null {
  for (const preset of SCENARIO_PRESETS) {
    if (isPresetActive(preset, params)) return preset.key;
  }
  return null;
}
