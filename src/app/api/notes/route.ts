// 供应链备注/协作 API
// GET: 获取备注列表（支持 sku/category/isResolved 筛选，支持 action=stats）
// POST: 创建新备注 (body: {sku, author, content, category, priority})
// PUT: 更新备注 (body: {id, content?, isResolved?, priority?})
// DELETE: 删除备注 (query: ?id=xxx)

import { NextRequest, NextResponse } from 'next/server';
import { createAuditLog } from '@/lib/services/audit.service';
import { withErrorHandler, apiSuccess, apiError, AppError } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import {
  getNotes,
  createNote,
  updateNote,
  deleteNote,
  getNotesStats,
} from '@/lib/services/notes.service';
import type { NoteListFilters, CreateNoteData, UpdateNoteData } from '@/lib/services/notes.service';

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const sku = searchParams.get('sku');
  const category = searchParams.get('category');
  const isResolved = searchParams.get('isResolved');
  const priority = searchParams.get('priority');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');
  const action = searchParams.get('action') || 'list';

  // Action: stats
  if (action === 'stats') {
    const stats = await getNotesStats();
    return NextResponse.json(stats);
  }

  // Action: list (default)
  const filters: NoteListFilters = {
    sku: sku || undefined,
    category: category || undefined,
    isResolved: isResolved !== null && isResolved !== undefined ? isResolved === 'true' : undefined,
    priority: priority || undefined,
    limit,
    offset,
  };

  const result = await getNotes(filters);
  return NextResponse.json(result);
}));

export const POST = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { sku, author, content, category, priority } = body;

  const data: CreateNoteData = {
    sku,
    author,
    content,
    category,
    priority,
  };

  try {
    const { note } = await createNote(data);

    // Audit log for note creation
    await createAuditLog({
      action: 'CREATE',
      entity: 'note',
      entityId: note.id,
      sku: note.sku,
      details: { content: note.content.substring(0, 100), category: note.category, priority: note.priority },
      request,
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('不能为空')) {
        throw new AppError(error.message, 400, 'VALIDATION_ERROR');
      }
      if (error.message.includes('不存在') || error.message.includes('无效')) {
        const status = error.message.includes('不存在') ? 404 : 400;
        throw new AppError(error.message, status, status === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR');
      }
    }
    throw error;
  }
}));

export const PUT = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { id, content, priority, isResolved } = body;

  if (!id) {
    throw new AppError('备注 ID 不能为空', 400, 'VALIDATION_ERROR');
  }

  const data: UpdateNoteData = {
    id,
    content,
    priority,
    isResolved,
  };

  try {
    const { note } = await updateNote(data);

    // Audit log for note resolution
    if (isResolved === true) {
      await createAuditLog({
        action: 'RESOLVE',
        entity: 'note',
        entityId: id,
        details: { isResolved: true },
        request,
      });
    }

    return NextResponse.json({ note });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('不存在')) {
        throw new AppError(error.message, 404, 'NOT_FOUND');
      }
      if (error.message.includes('无效')) {
        throw new AppError(error.message, 400, 'VALIDATION_ERROR');
      }
    }
    throw error;
  }
}));

export const DELETE = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    throw new AppError('备注 ID 不能为空', 400, 'VALIDATION_ERROR');
  }

  try {
    await deleteNote(id);

    // Audit log for note deletion
    await createAuditLog({
      action: 'DELETE',
      entity: 'note',
      entityId: id,
      details: { deletedNote: true },
      request,
    });

    return NextResponse.json({ success: true, message: '备注已删除' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('不存在')) {
      throw new AppError(error.message, 404, 'NOT_FOUND');
    }
    throw error;
  }
}));
