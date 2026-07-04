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
    supplier: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    user: {
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock('@/lib/services/audit.service', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1' }),
}));

vi.mock('@/lib/services/suppliers.service', () => ({
  getSuppliersList: vi.fn(),
  getSupplierByCode: vi.fn(),
  rateSupplier: vi.fn(),
  getSupplierPerformance: vi.fn(),
  createSupplier: vi.fn(),
  SUPPLIER_STATUSES: ['active', 'suspended', 'inactive'],
}));

import { GET, POST } from './route';
import {
  getSuppliersList,
  getSupplierByCode,
  getSupplierPerformance,
  createSupplier,
} from '@/lib/services/suppliers.service';

const mockGetSuppliersList = vi.mocked(getSuppliersList);
const mockGetSupplierByCode = vi.mocked(getSupplierByCode);
const mockGetSupplierPerformance = vi.mocked(getSupplierPerformance);
const mockCreateSupplier = vi.mocked(createSupplier);

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'), init as any);
}

function buildSupplier(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sup-1',
    code: 'SUP-001',
    name: '测试供应商',
    contact: '张三',
    email: 'zhangsan@example.com',
    phone: '13800000000',
    region: '华南',
    category: '电子元器件',
    leadTime: 14,
    rating: 4.2,
    ratingDetails: { deliveryScore: 8 },
    status: 'active',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-06-01'),
    ...overrides,
  };
}

describe('/api/suppliers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── GET: list & filters ───────────────────────────────────────────────

  it('GET returns supplier list with pagination by default', async () => {
    mockGetSuppliersList.mockResolvedValue({
      data: [buildSupplier()],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });

    const request = makeRequest('/api/suppliers');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.suppliers).toHaveLength(1);
    expect(json.suppliers[0].code).toBe('SUP-001');
    expect(json.pagination).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    expect(mockGetSuppliersList).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
  });

  it('GET filters by category', async () => {
    mockGetSuppliersList.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    });

    const request = makeRequest('/api/suppliers?category=电子元器件');
    await GET(request);

    expect(mockGetSuppliersList).toHaveBeenCalledWith(
      expect.objectContaining({ category: '电子元器件' }),
    );
  });

  it('GET filters by status', async () => {
    mockGetSuppliersList.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    });

    const request = makeRequest('/api/suppliers?status=active');
    await GET(request);

    expect(mockGetSuppliersList).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('GET filters by region', async () => {
    mockGetSuppliersList.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    });

    const request = makeRequest('/api/suppliers?region=华南');
    await GET(request);

    expect(mockGetSuppliersList).toHaveBeenCalledWith(
      expect.objectContaining({ region: '华南' }),
    );
  });

  it('GET applies custom pagination parameters', async () => {
    mockGetSuppliersList.mockResolvedValue({
      data: [],
      pagination: { page: 2, pageSize: 10, total: 15, totalPages: 2 },
    });

    const request = makeRequest('/api/suppliers?page=2&pageSize=10');
    await GET(request);

    expect(mockGetSuppliersList).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 10 }),
    );
  });

  it('GET combines multiple filters (region + category + status)', async () => {
    mockGetSuppliersList.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    });

    const request = makeRequest('/api/suppliers?region=华南&category=电子元器件&status=active');
    await GET(request);

    expect(mockGetSuppliersList).toHaveBeenCalledWith(
      expect.objectContaining({
        region: '华南',
        category: '电子元器件',
        status: 'active',
      }),
    );
  });

  // ─── GET: detail ───────────────────────────────────────────────────────

  it('GET action=detail returns a single supplier with order history', async () => {
    const supplier = buildSupplier();
    const orderHistory = [{ id: 'order-1', sku: 'SKU-001', status: 'delivered' }];
    mockGetSupplierByCode.mockResolvedValue({ supplier, orderHistory } as any);

    const request = makeRequest('/api/suppliers?action=detail&code=SUP-001');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.supplier.code).toBe('SUP-001');
    expect(json.orderHistory).toHaveLength(1);
    expect(mockGetSupplierByCode).toHaveBeenCalledWith('SUP-001');
  });

  it('GET action=detail without code returns 422', async () => {
    const request = makeRequest('/api/suppliers?action=detail');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.success).toBe(false);
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(mockGetSupplierByCode).not.toHaveBeenCalled();
  });

  it('GET action=detail with unknown code returns 404', async () => {
    mockGetSupplierByCode.mockResolvedValue(null);

    const request = makeRequest('/api/suppliers?action=detail&code=UNKNOWN');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.code).toBe('NOT_FOUND');
  });

  // ─── GET: performance ──────────────────────────────────────────────────

  it('GET action=performance returns supplier performance metrics', async () => {
    const performance = {
      suppliers: [],
      overallHealth: { avgHealthIndex: 80, totalSuppliers: 5, activeSuppliers: 4 },
      riskSummary: {
        highRiskCount: 1,
        mediumRiskCount: 2,
        singleSourceCategories: [],
        geographicConcentration: [],
      },
      categoryDistribution: { '电子元器件': 2 },
      regionDistribution: { '华南': 3 },
      generatedAt: new Date().toISOString(),
    };
    mockGetSupplierPerformance.mockResolvedValue(performance as any);

    const request = makeRequest('/api/suppliers?action=performance');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.overallHealth.totalSuppliers).toBe(5);
    expect(json.riskSummary.highRiskCount).toBe(1);
    expect(mockGetSupplierPerformance).toHaveBeenCalledOnce();
  });

  // ─── POST: create supplier ─────────────────────────────────────────────

  it('POST creates a new supplier with required fields', async () => {
    const created = buildSupplier();
    mockCreateSupplier.mockResolvedValue(created as any);

    const request = makeRequest('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'SUP-001',
        name: '测试供应商',
        region: '华南',
        category: '电子元器件',
      }),
    });
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.supplier.code).toBe('SUP-001');
    expect(mockCreateSupplier).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SUP-001',
        name: '测试供应商',
        region: '华南',
        category: '电子元器件',
      }),
    );
  });

  it('POST creates a supplier with optional fields', async () => {
    const created = buildSupplier({ leadTime: 7, rating: 4.5 });
    mockCreateSupplier.mockResolvedValue(created as any);

    const request = makeRequest('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'SUP-002',
        name: '完整供应商',
        contact: '李四',
        email: 'lisi@example.com',
        phone: '13900000000',
        region: '华东',
        category: '塑料/五金件',
        leadTime: 7,
        rating: 4.5,
      }),
    });
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockCreateSupplier).toHaveBeenCalledWith(
      expect.objectContaining({
        contact: '李四',
        email: 'lisi@example.com',
        phone: '13900000000',
        leadTime: 7,
        rating: 4.5,
      }),
    );
  });

  it('POST returns 422 when missing code', async () => {
    const request = makeRequest('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '测试供应商',
        region: '华南',
        category: '电子元器件',
      }),
    });
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.success).toBe(false);
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(mockCreateSupplier).not.toHaveBeenCalled();
  });

  it('POST returns 422 when missing name', async () => {
    const request = makeRequest('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'SUP-001',
        region: '华南',
        category: '电子元器件',
      }),
    });
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.success).toBe(false);
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(mockCreateSupplier).not.toHaveBeenCalled();
  });

  it('POST returns 409 when supplier code already exists', async () => {
    mockCreateSupplier.mockRejectedValue(new Error('供应商编码已存在: SUP-001'));

    const request = makeRequest('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'SUP-001',
        name: '重复供应商',
        region: '华南',
        category: '电子元器件',
      }),
    });
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.code).toBe('CONFLICT');
    expect(json.error).toContain('已存在');
  });
});
