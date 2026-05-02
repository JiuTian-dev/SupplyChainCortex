import { z } from 'zod';
import { skuSchema } from './common';

// Product search schema
export const productSearchSchema = z.object({
  q: z.string().min(2, '搜索关键词至少需要 2 个字符'),
  category: z.string().optional(),
});

// Product detail lookup by id or sku
export const productDetailSchema = z.object({
  id: z.string().optional(),
  sku: skuSchema.optional(),
}).refine((data) => data.id || data.sku, {
  message: '必须提供 id 或 sku',
  path: ['id'],
});

// Type exports
export type ProductSearch = z.infer<typeof productSearchSchema>;
export type ProductDetail = z.infer<typeof productDetailSchema>;
