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
 * Sina Finance provides free futures quotes in JSONP format.
 * SHFE rebar main contract symbol: RB0 (continuous)
 * Returns price in CNY/tonne.
 */
async function fetchSteelRebarSHFE(): Promise<DailyCommodityPrice | null> {
  try {
    // Sina futures API — free, no key
    const url = 'https://hq.sinajs.cn/list=RB0';
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Referer: 'https://finance.sina.com.cn' },
    });
    if (!res.ok) return null;
    const text = await res.text();

    // Parse: var hq_str_RB0="名称,价格,涨跌额,涨跌幅,昨收,..."
    const match = text.match(/"([^"]+)"/);
    if (!match) return null;
    const fields = match[1].split(',');
    if (fields.length < 4) return null;

    const name = fields[0];
    const price = parseFloat(fields[1]); // current/latest price
    const prevSettle = parseFloat(fields[4]); // previous settlement

    if (isNaN(price) || price <= 0) return null;

    const changePct = prevSettle > 0 ? ((price - prevSettle) / prevSettle) * 100 : 0;

    return {
      code: 'STEEL_HRC',
      name: `螺纹钢 (${name})`,
      price: Math.round(price * 100) / 100,
      unit: '¥/吨',
      date: new Date().toISOString().split('T')[0],
      changePct: Math.round(changePct * 10) / 10,
      source: 'SHFE/Sina',
    };
  } catch {
    return null;
  }
}

// ─── Main Export ─────────────────────────────────────────────────────────────────

export async function fetchDailyCommodities(): Promise<DailyCommodityPrice[]> {
  const results: DailyCommodityPrice[] = [];

  // Copper & Aluminum — Alpha Vantage, throttled to 2 requests (well within 5/min limit)
  for (const [code, config] of Object.entries(AV_SYMBOLS)) {
    const price = await fetchAVCommodity(code, config);
    if (price) results.push(price);
  }

  // Steel Rebar — SHFE/Sina (free, no rate limit)
  const steel = await fetchSteelRebarSHFE();
  if (steel) results.push(steel);

  return results;
}
