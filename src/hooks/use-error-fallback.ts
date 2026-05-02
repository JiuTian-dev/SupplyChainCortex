/**
 * Hook for graceful API error fallback with retry logic
 */
import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface ErrorFallbackOptions {
  maxRetries?: number;
  retryDelay?: number;
  fallbackValue?: unknown;
  onError?: (error: Error) => void;
  toastMessage?: string;
}

interface ErrorFallbackState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  retryCount: number;
  isUsingFallback: boolean;
  refetch: () => Promise<void>;
}

export function useErrorFallback<T>(
  fetcher: () => Promise<T>,
  options: ErrorFallbackOptions = {}
): ErrorFallbackState<T> {
  const { maxRetries = 2, retryDelay = 1000, fallbackValue = null, onError, toastMessage } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isUsingFallback, setIsUsingFallback] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetcher();
      setData(result);
      setIsUsingFallback(false);
      setRetryCount(0);
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error(String(err));
      setError(fetchError);
      onError?.(fetchError);

      // Auto-retry with exponential backoff
      if (retryCount < maxRetries) {
        const delay = retryDelay * Math.pow(2, retryCount);
        setTimeout(() => {
          setRetryCount((prev) => prev + 1);
          fetchData();
        }, delay);
        return;
      }

      // Use fallback value after max retries
      if (fallbackValue !== null) {
        setData(fallbackValue as T);
        setIsUsingFallback(true);
        if (toastMessage) {
          toast.warning(toastMessage);
        }
      } else {
        toast.error('数据加载失败，请稍后重试');
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetcher, retryCount, maxRetries, retryDelay, fallbackValue, onError, toastMessage]);

  return {
    data,
    error,
    isLoading,
    retryCount,
    isUsingFallback,
    refetch: fetchData,
  };
}
