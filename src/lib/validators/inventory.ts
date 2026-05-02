import { z } from 'zod';
import { skuSchema, stockStatusSchema, warehouseSchema } from './common';

// Stock adjustment: inbound (positive) or outbound (negative)
export const inventoryAdjustmentSchema = z.object({
  sku: skuSchema,
  quantity: z.number().int().refine(v => v !== 0, '数量不能为零'),
  reason: z.string().min(1, '调整原因不能为空').max(200),
});

// Bulk update schema for batch inventory updates
export const inventoryBulkUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().optional(),
        sku: skuSchema.optional(),
        warehouse: warehouseSchema.optional(),
        quantity: z.number().int().min(0).optional(),
        safetyStock: z.number().int().min(0).optional(),
        reorderPoint: z.number().int().min(0).optional(),
        stockStatus: stockStatusSchema.optional(),
      })
    )
    .min(1, '更新列表不能为空')
    .max(100, '批量更新最多支持 100 条记录'),
});

// Stock transfer between warehouses/zones
export const stockTransferSchema = z.object({
  sku: skuSchema,
  fromWarehouse: warehouseSchema,
  toWarehouse: warehouseSchema,
  quantity: z.number().int().positive('调拨数量必须为正整数'),
}).refine((data) => data.fromWarehouse !== data.toWarehouse, {
  message: '源仓库和目标仓库不能相同',
  path: ['toWarehouse'],
});

// Type exports
export type InventoryAdjustment = z.infer<typeof inventoryAdjustmentSchema>;
export type InventoryBulkUpdate = z.infer<typeof inventoryBulkUpdateSchema>;
export type StockTransfer = z.infer<typeof stockTransferSchema>;
