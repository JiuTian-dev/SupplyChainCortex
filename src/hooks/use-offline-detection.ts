'use client';

import { useState, useEffect, useCallback } from 'react';

interface UseOfflineDetectionReturn {
  isOnline: boolean;
  wasOffline: boolean;
  offlineDuration: number;
  lastOnlineAt: Date | null;
}

export function useOfflineDetection(): UseOfflineDetectionReturn {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator !== 'undefined') return navigator.onLine;
    return true;
  });
  const [wasOffline, setWasOffline] = useState(false);
  const [offlineDuration, setOfflineDuration] = useState(0);
  const [lastOnlineAt, setLastOnlineAt] = useState<Date | null>(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine) return new Date();
    return null;
  });
  const [offlineSince, setOfflineSince] = useState<Date | null>(null);

  // Track offline duration with interval
  useEffect(() => {
    if (!isOnline && offlineSince) {
      const interval = setInterval(() => {
        setOfflineDuration(Date.now() - offlineSince.getTime());
      }, 1000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [isOnline, offlineSince]);

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    setWasOffline(true);
    setLastOnlineAt(new Date());
    setOfflineDuration(0);
    setOfflineSince(null);
  }, []);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setWasOffline(true);
    setOfflineSince(new Date());
    setOfflineDuration(0);
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return { isOnline, wasOffline, offlineDuration, lastOnlineAt };
}
