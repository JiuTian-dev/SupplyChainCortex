/**
 * Cross-Platform Arbitrage Engine — "这个品拿到亚马逊卖能赚多少？"
 *
 * Wires together: competitor data + financial simulation + compliance check +
 * tariff calculation + supplier sourcing → single arbitrage decision.
 *
 * Output: executable sourcing recommendation with margin, compliance cost,
 * timeline, ROI, and "go/no-go" verdict.
 */

import { fetchCompetitorPrices } from '@/lib/sources/amazon-competitor';
import { runSimulation, type SimInput } from '@/lib/engine/financial-simulator';
import { checkCompliance } from '@/lib/engine/compliance-check';
import { webSearch } from '@/lib/services/web-search.service';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface ArbitrageOpportunity {
  productName: string;
  /** Source platform for supply */
  sourcePlatform: string;
  sourcePriceCny: number;
  sourceUrl?: string;
  /** Target platform for selling */
  targetPlatform: string;
  targetPriceUsd: number;
  /** Competitor landscape */
  competitorCount: number;
  competitorPriceRange: { min: number; max: number; avg: number };
  /** Financial projection */
  financials: {
    landedCostUsd: number;
    unitProfitUsd: number;
    grossMarginPct: number;
    annualProfitCny: number;
    roi: number;
    paybackMonths: number;
  };
  /** Compliance requirements */
  compliance: {
    totalCertCostLow: number;
    totalCertCostHigh: number;
    timelineWeeks: number;
    keyCertifications: string[];
  };
  /** Verdict */
  score: number; // 0-100 composite
  verdict: 'strong_buy' | 'buy' | 'watch' | 'pass';
  verdictReason: string;
  risks: string[];
}

export interface ArbitrageRequest {
  productDescription: string;
  sourcePlatform?: string; // 1688, Temu, etc. — default: search all
  targetMarket?: string;   // US, EU, UK, JP — default: US
  maxBudgetCny?: number;
  targetMarginPct?: number;
}

// ─── Main Engine ─────────────────────────────────────────────────────────────────

export async function findArbitrageOpportunity(
  request: ArbitrageRequest,
): Promise<ArbitrageOpportunity> {
  const targetMarket = request.targetMarket || 'US';
  const targetMargin = request.targetMarginPct || 25;

  // 1. Search for source pricing on 1688
  const sourceQuery = `${request.productDescription} 1688 批发价格`;
  let sourcePriceCny = 50;
  let sourceUrl = '';
  try {
    const { results } = await webSearch(sourceQuery);
    if (results.length > 0) {
      const priceMatch = results.map(r => r.snippet).join(' ').match(/[¥￥]\s*(\d+\.?\d*)/);
      if (priceMatch) sourcePriceCny = parseFloat(priceMatch[1]);
      sourceUrl = results[0]?.url || '';
    }
  } catch { /* best-effort */ }

  // If sourcePrice seems too low for the category, use sensible defaults
  if (sourcePriceCny < 5) sourcePriceCny = estimateSourcePrice(request.productDescription);

  // 2. Search competitor pricing on target platform
  const competitors = await fetchCompetitorPrices(request.productDescription);
  const targetPriceUsd = competitors.length > 0
    ? competitors[0].avgPrice
    : estimateTargetPrice(request.productDescription, targetMarket);
  const competitorPriceRange = {
    min: competitors.length > 0 ? competitors[0].minPrice : targetPriceUsd * 0.6,
    max: competitors.length > 0 ? competitors[0].maxPrice : targetPriceUsd * 1.5,
    avg: targetPriceUsd,
  };

  // 3. Run financial simulation
  const simInput: SimInput = {
    productName: request.productDescription,
    procurementPriceCny: sourcePriceCny,
    sellingPriceUsd: targetPriceUsd,
    monthlySales: estimateMonthlySales(request.productDescription),
    market: targetMarket as 'US' | 'EU' | 'UK' | 'JP',
    weightKg: 1.5,
  };
  const sim = runSimulation(simInput);

  // 4. Check compliance
  const compliance = await checkCompliance(request.productDescription, targetMarket);

  // 5. Score and verdict
  const score = computeArbitrageScore(sim, compliance, competitorPriceRange);
  const verdict = computeVerdict(score, sim.unitProfit.grossMarginPct, targetMargin);
  const risks = identifyRisks(sim, compliance, request);

  return {
    productName: request.productDescription,
    sourcePlatform: '1688',
    sourcePriceCny,
    sourceUrl: sourceUrl || undefined,
    targetPlatform: targetMarket === 'US' ? 'Amazon.com' : targetMarket,
    targetPriceUsd,
    competitorCount: competitors.length || 15,
    competitorPriceRange,
    financials: {
      landedCostUsd: sim.unitCost.totalLandedUsd,
      unitProfitUsd: sim.unitProfit.grossProfitUsd,
      grossMarginPct: sim.unitProfit.grossMarginPct,
      annualProfitCny: sim.annual.totalProfitCny,
      roi: sim.annual.roi,
      paybackMonths: sim.annual.paybackMonths,
    },
    compliance: {
      totalCertCostLow: compliance.totalCostLow,
      totalCertCostHigh: compliance.totalCostHigh,
      timelineWeeks: compliance.totalTimelineWeeks,
      keyCertifications: compliance.requirements
        .filter(r => r.mandatory && r.riskLevel === 'high')
        .map(r => r.certName)
        .slice(0, 5),
    },
    score,
    verdict,
    verdictReason: buildVerdictReason(sim, compliance, score),
    risks,
  };
}

// ─── Scoring ─────────────────────────────────────────────────────────────────────

function computeArbitrageScore(
  sim: ReturnType<typeof runSimulation>,
  compliance: Awaited<ReturnType<typeof checkCompliance>>,
  competitors: { min: number; max: number; avg: number },
): number {
  let score = 50;

  // Margin component (0-30 points)
  const margin = sim.unitProfit.grossMarginPct;
  if (margin >= 45) score += 30;
  else if (margin >= 35) score += 25;
  else if (margin >= 25) score += 18;
  else if (margin >= 15) score += 10;
  else score -= 10;

  // Competitor gap (0-25 points) — higher selling price vs competitors = good
  const priceRatio = sim.input.sellingPriceUsd / Math.max(competitors.avg, 1);
  if (priceRatio < 0.7) score += 25; // significantly undercutting
  else if (priceRatio < 0.9) score += 18;
  else if (priceRatio < 1.1) score += 10;
  else score += 5; // at or above market — harder to sell

  // Compliance burden (0-20 points) — lower cost, faster timeline = better
  const complianceScore = Math.max(0, 20 - (compliance.totalCostHigh / 2000) - (compliance.totalTimelineWeeks / 2));
  score += Math.round(complianceScore);

  // Annual profit scale (0-25 points)
  const annualProfit = sim.annual.totalProfitCny;
  if (annualProfit > 500000) score += 25;
  else if (annualProfit > 200000) score += 20;
  else if (annualProfit > 100000) score += 15;
  else if (annualProfit > 30000) score += 10;
  else score += 0;

  return Math.max(0, Math.min(100, score));
}

function computeVerdict(
  score: number, margin: number, targetMargin: number,
): ArbitrageOpportunity['verdict'] {
  if (score >= 75 && margin >= targetMargin) return 'strong_buy';
  if (score >= 60 && margin >= targetMargin * 0.7) return 'buy';
  if (score >= 40) return 'watch';
  return 'pass';
}

function buildVerdictReason(
  sim: ReturnType<typeof runSimulation>,
  compliance: Awaited<ReturnType<typeof checkCompliance>>,
  score: number,
): string {
  const parts: string[] = [];
  parts.push(`综合评分: ${score}/100`);
  parts.push(`毛利率: ${sim.unitProfit.grossMarginPct.toFixed(1)}%`);
  parts.push(`年利润: ¥${(sim.annual.totalProfitCny / 10000).toFixed(1)}万`);
  parts.push(`回本周期: ${sim.annual.paybackMonths}个月`);
  parts.push(`合规投入: $${compliance.totalCostLow}-${compliance.totalCostHigh}, ${compliance.totalTimelineWeeks}周`);
  if (compliance.missingCerts.length > 0) {
    parts.push(`⚠️ 缺失认证: ${compliance.missingCerts.slice(0, 3).join(', ')}`);
  }
  return parts.join(' | ');
}

function identifyRisks(
  sim: ReturnType<typeof runSimulation>,
  compliance: Awaited<ReturnType<typeof checkCompliance>>,
  request: ArbitrageRequest,
): string[] {
  const risks: string[] = [];
  if (sim.unitProfit.grossMarginPct < 20) risks.push('毛利率低于20%，价格波动可能导致亏损');
  if (compliance.totalTimelineWeeks > 12) risks.push(`合规周期${compliance.totalTimelineWeeks}周较长，可能错过市场窗口`);
  if (compliance.totalCostHigh > 20000) risks.push(`合规成本$${compliance.totalCostHigh.toLocaleString()}较高，拉长回本周期`);
  if (sim.annual.paybackMonths > 8) risks.push(`回本周期${sim.annual.paybackMonths}个月偏长`);
  if (compliance.missingCerts.filter(c => c.includes('UL') || c.includes('FCC-ID')).length > 0) {
    risks.push('缺少关键强制认证，产品可能被平台下架');
  }
  const worstScenario = sim.scenarios.find(s => s.name === '最坏情况');
  if (worstScenario && worstScenario.verdict === 'loss') {
    risks.push('关税升级情景下可能亏损，需评估风险承受能力');
  }
  return risks;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function estimateSourcePrice(product: string): number {
  const lower = product.toLowerCase();
  if (/coffee|咖啡/.test(lower)) return 85;
  if (/blender|榨汁|juicer/.test(lower)) return 45;
  if (/vacuum|吸尘/.test(lower)) return 120;
  if (/air fryer|空气炸锅/.test(lower)) return 95;
  if (/humidifier|加湿/.test(lower)) return 35;
  if (/kettle|水壶/.test(lower)) return 25;
  if (/fan|风扇/.test(lower)) return 40;
  if (/toaster|烤面包/.test(lower)) return 30;
  if (/speaker|音箱|蓝牙/.test(lower)) return 55;
  return 50;
}

function estimateTargetPrice(product: string, market: string): number {
  const base = estimateSourcePrice(product);
  const multiplier = market === 'US' ? 5.5 : market === 'EU' ? 4.8 : market === 'UK' ? 4.5 : 4.0;
  return Math.round(base * multiplier * 0.8) / 100; // 80% of rough retail = competitive
}

function estimateMonthlySales(product: string): number {
  const lower = product.toLowerCase();
  if (/air fryer|coffee|vacuum|吸尘|咖啡|空气炸锅/.test(lower)) return 500;
  if (/blender|juicer|榨汁|humidifier|加湿/.test(lower)) return 350;
  return 200;
}
