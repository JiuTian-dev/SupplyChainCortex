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
    inventory: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    salesRecord: {
      findMany: vi.fn(),
    },
    costRecord: {
      findMany: vi.fn(),
    },
    supplyChainEvent: {
      create: vi.fn(),
    },
    user: {
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock('@/lib/cache', () => ({
  serverCache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    invalidate: vi.fn().mockReturnValue(1),
  },
}));

vi.mock('@/lib/services/audit.service', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1' }),
}));

vi.mock('@/lib/services/inventory.service', () => ({
  computeStockStatus: vi.fn().mockReturnValue('healthy'),
  computeSafetyStock: vi.fn().mockReturnValue(50),
  getInventoryList: vi.fn(),
  getInventoryOverview: vi.fn(),
  getInventoryHealth: vi.fn(),
  getInventoryHealthSummary: vi.fn(),
  getInventoryForecast: vi.fn(),
  getStockoutRiskAnalysis: vi.fn(),
  getAbcAnalysis: vi.fn(),
  getSlowMovingItems: vi.fn(),
  getReorderRecommendations: vi.fn(),
  getAlertTimeline: vi.fn(),
  getSafetyStockForSku: vi.fn(),
  getReorderAdvice: vi.fn(),
  getCapitalAnalysis: vi.fn(),
  getInventoryCapital: vi.fn(),
  bulkUpdateInventory: vi.fn(),
  adjustInventory: vi.fn(),
}));

import { GET, POST } from './route';
import {
  getInventoryList,
  getInventoryHealth,
  getInventoryHealthSummary,
  getInventoryForecast,
  getStockoutRiskAnalysis,
  getAbcAnalysis,
  getSlowMovingItems,
  getAlertTimeline,
  getInventoryOverview,
  getReorderAdvice,
  adjustInventory,
} from '@/lib/services/inventory.service';

function makeUrl(path: string): string {
  return `http://localhost:3000/api/inventory${path}`;
}

function makeInventoryRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    sku: 'SKU001',
    productName: '测试商品',
    warehouse: 'WH-A',
    quantity: 100,
    safetyStock: 50,
    reorderPoint: 80,
    inTransit: 10,
    turnoverRate: 2.5,
    turnoverDays: 146,
    stockStatus: 'healthy',
    lastSyncAt: new Date('2025-01-01'),
    productId: 'prod-1',
    ...overrides,
  };
}

describe('/api/inventory route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── GET: action=list ──────────────────────────────────────────────────────
  it('GET action=list 返回库存列表（apiSuccess 包装）', async () => {
    const listResult = {
      inventory: [makeInventoryRecord()],
      distribution: [{ status: 'healthy', count: 1, label: '健康', color: '#22c55e' }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      filters: { warehouse: null, category: null, sortBy: null, sortOrder: 'asc' },
    };
    vi.mocked(getInventoryList).mockResolvedValue(listResult as never);

    const request = new NextRequest(makeUrl('?action=list'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.inventory).toHaveLength(1);
    expect(json.data.inventory[0].sku).toBe('SKU001');
    expect(json.data.pagination).toEqual(listResult.pagination);
    expect(getInventoryList).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
    }));
  });

  it('GET action=list 正确解析分页参数 page/pageSize', async () => {
    vi.mocked(getInventoryList).mockResolvedValue({ inventory: [] } as never);

    const request = new NextRequest(makeUrl('?action=list&page=3&pageSize=50'));
    await GET(request);

    expect(getInventoryList).toHaveBeenCalledWith(expect.objectContaining({
      page: 3,
      pageSize: 50,
    }));
  });

  it('GET action=list 正确解析过滤参数 warehouse/category/skus', async () => {
    vi.mocked(getInventoryList).mockResolvedValue({ inventory: [] } as never);

    const request = new NextRequest(makeUrl('?action=list&warehouse=WH-A&category=电子&skus=SKU001,SKU002'));
    await GET(request);

    expect(getInventoryList).toHaveBeenCalledWith(expect.objectContaining({
      warehouse: 'WH-A',
      category: '电子',
      skus: ['SKU001', 'SKU002'],
    }));
  });

  // ─── GET: action=health ────────────────────────────────────────────────────
  it('GET action=health 有 sku 参数返回单个 SKU 健康度', async () => {
    const health = { sku: 'SKU001', productName: '测试商品', stockStatus: 'healthy', quantity: 100 };
    vi.mocked(getInventoryHealth).mockResolvedValue(health as never);

    const request = new NextRequest(makeUrl('?action=health&sku=SKU001'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual(health);
    expect(getInventoryHealth).toHaveBeenCalledWith('SKU001', undefined);
  });

  it('GET action=health 有 sku 但未找到时返回 404', async () => {
    vi.mocked(getInventoryHealth).mockResolvedValue(null as never);

    const request = new NextRequest(makeUrl('?action=health&sku=NOTFOUND'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain('NOTFOUND');
  });

  it('GET action=health 无 sku 返回总体健康度摘要', async () => {
    const summary = {
      critical: [{ sku: 'C1', productName: '测试商品', quantity: 10, safetyStock: 50 }],
      warning: [{ sku: 'W1', productName: '测试商品', quantity: 60, safetyStock: 50 }],
      healthyRate: Math.round((8 / 11) * 100),
      totalSkus: 11,
    };
    vi.mocked(getInventoryHealthSummary).mockResolvedValue(summary as never);

    const request = new NextRequest(makeUrl('?action=health'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.totalSkus).toBe(11);
    expect(json.data.healthyRate).toBe(Math.round((8 / 11) * 100));
    expect(json.data.critical).toHaveLength(1);
    expect(json.data.warning).toHaveLength(1);
  });

  // ─── GET: action=forecast ──────────────────────────────────────────────────
  it('GET action=forecast 返回预测数据', async () => {
    const forecast = { forecast: [{ day: 1, predictedStock: 95 }], accuracy: 0.9 };
    vi.mocked(getInventoryForecast).mockResolvedValue(forecast as never);

    const request = new NextRequest(makeUrl('?action=forecast&forecastDays=14'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.forecastDays).toBe(14);
    expect(json.forecast).toEqual(forecast.forecast);
    expect(getInventoryForecast).toHaveBeenCalledWith(14, undefined);
  });

  // ─── GET: action=abc-analysis ──────────────────────────────────────────────
  it('GET action=abc-analysis 返回 ABC 分析', async () => {
    const abcResult = {
      products: [
        { sku: 'A1', productName: 'A产品', classChanged: true, currentAbcClass: 'B', newAbcClass: 'A' },
        { sku: 'B1', productName: 'B产品', classChanged: false, currentAbcClass: 'B', newAbcClass: 'B' },
      ],
      summary: { A: 1, B: 1, C: 0 },
    };
    vi.mocked(getAbcAnalysis).mockResolvedValue(abcResult as never);

    const request = new NextRequest(makeUrl('?action=abc-analysis'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.products).toEqual(abcResult.products);
    expect(json.changes).toHaveLength(1);
    expect(json.changes[0]).toEqual({ sku: 'A1', productName: 'A产品', from: 'B', to: 'A' });
  });

  // ─── GET: action=stockout-risk ─────────────────────────────────────────────
  it('GET action=stockout-risk 返回缺货风险', async () => {
    const riskResult = { riskItems: [{ sku: 'SKU001', riskLevel: 'high' }], totalAtRisk: 1 };
    vi.mocked(getStockoutRiskAnalysis).mockResolvedValue(riskResult as never);

    const request = new NextRequest(makeUrl('?action=stockout-risk&warehouse=WH-A'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.riskPeriods).toEqual([7, 14, 30]);
    expect(json.riskItems).toEqual(riskResult.riskItems);
    expect(getStockoutRiskAnalysis).toHaveBeenCalledWith('WH-A');
  });

  // ─── GET: action=reorder ───────────────────────────────────────────────────
  it('GET action=reorder 有 sku 返回补货建议', async () => {
    vi.mocked(getReorderAdvice).mockResolvedValue({
      sku: 'SKU001',
      productName: '测试商品',
      currentStock: 30,
      safetyStock: 50,
      inTransit: 5,
      recommendedOrder: 100,
      urgency: 'urgent',
    } as never);

    const request = new NextRequest(makeUrl('?action=reorder&sku=SKU001'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.sku).toBe('SKU001');
    expect(json.recommendedOrder).toBeGreaterThanOrEqual(0);
    expect(json).toHaveProperty('urgency');
  });

  it('GET action=reorder 缺少 sku 返回 400', async () => {
    const request = new NextRequest(makeUrl('?action=reorder'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('sku');
  });

  it('GET action=reorder sku 不存在返回 404', async () => {
    vi.mocked(getReorderAdvice).mockResolvedValue({ error: 'product_not_found' } as never);

    const request = new NextRequest(makeUrl('?action=reorder&sku=NOTFOUND'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
  });

  // ─── GET: action=slow_moving ───────────────────────────────────────────────
  it('GET action=slow_moving 返回滞销品', async () => {
    const slowItems = [{ sku: 'S1', productName: '滞销品', turnoverDays: 200 }];
    vi.mocked(getSlowMovingItems).mockResolvedValue(slowItems as never);

    const request = new NextRequest(makeUrl('?action=slow_moving&days=90&warehouse=WH-A&category=电子'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(slowItems);
    expect(getSlowMovingItems).toHaveBeenCalledWith(90, 'WH-A', '电子');
  });

  // ─── GET: action=alert_timeline ────────────────────────────────────────────
  it('GET action=alert_timeline 返回告警时间线', async () => {
    const timeline = [{ id: '1', type: 'stockout', severity: 'critical', message: '缺货告警' }];
    vi.mocked(getAlertTimeline).mockResolvedValue(timeline as never);

    const request = new NextRequest(makeUrl('?action=alert_timeline&limit=10&type=stockout&severity=critical'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(timeline);
    expect(getAlertTimeline).toHaveBeenCalledWith(10, 'stockout', 'critical');
  });

  // ─── GET: action=overview ──────────────────────────────────────────────────
  it('GET action=overview 返回库存概览', async () => {
    const overview = { totalSkus: 100, totalQuantity: 5000, healthyRate: 80 };
    vi.mocked(getInventoryOverview).mockResolvedValue(overview as never);

    const request = new NextRequest(makeUrl('?action=overview&warehouse=WH-A'));
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(overview);
    expect(getInventoryOverview).toHaveBeenCalledWith('WH-A');
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

  // ─── POST: action=adjustment ───────────────────────────────────────────────
  it('POST action=adjustment 成功入库调整', async () => {
    vi.mocked(adjustInventory).mockResolvedValue({
      success: true as const,
      adjustment: {
        sku: 'SKU001',
        productName: '测试商品',
        warehouse: 'WH-A',
        previousQuantity: 100,
        adjustment: 10,
        newQuantity: 110,
        previousStatus: 'healthy',
        newStatus: 'healthy',
        reason: '采购入库',
      },
    } as never);

    const request = new NextRequest(makeUrl('?action=adjustment'), {
      method: 'POST',
      body: JSON.stringify({ sku: 'SKU001', quantity: 10, reason: '采购入库' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(request);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.adjustment.previousQuantity).toBe(100);
    expect(json.data.adjustment.adjustment).toBe(10);
    expect(json.data.adjustment.newQuantity).toBe(110);
    expect(adjustInventory).toHaveBeenCalledOnce();
  });

  it('POST action=adjustment 成功出库调整（负数）', async () => {
    vi.mocked(adjustInventory).mockResolvedValue({
      success: true as const,
      adjustment: {
        sku: 'SKU001',
        productName: '测试商品',
        warehouse: 'WH-A',
        previousQuantity: 100,
        adjustment: -20,
        newQuantity: 80,
        previousStatus: 'healthy',
        newStatus: 'warning',
        reason: '销售出库',
      },
    } as never);

    const request = new NextRequest(makeUrl('?action=adjustment'), {
      method: 'POST',
      body: JSON.stringify({ sku: 'SKU001', quantity: -20, reason: '销售出库' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(request);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.adjustment.adjustment).toBe(-20);
    expect(json.data.adjustment.newQuantity).toBe(80);
  });

  it('POST action=adjustment 缺少 sku 返回 400', async () => {
    const request = new NextRequest(makeUrl('?action=adjustment'), {
      method: 'POST',
      body: JSON.stringify({ quantity: 10, reason: '测试' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(request);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('sku');
  });

  it('POST action=adjustment 缺少 quantity 返回 400', async () => {
    const request = new NextRequest(makeUrl('?action=adjustment'), {
      method: 'POST',
      body: JSON.stringify({ sku: 'SKU001', reason: '测试' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(request);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('quantity');
  });

  it('POST action=adjustment 缺少 reason 返回 400', async () => {
    const request = new NextRequest(makeUrl('?action=adjustment'), {
      method: 'POST',
      body: JSON.stringify({ sku: 'SKU001', quantity: 10 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(request);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('reason');
  });

  it('POST action=adjustment 库存记录不存在返回 404', async () => {
    vi.mocked(adjustInventory).mockResolvedValue({
      notFound: true as const,
      message: '未找到 SKU: NOTFOUND 的库存记录',
    } as never);

    const request = new NextRequest(makeUrl('?action=adjustment'), {
      method: 'POST',
      body: JSON.stringify({ sku: 'NOTFOUND', quantity: 10, reason: '测试' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(request);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
  });

  it('POST action=adjustment 库存不足返回 400', async () => {
    vi.mocked(adjustInventory).mockResolvedValue({
      validationError: true as const,
      message: '调整后库存不能为负数。当前库存: 5，调整量: -100',
    } as never);

    const request = new NextRequest(makeUrl('?action=adjustment'), {
      method: 'POST',
      body: JSON.stringify({ sku: 'SKU001', quantity: -100, reason: '超量出库' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(request);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain('负数');
  });

  it('POST 未知 action 返回 400', async () => {
    const request = new NextRequest(makeUrl('?action=unknown'), {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(request);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });
});
