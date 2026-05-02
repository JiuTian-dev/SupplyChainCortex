/**
 * Engine Resilience Layer — circuit breaker, timeout, retry, fallback.
 *
 * Zero external dependencies. All helpers are synchronous wrappers
 * around async functions. Suitable for Next.js Route Handlers (Edge-ready).
 *
 * Design decisions:
 * - Circuit breaker uses a sliding-window failure counter (not time-based)
 *   to avoid clock-skew issues across serverless invocations.
 * - Retry uses jittered exponential backoff to avoid thundering herd.
 * - Timeout uses AbortController for clean cancellation.
 */

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface RetryOptions {
  maxAttempts?: number;       // default 3
  baseDelayMs?: number;       // default 500
  maxDelayMs?: number;        // default 8000
  jitter?: boolean;           // default true
  shouldRetry?: (error: unknown) => boolean; // only retry on specific errors
}

export interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;  // open after N consecutive failures (default 5)
  resetTimeoutMs?: number;    // wait before trying half-open (default 30000)
}

export interface FallbackResult<T> {
  data: T;
  source: 'primary' | 'fallback';
  degraded: boolean;
  warnings: string[];
}

export interface EngineHealth {
  circuitBreakers: Record<string, CircuitBreakerState>;
  uptime: number;
  degradedServices: string[];
}

// ─── Timeout ─────────────────────────────────────────────────────────────────────

/**
 * Race a promise against a timeout. If the timeout wins, the promise is
 * aborted (if it supports AbortSignal) and a TimeoutError is thrown.
 */
export class TimeoutError extends Error {
  constructor(public readonly ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError(ms));
    }, ms);
    // Clean up timer if fn resolves first
    if (timer.unref) timer.unref();
  });

  return Promise.race([
    fn(controller.signal).then(result => {
      controller.abort(); // cancel timeout timer via abort
      return result;
    }),
    timeoutPromise,
  ]);
}

/** Convenience: wrap a promise that doesn't accept signal */
export async function withPromiseTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return withTimeout(async () => promise, ms);
}

// ─── Retry ───────────────────────────────────────────────────────────────────────

const DEFAULT_RETRY: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  jitter: true,
  shouldRetry: () => true,
};

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < opts.maxAttempts && opts.shouldRetry(err)) {
        const baseDelay = Math.min(opts.baseDelayMs * 2 ** (attempt - 1), opts.maxDelayMs);
        const jitter = (Math.abs(Math.sin(attempt * 7919 + Date.now() * 0.001)) * 0.5 + 0.5);
        const delay = opts.jitter ? baseDelay * jitter : baseDelay;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }

  throw lastError;
}

// ─── Circuit Breaker ─────────────────────────────────────────────────────────────

export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
  }

  get healthy(): boolean {
    return this.state !== 'open';
  }

  getState(): CircuitBreakerState {
    return {
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      state: this.state,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'half-open';
      } else {
        throw new CircuitBreakerOpenError(this.resetTimeoutMs - (Date.now() - this.lastFailureTime));
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  reset(): void {
    this.failures = 0;
    this.state = 'closed';
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`Circuit breaker open. Retry after ${Math.round(retryAfterMs / 1000)}s`);
    this.name = 'CircuitBreakerOpenError';
  }
}

// ─── Global breaker registry ─────────────────────────────────────────────────────

const breakerRegistry = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
  if (!breakerRegistry.has(name)) {
    breakerRegistry.set(name, new CircuitBreaker(options));
  }
  return breakerRegistry.get(name)!;
}

export function getAllCircuitBreakers(): Record<string, CircuitBreakerState> {
  const states: Record<string, CircuitBreakerState> = {};
  for (const [name, breaker] of breakerRegistry) {
    states[name] = breaker.getState();
  }
  return states;
}

// ─── Fallback ────────────────────────────────────────────────────────────────────

/**
 * Attempt the primary function. If it fails, execute the fallback.
 * Returns a FallbackResult indicating whether the primary succeeded.
 * Warnings are appended for observability.
 */
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T> | T,
  serviceName: string,
): Promise<FallbackResult<T>> {
  const warnings: string[] = [];
  try {
    const data = await primary();
    return { data, source: 'primary', degraded: false, warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`[${serviceName}] Primary failed: ${message}. Using fallback.`);
    try {
      const data = await fallback();
      return { data, source: 'fallback', degraded: true, warnings };
    } catch (fallbackErr) {
      const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      warnings.push(`[${serviceName}] Fallback also failed: ${fbMsg}`);
      throw new Error(`[${serviceName}] Both primary and fallback failed: ${message} | ${fbMsg}`);
    }
  }
}
