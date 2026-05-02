import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeStockStatus, computeSafetyStock } from './inventory.service';

// Mock db and cache for functions that use them
vi.mock('@/lib/db', () => ({
  db: {
    inventory: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
    salesRecord: { findMany: vi.fn() },
    supplier: { findMany: vi.fn() },
    supplyChainEvent: { findMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('@/lib/cache', () => ({
  serverCache: { get: vi.fn().mockReturnValue(null), set: vi.fn(), invalidate: vi.fn() },
  cachedFetch: vi.fn((_key, fetcher) => fetcher()),
  cacheKey: (...parts: (string | number | boolean)[]) => parts.join(':'),
  CACHE_TTL: { SHORT: 15, MEDIUM: 60, LONG: 300, VERY_LONG: 900 },
}));

describe('Inventory Service', () => {
  describe('computeStockStatus', () => {
    it('returns "critical" when quantity <= 50% of safety stock', () => {
      expect(computeStockStatus(5, 100)).toBe('critical');
      expect(computeStockStatus(50, 100)).toBe('critical');
      expect(computeStockStatus(0, 100)).toBe('critical');
    });

    it('returns "warning" when quantity <= safety stock but > 50%', () => {
      expect(computeStockStatus(75, 100)).toBe('warning');
      expect(computeStockStatus(100, 100)).toBe('warning');
    });

    it('returns "overstock" when quantity >= 3x safety stock', () => {
      expect(computeStockStatus(300, 100)).toBe('overstock');
      expect(computeStockStatus(500, 100)).toBe('overstock');
    });

    it('returns "healthy" for normal stock levels', () => {
      expect(computeStockStatus(150, 100)).toBe('healthy');
      expect(computeStockStatus(200, 100)).toBe('healthy');
      expect(computeStockStatus(299, 100)).toBe('healthy');
    });

    it('handles zero safety stock', () => {
      // quantity 0 with safetyStock 0: 0 <= 0*0.5 = true → critical
      expect(computeStockStatus(0, 0)).toBe('critical');
      // quantity 10 with safetyStock 0: 10 >= 0*3 = true → overstock
      expect(computeStockStatus(10, 0)).toBe('overstock');
    });

    it('boundary: exactly 50% of safety stock is critical', () => {
      expect(computeStockStatus(50, 100)).toBe('critical');
    });

    it('boundary: just above 50% of safety stock is warning', () => {
      expect(computeStockStatus(51, 100)).toBe('warning');
    });

    it('boundary: exactly safety stock is warning', () => {
      expect(computeStockStatus(100, 100)).toBe('warning');
    });

    it('boundary: just above safety stock is healthy', () => {
      expect(computeStockStatus(101, 100)).toBe('healthy');
    });

    it('boundary: exactly 3x safety stock is overstock', () => {
      expect(computeStockStatus(300, 100)).toBe('overstock');
    });

    it('boundary: just below 3x safety stock is healthy', () => {
      expect(computeStockStatus(299, 100)).toBe('healthy');
    });
  });

  describe('computeSafetyStock', () => {
    it('returns 0 when no sales records', () => {
      expect(computeSafetyStock([])).toBe(0);
    });

    it('computes safety stock from sales records', () => {
      // Consistent sales: 10 units per record
      const records = Array.from({ length: 30 }, () => ({ quantity: 10 }));
      const result = computeSafetyStock(records);
      // With consistent sales (stdDev = 0), safety stock should be 0
      expect(result).toBe(0);
    });

    it('computes higher safety stock with more variable sales', () => {
      const variableRecords = [
        { quantity: 5 },
        { quantity: 50 },
        { quantity: 10 },
        { quantity: 100 },
        { quantity: 2 },
      ];
      const result = computeSafetyStock(variableRecords);
      // Variable records should produce a positive safety stock
      expect(result).toBeGreaterThan(0);
    });

    it('respects service level parameter', () => {
      const records = [
        { quantity: 10 },
        { quantity: 50 },
        { quantity: 10 },
      ];
      const result90 = computeSafetyStock(records, 0.9);
      const result99 = computeSafetyStock(records, 0.99);
      // Higher service level should require higher safety stock
      expect(result99).toBeGreaterThanOrEqual(result90);
    });

    it('respects lead time parameter', () => {
      const records = [
        { quantity: 10 },
        { quantity: 50 },
        { quantity: 10 },
      ];
      const result7days = computeSafetyStock(records, 0.95, 7);
      const result30days = computeSafetyStock(records, 0.95, 30);
      // Longer lead time should require higher safety stock
      expect(result30days).toBeGreaterThan(result7days);
    });

    it('uses default service level of 0.95', () => {
      const records = [
        { quantity: 20 },
        { quantity: 80 },
      ];
      const withDefault = computeSafetyStock(records);
      const withExplicit = computeSafetyStock(records, 0.95);
      expect(withDefault).toBe(withExplicit);
    });

    it('uses default lead time of 14 days', () => {
      const records = [
        { quantity: 20 },
        { quantity: 80 },
      ];
      const withDefault = computeSafetyStock(records, 0.95);
      const withExplicit = computeSafetyStock(records, 0.95, 14);
      expect(withDefault).toBe(withExplicit);
    });

    it('falls back to z=1.65 for unknown service levels', () => {
      const records = [
        { quantity: 20 },
        { quantity: 80 },
      ];
      const result = computeSafetyStock(records, 0.85); // not in the z-score map
      // Should fall back to 1.65 (same as 0.95)
      const result95 = computeSafetyStock(records, 0.95);
      expect(result).toBe(result95);
    });

    it('rounds the result to integer', () => {
      const records = [
        { quantity: 10 },
        { quantity: 30 },
        { quantity: 20 },
        { quantity: 40 },
      ];
      const result = computeSafetyStock(records);
      expect(Number.isInteger(result)).toBe(true);
    });
  });
});
