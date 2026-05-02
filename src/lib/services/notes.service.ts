/**
 * Notes Service - Business logic for supply chain notes operations
 * Extracted from API routes for reusability and testability
 */

import { db } from '@/lib/db';
import { serverCache } from '@/lib/cache';

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Valid note categories */
export const NOTE_CATEGORIES = ['general', 'inventory', 'cost', 'logistics', 'sales'] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

/** Valid note priorities */
export const NOTE_PRIORITIES = ['normal', 'important', 'urgent'] as const;
export type NotePriority = (typeof NOTE_PRIORITIES)[number];

/** Note list filters */
export interface NoteListFilters {
  sku?: string;
  category?: string;
  isResolved?: boolean;
  priority?: string;
  limit?: number;
  offset?: number;
}

/** Create note data */
export interface CreateNoteData {
  sku?: string;
  author?: string;
  content: string;
  category?: NoteCategory;
  priority?: NotePriority;
}

/** Update note data */
export interface UpdateNoteData {
  id: string;
  content?: string;
  priority?: NotePriority;
  isResolved?: boolean;
}

/** Note statistics */
export interface NotesStats {
  total: number;
  unresolved: number;
  resolved: number;
  resolutionRate: number;
  byPriority: {
    urgent: number;
    important: number;
    normal: number;
  };
  byCategory: {
    general: number;
    inventory: number;
    cost: number;
    logistics: number;
    sales: number;
  };
  recentUnresolved: Awaited<ReturnType<typeof db.supplyChainNote.findMany>>;
}

/** Note list result */
export interface NoteListResult {
  notes: Awaited<ReturnType<typeof db.supplyChainNote.findMany>>;
  total: number;
  unresolvedCount: number;
  limit: number;
  offset: number;
}

// ─── Core Business Logic ───────────────────────────────────────────────────────

/** Validate note category */
export function isValidNoteCategory(category: string): category is NoteCategory {
  return NOTE_CATEGORIES.includes(category as NoteCategory);
}

/** Validate note priority */
export function isValidNotePriority(priority: string): priority is NotePriority {
  return NOTE_PRIORITIES.includes(priority as NotePriority);
}

/** Get filtered/paginated notes */
export async function getNotes(filters: NoteListFilters = {}): Promise<NoteListResult> {
  const { sku, category, isResolved, priority, limit = 50, offset = 0 } = filters;

  const where: Record<string, unknown> = {};
  if (sku) where.sku = sku;
  if (category) where.category = category;
  if (isResolved !== undefined) {
    where.isResolved = isResolved;
  }
  if (priority) where.priority = priority;

  const [notes, total] = await Promise.all([
    db.supplyChainNote.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
    }),
    db.supplyChainNote.count({ where }),
  ]);

  const unresolvedCount = await db.supplyChainNote.count({
    where: { ...where, isResolved: false },
  });

  return { notes, total, unresolvedCount, limit, offset };
}

/** Create a new note */
export async function createNote(data: CreateNoteData): Promise<{
  note: Awaited<ReturnType<typeof db.supplyChainNote.create>>;
}> {
  const { sku, author, content, category, priority } = data;

  // Validate content
  if (!content || !content.trim()) {
    throw new Error('备注内容不能为空');
  }

  // SKU is optional - if provided, validate it exists
  const product = sku && sku.trim()
    ? await db.product.findFirst({ where: { sku: sku.trim() } })
    : null;
  if (sku && sku.trim() && !product) {
    throw new Error(`产品 SKU "${sku}" 不存在`);
  }

  // Validate category
  const noteCategory = category || 'general';
  if (!isValidNoteCategory(noteCategory)) {
    throw new Error(`无效的分类: ${noteCategory}，支持: ${NOTE_CATEGORIES.join('/')}`);
  }

  // Validate priority
  const notePriority = priority || 'normal';
  if (!isValidNotePriority(notePriority)) {
    throw new Error(`无效的优先级: ${notePriority}，支持: ${NOTE_PRIORITIES.join('/')}`);
  }

  const note = await db.supplyChainNote.create({
    data: {
      sku: sku?.trim() || 'GENERAL',
      author: author || '系统用户',
      content: content.trim(),
      category: noteCategory,
      priority: notePriority,
    },
  });

  // Auto-create supply chain event
  await db.supplyChainEvent.create({
    data: {
      type: '协作备注',
      title: `新增备注: ${product?.name || '通用备注'}`,
      description: `${author || '系统用户'} 添加了备注: ${content.trim().slice(0, 50)}${content.trim().length > 50 ? '...' : ''}`,
      icon: '📝',
      color: '#8b5cf6',
      severity: notePriority === 'urgent' ? 'critical' : notePriority === 'important' ? 'warning' : 'info',
      sku: sku?.trim() || 'GENERAL',
    },
  });

  // Invalidate notes cache after creation
  serverCache.invalidate('notes');

  return { note };
}

/** Update a note (including resolve) */
export async function updateNote(data: UpdateNoteData): Promise<{
  note: Awaited<ReturnType<typeof db.supplyChainNote.update>>;
}> {
  const { id, content, priority, isResolved } = data;

  const existing = await db.supplyChainNote.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('备注不存在');
  }

  const updateData: Record<string, unknown> = {};
  if (content !== undefined) updateData.content = content.trim();
  if (priority !== undefined) {
    if (!isValidNotePriority(priority)) {
      throw new Error(`无效的优先级: ${priority}，支持: ${NOTE_PRIORITIES.join('/')}`);
    }
    updateData.priority = priority;
  }
  if (isResolved !== undefined) {
    updateData.isResolved = Boolean(isResolved);
  }

  const note = await db.supplyChainNote.update({
    where: { id },
    data: updateData,
  });

  // If marking as resolved, create an event
  if (isResolved === true && !existing.isResolved) {
    await db.supplyChainEvent.create({
      data: {
        type: '备注已解决',
        title: `备注已解决: ${existing.sku}`,
        description: `${existing.author} 的备注已标记为已解决: ${existing.content.slice(0, 50)}${existing.content.length > 50 ? '...' : ''}`,
        icon: '✅',
        color: '#22c55e',
        severity: 'info',
        sku: existing.sku,
      },
    });
  }

  // Invalidate notes cache after update
  serverCache.invalidate('notes');

  return { note };
}

/** Delete a note */
export async function deleteNote(id: string): Promise<{ success: boolean; message: string }> {
  const existing = await db.supplyChainNote.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('备注不存在');
  }

  await db.supplyChainNote.delete({ where: { id } });

  // Invalidate notes cache after deletion
  serverCache.invalidate('notes');

  return { success: true, message: '备注已删除' };
}

/** Get note statistics */
export async function getNotesStats(): Promise<NotesStats> {
  const [total, unresolved, resolved] = await Promise.all([
    db.supplyChainNote.count(),
    db.supplyChainNote.count({ where: { isResolved: false } }),
    db.supplyChainNote.count({ where: { isResolved: true } }),
  ]);

  const byPriority = await Promise.all([
    db.supplyChainNote.count({ where: { priority: 'urgent' } }),
    db.supplyChainNote.count({ where: { priority: 'important' } }),
    db.supplyChainNote.count({ where: { priority: 'normal' } }),
  ]);

  const byCategory = await Promise.all([
    db.supplyChainNote.count({ where: { category: 'general' } }),
    db.supplyChainNote.count({ where: { category: 'inventory' } }),
    db.supplyChainNote.count({ where: { category: 'cost' } }),
    db.supplyChainNote.count({ where: { category: 'logistics' } }),
    db.supplyChainNote.count({ where: { category: 'sales' } }),
  ]);

  const recentNotes = await db.supplyChainNote.findMany({
    where: { isResolved: false },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  return {
    total,
    unresolved,
    resolved,
    resolutionRate: total > 0 ? Math.round((resolved / total) * 1000) / 10 : 0,
    byPriority: {
      urgent: byPriority[0],
      important: byPriority[1],
      normal: byPriority[2],
    },
    byCategory: {
      general: byCategory[0],
      inventory: byCategory[1],
      cost: byCategory[2],
      logistics: byCategory[3],
      sales: byCategory[4],
    },
    recentUnresolved: recentNotes,
  };
}
