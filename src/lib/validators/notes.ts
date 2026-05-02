import { z } from 'zod';
import { categorySchema, prioritySchema, skuSchema } from './common';

// Create a new note
export const createNoteSchema = z.object({
  content: z.string().min(1, '备注内容不能为空').max(2000),
  category: categorySchema.default('general'),
  priority: prioritySchema.default('normal'),
  author: z.string().max(100).optional(),
  sku: skuSchema.optional(),
});

// Update an existing note
export const updateNoteSchema = z.object({
  id: z.string().min(1, '备注 ID 不能为空'),
  isResolved: z.boolean().optional(),
  priority: prioritySchema.optional(),
});

// Type exports
export type CreateNote = z.infer<typeof createNoteSchema>;
export type UpdateNote = z.infer<typeof updateNoteSchema>;
