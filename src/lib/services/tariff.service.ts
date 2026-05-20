/**
 * Dynamic Tariff Engine
 *
 * Long-term architecture:
 *   1. Products mapped to HS codes
 *   2. Tariff rules: country × HS code × trade agreement × effective dates
 *   3. Priority-based resolution: Section 301 overrides MFN, USMCA overrides Section 301
 *   4. Scenario simulation: "what if tariff changes from 7.5% to 25%?"
 *
 * Data sources for 2026 real rates:
 *   - WTO Tariff Data (MFN rates)
 *   - US Section 301 (USTR notices)
 *   - EU CBAM (European Commission)
 *   - RCEP agreement texts
 *   - USMCA rules of origin
 */

import { db } from '@/lib/db';
import { fetchCarbonPrice, estimateCBAMCost } from '@/lib/sources/carbon-price';
import type { TariffRule } from '@prisma/client';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface TariffResult {
  countryCode: string;
  countryName: string;
  hsCode: string;
  rate: number;
  rateType: string;
  tradeAgreement: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  notes: string | null;
  /** Total landed cost impact for a product at selling price */
  costImpact?: number;
}

export interface TariffScenario {
  name: string;
  description: string;
  changes: Array<{
    countryCode: string;
    newRate: number;
    tradeAgreement: string;
  }>;
  /** Enable CBAM carbon cost calculation for this scenario */
  cbamEnabled?: boolean;
  /** Percentage of free EUA allocation phased out (0-100). 2026=10%, 2030=50%, 2034=100% */
  cbamPhaseOutPct?: number;
}

export interface TariffSimulationResult {
  scenario: TariffScenario;
  productImpacts: Array<{
    sku: string;
    productName: string;
    currentRate: number;
    newRate: number;
    currentMargin: number;
    newMargin: number;
    marginChange: number;
    annualRevenueImpact: number;
    recommendation: string;
  }>;
  summary: {
    productsBelowMargin: number;
    totalRevenueImpact: number;
    worstAffected: string;
    recommendedActions: string[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Core Engine
// ═══════════════════════════════════════════════════════════════════════════════

/** Get the HS code for a product category */
export async function getHSCode(category: string, subCategory?: string): Promise<string | null> {
  const mapping = await db.productHSCode.findFirst({
    where: { category, subCategory: subCategory || null },
  });
  if (mapping) return mapping.hsCode;

  // Fallback: match by category only
  const fallback = await db.productHSCode.findFirst({ where: { category } });
  return fallback?.hsCode || null;
}

/** Get all applicable tariff rules for a given HS code and destination country */
export async function getApplicableTariffs(
  hsCode: string,
  countryCode: string,
  originCountry: string = 'CN',
): Promise<TariffResult[]> {
  const rules = await db.tariffRule.findMany({
    where: {
      hsCode,
      countryCode,
      originCountry,
      isActive: true,
    },
    orderBy: { priority: 'desc' },
  });

  return rules.map((r: TariffRule) => ({
    countryCode: r.countryCode,
    countryName: r.countryName,
    hsCode: r.hsCode,
    rate: r.rate,
    rateType: r.rateType,
    tradeAgreement: r.tradeAgreement || 'MFN',
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    isActive: r.isActive,
    notes: r.notes,
  }));
}

/** Compute the effective tariff rate for a product going to a destination */
export async function computeTariff(params: {
  category: string;
  subCategory?: string;
  countryCode: string;
  sellingPrice: number;
  originCountry?: string;
}): Promise<{ rate: number; rules: TariffResult[]; dutyAmount: number }> {
  const hsCode = await getHSCode(params.category, params.subCategory);
  if (!hsCode) {
    return { rate: 0, rules: [], dutyAmount: 0 };
  }

  const rules = await getApplicableTariffs(hsCode, params.countryCode, params.originCountry || 'CN');

  // Priority-based resolution: highest priority rule wins
  const effectiveRule = rules[0];
  const rate = effectiveRule?.rate || 0;
  const dutyAmount = Math.round(params.sellingPrice * (rate / 100) * 100) / 100;

  return { rate, rules, dutyAmount };
}

/** Get all active tariff rules (for overview/discovery) */
export async function getTariffOverview(): Promise<{
  countries: Array<{ code: string; name: string; ruleCount: number }>;
  tradeAgreements: Array<{ name: string; ruleCount: number }>;
  highRateRules: TariffResult[];
}> {
  const allRules = await db.tariffRule.findMany({
    where: { isActive: true },
    orderBy: { rate: 'desc' },
  });

  const countryMap = new Map<string, { code: string; name: string; ruleCount: number }>();
  const agreementMap = new Map<string, number>();

  for (const r of allRules) {
    const c = countryMap.get(r.countryCode) || { code: r.countryCode, name: r.countryName, ruleCount: 0 };
    c.ruleCount++;
    countryMap.set(r.countryCode, c);

    const ag = r.tradeAgreement || 'MFN';
    agreementMap.set(ag, (agreementMap.get(ag) || 0) + 1);
  }

  return {
    countries: [...countryMap.values()].sort((a, b) => b.ruleCount - a.ruleCount),
    tradeAgreements: [...agreementMap.entries()].map(([name, count]) => ({ name, ruleCount: count })),
    highRateRules: allRules
      .filter((r: TariffRule) => r.rate >= 20)
      .slice(0, 10)
      .map((r: TariffRule) => ({
        countryCode: r.countryCode, countryName: r.countryName,
        hsCode: r.hsCode, rate: r.rate, rateType: r.rateType,
        tradeAgreement: r.tradeAgreement || 'MFN',
        effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo,
        isActive: r.isActive, notes: r.notes,
      })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario Simulation
// ═══════════════════════════════════════════════════════════════════════════════

/** Pre-defined 2026-relevant tariff scenarios */
// ═══════════════════════════════════════════════════════════════════════════════
// CBAM Carbon Cost — EU Carbon Border Adjustment Mechanism
// ═══════════════════════════════════════════════════════════════════════════════

/** Product carbon footprint estimates (kg CO2 per kg product) for small appliances */
const PRODUCT_CARBON_INTENSITY: Record<string, number> = { default: 2.5 };

/**
 * Compute CBAM cost for a product exported to EU.
 * CBAM = EUA price × embodied emissions × (1 - free allocation %)
 *
 * 2026: 90% free allocation → pay 10% of embedded carbon
 * 2030: 50% free → pay 50%
 * 2034: 0% free → pay 100%
 */
export async function computeCBAMCost(params: {
  productWeightKg: number;
  carbonIntensity?: number; // kg CO2 per kg product, default 2.5
  phaseOutPct?: number;     // % of free allocation phased out, default 10 (2026)
}): Promise<{
  euaPrice: number;
  carbonCostEUR: number;
  carbonCostCNY: number;   // approx, using PBOC midpoint
  freeAllocationPct: number;
  source: string;
} | null> {
  try {
    const carbon = await fetchCarbonPrice();
    if (!carbon) return null;

    const intensity = params.carbonIntensity || PRODUCT_CARBON_INTENSITY.default;
    const phaseOut = params.phaseOutPct ?? 10; // 2026 default: 10% phased out
    const freePct = 100 - phaseOut;

    // Embodied emissions = weight × carbon intensity (kg CO2)
    const embodiedCO2 = (params.productWeightKg * intensity); // kg CO2

    // CBAM cost = EUA × embodied × (phaseOut/100)
    // EUA price is EUR/t CO2, embodied is kg → convert to tonnes
    const carbonCostEUR = Math.round(carbon.price * (embodiedCO2 / 1000) * (phaseOut / 100) * 100) / 100;

    // Approximate CNY cost using typical EUR/CNY rate ~8.0
    const carbonCostCNY = Math.round(carbonCostEUR * 8.0 * 100) / 100;

    return {
      euaPrice: carbon.price,
      carbonCostEUR,
      carbonCostCNY,
      freeAllocationPct: freePct,
      source: carbon.source,
    };
  } catch {
    return null;
  }
}

/** Get live CBAM scenario with current EUA price */
export async function getLiveCBAMScenario(): Promise<{
  euaPrice: number;
  phaseOut2026: number;
  phaseOut2030: number;
  phaseOut2034: number;
  source: string;
}> {
  const carbon = await fetchCarbonPrice();
  const euaPrice = carbon?.price || 77; // fallback to typical price
  return {
    euaPrice,
    phaseOut2026: 10,
    phaseOut2030: 50,
    phaseOut2034: 100,
    source: carbon?.source || 'static',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════

export const TARIFF_SCENARIOS: TariffScenario[] = [
  {
    name: 'US Section 301 escalation',
    description: '美国对中国小家电关税从 7.5% → 25%（2026年贸易谈判破裂）',
    changes: [{ countryCode: 'US', newRate: 25, tradeAgreement: 'Section301-escalated' }],
  },
  {
    name: 'EU CBAM full enforcement',
    description: '欧盟碳边境税全面实施，家电碳排放成本实时计算（EUA期货 + 产品碳足迹）',
    changes: [{ countryCode: 'EU', newRate: 7.7, tradeAgreement: 'CBAM-full' }],
    cbamEnabled: true,
    cbamPhaseOutPct: 10,
  },
  {
    name: 'RCEP tariff elimination',
    description: 'RCEP 第五年降税，对日韩出口关税降至 0%',
    changes: [
      { countryCode: 'JP', newRate: 0, tradeAgreement: 'RCEP-phase5' },
      { countryCode: 'KR', newRate: 0, tradeAgreement: 'RCEP-phase5' },
    ],
  },
  {
    name: 'Mexico transshipment route',
    description: '通过墨西哥转口规避 Section 301（需满足 USMCA 原产地）',
    changes: [{ countryCode: 'US', newRate: 0, tradeAgreement: 'USMCA' }],
  },
  {
    name: 'De minimis elimination',
    description: '美国取消 800 美元以下免税政策，全部征收关税',
    changes: [{ countryCode: 'US', newRate: 25, tradeAgreement: 'Section301-no-deminimis' }],
  },
];

/** Simulate a tariff scenario against all products */
export async function simulateTariffScenario(
  scenarioName: string,
): Promise<TariffSimulationResult> {
  const scenario = TARIFF_SCENARIOS.find(s => s.name === scenarioName);
  if (!scenario) throw new Error(`未知场景: ${scenarioName}。可用: ${TARIFF_SCENARIOS.map(s => s.name).join(', ')}`);

  const products = await db.product.findMany({ take: 500 });
  const costRecords = await db.costRecord.findMany({ take: 500 });
  const costMap = new Map(costRecords.map(c => [c.sku, c]));

  const impacts: TariffSimulationResult['productImpacts'] = [];

  for (const product of products) {
    const cost = costMap.get(product.sku);
    if (!cost) continue;

    // Current tariff rate
    const currentTariff = await computeTariff({
      category: product.category,
      subCategory: product.subCategory,
      countryCode: cost.destination,
      sellingPrice: product.sellingPrice,
    });

    // Simulated tariff rate
    const change = scenario.changes.find(c => c.countryCode === cost.destination);
    const newRate = change?.newRate ?? currentTariff.rate;

    // Recalculate totalLanded with new tariff
    const currentDuty = product.sellingPrice * (currentTariff.rate / 100);
    const newDuty = product.sellingPrice * (newRate / 100);
    const dutyDelta = newDuty - currentDuty;

    // CBAM carbon cost (EU-bound products with cbamEnabled scenario)
    let carbonCost = 0;
    if (scenario.cbamEnabled && cost.destination === 'EU') {
      const cbam = await computeCBAMCost({
        productWeightKg: product.weight || 1.5,
        phaseOutPct: scenario.cbamPhaseOutPct || 10,
      });
      if (cbam) {
        carbonCost = cbam.carbonCostEUR; // EUR cost per unit
      }
    }

    const newTotalLanded = cost.totalLanded + dutyDelta + carbonCost;
    const newMargin = ((product.sellingPrice - newTotalLanded) / product.sellingPrice) * 100;

    const hasTariffChange = Math.abs(newRate - currentTariff.rate) > 0.1;
    const hasCarbonCost = carbonCost > 0.01;

    if (hasTariffChange || hasCarbonCost) {
      let recommendation = '';
      if (carbonCost > 0.01) {
        recommendation = `CBAM 碳成本 €${carbonCost}/台（EUA €${scenario.cbamPhaseOutPct}% 付费比例）`;
        if (newMargin < 40) {
          recommendation += `，毛利率将降至 ${Math.round(newMargin)}%，建议评估低碳材料或提价`;
        } else {
          recommendation += `，影响可控`;
        }
      } else if (newMargin < 40) {
        recommendation = `毛利率将降至 ${Math.round(newMargin)}%，建议评估替代原产地（墨西哥/越南）或提价`;
      } else if (newMargin < 48) {
        recommendation = `毛利率降至 ${Math.round(newMargin)}%，建议关注并准备备选方案`;
      } else {
        recommendation = `影响可控，维持当前策略`;
      }

      impacts.push({
        sku: product.sku,
        productName: product.name,
        currentRate: currentTariff.rate,
        newRate,
        currentMargin: cost.grossMargin,
        newMargin: Math.round(newMargin * 10) / 10,
        marginChange: Math.round((newMargin - cost.grossMargin) * 10) / 10,
        annualRevenueImpact: Math.round((dutyDelta + carbonCost) * 100 * 12),
        recommendation,
      });
    }
  }

  // Sort by most impacted
  impacts.sort((a, b) => a.marginChange - b.marginChange);

  const belowMargin = impacts.filter(i => i.newMargin < 48).length;
  const totalRevenueImpact = impacts.reduce((s, i) => s + i.annualRevenueImpact, 0);

  return {
    scenario,
    productImpacts: impacts,
    summary: {
      productsBelowMargin: belowMargin,
      totalRevenueImpact,
      worstAffected: impacts.length > 0 ? impacts[0].productName : 'N/A',
      recommendedActions: [
        belowMargin > 5 ? `⚠️ ${belowMargin} 个产品毛利率将低于 48%，需启动应急预案` : '',
        totalRevenueImpact > 50000 ? `💰 年度关税成本增加 $${totalRevenueImpact.toLocaleString()}` : '',
        '评估原产地变更（墨西哥/越南/马来西亚）以利用 USMCA/RCEP 优惠税率',
        '对高毛利产品适度提价 2-5% 分担关税成本',
        '加速供应链多元化，减少单一来源依赖',
      ].filter(Boolean),
    },
  };
}
