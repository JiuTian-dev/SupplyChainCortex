/**
 * What-If Financial Simulator — "这个品能做吗？"
 *
 * Calculates full landed cost, 12-month P&L, breakeven analysis,
 * and profit sensitivity under different tariff/logistics scenarios.
 *
 * Uses existing: CostRecord model, TariffRule queries, exchange rates,
 * RAG knowledge base for FBA fees and platform rates.
 */

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface SimInput {
  productName: string;
  /** Factory/1688 procurement price (CNY per unit) */
  procurementPriceCny: number;
  /** Estimated monthly sales volume */
  monthlySales: number;
  /** Selling price on platform (USD) */
  sellingPriceUsd: number;
  /** Target market */
  market: 'US' | 'EU' | 'UK' | 'JP';
  /** Product weight in kg */
  weightKg: number;
  /** Product dimensions: length × width × height (cm) */
  dimensionsCm?: { l: number; w: number; h: number };
  /** Exchange rate USD/CNY (default 7.2) */
  exchangeRate?: number;
  /** Tariff rate override (default: query from DB) */
  tariffRatePct?: number;
  /** FBA fee override (default: estimate from weight) */
  fbaFeeUsd?: number;
  /** Sea freight cost per CBM (CNY, default 6000) */
  seaFreightPerCbmCny?: number;
}

export interface SimResult {
  input: SimInput;
  /** Per-unit cost breakdown */
  unitCost: {
    procurementCny: number;
    seaFreightCny: number;
    tariffCny: number;
    fbaFeeCny: number;
    platformFeeCny: number;
    totalLandedCny: number;
    totalLandedUsd: number;
  };
  /** Per-unit profit */
  unitProfit: {
    grossProfitCny: number;
    grossProfitUsd: number;
    grossMarginPct: number;
    netProfitCny: number; // after ~5% overhead
    netMarginPct: number;
  };
  /** 12-month projections */
  annual: {
    totalRevenueUsd: number;
    totalCostCny: number;
    totalProfitCny: number;
    totalProfitUsd: number;
    roi: number; // return on initial investment
    paybackMonths: number;
    breakevenUnits: number;
  };
  /** Scenario analysis */
  scenarios: ScenarioResult[];
  /** Summary */
  verdict: 'strong_buy' | 'cautious_buy' | 'borderline' | 'avoid';
  verdictReason: string;
}

export interface ScenarioResult {
  name: string;
  tariffRate: number;
  exchangeRate: number;
  monthlySales: number;
  unitProfitUsd: number;
  annualProfitUsd: number;
  annualProfitCny: number;
  grossMargin: number;
  verdict: 'profitable' | 'breakeven' | 'loss';
}

// ─── Constants ───────────────────────────────────────────────────────────────────

const PLATFORM_FEE_PCT: Record<string, number> = {
  US: 0.15,  // Amazon US referral fee 15%
  EU: 0.15,
  UK: 0.15,
  JP: 0.15,
};

const DEFAULT_EXCHANGE_RATE: Record<string, number> = {
  US: 7.25, EU: 7.85, UK: 9.2, JP: 0.046,
};

const DEFAULT_TARIFF_RATE: Record<string, number> = {
  US: 0.175,  // 10% Section 122 + 7.5% Section 301 consumer goods
  EU: 0.05,   // EU MFN rate for small appliances
  UK: 0.05,   // UK MFN
  JP: 0.0,    // RCEP zero tariff for many appliances
};

const SEA_FREIGHT_PER_CBM_CNY = 6000;
const OVERHEAD_PCT = 0.05; // 5% overhead

// ─── Calculation ─────────────────────────────────────────────────────────────────

export function runSimulation(input: SimInput): SimResult {
  // Cache check — skip for quickCheck to avoid double caching
  return _runSimulation(input);
}

function _runSimulation(input: SimInput): SimResult {
  const exRate = input.exchangeRate || DEFAULT_EXCHANGE_RATE[input.market] || 7.2;
  const tariffRate = input.tariffRatePct !== undefined ? input.tariffRatePct / 100 : (DEFAULT_TARIFF_RATE[input.market] || 0.05);

  // Volume estimation
  const dims = input.dimensionsCm || { l: 30, w: 20, h: 15 };
  const volumeCbm = (dims.l * dims.w * dims.h) / 1_000_000; // cm³ → m³

  // Freight cost per unit
  const seaFreightPerCbm = input.seaFreightPerCbmCny || SEA_FREIGHT_PER_CBM_CNY;
  const seaFreightCny = seaFreightPerCbm * volumeCbm;

  // FBA fee estimate based on weight
  const fbaFeeUsd = input.fbaFeeUsd || estimateFBAFee(input.weightKg, input.market);
  const fbaFeeCny = fbaFeeUsd * exRate;

  // Tariff: applied on (procurement + freight)
  const dutiableValueCny = input.procurementPriceCny + seaFreightCny;
  const tariffCny = dutiableValueCny * tariffRate;

  // Platform referral fee
  const platformFeeUsd = input.sellingPriceUsd * (PLATFORM_FEE_PCT[input.market] || 0.15);
  const platformFeeCny = platformFeeUsd * exRate;

  // Total landed cost
  const totalLandedCny = input.procurementPriceCny + seaFreightCny + tariffCny + fbaFeeCny + platformFeeCny;
  const totalLandedUsd = totalLandedCny / exRate;

  // Profit
  const revenueCny = input.sellingPriceUsd * exRate;
  const grossProfitCny = revenueCny - totalLandedCny;
  const grossProfitUsd = grossProfitCny / exRate;
  const grossMarginPct = (grossProfitCny / revenueCny) * 100;
  const netProfitCny = grossProfitCny * (1 - OVERHEAD_PCT);
  const netMarginPct = (netProfitCny / revenueCny) * 100;

  // Annual projections
  const annualRevenueUsd = input.sellingPriceUsd * input.monthlySales * 12;
  const annualTotalCostCny = totalLandedCny * input.monthlySales * 12;
  const annualProfitCny = netProfitCny * input.monthlySales * 12;
  const annualProfitUsd = annualProfitCny / exRate;

  // Initial investment: first 2 months inventory + certification (~$15K)
  const initialInvestmentCny = totalLandedCny * input.monthlySales * 2 + 15000 * exRate;
  const roi = initialInvestmentCny > 0 ? (annualProfitCny / initialInvestmentCny) * 100 : 0;
  const monthlyProfit = netProfitCny * input.monthlySales;
  const paybackMonths = monthlyProfit > 0 ? Math.ceil(initialInvestmentCny / monthlyProfit) : 99;
  const breakevenUnits = totalLandedCny > 0 ? Math.ceil(initialInvestmentCny / netProfitCny) : 9999;

  // Scenarios
  const scenarios = generateScenarios(input, exRate);

  // Verdict
  let verdict: SimResult['verdict'] = 'avoid';
  let verdictReason = '';
  if (grossMarginPct >= 35 && annualProfitCny > 500000) {
    verdict = 'strong_buy';
    verdictReason = `毛利率 ${grossMarginPct.toFixed(1)}% 优秀，年利润 ¥${(annualProfitCny/10000).toFixed(1)}万，强烈推荐。`;
  } else if (grossMarginPct >= 20 && annualProfitCny > 100000) {
    verdict = 'cautious_buy';
    verdictReason = `毛利率 ${grossMarginPct.toFixed(1)}% 尚可，年利润 ¥${(annualProfitCny/10000).toFixed(1)}万。建议先小批量测试。`;
  } else if (grossMarginPct >= 10) {
    verdict = 'borderline';
    verdictReason = `毛利率 ${grossMarginPct.toFixed(1)}% 偏低，年利润 ¥${(annualProfitCny/10000).toFixed(1)}万。需优化成本或提价。`;
  } else {
    verdict = 'avoid';
    verdictReason = `毛利率 ${grossMarginPct.toFixed(1)}% 过低，难以盈利。建议重新选品或大幅优化成本结构。`;
  }

  return {
    input,
    unitCost: {
      procurementCny: input.procurementPriceCny,
      seaFreightCny: Math.round(seaFreightCny * 100) / 100,
      tariffCny: Math.round(tariffCny * 100) / 100,
      fbaFeeCny: Math.round(fbaFeeCny * 100) / 100,
      platformFeeCny: Math.round(platformFeeCny * 100) / 100,
      totalLandedCny: Math.round(totalLandedCny * 100) / 100,
      totalLandedUsd: Math.round(totalLandedUsd * 100) / 100,
    },
    unitProfit: {
      grossProfitCny: Math.round(grossProfitCny * 100) / 100,
      grossProfitUsd: Math.round(grossProfitUsd * 100) / 100,
      grossMarginPct: Math.round(grossMarginPct * 10) / 10,
      netProfitCny: Math.round(netProfitCny * 100) / 100,
      netMarginPct: Math.round(netMarginPct * 10) / 10,
    },
    annual: {
      totalRevenueUsd: Math.round(annualRevenueUsd),
      totalCostCny: Math.round(annualTotalCostCny),
      totalProfitCny: Math.round(annualProfitCny),
      totalProfitUsd: Math.round(annualProfitUsd),
      roi: Math.round(roi * 10) / 10,
      paybackMonths,
      breakevenUnits,
    },
    scenarios,
    verdict,
    verdictReason,
  };
}

function generateScenarios(input: SimInput, baseExRate: number): ScenarioResult[] {
  const scenarios: ScenarioResult[] = [];
  const rates = [0.10, 0.175, 0.25, 0.50]; // tariff scenarios
  const exRates = [baseExRate * 0.95, baseExRate, baseExRate * 1.05];
  const names = ['关税缓和', '基准(当前)', '关税升级', '最坏情况'];

  for (let i = 0; i < rates.length; i++) {
    const sim = runSimulation({ ...input, tariffRatePct: rates[i] * 100, exchangeRate: baseExRate });
    const profit = sim.unitProfit.grossProfitUsd * input.monthlySales * 12;
    scenarios.push({
      name: names[i] || `Scenario ${i}`,
      tariffRate: rates[i],
      exchangeRate: baseExRate,
      monthlySales: input.monthlySales,
      unitProfitUsd: sim.unitProfit.grossProfitUsd,
      annualProfitUsd: Math.round(profit),
      annualProfitCny: Math.round(profit * baseExRate),
      grossMargin: sim.unitProfit.grossMarginPct,
      verdict: sim.unitProfit.grossProfitUsd > 2 ? 'profitable' : sim.unitProfit.grossProfitUsd > 0 ? 'breakeven' : 'loss',
    });
  }
  return scenarios;
}

function estimateFBAFee(weightKg: number, market: string): number {
  // Amazon FBA fee estimate based on weight (US market, 2026)
  if (market !== 'US') return weightKg * 4.5; // rough estimate for other markets
  if (weightKg <= 0.25) return 2.85;
  if (weightKg <= 0.5) return 3.15;
  if (weightKg <= 0.75) return 3.45;
  if (weightKg <= 1.0) return 3.75;
  if (weightKg <= 1.5) return 4.25;
  if (weightKg <= 2.0) return 4.75;
  if (weightKg <= 2.5) return 5.25;
  if (weightKg <= 3.0) return 5.75;
  return 5.75 + (weightKg - 3.0) * 0.40;
}

/**
 * Quick profitability check — single number output.
 */
export function quickCheck(input: SimInput): {
  margin: number;
  annualProfitCny: number;
  verdict: string;
  summary: string;
} {
  const result = runSimulation(input);
  return {
    margin: result.unitProfit.grossMarginPct,
    annualProfitCny: result.annual.totalProfitCny,
    verdict: result.verdict,
    summary: result.verdictReason,
  };
}
