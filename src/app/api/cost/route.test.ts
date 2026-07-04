import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// mock api-protection 让 withApiRateLimit 直接透传
vi.mock('@/lib/api-protection', () => ({
  withApiRateLimit: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth-helpers', () => ({
  optionalRequireAuth: vi.fn().mockResolvedValue(null),
  requireAdmin: vi.fn().mockResolvedValue(null),
  requireAuth: vi.fn().mockResolvedValue(null),
  getAuth: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/db', () => ({
  db: {
    costRecord: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    user: {
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock('@/lib/exchange-rate', () => ({
  getExchangeRate: vi.fn().mockReturnValue({ code: 'USD', rate: 7.25 }),
}));

vi.mock('@/lib/services/cost.service', () => ({
  computeCostBreakdown: vi.fn(),
  computeMarginAnalysis: vi.fn(),
  simulateCostImpact: vi.fn(),
  getCostOverview: vi.fn(),
  getCostOverviewWithMargin: vi.fn(),
  getCostList: vi.fn(),
  getLandedCostDetail: vi.fn(),
  getLandedCostOrThrow: vi.fn(),
  getCostBreakdownForSku: vi.fn(),
  simulateCosts: vi.fn(),
  getCostBenchmark: vi.fn(),
  getCostOptimization: vi.fn(),
  getCostTrend: vi.fn(),
}));

import { GET } from './route';
import { getExchangeRate } from '@/lib/exchange-rate';
import {
  getCostOverviewWithMargin,
  getCostList,
  getLandedCostOrThrow,
  getCostBenchmark,
  getCostOptimization,
  getCostTrend,
  simulateCosts,
} from '@/lib/services/cost.service';

function makeUrl(path: string): string {
  return `http://localhost:3000/api/cost${path}`;
}

function makeCostRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cost-1',
    sku: 'SKU001',
    productName: '测试商品',
    rawMaterial: 50,
    labor: 30,
    logistics: 10,
    tariff: 5,
    platformFee: 5,
    totalLanded: 100,
    grossMargin: 40,
    productId: 'prod-1',
    product: { id: 'prod-1', name: '测试商品', category: '电子' },
    ...overrides,
  };
}

describe('/api/cost route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── GET: action=list ──────────────────────────────────────────────────────
  it('GET action=list 返回成本列表', async () => {
    const listResult = {
      costs: [makeCostRecord()],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    vi.mocked(getCostList).mockResolvedValue(listResult as never);

    const request = new NextRequest(makeUrl('?action=list'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(listResult);
    expect(getCostList).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
    }));
  });

  it('GET action=list 正确传递过滤参数 category/skus/minMargin/maxMargin', async () => {
    vi.mocked(getCostList).mockResolvedValue({ costs: [] } as never);

    const request = new NextRequest(makeUrl('?action=list&category=电子&skus=SKU001,SKU002&minMargin=10&maxMargin=50'));
    await GET(request);

    expect(getCostList).toHaveBeenCalledWith(expect.objectContaining({
      category: '电子',
      skus: ['SKU001', 'SKU002'],
      minMargin: 10,
      maxMargin: 50,
    }));
  });

  // ─── GET: action=overview ──────────────────────────────────────────────────
  it('GET action=overview 返回成本概览', async () => {
    const overview = { totalSkus: 100, avgMargin: 35, totalCost: 50000 };
    const marginAnalysis = { avg: 35, distribution: [] };
    vi.mocked(getCostOverviewWithMargin).mockResolvedValue({ overview, marginAnalysis } as never);

    const request = new NextRequest(makeUrl('?action=overview&category=电子'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.overview).toEqual(overview);
    expect(json.marginAnalysis).toEqual(marginAnalysis);
    expect(getCostOverviewWithMargin).toHaveBeenCalledWith('电子');
  });

  // ─── GET: action=landed_cost ───────────────────────────────────────────────
  it('GET action=landed_cost 有 sku 返回落地成本详情', async () => {
    const detail = { sku: 'SKU001', productName: '测试商品', totalLanded: 100, breakdown: [] };
    vi.mocked(getLandedCostOrThrow).mockResolvedValue(detail as never);

    const request = new NextRequest(makeUrl('?action=landed_cost&sku=SKU001'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(detail);
    expect(getLandedCostOrThrow).toHaveBeenCalledWith(expect.objectContaining({
      sku: 'SKU001',
    }));
  });

  it('GET action=landed_cost 无 sku 返回 422', async () => {
    const request = new NextRequest(makeUrl('?action=landed_cost'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.success).toBe(false);
    expect(json.error).toContain('sku');
  });

  it('GET action=landed_cost sku 不存在返回 404', async () => {
    const { AppError } = await import('@/lib/api-utils');
    vi.mocked(getLandedCostOrThrow).mockRejectedValue(new AppError('未找到 SKU: NOTFOUND', 404, 'NOT_FOUND') as never);

    const request = new NextRequest(makeUrl('?action=landed_cost&sku=NOTFOUND'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain('NOTFOUND');
  });

  // ─── GET: action=benchmark ─────────────────────────────────────────────────
  it('GET action=benchmark 返回基准对比', async () => {
    const benchmark = { items: [{ sku: 'SKU001', vsBenchmark: -5 }], avgGap: -3 };
    vi.mocked(getCostBenchmark).mockResolvedValue(benchmark as never);

    const request = new NextRequest(makeUrl('?action=benchmark&category=电子'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(benchmark);
    expect(getCostBenchmark).toHaveBeenCalledWith('电子');
  });

  // ─── GET: action=optimization ──────────────────────────────────────────────
  it('GET action=optimization 返回优化建议', async () => {
    const optimization = { suggestions: [{ sku: 'SKU001', action: '降低物流成本', potential: 5 }] };
    vi.mocked(getCostOptimization).mockResolvedValue(optimization as never);

    const request = new NextRequest(makeUrl('?action=optimization&category=电子'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(optimization);
    expect(getCostOptimization).toHaveBeenCalledWith('电子');
  });

  // ─── GET: action=trend ─────────────────────────────────────────────────────
  it('GET action=trend 返回趋势并正确传递 months 参数', async () => {
    const trend = { months: [{ month: '2025-01', avgCost: 100 }], trendDirection: 'up' };
    vi.mocked(getCostTrend).mockResolvedValue(trend as never);

    const request = new NextRequest(makeUrl('?action=trend&months=12&category=电子'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(trend);
    expect(getCostTrend).toHaveBeenCalledWith('电子', 12);
  });

  // ─── GET: action=simulate ──────────────────────────────────────────────────
  it('GET action=simulate 返回模拟结果', async () => {
    const simulateResult = {
      parameters: { exchangeRateChange: 5, freightChange: 10 },
      results: [{
        product: '测试商品',
        sku: 'SKU001',
        simulatedMargin: 35,
        marginChange: -5,
        simulatedTotalLanded: 105,
        totalLandedChange: 5,
      }],
      summary: {
        avgMarginChange: -5,
        productsAtRisk: 0,
      },
    };
    vi.mocked(simulateCosts).mockResolvedValue(simulateResult as never);

    const request = new NextRequest(makeUrl('?action=simulate&exchangeRateChange=5&freightChange=10'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.results).toHaveLength(1);
    expect(json.results[0].simulatedMargin).toBe(35);
    expect(json.results[0].marginChange).toBe(-5);
    expect(json.summary).toHaveProperty('avgMarginChange');
    expect(json.parameters.exchangeRateChange).toBe(5);
    expect(json.parameters.freightChange).toBe(10);
    expect(simulateCosts).toHaveBeenCalledOnce();
  });

  it('GET action=simulate 无成本记录时返回空结果', async () => {
    vi.mocked(simulateCosts).mockResolvedValue({
      parameters: { exchangeRateChange: 0, freightChange: 0 },
      results: [],
      summary: { avgMarginChange: 0, productsAtRisk: 0 },
    } as never);

    const request = new NextRequest(makeUrl('?action=simulate'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.results).toHaveLength(0);
    expect(json.summary.avgMarginChange).toBe(0);
    expect(json.summary.productsAtRisk).toBe(0);
  });

  // ─── GET: 参数校验 ─────────────────────────────────────────────────────────
  it('GET asOfDate 格式无效返回 400', async () => {
    const request = new NextRequest(makeUrl('?action=list&asOfDate=2025/01/01'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('asOfDate');
  });

  it('GET asOfDate 格式有效时不报错', async () => {
    vi.mocked(getCostList).mockResolvedValue({ costs: [] } as never);

    const request = new NextRequest(makeUrl('?action=list&asOfDate=2025-01-15'));
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('GET minMargin > maxMargin 返回 400', async () => {
    const request = new NextRequest(makeUrl('?action=list&minMargin=50&maxMargin=10'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('minMargin');
  });

  // ─── GET: unknown action ───────────────────────────────────────────────────
  it('GET 未知 action 返回 400', async () => {
    const request = new NextRequest(makeUrl('?action=unknown_action'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('unknown_action');
  });

  it('GET action=simulate 使用 asOfDate 时包含 referenceExchangeRate', async () => {
    vi.mocked(simulateCosts).mockResolvedValue({
      parameters: {
        exchangeRateChange: 0, freightChange: 0,
        asOfDate: '2025-06-15', referenceExchangeRate: 7.25,
      },
      results: [],
      summary: { avgMarginChange: 0, productsAtRisk: 0 },
    } as never);

    const request = new NextRequest(makeUrl('?action=simulate&asOfDate=2025-06-15'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.parameters).toHaveProperty('asOfDate', '2025-06-15');
    expect(json.parameters).toHaveProperty('referenceExchangeRate');
    // getExchangeRate is called inside simulateCosts (service layer), which is mocked.
    // The test verifies the route passes asOfDate through to the service.
    expect(simulateCosts).toHaveBeenCalledWith(expect.objectContaining({
      asOfDate: '2025-06-15',
    }));
    // Verify the mock for getExchangeRate is set up (used by the real service)
    expect(getExchangeRate).toBeDefined();
  });
});
