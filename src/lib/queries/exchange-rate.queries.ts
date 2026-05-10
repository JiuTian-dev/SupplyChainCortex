/**
 * Exchange Rate Queries — Frankfurter API (free, no key required).
 * Migrated from services/exchange-rate.service.ts.
 *
 * Provides:
 *  - Latest CNY→USD/EUR/GBP/JPY/KRW rates
 *  - Historical rates for trend analysis
 *  - Currency conversion utility
 */

import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';
import { daysAgo } from '@/lib/utils/date';
import { roundTo } from '@/lib/utils/format';

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

      return { timestamp: data.date, base, rates: data.rates, trend };
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
