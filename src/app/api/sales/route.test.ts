import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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
    product: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    salesRecord: {
      findMany: vi.fn(),
    },
    user: {
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock('@/lib/services/sales.service', () => ({
  computeSalesSummary: vi.fn(),
  detectAnomalies: vi.fn(),
  generateSalesForecast: vi.fn(),
  getSalesOverview: vi.fn(),
  getSalesSummaryForSku: vi.fn(),
  getDailySales: vi.fn(),
  getSalesForecastForSku: vi.fn(),
}));

import { GET } from './route';
import {
  getSalesOverview,
  getDailySales,
  getSalesSummaryForSku,
  generateSalesForecast,
  getSalesForecastForSku,
} from '@/lib/services/sales.service';

const mockGetSalesOverview = vi.mocked(getSalesOverview);
const mockGetDailySales = vi.mocked(getDailySales);
const mockGetSalesSummaryForSku = vi.mocked(getSalesSummaryForSku);
const mockGenerateSalesForecast = vi.mocked(generateSalesForecast);
const mockGetSalesForecastForSku = vi.mocked(getSalesForecastForSku);

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'), init as any);
}

describe('/api/sales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── action=overview ───────────────────────────────────────────────────

  it('GET action=overview returns sales overview (default action)', async () => {
    const overview = {
      period: '30天',
      productSummaries: [{ sku: 'SKU-001', productName: '产品A', totalRevenue: 10000 }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      platformDistribution: [{ platform: 'Amazon', revenue: 10000 }],
      filters: { platform: null, category: null, startDate: null, endDate: null },
    };
    mockGetSalesOverview.mockResolvedValue(overview as any);

    const request = makeRequest('/api/sales');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.productSummaries).toHaveLength(1);
    expect(json.platformDistribution[0].platform).toBe('Amazon');
    expect(mockGetSalesOverview).toHaveBeenCalledWith(
      expect.objectContaining({ days: 30 }),
    );
  });

  // ─── action=daily ──────────────────────────────────────────────────────

  it('GET action=daily returns daily sales trend', async () => {
    const daily = {
      daily: [{ date: '2024-06-01', revenue: 1000, quantity: 10, orders: 2 }],
      period: '30天',
      filters: { platform: null },
    };
    mockGetDailySales.mockResolvedValue(daily as any);

    const request = makeRequest('/api/sales?action=daily');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.daily).toHaveLength(1);
    expect(json.daily[0].revenue).toBe(1000);
    expect(mockGetDailySales).toHaveBeenCalledWith(
      expect.objectContaining({ days: 30 }),
    );
  });

  // ─── action=summary ────────────────────────────────────────────────────

  it('GET action=summary with sku returns SKU sales summary', async () => {
    const summary = {
      totalQuantity: 100,
      totalRevenue: 5000,
      avgDailySales: 3.3,
      momGrowth: 10.5,
      yoyGrowth: 8.2,
      topPlatform: 'Amazon',
      sku: 'SKU-001',
      productName: '产品A',
      category: '电子产品',
      timeSeries: [],
      filters: { platform: null },
    };
    mockGetSalesSummaryForSku.mockResolvedValue(summary as any);

    const request = makeRequest('/api/sales?action=summary&sku=SKU-001');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.sku).toBe('SKU-001');
    expect(json.totalRevenue).toBe(5000);
    expect(mockGetSalesSummaryForSku).toHaveBeenCalledWith(
      expect.objectContaining({ sku: 'SKU-001' }),
    );
  });

  it('GET action=summary without sku returns 422', async () => {
    const request = makeRequest('/api/sales?action=summary');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.success).toBe(false);
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(mockGetSalesSummaryForSku).not.toHaveBeenCalled();
  });

  it('GET action=summary with unknown sku returns 404', async () => {
    mockGetSalesSummaryForSku.mockResolvedValue(null);

    const request = makeRequest('/api/sales?action=summary&sku=UNKNOWN');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.code).toBe('NOT_FOUND');
  });

  // ─── action=forecast ───────────────────────────────────────────────────

  it('GET action=forecast without sku returns overall forecast', async () => {
    const forecast = {
      dailyProjections: [
        { date: '2024-06-01', revenue: 1000, quantity: 10, upperBound: 1200, lowerBound: 800 },
      ],
      historicalDaily: [],
      perProductForecasts: [],
      summary: {
        projectedRevenue: 14000,
        growthRate: 5.2,
        confidence: 'medium',
        method: '线性回归 + 季节性调整 (7天周期)',
        horizon: 14,
        dataPoints: 30,
      },
    };
    mockGenerateSalesForecast.mockResolvedValue(forecast as any);

    const request = makeRequest('/api/sales?action=forecast');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.summary.projectedRevenue).toBe(14000);
    expect(json.summary.horizon).toBe(14);
    expect(mockGenerateSalesForecast).toHaveBeenCalledWith(14, undefined);
  });

  it('GET action=forecast with sku returns SKU forecast', async () => {
    const skuForecast = {
      sku: 'SKU-001',
      productName: '产品A',
      forecast: [100, 110, 120],
      upperBound: [120, 130, 140],
      lowerBound: [80, 90, 100],
      confidence: 'high',
      dates: ['2024-06-01', '2024-06-02', '2024-06-03'],
      method: '简单指数平滑 (α=0.30) + 趋势修正',
      optimizedAlpha: 0.3,
      mse: 10.5,
      trendSlope: 2.1,
      historicalDates: [],
      historicalQuantities: [],
      filters: { platform: null },
    };
    mockGetSalesForecastForSku.mockResolvedValue(skuForecast as any);

    const request = makeRequest('/api/sales?action=forecast&sku=SKU-001&horizon=7');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.sku).toBe('SKU-001');
    expect(json.forecast).toHaveLength(3);
    expect(mockGetSalesForecastForSku).toHaveBeenCalledWith(
      expect.objectContaining({ sku: 'SKU-001', horizon: 7 }),
    );
  });

  it('GET action=forecast with unknown sku returns 404', async () => {
    mockGetSalesForecastForSku.mockResolvedValue(null);

    const request = makeRequest('/api/sales?action=forecast&sku=UNKNOWN');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.code).toBe('NOT_FOUND');
  });

  it('GET action=forecast with insufficient data returns 400', async () => {
    mockGenerateSalesForecast.mockRejectedValue(new Error('数据不足，无法生成预测'));

    const request = makeRequest('/api/sales?action=forecast');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe('INSUFFICIENT_DATA');
  });

  // ─── date range & platform filters ─────────────────────────────────────

  it('GET passes date range parameters (startDate, endDate) to service', async () => {
    mockGetSalesOverview.mockResolvedValue({
      period: '2024-01-01 ~ 2024-01-31',
      productSummaries: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
      platformDistribution: [],
      filters: {},
    } as any);

    const request = makeRequest('/api/sales?action=overview&startDate=2024-01-01&endDate=2024-01-31');
    await GET(request);

    expect(mockGetSalesOverview).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      }),
    );
  });

  it('GET passes platform filter to service', async () => {
    mockGetDailySales.mockResolvedValue({
      daily: [],
      period: '30天',
      filters: { platform: 'Amazon' },
    } as any);

    const request = makeRequest('/api/sales?action=daily&platform=Amazon');
    await GET(request);

    expect(mockGetDailySales).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'Amazon' }),
    );
  });

  // ─── validation errors ─────────────────────────────────────────────────

  it('GET returns 400 when startDate format is invalid', async () => {
    const request = makeRequest('/api/sales?action=overview&startDate=invalid-date');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(json.error).toContain('startDate');
    expect(mockGetSalesOverview).not.toHaveBeenCalled();
  });

  it('GET returns 400 when platform is invalid', async () => {
    const request = makeRequest('/api/sales?action=overview&platform=UnknownPlatform');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(json.error).toContain('UnknownPlatform');
  });

  it('GET returns 400 for unknown action', async () => {
    const request = makeRequest('/api/sales?action=unknown_action');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe('UNKNOWN_ACTION');
  });
});
