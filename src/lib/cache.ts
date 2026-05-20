/**
 * Server-side caching with swappable backends.
 *
 * Backends (env CACHE_BACKEND):
 *   memory  (default) — process-local Map with TTL + LRU
 *   postgres           — PostgreSQL UNLOGGED table, survives restarts
 *   redis  (planned)   — Redis/Valkey for multi-instance deployments
 *
 * Public API (cachedFetch, invalidateCache, etc.) is backend-agnostic.
 */

import { unstable_cache } from 'next/cache';

// ─── Cache Backend Interface ──────────────────────────────────────────────────

export interface CacheStats {
  size: number;
  keys: string[];
  hitCounts: Record<string, number>;
}

export interface ICacheBackend {
  get<T>(key: string): T | null;
  set<T>(key: string, data: T, ttlSeconds: number): void;
  invalidate(prefix: string): number;
  invalidateExact(key: string): boolean;
  clear(): void;
  stats(): CacheStats;
}

// ─── Cache Entry Types ────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number; // Unix timestamp in ms
  createdAt: number;
  hitCount: number;
}

// Cache TTL presets (in seconds) - standard contract
export const CACHE_TTL = {
  SHORT: 15,       // 15s - for rapidly changing data (dashboard metrics, alerts)
  MEDIUM: 60,      // 60s - for normal data (inventory list, sales overview)
  LONG: 300,       // 5min - for stable data (supplier list, product catalog)
  VERY_LONG: 900,  // 15min - for rarely changing data (stats, analytics)
} as const;

// ─── In-Memory Backend ────────────────────────────────────────────────────────

class MemoryCacheBackend implements ICacheBackend {
  private cache = new Map<string, CacheEntry<unknown>>();
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    entry.hitCount++;
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlSeconds: number): void {
    if (this.cache.size >= this.maxSize) {
      this.evictExpired();
      if (this.cache.size >= this.maxSize) {
        this.evictOldest();
      }
    }
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
      createdAt: Date.now(),
      hitCount: 0,
    });
  }

  invalidate(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  invalidateExact(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  stats(): CacheStats {
    const hitCounts: Record<string, number> = {};
    for (const [key, entry] of this.cache.entries()) {
      hitCounts[key] = entry.hitCount;
    }
    return { size: this.cache.size, keys: [...this.cache.keys()], hitCounts };
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }
    if (oldestKey) this.cache.delete(oldestKey);
  }
}

// Singleton — default to memory, can be upgraded to postgres via env
export let serverCache: ICacheBackend = new MemoryCacheBackend(500);

/**
 * Replace the cache backend at runtime.
 * Called during app init if CACHE_BACKEND=postgres.
 */
export async function ensureCacheBackend(): Promise<void> {
  const backend = process.env.CACHE_BACKEND || 'memory';
  if (backend === 'postgres' && !(serverCache.constructor.name === 'PostgresCacheBackend')) {
    const { PostgresCacheBackend } = await import('./cache-postgres');
    serverCache = new PostgresCacheBackend(500);
  }
}

// ─── Request Deduplication ────────────────────────────────────────────────────
// Prevents multiple concurrent requests for the same key from hitting the DB

const inFlightRequests = new Map<string, Promise<unknown>>();

/**
 * Cached fetch wrapper with request deduplication.
 * - Checks in-memory cache first
 * - Deduplicates concurrent in-flight requests for the same key
 * - Falls back to executor if not cached and not in-flight
 * - Standard pattern for all service-layer data fetching.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = CACHE_TTL.MEDIUM
): Promise<T> {
  // 1. Check cache
  const cached = serverCache.get<T>(key);
  if (cached !== null) return cached;

  // 2. Check if request is already in-flight (deduplication)
  const inFlight = inFlightRequests.get(key) as Promise<T> | undefined;
  if (inFlight) return inFlight;

  // 3. Execute and store
  const promise = fetcher()
    .then((data) => {
      serverCache.set(key, data, ttlSeconds);
      inFlightRequests.delete(key);
      return data;
    })
    .catch((err) => {
      inFlightRequests.delete(key);
      throw err;
    });

  inFlightRequests.set(key, promise);
  return promise;
}

/**
 * Build a cache key from parts, e.g., cacheKey('dashboard', '30')
 * Produces: 'dashboard:30'
 */
export function cacheKey(...parts: (string | number | boolean)[]): string {
  return parts.join(':');
}

// ─── Next.js unstable_cache Integration ───────────────────────────────────────
// For heavy computation endpoints that benefit from persistent/deduplicated caching

/** Cache tags for tag-based invalidation */
export const CACHE_TAGS = {
  DASHBOARD: 'dashboard',
  INVENTORY: 'inventory',
  COST: 'cost',
  SALES: 'sales',
  LOGISTICS: 'logistics',
  SUPPLIERS: 'suppliers',
  ANALYTICS: 'analytics',
  REPORTS: 'reports',
  SCORE: 'score',
  RISK: 'risk',
} as const;

/**
 * Enhanced cached fetch using Next.js unstable_cache for heavy computations.
 * This provides:
 * - Request deduplication across concurrent renders
 * - Persistent cache that survives serverless function restarts
 * - Tag-based revalidation for granular invalidation
 *
 * Use this for heavy read-only endpoints (analytics, reports, benchmarks).
 * For regular CRUD endpoints, use cachedFetch() instead.
 */
export function persistentCache<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  keyParts: string[],
  tags: string[],
  revalidateSeconds: number = CACHE_TTL.VERY_LONG
): T {
  return unstable_cache(fn, keyParts, {
    revalidate: revalidateSeconds,
    tags,
  }) as T;
}

/**
 * Invalidate all cache entries (both in-memory and Next.js tagged cache)
 * for a specific domain tag.
 */
export async function invalidateCacheTag(tag: string): Promise<void> {
  // Invalidate in-memory cache entries with this prefix
  serverCache.invalidate(tag);

  // Invalidate Next.js persistent cache by tag
  try {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tag, 'default');
  } catch {
    // Gracefully handle if revalidateTag is not available
    if (process.env.NODE_ENV === 'development') console.warn(`Failed to revalidate tag: ${tag}`);
  }
}

/**
 * Invalidate all cache for a specific domain and optional sub-key.
 * Combines in-memory and Next.js cache invalidation.
 */
export async function invalidateCache(prefix: string): Promise<number> {
  const count = serverCache.invalidate(prefix);
  try {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(prefix, 'default');
  } catch {
    // Gracefully handle
  }
  return count;
}
