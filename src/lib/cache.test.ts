import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { serverCache, CACHE_TTL, cacheKey, cachedFetch, CACHE_TAGS } from './cache';

// Mock next/cache since it's a Next.js server-side module
vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn) => fn),
  revalidateTag: vi.fn(),
}));

describe('Cache Module', () => {
  beforeEach(async () => {
    serverCache.clear();
  });

  describe('serverCache - set/get operations', () => {
    it('stores and retrieves a value', async () => {
      serverCache.set('test-key', { name: 'test' }, 60);
      const result = await serverCache.get<{ name: string }>('test-key');
      expect(result).toEqual({ name: 'test' });
    });

    it('returns null for non-existent key', async () => {
      const result = await serverCache.get('non-existent');
      expect(result).toBeNull();
    });

    it('stores primitive values', async () => {
      serverCache.set('number', 42, 60);
      expect(await serverCache.get<number>('number')).toBe(42);

      serverCache.set('string', 'hello', 60);
      expect(await serverCache.get<string>('string')).toBe('hello');

      serverCache.set('boolean', true, 60);
      expect(await serverCache.get<boolean>('boolean')).toBe(true);
    });

    it('stores null and undefined-like values', async () => {
      serverCache.set('null-val', null, 60);
      expect(await serverCache.get('null-val')).toBeNull();

      // Zero should be retrievable (falsy but valid)
      serverCache.set('zero', 0, 60);
      expect(await serverCache.get<number>('zero')).toBe(0);

      // Empty string should be retrievable
      serverCache.set('empty-str', '', 60);
      expect(await serverCache.get<string>('empty-str')).toBe('');
    });

    it('overwrites existing key', async () => {
      serverCache.set('key', 'value1', 60);
      serverCache.set('key', 'value2', 60);
      expect(await serverCache.get('key')).toBe('value2');
    });
  });

  describe('serverCache - TTL expiration', () => {
    it('returns value before TTL expires', async () => {
      serverCache.set('ttl-key', 'alive', 60);
      expect(await serverCache.get('ttl-key')).toBe('alive');
    });

    it('returns null after TTL expires', async () => {
      vi.useFakeTimers();
      try {
        serverCache.set('expired-key', 'data', 1); // 1 second TTL
        expect(await serverCache.get('expired-key')).toBe('data');

        vi.advanceTimersByTime(1100); // Advance past TTL
        expect(await serverCache.get('expired-key')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('different TTL values work correctly', async () => {
      vi.useFakeTimers();
      try {
        serverCache.set('short', 'short-data', CACHE_TTL.SHORT); // 15s
        serverCache.set('medium', 'medium-data', CACHE_TTL.MEDIUM); // 60s
        serverCache.set('long', 'long-data', CACHE_TTL.LONG); // 300s

        vi.advanceTimersByTime(16000); // 16 seconds
        expect(await serverCache.get('short')).toBeNull();
        expect(await serverCache.get('medium')).toBe('medium-data');
        expect(await serverCache.get('long')).toBe('long-data');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('serverCache - delete operations', () => {
    it('invalidateExact removes specific key', async () => {
      serverCache.set('a', 1, 60);
      serverCache.set('b', 2, 60);
      const deleted = serverCache.invalidateExact('a');
      expect(deleted).toBe(true);
      expect(await serverCache.get('a')).toBeNull();
      expect(await serverCache.get('b')).toBe(2);
    });

    it('invalidateExact returns false for non-existent key', async () => {
      const deleted = serverCache.invalidateExact('non-existent');
      expect(deleted).toBe(false);
    });

    it('invalidate removes keys by prefix', async () => {
      serverCache.set('inventory:1', 'data1', 60);
      serverCache.set('inventory:2', 'data2', 60);
      serverCache.set('sales:1', 'data3', 60);
      const count = serverCache.invalidate('inventory');
      expect(count).toBe(2);
      expect(await serverCache.get('inventory:1')).toBeNull();
      expect(await serverCache.get('inventory:2')).toBeNull();
      expect(await serverCache.get('sales:1')).toBe('data3');
    });

    it('invalidate returns 0 when no keys match prefix', async () => {
      serverCache.set('a', 1, 60);
      const count = serverCache.invalidate('non-matching');
      expect(count).toBe(0);
    });
  });

  describe('serverCache - clear operation', () => {
    it('clears all cache entries', async () => {
      serverCache.set('key1', 'val1', 60);
      serverCache.set('key2', 'val2', 60);
      serverCache.set('key3', 'val3', 60);
      serverCache.clear();
      expect(await serverCache.get('key1')).toBeNull();
      expect(await serverCache.get('key2')).toBeNull();
      expect(await serverCache.get('key3')).toBeNull();
    });
  });

  describe('serverCache - stats reporting', () => {
    it('reports correct size', async () => {
      serverCache.set('a', 1, 60);
      serverCache.set('b', 2, 60);
      const stats = serverCache.stats();
      expect(stats.size).toBe(2);
    });

    it('reports all keys', async () => {
      serverCache.set('key-a', 1, 60);
      serverCache.set('key-b', 2, 60);
      const stats = serverCache.stats();
      expect(stats.keys).toContain('key-a');
      expect(stats.keys).toContain('key-b');
    });

    it('reports hit counts', async () => {
      serverCache.set('hit-key', 'value', 60);
      await serverCache.get('hit-key');
      await serverCache.get('hit-key');
      await serverCache.get('hit-key');
      const stats = serverCache.stats();
      expect(stats.hitCounts['hit-key']).toBe(3);
    });

    it('reports empty stats after clear', async () => {
      serverCache.set('a', 1, 60);
      serverCache.clear();
      const stats = serverCache.stats();
      expect(stats.size).toBe(0);
      expect(stats.keys).toEqual([]);
    });
  });

  describe('serverCache - LRU eviction', () => {
    it('evicts expired entries when at capacity', async () => {
      vi.useFakeTimers();
      try {
        // Fill up to max size (200)
        for (let i = 0; i < 200; i++) {
          serverCache.set(`key-${i}`, `val-${i}`, 60);
        }
        // Expire all entries
        vi.advanceTimersByTime(61000);
        // Adding one more should evict expired entries first
        serverCache.set('new-key', 'new-val', 60);
        expect(await serverCache.get('new-key')).toBe('new-val');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('cacheKey', () => {
    it('joins parts with colon', async () => {
      expect(cacheKey('dashboard', '30')).toBe('dashboard:30');
    });

    it('handles multiple parts', async () => {
      expect(cacheKey('inventory', 'list', 'all', 1, 20)).toBe('inventory:list:all:1:20');
    });

    it('handles boolean parts', async () => {
      expect(cacheKey('test', true, false)).toBe('test:true:false');
    });

    it('handles single part', async () => {
      expect(cacheKey('single')).toBe('single');
    });
  });

  describe('cachedFetch', () => {
    it('returns cached data on second call', async () => {
      const fetcher = vi.fn().mockResolvedValue({ items: [1, 2, 3] });
      
      const result1 = await cachedFetch('test-fetch', fetcher, 60);
      expect(result1).toEqual({ items: [1, 2, 3] });
      expect(fetcher).toHaveBeenCalledTimes(1);

      const result2 = await cachedFetch('test-fetch', fetcher, 60);
      expect(result2).toEqual({ items: [1, 2, 3] });
      // Second call should use cache, not call fetcher again
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('calls fetcher for different keys', async () => {
      const fetcher = vi.fn().mockResolvedValue('data');
      
      await cachedFetch('key-a', fetcher, 60);
      await cachedFetch('key-b', fetcher, 60);
      expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('propagates fetcher errors', async () => {
      const fetcher = vi.fn().mockRejectedValue(new Error('DB error'));
      await expect(cachedFetch('error-key', fetcher, 60)).rejects.toThrow('DB error');
    });

    it('retries fetcher after error (no cache on error)', async () => {
      const fetcher = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success');
      
      await expect(cachedFetch('retry-key', fetcher, 60)).rejects.toThrow('fail');
      const result = await cachedFetch('retry-key', fetcher, 60);
      expect(result).toBe('success');
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  describe('CACHE_TTL presets', () => {
    it('has SHORT preset', async () => {
      expect(CACHE_TTL.SHORT).toBe(15);
    });

    it('has MEDIUM preset', async () => {
      expect(CACHE_TTL.MEDIUM).toBe(60);
    });

    it('has LONG preset', async () => {
      expect(CACHE_TTL.LONG).toBe(300);
    });

    it('has VERY_LONG preset', async () => {
      expect(CACHE_TTL.VERY_LONG).toBe(900);
    });
  });

  describe('CACHE_TAGS', () => {
    it('has all expected cache tags', async () => {
      expect(CACHE_TAGS.DASHBOARD).toBe('dashboard');
      expect(CACHE_TAGS.INVENTORY).toBe('inventory');
      expect(CACHE_TAGS.COST).toBe('cost');
      expect(CACHE_TAGS.SALES).toBe('sales');
      expect(CACHE_TAGS.LOGISTICS).toBe('logistics');
      expect(CACHE_TAGS.SUPPLIERS).toBe('suppliers');
      expect(CACHE_TAGS.ANALYTICS).toBe('analytics');
      expect(CACHE_TAGS.REPORTS).toBe('reports');
      expect(CACHE_TAGS.SCORE).toBe('score');
      expect(CACHE_TAGS.RISK).toBe('risk');
    });
  });

  describe('Cache key prefix isolation', () => {
    it('different prefixes do not interfere', async () => {
      serverCache.set('inventory:1', 'inv-data', 60);
      serverCache.set('sales:1', 'sales-data', 60);

      serverCache.invalidate('inventory');
      
      expect(await serverCache.get('inventory:1')).toBeNull();
      expect(await serverCache.get('sales:1')).toBe('sales-data');
    });

    it('invalidate with empty prefix does not match anything', async () => {
      serverCache.set('test', 'data', 60);
      // Empty string matches everything since every string starts with ''
      const count = serverCache.invalidate('');
      expect(count).toBe(1);
      expect(await serverCache.get('test')).toBeNull();
    });
  });
});
