/**
 * Audit Service - Centralized audit logging for all operations
 *
 * Phase 1: Cryptographic audit trail — hash chain + HMAC signature.
 * EU AI Act Article 12 compliant: automatic recording with tamper evidence.
 */
import { db } from '@/lib/db';
import { NextRequest } from 'next/server';
import {
  computeAuditContentHash,
  signContentHash,
  getLastAuditHash,
} from '@/lib/audit/crypto-trail';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'EXPORT' | 'ADJUST' | 'TRANSFER' | 'RATE' | 'SIMULATE' | 'RESOLVE';
export type AuditEntity = 'product' | 'inventory' | 'shipment' | 'note' | 'supplier' | 'reorder' | 'alert_rule' | 'cost' | 'forecast' | 'event' | 'notification' | 'warehouse';

export interface CreateAuditLogParams {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  sku?: string;
  userId?: string;
  userName?: string;
  details: Record<string, unknown>;
  severity?: 'info' | 'warning' | 'important';
  request?: NextRequest; // Optional: extract IP and user agent
}

/** Create an audit log entry with cryptographic hash chain */
export async function createAuditLog(params: CreateAuditLogParams) {
  const previousHash = await getLastAuditHash();
  const createdAt = new Date();

  const contentHash = computeAuditContentHash({
    id: 'pending', // id not known yet, will be replaced by DB
    action: params.action,
    entity: params.entity,
    entityId: params.entityId,
    sku: params.sku,
    userId: params.userId || 'system',
    userName: params.userName || '系统用户',
    details: params.details,
    ipAddress: params.request?.headers?.get('x-forwarded-for') || null,
    userAgent: params.request?.headers?.get('user-agent')?.substring(0, 255) || null,
    severity: params.severity || 'info',
    createdAt,
    previousHash,
  });

  const signature = signContentHash(contentHash);

  return db.auditLog.create({
    data: {
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      sku: params.sku,
      userId: params.userId || 'system',
      userName: params.userName || '系统用户',
      details: params.details as any,
      ipAddress: params.request?.headers?.get('x-forwarded-for') || null,
      userAgent: params.request?.headers?.get('user-agent')?.substring(0, 255) || null,
      severity: params.severity || 'info',
      previousHash,
      contentHash,
      signature,
    },
  });
}

/** Get audit logs with filtering and pagination */
export async function getAuditLogs(filters: {
  action?: string;
  entity?: string;
  sku?: string;
  userId?: string;
  severity?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}) {
  const where: Record<string, unknown> = {};

  if (filters.action) where.action = filters.action;
  if (filters.entity) where.entity = filters.entity;
  if (filters.sku) where.sku = filters.sku;
  if (filters.userId) where.userId = filters.userId;
  if (filters.severity) where.severity = filters.severity;

  if (filters.startDate || filters.endDate) {
    const createdAt: Record<string, Date> = {};
    if (filters.startDate) createdAt.gte = new Date(filters.startDate);
    if (filters.endDate) createdAt.lte = new Date(filters.endDate + 'T23:59:59.999Z');
    where.createdAt = createdAt;
  }

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 20;
  const skip = (page - 1) * pageSize;

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    db.auditLog.count({ where }),
  ]);

  // Parse details (handles both Json object and string types)
  const parsedLogs = logs.map(log => ({
    ...log,
    details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details,
  }));

  return {
    logs: parsedLogs,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
  };
}

/** Get audit log statistics */
export async function getAuditStats(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const where = { createdAt: { gte: since } };

  // Use findMany + in-memory aggregation for SQLite compatibility
  const [totalLogs, allLogs, recentLogs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      select: { action: true, entity: true, severity: true },
    }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  // Aggregate in memory
  const actionMap: Record<string, number> = {};
  const entityMap: Record<string, number> = {};
  const severityMap: Record<string, number> = {};

  allLogs.forEach(log => {
    actionMap[log.action] = (actionMap[log.action] || 0) + 1;
    entityMap[log.entity] = (entityMap[log.entity] || 0) + 1;
    severityMap[log.severity] = (severityMap[log.severity] || 0) + 1;
  });

  const byAction = Object.entries(actionMap)
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count);

  const byEntity = Object.entries(entityMap)
    .map(([entity, count]) => ({ entity, count }))
    .sort((a, b) => b.count - a.count);

  const bySeverity = Object.entries(severityMap)
    .map(([severity, count]) => ({ severity, count }))
    .sort((a, b) => b.count - a.count);

  return {
    period: `${days}天`,
    totalLogs,
    byAction,
    byEntity,
    bySeverity,
    recentActivity: recentLogs.map(l => ({
      ...l,
      details: typeof l.details === 'string' ? JSON.parse(l.details) : l.details,
    })),
  };
}
