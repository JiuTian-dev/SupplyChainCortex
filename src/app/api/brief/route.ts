/**
 * GET /api/brief — Weekly Supply Chain Intelligence Brief
 *
 * Aggregates all data sources into a structured JSON summary.
 * Designed for the ChatPanel /brief command or a weekly brief card.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { db } from '@/lib/db';

async function getCascadeSummary() {
  try {
    const res = await fetch('http://localhost:3000/api/cascade-risk?scenario=auto');
    const data = await res.json();
    const sources = data.sourceNodes || [];
    const categories = new Set(sources.map((s: any) => s.category));
    return {
      affectedNodes: data.summary?.affectedNodes || 0,
      totalNodes: data.summary?.totalNodes || 0,
      maxDepth: data.summary?.maxDepth || 0,
      riskSources: [...categories],
      topRisk: sources[0]?.cause?.slice(0, 60) || '无',
    };
  } catch { return { error: 'unavailable' }; }
}

async function getCommoditySummary() {
  try {
    const res = await fetch('http://localhost:3000/api/commodity');
    const data = await res.json();
    return {
      trend: data.overallTrend || 'stable',
      avgChangePct: data.avgChangePct || 0,
      topMovers: data.affectedMaterials || [],
    };
  } catch { return { error: 'unavailable' }; }
}

async function getFreightSummary() {
  try {
    const res = await fetch('http://localhost:3000/api/freight');
    const data = await res.json();
    return {
      trend: data.trend || 'stable',
      avgRate: data.avgRate40GP || 0,
      routeCount: data.rates?.length || 0,
    };
  } catch { return { error: 'unavailable' }; }
}

async function getInventoryAlerts() {
  try {
    const critical = await db.inventory.findMany({
      where: { stockStatus: 'critical' },
      select: { sku: true, productName: true, quantity: true, safetyStock: true },
      take: 5,
    });
    return critical;
  } catch { return []; }
}

async function getCPSCAlerts() {
  try {
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cpsc = await db.defectRecord.findMany({
      where: { sku: 'CPSC-ALERT', createdAt: { gte: sevenDaysAgo } },
      select: { productName: true, createdAt: true },
      take: 10,
    });
    return cpsc;
  } catch { return []; }
}

export const GET = withErrorHandler(async (_request: NextRequest) => {
  const [cascade, commodity, freight, inventory, cpsc] = await Promise.all([
    getCascadeSummary(),
    getCommoditySummary(),
    getFreightSummary(),
    getInventoryAlerts(),
    getCPSCAlerts(),
  ]);

  // Compute health score from available data
  const totalNodes = (cascade as any)?.totalNodes || 39;
  const affected = (cascade as any)?.affectedNodes || 0;
  const healthScore = Math.round(Math.max(0, Math.min(100,
    100 - (affected / Math.max(totalNodes, 1)) * 30
    - ((commodity as any)?.avgChangePct > 3 ? 10 : 0)
    - ((freight as any)?.trend === 'rising' ? 8 : 0)
    - (inventory as unknown[]).length * 2
  )));

  const briefLines = [
    `## 周度供应链简报`,
    ``,
    `**综合健康分: ${healthScore}/100**`,
    ``,
    `### 风险态势`,
    `- 受影响节点: ${affected}/${totalNodes}`,
    `- 最大传播深度: ${(cascade as any).maxDepth || 0} 层`,
    `- 主要风险: ${(cascade as any).topRisk}`,
    ``,
    `### 成本走势`,
    `- 大宗商品: ${(commodity as any).trend} (${(commodity as any).avgChangePct}%)`,
    `- 运费: ${(freight as any).trend} · $${(freight as any).avgRate}/40GP 均价`,
    ``,
    `### 运营概况`,
    `- 库存告急: ${(inventory as unknown[]).length} SKU`,
    `- 本周 CPSC 召回: ${(cpsc as unknown[]).length} 条`,
    ``,
    `---`,
    `生成时间: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
  ];

  return NextResponse.json({
    healthScore,
    sections: {
      cascade,
      commodity,
      freight,
      inventory,
      cpsc,
    },
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
});
