'use client';

import { useState, useCallback, useRef } from 'react';

interface UseErrorRecoveryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  onError?: (error: Error, attempt: number) => void;
  onMaxRetriesReached?: (error: Error) => void;
}

interface UseErrorRecoveryReturn {
  retry: (fn: () => Promise<void>) => Promise<void>;
  isRetrying: boolean;
  attemptCount: number;
  lastError: Error | null;
  reset: () => void;
}

export function useErrorRecovery({
  maxRetries = 3,
  baseDelay = 1000,
  maxDelay = 30000,
  onError,
  onMaxRetriesReached,
}: UseErrorRecoveryOptions = {}): UseErrorRecoveryReturn {
  const [isRetrying, setIsRetrying] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [lastError, setLastError] = useState<Error | null>(null);
  const abortRef = useRef(false);

  const reset = useCallback(() => {
    setIsRetrying(false);
    setAttemptCount(0);
    setLastError(null);
    abortRef.current = true;
  }, []);

  const retry = useCallback(
    async (fn: () => Promise<void>) => {
      abortRef.current = false;
      setIsRetrying(true);
      setAttemptCount(0);
      setLastError(null);

      let lastErr: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (abortRef.current) {
          setIsRetrying(false);
          return;
        }

        try {
          await fn();
          setIsRetrying(false);
          setAttemptCount(attempt);
          setLastError(null);
          return; // success
        } catch (err) {
          lastErr = err instanceof Error ? err : new Error(String(err));
          setLastError(lastErr);
          setAttemptCount(attempt + 1);
          onError?.(lastErr, attempt + 1);

          if (attempt < maxRetries) {
            // Exponential backoff with jitter
            const exponentialDelay = baseDelay * Math.pow(2, attempt);
            const jitter = Math.random() * 0.3 * exponentialDelay;
            const delay = Math.min(exponentialDelay + jitter, maxDelay);

            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // All retries exhausted
      setIsRetrying(false);
      if (lastErr) {
        onMaxRetriesReached?.(lastErr);
      }
    },
    [maxRetries, baseDelay, maxDelay, onError, onMaxRetriesReached]
  );

  return { retry, isRetrying, attemptCount, lastError, reset };
}
