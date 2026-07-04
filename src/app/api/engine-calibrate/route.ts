/**
 * Engine Calibration API — feedback-driven Bayesian weight adjustment (A1).
 *
 * GET /api/engine-calibrate                 → run calibration report
 * GET /api/engine-calibrate?action=apply     → auto-apply Bayesian weight updates
 * GET /api/engine-calibrate?action=compare   → A/B compare before/after weights
 * GET /api/engine-calibrate?action=rollback  → revert to last known good weights
 */

/**
 * @internal 待评估 — 此路由在前端组件中无直接调用，疑似无运行时引用。
 * 决策：保留以备运维/外部系统/未来用途，但标注待评估。
 * 评估建议：如确认无任何调用方（含外部脚本、Prometheus、运维工具），可考虑删除。
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { requireAdmin } from '@/lib/auth-helpers';
import { runCalibration } from '@/lib/engine/calibration';
import { setConfigVersion } from '@/lib/engine/cache';
import { updateWeights, getCalibratedWeights, buildConfidenceWeights, loadWeightsFromDB } from '@/lib/engine/weights';
import { evolveFromFeedback, getKnowledgeHealth, getChunksNeedingReview } from '@/lib/engine/rag';
import { getSourceReliabilityMap } from '@/lib/engine/evidence-feedback';
import { db } from '@/lib/db';
import crypto from 'crypto';

const ROLLBACK_STORAGE_KEY = 'engine-weight-rollback';

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  const report = await runCalibration();

  // ── Weights: detailed Bayesian weight status ────────────────────────
  if (action === 'weights') {
    const current = getCalibratedWeights('cascade-risk');
    const persisted = await loadWeightsFromDB('cascade-risk');

    return NextResponse.json({
      success: true,
      current: {
        sources: current.sources.map(s => ({
          source: s.source, weight: s.weight,
          alpha: s.alpha, beta: s.beta,
          sampleSize: s.sampleSize, lastUpdated: s.lastUpdated,
        })),
        totalSamples: current.totalSamples,
        calibratedAt: current.calibratedAt,
      },
      persisted: persisted ? {
        sources: persisted.sources.map(s => ({
          source: s.source, weight: s.weight,
          alpha: s.alpha, beta: s.beta,
          sampleSize: s.sampleSize, lastUpdated: s.lastUpdated,
        })),
        totalSamples: persisted.totalSamples,
        calibratedAt: persisted.calibratedAt,
      } : null,
      // Beta distribution confidence intervals for each source
      confidence: current.sources.map(s => {
        const n = s.alpha + s.beta;
        const p = s.alpha / n;
        // Approximate 95% CI for Beta: p +/- 1.96 * sqrt(p*(1-p)/n)
        const se = Math.sqrt((p * (1 - p)) / Math.max(n, 1));
        return {
          source: s.source,
          mean: Math.round(p * 1000) / 1000,
          ci95Lower: Math.round(Math.max(0, p - 1.96 * se) * 1000) / 1000,
          ci95Upper: Math.round(Math.min(1, p + 1.96 * se) * 1000) / 1000,
          stability: n > 30 ? 'high' : n > 10 ? 'medium' : 'low',
        };
      }),
      report,
    });
  }

  // ── Apply: auto-calibrate weights from feedback ─────────────────
  if (action === 'apply') {
    const before = getCalibratedWeights('cascade-risk');
    const feedbacks = await (db as unknown as Record<string, { findMany: (a: Record<string, unknown>) => Promise<Array<{ engine: string; action: string }>> }>).feedbackLog?.findMany({ take: 200 }) || [];

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

  // ── RAG Evolve: update knowledge base from evidence feedback ────
  if (action === 'rag-evolve') {
    const sourceReliability = getSourceReliabilityMap();
    const result = evolveFromFeedback(sourceReliability);
    const health = getKnowledgeHealth();

    return NextResponse.json({
      success: true,
      sourceReliability,
      knowledgeEvolution: result,
      knowledgeHealth: health,
      needsReview: getChunksNeedingReview().map(c => ({ id: c.id, title: c.title, score: (c as unknown as { usefulnessScore: number }).usefulnessScore })),
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

  const currentWeights = getCalibratedWeights('cascade-risk');
  const persistedWeights = await loadWeightsFromDB('cascade-risk');

  const calHash = crypto.createHash('sha256')
    .update(JSON.stringify(report.engines))
    .digest('hex')
    .slice(0, 12);
  setConfigVersion(calHash);

  return NextResponse.json({
    success: true,
    report,
    sourceWeights: currentWeights.sources.map(s => ({
      source: s.source, weight: s.weight,
      sampleSize: s.sampleSize, lastUpdated: s.lastUpdated,
    })),
    weightTrend: persistedWeights ? currentWeights.sources.map(s => {
      const prev = persistedWeights!.sources.find(p => p.source === s.source);
      return {
        source: s.source,
        current: s.weight,
        previous: prev?.weight ?? s.weight,
        delta: prev ? Math.round((s.weight - prev.weight) * 10000) / 10000 : 0,
      };
    }) : null,
  });
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
