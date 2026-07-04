/**
 * Causal Estimator — Configuration, Types & Method Selection
 *
 * DML configuration (environment-driven), shared sample types, and the
 * method-selection dispatcher.
 *
 * @reference Chernozhukov et al. (2018), "Double/debiased machine learning
 *           for treatment and structural parameters." The Econometrics
 *           Journal, 21(1).
 */
import type { InterventionType } from '../cascade-risk.types';

// ─── Configuration ─────────────────────────────────────────────────────────

/**
 * DML configuration — all parameters are configurable via environment variables.
 *
 * Academic basis: Chernozhukov et al. (2018), "Double/debiased machine learning
 * for treatment and structural parameters." The Econometrics Journal, 21(1).
 * Recommended defaults follow §3.3 (cross-fitting with K=5 or K=10 folds).
 */
export interface DMLConfig {
  /** Minimum sample size for DML (below this, fall back to PSM). Default: 50 */
  minSampleSize: number;
  /** Number of cross-fitting folds (academic standard minimum: 5). Default: 5 */
  crossFitFolds: number;
  /** Upper bound on folds (prevents over-splitting). Default: 10 */
  crossFitFoldsMax: number;
}

/** Parse a positive integer from an environment variable, with fallback. */
function getEnvInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
}

/**
 * Get current DML configuration (reads from environment on each call so
 * tests can override via `process.env` without module reload).
 *
 * - `DML_MIN_SAMPLE_SIZE` — minimum sample size (default 50)
 * - `DML_CROSS_FIT_FOLDS` — number of cross-fitting folds (default 5)
 */
export function getDMLConfig(): DMLConfig {
  return {
    minSampleSize: getEnvInt('DML_MIN_SAMPLE_SIZE', 50),
    crossFitFolds: getEnvInt('DML_CROSS_FIT_FOLDS', 5),
    crossFitFoldsMax: 10,
  };
}

// ─── Sample Types ──────────────────────────────────────────────────────────

export interface CausalSample {
  /** Features: [riskLevel, affectedProducts, ...] */
  features: number[];
  /** Treatment indicator: 1 = received intervention, 0 = control */
  treated: boolean;
  /** Outcome: improvement percentage (0-1) */
  outcome: number;
  /** Which intervention type (for matching) */
  intervention: InterventionType;
}

// ─── Method Selection ──────────────────────────────────────────────────────

export type CausalMethod = 'psm' | 'dml' | 'causal_forest';

/** Cross-fit consistency result — reports stability of cross-fit estimates. */
export interface CrossFitConsistency {
  /** Whether the cross-fit estimates are consistent (CV < 0.5) */
  isConsistent: boolean;
  /** Standard deviation of per-fold ATE estimates */
  stdDev: number;
  /** Coefficient of variation of per-fold ATE estimates */
  cv: number;
}

export function selectMethod(sampleSize: number): CausalMethod {
  if (sampleSize >= getDMLConfig().minSampleSize) return 'dml';
  return 'psm';
}
