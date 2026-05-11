/**
 * Exchange Rate Queries — Frankfurter API + PBOC midpoint.
 *
 * Provides:
 *  - Latest CNY→USD/EUR/GBP/JPY/KRW/AUD market rates (Frankfurter, free)
 *  - PBOC central parity / midpoint (ALAPI or BOC scrape, free)
 *  - Historical rates for trend analysis
 *  - Midpoint vs market spread for FX pressure detection
 */

import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { daysAgo } from '@/lib/utils/date';
import { roundTo } from '@/lib/utils/format';
import { getPBOCMidpoints } from '@/lib/sources/pboc-exchange-rate';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface ExchangeRates {
  base: string;
  date: string;
  rates: Record<string, number>;
}

export interface ExchangeRateSnapshot {
  timestamp: string;
  base: string;
  rates: Record<string, number>;
  trend: Record<string, { direction: 'up' | 'down' | 'stable'; change: number }>;
  /** PBOC central parity midpoint — official daily fixing rate */
  midpoints?: Record<string, { midpoint: number; spread: number }>;
}

// ─── Config ──────────────────────────────────────────────────────────────────────

const BASE_URL = 'https://api.frankfurter.app';
const TARGET_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'KRW', 'AUD'];

// ─── Core ────────────────────────────────────────────────────────────────────────

export async function getLatestRates(base = 'CNY'): Promise<ExchangeRateSnapshot> {
  return cachedFetch(
    cacheKey('fx', 'latest', base),
    async () => {
      const url = `${BASE_URL}/latest?from=${base}&to=${TARGET_CURRENCIES.join(',')}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Frankfurter API error: ${res.status}`);
      const data = (await res.json()) as ExchangeRates;

      const histDate = daysAgo(30);
      const trend: Record<string, { direction: 'up' | 'down' | 'stable'; change: number }> = {};

      for (const currency of TARGET_CURRENCIES) {
        try {
          const histUrl = `${BASE_URL}/${histDate}?from=${base}&to=${currency}`;
          const histRes = await fetch(histUrl, { signal: AbortSignal.timeout(5000) });
          if (histRes.ok) {
            const histData = (await histRes.json()) as ExchangeRates;
            const oldRate = histData.rates[currency];
            const newRate = data.rates[currency];
            if (oldRate && newRate) {
              const change = roundTo(((newRate - oldRate) / oldRate) * 100, 1);
              trend[currency] = {
                direction: change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'stable',
                change,
              };
            }
          }
        } catch { /* skip individual currency trend on failure */ }
      }

      // Fetch PBOC midpoints in parallel (not on critical path)
      let midpoints: Record<string, { midpoint: number; spread: number }> | undefined;
      try {
        const pboc = await getPBOCMidpoints();
        if (pboc) {
          midpoints = {};
          for (const mp of pboc.midpoints) {
            const marketRate = data.rates[mp.currency];
            if (marketRate) {
              const perUnitMid = mp.units > 1 ? mp.midpoint / mp.units : mp.midpoint;
              const spread = Math.round(((marketRate - perUnitMid) / perUnitMid) * 10000) / 100;
              midpoints[mp.currency] = { midpoint: perUnitMid, spread };
            }
          }
        }
      } catch { /* midpoints optional */ }

      return { timestamp: data.date, base, rates: data.rates, trend, midpoints };
    },
    CACHE_TTL.MEDIUM
  );
}

export async function getRateHistory(base = 'CNY', target = 'USD', days = 90) {
  return cachedFetch(
    cacheKey('fx', 'history', base, target, days),
    async () => {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = daysAgo(days);
      const url = `${BASE_URL}/${startDate}..${endDate}?from=${base}&to=${target}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Frankfurter API error: ${res.status}`);
      const data = (await res.json()) as { rates: Record<string, Record<string, number>> };
      return Object.entries(data.rates)
        .map(([date, rates]) => ({ date, rate: rates[target] }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    CACHE_TTL.LONG
  );
}

export function convertCurrency(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}
