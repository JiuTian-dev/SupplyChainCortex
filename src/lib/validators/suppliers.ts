import { z } from 'zod';

// Supplier rating sub-scores (0-5 scale)
export const supplierRatingSchema = z.object({
  deliveryScore: z.number().min(0).max(5, '交付评分必须在 0-5 之间'),
  qualityScore: z.number().min(0).max(5, '质量评分必须在 0-5 之间'),
  priceScore: z.number().min(0).max(5, '价格评分必须在 0-5 之间'),
  communicationScore: z.number().min(0).max(5, '沟通评分必须在 0-5 之间'),
  comments: z.string().max(500).optional(),
});

// Type exports
export type SupplierRating = z.infer<typeof supplierRatingSchema>;
