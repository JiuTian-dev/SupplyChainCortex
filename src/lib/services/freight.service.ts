/**
 * Ocean Freight Rate Service — container shipping rates for key routes.
 *
 * Data sources:
 *   - DB ShipmentItem logistics costs (actual rates from existing shipments)
 *   - Static baseline: Shanghai Containerized Freight Index (SCFI) 2026 Q1
 *   - Fallback: route estimates
 *
 * Free, no API key required. Update baseline quarterly from public SCFI/WCI reports.
 */

import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface FreightRate {
  route: string;
  origin: string;
  destination: string;
  rate40GP: number;      // USD per 40ft container
  rate20GP: number;      // USD per 20ft container
  trend: 'rising' | 'falling' | 'stable';
  changePct: number;     // vs last quarter
  source: 'db' | 'baseline' | 'static';
  updatedAt: string;
}

export interface FreightReport {
  rates: FreightRate[];
  avgRate40GP: number;
  trend: 'rising' | 'falling' | 'stable';
  source: string;
  updatedAt: string;
}

// ─── 2026 Q2 Baseline (SCFI public data, USD/40GP) ──────────────────────────────

const BASELINE_RATES: Record<string, Omit<FreightRate, 'source' | 'updatedAt' | 'trend' | 'changePct'>> = {
  'CN-USWC': {
    route: '上海→洛杉矶/长滩',
    origin: '上海',
    destination: '洛杉矶',
    rate40GP: 2100,
    rate20GP: 1600,
  },
  'CN-USEC': {
    route: '上海→纽约/新泽西',
    origin: '上海',
    destination: '纽约',
    rate40GP: 3200,
    rate20GP: 2400,
  },
  'CN-NEUR': {
    route: '上海→汉堡/鹿特丹',
    origin: '上海',
    destination: '汉堡',
    rate40GP: 2500,
    rate20GP: 1850,
  },
  'CN-UK': {
    route: '深圳→费力克斯托',
    origin: '深圳',
    destination: '费力克斯托',
    rate40GP: 2600,
    rate20GP: 1950,
  },
  'CN-JP': {
    route: '上海→东京/横滨',
    origin: '上海',
    destination: '东京',
    rate40GP: 800,
    rate20GP: 600,
  },
  'CN-AU': {
    route: '深圳→悉尼',
    origin: '深圳',
    destination: '悉尼',
    rate40GP: 1800,
    rate20GP: 1350,
  },
  'CN-KR': {
    route: '上海→釜山',
    origin: '上海',
    destination: '釜山',
    rate40GP: 600,
    rate20GP: 450,
  },
};

// ─── DB-derived rates from actual shipment costs ────────────────────────────────

async function getDBFreightRates(): Promise<FreightRate[]> {
  const shipments = await db.shipmentItem.findMany({
    where: { status: { in: ['delivered', 'in_transit'] } },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });

  if (shipments.length < 3) return [];

  const routeMap = new Map<string, { count: number; totalCost: number }>();
  for (const s of shipments) {
    const key = `${s.origin || '?'}→${s.destination || '?'}`;
    const entry = routeMap.get(key) || { count: 0, totalCost: 0 };
    entry.count++;
    entry.totalCost += (s as unknown as Record<string, number>).freightCost || 0;
    routeMap.set(key, entry);
  }

  const rates: FreightRate[] = [];
  for (const [route, data] of routeMap) {
    if (data.totalCost > 0 && data.count >= 2) {
      const avgCost = data.totalCost / data.count;
      rates.push({
        route,
        origin: route.split('→')[0] || '?',
        destination: route.split('→')[1] || '?',
        rate40GP: Math.round(avgCost * 1.5),
        rate20GP: Math.round(avgCost),
        trend: 'stable',
        changePct: 0,
        source: 'db',
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return rates;
}

// ─── Main Export ─────────────────────────────────────────────────────────────────

export async function getFreightRates(): Promise<FreightReport> {
  const dbRates = await getDBFreightRates();

  // Merge: DB data preferred, fall back to baseline
  const dbRouteKeys = new Set(dbRates.map(r => {
    const match = Object.entries(BASELINE_RATES).find(([, v]) =>
      r.origin.includes(v.origin) || r.destination.includes(v.destination)
    );
    return match?.[0];
  }).filter(Boolean));

  const rates: FreightRate[] = [...dbRates];

  for (const [key, baseline] of Object.entries(BASELINE_RATES)) {
    if (!dbRouteKeys.has(key)) {
      rates.push({
        ...baseline,
        trend: 'stable',
        changePct: 0,
        source: 'baseline',
        updatedAt: new Date().toISOString(),
      });
    }
  }

  const avgRate40GP = rates.length > 0
    ? Math.round(rates.reduce((s, r) => s + r.rate40GP, 0) / rates.length)
    : 0;

  // Determine overall trend
  const risingCount = rates.filter(r => r.trend === 'rising').length;
  const fallingCount = rates.filter(r => r.trend === 'falling').length;

  return {
    rates,
    avgRate40GP,
    trend: risingCount > fallingCount ? 'rising' : fallingCount > risingCount ? 'falling' : 'stable',
    source: dbRates.length > 0 ? 'db+baseline' : 'baseline',
    updatedAt: new Date().toISOString(),
  };
}
