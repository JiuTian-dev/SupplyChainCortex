/**
 * Causal Estimator — Main Module Barrel
 *
 * Re-exports all public API from the extracted sub-modules.
 * Export order matches the original causal-estimator.ts.
 *
 * Sub-modules:
 *   config.ts  — DML configuration, sample types, method selection
 *   shared.ts  — Internal statistical helpers (not re-exported)
 *   dml.ts     — Double/Debiased Machine Learning (Chernozhukov et al., 2018)
 *   psm.ts     — Propensity Score Matching
 *   forest.ts  — Causal Forest for heterogeneous treatment effects
 */
import type { InterventionType, CausalEstimate } from '../cascade-risk.types';
import type { CausalSample } from './config';
import { selectMethod } from './config';
import { estimateDML } from './dml';
import { estimatePSM } from './psm';

export type { DMLConfig } from './config';
export { getDMLConfig } from './config';
export type { CausalSample } from './config';
export { selectAdaptiveFolds } from './dml';
export { stratifiedSplit } from './dml';
export type { CrossFitConsistency } from './config';
export { computeCrossFitVariance } from './dml';
export { checkCrossFitConsistency } from './dml';
export type { CausalMethod } from './config';
export { selectMethod } from './config';
export { estimatePSM } from './psm';
export { estimateDML } from './dml';
export { estimateCausalForest } from './forest';

// ─── Unified Estimator ─────────────────────────────────────────────────────

/**
 * Unified causal estimator — automatically selects the best method
 * based on sample size.
 */
export function estimateCausalEffect(
  samples: CausalSample[],
  intervention: InterventionType,
  currentRiskLevel: number,
): CausalEstimate {
  const method = selectMethod(samples.length);

  switch (method) {
    case 'dml':
      return estimateDML(samples, intervention);
    case 'psm':
    default:
      return estimatePSM(samples, intervention, currentRiskLevel);
  }
}
