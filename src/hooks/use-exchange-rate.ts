'use client';

import { useState, useEffect } from 'react';
import { getExchangeRate, type ExchangeRateEntry } from '@/lib/exchange-rate';

interface LiveRate {
  code: string;
  rate: number;
  source: 'frankfurter' | 'static';
  timestamp: string;
}

/**
 * Hook to get live exchange rate for a currency pair.
 * Fetches from /api/exchange-rates, falls back to static data.
 */
export function useExchangeRate(code: string = 'USD'): {
  rate: ExchangeRateEntry | undefined;
  liveRate: number | null;
  source: 'frankfurter' | 'static';
  isLoading: boolean;
} {
  const staticRate = getExchangeRate(code);
  const [liveRate, setLiveRate] = useState<number | null>(null);
  const [source, setSource] = useState<'frankfurter' | 'static'>('static');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/exchange-rates?action=single&target=${code}`)
      .then(res => res.json())
      .then((data: LiveRate) => {
        if (cancelled) return;
        if (data.rate && data.source === 'frankfurter') {
          setLiveRate(data.rate);
          setSource('frankfurter');
        }
      })
      .catch(() => { /* keep static */ })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [code]);

  return {
    rate: staticRate,
    liveRate,
    source,
    isLoading,
  };
}
