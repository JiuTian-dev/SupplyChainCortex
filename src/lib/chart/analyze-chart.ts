/**
 * analyze_and_chart — Composite tool: query DB → format data → render chart.
 *
 * One call replaces the fragile 3-step chain (query data → format ChartSpec → render).
 * The LLM picks metric + dimension; this module handles everything else.
 */

import { db } from '@/lib/db';
import { renderChart, type ChartSpec } from './renderer';

type Metric = 'grossMargin' | 'turnoverDays' | 'quantity' | 'revenue' | 'totalLanded' | 'delayDays';
type Dimension = 'category' | 'warehouse' | 'platform' | 'category_sub';

const METRIC_LABELS: Record<Metric, string> = {
  grossMargin: '毛利率(%)', turnoverDays: '周转天数', quantity: '库存数量',
  revenue: '销售额($)', totalLanded: '到岸成本($)', delayDays: '延误天数',
};

const DIMENSION_LABELS: Record<Dimension, string> = {
  category: '品类', warehouse: '仓库', platform: '销售平台', category_sub: '子品类',
};

export async function analyzeAndChart(params: {
  metric: Metric;
  dimension?: Dimension;
  chartType?: 'bar' | 'pie';
  title?: string;
}): Promise<{ url: string; title: string; summary: string }> {
  const { metric, dimension = 'category', chartType = 'bar', title } = params;

  // ── 1. Query DB ──────────────────────────────────────────────────────────
  const categories: string[] = [];
  const values: number[] = [];
  let summary = '';

  if (dimension === 'category') {
    const rows = await db.costRecord.groupBy({
      by: ['productId'],
      _avg: { grossMargin: true },
      _sum: { totalLanded: true },
    });
    const invRows = await db.inventory.findMany({ select: { productId: true, quantity: true, turnoverDays: true } });
    const prodRows = await db.product.findMany({ select: { id: true, category: true, subCategory: true } });

    // Group by category
    const catMap = new Map<string, number[]>();
    for (const c of rows) {
      const prod = prodRows.find(p => p.id === c.productId);
      const cat = prod?.category || '未分类';
      if (!catMap.has(cat)) catMap.set(cat, []);
      const inv = invRows.find(i => i.productId === c.productId);
      let val = 0;
      if (metric === 'grossMargin') val = c._avg.grossMargin || 0;
      else if (metric === 'turnoverDays') val = inv?.turnoverDays || 0;
      else if (metric === 'quantity') val = inv?.quantity || 0;
      else if (metric === 'totalLanded') val = c._sum.totalLanded || 0;
      catMap.get(cat)!.push(val);
    }
    for (const [cat, vals] of catMap) {
      categories.push(cat);
      values.push(Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10);
    }
    summary = `${categories.length} 个品类，平均 ${METRIC_LABELS[metric]} 为 ${Math.round(values.reduce((a,b)=>a+b,0)/values.length*10)/10}`;
  } else if (dimension === 'warehouse') {
    const rows = await db.inventory.groupBy({
      by: ['warehouse'],
      _sum: { quantity: true },
      _avg: { turnoverDays: true },
    });
    for (const r of rows) {
      categories.push(r.warehouse);
      if (metric === 'quantity') values.push(r._sum.quantity || 0);
      else if (metric === 'turnoverDays') values.push(Math.round((r._avg.turnoverDays || 0) * 10) / 10);
      else values.push(0);
    }
    summary = `${categories.length} 个仓库`;
  } else if (dimension === 'platform') {
    const rows = await db.salesRecord.groupBy({
      by: ['platform'],
      _sum: { revenue: true },
      _count: true,
    });
    for (const r of rows) {
      categories.push(r.platform);
      if (metric === 'revenue') values.push(Math.round((r._sum.revenue || 0) * 100) / 100);
      else values.push(r._count);
    }
    summary = `${categories.length} 个平台`;
  } else if (dimension === 'category_sub') {
    const prodRows = await db.product.findMany({ select: { id: true, subCategory: true, category: true } });
    const invRows = await db.inventory.findMany({ select: { productId: true, quantity: true } });
    const subMap = new Map<string, number[]>();
    for (const p of prodRows) {
      const sub = `${p.category}/${p.subCategory}`;
      if (!subMap.has(sub)) subMap.set(sub, []);
      const inv = invRows.find(i => i.productId === p.id);
      subMap.get(sub)!.push(metric === 'quantity' ? (inv?.quantity || 0) : 0);
    }
    const sorted = [...subMap.entries()].sort((a, b) => b[1].reduce((s,v)=>s+v,0) - a[1].reduce((s,v)=>s+v,0)).slice(0, 12);
    for (const [sub, vals] of sorted) {
      categories.push(sub);
      values.push(Math.round(vals.reduce((a,b)=>a+b,0) * 10) / 10);
    }
    summary = `Top ${categories.length} 子品类`;
  }

  // ── 2. Render chart ──────────────────────────────────────────────────────
  const chartTitle = title || `${DIMENSION_LABELS[dimension]}${METRIC_LABELS[metric]}${chartType === 'pie' ? '分布' : '对比'}`;
  const spec: ChartSpec = {
    type: chartType,
    title: chartTitle,
    categories: categories.slice(0, 12),
    series: [{ name: METRIC_LABELS[metric], data: values.slice(0, 12) }],
  };
  const result = await renderChart(spec);

  return { url: result.url, title: chartTitle, summary };
}
