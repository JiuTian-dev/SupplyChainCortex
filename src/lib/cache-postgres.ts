import { db } from '@/lib/db';
import type { ICacheBackend, CacheStats } from '@/lib/cache';

// ─── PostgreSQL Cache Backend ──────────────────────────────────────────────────
// Uses an UNLOGGED table for performance (no WAL overhead).
// Survives process restarts but not DB crashes — acceptable for a cache.
//
// Table (created via migration):
//   CREATE UNLOGGED TABLE IF NOT EXISTS cache_entries (
//     key        TEXT PRIMARY KEY,
//     data       JSONB NOT NULL,
//     expires_at TIMESTAMPTZ NOT NULL,
//     created_at TIMESTAMPTZ DEFAULT NOW(),
//     hit_count  INT DEFAULT 0
//   );

export class PostgresCacheBackend implements ICacheBackend {
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | null {
    // This is sync in the interface but PG is async.
    // We use a synchronous approach: read from an in-process Map as L1,
    // or accept that get() returns null on cache miss (async population
    // happens via cachedFetch which calls set() after fetcher resolves).
    //
    // For a proper async cache, use cachedFetch() which handles this.
    return null;
  }

  async getAsync<T>(key: string): Promise<T | null> {
    try {
      const row = await db.$queryRawUnsafe<Array<{ data: unknown; expires_at: Date }>>(
        `SELECT data, expires_at FROM cache_entries WHERE key = $1`, key
      );
      if (!row || row.length === 0) return null;

      const entry = row[0];
      if (new Date() > new Date(entry.expires_at)) {
        // Expired — clean up
        await db.$executeRawUnsafe(`DELETE FROM cache_entries WHERE key = $1`, key);
        return null;
      }

      // Bump hit count
      await db.$executeRawUnsafe(
        `UPDATE cache_entries SET hit_count = hit_count + 1 WHERE key = $1`, key
      );

      return entry.data as T;
    } catch {
      // Table may not exist yet — gracefully return null
      return null;
    }
  }

  set<T>(key: string, data: T, ttlSeconds: number): void {
    // Fire-and-forget: write to PG in background.
    // Don't await — cachedFetch expects sync behavior.
    this.setAsync(key, data, ttlSeconds).catch(() => {});
  }

  async setAsync<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    try {
      // Enforce maxSize: if at capacity, evict oldest
      const count = await db.$queryRawUnsafe<Array<{ cnt: bigint }>>(
        `SELECT COUNT(*) as cnt FROM cache_entries`
      );
      if (count[0] && Number(count[0].cnt) >= this.maxSize) {
        await db.$executeRawUnsafe(
          `DELETE FROM cache_entries WHERE key IN (
            SELECT key FROM cache_entries ORDER BY created_at ASC LIMIT $1
          )`, Math.max(1, Number(count[0].cnt) - this.maxSize + 1)
        );
      }

      await db.$executeRawUnsafe(
        `INSERT INTO cache_entries (key, data, expires_at, created_at, hit_count)
         VALUES ($1, $2::jsonb, $3, NOW(), 0)
         ON CONFLICT (key) DO UPDATE SET
           data = EXCLUDED.data,
           expires_at = EXCLUDED.expires_at,
           created_at = NOW()`,
        key, JSON.stringify(data), new Date(Date.now() + ttlSeconds * 1000)
      );
    } catch {
      // Table may not exist — degrade silently
    }
  }

  invalidate(prefix: string): number {
    let count = 0;
    this.invalidateAsync(prefix).then(c => { count = c; }).catch(() => {});
    return count;
  }

  async invalidateAsync(prefix: string): Promise<number> {
    try {
      const result = await db.$executeRawUnsafe(
        `DELETE FROM cache_entries WHERE key LIKE $1`, prefix + '%'
      );
      return result;
    } catch {
      return 0;
    }
  }

  invalidateExact(key: string): boolean {
    let removed = false;
    this.invalidateExactAsync(key).then(r => { removed = r; }).catch(() => {});
    return removed;
  }

  async invalidateExactAsync(key: string): Promise<boolean> {
    try {
      const result = await db.$executeRawUnsafe(
        `DELETE FROM cache_entries WHERE key = $1`, key
      );
      return result > 0;
    } catch {
      return false;
    }
  }

  clear(): void {
    db.$executeRawUnsafe(`DELETE FROM cache_entries`).catch(() => {});
  }

  stats(): CacheStats {
    // Sync method — return empty stats. Call statsAsync() for real data.
    return { size: 0, keys: [], hitCounts: {} };
  }

  async statsAsync(): Promise<CacheStats> {
    try {
      const rows = await db.$queryRawUnsafe<Array<{ key: string; hit_count: number }>>(
        `SELECT key, hit_count FROM cache_entries ORDER BY created_at DESC`
      );
      const hitCounts: Record<string, number> = {};
      for (const r of rows) {
        hitCounts[r.key] = Number(r.hit_count);
      }
      return { size: rows.length, keys: rows.map(r => r.key), hitCounts };
    } catch {
      return { size: 0, keys: [], hitCounts: {} };
    }
  }
}
