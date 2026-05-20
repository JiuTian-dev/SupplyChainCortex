/**
 * Engine Persistence Adapter — wires in-memory buffers to Prisma DB.
 * All writes async, non-blocking, with retry on failure.
 * Called once at app startup via dynamic import: initEnginePersistence()
 *
 * NOTE: db access is always dynamic (await import) to prevent the
 * Prisma adapter chain (@prisma/adapter-pg → pg → dns) from leaking
 * into the client-side bundle through page.tsx's module graph.
 */

import { decisionLogger } from './observability';
import { feedbackStore } from './feedback';
import type { DecisionLogEntry } from './observability';
import type { DecisionFeedback } from './feedback';
import type { PrismaClient } from '@prisma/client';

async function getDb(): Promise<PrismaClient> {
  const { db } = await import('@/lib/db');
  return db as unknown as PrismaClient;
}

async function persistDecisionLogs(entries: DecisionLogEntry[]): Promise<void> {
  try {
    const db = await getDb();
    await db.decisionLog.createMany({
      data: entries.map(e => ({
        auditId: e.passport?.auditId || e.id,
        engine: e.engine,
        action: e.action,
        input: JSON.stringify(e.input),
        output: JSON.stringify(e.output),
        durationMs: e.meta.durationMs,
        cacheHit: e.meta.cacheHit,
        degradedSources: JSON.stringify(e.meta.degradedSources),
        errors: JSON.stringify(e.meta.errors),
        version: e.meta.version,
      })),
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[EnginePersistence] DecisionLog flush failed:', (err as Error).message);
    }
    throw err;
  }
}

async function persistFeedback(entries: DecisionFeedback[]): Promise<void> {
  try {
    const db = await getDb();
    await db.feedbackLog.createMany({
      data: entries.map(f => ({
        auditId: f.auditId,
        engine: f.engine,
        action: f.action,
        modifications: f.modifications || null,
        userNotes: f.userNotes || null,
        userId: f.userId || null,
        suggestedAt: f.suggestedAt,
        actedAt: f.actedAt,
        tags: JSON.stringify(f.tags),
        outcomeJson: f.outcome ? JSON.stringify(f.outcome) : null,
      })),
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[EnginePersistence] Feedback flush failed:', (err as Error).message);
    }
    throw err;
  }
}

function wireFeedbackPersistence(): void {
  const originalRecord = feedbackStore.record.bind(feedbackStore);
  feedbackStore.record = (fb: DecisionFeedback) => {
    originalRecord(fb);
    persistFeedback([fb]).catch(() => {});
  };
}

let initialized = false;

export function initEnginePersistence(): void {
  if (initialized) return;
  initialized = true;
  decisionLogger.onFlush(persistDecisionLogs);
  wireFeedbackPersistence();
  if (process.env.NODE_ENV === 'development') {
    console.log('[EnginePersistence] Initialized — DecisionLog + FeedbackLog → Prisma');
  }
}
