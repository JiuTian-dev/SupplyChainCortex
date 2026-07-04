/**
 * Cost Service Tests
 *
 * 测试覆盖：
 * - computeCostBreakdown: 成本分解计算
 * - computeMarginAnalysis: 毛利率分析
 * - getLiveExchangeRates: 实时汇率获取（含缓存和降级）
 * - getRateForCurrency: 单一货币汇率
 * - invalidateFxCache: 缓存失效
 * - getCostOverview: 成本概览（含 DB mock）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeCostBreakdown,
  computeMarginAnalysis,
  getLiveExchangeRates,
  getRateForCurrency,
  invalidateFxCache,
  getCostOverview,
  setCostSseBroadcaster,
} from './cost.service';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    costRecord: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

vi.mock('@/lib/cache', () => ({
  serverCache: { get: vi.fn().mockReturnValue(null), set: vi.fn(), invalidate: vi.fn() },
  cachedFetch: vi.fn((_key, fetcher) => fetcher()),
  cacheKey: (...parts: (string | number | boolean)[]) => parts.join(':'),
  CACHE_TTL: { SHORT: 15, MEDIUM: 60, LONG: 300, VERY_LONG: 900 },
}));

vi.mock('@/lib/exchange-rate', () => ({
  getRateForDestination: vi.fn().mockResolvedValue(7.25),
}));

vi.mock('@/lib/queries/exchange-rate.queries', () => ({
  getLatestRates: vi.fn(),
  getRateHistory: vi.fn(),
}));

vi.mock('@/lib/services/tariff.service', () => ({
  computeTariff: vi.fn().mockResolvedValue({ tariffRate: 0.175, tariffAmount: 7.0 }),
}));

// Import mocked modules for per-test configuration
import { db } from '@/lib/db';
import { getLatestRates } from '@/lib/queries/exchange-rate.queries';

// ─── Test Setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  invalidateFxCache();
  setCostSseBroadcaster(null);
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Cost Service', () => {
  // ── computeCostBreakdown ──
  describe('computeCostBreakdown', () => {
    it('应正确计算各项成本占比（百分比保留1位小数）', () => {
      const record = {
        rawMaterial: 50,
        labor: 30,
        logistics: 10,
        tariff: 5,
        platformFee: 5,
        totalLanded: 100,
      };
      const breakdown = computeCostBreakdown(record);
      expect(breakdown).toHaveLength(5);
      expect(breakdown[0]).toEqual({ name: '原材料', value: 50, percentage: 50 });
      expect(breakdown[1]).toEqual({ name: '人工', value: 30, percentage: 30 });
      expect(breakdown[2]).toEqual({ name: '物流', value: 10, percentage: 10 });
      expect(breakdown[3]).toEqual({ name: '关税', value: 5, percentage: 5 });
      expect(breakdown[4]).toEqual({ name: '平台费', value: 5, percentage: 5 });
    });

    it('应处理 totalLanded 为 0 的边界（避免除零）', () => {
      const record = {
        rawMaterial: 50,
        labor: 30,
        logistics: 10,
        tariff: 5,
        platformFee: 5,
        totalLanded: 0,
      };
      // total = 0 || 1 = 1，所以百分比等于值本身
      const breakdown = computeCostBreakdown(record);
      expect(breakdown[0].percentage).toBe(5000); // 50/1 * 100 = 5000
    });

    it('应正确处理非整除的百分比（四舍五入到1位小数）', () => {
      const record = {
        rawMaterial: 33.33,
        labor: 33.33,
        logistics: 11.11,
        tariff: 11.11,
        platformFee: 11.12,
        totalLanded: 100,
      };
      const breakdown = computeCostBreakdown(record);
      expect(breakdown[0].percentage).toBe(33.3);
      expect(breakdown[2].percentage).toBe(11.1);
    });
  });

  // ── computeMarginAnalysis ──
  describe('computeMarginAnalysis', () => {
    it('应正确计算平均毛利率和分布', () => {
      const records = [
        { grossMargin: 25 },   // < 30%
        { grossMargin: 35 },   // 30-40%
        { grossMargin: 45 },   // 40-50%
        { grossMargin: 55 },   // 50-60%
        { grossMargin: 65 },   // ≥ 60%
      ];
      const result = computeMarginAnalysis(records);
      expect(result.avgMargin).toBe(45); // (25+35+45+55+65)/5 = 45
      expect(result.lowMarginCount).toBe(2);  // 25, 35 < 40
      expect(result.highMarginCount).toBe(1); // 65 >= 60
      expect(result.marginDistribution).toHaveLength(5);
      expect(result.marginDistribution[0].count).toBe(1); // < 30%
      expect(result.marginDistribution[1].count).toBe(1); // 30-40%
      expect(result.marginDistribution[2].count).toBe(1); // 40-50%
      expect(result.marginDistribution[3].count).toBe(1); // 50-60%
      expect(result.marginDistribution[4].count).toBe(1); // ≥ 60%
    });

    it('应处理空数组', () => {
      const result = computeMarginAnalysis([]);
      expect(result.avgMargin).toBe(0);
      expect(result.lowMarginCount).toBe(0);
      expect(result.highMarginCount).toBe(0);
      expect(result.marginDistribution).toEqual([]);
    });

    it('应正确分类低毛利率（< 40%）和高毛利率（≥ 60%）', () => {
      const records = [
        { grossMargin: 20 },  // low
        { grossMargin: 39 },  // low
        { grossMargin: 40 },  // not low (boundary)
        { grossMargin: 59 },  // not high
        { grossMargin: 60 },  // high (boundary)
        { grossMargin: 80 },  // high
      ];
      const result = computeMarginAnalysis(records);
      expect(result.lowMarginCount).toBe(2);  // 20, 39
      expect(result.highMarginCount).toBe(2); // 60, 80
    });

    it('应正确处理边界值 30、40、50、60', () => {
      const records = [
        { grossMargin: 30 },  // 30-40%
        { grossMargin: 40 },  // 40-50%
        { grossMargin: 50 },  // 50-60%
        { grossMargin: 60 },  // ≥ 60%
      ];
      const result = computeMarginAnalysis(records);
      expect(result.marginDistribution[1].count).toBe(1); // 30-40%
      expect(result.marginDistribution[2].count).toBe(1); // 40-50%
      expect(result.marginDistribution[3].count).toBe(1); // 50-60%
      expect(result.marginDistribution[4].count).toBe(1); // ≥ 60%
    });

    it('应正确计算平均毛利率（四舍五入到1位小数）', () => {
      const records = [
        { grossMargin: 10 },
        { grossMargin: 11 },
        { grossMargin: 11 },
      ];
      // (10+11+11)/3 = 10.666... → 10.7
      const result = computeMarginAnalysis(records);
      expect(result.avgMargin).toBe(10.7);
    });
  });

  // ── getLiveExchangeRates ──
  describe('getLiveExchangeRates', () => {
    it('应从外部 API 获取汇率', async () => {
      vi.mocked(getLatestRates).mockResolvedValue({
        base: 'CNY',
        date: '2026-06-17',
        rates: { USD: 0.138, EUR: 0.128, GBP: 0.109, JPY: 20.5 },
      } as any);

      const result = await getLiveExchangeRates();
      expect(result.source).toBe('external');
      expect(result.base).toBe('CNY');
      expect(result.rates).toHaveLength(4);
      expect(result.rates.find(r => r.currency === 'USD')?.rate).toBe(0.138);
    });

    it('应在 API 失败时降级到 DB 兜底数据', async () => {
      vi.mocked(getLatestRates).mockRejectedValue(new Error('API down'));
      vi.mocked(db.costRecord.findMany).mockResolvedValue([
        { exchangeRate: 7.25, destination: 'US' },
      ] as any);

      const result = await getLiveExchangeRates();
      expect(result.source).toBe('fallback');
      expect(result.rates.length).toBeGreaterThan(0);
    });

    it('应在 30 分钟内使用缓存数据（不重复调用 API）', async () => {
      vi.mocked(getLatestRates).mockResolvedValue({
        base: 'CNY',
        date: '2026-06-17',
        rates: { USD: 0.138 },
      } as any);

      // 第一次调用
      await getLiveExchangeRates();
      // 第二次调用（应命中缓存）
      await getLiveExchangeRates();
      expect(getLatestRates).toHaveBeenCalledTimes(1);
    });

    it('应通过 invalidateFxCache 清除缓存后重新获取', async () => {
      vi.mocked(getLatestRates).mockResolvedValue({
        base: 'CNY',
        date: '2026-06-17',
        rates: { USD: 0.138 },
      } as any);

      await getLiveExchangeRates();
      invalidateFxCache();
      await getLiveExchangeRates();
      expect(getLatestRates).toHaveBeenCalledTimes(2);
    });
  });

  // ── getRateForCurrency ──
  describe('getRateForCurrency', () => {
    it('应返回指定货币的汇率', async () => {
      vi.mocked(getLatestRates).mockResolvedValue({
        base: 'CNY',
        date: '2026-06-17',
        rates: { USD: 0.138, EUR: 0.128 },
      } as any);

      const rate = await getRateForCurrency('USD');
      expect(rate).toBe(0.138);
    });

    it('应在货币不存在时返回兜底值 1/7.25', async () => {
      vi.mocked(getLatestRates).mockResolvedValue({
        base: 'CNY',
        date: '2026-06-17',
        rates: { USD: 0.138 },
      } as any);

      const rate = await getRateForCurrency('XYZ');
      // 未找到货币时返回 1/7.25 ≈ 0.1379（兜底 USD 汇率）
      expect(rate).toBeCloseTo(1 / 7.25, 10);
    });
  });

  // ── getCostOverview ──
  describe('getCostOverview', () => {
    it('应正确计算成本概览统计', async () => {
      vi.mocked(getLatestRates).mockResolvedValue({
        base: 'CNY',
        date: '2026-06-17',
        rates: { USD: 0.138 },
      } as any);
      vi.mocked(db.costRecord.findMany).mockResolvedValue([
        { totalLanded: 100, grossMargin: 50 },
        { totalLanded: 200, grossMargin: 60 },
        { totalLanded: 150, grossMargin: 30 },
      ] as any);

      const result = await getCostOverview();
      expect(result.totalProducts).toBe(3);
      expect(result.avgTotalLanded).toBe(150); // (100+200+150)/3
      expect(result.avgGrossMargin).toBe(46.7); // (50+60+30)/3 = 46.666...
      expect(result.totalLandedRange.min).toBe(100);
      expect(result.totalLandedRange.max).toBe(200);
    });

    it('应处理无成本记录的场景', async () => {
      vi.mocked(getLatestRates).mockResolvedValue({
        base: 'CNY',
        date: '2026-06-17',
        rates: { USD: 0.138 },
      } as any);
      vi.mocked(db.costRecord.findMany).mockResolvedValue([] as any);

      const result = await getCostOverview();
      expect(result.totalProducts).toBe(0);
      expect(result.avgTotalLanded).toBe(0);
      expect(result.avgGrossMargin).toBe(0);
      expect(result.totalLandedRange).toEqual({ min: 0, max: 0 });
    });

    it('应支持按品类过滤', async () => {
      vi.mocked(getLatestRates).mockResolvedValue({
        base: 'CNY',
        date: '2026-06-17',
        rates: { USD: 0.138 },
      } as any);
      vi.mocked(db.costRecord.findMany).mockResolvedValue([
        { totalLanded: 100, grossMargin: 50 },
      ] as any);

      await getCostOverview('咖啡机');
      expect(db.costRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ product: { category: '咖啡机' } }),
        })
      );
    });
  });

  // ── SSE Broadcaster ──
  describe('SSE Broadcaster', () => {
    it('应在设置广播器后不抛出错误', () => {
      const broadcaster = vi.fn();
      expect(() => setCostSseBroadcaster(broadcaster)).not.toThrow();
      // 清理
      setCostSseBroadcaster(null);
    });
  });
});
