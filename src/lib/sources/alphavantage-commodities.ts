/**
 * Alpha Vantage Commodities — daily copper & aluminum prices.
 *
 * Alpha Vantage free tier: 25 requests/day, 5 requests/min.
 * Register at https://www.alphavantage.co/support/#api-key
 * Set ALPHA_VANTAGE_API_KEY in .env
 *
 * Steel rebar: scraped from Sina Finance SHFE futures (free, no key).
 *
 * Priority in commodity.service.ts:
 *   Alpha Vantage daily → FRED monthly → DB BOM → static baseline
 */

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface DailyCommodityPrice {
  code: string; // COPPER, ALUMINUM, STEEL_HRC
  name: string;
  price: number;
  unit: string;
  date: string; // YYYY-MM-DD
  changePct: number; // day-over-day
  source: string;
}

// ─── Alpha Vantage ───────────────────────────────────────────────────────────────

const AV_BASE = 'https://www.alphavantage.co/query';

const AV_SYMBOLS: Record<string, { function: string; name: string; unit: string; priceKey: string }> = {
  COPPER:   { function: 'COPPER',   name: '铜 (Cu)',       unit: 'USD/吨', priceKey: 'value' },
  ALUMINUM: { function: 'ALUMINUM', name: '铝 (Al)',       unit: 'USD/吨', priceKey: 'value' },
};

async function fetchAVCommodity(
  code: string,
  config: (typeof AV_SYMBOLS)[keyof typeof AV_SYMBOLS]
): Promise<DailyCommodityPrice | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `${AV_BASE}?function=${config.function}&interval=daily&apikey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json() as {
      data?: Array<{ date: string; value: string }>;
      Information?: string; // rate limit message
    };

    if (data.Information || !data.data?.length) return null;

    // Latest entry
    const latest = data.data[0];
    const price = parseFloat(latest.value);
    if (isNaN(price) || price <= 0) return null;

    // Day-over-day change
    const prev = data.data[1];
    const prevPrice = prev ? parseFloat(prev.value) : price;
    const changePct = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;

    return {
      code,
      name: config.name,
      price: Math.round(price * 100) / 100,
      unit: config.unit,
      date: latest.date,
      changePct: Math.round(changePct * 10) / 10,
      source: 'Alpha Vantage',
    };
  } catch {
    return null;
  }
}

// ─── SHFE Steel Rebar Futures (via Sina Finance) ─────────────────────────────────

/**
 * Sina Finance provides free futures quotes in GBK-encoded JSONP.
 * SHFE rebar main contract: RB2610 (most active).
 * Response: var hq_str_RB2610="螺纹钢2610,开盘,昨收,最高,最低,最新,买价,卖价,..."
 * Returns price in CNY/tonne.
 */
async function fetchSteelRebarSHFE(): Promise<DailyCommodityPrice | null> {
  try {
    // Try main contracts — fall through until one works
    const symbols = ['RB2610', 'RB2605', 'RB2601', 'RB0'];
    let result: DailyCommodityPrice | null = null;

    for (const symbol of symbols) {
      const url = `https://hq.sinajs.cn/list=${symbol}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { Referer: 'https://finance.sina.com.cn' },
      });
      if (!res.ok) continue;

      // Sina uses GBK encoding for Chinese futures
      const buffer = await res.arrayBuffer();
      const text = new TextDecoder('gbk').decode(buffer);

      // Parse: var hq_str_SYMBOL="name,open,prevClose,price,high,low,..."
      const match = text.match(/"([^"]+)"/);
      if (!match) continue;
      const fields = match[1].split(',');
      if (fields.length < 8) continue;

      const name = fields[0];
      // Sina futures field order (index 0-based):
      // 0=name, 1=open, 2=prevClose, 3=price(bid), 4=high, 5=low, 6=ask, 7=volume, 8=turnover
      const price = parseFloat(fields[3]);
      const prevSettle = parseFloat(fields[2]);

      if (isNaN(price) || price <= 0 || price > 100000) continue;

      const changePct = prevSettle > 0 ? ((price - prevSettle) / prevSettle) * 100 : 0;

      // SHFE rebar futures are quoted in CNY/tonne — reasonable range 2000-6000
      if (price < 2000 || price > 6000) continue;

      result = {
        code: 'STEEL_HRC',
        name: `螺纹钢 (${name})`,
        price: Math.round(price * 100) / 100,
        unit: '¥/吨',
        date: new Date().toISOString().split('T')[0],
        changePct: Math.round(changePct * 10) / 10,
        source: 'SHFE/Sina',
      };
      break;
    }

    return result;
  } catch {
    return null;
  }
}

// ─── DCE Plastic Futures (via Sina) ─────────────────────────────────────────────

/**
 * DCE plastics: LLDPE (L), PP (PP), PVC (V) — major raw materials for appliance housings.
 * Format: same as SHFE (nf_ prefix), fields[8]=price, fields[5]=prev settle.
 */
const DCE_PLASTICS: Record<string, { symbol: string; name: string }> = {
  PLASTIC_PP:   { symbol: 'PP2609', name: 'PP 聚丙烯' },
  PLASTIC_LLDPE:{ symbol: 'L2609',  name: 'LLDPE 聚乙烯' },
  PLASTIC_PVC:  { symbol: 'V2609',  name: 'PVC 聚氯乙烯' },
};

async function fetchDCEPlastic(code: string, symbol: string, name: string): Promise<DailyCommodityPrice | null> {
  try {
    const url = `https://hq.sinajs.cn/list=nf_${symbol}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Referer: 'https://finance.sina.com.cn' },
    });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const text = new TextDecoder('gbk').decode(buffer);
    const match = text.match(/"([^"]+)"/);
    if (!match) return null;
    const fields = match[1].split(',');
    if (fields.length < 17) return null;

    const price = parseFloat(fields[8]);
    const prevSettle = parseFloat(fields[5]);
    if (isNaN(price) || price <= 0 || price > 50000) return null;

    const changePct = prevSettle > 0 ? ((price - prevSettle) / prevSettle) * 100 : 0;

    return {
      code,
      name,
      price: Math.round(price * 100) / 100,
      unit: '¥/吨',
      date: fields[17] || new Date().toISOString().split('T')[0],
      changePct: Math.round(changePct * 10) / 10,
      source: 'DCE/Sina',
    };
  } catch {
    return null;
  }
}

// ─── Main Export ─────────────────────────────────────────────────────────────────

export async function fetchDailyCommodities(): Promise<DailyCommodityPrice[]> {
  const results: DailyCommodityPrice[] = [];

  // Copper & Aluminum — Alpha Vantage
  for (const [code, config] of Object.entries(AV_SYMBOLS)) {
    const price = await fetchAVCommodity(code, config);
    if (price) results.push(price);
  }

  // Steel Rebar — SHFE/Sina
  const steel = await fetchSteelRebarSHFE();
  if (steel) results.push(steel);

  // Plastics — DCE/Sina
  for (const [code, config] of Object.entries(DCE_PLASTICS)) {
    const plastic = await fetchDCEPlastic(code, config.symbol, config.name);
    if (plastic) results.push(plastic);
  }

  return results;
}
