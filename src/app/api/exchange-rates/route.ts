/**
 * Exchange Rates API — Frankfurter API real-time data
 * GET /api/exchange-rates           → latest CNY rates (USD, EUR, GBP, JPY, KRW)
 * GET /api/exchange-rates?action=all → all 12 currencies (live + static fallback)
 * GET /api/exchange-rates?base=USD  → rates from USD base
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, AppError } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { getLatestRates, getRateHistory } from '@/lib/queries/exchange-rate.queries';
import { getExchangeRates, getExchangeRate } from '@/lib/exchange-rate';

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'latest';
  const base = searchParams.get('base') || 'CNY';
  const target = searchParams.get('target');
  const days = parseInt(searchParams.get('days') || '90');

  switch (action) {
    case 'latest': {
      try {
        const liveData = await getLatestRates(base);
        return NextResponse.json({
          source: 'frankfurter',
          ...liveData,
        });
      } catch {
        // Fallback to static data
        const staticData = getExchangeRates();
        return NextResponse.json({
          source: 'static-fallback',
          baseCurrency: 'CNY',
          rates: staticData.rates.reduce((acc, r) => {
            acc[r.code] = r.rate;
            return acc;
          }, {} as Record<string, number>),
          timestamp: new Date(staticData.timestamp).toISOString(),
          trend: {},
        });
      }
    }

    case 'all': {
      // Try Frankfurter for core rates, use static for the rest
      let liveRates: Record<string, number> = {};
      let source = 'static';
      try {
        const live = await getLatestRates('CNY');
        liveRates = live.rates;
        source = 'hybrid';
      } catch { /* use static */ }

      const allRates = getExchangeRates();
      const enriched = allRates.rates.map(r => {
        // Frankfurter returns CNY→Target rate; we need Target→CNY (1 unit = ? CNY)
        const liveRate = liveRates[r.code];
        const displayRate = liveRate ? Math.round((1 / liveRate) * 10000) / 10000 : r.rate;
        return {
          ...r,
          rate: displayRate,
          source: liveRate ? 'frankfurter' : 'static',
        };
      });

      return NextResponse.json({
        source,
        rates: enriched,
        baseCurrency: 'CNY',
        timestamp: new Date().toISOString(),
      });
    }

    case 'history': {
      if (!target) throw new AppError('history 模式需要 target 参数', 422);
      try {
        const data = await getRateHistory(base, target, days);
        return NextResponse.json({ source: 'frankfurter', base, target, history: data });
      } catch {
        throw new AppError('获取历史汇率失败，Frankfurter API 不可用', 502);
      }
    }

    case 'single': {
      if (!target) throw new AppError('single 模式需要 target 参数 (e.g. USD)', 422);
      const rate = getExchangeRate(target);
      if (!rate) throw new AppError(`不支持的货币: ${target}`, 404);

      // Try live rate
      try {
        const live = await getLatestRates('CNY');
        if (live.rates[target]) {
          return NextResponse.json({
            code: target,
            rate: live.rates[target],
            source: 'frankfurter',
            timestamp: live.timestamp,
          });
        }
      } catch { /* fallback */ }

      return NextResponse.json({
        code: target,
        rate: rate.rate,
        source: 'static',
        timestamp: new Date().toISOString(),
      });
    }

    default:
      throw new AppError(`未知操作: ${action}`, 400);
  }
}));
