/**
 * Unit tests for engine resilience layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  withTimeout,
  withPromiseTimeout,
  withRetry,
  withFallback,
  CircuitBreaker,
  CircuitBreakerOpenError,
  getCircuitBreaker,
  TimeoutError,
} from './resilience';

// ─── withTimeout ────────────────────────────────────────────────────────────────

describe('withTimeout', () => {
  it('returns result when promise resolves before timeout', async () => {
    const result = await withTimeout(async () => 42, 1000);
    expect(result).toBe(42);
  });

  it('throws TimeoutError when promise exceeds timeout', async () => {
    await expect(
      withTimeout(async () => new Promise(r => setTimeout(r, 100)), 10),
    ).rejects.toThrow(TimeoutError);
  });

  it('re-throws non-timeout errors', async () => {
    await expect(
      withTimeout(async () => { throw new Error('boom'); }, 1000),
    ).rejects.toThrow('boom');
  });
});

// ─── withPromiseTimeout ─────────────────────────────────────────────────────────

describe('withPromiseTimeout', () => {
  it('works with plain promises', async () => {
    const result = await withPromiseTimeout(Promise.resolve('ok'), 1000);
    expect(result).toBe('ok');
  });
});

// ─── withRetry ──────────────────────────────────────────────────────────────────

describe('withRetry', () => {
  it('returns on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, jitter: false });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'));
    await expect(
      withRetry(fn, { maxAttempts: 2, baseDelayMs: 10, jitter: false }),
    ).rejects.toThrow('always fail');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('respects shouldRetry filter', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('do not retry'));
    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, shouldRetry: () => false }),
    ).rejects.toThrow('do not retry');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ─── CircuitBreaker ─────────────────────────────────────────────────────────────

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 100 });
  });

  it('executes successfully when closed', async () => {
    const result = await breaker.execute(async () => 42);
    expect(result).toBe(42);
    expect(breaker.getState().state).toBe('closed');
  });

  it('opens after N consecutive failures', async () => {
    const fail = () => { throw new Error('fail'); };
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fail)).rejects.toThrow('fail');
    }
    const state = breaker.getState();
    expect(state.state).toBe('open');
    expect(state.failures).toBe(3);
  });

  it('throws CircuitBreakerOpenError when open', async () => {
    breaker.reset();
    for (let i = 0; i < 3; i++) {
      try { await breaker.execute(() => { throw new Error('fail'); }); } catch {}
    }
    await expect(breaker.execute(async () => 42)).rejects.toThrow(CircuitBreakerOpenError);
  });

  it('can be manually reset', async () => {
    for (let i = 0; i < 3; i++) {
      try { await breaker.execute(() => { throw new Error('fail'); }); } catch {}
    }
    breaker.reset();
    const result = await breaker.execute(async () => 42);
    expect(result).toBe(42);
    expect(breaker.getState().state).toBe('closed');
  });
});

// ─── getCircuitBreaker ──────────────────────────────────────────────────────────

describe('getCircuitBreaker', () => {
  it('returns same instance for same name', () => {
    const a = getCircuitBreaker('test');
    const b = getCircuitBreaker('test');
    expect(a).toBe(b);
  });
});

// ─── withFallback ───────────────────────────────────────────────────────────────

describe('withFallback', () => {
  it('uses primary when it succeeds', async () => {
    const result = await withFallback(
      async () => 'primary',
      async () => 'fallback',
      'test',
    );
    expect(result.data).toBe('primary');
    expect(result.source).toBe('primary');
    expect(result.degraded).toBe(false);
  });

  it('falls back when primary fails', async () => {
    const result = await withFallback(
      async () => { throw new Error('down'); },
      async () => 'fallback',
      'test',
    );
    expect(result.data).toBe('fallback');
    expect(result.source).toBe('fallback');
    expect(result.degraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('supports sync fallback', async () => {
    const result = await withFallback(
      async () => { throw new Error('down'); },
      () => 'sync-fallback',
      'test',
    );
    expect(result.data).toBe('sync-fallback');
    expect(result.source).toBe('fallback');
  });

  it('throws when both primary and fallback fail', async () => {
    await expect(
      withFallback(
        async () => { throw new Error('primary fail'); },
        async () => { throw new Error('fallback fail'); },
        'test',
      ),
    ).rejects.toThrow('Both primary and fallback failed');
  });
});
