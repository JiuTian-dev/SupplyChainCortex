/**
 * Feedback Calibration Pipeline — bridges user feedback to engine weight updates.
 *
 * Pipeline:
 *   1. Collect feedback from FeedbackLog (accepted/rejected per engine)
 *   2. Compute per-engine acceptance rate, confidence drift, and bias score
 *   3. Generate calibration recommendations
 *   4. Expose via API for downstream Bayesian weight updates
 *
 * All reads go through Prisma. All computations are deterministic.
 */

import { db } from '@/lib/db';
import { getConfigVersion } from './cache';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface EngineCalibration {
  engine: string;
  totalDecisions: number;
  accepted: number;
  rejected: number;
  ignored: number;
  modified: number;
  acceptanceRate: number;
  /** How much the actual acceptance deviates from predicted confidence */
  confidenceDrift: number;
  /** Positive = engine is over-confident, Negative = under-confident */
  biasScore: number;
  /** Bayesian weight adjustment recommendation */
  recommendedWeightAdjustment: number;
  /** Human-readable recommendation */
  recommendation: string;
}

export interface CalibrationReport {
  generatedAt: string;
  configVersion: string;
  totalFeedback: number;
  engines: EngineCalibration[];
  globalAcceptanceRate: number;
  summary: string;
}

// ─── Calibration Engine ─────────────────────────────────────────────────────────

export async function runCalibration(): Promise<CalibrationReport> {
  const feedback = await db.feedbackLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const byEngine = new Map<string, {
    total: number; accepted: number; rejected: number;
    ignored: number; modified: number;
  }>();

  for (const fb of feedback) {
    const e = byEngine.get(fb.engine) || { total: 0, accepted: 0, rejected: 0, ignored: 0, modified: 0 };
    e.total++;
    if (fb.action === 'accepted') e.accepted++;
    else if (fb.action === 'rejected') e.rejected++;
    else if (fb.action === 'ignored') e.ignored++;
    else if (fb.action === 'modified') e.modified++;
    byEngine.set(fb.engine, e);
  }

  const engines: EngineCalibration[] = [];
  let totalAccepted = 0;

  for (const [engine, counts] of byEngine) {
    const acceptanceRate = counts.total > 0
      ? Math.round(counts.accepted / counts.total * 100) / 100
      : 0;
    totalAccepted += counts.accepted;

    // Confidence drift: compare acceptance rate to expected (0.7 baseline)
    const confidenceDrift = Math.round((acceptanceRate - 0.7) * 100) / 100;

    // Bias: how many rejected vs accepted
    const biasScore = counts.total > 0
      ? Math.round((counts.rejected - counts.accepted) / counts.total * 100) / 100
      : 0;

    // Weight adjustment: if acceptance < 0.5, reduce weight; if > 0.9, increase
    const recommendedWeightAdjustment = acceptanceRate < 0.4 ? -0.2
      : acceptanceRate < 0.6 ? -0.1
      : acceptanceRate > 0.9 ? 0.1
      : 0;

    const recommendation = acceptanceRate >= 0.8
      ? `${engine}: 采纳率高 (${Math.round(acceptanceRate * 100)}%)，建议提升该引擎权重`
      : acceptanceRate >= 0.5
      ? `${engine}: 采纳率中等 (${Math.round(acceptanceRate * 100)}%)，保持当前权重`
      : `${engine}: 采纳率低 (${Math.round(acceptanceRate * 100)}%)，建议降低权重并检查推理质量`;

    engines.push({
      engine, totalDecisions: counts.total,
      accepted: counts.accepted, rejected: counts.rejected,
      ignored: counts.ignored, modified: counts.modified,
      acceptanceRate, confidenceDrift, biasScore,
      recommendedWeightAdjustment, recommendation,
    });
  }

  const globalAcceptanceRate = feedback.length > 0
    ? Math.round(totalAccepted / feedback.length * 100) / 100
    : 0;

  const summary = globalAcceptanceRate >= 0.7
    ? `整体采纳率 ${Math.round(globalAcceptanceRate * 100)}% — 引擎决策质量良好`
    : globalAcceptanceRate >= 0.4
    ? `整体采纳率 ${Math.round(globalAcceptanceRate * 100)}% — 需关注部分引擎推理质量`
    : `整体采纳率 ${Math.round(globalAcceptanceRate * 100)}% — 需紧急校准引擎权重`;

  return {
    generatedAt: new Date().toISOString(),
    configVersion: getConfigVersion(),
    totalFeedback: feedback.length,
    engines,
    globalAcceptanceRate,
    summary,
  };
}
