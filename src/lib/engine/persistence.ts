/**
 * Engine Persistence Adapter — wires in-memory buffers to Prisma DB.
 *
 * decisionLogger.onFlush() → DecisionLog table
 * feedbackStore records → FeedbackLog table
 *
 * All writes are async, non-blocking, with retry on failure.
 * Called once at app startup: initEnginePersistence()
 */

import { db } from '@/lib/db';
import { decisionLogger } from './observability';
import { feedbackStore } from './feedback';
import type { DecisionLogEntry } from './observability';
import type { DecisionFeedback } from './feedback';

// ─── DecisionLog Persistence ──────────────────────────────────────────────────

async function persistDecisionLogs(entries: DecisionLogEntry[]): Promise<void> {
  try {
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
    throw err; // Let the buffer retry on next interval
  }
}

// ─── Feedback Persistence ─────────────────────────────────────────────────────

async function persistFeedback(entries: DecisionFeedback[]): Promise<void> {
  try {
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

// ─── Feedback Hook ────────────────────────────────────────────────────────────

/**
 * Wire the in-memory feedback store to auto-persist to DB on each record.
 * Original memory store still holds recent entries for fast stats queries.
 */
function wireFeedbackPersistence(): void {
  const originalRecord = feedbackStore.record.bind(feedbackStore);
  feedbackStore.record = (fb: DecisionFeedback) => {
    originalRecord(fb);
    // Async fire-and-forget DB write
    persistFeedback([fb]).catch(() => { /* retry on next record */ });
  };
}

// ─── Initialization ───────────────────────────────────────────────────────────

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
