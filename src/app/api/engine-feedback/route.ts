/**
 * Engine Feedback API — user action recording for Bayesian calibration.
 *
 * POST /api/engine-feedback
 *   Body: { auditId, engine, action, modifications?, userNotes?, userId?, tags? }
 *
 * GET /api/engine-feedback?action=stats  → feedback statistics
 * GET /api/engine-feedback?action=recent → recent feedback (last 50)
 *
 * All writes are in-memory (non-blocking). For production: wire to Prisma.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, apiError } from '@/lib/api-utils';
import { recordFeedback, getFeedbackStats, feedbackStore } from '@/lib/engine';
import type { FeedbackAction } from '@/lib/engine';
import { db } from '@/lib/db';

const VALID_ACTIONS = ['accepted', 'rejected', 'modified', 'ignored', 'deferred'];

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'stats') {
    return NextResponse.json(getFeedbackStats());
  }

  if (action === 'recent') {
    return NextResponse.json({ feedback: feedbackStore.getRecent(50) });
  }

  return NextResponse.json({
    message: 'Use ?action=stats or ?action=recent. POST to record feedback.',
    validActions: VALID_ACTIONS,
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { auditId, engine, action, modifications, userNotes, userId, suggestedAt, tags } = body;

  if (!auditId || !engine || !action) {
    return apiError('Missing required fields: auditId, engine, action', 400);
  }

  if (!VALID_ACTIONS.includes(action)) {
    return apiError(`Invalid action: ${action}. Valid: ${VALID_ACTIONS.join(', ')}`, 400);
  }

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
});
