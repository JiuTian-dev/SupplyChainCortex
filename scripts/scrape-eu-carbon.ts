/**
 * EU Carbon Price Updater — EU ETS / CBAM carbon price tracker
 *
 * CBAM (Carbon Border Adjustment Mechanism) pricing is based on weekly average
 * EU-ETS carbon allowance auction prices. This affects Chinese exports of
 * steel, aluminum, and products containing them (small appliance housings, frames).
 *
 * Data sources (priority order):
 *   1. Sina Global Futures (hf_EUA) — ICE EUA futures, real-time, free, 2026-05-15 verified
 *   2. EMBER API (free, no key) — carbon intensity data, unreliable
 *   3. EEX/ICE settlement — static fallback
 *
 * Usage: bun run scripts/scrape-eu-carbon.ts
 */

// ─── Sina Global Futures fetch (same code path as carbon-price.ts) ──────────

const HF_PRICE = 0;
const HF_PREV_CLOSE = 8;
const HF_HIGH = 4;
const HF_LOW = 5;
const HF_DATE = 12;
const HF_NAME = 13;

async function fetchSinaEuaPrice(): Promise<{
  price: number; prevClose: number; changePct: number;
  high: number; low: number; date: string; source: string;
} | null> {
  try {
    const url = 'https://hq.sinajs.cn/list=hf_EUA';
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Referer: 'https://finance.sina.com.cn' },
    });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const raw = new TextDecoder('gbk').decode(buffer);

    const match = raw.match(/"([^"]+)"/);
    if (!match) return null;
    const fields = match[1].split(',');
    if (fields.length < 13) return null;

    const price = parseFloat(fields[HF_PRICE]);
    const prevClose = parseFloat(fields[HF_PREV_CLOSE]);
    if (isNaN(price) || price <= 0) return null;
    if (price < 20 || price > 200) return null; // EUA reasonable range

    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

    return {
      price: Math.round(price * 100) / 100,
      prevClose: Math.round(prevClose * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      high: parseFloat(fields[HF_HIGH]) || price,
      low: parseFloat(fields[HF_LOW]) || price,
      date: fields[HF_DATE] || new Date().toISOString().split('T')[0],
      source: 'ICE/Sina',
    };
  } catch {
    return null;
  }
}

// ─── Fallback sources ──────────────────────────────────────────────────────

const STATIC_BASELINE = {
  priceEUR: 78.50,
  source: 'EEX-EUA-Dec26',
  updatedAt: '2026-05-08',
};

async function tryFetchEmberCarbonPrice(): Promise<number | null> {
  try {
    const res = await fetch('https://api.ember-energy.org/v1/carbon-price/latest', {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'SupplyChainCortex/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json() as { price?: number };
    return data.price || null;
  } catch {
    return null;
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌍 Updating EU-ETS carbon price (CBAM basis)...\n');

  // Priority 1: Sina Global Futures (real-time ICE EUA)
  const sinaData = await fetchSinaEuaPrice();
  if (sinaData) {
    console.log(`  ✓ Sina/ICE EUA: €${sinaData.price}/ton (${sinaData.changePct >= 0 ? '+' : ''}${sinaData.changePct}%)`);
    console.log(`    High: €${sinaData.high} | Low: €${sinaData.low} | PrevClose: €${sinaData.prevClose}`);
    console.log(`    Date: ${sinaData.date} | Source: ${sinaData.source}`);
  } else {
    console.log('  ⚠ Sina/ICE unreachable, trying EMBER...');
  }

  // Priority 2: EMBER API
  let livePrice: number | null = null;
  if (!sinaData) {
    livePrice = await tryFetchEmberCarbonPrice();
    if (livePrice) {
      console.log(`  ✓ EMBER API: €${livePrice}/ton`);
    } else {
      console.log(`  ⚠ EMBER API unreachable, using EEX settlement: €${STATIC_BASELINE.priceEUR}/ton`);
    }
  }

  const price = sinaData?.price || livePrice || STATIC_BASELINE.priceEUR;
  const source = sinaData
    ? `${sinaData.source} (${sinaData.date})`
    : livePrice ? 'EMBER API' : `${STATIC_BASELINE.source} (${STATIC_BASELINE.updatedAt})`;

  console.log(`\n📋 Carbon price: €${price}/ton CO2`);
  console.log(`  Source: ${source}`);

  if (sinaData) {
    const dayDiff = Math.round((Date.now() - new Date(sinaData.date).getTime()) / 86400000);
    console.log(`  Data age: ${dayDiff} day(s) ago`);
  }

  // CBAM impact estimate
  const steelImpact = (price * 0.35).toFixed(0);
  const aluminumImpact = (price * 0.55).toFixed(0);
  console.log(`\n  Estimated CBAM surcharge:`);
  console.log(`    Steel products: ~€${steelImpact}/ton`);
  console.log(`    Aluminum products: ~€${aluminumImpact}/ton`);
  console.log(`    Finished appliance impact: 0.5-1.5% of landed cost`);

  if (price > 80) {
    console.log(`\n  ⚠ Carbon price above €80/ton — CBAM cost impact elevated`);
  }

  console.log('\n✅ EU carbon update complete.');
}

main().catch(console.error);
