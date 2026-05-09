'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { WifiOff, Wifi, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type BannerState = 'hidden' | 'offline' | 'reconnecting' | 'back-online';

export function OfflineBanner() {
  // Initialize from navigator.onLine lazily to avoid SSR issues and effect setState
  const [bannerState, setBannerState] = useState<BannerState>(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline';
    return 'hidden';
  });
  const [dismissed, setDismissed] = useState(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevOnlineRef = useRef(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
  }, []);

  // Handle online/offline transitions via event listeners
  useEffect(() => {
    const handleOffline = () => {
      clearTimers();
      setDismissed(false);
      setBannerState('offline');
      // After 2 seconds show reconnecting animation
      reconnectTimerRef.current = setTimeout(() => {
        setBannerState('reconnecting');
      }, 2000);
      prevOnlineRef.current = false;
    };

    const handleOnline = () => {
      clearTimers();
      if (prevOnlineRef.current === false) {
        // Came back online
        setBannerState('back-online');
        autoDismissTimerRef.current = setTimeout(() => {
          setBannerState('hidden');
        }, 3000);
      }
      prevOnlineRef.current = true;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimers();
    };
  }, [clearTimers]);

  // Start reconnect timer if initially offline (bannerState already set via lazy init)
  useEffect(() => {
    if (bannerState === 'offline') {
      reconnectTimerRef.current = setTimeout(() => {
        setBannerState('reconnecting');
      }, 2000);
      return () => {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      };
    }
  }, [bannerState]);

  const handleDismiss = () => {
    setDismissed(true);
    setBannerState('hidden');
    clearTimers();
  };

  if (bannerState === 'hidden' || dismissed) {
    return null;
  }

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ease-in-out translate-y-0 opacity-100`}
    >
      <div
        className={`px-4 py-2.5 flex items-center justify-between gap-3 text-sm shadow-lg ${
          bannerState === 'back-online'
            ? 'bg-emerald-600 dark:bg-emerald-700 text-white'
            : 'bg-amber-600 dark:bg-amber-700 text-white'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {bannerState === 'back-online' ? (
            <>
              <Wifi className="h-4 w-4 flex-shrink-0" />
              <span className="font-medium">已恢复连接</span>
            </>
          ) : bannerState === 'reconnecting' ? (
            <>
              <WifiOff className="h-4 w-4 flex-shrink-0 animate-pulse" />
              <span className="font-medium">重新连接中...</span>
              <span className="inline-flex gap-0.5">
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
              </span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 flex-shrink-0" />
              <span className="font-medium">网络连接已断开，部分功能可能不可用</span>
            </>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-white/80 hover:text-white hover:bg-white/20 flex-shrink-0"
          onClick={handleDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
