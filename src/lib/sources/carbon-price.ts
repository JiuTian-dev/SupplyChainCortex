/**
 * EU Carbon Price — EU ETS Allowance (EUA) futures
 *
 * 家电出口欧洲需缴纳 CBAM 碳关税，碳价直接影响出口成本。
 * EUA 期货在 ICE Europe 交易，通过新浪全球期货行情接口获取。
 *
 * Symbol: hf_EUA
 *
 * Free, compliant — public exchange data, no key required.
 */

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface CarbonPrice {
  date: string;
  price: number; // EUR/tonne CO2
  prevClose: number;
  changePct: number;
  high: number;
  low: number;
  source: string;
}

// ─── Sina hf_ global futures format ──────────────────────────────────────────────

/**
 * Sina 全球期货 hf_ 格式 field mapping:
 * [0]=最新价, [1]=(empty), [2]=买价, [3]=卖价,
 * [4]=最高价, [5]=最低价, [6]=时间, [7]=开盘价,
 * [8]=昨收, [9]=?, [10]=?, [11]=?,
 * [12]=日期, [13]=名称(GBK), [14]=?
 */
const HF_PRICE = 0;
const HF_PREV_CLOSE = 8;
const HF_HIGH = 4;
const HF_LOW = 5;
const HF_DATE = 12;
const HF_NAME = 13;

const EUA_SYMBOL = 'EUA';

async function fetchSinaGlobalFutures(symbol: string): Promise<string | null> {
  try {
    const url = `https://hq.sinajs.cn/list=hf_${symbol}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Referer: 'https://finance.sina.com.cn' },
    });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    return new TextDecoder('gbk').decode(buffer);
  } catch {
    return null;
  }
}

export async function fetchCarbonPrice(): Promise<CarbonPrice | null> {
  try {
    const raw = await fetchSinaGlobalFutures(EUA_SYMBOL);
    if (!raw) return null;

    const match = raw.match(/"([^"]+)"/);
    if (!match) return null;
    const fields = match[1].split(',');
    if (fields.length < 13) return null;

    const price = parseFloat(fields[HF_PRICE]);
    const prevClose = parseFloat(fields[HF_PREV_CLOSE]);
    if (isNaN(price) || price <= 0) return null;
    // EUA carbon reasonable range: €20–€200/tonne
    if (price < 20 || price > 200) return null;

    const date = fields[HF_DATE] || new Date().toISOString().split('T')[0];
    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

    return {
      date,
      price: Math.round(price * 100) / 100,
      prevClose: Math.round(prevClose * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      high: parseFloat(fields[HF_HIGH]) || price,
      low: parseFloat(fields[HF_LOW]) || price,
      source: 'ICE/Sina',
    };
  } catch {
    return null;
  }
}

/**
 * Estimate CBAM cost impact for a shipment to EU.
 * @param carbonPrice EUR/tonne CO2
 * @param productWeightKg weight of one unit in kg
 * @param co2PerKg estimated CO2 emissions per kg of product (default 2.5 for small appliances)
 * @returns additional cost in EUR per unit
 */
export function estimateCBAMCost(
  carbonPrice: number,
  productWeightKg: number,
  co2PerKg: number = 2.5
): number {
  const tonnesCo2 = (productWeightKg * co2PerKg) / 1000;
  return Math.round(carbonPrice * tonnesCo2 * 100) / 100;
}
