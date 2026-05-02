'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/stores/ui-store';
import { useConnectionStore } from '@/stores/connection-store';

// ==================== Auto-Refresh Hook ====================

export function useAutoRefresh() {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRefreshing = useUIStore((s) => s.isRefreshing);
  const setIsRefreshing = useUIStore((s) => s.setIsRefreshing);
  const setRefreshCountdown = useUIStore((s) => s.setRefreshCountdown);
  const setLastSyncTime = useUIStore((s) => s.setLastSyncTime);
  const wsConnected = useConnectionStore((s) => s.wsConnected);

  // When SSE is connected, disable polling entirely (SSE handles real-time updates)
  // Use 0 to indicate no polling needed; the countdown will not trigger refreshAll
  const interval = wsConnected ? 0 : 60;
  const countdownRef = useRef(interval);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries();
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
    // When SSE is connected (interval === 0), skip polling entirely
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
    countdown: useUIStore((s) => s.refreshCountdown),
    isRefreshing,
    refreshAll,
  };
}
