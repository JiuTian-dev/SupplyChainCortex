/**
 * Financial market indices — Alpha Vantage (free tier, 25 req/day).
 *
 * Cache-first: stores results in memory with 30-min TTL to stay within rate limits.
 *
 * Indices:
 *   ^IXIC   — NASDAQ Composite
 *   QQQ     — Invesco QQQ Trust (NASDAQ-100 proxy)
 *   SPY     — SPDR S&P 500 ETF
 *   SMH     — VanEck Semiconductor ETF (chip sector, supply chain relevant)
 */

const API_KEY = () => process.env.ALPHA_VANTAGE_API_KEY || '';
const BASE = 'https://www.alphavantage.co/query';

interface QuoteResult {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  latestTradingDay: string;
  previousClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

interface IndexResult {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  latestTradingDay: string;
}

interface CacheEntry { data: IndexResult[]; ts: number; }
let cache: CacheEntry | null = null;
const TTL = 30 * 60 * 1000; // 30 min

const INDICES = [
  { symbol: 'QQQ', name: '纳斯达克100 (QQQ)' },
  { symbol: 'SPY', name: '标普500 (SPY)' },
  { symbol: 'SMH', name: '半导体指数 (SMH)' },
  { symbol: '^IXIC', name: '纳斯达克综合指数' },
];

async function fetchQuote(symbol: string): Promise<QuoteResult | null> {
  const key = API_KEY();
  if (!key) return null;
  try {
    const url = `${BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const json = await res.json() as Record<string, unknown>;
    const quote = json['Global Quote'] as Record<string, string> | undefined;
    if (!quote || !quote['05. price']) return null;
    return {
      symbol,
      price: parseFloat(quote['05. price']),
      change: parseFloat(quote['09. change']),
      changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
      latestTradingDay: quote['07. latest trading day'],
      previousClose: parseFloat(quote['08. previous close']),
      open: parseFloat(quote['02. open']),
      high: parseFloat(quote['03. high']),
      low: parseFloat(quote['04. low']),
      volume: parseInt(quote['06. volume'], 10),
    };
  } catch { return null; }
}

export async function queryFinancialIndices(symbols?: string[]): Promise<IndexResult[]> {
  // Cache check
  if (cache && Date.now() - cache.ts < TTL) {
    if (!symbols) return cache.data;
    return cache.data.filter(i => symbols.includes(i.symbol));
  }

  const targets = symbols
    ? INDICES.filter(i => symbols.includes(i.symbol))
    : INDICES;

  const results: IndexResult[] = [];
  for (const idx of targets) {
    const q = await fetchQuote(idx.symbol);
    if (q) {
      results.push({
        symbol: idx.symbol,
        name: idx.name,
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        previousClose: q.previousClose,
        latestTradingDay: q.latestTradingDay,
      });
    }
  }

  if (results.length > 0) cache = { data: results, ts: Date.now() };
  return results;
}

/** Brief text summary for LLM context injection */
export function formatIndexSummary(results: IndexResult[]): string {
  if (results.length === 0) return '金融指数数据不可用（API 限流或网络异常）';
  return results.map(r =>
    `${r.name}: $${r.price.toFixed(2)} | ${r.change >= 0 ? '+' : ''}${r.change.toFixed(2)} (${r.changePercent >= 0 ? '+' : ''}${r.changePercent.toFixed(2)}%) | 前收 $${r.previousClose.toFixed(2)}`
  ).join('\n');
}
