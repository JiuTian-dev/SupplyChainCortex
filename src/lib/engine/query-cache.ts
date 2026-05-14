/**
 * Query Cache — in-memory TTL-based cache for expensive operations.
 *
 * Reduces redundant API calls and DB queries. Used by:
 * - Financial simulator (same SKU × market → cached for 30 min)
 * - Compliance check (same product × market → cached for 4 hours)
 * - Competitor data (same keyword → cached for 30 min)
 * - Graph store (rebuilt every 30 min)
 * - Cascade risk (same scenario → cached for 15 min)
 *
 * Cache key = MD5-like hash of (functionName + JSON.stringify(args)).
 */

import crypto from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  oldestEntry: string | null;
}

// ─── Store ───────────────────────────────────────────────────────────────────────

class QueryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private hits = 0;
  private misses = 0;
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  /** Generate a deterministic cache key from function name + arguments */
  key(fnName: string, args: unknown): string {
    const payload = `${fnName}:${JSON.stringify(args)}`;
    return crypto.createHash('md5').update(payload).digest('hex').slice(0, 16);
  }

  /** Get a cached value. Returns undefined on miss or expiry. */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) { this.misses++; return undefined; }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    entry.hits++;
    this.hits++;
    return entry.value as T;
  }

  /** Set a cached value with TTL in milliseconds */
  set<T>(key: string, value: T, ttlMs: number): void {
    // Evict oldest if over max size
    if (this.store.size >= this.maxSize) {
      const oldest = [...this.store.entries()]
        .sort(([, a], [, b]) => a.expiresAt - b.expiresAt)[0];
      if (oldest) this.store.delete(oldest[0]);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      hits: 0,
    });
  }

  /**
   * Get-or-set: returns cached value if available, otherwise runs fn,
   * caches result, and returns it.
   */
  async getOrSet<T>(key: string, fn: () => Promise<T>, ttlMs: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const value = await fn();
    this.set(key, value, ttlMs);
    return value;
  }

  /** Invalidate a specific key */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Invalidate all keys matching a prefix */
  invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) { this.store.delete(key); count++; }
    }
    return count;
  }

  /** Clear all cache */
  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /** Get cache stats */
  getStats(): CacheStats {
    const entries = [...this.store.entries()];
    const oldest = entries.sort(([, a], [, b]) => a.expiresAt - b.expiresAt)[0];
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0
        ? Math.round(this.hits / (this.hits + this.misses) * 100) / 100
        : 0,
      oldestEntry: oldest ? new Date(oldest[1].expiresAt).toISOString() : null,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────────

export const queryCache = new QueryCache(500);

// ─── Preset TTLs ─────────────────────────────────────────────────────────────────

export const CACHE_TTL = {
  /** Financial simulations — 30 min */
  FINANCIAL_SIM: 30 * 60 * 1000,
  /** Compliance checks — 4 hours (regulations don't change that fast) */
  COMPLIANCE: 4 * 60 * 60 * 1000,
  /** Competitor data — 30 min */
  COMPETITOR: 30 * 60 * 1000,
  /** Graph store — 30 min */
  GRAPH: 30 * 60 * 1000,
  /** Cascade risk — 15 min */
  CASCADE_RISK: 15 * 60 * 1000,
  /** Dashboard metrics — 5 min */
  DASHBOARD: 5 * 60 * 1000,
  /** Web search — 10 min */
  WEB_SEARCH: 10 * 60 * 1000,
  /** Arbitrage analysis — 1 hour */
  ARBITRAGE: 60 * 60 * 1000,
} as const;
