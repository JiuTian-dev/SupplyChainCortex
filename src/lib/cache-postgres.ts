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

const TAG = '[cache-postgres]';

export class PostgresCacheBackend implements ICacheBackend {
  private maxSize: number;
  readonly backendType = 'postgres' as const;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const row = await db.$queryRawUnsafe<Array<{ data: unknown; expires_at: Date }>>(
        `SELECT data, expires_at FROM cache_entries WHERE key = $1`, key
      );
      if (!row || row.length === 0) return null;

      const entry = row[0];
      if (new Date() > new Date(entry.expires_at)) {
        // Expired — clean up asynchronously, don't block the read
        db.$executeRawUnsafe(`DELETE FROM cache_entries WHERE key = $1`, key)
          .catch(e => console.warn(TAG, 'expiry cleanup failed:', String(e)));
        return null;
      }

      // Bump hit count (fire-and-forget — not worth blocking the read)
      db.$executeRawUnsafe(
        `UPDATE cache_entries SET hit_count = hit_count + 1 WHERE key = $1`, key
      ).catch(e => console.warn(TAG, 'hit count update failed:', String(e)));

      return entry.data as T;
    } catch (e) {
      console.warn(TAG, 'get failed:', String(e));
      return null;
    }
  }

  set<T>(key: string, data: T, ttlSeconds: number): void {
    // Fire-and-forget: write to PG in background.
    this.setAsync(key, data, ttlSeconds).catch(e => console.warn(TAG, 'set failed:', String(e)));
  }

  private async setAsync<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    // Enforce maxSize: if at capacity, evict oldest entries
    // Use a threshold check (NOT exact COUNT) to reduce race-condition window
    const countRow = await db.$queryRawUnsafe<Array<{ cnt: bigint }>>(
      `SELECT COUNT(*) as cnt FROM cache_entries`
    );
    if (countRow[0] && Number(countRow[0].cnt) >= this.maxSize) {
      const excess = Number(countRow[0].cnt) - this.maxSize + 10;
      await db.$executeRawUnsafe(
        `DELETE FROM cache_entries WHERE key IN (
          SELECT key FROM cache_entries ORDER BY created_at ASC LIMIT $1
        )`, Math.max(1, excess)
      ).catch(() => {});
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
  }

  invalidate(prefix: string): number {
    let count = 0;
    this.invalidateAsync(prefix)
      .then(c => { count = c; })
      .catch(e => console.warn(TAG, 'invalidate failed:', String(e)));
    return count;
  }

  private async invalidateAsync(prefix: string): Promise<number> {
    try {
      const result = await db.$executeRawUnsafe(
        `DELETE FROM cache_entries WHERE key LIKE $1`, prefix + '%'
      );
      return result;
    } catch (e) {
      console.warn(TAG, 'invalidateAsync failed:', String(e));
      return 0;
    }
  }

  invalidateExact(key: string): boolean {
    let removed = false;
    this.invalidateExactAsync(key)
      .then(r => { removed = r; })
      .catch(e => console.warn(TAG, 'invalidateExact failed:', String(e)));
    return removed;
  }

  private async invalidateExactAsync(key: string): Promise<boolean> {
    try {
      const result = await db.$executeRawUnsafe(
        `DELETE FROM cache_entries WHERE key = $1`, key
      );
      return result > 0;
    } catch (e) {
      console.warn(TAG, 'invalidateExactAsync failed:', String(e));
      return false;
    }
  }

  clear(): void {
    db.$executeRawUnsafe(`DELETE FROM cache_entries`)
      .catch(e => console.warn(TAG, 'clear failed:', String(e)));
  }

  stats(): CacheStats {
    // Sync stub — use statsAsync() for real data
    return { size: 0, keys: [], hitCounts: {} };
  }

  async statsAsync(): Promise<CacheStats> {
    try {
      const rows = await db.$queryRawUnsafe<Array<{ key: string; hit_count: number }>>(
        `SELECT key, hit_count FROM cache_entries ORDER BY created_at DESC LIMIT 200`
      );
      const hitCounts: Record<string, number> = {};
      for (const r of rows) {
        hitCounts[r.key] = Number(r.hit_count);
      }
      return { size: rows.length, keys: rows.map(r => r.key), hitCounts };
    } catch (e) {
      console.warn(TAG, 'statsAsync failed:', String(e));
      return { size: 0, keys: [], hitCounts: {} };
    }
  }
}
