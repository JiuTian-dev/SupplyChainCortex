/**
 * Score Queries — supply chain health scoring for /api/supply-chain-score.
 * Migrated from services/score.service.ts. Core scoring algorithms preserved intact.
 */

import { db } from '@/lib/db';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { roundTo, clamp } from '@/lib/utils/format';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface SubScore {
  score: number;
  label: string;
  components: Record<string, unknown>;
}

export interface SupplyChainScoreResult {
  overallScore: number;
  grade: string;
  gradeLabel: string;
  subScores: {
    inventory: SubScore;
    cost: SubScore;
    logistics: SubScore;
    sales: SubScore;
    risk: SubScore;
  };
  recommendations: Array<{
    category: string;
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    impact: string;
  }>;
  summary: {
    totalProducts: number;
    totalInventory: number;
    totalShipments: number;
    totalSuppliers: number;
    totalRevenue: number;
    totalSalesQty: number;
  };
  timestamp: string;
}

// ─── Sub-score Computation (algorithm core — intentionally kept compact) ─────────

export function computeInventoryScore(inventory: Array<{ stockStatus: string; turnoverRate: number }>) {
  const counts: Record<string, number> = {};
  inventory.forEach(inv => { counts[inv.stockStatus] = (counts[inv.stockStatus] || 0) + 1; });

  const total = inventory.length;
  const healthyCount = counts['healthy'] || 0;
  const warningCount = counts['warning'] || 0;
  const criticalCount = counts['critical'] || 0;
  const overstockCount = counts['overstock'] || 0;

  const stockHealthScore = total > 0
    ? Math.round((healthyCount * 60 + warningCount * 35 + overstockCount * 20 + criticalCount * 5) / total)
    : 30;

  const avgTurnoverRate = total > 0
    ? inventory.reduce((sum, inv) => sum + inv.turnoverRate, 0) / total
    : 0;

  const turnoverScore = clamp(Math.round(
    avgTurnoverRate >= 8 ? 40 : avgTurnoverRate >= 6 ? 35 : avgTurnoverRate >= 4 ? 28 : avgTurnoverRate >= 2 ? 20 : avgTurnoverRate >= 1 ? 12 : 5
  ), 0, 40);

  return {
    score: clamp(stockHealthScore + turnoverScore, 0, 100),
    stockHealthScore, turnoverScore, healthyCount, warningCount, criticalCount, overstockCount,
    avgTurnoverRate: roundTo(avgTurnoverRate, 2),
  };
}

export function computeCostScore(costRecords: Array<{ grossMargin: number; totalLanded: number }>) {
  const total = costRecords.length;
  const avgMargin = total > 0 ? costRecords.reduce((sum, c) => sum + c.grossMargin, 0) / total : 0;

  const marginScore = clamp(Math.round(
    avgMargin >= 60 ? 60 : avgMargin >= 50 ? 50 : avgMargin >= 45 ? 40 : avgMargin >= 40 ? 30 : avgMargin >= 35 ? 20 : 10
  ), 0, 60);

  const lowMarginCount = costRecords.filter(c => c.grossMargin < 40).length;
  const lowMarginPenalty = total > 0 ? Math.round((lowMarginCount / total) * 20) : 0;

  const totalLandedValues = costRecords.map(c => c.totalLanded);
  const avgTotalLanded = totalLandedValues.length > 0
    ? totalLandedValues.reduce((a, b) => a + b, 0) / totalLandedValues.length : 0;
  const costVariance = totalLandedValues.length > 0
    ? Math.sqrt(totalLandedValues.reduce((sum, v) => sum + Math.pow(v - avgTotalLanded, 2), 0) / totalLandedValues.length) : 0;
  const cv = avgTotalLanded > 0 ? costVariance / avgTotalLanded : 0;

  const varianceScore = clamp(Math.round(
    cv <= 0.1 ? 40 : cv <= 0.2 ? 35 : cv <= 0.3 ? 28 : cv <= 0.5 ? 18 : 8
  ), 0, 40);

  return {
    score: clamp(marginScore + varianceScore - lowMarginPenalty, 0, 100),
    marginScore, varianceScore, lowMarginPenalty,
    avgMargin: roundTo(avgMargin, 1),
    lowMarginCount,
    costVariance: roundTo(costVariance, 2),
  };
}

export function computeLogisticsScore(shipments: Array<{ status: string; delayDays: number; riskLevel: string }>) {
  const total = shipments.length;
  const onTimeDeliveries = shipments.filter(s => s.status === 'delivered' && s.delayDays <= 1).length;
  const delayedShipments = shipments.filter(s => s.status === 'delayed' || s.status === 'exception').length;
  const highRiskShipments = shipments.filter(s => s.riskLevel === 'high' || s.riskLevel === 'critical').length;

  const onTimeRate = total > 0 ? (onTimeDeliveries / total) * 100 : 50;
  const deliveryScore = Math.round(
    onTimeRate >= 95 ? 60 : onTimeRate >= 90 ? 52 : onTimeRate >= 80 ? 42 : onTimeRate >= 70 ? 32 : onTimeRate >= 60 ? 22 : 10
  );

  const riskPenalty = total > 0 ? Math.round((highRiskShipments / total) * 30) : 0;
  const delayPenalty = total > 0 ? Math.round((delayedShipments / total) * 15) : 0;

  return {
    score: clamp(deliveryScore + 40 - riskPenalty - delayPenalty, 0, 100),
    deliveryScore, riskPenalty, delayPenalty,
    onTimeRate: roundTo(onTimeRate, 1),
    delayedShipments, highRiskShipments,
  };
}

export function computeSalesScore(
  salesRecords: Array<{ sku: string; revenue: number; quantity: number; date: Date }>
) {
  const totalRevenue = salesRecords.reduce((sum, r) => sum + r.revenue, 0);

  const revenueByProduct: Record<string, number> = {};
  salesRecords.forEach(r => { revenueByProduct[r.sku] = (revenueByProduct[r.sku] || 0) + r.revenue; });
  const maxProductRevenue = Math.max(...Object.values(revenueByProduct), 0);
  const revenueConcentration = totalRevenue > 0 ? (maxProductRevenue / totalRevenue) * 100 : 0;

  const today = new Date();
  const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(today); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
  const sixtyDaysAgoStr = sixtyDaysAgo.toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const recentRevenue = salesRecords.filter(r => r.date >= new Date(thirtyDaysAgoStr) && r.date <= new Date(todayStr)).reduce((sum, r) => sum + r.revenue, 0);
  const priorRevenue = salesRecords.filter(r => r.date >= new Date(sixtyDaysAgoStr) && r.date < new Date(thirtyDaysAgoStr)).reduce((sum, r) => sum + r.revenue, 0);
  const growthRate = priorRevenue > 0 ? ((recentRevenue - priorRevenue) / priorRevenue) * 100 : 0;

  const growthScore = clamp(Math.round(
    growthRate >= 20 ? 40 : growthRate >= 10 ? 35 : growthRate >= 5 ? 30 : growthRate >= 0 ? 22 : growthRate >= -10 ? 14 : 5
  ), 0, 40);
  const diversificationScore = clamp(Math.round(
    revenueConcentration <= 20 ? 30 : revenueConcentration <= 35 ? 25 : revenueConcentration <= 50 ? 18 : revenueConcentration <= 70 ? 10 : 5
  ), 0, 30);
  const avgDailyRevenue = totalRevenue / 90;
  const volumeScore = clamp(Math.round(
    avgDailyRevenue >= 5000 ? 30 : avgDailyRevenue >= 3000 ? 25 : avgDailyRevenue >= 1000 ? 20 : avgDailyRevenue >= 500 ? 14 : 8
  ), 0, 30);

  return {
    score: clamp(growthScore + diversificationScore + volumeScore, 0, 100),
    growthScore, diversificationScore, volumeScore,
    growthRate: roundTo(growthRate, 1),
    revenueConcentration: roundTo(revenueConcentration, 1),
    avgDailyRevenue: Math.round(avgDailyRevenue),
    totalRevenue: Math.round(totalRevenue),
  };
}

export function computeRiskScore(params: {
  inventory: Array<{ stockStatus: string }>;
  costRecords: Array<{ grossMargin: number }>;
  shipments: Array<{ status: string; riskLevel: string }>;
  suppliers: Array<{ rating: number; leadTime: number }>;
  activeAlertRules: number;
}) {
  const { inventory, costRecords, shipments, suppliers, activeAlertRules } = params;

  const criticalCount = inventory.filter(i => i.stockStatus === 'critical').length;
  const warningCount = inventory.filter(i => i.stockStatus === 'warning').length;
  const overstockCount = inventory.filter(i => i.stockStatus === 'overstock').length;
  const totalInventory = inventory.length;
  const avgMargin = costRecords.length > 0 ? costRecords.reduce((s, c) => s + c.grossMargin, 0) / costRecords.length : 50;
  const lowMarginCount = costRecords.filter(c => c.grossMargin < 40).length;
  const delayedShipments = shipments.filter(s => s.status === 'delayed' || s.status === 'exception').length;
  const highRiskShipments = shipments.filter(s => s.riskLevel === 'high' || s.riskLevel === 'critical').length;
  const totalShipments = shipments.length;
  const avgSupplierRating = suppliers.length > 0 ? suppliers.reduce((s, sp) => s + sp.rating, 0) / suppliers.length : 3;
  const avgLeadTime = suppliers.length > 0 ? suppliers.reduce((s, sp) => s + sp.leadTime, 0) / suppliers.length : 14;

  // Each risk dimension contributes to a weighted penalty, normalized to prevent overflow
  const invRiskBase = totalInventory > 0 ? (criticalCount * 3 + warningCount * 1.5 + overstockCount * 1) / totalInventory : 0;
  const inventoryRiskPenalty = Math.round(clamp(invRiskBase * 40, 0, 40));

  const marginDeficit = Math.max(0, 50 - avgMargin);
  const lowMarginRatio = costRecords.length > 0 ? lowMarginCount / costRecords.length : 0;
  const costRiskPenalty = Math.round(clamp(marginDeficit * 0.4 + lowMarginRatio * 25, 0, 25));

  const delayRatio = totalShipments > 0 ? (delayedShipments + highRiskShipments) / totalShipments : 0;
  const logisticsRiskPenalty = Math.round(clamp(delayRatio * 30, 0, 20));

  const supplierRiskPenalty = Math.round(clamp(Math.max(0, 5 - avgSupplierRating) * 4 + Math.max(0, avgLeadTime - 14) * 0.5, 0, 10));

  const alertPenalty = Math.min(5, activeAlertRules * 1);

  const totalRiskPenalty = inventoryRiskPenalty + costRiskPenalty + logisticsRiskPenalty + supplierRiskPenalty + alertPenalty;

  return {
    score: clamp(100 - totalRiskPenalty, 0, 100),
    inventoryRiskPenalty, costRiskPenalty, logisticsRiskPenalty, supplierRiskPenalty, alertPenalty,
  };
}

// ─── Full Score Computation ──────────────────────────────────────────────────────

/** Compute comprehensive supply chain score from database */
export async function computeSupplyChainScore(detailed = false): Promise<SupplyChainScoreResult> {
  return cachedFetch(
    cacheKey('score', 'supplyChain', detailed),
    async () => {
      const [inventory, costRecords, shipments, salesRecords, products, suppliers, alertRules] = await Promise.all([
        db.inventory.findMany({ take: 5000 }),
        db.costRecord.findMany({ take: 5000 }),
        db.shipmentItem.findMany({ take: 5000 }),
        db.salesRecord.findMany({ take: 5000 }),
        db.product.findMany({ take: 5000 }),
        db.supplier.findMany({ take: 5000 }),
        db.alertRule.findMany({ where: { enabled: true }, take: 5000 }),
      ]);

      const invResult = computeInventoryScore(inventory);
      const costResult = computeCostScore(costRecords);
      const logResult = computeLogisticsScore(shipments);
      const salesResult = computeSalesScore(salesRecords);
      const riskResult = computeRiskScore({
        inventory, costRecords, shipments, suppliers, activeAlertRules: alertRules.length,
      });

      const overallScore = Math.round(
        invResult.score * 0.25 + costResult.score * 0.20 + logResult.score * 0.20 + salesResult.score * 0.20 + riskResult.score * 0.15
      );

      const grade = overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : overallScore >= 60 ? 'D' : 'F';
      const gradeLabel = overallScore >= 90 ? '优秀' : overallScore >= 80 ? '良好' : overallScore >= 70 ? '一般' : overallScore >= 60 ? '需改进' : '危险';

      const recommendations: SupplyChainScoreResult['recommendations'] = [];
      if (invResult.score < 60) recommendations.push({ category: '库存管理', priority: 'high', title: '优化库存水位', description: `库存健康得分仅 ${invResult.score} 分`, impact: `预计可减少缺货损失 ¥${invResult.criticalCount * 8000}/月` });
      if (costResult.score < 60) recommendations.push({ category: '成本控制', priority: costResult.avgMargin < 45 ? 'high' : 'medium', title: '优化成本结构', description: `成本健康得分 ${costResult.score} 分`, impact: '预计可提升毛利率 3-5%' });
      if (logResult.score < 60) recommendations.push({ category: '物流管理', priority: 'high', title: '改善物流交付', description: `物流健康得分 ${logResult.score} 分`, impact: `预计可减少延误损失 ¥${logResult.delayedShipments * 5000}` });
      if (salesResult.score < 60) recommendations.push({ category: '销售策略', priority: 'medium', title: '提升销售表现', description: `销售健康得分 ${salesResult.score} 分`, impact: '预计可提升收入 10-15%' });
      if (riskResult.score < 60) recommendations.push({ category: '风险管理', priority: 'high', title: '加强风险防控', description: `风险健康得分 ${riskResult.score} 分`, impact: '预计可降低供应链中断风险 40%' });

      return {
        overallScore, grade, gradeLabel,
        subScores: {
          inventory: { score: invResult.score, label: '库存健康', components: invResult },
          cost: { score: costResult.score, label: '成本健康', components: costResult },
          logistics: { score: logResult.score, label: '物流健康', components: logResult },
          sales: { score: salesResult.score, label: '销售健康', components: salesResult },
          risk: { score: riskResult.score, label: '风险防控', components: riskResult },
        },
        recommendations,
        summary: {
          totalProducts: products.length,
          totalInventory: inventory.length,
          totalShipments: shipments.length,
          totalSuppliers: suppliers.length,
          totalRevenue: salesResult.totalRevenue,
          totalSalesQty: salesRecords.reduce((s, r) => s + r.quantity, 0),
        },
        timestamp: new Date().toISOString(),
      };
    },
    CACHE_TTL.MEDIUM
  );
}
