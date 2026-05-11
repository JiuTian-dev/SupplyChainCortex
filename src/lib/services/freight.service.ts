/**
 * Ocean Freight Rate Service — container shipping rates for key routes.
 *
 * Data source priority:
 *   1. Live SCFI scrape (weekly, free, from public financial news)
 *   2. DB ShipmentItem logistics costs (actual rates from existing shipments)
 *   3. Static baseline: Shanghai Containerized Freight Index (SCFI) Q2 2026
 *
 * Free, no API key required. Baseline updated quarterly.
 */

import { db } from '@/lib/db';
import { fetchSCFISPrice, scfisToFreightRate } from '@/lib/sources/scfis-futures';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface FreightRate {
  route: string;
  origin: string;
  destination: string;
  rate40GP: number;      // USD per 40ft container
  rate20GP: number;      // USD per 20ft container
  trend: 'rising' | 'falling' | 'stable';
  changePct: number;     // vs last quarter
  source: 'api' | 'db' | 'baseline' | 'static';
  updatedAt: string;
}

export interface FreightReport {
  rates: FreightRate[];
  avgRate40GP: number;
  trend: 'rising' | 'falling' | 'stable';
  source: string;
  updatedAt: string;
}

// ─── 2026 Q2 Baseline (SCFI May 2026 data, USD) ────────────────────────────────

const BASELINE_RATES: Record<string, Omit<FreightRate, 'source' | 'updatedAt' | 'trend' | 'changePct'>> = {
  'CN-USWC': {
    route: '上海→洛杉矶/长滩',
    origin: '上海',
    destination: '洛杉矶',
    rate40GP: 2826,
    rate20GP: 2100,
  },
  'CN-USEC': {
    route: '上海→纽约/新泽西',
    origin: '上海',
    destination: '纽约',
    rate40GP: 3812,
    rate20GP: 2830,
  },
  'CN-NEUR': {
    route: '上海→汉堡/鹿特丹',
    origin: '上海',
    destination: '汉堡',
    rate40GP: 2155,
    rate20GP: 1596,
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
    rate40GP: 428,
    rate20GP: 317,
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
    rate40GP: 235,
    rate20GP: 174,
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
  const rates: FreightRate[] = [];
  const usedRoutes = new Set<string>();
  let primarySource = 'baseline';

  // Priority 1: SCFIS futures (INE, public exchange data, compliant)
  try {
    const scfis = await fetchSCFISPrice();
    if (scfis) {
      const { rateUSD, route } = scfisToFreightRate(scfis.price);
      const scfis20GP = Math.round(rateUSD / 1.35);
      rates.push({
        route,
        origin: '上海',
        destination: '汉堡',
        rate40GP: rateUSD,
        rate20GP: scfis20GP,
        trend: scfis.changePct > 2 ? 'rising' : scfis.changePct < -2 ? 'falling' : 'stable',
        changePct: scfis.changePct,
        source: 'api',
        updatedAt: scfis.date,
      });
      usedRoutes.add('上海' + '汉堡');
      primarySource = 'api';
    }
  } catch { /* fall through */ }

  // Priority 2: DB shipment costs
  try {
    const dbRates = await getDBFreightRates();
    for (const r of dbRates) {
      const key = r.origin + r.destination;
      if (!usedRoutes.has(key)) {
        usedRoutes.add(key);
        rates.push(r);
      }
    }
    if (primarySource === 'baseline' && dbRates.length > 0) {
      primarySource = 'db';
    }
  } catch { /* fall through */ }

  // Priority 3: Static baseline (Q2 2026)
  for (const [key, baseline] of Object.entries(BASELINE_RATES)) {
    const routeKey = baseline.origin + baseline.destination;
    if (!usedRoutes.has(routeKey)) {
      usedRoutes.add(routeKey);
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

  const risingCount = rates.filter(r => r.trend === 'rising').length;
  const fallingCount = rates.filter(r => r.trend === 'falling').length;

  return {
    rates,
    avgRate40GP,
    trend: risingCount > fallingCount ? 'rising' : fallingCount > risingCount ? 'falling' : 'stable',
    source: primarySource,
    updatedAt: new Date().toISOString(),
  };
}
