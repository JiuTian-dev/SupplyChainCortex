/**
 * Warehouse Service Tests
 *
 * 测试覆盖：
 * - getWarehouseCapacity: 仓库容量查询
 * - getWarehouseOverview: 仓库概览
 * - getWarehouseStats: 仓库统计
 * - getWarehouseAging: 库龄分析
 * - transferStock: 库存调拨
 * - getTransferSuggestions: 调拨建议
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getWarehouseCapacity,
  getWarehouseOverview,
  getWarehouseStats,
  getWarehouseAging,
  transferStock,
  getTransferSuggestions,
} from './warehouse.service';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    inventory: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    salesRecord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    warehouseZone: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    supplyChainEvent: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('@/lib/cache', () => ({
  serverCache: { get: vi.fn().mockReturnValue(null), set: vi.fn(), invalidate: vi.fn() },
  cachedFetch: vi.fn((_key, fetcher) => fetcher()),
  cacheKey: (...parts: (string | number | boolean)[]) => parts.join(':'),
  CACHE_TTL: { SHORT: 15, MEDIUM: 60, LONG: 300, VERY_LONG: 900 },
}));

vi.mock('./inventory.service', () => ({
  computeStockStatus: vi.fn((qty: number, safety: number) => {
    if (qty <= safety * 0.5) return 'critical';
    if (qty <= safety) return 'warning';
    if (qty >= safety * 3) return 'overstock';
    return 'healthy';
  }),
}));

import { db } from '@/lib/db';

// ─── Test Setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Warehouse Service', () => {
  // ── getWarehouseCapacity ──
  describe('getWarehouseCapacity', () => {
    it('应返回仓库容量数据', async () => {
      vi.mocked(db.inventory.findMany).mockResolvedValue([
        { id: '1', sku: 'SKU001', warehouse: '深圳仓', quantity: 100, productName: '产品A', safetyStock: 50 },
        { id: '2', sku: 'SKU002', warehouse: '深圳仓', quantity: 200, productName: '产品B', safetyStock: 80 },
      ] as any);

      const result = await getWarehouseCapacity();
      expect(result.capacity).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('应支持按仓库过滤', async () => {
      vi.mocked(db.inventory.findMany).mockResolvedValue([]);

      await getWarehouseCapacity('深圳仓');
      expect(db.inventory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { warehouse: '深圳仓' } })
      );
    });

    it('应处理空库存场景', async () => {
      vi.mocked(db.inventory.findMany).mockResolvedValue([]);
      const result = await getWarehouseCapacity();
      expect(result.capacity).toBeDefined();
    });
  });

  // ── getWarehouseOverview ──
  describe('getWarehouseOverview', () => {
    it('应返回仓库概览统计', async () => {
      vi.mocked(db.inventory.findMany).mockResolvedValue([
        { id: '1', sku: 'SKU001', warehouse: '深圳仓', quantity: 100, productName: '产品A', safetyStock: 50, stockStatus: 'healthy' },
      ] as any);
      vi.mocked(db.inventory.aggregate).mockResolvedValue({ _sum: { quantity: 100 }, _count: 1 } as any);

      const result = await getWarehouseOverview();
      expect(result).toBeDefined();
    });

    it('应支持按仓库过滤', async () => {
      vi.mocked(db.inventory.findMany).mockResolvedValue([]);
      vi.mocked(db.inventory.aggregate).mockResolvedValue({ _sum: { quantity: 0 }, _count: 0 } as any);

      await getWarehouseOverview('义乌仓');
      expect(db.inventory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { warehouse: '义乌仓' } })
      );
    });
  });

  // ── getWarehouseStats ──
  describe('getWarehouseStats', () => {
    it('应返回仓库统计数据', async () => {
      vi.mocked(db.inventory.groupBy).mockResolvedValue([
        { warehouse: '深圳仓', _count: { id: 10 }, _sum: { quantity: 1000 } },
        { warehouse: '义乌仓', _count: { id: 5 }, _sum: { quantity: 500 } },
      ] as any);

      const result = await getWarehouseStats();
      expect(result).toBeDefined();
    });
  });

  // ── getWarehouseAging ──
  describe('getWarehouseAging', () => {
    it('应返回库龄分析数据', async () => {
      vi.mocked(db.inventory.findMany).mockResolvedValue([
        {
          id: '1', sku: 'SKU001', warehouse: '深圳仓', quantity: 100,
          productName: '产品A', lastSyncAt: new Date('2026-06-01'),
        },
      ] as any);

      const result = await getWarehouseAging();
      expect(result).toBeDefined();
    });

    it('应支持按仓库过滤', async () => {
      vi.mocked(db.inventory.findMany).mockResolvedValue([]);

      await getWarehouseAging('深圳仓');
      expect(db.inventory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { warehouse: '深圳仓' } })
      );
    });
  });

  // ── transferStock ──
  describe('transferStock', () => {
    it('应在来源库存不足时抛出错误', async () => {
      vi.mocked(db.inventory.findFirst).mockResolvedValue({
        id: '1', sku: 'SKU001', warehouse: '深圳仓', quantity: 50, productName: '产品A', safetyStock: 30,
      } as any);

      await expect(transferStock({
        fromZone: '深圳仓',
        toZone: '义乌仓',
        sku: 'SKU001',
        quantity: 100, // 超过库存
      })).rejects.toThrow('库存不足');
    });

    it('应在来源库存记录不存在时抛出错误', async () => {
      vi.mocked(db.inventory.findFirst).mockResolvedValue(null);

      await expect(transferStock({
        fromZone: '深圳仓',
        toZone: '义乌仓',
        sku: 'NONEXISTENT',
        quantity: 10,
      })).rejects.toThrow('未找到源仓库');
    });

    it('应在来源和目标相同时抛出错误', async () => {
      await expect(transferStock({
        fromZone: '深圳仓',
        toZone: '深圳仓',
        sku: 'SKU001',
        quantity: 10,
      })).rejects.toThrow('不能相同');
    });

    it('应在数量小于等于0时抛出错误', async () => {
      // quantity=0 是 falsy，会先触发"缺少必填字段"校验
      await expect(transferStock({
        fromZone: '深圳仓',
        toZone: '义乌仓',
        sku: 'SKU001',
        quantity: -1,
      })).rejects.toThrow('大于0');
    });
  });

  // ── getTransferSuggestions ──
  describe('getTransferSuggestions', () => {
    it('应返回调拨建议（含 transfers 数组）', async () => {
      vi.mocked(db.inventory.findMany).mockResolvedValue([
        { id: '1', sku: 'SKU001', warehouse: '深圳仓', quantity: 500, productName: '产品A', safetyStock: 50, stockStatus: 'overstock' },
        { id: '2', sku: 'SKU001', warehouse: '义乌仓', quantity: 10, productName: '产品A', safetyStock: 50, stockStatus: 'critical' },
      ] as any);

      const result = await getTransferSuggestions();
      expect(result).toBeDefined();
      expect(result).toHaveProperty('transfers');
      expect(Array.isArray(result.transfers)).toBe(true);
    });

    it('应处理无库存场景', async () => {
      vi.mocked(db.inventory.findMany).mockResolvedValue([]);
      const result = await getTransferSuggestions();
      expect(result.transfers).toEqual([]);
    });
  });
});
