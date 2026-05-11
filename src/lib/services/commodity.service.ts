/**
 * Commodity Price Service — raw material prices for small appliance manufacturing.
 *
 * Key materials: Copper (motors/wiring), Aluminum (housings), Steel (frames),
 *                Plastic resin (housings), Silicon steel (motor laminations)
 *
 * Data source priority:
 *   1. Alpha Vantage — daily copper & aluminum (free 25 req/day)
 *   2. FRED (St. Louis Fed) — monthly copper, aluminum, steel (free)
 *   3. DB CostRecord trend — BOM cost change detection
 *   4. Static baseline — 2026 Q1 global averages
 */

import { db } from '@/lib/db';
import { fetchDailyCommodities } from '@/lib/sources/alphavantage-commodities';

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

// Baseline updated: 2026-05-11 market data (LME/Alphavantage/SHFE)
const BASELINE: Record<string, { price: number; name: string; unit: string }> = {
  COPPER:    { price: 13609, name: '铜 (Cu)',          unit: 'USD/吨' },
  ALUMINUM:  { price: 3518,  name: '铝 (Al)',          unit: 'USD/吨' },
  STEEL_HRC: { price: 698,   name: '热轧钢卷 (HRC)',    unit: 'USD/吨' },
  PLASTIC:   { price: 1150,  name: 'ABS 塑料粒子',      unit: 'USD/吨' },
};

// FRED series mapping
const FRED_SERIES: Record<string, { id: string; baseline: { price: number; name: string; unit: string } }> = {
  COPPER:   { id: 'PCOPPUSDM',   baseline: BASELINE.COPPER },
  ALUMINUM: { id: 'PALUMUSDM',   baseline: BASELINE.ALUMINUM },
  STEEL_HRC:{ id: 'PSTEELUSDM',  baseline: BASELINE.STEEL_HRC },
};

// ─── Price Fetch ────────────────────────────────────────────────────────────────

async function fetchFromFRED(): Promise<CommodityPrice[] | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  try {
    const prices: CommodityPrice[] = [];
    for (const [code, series] of Object.entries(FRED_SERIES)) {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series.id}&api_key=${apiKey}&file_type=json&limit=1&sort_order=desc`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json() as {
        observations?: Array<{ value: string }>;
      };
      const latest = data.observations?.[0];
      if (!latest || latest.value === '.') continue;
      const price = parseFloat(latest.value);
      if (isNaN(price) || price <= 0) continue;

      const changePct = series.baseline.price > 0
        ? ((price - series.baseline.price) / series.baseline.price) * 100
        : 0;

      prices.push({
        name: series.baseline.name,
        code,
        price: Math.round(price * 100) / 100,
        unit: series.baseline.unit,
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
  const apiSources: string[] = [];

  // Priority 1: Alpha Vantage daily prices (copper + aluminum) + SHFE steel
  try {
    const daily = await fetchDailyCommodities();
    if (daily.length > 0) {
      for (const d of daily) {
        commodities.push({
          name: d.name,
          code: d.code,
          price: d.price,
          unit: d.unit,
          changePct: d.changePct,
          source: 'api',
          updatedAt: d.date,
        });
      }
      apiSources.push('alphavantage');
    }
  } catch { /* fall through */ }

  // Priority 2: FRED monthly prices (fill gaps for what Alpha Vantage didn't cover)
  const coveredCodes = new Set(commodities.map(c => c.code));
  try {
    const fredPrices = await fetchFromFRED();
    if (fredPrices) {
      for (const fp of fredPrices) {
        if (!coveredCodes.has(fp.code)) {
          commodities.push(fp);
          apiSources.push('fred');
        }
      }
    }
  } catch { /* fall through */ }

  // Priority 3: DB BOM analysis
  if (commodities.length === 0) {
    try {
      const dbPrices = await fetchFromDB();
      commodities.push(...dbPrices);
    } catch { /* fall through */ }
  }

  // Priority 4: static baseline
  const existingCodes = new Set(commodities.map(c => c.code));
  if (existingCodes.size < Object.keys(BASELINE).length) {
    for (const [code, info] of Object.entries(BASELINE)) {
      if (!existingCodes.has(code)) {
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
    source: apiSources.length > 0 ? apiSources.join('+') : commodities[0]?.source || 'static',
    updatedAt: new Date().toISOString(),
  };
}
