'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDashboardUIStore } from '@/stores/useDashboardUIStore';
import { useConnectionStore } from '@/stores/connection-store';

// Query key prefixes that should be refreshed on the polling cycle.
// Only invalidate data that actually changes frequently — not stable references.
const REFRESH_PREFIXES = [
  'dashboard',
  'inventory',
  'logistics',
  'sales',
  'cost',
  'risk',
  'supply-chain-score',
  'stats',
  'events',
  'notifications',
  'performance',
  'alerts',
  'warehouse',
  'suppliers',
  'procurement',
  'analytics',
  'reports',
  'quality',
  'compliance',
  'exchange-rates',
] as const;

export function useAutoRefresh() {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRefreshing = useDashboardUIStore((s) => s.isRefreshing);
  const setIsRefreshing = useDashboardUIStore((s) => s.setIsRefreshing);
  const setRefreshCountdown = useDashboardUIStore((s) => s.setRefreshCountdown);
  const setLastSyncTime = useDashboardUIStore((s) => s.setLastSyncTime);
  const wsConnected = useConnectionStore((s) => s.wsConnected);

  // When SSE is connected, disable polling entirely
  const interval = wsConnected ? 0 : 60;
  const countdownRef = useRef(interval);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Targeted invalidation by prefix — avoids cache stampede of all queries
      await Promise.all(
        REFRESH_PREFIXES.map(prefix =>
          queryClient.invalidateQueries({ queryKey: [prefix] })
        )
      );
      setLastSyncTime(new Date());
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error('刷新数据失败:', err);
    } finally {
      setIsRefreshing(false);
      countdownRef.current = interval;
      setRefreshCountdown(interval);
    }
  }, [queryClient, setIsRefreshing, setLastSyncTime, setRefreshCountdown, interval]);

  useEffect(() => {
    if (interval <= 0) {
      setRefreshCountdown(0);
      countdownRef.current = 0;
      return;
    }

    countdownRef.current = interval;
    setRefreshCountdown(interval);

    timerRef.current = setInterval(() => {
      countdownRef.current -= 1;
      setRefreshCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        refreshAll();
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [interval, refreshAll, setRefreshCountdown]);

  return {
    countdown: useDashboardUIStore((s) => s.refreshCountdown),
    isRefreshing,
    refreshAll,
  };
}
