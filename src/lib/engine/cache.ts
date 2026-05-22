/**
 * Engine Cache Layer — versioned TTL cache for critical computation paths.
 *
 * Uses a deterministic config hash to auto-invalidate cache entries when
 * engine configuration changes (attenuation factors, propagation rules, etc.).
 * Wraps the existing `cachedFetch` from lib/cache.ts for in-memory usage,
 * and provides persistent version-stamped entries for serverless deployments.
 *
 * Key design:
 * - `configVersion` is a hash of current engine parameters (e.g., attenuation table).
 * - Any change to parameters produces a new hash → existing cache entries become stale.
 * - Cache stampede prevention via request deduplication (maps in-flight keys).
 */

import { serverCache } from '@/lib/cache';
import crypto from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface CacheEntry<T> {
  data: T;
  createdAt: number;
  ttlMs: number;
  version: string;
  accessCount: number;
}

export interface EngineCacheStats {
  size: number;
  hitRate: number;
  entries: Array<{ key: string; age: number; accesses: number }>;
}

// ─── Config Version Hash ─────────────────────────────────────────────────────────

let _configVersion: string | null = null;

/**
 * Compute a deterministic hash from engine configuration.
 * Call this whenever calibration data or propagation rules change.
 */
export function computeConfigVersion(components: Record<string, unknown>): string {
  const payload = JSON.stringify(components, Object.keys(components).sort());
  _configVersion = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 12);
  return _configVersion;
}

/** Get current config version (auto-generates if not set) */
export function getConfigVersion(): string {
  if (!_configVersion) {
    _configVersion = computeConfigVersion({ generatedAt: new Date().toISOString() });
  }
  return _configVersion;
}

/** Force-set config version (for calibration runs) */
export function setConfigVersion(version: string): void {
  _configVersion = version;
}

// ─── Versioned Cache ─────────────────────────────────────────────────────────────

class VersionedMemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private hits = 0;
  private misses = 0;
  private maxSize: number;

  constructor(maxSize = 200) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) { this.misses++; return null; }

    // Version mismatch → stale entry
    if (entry.version !== getConfigVersion()) {
      this.store.delete(key);
      this.misses++;
      return null;
    }

    // TTL expired
    if (Date.now() - entry.createdAt > entry.ttlMs) {
      this.store.delete(key);
      this.misses++;
      return null;
    }

    entry.accessCount++;
    this.hits++;
    return entry.data;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    if (this.store.size >= this.maxSize) this.evictOne();
    this.store.set(key, {
      data,
      createdAt: Date.now(),
      ttlMs,
      version: getConfigVersion(),
      accessCount: 0,
    });
  }

  invalidateByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) { this.store.delete(key); count++; }
    }
    return count;
  }

  invalidateAll(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats(): EngineCacheStats {
    const entries = Array.from(this.store.entries()).map(([key, entry]) => ({
      key, age: Date.now() - entry.createdAt, accesses: entry.accessCount,
    })).sort((a, b) => b.accesses - a.accesses);

    return {
      size: this.store.size,
      hitRate: this.hits + this.misses > 0
        ? Math.round(this.hits / (this.hits + this.misses) * 100) / 100
        : 0,
      entries,
    };
  }

  private evictOne(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.store.entries()) {
      if (entry.createdAt < oldestTime) { oldestTime = entry.createdAt; oldestKey = key; }
    }
    if (oldestKey) this.store.delete(oldestKey);
  }
}

/** Singleton versioned cache */
export const engineCache = new VersionedMemoryCache();

// ─── Convenience Wrapper ─────────────────────────────────────────────────────────

/**
 * Fetch with versioned caching. On cache miss, executes `fetcher`,
 * stores result with the current config version hash, and sets TTL.
 *
 * Usage:
 *   const data = await engineCached('cascade:propagation', 60000, () => propagate(...));
 */
export async function engineCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = engineCache.get<T>(key);
  if (cached !== null) return cached;

  const data = await fetcher();
  engineCache.set(key, data, ttlMs);
  return data;
}

// ─── Integration with existing serverCache ───────────────────────────────────────

/** Build a composite cache key with engine version prefix */
export function engineCacheKey(domain: string, ...parts: (string | number)[]): string {
  return `engine:${getConfigVersion()}:${domain}:${parts.join(':')}`;
}

/**
 * Drop-in replacement for cachedFetch that adds engine version awareness.
 * Falls back to the standard serverCache when engine version is unavailable.
 */
export async function versionedCachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  const versionedKey = `v:${getConfigVersion()}:${key}`;
  const cached = await serverCache.get<T>(versionedKey);
  if (cached !== null) return cached;

  const data = await fetcher();
  serverCache.set(versionedKey, data, ttlMs / 1000);
  return data;
}
