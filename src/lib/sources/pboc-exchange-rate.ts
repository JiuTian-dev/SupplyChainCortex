/**
 * PBOC Exchange Rate — 中国人民银行中间价
 *
 * 中国人民银行每个工作日上午 9:15 公布人民币对主要外币的中间价。
 * Frankfurter 提供的是市场汇率，与中间价存在偏差。
 *
 * Data sources:
 *   1. ALAPI (alapi.cn) — 免费，需注册获取 token，数据来自外管局
 *   2. Fallback: 爬取中国银行官网牌价
 *
 * Free. Requires ALAPI_TOKEN in .env (register at https://www.alapi.cn).
 */

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface PBOCMidpoint {
  currency: string;
  name: string;
  midpoint: number; // 100 units of foreign currency = X CNY
  units: number; // e.g. JPY is per 100
}

export interface PBOCReport {
  date: string;
  base: 'CNY';
  midpoints: PBOCMidpoint[];
  source: string;
}

// ─── ALAPI ───────────────────────────────────────────────────────────────────────

const ALAPI_BASE = 'https://v3.alapi.cn/api/china_exchange';

const TARGET_PAIRS: { currency: string; from: string; to: string; units: number; name: string }[] = [
  { currency: 'USD', from: 'USD', to: 'CNY', units: 1, name: '美元' },
  { currency: 'EUR', from: 'EUR', to: 'CNY', units: 1, name: '欧元' },
  { currency: 'GBP', from: 'GBP', to: 'CNY', units: 1, name: '英镑' },
  { currency: 'JPY', from: 'JPY', to: 'CNY', units: 100, name: '日元' },
  { currency: 'KRW', from: 'KRW', to: 'CNY', units: 100, name: '韩元' },
  { currency: 'AUD', from: 'AUD', to: 'CNY', units: 1, name: '澳大利亚元' },
];

async function fetchFromALAPI(): Promise<PBOCReport | null> {
  const token = process.env.ALAPI_TOKEN;
  if (!token) return null;

  try {
    const midpoints: PBOCMidpoint[] = [];
    const today = new Date().toISOString().split('T')[0];

    // Sequential calls to respect rate limiting (API returns 429 if too fast)
    for (const pair of TARGET_PAIRS) {
      try {
        const url = `${ALAPI_BASE}?token=${token}&from=${pair.from}&to=${pair.to}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;
        const data = await res.json() as {
          success: boolean;
          code: number;
          data?: { result: number; rate: number; date: string };
        };

        // Rate limited — stop and return what we have
        if (data.code === 429) break;

        if (!data.success || !data.data?.rate) continue;

        const rate = data.data.rate;
        if (rate <= 0) continue;

        // ALAPI returns rate per 1 unit. Convert to standard PBOC quoting:
        // JPY/KRW quoted per 100 units, others per 1 unit
        const midpoint = pair.units > 1 ? rate * pair.units : rate;
        midpoints.push({
          currency: pair.currency,
          name: pair.name,
          midpoint: Math.round(midpoint * 10000) / 10000,
          units: pair.units,
        });

        // Respect rate limit (free tier: ~5 req/min)
        await new Promise(r => setTimeout(r, 1200));
      } catch { continue; }
    }

    if (midpoints.length === 0) return null;

    return { date: today, base: 'CNY', midpoints, source: 'ALAPI (SAFE)' };
  } catch {
    return null;
  }
}

// ─── Bank of China scraping (fallback) ───────────────────────────────────────────

const BOC_URL = 'https://www.boc.cn/sourcedb/whpj/';

async function fetchFromBOC(): Promise<PBOCReport | null> {
  try {
    const res = await fetch(BOC_URL, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // BOC page has a table with columns: 货币名称, 现汇买入价, 现钞买入价, 现汇卖出价, 现钞卖出价, 中行折算价, 发布时间
    // The "中行折算价" (BOC conversion rate) is closest to PBOC midpoint
    const midpoints: PBOCMidpoint[] = [];

    const targetCurrencies = [
      { name: '美元', code: 'USD' },
      { name: '欧元', code: 'EUR' },
      { name: '英镑', code: 'GBP' },
      { name: '日元', code: 'JPY' },
      { name: '韩元', code: 'KRW' },
      { name: '澳大利亚元', code: 'AUD' },
    ];

    for (const { name, code } of targetCurrencies) {
      // Find the row for this currency, extract the 折算价 (last numeric column before date)
      const rowRegex = new RegExp(
        `${name}[^<]*</td>\\s*<td[^>]*>([^<]+)</td>\\s*<td[^>]*>([^<]+)</td>\\s*<td[^>]*>([^<]+)</td>\\s*<td[^>]*>([^<]+)</td>\\s*<td[^>]*>([^<]+)</td>\\s*<td[^>]*>([^<]+)</td>`,
        'i'
      );
      const match = html.match(rowRegex);
      if (match) {
        const midpoint = parseFloat(match[5] || match[6] || '0');
        if (midpoint > 0) {
          midpoints.push({
            currency: code,
            name,
            midpoint: code === 'JPY' || code === 'KRW' ? midpoint : midpoint / 100,
            units: code === 'JPY' || code === 'KRW' ? 100 : 1,
          });
        }
      }
    }

    if (midpoints.length === 0) return null;
    return { date: new Date().toISOString().split('T')[0], base: 'CNY', midpoints, source: 'BOC scrape' };
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function isUsefulCurrency(name: string): boolean {
  const useful = ['美元', '欧元', '英镑', '日元', '韩元', '澳大利亚元', '港币'];
  return useful.some(c => name.includes(c));
}

function nameToCode(name: string): string {
  if (name.includes('美元')) return 'USD';
  if (name.includes('欧元')) return 'EUR';
  if (name.includes('英镑')) return 'GBP';
  if (name.includes('日元')) return 'JPY';
  if (name.includes('韩元')) return 'KRW';
  if (name.includes('澳大利亚')) return 'AUD';
  if (name.includes('港币')) return 'HKD';
  return name.slice(0, 3).toUpperCase();
}

// ─── Main Export ─────────────────────────────────────────────────────────────────

export async function getPBOCMidpoints(): Promise<PBOCReport | null> {
  // Priority 1: ALAPI
  const alapi = await fetchFromALAPI();
  if (alapi) return alapi;

  // Priority 2: BOC scrape
  const boc = await fetchFromBOC();
  if (boc) return boc;

  return null;
}

/**
 * Calculate spread between PBOC midpoint and market rate (Frankfurter).
 * Positive spread = market is weaker than official rate (CNY depreciation pressure).
 */
export function midpointSpread(midpoint: number, marketRate: number, units = 1): number {
  // midpoint per 1 CNY to foreign, marketRate per 1 CNY to foreign
  const mid = units > 1 ? midpoint / units : midpoint;
  return Math.round(((marketRate - mid) / mid) * 10000) / 100; // percentage points * 100 = bps
}
