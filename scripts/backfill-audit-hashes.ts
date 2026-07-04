/**
 * Backfill cryptographic hash chain for existing audit logs and decision traces.
 *
 * Run: npx tsx scripts/backfill-audit-hashes.ts
 */

import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function hashAuditContent(log: {
  action: string;
  entity: string;
  entityId: string | null;
  sku: string | null;
  userId: string;
  userName: string;
  details: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  severity: string;
  createdAt: Date;
  previousHash: string | null;
}): string {
  const payload = JSON.stringify({
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    sku: log.sku,
    userId: log.userId,
    userName: log.userName,
    details: log.details,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    severity: log.severity,
    createdAt: log.createdAt.toISOString(),
    previousHash: log.previousHash,
  });
  return createHash('sha256').update(payload).digest('hex');
}

function hashTraceContent(trace: {
  auditId: string;
  userQuery: string;
  intent: string;
  confidence: number;
  mode: string;
  tier: number | null;
  durationMs: number;
  toolsUsed: string[];
  claimsCount: number;
  passport: unknown;
  userId: string | null;
  summary: string | null;
  createdAt: Date;
  previousHash: string | null;
}): string {
  const payload = JSON.stringify({
    auditId: trace.auditId,
    userQuery: trace.userQuery,
    intent: trace.intent,
    confidence: trace.confidence,
    mode: trace.mode,
    tier: trace.tier,
    durationMs: trace.durationMs,
    toolsUsed: trace.toolsUsed,
    claimsCount: trace.claimsCount,
    passport: trace.passport,
    userId: trace.userId,
    summary: trace.summary,
    createdAt: trace.createdAt.toISOString(),
    previousHash: trace.previousHash,
  });
  return createHash('sha256').update(payload).digest('hex');
}

async function backfillAuditLogs() {
  console.log('[Backfill] Processing audit_logs...');
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      action: true,
      entity: true,
      entityId: true,
      sku: true,
      userId: true,
      userName: true,
      details: true,
      ipAddress: true,
      userAgent: true,
      severity: true,
      createdAt: true,
      contentHash: true,
    },
  });

  console.log(`[Backfill] Found ${logs.length} audit logs`);

  let previousHash: string | null = null;
  let updated = 0;

  for (const log of logs) {
    if (log.contentHash !== 'pending-backfill') {
      previousHash = log.contentHash;
      continue;
    }

    const contentHash = hashAuditContent({ ...log, previousHash });

    await prisma.auditLog.update({
      where: { id: log.id },
      data: { previousHash, contentHash },
    });

    previousHash = contentHash;
    updated++;
  }

  console.log(`[Backfill] Updated ${updated} audit logs`);
}

async function backfillDecisionTraces() {
  console.log('[Backfill] Processing decision_traces...');
  const traces = await prisma.decisionTrace.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      auditId: true,
      userQuery: true,
      intent: true,
      confidence: true,
      mode: true,
      tier: true,
      durationMs: true,
      toolsUsed: true,
      claimsCount: true,
      passport: true,
      userId: true,
      summary: true,
      createdAt: true,
      contentHash: true,
    },
  });

  console.log(`[Backfill] Found ${traces.length} decision traces`);

  let previousHash: string | null = null;
  let updated = 0;

  for (const trace of traces) {
    if (trace.contentHash !== 'pending-backfill') {
      previousHash = trace.contentHash;
      continue;
    }

    const contentHash = hashTraceContent({ ...trace, previousHash });

    await prisma.decisionTrace.update({
      where: { id: trace.id },
      data: { previousHash, contentHash },
    });

    previousHash = contentHash;
    updated++;
  }

  console.log(`[Backfill] Updated ${updated} decision traces`);
}

async function main() {
  console.log('[Backfill] Starting cryptographic hash chain backfill...');
  await backfillAuditLogs();
  await backfillDecisionTraces();
  console.log('[Backfill] Done!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
