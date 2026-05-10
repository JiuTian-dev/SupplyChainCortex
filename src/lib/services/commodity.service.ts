/**
 * Commodity Price Service — raw material prices for small appliance manufacturing.
 *
 * Key materials: Copper (motors/wiring), Aluminum (housings), Steel (frames),
 *                Plastic resin (housings), Silicon steel (motor laminations)
 *
 * Data source priority:
 *   1. commodities-api.com (free tier: 1000 req/month, set COMMODITIES_API_KEY in .env)
 *   2. DB CostRecord trend — real-time BOM cost change detection
 *   3. Static baseline — 2026 Q1 global averages
 */

import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface CommodityPrice {
  name: string;
  code: string;
  price: number;
  unit: string;
  changePct: number;
  source: 'api' | 'db' | 'static';
  updatedAt: string;
}

export interface CommodityReport {
  commodities: CommodityPrice[];
  overallTrend: 'rising' | 'falling' | 'stable';
  avgChangePct: number;
  affectedMaterials: string[];
  source: string;
  updatedAt: string;
}

// ─── Static Baseline (USD/metric ton, 2026 Q1) ──────────────────────────────────

const BASELINE: Record<string, { price: number; name: string; unit: string }> = {
  COPPER:    { price: 8950, name: '铜 (Cu)',          unit: 'USD/吨' },
  ALUMINUM:  { price: 2450, name: '铝 (Al)',          unit: 'USD/吨' },
  STEEL_HRC: { price: 720,  name: '热轧钢卷 (HRC)',    unit: 'USD/吨' },
  PLASTIC:   { price: 1150, name: 'ABS 塑料粒子',      unit: 'USD/吨' },
};

// Commodities-API.com symbol mapping
const API_SYMBOLS: Record<string, string> = {
  COPPER:   'XCU',
  ALUMINUM: 'XAL',
};

// ─── Price Fetch ────────────────────────────────────────────────────────────────

async function fetchFromCommoditiesAPI(): Promise<CommodityPrice[] | null> {
  const apiKey = process.env.COMMODITIES_API_KEY;
  if (!apiKey) return null;

  try {
    const symbols = Object.values(API_SYMBOLS).join(',');
    const url = `https://commodities-api.com/api/latest?access_key=${apiKey}&base=USD&symbols=${symbols}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json() as {
      success: boolean;
      data?: { rates?: Record<string, number> };
    };
    if (!data.success || !data.data?.rates) return null;

    const prices: CommodityPrice[] = [];
    for (const [code, apiSymbol] of Object.entries(API_SYMBOLS)) {
      const baseline = BASELINE[code];
      if (!baseline) continue;
      const price = data.data.rates[apiSymbol];
      if (typeof price !== 'number') continue;
      const changePct = baseline.price > 0 ? ((price - baseline.price) / baseline.price) * 100 : 0;
      prices.push({
        name: baseline.name,
        code,
        price: Math.round(price * 100) / 100,
        unit: baseline.unit,
        changePct: Math.round(changePct * 10) / 10,
        source: 'api',
        updatedAt: new Date().toISOString(),
      });
    }
    return prices.length > 0 ? prices : null;
  } catch {
    return null;
  }
}

async function fetchFromDB(): Promise<CommodityPrice[]> {
  const costs = await db.costRecord.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 30,
  });

  if (costs.length < 2) return [];

  const recent = costs.slice(0, 10);
  const older = costs.slice(-10);
  const recentAvg = recent.reduce((s, c) => s + c.rawMaterial, 0) / recent.length;
  const olderAvg = older.reduce((s, c) => s + c.rawMaterial, 0) / older.length;
  const changePct = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

  return [{
    name: '原材料 (BOM加权)',
    code: 'BOM_WEIGHTED',
    price: Math.round(recentAvg * 100) / 100,
    unit: '¥/件',
    changePct: Math.round(changePct * 10) / 10,
    source: 'db',
    updatedAt: new Date().toISOString(),
  }];
}

// ─── Main Export ─────────────────────────────────────────────────────────────────

export async function getCommodityPrices(): Promise<CommodityReport> {
  let commodities: CommodityPrice[] = [];

  // Priority 1: commodities-api.com
  const apiPrices = await fetchFromCommoditiesAPI();
  if (apiPrices && apiPrices.length > 0) {
    commodities = apiPrices;
  }

  // Priority 2: DB BOM analysis
  if (commodities.length === 0) {
    try {
      const dbPrices = await fetchFromDB();
      commodities.push(...dbPrices);
    } catch { /* fall through */ }
  }

  // Priority 3: static baseline
  if (commodities.length === 0) {
    for (const [code, info] of Object.entries(BASELINE)) {
      commodities.push({
        name: info.name,
        code,
        price: info.price,
        unit: info.unit,
        changePct: 0,
        source: 'static',
        updatedAt: new Date().toISOString(),
      });
    }
  }

  const changes = commodities.filter(c => Math.abs(c.changePct) > 3);
  const avgChange = commodities.length > 0
    ? commodities.reduce((s, c) => s + c.changePct, 0) / commodities.length
    : 0;

  return {
    commodities,
    overallTrend: avgChange > 3 ? 'rising' : avgChange < -3 ? 'falling' : 'stable',
    avgChangePct: Math.round(avgChange * 10) / 10,
    affectedMaterials: changes.map(c => c.name),
    source: commodities[0]?.source || 'static',
    updatedAt: new Date().toISOString(),
  };
}
