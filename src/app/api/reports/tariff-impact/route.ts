/**
 * Tariff Impact Report API — per-SKU landed cost & margin impact analysis.
 *
 * POST /api/reports/tariff-impact
 *   Body: { skus: string[], countryCode?: string }
 *
 * For each SKU: looks up product + cost record, computes current tariff,
 * calculates landed cost breakdown, margin impact, and flags at-risk items.
 * Returns a structured JSON report with per-SKU breakdown + totals.
 */

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withErrorHandler, apiSuccess, AppError, ValidationError } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { computeTariff } from '@/lib/services/tariff.service';

export const POST = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const body = await request.json();
  const { skus, countryCode } = body as { skus?: string[]; countryCode?: string };

  if (!skus || !Array.isArray(skus) || skus.length === 0) {
    throw ValidationError('缺少 skus 参数，需提供 SKU 数组');
  }
  if (skus.length > 100) {
    throw ValidationError('单次最多分析 100 个 SKU');
  }

  // Batch fetch products + cost records
  const [products, costRecords] = await Promise.all([
    db.product.findMany({ where: { sku: { in: skus } }, take: 100 }),
    db.costRecord.findMany({ where: { sku: { in: skus } }, take: 100 }),
  ]);

  const productMap = new Map(products.map(p => [p.sku, p]));
  const costMap = new Map(costRecords.map(c => [c.sku, c]));

  const breakdowns: Array<{
    sku: string;
    productName: string;
    category: string;
    unitCost: number;
    sellingPrice: number;
    destination: string;
    currentTariffRate: number;
    currentDutyAmount: number;
    currentLandedCost: number;
    currentGrossMargin: number;
    landedCostPctOfPrice: number;
    atRisk: boolean;
    riskReason: string;
  }> = [];

  let totalLandedCost = 0;
  let totalDutyAmount = 0;
  let totalSellingPrice = 0;
  let atRiskCount = 0;

  for (const sku of skus) {
    const product = productMap.get(sku);
    if (!product) {
      breakdowns.push({
        sku,
        productName: '未找到',
        category: '', unitCost: 0, sellingPrice: 0,
        destination: '', currentTariffRate: 0, currentDutyAmount: 0,
        currentLandedCost: 0, currentGrossMargin: 0,
        landedCostPctOfPrice: 0, atRisk: true, riskReason: 'SKU 未在产品库中找到',
      });
      atRiskCount++;
      continue;
    }

    const cost = costMap.get(sku);
    const destination = countryCode || cost?.destination || 'US';

    // Compute current tariff
    const tariff = await computeTariff({
      category: product.category,
      subCategory: product.subCategory || undefined,
      countryCode: destination,
      sellingPrice: product.sellingPrice,
      originCountry: product.origin || 'CN',
    });

    const landedCost = cost?.totalLanded ?? (product.unitCost + tariff.dutyAmount);
    const grossMargin = cost?.grossMargin ??
      ((product.sellingPrice - landedCost) / product.sellingPrice) * 100;

    const landedCostPct = (landedCost / product.sellingPrice) * 100;

    // At-risk flags
    let atRisk = false;
    const reasons: string[] = [];
    if (tariff.rate > 15) {
      reasons.push(`关税税率 ${tariff.rate}% > 15%`);
    }
    if (grossMargin < 30) {
      reasons.push(`毛利率 ${grossMargin.toFixed(1)}% < 30%`);
    }
    if (landedCostPct > 85) {
      reasons.push('到岸成本占售价比例过高');
    }
    if (reasons.length > 0) atRisk = true;

    breakdowns.push({
      sku: product.sku,
      productName: product.name,
      category: product.category,
      unitCost: product.unitCost,
      sellingPrice: product.sellingPrice,
      destination,
      currentTariffRate: tariff.rate,
      currentDutyAmount: tariff.dutyAmount,
      currentLandedCost: Math.round(landedCost * 100) / 100,
      currentGrossMargin: Math.round(grossMargin * 10) / 10,
      landedCostPctOfPrice: Math.round(landedCostPct * 10) / 10,
      atRisk,
      riskReason: reasons.join('; ') || '正常',
    });

    totalLandedCost += landedCost;
    totalDutyAmount += tariff.dutyAmount;
    totalSellingPrice += product.sellingPrice;
    if (atRisk) atRiskCount++;
  }

  return apiSuccess({
    reportGeneratedAt: new Date().toISOString(),
    summary: {
      totalSkus: skus.length,
      foundSkus: products.length,
      atRiskCount,
      totalLandedCost: Math.round(totalLandedCost * 100) / 100,
      totalDutyAmount: Math.round(totalDutyAmount * 100) / 100,
      totalSellingPrice: Math.round(totalSellingPrice * 100) / 100,
      effectiveTariffRate: totalSellingPrice > 0
        ? Math.round((totalDutyAmount / totalSellingPrice) * 1000) / 10
        : 0,
      dutyPctOfLandedCost: totalLandedCost > 0
        ? Math.round((totalDutyAmount / totalLandedCost) * 1000) / 10
        : 0,
      countryFilter: countryCode || 'auto',
    },
    skuBreakdown: breakdowns,
  });
}));
