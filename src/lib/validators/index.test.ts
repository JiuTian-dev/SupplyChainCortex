import { describe, it, expect } from 'vitest';
import {
  DATE_REGEX,
  dateRangeSchema,
  paginationSchema,
  skuSchema,
  platformSchema,
  stockStatusSchema,
  prioritySchema,
  categorySchema,
  shipmentStatusSchema,
  warehouseSchema,
  inventoryAdjustmentSchema,
  inventoryBulkUpdateSchema,
  stockTransferSchema,
  shipmentStatusUpdateSchema,
  VALID_STATUS_TRANSITIONS,
  isValidStatusTransition,
  createNoteSchema,
  updateNoteSchema,
  productSearchSchema,
  productDetailSchema,
  supplierRatingSchema,
} from './index';

describe('Validators', () => {
  // ─── Common Validators ──────────────────────────────────────────────────────────

  describe('DATE_REGEX', () => {
    it('matches valid YYYY-MM-DD format', () => {
      expect(DATE_REGEX.test('2024-01-15')).toBe(true);
      expect(DATE_REGEX.test('2023-12-31')).toBe(true);
    });

    it('rejects invalid date formats', () => {
      expect(DATE_REGEX.test('2024/01/15')).toBe(false);
      expect(DATE_REGEX.test('01-15-2024')).toBe(false);
      expect(DATE_REGEX.test('2024-1-5')).toBe(false);
      expect(DATE_REGEX.test('not-a-date')).toBe(false);
      expect(DATE_REGEX.test('')).toBe(false);
    });
  });

  describe('dateRangeSchema', () => {
    it('validates valid date range', () => {
      const result = dateRangeSchema.safeParse({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional date fields', () => {
      const result = dateRangeSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts only startDate', () => {
      const result = dateRangeSchema.safeParse({ startDate: '2024-01-01' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid date format', () => {
      const result = dateRangeSchema.safeParse({
        startDate: '2024/01/01',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('paginationSchema', () => {
    it('provides default values', () => {
      const result = paginationSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.pageSize).toBe(20);
      }
    });

    it('coerces string values to numbers', () => {
      const result = paginationSchema.safeParse({ page: '3', pageSize: '50' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(3);
        expect(result.data.pageSize).toBe(50);
      }
    });

    it('rejects page = 0', () => {
      const result = paginationSchema.safeParse({ page: 0, pageSize: 20 });
      expect(result.success).toBe(false);
    });

    it('rejects negative page', () => {
      const result = paginationSchema.safeParse({ page: -1, pageSize: 20 });
      expect(result.success).toBe(false);
    });

    it('rejects pageSize > 100', () => {
      const result = paginationSchema.safeParse({ page: 1, pageSize: 101 });
      expect(result.success).toBe(false);
    });

    it('accepts pageSize = 100 (boundary)', () => {
      const result = paginationSchema.safeParse({ page: 1, pageSize: 100 });
      expect(result.success).toBe(true);
    });

    it('rejects non-integer pageSize', () => {
      const result = paginationSchema.safeParse({ page: 1, pageSize: 20.5 });
      expect(result.success).toBe(false);
    });
  });

  describe('skuSchema', () => {
    it('accepts valid SKU', () => {
      const result = skuSchema.safeParse('SKU-001');
      expect(result.success).toBe(true);
    });

    it('rejects empty string', () => {
      const result = skuSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('rejects string > 50 chars', () => {
      const result = skuSchema.safeParse('a'.repeat(51));
      expect(result.success).toBe(false);
    });

    it('accepts string of exactly 50 chars', () => {
      const result = skuSchema.safeParse('a'.repeat(50));
      expect(result.success).toBe(true);
    });
  });

  describe('platformSchema', () => {
    it('accepts valid platforms', () => {
      for (const platform of ['Amazon', 'Shopify', 'Walmart', 'eBay', 'Temu']) {
        expect(platformSchema.safeParse(platform).success).toBe(true);
      }
    });

    it('rejects invalid platform', () => {
      expect(platformSchema.safeParse('Invalid').success).toBe(false);
    });
  });

  describe('stockStatusSchema', () => {
    it('accepts valid statuses', () => {
      for (const status of ['healthy', 'warning', 'critical', 'overstock']) {
        expect(stockStatusSchema.safeParse(status).success).toBe(true);
      }
    });

    it('rejects invalid status', () => {
      expect(stockStatusSchema.safeParse('unknown').success).toBe(false);
    });
  });

  describe('prioritySchema', () => {
    it('accepts valid priorities', () => {
      for (const p of ['normal', 'important', 'urgent']) {
        expect(prioritySchema.safeParse(p).success).toBe(true);
      }
    });

    it('rejects invalid priority', () => {
      expect(prioritySchema.safeParse('high').success).toBe(false);
    });
  });

  describe('categorySchema', () => {
    it('accepts valid categories', () => {
      for (const c of ['general', 'inventory', 'cost', 'logistics', 'sales']) {
        expect(categorySchema.safeParse(c).success).toBe(true);
      }
    });

    it('rejects invalid category', () => {
      expect(categorySchema.safeParse('finance').success).toBe(false);
    });
  });

  describe('shipmentStatusSchema', () => {
    it('accepts valid statuses', () => {
      for (const s of ['pending', 'in_transit', 'customs', 'delivered', 'delayed', 'exception']) {
        expect(shipmentStatusSchema.safeParse(s).success).toBe(true);
      }
    });

    it('rejects invalid status', () => {
      expect(shipmentStatusSchema.safeParse('shipped').success).toBe(false);
    });
  });

  describe('warehouseSchema', () => {
    it('accepts valid warehouses', () => {
      expect(warehouseSchema.safeParse('华东仓').success).toBe(true);
      expect(warehouseSchema.safeParse('华南仓').success).toBe(true);
    });

    it('rejects invalid warehouse', () => {
      expect(warehouseSchema.safeParse('华北仓').success).toBe(false);
    });
  });

  // ─── Inventory Validators ───────────────────────────────────────────────────────

  describe('inventoryAdjustmentSchema', () => {
    it('validates positive adjustment (inbound)', () => {
      const result = inventoryAdjustmentSchema.safeParse({
        sku: 'SKU-001',
        quantity: 100,
        reason: '采购入库',
      });
      expect(result.success).toBe(true);
    });

    it('validates negative adjustment (outbound)', () => {
      const result = inventoryAdjustmentSchema.safeParse({
        sku: 'SKU-001',
        quantity: -50,
        reason: '出库',
      });
      expect(result.success).toBe(true);
    });

    it('rejects zero quantity', () => {
      const result = inventoryAdjustmentSchema.safeParse({
        sku: 'SKU-001',
        quantity: 0,
        reason: '无变化',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty reason', () => {
      const result = inventoryAdjustmentSchema.safeParse({
        sku: 'SKU-001',
        quantity: 10,
        reason: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects reason > 200 chars', () => {
      const result = inventoryAdjustmentSchema.safeParse({
        sku: 'SKU-001',
        quantity: 10,
        reason: 'a'.repeat(201),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('inventoryBulkUpdateSchema', () => {
    it('validates bulk update with valid data', () => {
      const result = inventoryBulkUpdateSchema.safeParse({
        updates: [{ sku: 'SKU-001', quantity: 100 }],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty updates array', () => {
      const result = inventoryBulkUpdateSchema.safeParse({
        updates: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects updates with > 100 items', () => {
      const result = inventoryBulkUpdateSchema.safeParse({
        updates: Array.from({ length: 101 }, (_, i) => ({ sku: `SKU-${i}` })),
      });
      expect(result.success).toBe(false);
    });

    it('accepts updates with exactly 100 items', () => {
      const result = inventoryBulkUpdateSchema.safeParse({
        updates: Array.from({ length: 100 }, (_, i) => ({ sku: `SKU-${i}` })),
      });
      expect(result.success).toBe(true);
    });

    it('validates update item with negative quantity is rejected', () => {
      const result = inventoryBulkUpdateSchema.safeParse({
        updates: [{ sku: 'SKU-001', quantity: -5 }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('stockTransferSchema', () => {
    it('validates transfer between different warehouses', () => {
      const result = stockTransferSchema.safeParse({
        sku: 'SKU-001',
        fromWarehouse: '华东仓',
        toWarehouse: '华南仓',
        quantity: 50,
      });
      expect(result.success).toBe(true);
    });

    it('rejects transfer to same warehouse', () => {
      const result = stockTransferSchema.safeParse({
        sku: 'SKU-001',
        fromWarehouse: '华东仓',
        toWarehouse: '华东仓',
        quantity: 50,
      });
      expect(result.success).toBe(false);
    });

    it('rejects zero quantity', () => {
      const result = stockTransferSchema.safeParse({
        sku: 'SKU-001',
        fromWarehouse: '华东仓',
        toWarehouse: '华南仓',
        quantity: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative quantity', () => {
      const result = stockTransferSchema.safeParse({
        sku: 'SKU-001',
        fromWarehouse: '华东仓',
        toWarehouse: '华南仓',
        quantity: -10,
      });
      expect(result.success).toBe(false);
    });
  });

  // ─── Logistics Validators ────────────────────────────────────────────────────────

  describe('shipmentStatusUpdateSchema', () => {
    it('validates status update with required fields', () => {
      const result = shipmentStatusUpdateSchema.safeParse({
        trackingNumber: 'TN-001',
        status: 'in_transit',
      });
      expect(result.success).toBe(true);
    });

    it('validates status update with all optional fields', () => {
      const result = shipmentStatusUpdateSchema.safeParse({
        trackingNumber: 'TN-001',
        status: 'in_transit',
        eta: '2024-12-31',
        progress: 60,
        notes: 'On the way',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty tracking number', () => {
      const result = shipmentStatusUpdateSchema.safeParse({
        trackingNumber: '',
        status: 'in_transit',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid status', () => {
      const result = shipmentStatusUpdateSchema.safeParse({
        trackingNumber: 'TN-001',
        status: 'unknown',
      });
      expect(result.success).toBe(false);
    });

    it('rejects progress > 100', () => {
      const result = shipmentStatusUpdateSchema.safeParse({
        trackingNumber: 'TN-001',
        status: 'in_transit',
        progress: 101,
      });
      expect(result.success).toBe(false);
    });

    it('rejects progress < 0', () => {
      const result = shipmentStatusUpdateSchema.safeParse({
        trackingNumber: 'TN-001',
        status: 'in_transit',
        progress: -1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid ETA format', () => {
      const result = shipmentStatusUpdateSchema.safeParse({
        trackingNumber: 'TN-001',
        status: 'in_transit',
        eta: 'not-a-date',
      });
      expect(result.success).toBe(false);
    });

    it('accepts progress at boundaries (0 and 100)', () => {
      const r1 = shipmentStatusUpdateSchema.safeParse({
        trackingNumber: 'TN-001',
        status: 'pending',
        progress: 0,
      });
      expect(r1.success).toBe(true);

      const r2 = shipmentStatusUpdateSchema.safeParse({
        trackingNumber: 'TN-001',
        status: 'delivered',
        progress: 100,
      });
      expect(r2.success).toBe(true);
    });
  });

  describe('VALID_STATUS_TRANSITIONS', () => {
    it('pending can transition to in_transit or delayed', () => {
      expect(VALID_STATUS_TRANSITIONS.pending).toContain('in_transit');
      expect(VALID_STATUS_TRANSITIONS.pending).toContain('delayed');
    });

    it('delivered is terminal state', () => {
      expect(VALID_STATUS_TRANSITIONS.delivered).toEqual([]);
    });

    it('exception is terminal state', () => {
      expect(VALID_STATUS_TRANSITIONS.exception).toEqual([]);
    });

    it('delayed can transition to in_transit, customs, or delivered', () => {
      expect(VALID_STATUS_TRANSITIONS.delayed).toContain('in_transit');
      expect(VALID_STATUS_TRANSITIONS.delayed).toContain('customs');
      expect(VALID_STATUS_TRANSITIONS.delayed).toContain('delivered');
    });
  });

  describe('isValidStatusTransition', () => {
    it('returns true for valid transition', () => {
      expect(isValidStatusTransition('pending', 'in_transit')).toBe(true);
    });

    it('returns false for invalid transition', () => {
      expect(isValidStatusTransition('pending', 'delivered')).toBe(false);
    });

    it('returns false for unknown from status', () => {
      expect(isValidStatusTransition('unknown', 'in_transit')).toBe(false);
    });

    it('returns false for transition from terminal state', () => {
      expect(isValidStatusTransition('delivered', 'in_transit')).toBe(false);
    });
  });

  // ─── Notes Validators ────────────────────────────────────────────────────────────

  describe('createNoteSchema', () => {
    it('validates note with required content', () => {
      const result = createNoteSchema.safeParse({
        content: 'This is a test note',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.category).toBe('general');
        expect(result.data.priority).toBe('normal');
      }
    });

    it('provides defaults for category and priority', () => {
      const result = createNoteSchema.safeParse({
        content: 'Test',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.category).toBe('general');
        expect(result.data.priority).toBe('normal');
      }
    });

    it('rejects empty content', () => {
      const result = createNoteSchema.safeParse({
        content: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects content > 2000 chars', () => {
      const result = createNoteSchema.safeParse({
        content: 'a'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });

    it('accepts all valid categories', () => {
      for (const cat of ['general', 'inventory', 'cost', 'logistics', 'sales']) {
        const result = createNoteSchema.safeParse({
          content: 'Test note',
          category: cat,
        });
        expect(result.success).toBe(true);
      }
    });

    it('accepts all valid priorities', () => {
      for (const p of ['normal', 'important', 'urgent']) {
        const result = createNoteSchema.safeParse({
          content: 'Test note',
          priority: p,
        });
        expect(result.success).toBe(true);
      }
    });

    it('accepts optional author and sku', () => {
      const result = createNoteSchema.safeParse({
        content: 'Test note',
        author: 'John',
        sku: 'SKU-001',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('updateNoteSchema', () => {
    it('validates update with isResolved', () => {
      const result = updateNoteSchema.safeParse({
        id: 'note-1',
        isResolved: true,
      });
      expect(result.success).toBe(true);
    });

    it('validates update with priority', () => {
      const result = updateNoteSchema.safeParse({
        id: 'note-1',
        priority: 'urgent',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty id', () => {
      const result = updateNoteSchema.safeParse({
        id: '',
        isResolved: true,
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid priority', () => {
      const result = updateNoteSchema.safeParse({
        id: 'note-1',
        priority: 'high',
      });
      expect(result.success).toBe(false);
    });
  });

  // ─── Product Validators ──────────────────────────────────────────────────────────

  describe('productSearchSchema', () => {
    it('validates search with minimum query length', () => {
      const result = productSearchSchema.safeParse({ q: '咖啡' });
      expect(result.success).toBe(true);
    });

    it('rejects single character query', () => {
      const result = productSearchSchema.safeParse({ q: 'a' });
      expect(result.success).toBe(false);
    });

    it('accepts optional category', () => {
      const result = productSearchSchema.safeParse({
        q: 'test',
        category: '厨房电器',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('productDetailSchema', () => {
    it('validates lookup by id', () => {
      const result = productDetailSchema.safeParse({ id: 'prod-1' });
      expect(result.success).toBe(true);
    });

    it('validates lookup by sku', () => {
      const result = productDetailSchema.safeParse({ sku: 'SKU-001' });
      expect(result.success).toBe(true);
    });

    it('validates lookup with both id and sku', () => {
      const result = productDetailSchema.safeParse({ id: 'prod-1', sku: 'SKU-001' });
      expect(result.success).toBe(true);
    });

    it('rejects when neither id nor sku provided', () => {
      const result = productDetailSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects when both id and sku are empty/undefined', () => {
      const result = productDetailSchema.safeParse({ id: undefined, sku: undefined });
      expect(result.success).toBe(false);
    });
  });

  // ─── Supplier Validators ─────────────────────────────────────────────────────────

  describe('supplierRatingSchema', () => {
    it('validates rating with all scores', () => {
      const result = supplierRatingSchema.safeParse({
        deliveryScore: 4,
        qualityScore: 5,
        priceScore: 3,
        communicationScore: 4,
      });
      expect(result.success).toBe(true);
    });

    it('validates rating with optional comments', () => {
      const result = supplierRatingSchema.safeParse({
        deliveryScore: 5,
        qualityScore: 5,
        priceScore: 5,
        communicationScore: 5,
        comments: 'Great supplier',
      });
      expect(result.success).toBe(true);
    });

    it('accepts boundary score of 0', () => {
      const result = supplierRatingSchema.safeParse({
        deliveryScore: 0,
        qualityScore: 0,
        priceScore: 0,
        communicationScore: 0,
      });
      expect(result.success).toBe(true);
    });

    it('accepts boundary score of 5', () => {
      const result = supplierRatingSchema.safeParse({
        deliveryScore: 5,
        qualityScore: 5,
        priceScore: 5,
        communicationScore: 5,
      });
      expect(result.success).toBe(true);
    });

    it('rejects score > 5', () => {
      const result = supplierRatingSchema.safeParse({
        deliveryScore: 6,
        qualityScore: 5,
        priceScore: 5,
        communicationScore: 5,
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative score', () => {
      const result = supplierRatingSchema.safeParse({
        deliveryScore: -1,
        qualityScore: 5,
        priceScore: 5,
        communicationScore: 5,
      });
      expect(result.success).toBe(false);
    });

    it('rejects comments > 500 chars', () => {
      const result = supplierRatingSchema.safeParse({
        deliveryScore: 5,
        qualityScore: 5,
        priceScore: 5,
        communicationScore: 5,
        comments: 'a'.repeat(501),
      });
      expect(result.success).toBe(false);
    });
  });
});
