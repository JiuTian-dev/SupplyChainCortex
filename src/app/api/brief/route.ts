/**
 * GET /api/brief — Weekly Supply Chain Intelligence Brief
 *
 * Aggregates all 14 data sources into a structured JSON + markdown summary.
 * Used by the ChatPanel /brief command and decision center.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { db } from '@/lib/db';

async function handler(_request: NextRequest) {
  // ── Gather all data in parallel ─────────────────────────────────────────

  const [
    cascade, commodity, freight, fx, carbon, scfis, cpsc,
    criticalInv, delayed, topSuppliers, recentEvents,
  ] = await Promise.all([
    // Cascade risk
    (async () => {
      try {
        const { getCascadeRisk } = await import('@/lib/services/cascade-risk.service');
        const r = await getCascadeRisk({ scenario: 'auto', includeForwardProjection: false, includeCounterfactuals: true });
        return {
          affectedNodes: r.summary?.affectedNodes || 0,
          totalNodes: r.summary?.totalNodes || 0,
          maxDepth: (r as any).maxDepth || 0,
          totalMonthlyLoss: r.summary?.totalMonthlyLoss || 0,
          riskSources: (r as any).sourceNodes?.map((s: any) => s.cause?.slice(0, 50)) || [],
          topCF: r.counterfactuals?.[0],
        };
      } catch { return null; }
    })(),

    // Commodity prices
    (async () => {
      try {
        const { fetchDailyCommodities } = await import('@/lib/sources/alphavantage-commodities');
        const c = await fetchDailyCommodities();
        return {
          items: c.map(i => ({ name: i.name, price: i.price, unit: i.unit, changePct: i.changePct, source: i.source })),
          trend: c.reduce((s, i) => s + i.changePct, 0) / (c.length || 1) > 2 ? '上涨' : '稳定或下跌',
          highlights: c.filter(i => Math.abs(i.changePct) > 3).map(i => `${i.name}: ${i.changePct > 0 ? '+' : ''}${i.changePct}%`),
        };
      } catch { return null; }
    })(),

    // Freight
    (async () => {
      try {
        const { getFreightRates } = await import('@/lib/services/freight.service');
        const f = await getFreightRates();
        return { trend: f.trend, avgRate: f.avgRate40GP, routeCount: f.rates.length, source: f.source };
      } catch { return null; }
    })(),

    // Exchange rates
    (async () => {
      try {
        const { getLatestRates } = await import('@/lib/queries/exchange-rate.queries');
        const fx = await getLatestRates();
        const usdRate = fx.rates?.USD ? (1 / fx.rates.USD).toFixed(4) : 'N/A';
        const midpoint = fx.midpoints?.USD;
        return { usdCny: usdRate, midpoint: midpoint?.midpoint, spread: midpoint?.spread };
      } catch { return null; }
    })(),

    // EU carbon
    (async () => {
      try {
        const { fetchCarbonPrice } = await import('@/lib/sources/carbon-price');
        const c = await fetchCarbonPrice();
        return c ? { price: c.price, changePct: c.changePct } : null;
      } catch { return null; }
    })(),

    // SCFIS freight futures
    (async () => {
      try {
        const { fetchSCFISPrice, scfisToFreightRate } = await import('@/lib/sources/scfis-futures');
        const s = await fetchSCFISPrice();
        if (!s) return null;
        const freight = scfisToFreightRate(s.price);
        return { index: s.price, contract: s.contract, changePct: s.changePct, estFreightUSD: freight.rateUSD };
      } catch { return null; }
    })(),

    // CCPIT recalls this week
    db.regulationChange.findMany({
      where: { source: 'CCPIT/CPSC', createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
      select: { title: true, createdAt: true, impactLevel: true },
      take: 10,
      orderBy: { createdAt: 'desc' },
    }),

    // Critical inventory
    db.inventory.findMany({
      where: { stockStatus: { in: ['critical', 'warning'] } },
      select: { sku: true, productName: true, quantity: true, safetyStock: true, stockStatus: true },
      take: 5,
    }),

    // Delayed shipments
    db.shipmentItem.findMany({
      where: { status: { in: ['delayed', 'exception'] } },
      select: { trackingNumber: true, productName: true, delayDays: true, destination: true },
      take: 5,
      orderBy: { delayDays: 'desc' },
    }),

    // Top supplier scores (dynamic)
    db.supplier.findMany({
      where: { status: 'active' },
      select: { name: true, rating: true, region: true },
      orderBy: { rating: 'desc' },
      take: 3,
    }),

    // Recent supply chain events (alerts)
    db.supplyChainEvent.findMany({
      where: { type: 'alert', createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ]);

  // ── Compute scores — use authoritative score from supply-chain engine ───

  const affectedNodes = cascade?.affectedNodes || 0;
  const totalNodes = cascade?.totalNodes || 39;
  const totalLoss = cascade?.totalMonthlyLoss || 0;

  // Use computeSupplyChainScore() for authoritative scores (same as /api/supply-chain-score)
  let healthScore = 50; // fallback
  let riskScore = 50;
  let subScores: Record<string, number> = {};
  try {
    const { computeSupplyChainScore } = await import('@/lib/queries/score.queries');
    const scoreResult = await computeSupplyChainScore();
    healthScore = scoreResult.overallScore;
    riskScore = scoreResult.subScores.risk.score;
    subScores = {
      inventory: scoreResult.subScores.inventory.score,
      cost: scoreResult.subScores.cost.score,
      logistics: scoreResult.subScores.logistics.score,
      sales: scoreResult.subScores.sales.score,
      risk: scoreResult.subScores.risk.score,
    };
  } catch { /* keep fallback */ }

  // ── Build recommendation ────────────────────────────────────────────────

  const recommendations: string[] = [];
  if (cascade?.totalMonthlyLoss && cascade.totalMonthlyLoss > 1000) {
    const cfName = (cascade.topCF as any)?.name || '组合方案';
    const cfReduction = (cascade.topCF as any)?.riskReduction || 0;
    recommendations.push(`🔴 月度预估风险损失 $${cascade.totalMonthlyLoss.toLocaleString()}，建议执行「${cfName}」可挽回约 $${cfReduction ? Math.round(cascade.totalMonthlyLoss * cfReduction).toLocaleString() : '?'}`);
  }
  if (criticalInv.length > 0) {
    recommendations.push(`📦 ${criticalInv.length} 个 SKU 库存告急: ${criticalInv.map(i => i.productName).join('、')}，建议立即补货`);
  }
  if (delayed.length > 0) {
    recommendations.push(`🚢 ${delayed.length} 票货物延迟: 最长 ${delayed[0]?.delayDays || 0} 天，目的港 ${delayed[0]?.destination || '未知'}`);
  }
  if (cpsc.length > 0) {
    recommendations.push(`⚠️ 本周 ${cpsc.length} 条 CPSC 召回，请检查同类产品合规状态`);
  }
  if (commodity?.highlights && commodity.highlights.length > 0) {
    recommendations.push(`📊 原材料波动: ${(commodity.highlights as string[]).join('、')}`);
  }
  if (fx?.spread && Math.abs(fx.spread) > 0.5) {
    recommendations.push(`💱 汇率偏离: USD/CNY 市场 ${fx.usdCny} vs 中间价 ${fx.midpoint}，偏离 ${fx.spread}%`);
  }
  if (recommendations.length === 0) {
    recommendations.push('✅ 本周供应链运行正常，无需特别干预');
  }

  // ── Build text ──────────────────────────────────────────────────────────

  const briefLines = [
    `## 周度供应链情报简报`,
    ``,
    `**综合健康分: ${healthScore}/100 | 风险分: ${riskScore}/100**`,
    `**子项**: 库存 ${subScores.inventory || '?'} | 成本 ${subScores.cost || '?'} | 物流 ${subScores.logistics || '?'} | 销售 ${subScores.sales || '?'} | 风险 ${subScores.risk || '?'}`,
    ``,
    `### 📋 本周关键发现`,
    ...recommendations.map(r => `- ${r}`),
    ``,
    `### 📊 数据概览`,
    `- 汇率: USD/CNY 市场 ${fx?.usdCny || 'N/A'} | 中间价 ${fx?.midpoint || 'N/A'} | 偏离 ${fx?.spread || 0}%`,
    `- 运价: SCFIS ${scfis?.index || 'N/A'} pts → 欧洲线约 $${scfis?.estFreightUSD || 'N/A'}/FEU`,
    `- 碳价: EUA €${carbon?.price || 'N/A'}/t CO2`,
    `- 大宗商品: ${commodity?.trend || 'N/A'} | ${commodity?.highlights?.join('; ') || '稳定'}`,
    `- 海运运费: ${freight?.trend || 'N/A'} · $${freight?.avgRate || 0}/40GP 均价 (${freight?.routeCount || 0} 航线)`,
    ``,
    `### 📦 运营`,
    `- 库存告急: ${criticalInv.length} SKU`,
    `- 运输延迟: ${delayed.length} 票`,
    `- 本周召回: ${cpsc.length} 条`,
    `- 供应商 TOP3: ${topSuppliers.map((s: any) => `${s.name}(${s.rating})`).join(', ')}`,
    ``,
    `### 💰 财务影响`,
    `- 预估月风险损失: $${totalLoss.toLocaleString()}`,
    `- 受影响节点: ${affectedNodes}/${totalNodes}`,
    ``,
    `---`,
    `生成时间: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
  ];

  return NextResponse.json({
    healthScore,
    riskScore,
    subScores,
    recommendations,
    sections: { cascade, commodity, freight, fx, carbon, scfis, cpsc, criticalInv, delayed, topSuppliers, recentEvents },
    text: briefLines.join('\n'),
    textHtml: briefLines.map(l =>
      l.startsWith('##') ? `<h2>${l.slice(3)}</h2>`
      : l.startsWith('###') ? `<h3>${l.slice(4)}</h3>`
      : l.startsWith('-') ? `<li>${l.slice(2)}</li>`
      : l.startsWith('**') ? `<p><strong>${l.replace(/\*\*/g, '')}</strong></p>`
      : l === '---' ? '<hr/>'
      : l ? `<p>${l}</p>` : '<br/>'
    ).join('\n'),
  });
}

export const GET = withErrorHandler(handler);
