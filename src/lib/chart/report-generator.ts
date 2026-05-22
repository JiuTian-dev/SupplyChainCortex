/**
 * Report Generator — batch chart generation for common report types.
 * One call produces 2-5 charts with analysis summaries.
 */

import { db } from '@/lib/db';
import { renderCharts, type ChartSpec } from './renderer';

type ReportType = 'inventory_health' | 'cost_analysis' | 'sales_overview' | 'full_health';

interface ReportChart {
  url: string;
  title: string;
  description: string;
}

interface Report {
  title: string;
  charts: ReportChart[];
  summary: string;
}

export async function generateReport(type: ReportType): Promise<Report> {
  switch (type) {
    case 'inventory_health': return inventoryHealthReport();
    case 'cost_analysis': return costAnalysisReport();
    case 'sales_overview': return salesOverviewReport();
    case 'full_health': return fullHealthReport();
    default: return inventoryHealthReport();
  }
}

async function inventoryHealthReport(): Promise<Report> {
  const inv = await db.inventory.findMany({ select: { warehouse: true, stockStatus: true, quantity: true, turnoverDays: true } });
  const prods = await db.product.findMany({ select: { id: true, category: true } });

  // Chart 1: Stock status distribution (pie)
  const statusDist: Record<string, number> = {};
  for (const i of inv) {
    statusDist[i.stockStatus] = (statusDist[i.stockStatus] || 0) + 1;
  }
  const specs: ChartSpec[] = [{
    type: 'pie', title: '库存状态分布',
    categories: Object.keys(statusDist),
    series: [{ name: 'SKU数', data: Object.values(statusDist) }],
  }];

  // Chart 2: Warehouse quantity (bar)
  const whMap = new Map<string, number>();
  for (const i of inv) whMap.set(i.warehouse, (whMap.get(i.warehouse) || 0) + i.quantity);
  specs.push({
    type: 'bar', title: '各仓库库存总量',
    categories: [...whMap.keys()],
    series: [{ name: '库存量', data: [...whMap.values()] }],
  });

  const results = await renderCharts(specs);
  const c1 = Object.entries(statusDist).map(([k,v]) => `${k}:${v}项`).join(', ');
  return {
    title: '库存健康报告',
    charts: [
      { url: results[0].url, title: specs[0].title, description: `状态分布: ${c1}` },
      { url: results[1].url, title: specs[1].title, description: `${whMap.size}个仓库总览` },
    ],
    summary: `${inv.length}个SKU，${Object.values(statusDist).reduce((a,b)=>a+b,0)}个库存记录`,
  };
}

async function costAnalysisReport(): Promise<Report> {
  const costs = await db.costRecord.findMany({ select: { productId: true, grossMargin: true, totalLanded: true, sellingPrice: true } });
  const prods = await db.product.findMany({ select: { id: true, category: true } });

  // Category margin
  const catMap = new Map<string, number[]>();
  for (const c of costs) {
    const prod = prods.find(p => p.id === c.productId);
    const cat = prod?.category || '未分类';
    if (!catMap.has(cat)) catMap.set(cat, []);
    catMap.get(cat)!.push(c.grossMargin);
  }
  const cats = [...catMap.keys()];
  const avgMargins = cats.map(c => Math.round(catMap.get(c)!.reduce((a,b)=>a+b,0)/catMap.get(c)!.length*10)/10);

  // Margin distribution
  const bucketLabels = ['<30%','30-40%','40-50%','50-60%','≥60%'];
  const buckets = [0,0,0,0,0];
  for (const c of costs) {
    if (c.grossMargin<30) buckets[0]++;
    else if (c.grossMargin<40) buckets[1]++;
    else if (c.grossMargin<50) buckets[2]++;
    else if (c.grossMargin<60) buckets[3]++;
    else buckets[4]++;
  }

  const specs: ChartSpec[] = [
    { type: 'bar', title: '品类平均毛利率', categories: cats, series: [{ name: '毛利率(%)', data: avgMargins }] },
    { type: 'pie', title: '毛利率区间分布', categories: bucketLabels, series: [{ name: '产品数', data: buckets }] },
  ];
  const results = await renderCharts(specs);
  const avgAll = Math.round(costs.reduce((s,c)=>s+c.grossMargin,0)/costs.length*10)/10;
  return {
    title: '成本分析报告',
    charts: [
      { url: results[0].url, title: specs[0].title, description: `${cats.length}个品类，平均${avgAll}%` },
      { url: results[1].url, title: specs[1].title, description: `${costs.filter(c=>c.grossMargin<40).length}个产品低于40%` },
    ],
    summary: `${costs.length}个产品，整体平均毛利率${avgAll}%`,
  };
}

async function salesOverviewReport(): Promise<Report> {
  const sales = await db.salesRecord.groupBy({ by: ['platform'], _sum: { revenue: true }, _count: true });
  const prods = await db.product.findMany({ select: { category: true } });

  const specs: ChartSpec[] = [
    {
      type: 'pie', title: '平台销售额占比',
      categories: sales.map(s => s.platform),
      series: [{ name: '销售额', data: sales.map(s => Math.round((s._sum.revenue||0)*100)/100) }],
    },
    {
      type: 'bar', title: '各平台订单量',
      categories: sales.map(s => s.platform),
      series: [{ name: '订单数', data: sales.map(s => s._count) }],
    },
  ];
  const results = await renderCharts(specs);
  const totalOrders = sales.reduce((s,r)=>s+r._count,0);
  return {
    title: '销售概览报告',
    charts: [
      { url: results[0].url, title: specs[0].title, description: `${sales.length}个平台` },
      { url: results[1].url, title: specs[1].title, description: `总计${totalOrders}笔订单` },
    ],
    summary: `${prods.length}个品类，${sales.length}个销售平台，共${totalOrders}笔订单`,
  };
}

async function fullHealthReport(): Promise<Report> {
  const [inv, cost, ship] = await Promise.all([
    inventoryHealthReport(),
    costAnalysisReport(),
    salesOverviewReport(),
  ]);
  return {
    title: '供应链综合健康报告',
    charts: [...inv.charts, ...cost.charts, ...ship.charts],
    summary: [
      `库存: ${inv.summary}`,
      `成本: ${cost.summary}`,
      `销售: ${ship.summary}`,
    ].join('\n'),
  };
}
