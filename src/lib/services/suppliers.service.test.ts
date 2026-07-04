/**
 * Suppliers Service Tests
 *
 * 测试覆盖：
 * - paginate: 分页工具函数
 * - parseRatingDetails: 评分详情解析
 * - formatSupplierWithDetails: 供应商格式化
 * - computeDynamicSupplierScore: 动态评分（含 DB mock）
 * - getSuppliersList: 供应商列表查询
 * - getSupplierByCode: 按编码查询
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  paginate,
  parseRatingDetails,
  formatSupplierWithDetails,
  computeDynamicSupplierScore,
  getSuppliersList,
  getSupplierByCode,
  SUPPLIER_STATUSES,
  SUPPLIER_CATEGORIES,
} from './suppliers.service';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    supplier: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    reorderOrder: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    shipmentItem: { findMany: vi.fn() },
    defectRecord: { count: vi.fn() },
    regulationChange: { count: vi.fn() },
    costRecord: { findMany: vi.fn(), aggregate: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('@/lib/cache', () => ({
  serverCache: { get: vi.fn().mockReturnValue(null), set: vi.fn(), invalidate: vi.fn() },
  cachedFetch: vi.fn((_key, fetcher) => fetcher()),
  cacheKey: (...parts: (string | number | boolean)[]) => parts.join(':'),
  CACHE_TTL: { SHORT: 15, MEDIUM: 60, LONG: 300, VERY_LONG: 900 },
}));

import { db } from '@/lib/db';

// ─── Test Setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Suppliers Service', () => {
  // ── Constants ──
  describe('Constants', () => {
    it('SUPPLIER_STATUSES 应包含 active/suspended/inactive', () => {
      expect(SUPPLIER_STATUSES).toContain('active');
      expect(SUPPLIER_STATUSES).toContain('suspended');
      expect(SUPPLIER_STATUSES).toContain('inactive');
    });

    it('SUPPLIER_CATEGORIES 应包含主要供应品类', () => {
      expect(SUPPLIER_CATEGORIES).toContain('电子元器件');
      expect(SUPPLIER_CATEGORIES).toContain('塑料/五金件');
      expect(SUPPLIER_CATEGORIES).toContain('成品代工');
    });
  });

  // ── paginate ──
  describe('paginate', () => {
    it('应正确分页第一页', () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = paginate(items, 1, 3);
      expect(result.data).toEqual([1, 2, 3]);
      expect(result.pagination).toEqual({ page: 1, pageSize: 3, total: 10, totalPages: 4 });
    });

    it('应正确分页最后一页（不足 pageSize）', () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = paginate(items, 4, 3);
      expect(result.data).toEqual([10]);
      expect(result.pagination.totalPages).toBe(4);
    });

    it('应处理空数组', () => {
      const result = paginate([], 1, 10);
      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });

    it('应处理 page 超出范围', () => {
      const items = [1, 2, 3];
      const result = paginate(items, 5, 10);
      expect(result.data).toEqual([]);
      expect(result.pagination.page).toBe(5);
    });

    it('应正确计算 totalPages（整除场景）', () => {
      const items = [1, 2, 3, 4, 5, 6];
      const result = paginate(items, 1, 3);
      expect(result.pagination.totalPages).toBe(2);
    });
  });

  // ── parseRatingDetails ──
  describe('parseRatingDetails', () => {
    it('应解析 JSON 字符串', () => {
      const result = parseRatingDetails('{"quality": 4.5, "delivery": 4.0}');
      expect(result).toEqual({ quality: 4.5, delivery: 4.0 });
    });

    it('应直接返回对象', () => {
      const obj = { quality: 5, delivery: 4 };
      expect(parseRatingDetails(obj)).toBe(obj);
    });

    it('应在无效 JSON 时返回 null', () => {
      expect(parseRatingDetails('invalid json')).toBeNull();
    });

    it('应在 null/undefined 输入时返回 null', () => {
      expect(parseRatingDetails(null)).toBeNull();
      expect(parseRatingDetails(undefined)).toBeNull();
    });

    it('应处理空字符串', () => {
      expect(parseRatingDetails('')).toBeNull();
    });
  });

  // ── formatSupplierWithDetails ──
  describe('formatSupplierWithDetails', () => {
    it('应正确格式化供应商并解析 ratingDetails', () => {
      const supplier = {
        id: '1',
        code: 'SUP-GD001',
        name: '深圳电子有限公司',
        contact: '张三',
        email: 'zhangsan@example.com',
        phone: '13800138000',
        region: '华南',
        category: '电子元器件',
        leadTime: 15,
        rating: 4.5,
        ratingDetails: '{"quality": 4.5, "delivery": 4.0}',
        status: 'active',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-06-01'),
      };
      const result = formatSupplierWithDetails(supplier);
      expect(result.code).toBe('SUP-GD001');
      expect(result.ratingDetails).toEqual({ quality: 4.5, delivery: 4.0 });
    });

    it('应处理 ratingDetails 为 null', () => {
      const supplier = {
        id: '1',
        code: 'SUP-GD001',
        name: '供应商',
        contact: null,
        email: null,
        phone: null,
        region: '华南',
        category: '电子元器件',
        leadTime: 15,
        rating: 3.0,
        ratingDetails: null,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = formatSupplierWithDetails(supplier);
      expect(result.ratingDetails).toBeNull();
    });
  });

  // ── computeDynamicSupplierScore ──
  describe('computeDynamicSupplierScore', () => {
    it('应在供应商不存在时返回 null', async () => {
      vi.mocked(db.supplier.findUnique).mockResolvedValue(null);
      const result = await computeDynamicSupplierScore('nonexistent-id');
      expect(result).toBeNull();
    });

    it('应计算动态评分（含交付、质量、价格、风险）', async () => {
      vi.mocked(db.supplier.findUnique).mockResolvedValue({
        id: 'sup-1',
        code: 'SUP-GD001',
        name: '深圳电子',
        region: '华南',
        category: '电子元器件',
        leadTime: 15,
        rating: 4.0,
        status: 'active',
      } as any);

      vi.mocked(db.shipmentItem.findMany).mockResolvedValue([]);
      vi.mocked(db.defectRecord.count).mockResolvedValue(0);
      vi.mocked(db.regulationChange.count).mockResolvedValue(0);
      vi.mocked(db.costRecord.findMany).mockResolvedValue([]);
      vi.mocked(db.costRecord.aggregate).mockResolvedValue({ _avg: { rawMaterial: 100 } } as any);

      const result = await computeDynamicSupplierScore('sup-1');
      expect(result).not.toBeNull();
      expect(result!.deliveryScore).toBeGreaterThanOrEqual(0);
      expect(result!.deliveryScore).toBeLessThanOrEqual(100);
      expect(result!.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result!.qualityScore).toBeLessThanOrEqual(100);
      expect(result!.overall).toBeGreaterThanOrEqual(0);
      expect(result!.overall).toBeLessThanOrEqual(5);
      expect(typeof result!.breakdown).toBe('string');
    }, 15000); // 15秒超时（动态评分计算较慢）
  });

  // ── getSuppliersList ──
  describe('getSuppliersList', () => {
    it('应返回分页供应商列表', async () => {
      vi.mocked(db.supplier.findMany).mockResolvedValue([
        { id: '1', code: 'SUP-001', name: '供应商A', rating: 4.5, status: 'active', region: '华南', category: '电子元器件', leadTime: 15, contact: null, email: null, phone: null, ratingDetails: null, createdAt: new Date(), updatedAt: new Date() },
      ] as any);
      vi.mocked(db.supplier.count).mockResolvedValue(1);

      const result = await getSuppliersList({ page: 1, pageSize: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it('应支持按地区过滤', async () => {
      vi.mocked(db.supplier.findMany).mockResolvedValue([]);
      vi.mocked(db.supplier.count).mockResolvedValue(0);

      await getSuppliersList({ region: '华南' });
      expect(db.supplier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ region: '华南' }),
        })
      );
    });

    it('应支持按状态过滤', async () => {
      vi.mocked(db.supplier.findMany).mockResolvedValue([]);
      vi.mocked(db.supplier.count).mockResolvedValue(0);

      await getSuppliersList({ status: 'active' });
      expect(db.supplier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'active' }),
        })
      );
    });
  });

  // ── getSupplierByCode ──
  describe('getSupplierByCode', () => {
    it('应按编码返回供应商详情（含订单历史）', async () => {
      vi.mocked(db.supplier.findUnique).mockResolvedValue({
        id: '1',
        code: 'SUP-GD001',
        name: '深圳电子',
        region: '华南',
        category: '电子元器件',
        leadTime: 15,
        rating: 4.5,
        status: 'active',
        contact: '张三',
        email: 'zhangsan@example.com',
        phone: '13800138000',
        ratingDetails: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await getSupplierByCode('SUP-GD001');
      expect(result).not.toBeNull();
      expect(result!.supplier.code).toBe('SUP-GD001');
      expect(result!.supplier.name).toBe('深圳电子');
      expect(result!.orderHistory).toEqual([]);
    });

    it('应在供应商不存在时返回 null', async () => {
      vi.mocked(db.supplier.findUnique).mockResolvedValue(null);
      const result = await getSupplierByCode('NONEXISTENT');
      expect(result).toBeNull();
    });
  });
});
