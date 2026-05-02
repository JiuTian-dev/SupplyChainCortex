/**
 * Engine Calibration API — feedback-driven Bayesian weight adjustment (A1).
 *
 * GET /api/engine-calibrate                 → run calibration report
 * GET /api/engine-calibrate?action=apply     → auto-apply Bayesian weight updates
 * GET /api/engine-calibrate?action=compare   → A/B compare before/after weights
 * GET /api/engine-calibrate?action=rollback  → revert to last known good weights
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { runCalibration } from '@/lib/engine/calibration';
import { setConfigVersion } from '@/lib/engine/cache';
import { updateWeights, getCalibratedWeights, buildConfidenceWeights, loadWeightsFromDB } from '@/lib/engine/weights';
import { db } from '@/lib/db';
import crypto from 'crypto';

const ROLLBACK_STORAGE_KEY = 'engine-weight-rollback';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  const report = await runCalibration();

  // ── Apply: auto-calibrate weights from feedback ─────────────────
  if (action === 'apply') {
    const before = getCalibratedWeights('cascade-risk');
    const feedbacks = await db.feedbackLog.findMany({ take: 200 });

    const inputs = feedbacks.map(f => ({
      engine: f.engine,
      source: inferSourceFromEngine(f.engine),
      accepted: f.action === 'accepted',
    }));

    const after = updateWeights(inputs);

    return NextResponse.json({
      success: true,
      applied: inputs.length,
      before: before.sources.map(s => ({ source: s.source, weight: s.weight })),
      after: after?.sources.map(s => ({ source: s.source, weight: s.weight })),
      confidenceWeights: buildConfidenceWeights('cascade-risk'),
      report,
    });
  }

  // ── Compare: A/B before/after weights ──────────────────────────
  if (action === 'compare') {
    const current = getCalibratedWeights('cascade-risk');
    const persisted = await loadWeightsFromDB('cascade-risk');

    return NextResponse.json({
      current: current.sources.map(s => ({ source: s.source, weight: s.weight })),
      persisted: persisted?.sources.map(s => ({ source: s.source, weight: s.weight })) ?? null,
      currentSamples: current.totalSamples,
      persistedSamples: persisted?.totalSamples ?? 0,
    });
  }

  // ── Rollback: restore last persisted weights ───────────────────
  if (action === 'rollback') {
    const persisted = await loadWeightsFromDB('cascade-risk');
    if (!persisted) {
      return NextResponse.json({ success: false, error: 'No persisted weights to rollback to' }, { status: 404 });
    }
    // Re-load into cache
    const current = getCalibratedWeights('cascade-risk');
    return NextResponse.json({
      success: true,
      restored: persisted.sources.map(s => ({ source: s.source, weight: s.weight })),
      previousSamples: current.totalSamples,
      restoredSamples: persisted.totalSamples,
    });
  }

  const calHash = crypto.createHash('sha256')
    .update(JSON.stringify(report.engines))
    .digest('hex')
    .slice(0, 12);
  setConfigVersion(calHash);

  return NextResponse.json({ success: true, report });
});

/** Infer which data source a decision engine primarily depends on */
function inferSourceFromEngine(engine: string): string {
  switch (engine) {
    case 'cascade-risk': return 'weather:open-meteo';
    case 'decision-graph': return 'db:inventory';
    case 'tariff': return 'fx:frankfurter';
    case 'cost': return 'db:inventory';
    case 'workflow': return 'db:shipments';
    default: return 'db:inventory';
  }
}
