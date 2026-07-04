/**
 * Engine Feedback API — user action recording for Bayesian calibration.
 *
 * POST /api/engine-feedback (response-level)
 *   Body: { auditId, engine, action, modifications?, userNotes?, userId?, tags? }
 *
 * POST /api/engine-feedback (evidence-level, 2026 upgrade)
 *   Body: { auditId, engine, action, claims: [{ claimId, claimText, citedSource, verdict, ... }], userNotes? }
 *
 * GET /api/engine-feedback?action=stats  → feedback statistics
 * GET /api/engine-feedback?action=recent → recent feedback (last 50)
 * GET /api/engine-feedback?action=evidence-stats → per-source reliability
 *
 * All writes are in-memory (non-blocking). For production: wire to Prisma.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, apiError } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { recordFeedback, getFeedbackStats, feedbackStore } from '@/lib/engine';
import {
  recordEvidenceFeedback,
  evidenceTracker,
  getSourceReliabilityMap,
  type ClaimVerdict,
} from '@/lib/engine/evidence-feedback';
import type { FeedbackAction } from '@/lib/engine';
import { db } from '@/lib/db';

const VALID_ACTIONS = ['accepted', 'rejected', 'modified', 'ignored', 'deferred'];
const VALID_VERDICTS: ClaimVerdict[] = ['accurate', 'inaccurate', 'outdated', 'irrelevant', 'unverified'];

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'stats') {
    return NextResponse.json(getFeedbackStats());
  }

  if (action === 'recent') {
    return NextResponse.json({ feedback: feedbackStore.getRecent(50) });
  }

  if (action === 'evidence-stats') {
    return NextResponse.json({
      stats: evidenceTracker.getStats(),
      sourceReliability: getSourceReliabilityMap(),
    });
  }

  return NextResponse.json({
    message: 'Use ?action=stats, ?action=recent, or ?action=evidence-stats. POST to record feedback.',
    validActions: VALID_ACTIONS,
  });
}));

export const POST = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const body = await request.json();
  const { auditId, engine, action, modifications, userNotes, userId, suggestedAt, tags, claims } = body;

  if (!auditId || !engine || !action) {
    return apiError('Missing required fields: auditId, engine, action', 400);
  }

  if (!VALID_ACTIONS.includes(action)) {
    return apiError(`Invalid action: ${action}. Valid: ${VALID_ACTIONS.join(', ')}`, 400);
  }

  // ── Evidence-level feedback (2026 upgrade) ────────────────────────────────
  if (claims && Array.isArray(claims) && claims.length > 0) {
    for (const c of claims) {
      if (!c.claimId || !c.verdict || !VALID_VERDICTS.includes(c.verdict)) {
        return apiError(`Invalid claim: ${JSON.stringify(c)}. verdict must be: ${VALID_VERDICTS.join(', ')}`, 400);
      }
    }

    recordEvidenceFeedback({
      auditId,
      engine: engine || 'chat-agent',
      action: action as FeedbackAction,
      claims: claims.map((c: Record<string, unknown>) => ({
        claimId: c.claimId as string,
        claimText: (c.claimText as string) || '',
        citedSource: (c.citedSource as string) || '未标注',
        statedConfidence: (c.statedConfidence as 'high' | 'medium' | 'low') || 'medium',
        verdict: c.verdict as ClaimVerdict,
        correction: c.correction as string | undefined,
      })),
      userNotes,
      userId,
    });

    return NextResponse.json({
      success: true,
      claimsRecorded: claims.length,
      sourceWeights: getSourceReliabilityMap(),
    }, { status: 201 });
  }

  // ── Response-level feedback (legacy, still supported) ──────────────────────
  const feedback = recordFeedback({
    auditId,
    engine,
    action: action as FeedbackAction,
    modifications,
    userNotes,
    userId,
    suggestedAt,
    tags,
  });

  // Async fire-and-forget DB persistence
  db.feedbackLog.create({
    data: {
      auditId: feedback.auditId,
      engine: feedback.engine,
      action: feedback.action,
      modifications: feedback.modifications || null,
      userNotes: feedback.userNotes || null,
      userId: feedback.userId || null,
      suggestedAt: feedback.suggestedAt,
      actedAt: feedback.actedAt,
      tags: JSON.stringify(feedback.tags),
    },
  }).catch(() => { /* non-blocking */ });

  return NextResponse.json({ success: true, feedback }, { status: 201 });
}));
