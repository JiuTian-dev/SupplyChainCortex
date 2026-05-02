import { z } from 'zod';

// Date validation regex (YYYY-MM-DD)
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Date range schema
export const dateRangeSchema = z.object({
  startDate: z.string().regex(DATE_REGEX, 'startDate 格式无效，需要 YYYY-MM-DD').optional(),
  endDate: z.string().regex(DATE_REGEX, 'endDate 格式无效，需要 YYYY-MM-DD').optional(),
});

// Pagination schema with defaults
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

// SKU schema
export const skuSchema = z.string().min(1).max(50);

// Platform enum
export const platformSchema = z.enum(['Amazon', 'Shopify', 'Walmart', 'eBay', 'Temu']);

// Stock status enum
export const stockStatusSchema = z.enum(['healthy', 'warning', 'critical', 'overstock']);

// Priority enum
export const prioritySchema = z.enum(['normal', 'important', 'urgent']);

// Category enum
export const categorySchema = z.enum(['general', 'inventory', 'cost', 'logistics', 'sales']);

// Shipment status enum
export const shipmentStatusSchema = z.enum([
  'pending',
  'in_transit',
  'customs',
  'delivered',
  'delayed',
  'exception',
]);

// Warehouse name enum (common warehouses in the system)
export const warehouseSchema = z.enum(['华东仓', '华南仓']);

// Type exports
export type DateRange = z.infer<typeof dateRangeSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type Platform = z.infer<typeof platformSchema>;
export type StockStatus = z.infer<typeof stockStatusSchema>;
export type Priority = z.infer<typeof prioritySchema>;
export type Category = z.infer<typeof categorySchema>;
export type ShipmentStatus = z.infer<typeof shipmentStatusSchema>;
