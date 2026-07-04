/**
 * Cascade Risk — Reporter Module
 *
 * Result aggregation, report generation, and formatting utilities:
 *   - Counterfactual audit snapshot builder
 *   - Passport alternatives builder
 *   - Model validation report generator (holdout + Brier Score)
 *
 * Extracted from cascade-risk.main.ts for modularity.
 */
import { db } from '@/lib/db';
import type { AlternativeOption } from '@/lib/engine/passport';
import { generateValidationReport } from '../model-validation';
import type {
  CascadeReport,
  CascadeValidationReport,
} from '../cascade-risk.types';

export function buildCounterfactualAuditSnapshot(report: Pick<CascadeReport, 'counterfactuals' | 'causalCounterfactuals'>) {
  return {
    counterfactuals: (report.counterfactuals ?? []).slice(0, 4).map((cf) => ({
      scenario: cf.scenario,
      improvement: cf.improvement,
      affectedProducts: cf.alternativeImpact.affectedProducts,
      totalRisk: cf.alternativeImpact.totalRisk,
    })),
    causalCounterfactuals: (report.causalCounterfactuals ?? []).slice(0, 4).map((cf) => ({
      scenario: cf.scenario,
      intervention: cf.intervention,
      estimatedReduction: cf.estimatedReduction,
      confidenceInterval: cf.confidenceInterval,
      isReliable: cf.isReliable,
      sampleSize: cf.causalEstimate.sampleSize,
      pValue: cf.causalEstimate.pValue,
    })),
  };
}

export function buildPassportAlternatives(report: Pick<CascadeReport, 'counterfactuals' | 'causalCounterfactuals'>): AlternativeOption[] {
  if ((report.causalCounterfactuals ?? []).length > 0) {
    return (report.causalCounterfactuals ?? []).map((cf) => ({
      action: cf.scenario || '替代方案',
      expectedImpact: `风险降低 ${(cf.estimatedReduction * 100).toFixed(1)}%`,
      confidence: cf.estimatedReduction,
      tradeoffs: cf.isReliable ? [] : ['历史样本有限，结论偏先验'],
    }));
  }

  return (report.counterfactuals ?? []).map((cf) => ({
    action: cf.scenario || '替代方案',
    expectedImpact: `风险降低 ${cf.improvement}%`,
    confidence: cf.improvement / 100,
    tradeoffs: [],
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Model Validation — Holdout Set + Brier Score Calibration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run model validation against historical cascade-risk snapshots.
 *
 * Reads historical audit-log snapshots (stored by {@link getCascadeRisk}),
 * aligns predicted risk scores with actual shipment-delay outcomes, and
 * computes:
 *
 *  - Holdout metrics (MSE, RMSE, MAE, MAPE, R², correlation, bias) for the
 *    continuous `avgPropagatedRisk` predictions.
 *  - Brier Score assessment for the binary "did any shipment slip?" event
 *    forecast derived from the predicted affected-node count.
 *
 * The validation report is suitable for attachment to a {@link CascadeReport}
 * via the `validation` field.
 *
 * @param days  Number of historical days to evaluate (default 30).
 * @returns Structured validation report, or `null` if no historical data.
 *
 * @reference Brier (1950); Murphy (1973); Wilks (2011) §8.4–8.5;
 *           Hyndman & Athanasopoulos (2018) §5.8.
 */
export async function runModelValidation(days: number = 30): Promise<CascadeValidationReport | null> {
  // Fetch historical cascade-risk audit logs that contain snapshots
  const cutoffDate = new Date(Date.now() - days * 86400000);
  const historicalLogs = await db.auditLog.findMany({
    where: {
      entity: 'cascade-risk' as string,
      action: 'ANALYZE' as string,
      createdAt: { gte: cutoffDate },
    },
    orderBy: { createdAt: 'asc' },
    take: days * 2,
  }).catch(() => []);

  if (historicalLogs.length === 0) return null;

  // Group by date (take latest snapshot per day) and extract predictions
  const byDate = new Map<string, {
    predictedAffectedNodes: number;
    predictedAvgRisk: number;
    timestamp: string;
  }>();
  for (const log of historicalLogs) {
    const details = log.details as Record<string, unknown> | null;
    if (!details?.snapshot) continue;
    const snapshot = details.snapshot as { affectedNodes?: number; avgPropagatedRisk?: number };
    if (typeof snapshot.affectedNodes !== 'number' || typeof snapshot.avgPropagatedRisk !== 'number') continue;
    const dateStr = new Date(log.createdAt).toISOString().split('T')[0];
    const existing = byDate.get(dateStr);
    if (!existing || new Date(log.createdAt) > new Date(existing.timestamp)) {
      byDate.set(dateStr, {
        predictedAffectedNodes: snapshot.affectedNodes,
        predictedAvgRisk: snapshot.avgPropagatedRisk,
        timestamp: log.createdAt.toString(),
      });
    }
  }

  if (byDate.size < 3) return null; // need at least 3 paired observations

  // Build paired (prediction, actual) arrays for holdout validation
  const predictions: number[] = [];
  const actuals: number[] = [];
  // For Brier Score: forecast = normalised risk probability, outcome = binary event
  const forecasts: number[] = [];
  const outcomes: number[] = [];

  for (const [dateStr, entry] of byDate) {
    const dateStart = new Date(dateStr);
    const dateEnd = new Date(dateStr);
    dateEnd.setDate(dateEnd.getDate() + 1);

    const actualShipments = await db.shipmentItem.findMany({
      where: { updatedAt: { gte: dateStart, lt: dateEnd } },
      take: 100,
    }).catch(() => []);

    const actualDelayed = actualShipments.filter(s => (s.delayDays ?? 0) > 0).length;

    // Holdout: predicted avg risk vs actual avg risk (approximated by delay ratio)
    predictions.push(entry.predictedAvgRisk);
    const actualAvgRisk = actualShipments.length > 0
      ? Math.min(100, (actualDelayed / actualShipments.length) * 100)
      : 0;
    actuals.push(actualAvgRisk);

    // Brier: forecast probability = normalised predicted risk, outcome = 1 if any delay
    const forecastProb = Math.min(1, entry.predictedAvgRisk / 100);
    forecasts.push(forecastProb);
    outcomes.push(actualDelayed > 0 ? 1 : 0);
  }

  if (predictions.length < 3) return null;

  try {
    const report = generateValidationReport({
      predictions,
      actuals,
      forecasts,
      outcomes,
      numBins: 10,
      modelName: 'cascade-risk-v2.9.3',
    });

    return {
      markdown: report.markdown,
      holdout: report.holdout,
      brier: report.brier,
      passed: report.passed,
    };
  } catch {
    return null;
  }
}
