/**
 * Causal Inference Engine — Double Machine Learning (DML) + PSM
 *
 * Thin barrel — re-exports all public API from the extracted sub-modules.
 *
 * Sub-modules (in ./causal-estimator/):
 *   config.ts  — DML configuration, sample types, method selection
 *   shared.ts  — Internal statistical helpers (sensitivity, permutation, bootstrap)
 *   dml.ts     — Double/Debiased Machine Learning (Chernozhukov et al., 2018)
 *   psm.ts     — Propensity Score Matching (fallback for small samples)
 *   forest.ts  — Causal Forest for heterogeneous treatment effects
 *
 * Public import path '@/lib/services/causal-estimator' is preserved.
 *
 * Design:
 * - CausalEstimator interface supports multiple methods
 * - Method selection: DML when n≥minSampleSize, PSM when n<minSampleSize
 * - All methods share the same CausalEstimate output type
 */
export * from './causal-estimator/index';
