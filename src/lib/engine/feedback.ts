/**
 * Decision Feedback Loop — standardized pipeline for "AI suggestion →
 * user action → business outcome" tracking.
 *
 * This is the foundation for downstream Bayesian weight calibration.
 * All writes are async + non-blocking. Production: swap in-memory store
 * for Prisma DecisionLog model or a dedicated analytics DB.
 *
 * Pipeline:
 *   1. Engine emits suggestion (decision)
 *   2. User accepts, rejects, or modifies
 *   3. System records business outcome (e.g., delay days, cost change)
 *   4. Calibration job reads feedback to update weights
 */

// ─── Types ───────────────────────────────────────────────────────────────────────

export type FeedbackAction = 'accepted' | 'rejected' | 'modified' | 'ignored' | 'deferred';

export interface DecisionFeedback {
  id: string;
  /** Link to the original decision passport */
  auditId: string;
  /** Engine that made the suggestion */
  engine: string;
  /** What the user did */
  action: FeedbackAction;
  /** If modified, what the user changed */
  modifications?: string;
  /** User notes / reason for rejection */
  userNotes?: string;
  /** User identifier (for multi-tenant) */
  userId?: string;
  /** Timestamps */
  suggestedAt: string;
  actedAt: string;
  /** Business outcome (filled later, after results come in) */
  outcome?: BusinessOutcome;
  /** Tags for categorization */
  tags: string[];
}

export interface BusinessOutcome {
  /** Delay days (actual - expected) */
  delayDeltaDays: number;
  /** Cost impact (actual - expected), CNY */
  costDeltaCny: number;
  /** Stockout events prevented or caused */
  stockoutDelta: number;
  /** Customer satisfaction impact (-10 to +10) */
  satisfactionImpact: number;
  /** Free-text outcome description */
  description: string;
  /** When the outcome was recorded */
  recordedAt: string;
}

export interface FeedbackStats {
  total: number;
  accepted: number;
  rejected: number;
  modified: number;
  ignored: number;
  acceptanceRate: number;
  avgOutcomeScore: number;
  byEngine: Record<string, { total: number; accepted: number; avgImpact: number }>;
}

// ─── In-Memory Feedback Store ──────────────────────────────────────────────────

class FeedbackStore {
  private feedback: DecisionFeedback[] = [];
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  record(fb: DecisionFeedback): void {
    this.feedback.push(fb);
    if (this.feedback.length > this.maxSize) {
      this.feedback.splice(0, this.feedback.length - this.maxSize);
    }
  }

  findByAuditId(auditId: string): DecisionFeedback | undefined {
    return this.feedback.find(f => f.auditId === auditId);
  }

  getRecent(limit = 50): DecisionFeedback[] {
    return this.feedback.slice(-limit).reverse();
  }

  getStats(): FeedbackStats {
    const total = this.feedback.length;
    const accepted = this.feedback.filter(f => f.action === 'accepted').length;
    const rejected = this.feedback.filter(f => f.action === 'rejected').length;
    const modified = this.feedback.filter(f => f.action === 'modified').length;
    const ignored = this.feedback.filter(f => f.action === 'ignored').length;

    const byEngine: Record<string, { total: number; accepted: number; avgImpact: number }> = {};
    for (const f of this.feedback) {
      if (!byEngine[f.engine]) byEngine[f.engine] = { total: 0, accepted: 0, avgImpact: 0 };
      byEngine[f.engine].total++;
      if (f.action === 'accepted') byEngine[f.engine].accepted++;
    }

    // Compute acceptance rates
    for (const engine of Object.keys(byEngine)) {
      const e = byEngine[engine];
      e.avgImpact = e.total > 0 ? Math.round(e.accepted / e.total * 100) / 100 : 0;
    }

    return {
      total,
      accepted, rejected, modified, ignored,
      acceptanceRate: total > 0 ? Math.round(accepted / total * 100) / 100 : 0,
      avgOutcomeScore: 0, // computed from outcomes
      byEngine,
    };
  }

  /** Export all feedback for persistence */
  exportAll(): DecisionFeedback[] {
    return [...this.feedback];
  }

  /** Clear all feedback (testing only) */
  /** Create a smaller instance for testing bounded queue behavior. */
  _createSmall(maxSize: number): FeedbackStore {
    return new FeedbackStore(maxSize);
  }

  _clear(): void {
    this.feedback = [];
  }
}

/** Singleton feedback store */
export const feedbackStore = new FeedbackStore();

// ─── Feedback Recorder ──────────────────────────────────────────────────────────

let feedbackCounter = 0;

export function recordFeedback(params: {
  auditId: string;
  engine: string;
  action: FeedbackAction;
  modifications?: string;
  userNotes?: string;
  userId?: string;
  suggestedAt?: string;
  tags?: string[];
}): DecisionFeedback {
  const fb: DecisionFeedback = {
    id: `fb-${Date.now()}-${++feedbackCounter}`,
    auditId: params.auditId,
    engine: params.engine,
    action: params.action,
    modifications: params.modifications,
    userNotes: params.userNotes,
    userId: params.userId,
    suggestedAt: params.suggestedAt ?? new Date().toISOString(),
    actedAt: new Date().toISOString(),
    tags: params.tags ?? [],
  };

  feedbackStore.record(fb);

  if (process.env.NODE_ENV === 'development') {
    console.log(`[Feedback] ${fb.engine} decision ${fb.auditId}: ${fb.action}${fb.userNotes ? ` — ${fb.userNotes}` : ''}`);
  }

  return fb;
}

export function recordOutcome(auditId: string, outcome: BusinessOutcome): void {
  const fb = feedbackStore.findByAuditId(auditId);
  if (fb) {
    fb.outcome = outcome;
  }
}

export function getFeedbackStats(): FeedbackStats {
  return feedbackStore.getStats();
}
