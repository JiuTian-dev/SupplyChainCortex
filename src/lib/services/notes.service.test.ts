import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getNotes,
  createNote,
  updateNote,
  deleteNote,
  isValidNoteCategory,
  isValidNotePriority,
  NOTE_CATEGORIES,
  NOTE_PRIORITIES,
} from './notes.service';

// Use vi.hoisted for mock functions used in hoisted vi.mock factories
const {
  mockNoteFindMany,
  mockNoteFindUnique,
  mockNoteCreate,
  mockNoteUpdate,
  mockNoteDelete,
  mockNoteCount,
  mockEventCreate,
  mockProductFindFirst,
  mockCacheInvalidate,
} = vi.hoisted(() => ({
  mockNoteFindMany: vi.fn(),
  mockNoteFindUnique: vi.fn(),
  mockNoteCreate: vi.fn(),
  mockNoteUpdate: vi.fn(),
  mockNoteDelete: vi.fn(),
  mockNoteCount: vi.fn(),
  mockEventCreate: vi.fn(),
  mockProductFindFirst: vi.fn(),
  mockCacheInvalidate: vi.fn().mockReturnValue(1),
}));

// Mock db
vi.mock('@/lib/db', () => ({
  db: {
    supplyChainNote: {
      findMany: mockNoteFindMany,
      findUnique: mockNoteFindUnique,
      create: mockNoteCreate,
      update: mockNoteUpdate,
      delete: mockNoteDelete,
      count: mockNoteCount,
    },
    supplyChainEvent: {
      create: mockEventCreate,
    },
    product: {
      findFirst: mockProductFindFirst,
    },
  },
}));

// Mock cache
vi.mock('@/lib/cache', () => ({
  serverCache: {
    invalidate: mockCacheInvalidate,
  },
}));

describe('Notes Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isValidNoteCategory', () => {
    it('returns true for valid categories', () => {
      for (const cat of NOTE_CATEGORIES) {
        expect(isValidNoteCategory(cat)).toBe(true);
      }
    });

    it('returns false for invalid category', () => {
      expect(isValidNoteCategory('finance')).toBe(false);
      expect(isValidNoteCategory('')).toBe(false);
    });
  });

  describe('isValidNotePriority', () => {
    it('returns true for valid priorities', () => {
      for (const p of NOTE_PRIORITIES) {
        expect(isValidNotePriority(p)).toBe(true);
      }
    });

    it('returns false for invalid priority', () => {
      expect(isValidNotePriority('high')).toBe(false);
      expect(isValidNotePriority('')).toBe(false);
    });
  });

  describe('NOTE_CATEGORIES', () => {
    it('contains all expected categories', () => {
      expect(NOTE_CATEGORIES).toContain('general');
      expect(NOTE_CATEGORIES).toContain('inventory');
      expect(NOTE_CATEGORIES).toContain('cost');
      expect(NOTE_CATEGORIES).toContain('logistics');
      expect(NOTE_CATEGORIES).toContain('sales');
    });
  });

  describe('NOTE_PRIORITIES', () => {
    it('contains all expected priorities', () => {
      expect(NOTE_PRIORITIES).toContain('normal');
      expect(NOTE_PRIORITIES).toContain('important');
      expect(NOTE_PRIORITIES).toContain('urgent');
    });
  });

  describe('getNotes', () => {
    it('returns notes with default filters', async () => {
      const mockNotes = [
        { id: '1', content: 'Note 1', priority: 'urgent', isResolved: false, createdAt: new Date() },
        { id: '2', content: 'Note 2', priority: 'normal', isResolved: true, createdAt: new Date() },
      ];
      mockNoteFindMany.mockResolvedValue(mockNotes);
      mockNoteCount.mockResolvedValue(2);

      const result = await getNotes();
      expect(result.notes).toEqual(mockNotes);
      expect(result.total).toBe(2);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('applies SKU filter', async () => {
      mockNoteFindMany.mockResolvedValue([]);
      mockNoteCount.mockResolvedValue(0);

      await getNotes({ sku: 'SKU-001' });
      expect(mockNoteFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sku: 'SKU-001' }),
        })
      );
    });

    it('applies category filter', async () => {
      mockNoteFindMany.mockResolvedValue([]);
      mockNoteCount.mockResolvedValue(0);

      await getNotes({ category: 'inventory' });
      expect(mockNoteFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'inventory' }),
        })
      );
    });

    it('applies isResolved filter', async () => {
      mockNoteFindMany.mockResolvedValue([]);
      mockNoteCount.mockResolvedValue(0);

      await getNotes({ isResolved: false });
      expect(mockNoteFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isResolved: false }),
        })
      );
    });

    it('applies priority filter', async () => {
      mockNoteFindMany.mockResolvedValue([]);
      mockNoteCount.mockResolvedValue(0);

      await getNotes({ priority: 'urgent' });
      expect(mockNoteFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ priority: 'urgent' }),
        })
      );
    });

    it('applies custom limit and offset', async () => {
      mockNoteFindMany.mockResolvedValue([]);
      mockNoteCount.mockResolvedValue(0);

      const result = await getNotes({ limit: 10, offset: 20 });
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(20);
    });

    it('computes unresolved count', async () => {
      mockNoteFindMany.mockResolvedValue([]);
      mockNoteCount
        .mockResolvedValueOnce(10)   // total
        .mockResolvedValueOnce(4);    // unresolved

      const result = await getNotes();
      expect(result.total).toBe(10);
      expect(result.unresolvedCount).toBe(4);
    });
  });

  describe('createNote', () => {
    it('creates a note with valid data', async () => {
      mockProductFindFirst.mockResolvedValue({ name: 'Product A' });
      const mockNote = { id: 'note-1', content: 'Test note', category: 'general', priority: 'normal', sku: 'SKU-001' };
      mockNoteCreate.mockResolvedValue(mockNote);
      mockEventCreate.mockResolvedValue({});

      const result = await createNote({
        content: 'Test note',
        category: 'general',
        priority: 'normal',
        sku: 'SKU-001',
        author: 'Admin',
      });

      expect(result.note).toEqual(mockNote);
      expect(mockNoteCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          content: 'Test note',
          category: 'general',
          priority: 'normal',
          sku: 'SKU-001',
          author: 'Admin',
        }),
      });
    });

    it('throws error when content is empty', async () => {
      await expect(createNote({ content: '' })).rejects.toThrow('备注内容不能为空');
    });

    it('throws error when content is only whitespace', async () => {
      await expect(createNote({ content: '   ' })).rejects.toThrow('备注内容不能为空');
    });

    it('throws error when SKU does not exist', async () => {
      mockProductFindFirst.mockResolvedValue(null);

      await expect(createNote({ content: 'Test', sku: 'INVALID-SKU' })).rejects.toThrow(
        '产品 SKU "INVALID-SKU" 不存在'
      );
    });

    it('creates note without SKU', async () => {
      const mockNote = { id: 'note-1', content: 'General note', sku: 'GENERAL' };
      mockNoteCreate.mockResolvedValue(mockNote);
      mockEventCreate.mockResolvedValue({});

      const result = await createNote({ content: 'General note' });
      expect(result.note).toEqual(mockNote);
      expect(mockNoteCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sku: 'GENERAL',
        }),
      });
    });

    it('creates supply chain event on note creation', async () => {
      mockProductFindFirst.mockResolvedValue({ name: 'Product A' });
      mockNoteCreate.mockResolvedValue({ id: '1' });
      mockEventCreate.mockResolvedValue({});

      await createNote({ content: 'Important note', sku: 'SKU-001', author: 'Admin' });

      expect(mockEventCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: '协作备注',
        }),
      });
    });

    it('defaults category to general and priority to normal', async () => {
      mockNoteCreate.mockResolvedValue({ id: '1' });
      mockEventCreate.mockResolvedValue({});

      await createNote({ content: 'Test' });

      expect(mockNoteCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          category: 'general',
          priority: 'normal',
        }),
      });
    });

    it('throws error for invalid category', async () => {
      await expect(
        createNote({ content: 'Test', category: 'invalid' as 'general' })
      ).rejects.toThrow('无效的分类');
    });

    it('throws error for invalid priority', async () => {
      await expect(
        createNote({ content: 'Test', priority: 'high' as 'normal' })
      ).rejects.toThrow('无效的优先级');
    });
  });

  describe('updateNote', () => {
    it('resolves a note', async () => {
      const existingNote = { id: '1', isResolved: false, content: 'Test', author: 'Admin', sku: 'SKU-001' };
      const updatedNote = { id: '1', isResolved: true, content: 'Test', author: 'Admin', sku: 'SKU-001' };
      mockNoteFindUnique.mockResolvedValue(existingNote);
      mockNoteUpdate.mockResolvedValue(updatedNote);
      mockEventCreate.mockResolvedValue({});

      const result = await updateNote({ id: '1', isResolved: true });
      expect(result.note).toEqual(updatedNote);
      expect(mockNoteUpdate).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { isResolved: true },
      });
    });

    it('creates event when resolving note', async () => {
      const existingNote = { id: '1', isResolved: false, content: 'Test note content', author: 'Admin', sku: 'SKU-001' };
      mockNoteFindUnique.mockResolvedValue(existingNote);
      mockNoteUpdate.mockResolvedValue({ ...existingNote, isResolved: true });
      mockEventCreate.mockResolvedValue({});

      await updateNote({ id: '1', isResolved: true });

      expect(mockEventCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: '备注已解决',
        }),
      });
    });

    it('does not create event when note is already resolved', async () => {
      const existingNote = { id: '1', isResolved: true, content: 'Test', author: 'Admin', sku: 'SKU-001' };
      mockNoteFindUnique.mockResolvedValue(existingNote);
      mockNoteUpdate.mockResolvedValue(existingNote);

      await updateNote({ id: '1', isResolved: true });

      expect(mockEventCreate).not.toHaveBeenCalled();
    });

    it('updates priority', async () => {
      const existingNote = { id: '1', isResolved: false, content: 'Test', author: 'Admin', sku: 'SKU-001' };
      mockNoteFindUnique.mockResolvedValue(existingNote);
      mockNoteUpdate.mockResolvedValue({ ...existingNote, priority: 'urgent' });

      await updateNote({ id: '1', priority: 'urgent' });
      expect(mockNoteUpdate).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { priority: 'urgent' },
      });
    });

    it('throws error when note does not exist', async () => {
      mockNoteFindUnique.mockResolvedValue(null);
      await expect(updateNote({ id: 'non-existent', isResolved: true })).rejects.toThrow('备注不存在');
    });

    it('throws error for invalid priority on update', async () => {
      const existingNote = { id: '1', isResolved: false, content: 'Test', author: 'Admin', sku: 'SKU-001' };
      mockNoteFindUnique.mockResolvedValue(existingNote);

      await expect(
        updateNote({ id: '1', priority: 'high' as 'normal' })
      ).rejects.toThrow('无效的优先级');
    });
  });

  describe('deleteNote', () => {
    it('deletes an existing note', async () => {
      mockNoteFindUnique.mockResolvedValue({ id: '1', content: 'Test' });
      mockNoteDelete.mockResolvedValue({ id: '1' });

      const result = await deleteNote('1');
      expect(result.success).toBe(true);
      expect(result.message).toBe('备注已删除');
      expect(mockNoteDelete).toHaveBeenCalledWith({ where: { id: '1' } });
    });

    it('throws error when note does not exist', async () => {
      mockNoteFindUnique.mockResolvedValue(null);
      await expect(deleteNote('non-existent')).rejects.toThrow('备注不存在');
    });
  });
});
