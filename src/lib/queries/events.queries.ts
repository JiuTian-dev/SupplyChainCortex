/**
 * Events Queries — supply chain event feed for /api/events.
 * Migrated from services/events.service.ts.
 * In-memory pagination replaced by shared paginate() from api-utils.
 */

import { db } from '@/lib/db';
import { paginate } from '@/lib/api-utils';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface EventFilters {
  type?: string;
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateEventData {
  type: string;
  title: string;
  description: string;
  icon?: string;
  color?: string;
  severity?: string;
  sku?: string;
}

export interface EventsResult {
  events: Awaited<ReturnType<typeof db.supplyChainEvent.findMany>>;
  unreadCount: number;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_TAKE = 500;

// ─── Core ────────────────────────────────────────────────────────────────────────

export async function getEvents(filters: EventFilters = {}): Promise<EventsResult> {
  const { type, unreadOnly = false, page = 1, pageSize = DEFAULT_PAGE_SIZE } = filters;
  const clampedPageSize = Math.min(pageSize, MAX_PAGE_SIZE);

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (unreadOnly) where.isRead = false;

  const [allEvents, unreadCount] = await Promise.all([
    db.supplyChainEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: MAX_TAKE,
    }),
    db.supplyChainEvent.count({ where: { isRead: false } }),
  ]);

  const { data, pagination } = paginate(allEvents, { page, pageSize: clampedPageSize });

  return { events: data, unreadCount, pagination };
}

export async function createEvent(data: CreateEventData) {
  const { type, title, description, icon, color, severity, sku } = data;

  if (!type || !title || !description) {
    throw new Error('缺少必填字段: type, title, description');
  }

  return db.supplyChainEvent.create({
    data: {
      type,
      title,
      description,
      icon: icon || '📋',
      color: color || '#f97316',
      severity: severity || 'info',
      sku: sku || null,
      isRead: false,
    },
  });
}

export async function markEventRead(id: string) {
  return db.supplyChainEvent.updateMany({
    where: { id },
    data: { isRead: true },
  });
}

export async function markAllEventsRead() {
  return db.supplyChainEvent.updateMany({
    where: { isRead: false },
    data: { isRead: true },
  });
}
