import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock API protection (rate limiter) as passthrough
vi.mock('@/lib/api-protection', () => ({
  withApiRateLimit: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth-helpers', () => ({
  optionalRequireAuth: vi.fn().mockResolvedValue(null),
  requireAdmin: vi.fn().mockResolvedValue(null),
  requireAuth: vi.fn().mockResolvedValue(null),
  getAuth: vi.fn().mockResolvedValue(null),
}));

// Mock next/cache so unstable_cache just returns the wrapped function
vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
}));

// Mock analytics queries barrel
vi.mock('@/lib/queries/analytics.queries', () => ({
  getSupplierPerformanceAnalytics: vi.fn(),
  getSupplierPerformanceAnalyticsEnhanced: vi.fn(),
  getCostOptimizationAnalytics: vi.fn(),
  getInventoryForecastAnalytics: vi.fn(),
  getSupplyChainRiskAnalytics: vi.fn(),
  getSalesForecastAnalytics: vi.fn(),
  getInventoryOptimizationAnalytics: vi.fn(),
  getCostTrendsAnalytics: vi.fn(),
  getInventoryTurnoverAnalytics: vi.fn(),
  getKPIAnalytics: vi.fn(),
  getTimeSeriesAnalytics: vi.fn(),
  getComparisonAnalytics: vi.fn(),
  getAnomaliesAnalytics: vi.fn(),
}));

// Mock reports queries barrel
vi.mock('@/lib/queries/reports.queries', () => ({
  getInventoryReport: vi.fn(),
  getCostReport: vi.fn(),
  getSalesReport: vi.fn(),
  getSupplierReport: vi.fn(),
  getFullReport: vi.fn(),
  getInventorySummary: vi.fn(),
  getCostAnalysis: vi.fn(),
  getCostSummary: vi.fn(),
  getSupplierSummary: vi.fn(),
  getExecutiveDashboard: vi.fn(),
  getPerformanceDashboard: vi.fn(),
  getInventoryReportEnhanced: vi.fn(),
  getCostReportEnhanced: vi.fn(),
  getSalesReportEnhanced: vi.fn(),
  getLogisticsReport: vi.fn(),
  getSupplierReportEnhanced: vi.fn(),
}));

import { GET } from './route';
import {
  getSupplierPerformanceAnalytics,
  getSupplierPerformanceAnalyticsEnhanced,
  getKPIAnalytics,
  getAnomaliesAnalytics,
  getCostTrendsAnalytics,
} from '@/lib/queries/analytics.queries';
import {
  getInventoryReportEnhanced,
  getCostReportEnhanced,
  getSalesReportEnhanced,
  getLogisticsReport,
  getFullReport,
  getSupplierReportEnhanced,
} from '@/lib/queries/reports.queries';

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

describe('/api/reports', () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── GET — report actions via `type` param ────────────────────────────────

  it('type=inventory_report returns the enhanced inventory report', async () => {
    const mockReport = { items: [{ sku: 'SKU1', stock: 10 }], total: 1 };
    vi.mocked(getInventoryReportEnhanced).mockResolvedValue(mockReport as any);

    const req = makeRequest('/api/reports?type=inventory_report');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(mockReport);
    expect(getInventoryReportEnhanced).toHaveBeenCalled();
  });

  it('type=cost_report returns the enhanced cost report', async () => {
    const mockReport = { costs: [{ category: 'shipping', amount: 1000 }] };
    vi.mocked(getCostReportEnhanced).mockResolvedValue(mockReport as any);

    const req = makeRequest('/api/reports?type=cost_report');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(mockReport);
    expect(getCostReportEnhanced).toHaveBeenCalled();
  });

  it('type=sales_report returns the enhanced sales report', async () => {
    const mockReport = { revenue: 50000, orders: 120 };
    vi.mocked(getSalesReportEnhanced).mockResolvedValue(mockReport as any);

    const req = makeRequest('/api/reports?type=sales_report');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(mockReport);
    expect(getSalesReportEnhanced).toHaveBeenCalled();
  });

  it('type=logistics_report returns the logistics report', async () => {
    const mockReport = { shipments: 45, delayed: 3 };
    vi.mocked(getLogisticsReport).mockResolvedValue(mockReport as any);

    const req = makeRequest('/api/reports?type=logistics_report');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(mockReport);
    expect(getLogisticsReport).toHaveBeenCalled();
  });

  it('type=supplier_report returns the enhanced supplier report', async () => {
    const mockReport = { suppliers: [{ name: 'Acme', score: 92 }] };
    vi.mocked(getSupplierReportEnhanced).mockResolvedValue(mockReport as any);

    const req = makeRequest('/api/reports?type=supplier_report');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(mockReport);
    expect(getSupplierReportEnhanced).toHaveBeenCalled();
  });

  it('type=full-report returns the full consolidated report', async () => {
    const mockReport = { inventory: {}, cost: {}, sales: {}, logistics: {} };
    vi.mocked(getFullReport).mockResolvedValue(mockReport as any);

    const req = makeRequest('/api/reports?type=full-report');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(mockReport);
    expect(getFullReport).toHaveBeenCalled();
  });

  // ─── GET — analytics actions via `action` param ───────────────────────────

  it('default action returns supplier performance analytics', async () => {
    const mockData = { avgScore: 88, suppliers: 12 };
    vi.mocked(getSupplierPerformanceAnalytics).mockResolvedValue(mockData as any);

    const req = makeRequest('/api/reports');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(mockData);
    expect(getSupplierPerformanceAnalytics).toHaveBeenCalled();
  });

  it('action=supplier_performance passes months param to enhanced query', async () => {
    const mockData = { months: 3, trend: [] };
    vi.mocked(getSupplierPerformanceAnalyticsEnhanced).mockResolvedValue(mockData as any);

    const req = makeRequest('/api/reports?action=supplier_performance&months=3');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(mockData);
    expect(getSupplierPerformanceAnalyticsEnhanced).toHaveBeenCalledWith(3);
  });

  it('action=kpi returns KPI analytics', async () => {
    const mockKpi = { revenue: 100000, inventoryTurnover: 4.5 };
    vi.mocked(getKPIAnalytics).mockResolvedValue(mockKpi as any);

    const req = makeRequest('/api/reports?action=kpi');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(mockKpi);
    expect(getKPIAnalytics).toHaveBeenCalled();
  });

  it('action=anomalies returns anomaly detection results', async () => {
    const mockAnomalies = { anomalies: [{ metric: 'cost', delta: 0.4 }] };
    vi.mocked(getAnomaliesAnalytics).mockResolvedValue(mockAnomalies as any);

    const req = makeRequest('/api/reports?action=anomalies');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(mockAnomalies);
    expect(getAnomaliesAnalytics).toHaveBeenCalled();
  });

  it('action=cost_trends passes months param', async () => {
    const mockTrends = { months: 6, series: [] };
    vi.mocked(getCostTrendsAnalytics).mockResolvedValue(mockTrends as any);

    const req = makeRequest('/api/reports?action=cost_trends&months=6');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(mockTrends);
    expect(getCostTrendsAnalytics).toHaveBeenCalledWith(6);
  });

  // ─── GET — error scenarios ────────────────────────────────────────────────

  it('unknown action returns 400 with UNKNOWN_ACTION code', async () => {
    const req = makeRequest('/api/reports?action=nonexistent_report');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe('UNKNOWN_ACTION');
    expect(json.error).toContain('nonexistent_report');
  });

  it('unknown type returns 400 with UNKNOWN_ACTION code', async () => {
    const req = makeRequest('/api/reports?type=bogus_type');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe('UNKNOWN_ACTION');
    expect(json.error).toContain('bogus_type');
  });
});
