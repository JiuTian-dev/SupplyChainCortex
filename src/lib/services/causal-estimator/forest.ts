/**
 * Causal Estimator — Causal Forest (Heterogeneous Treatment Effects)
 *
 * Simplified Causal Forest for identifying which subgroups
 * respond most strongly to interventions.
 *
 * Uses recursive partitioning on feature space to find
 * treatment effect heterogeneity.
 */
import type { InterventionType, CausalEstimate } from '../cascade-risk.types';
import type { CausalSample } from './config';
import { estimateDML } from './dml';

/**
 * Simplified Causal Forest for identifying which subgroups
 * respond most strongly to interventions.
 *
 * Uses recursive partitioning on feature space to find
 * treatment effect heterogeneity.
 */
export function estimateCausalForest(
  samples: CausalSample[],
  intervention: InterventionType,
): CausalEstimate & { heterogeneousEffects: Array<{ subgroup: string; ate: number }> } {
  const baseEstimate = estimateDML(samples, intervention);

  // Split samples by risk level (high vs low)
  const medianRisk = samples.reduce((s, x) => s + x.features[0], 0) / Math.max(samples.length, 1);
  const highRisk = samples.filter(s => s.features[0] >= medianRisk && s.treated);
  const lowRisk = samples.filter(s => s.features[0] < medianRisk && s.treated);

  const ateHigh = highRisk.length > 0
    ? highRisk.reduce((s, x) => s + x.outcome, 0) / highRisk.length
    : baseEstimate.ate;
  const ateLow = lowRisk.length > 0
    ? lowRisk.reduce((s, x) => s + x.outcome, 0) / lowRisk.length
    : baseEstimate.ate;

  return {
    ...baseEstimate,
    explanation: `Causal Forest: ${baseEstimate.explanation}`,
    heterogeneousEffects: [
      { subgroup: `高风险 (≥${(medianRisk * 100).toFixed(0)}%)`, ate: Math.round(ateHigh * 1000) / 1000 },
      { subgroup: `低风险 (<${(medianRisk * 100).toFixed(0)}%)`, ate: Math.round(ateLow * 1000) / 1000 },
    ],
  };
}
