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
    shipmentItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    supplyChainEvent: {
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

vi.mock('@/lib/services/logistics.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/logistics.service')>();
  return {
    ...actual,
    getShipmentList: vi.fn(),
    getShipmentByTracking: vi.fn(),
    updateShipmentStatus: vi.fn(),
    getShipmentEstimate: vi.fn(),
    getLogisticsRisks: vi.fn(),
  };
});

import { GET, POST } from './route';
import {
  getShipmentList,
  getShipmentByTracking,
  updateShipmentStatus,
  getShipmentEstimate,
  getLogisticsRisks,
} from '@/lib/services/logistics.service';
import { createAuditLog } from '@/lib/services/audit.service';
import { db } from '@/lib/db';

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'), init as any);
}

describe('/api/logistics', () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── GET ──────────────────────────────────────────────────────────────────

  describe('GET', () => {
    it('action=list returns the shipment list', async () => {
      const mockResult = {
        shipments: [
          { trackingNumber: 'T001', status: 'in_transit' },
          { trackingNumber: 'T002', status: 'delivered' },
        ],
        filters: { status: null, carrier: null },
      };
      vi.mocked(getShipmentList).mockResolvedValue(mockResult as any);

      const req = makeRequest('/api/logistics?action=list');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual(mockResult);
      expect(getShipmentList).toHaveBeenCalledWith({
        status: undefined,
        carrier: undefined,
        skus: undefined,
      });
    });

    it('action=list applies status filter', async () => {
      vi.mocked(getShipmentList).mockResolvedValue({
        shipments: [],
        filters: { status: 'delayed', carrier: null },
      });

      const req = makeRequest('/api/logistics?action=list&status=delayed');
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(getShipmentList).toHaveBeenCalledWith({
        status: 'delayed',
        carrier: undefined,
        skus: undefined,
      });
    });

    it('action=list applies carrier filter', async () => {
      vi.mocked(getShipmentList).mockResolvedValue({
        shipments: [],
        filters: { status: null, carrier: 'DHL' },
      });

      const req = makeRequest('/api/logistics?action=list&carrier=DHL');
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(getShipmentList).toHaveBeenCalledWith({
        status: undefined,
        carrier: 'DHL',
        skus: undefined,
      });
    });

    it('action=list applies skus filter (CSV)', async () => {
      vi.mocked(getShipmentList).mockResolvedValue({
        shipments: [],
        filters: { status: null, carrier: null },
      });

      const req = makeRequest('/api/logistics?action=list&skus=SKU1,SKU2,SKU3');
      await GET(req);

      expect(getShipmentList).toHaveBeenCalledWith({
        status: undefined,
        carrier: undefined,
        skus: ['SKU1', 'SKU2', 'SKU3'],
      });
    });

    it('action=track with trackingNumber returns shipment detail', async () => {
      const mockDetail = {
        trackingNumber: 'T001',
        productName: 'Widget',
        sku: 'SKU1',
        carrier: 'DHL',
        route: 'CN → US',
        status: 'in_transit',
        eta: null,
        actualDelivery: null,
        delayDays: 0,
        riskLevel: 'low',
        events: [],
      };
      vi.mocked(getShipmentByTracking).mockResolvedValue(mockDetail);

      const req = makeRequest('/api/logistics?action=track&trackingNumber=T001');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual(mockDetail);
      expect(getShipmentByTracking).toHaveBeenCalledWith('T001');
    });

    it('action=track without trackingNumber returns 422', async () => {
      const req = makeRequest('/api/logistics?action=track');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
      expect(json.error).toContain('trackingNumber');
      expect(getShipmentByTracking).not.toHaveBeenCalled();
    });

    it('action=track with non-existent trackingNumber returns 404', async () => {
      vi.mocked(getShipmentByTracking).mockResolvedValue(null);

      const req = makeRequest('/api/logistics?action=track&trackingNumber=NOPE');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toContain('NOPE');
    });

    it('action=track with mismatched status filter returns 404', async () => {
      vi.mocked(getShipmentByTracking).mockResolvedValue({
        trackingNumber: 'T001',
        productName: 'Widget',
        sku: 'SKU1',
        carrier: 'DHL',
        route: 'CN → US',
        status: 'in_transit',
        eta: null,
        actualDelivery: null,
        delayDays: 0,
        riskLevel: 'low',
        events: [],
      });

      const req = makeRequest(
        '/api/logistics?action=track&trackingNumber=T001&status=delivered',
      );
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toContain('状态不匹配');
    });

    it('action=estimate with sku returns estimate', async () => {
      const mockEstimate = {
        sku: 'SKU1',
        productName: 'Widget',
        route: 'CN-US',
        estimate: { avgDays: 12, minDays: 8, maxDays: 18 },
        weight: 1.5,
        estimatedShippingCost: 5.25,
      };
      vi.mocked(getShipmentEstimate).mockResolvedValue(mockEstimate);

      const req = makeRequest('/api/logistics?action=estimate&sku=SKU1');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual(mockEstimate);
      expect(getShipmentEstimate).toHaveBeenCalledWith('SKU1', 'CN-US');
    });

    it('action=estimate without sku returns 422', async () => {
      const req = makeRequest('/api/logistics?action=estimate');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
      expect(json.error).toContain('sku');
      expect(getShipmentEstimate).not.toHaveBeenCalled();
    });

    it('action=risk returns logistics risks', async () => {
      const mockRisks = {
        totalRisks: 5,
        criticalCount: 1,
        highCount: 1,
        risks: [
          { type: '港口拥堵', description: 'desc', severity: 'high', affectedRoutes: ['CN-US'] },
        ],
      };
      vi.mocked(getLogisticsRisks).mockResolvedValue(mockRisks as any);

      const req = makeRequest('/api/logistics?action=risk');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual(mockRisks);
      expect(getLogisticsRisks).toHaveBeenCalled();
    });

    it('unknown action returns 400', async () => {
      const req = makeRequest('/api/logistics?action=unknown_action');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('unknown_action');
    });

    it('invalid status filter returns 400', async () => {
      const req = makeRequest('/api/logistics?action=list&status=not_a_status');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.code).toBe('VALIDATION_ERROR');
      expect(getShipmentList).not.toHaveBeenCalled();
    });
  });

  // ─── POST ─────────────────────────────────────────────────────────────────

  describe('POST', () => {
    it('updates shipment status successfully and writes audit log', async () => {
      const mockResult = {
        success: true,
        shipment: { trackingNumber: 'T001', status: 'delivered', eta: null, actualDelivery: null },
      };
      vi.mocked(updateShipmentStatus).mockResolvedValue(mockResult);
      vi.mocked(db.shipmentItem.findUnique).mockResolvedValue({
        id: 'ship-1',
        trackingNumber: 'T001',
        sku: 'SKU1',
      } as never);

      const req = makeRequest('/api/logistics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_status',
          trackingNumber: 'T001',
          status: 'delivered',
          progress: 100,
          notes: '送达',
        }),
      });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual(mockResult);
      expect(updateShipmentStatus).toHaveBeenCalledWith(
        'T001',
        expect.objectContaining({ status: 'delivered', progress: 100, notes: '送达' }),
      );
      expect(db.shipmentItem.findUnique).toHaveBeenCalledWith({
        where: { trackingNumber: 'T001' },
      });
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          entity: 'shipment',
          entityId: 'ship-1',
        }),
      );
    });

    it('missing trackingNumber returns 422', async () => {
      const req = makeRequest('/api/logistics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_status', status: 'delivered' }),
      });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
      expect(json.error).toContain('trackingNumber');
      expect(updateShipmentStatus).not.toHaveBeenCalled();
    });

    it('missing both action and trackingNumber returns 422', async () => {
      const req = makeRequest('/api/logistics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'delivered' }),
      });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
      expect(updateShipmentStatus).not.toHaveBeenCalled();
    });

    it('invalid status returns 400', async () => {
      const req = makeRequest('/api/logistics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_status',
          trackingNumber: 'T001',
          status: 'not_a_status',
        }),
      });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.code).toBe('VALIDATION_ERROR');
      expect(updateShipmentStatus).not.toHaveBeenCalled();
    });

    it('shipment not found returns 404', async () => {
      vi.mocked(updateShipmentStatus).mockRejectedValue(new Error('未找到追踪号: T999'));

      const req = makeRequest('/api/logistics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_status',
          trackingNumber: 'T999',
          status: 'delivered',
        }),
      });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toContain('未找到');
    });

    it('service-level invalid status error returns 400', async () => {
      vi.mocked(updateShipmentStatus).mockRejectedValue(new Error('无效的状态: bogus'));

      const req = makeRequest('/api/logistics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_status',
          trackingNumber: 'T001',
          status: 'delivered',
        }),
      });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('无效');
    });
  });
});
