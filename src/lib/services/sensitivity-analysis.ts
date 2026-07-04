/**
 * Sensitivity Analysis — Oster (2019) Coefficient Stability Test
 *
 * Detects omitted variable bias in causal estimates by assessing how robust
 * the estimated coefficient is to the presence of unobservable confounders.
 *
 * Reference:
 *   Oster, E. (2019). "Unobservable Selection and Coefficient Stability:
 *   Theory and Evidence." Journal of Business & Economic Statistics, 37(2), 187-204.
 *   https://doi.org/10.1080/07350015.2016.1227711
 *
 * Core idea:
 *   - β* (betaUncontrolled): short-regression coefficient (treatment only, biased)
 *   - β̂ (betaControlled): long-regression coefficient (with controls, partially debiased)
 *   - R²_uncontrolled: R² of the short regression
 *   - R²_controlled: R² of the long regression
 *   - R²_max: maximum achievable R² if all confounders were observed
 *             (Oster recommends R²_max = 1.3 × R²_controlled as default)
 *   - δ: ratio of selection on unobservables to selection on observables
 *         needed to drive the coefficient to zero
 *
 * Decision rule:
 *   - |δ| > 1  → robust  (unobservables would need to be MORE important than observables)
 *   - |δ| ∈ [0.5, 1] → marginal
 *   - |δ| < 0.5 → sensitive (small unobservable confounding suffices to overturn the result)
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface OsterParams {
  /** β*: uncontrolled (short-regression) coefficient estimate */
  betaUncontrolled: number;
  /** β̂: controlled (long-regression) coefficient estimate */
  betaControlled: number;
  /** R² of the short regression (treatment only) */
  rSquaredUncontrolled: number;
  /** R² of the long regression (treatment + controls) */
  rSquaredControlled: number;
  /**
   * R²_max: maximum achievable R² if all confounders (observed + unobserved) were included.
   * Default: 1.3 × R²_controlled (Oster 2019, Section 4).
   */
  rSquaredMax?: number;
  /**
   * δ assumption for computing the bias-adjusted β_max.
   * Default: 1 (equal selection on observables and unobservables).
   */
  delta?: number;
}

export interface OsterResult {
  /** δ value that drives the estimated coefficient to zero */
  delta: number;
  /** β_max: bias-adjusted coefficient under the assumed δ (default δ=1) */
  betaMax: number;
  /** |β̂ − β*| / |β_max − β̂| — fraction of total bias explained by observables */
  biasRatio: number;
  /** True if |δ| > 1 (result robust to omitted variable bias) */
  isRobust: boolean;
  /** Identified set [min(β̂, β_max), max(β̂, β_max)] */
  identifiedSet: [number, number];
  /** Human-readable robustness recommendation */
  recommendation: 'robust' | 'marginal' | 'sensitive';
}

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Oster (2019) default multiplier for R²_max.
 * "I recommend using R_max = 1.3 × R_long as a default." (Oster 2019, p. 192)
 */
const R_SQUARED_MAX_MULTIPLIER = 1.3;

/** Default δ assumption for computing β_max (equal selection). */
const DEFAULT_DELTA = 1;

/** Robustness thresholds for |δ|. */
const DELTA_ROBUST_THRESHOLD = 1.0;
const DELTA_MARGINAL_THRESHOLD = 0.5;

// ─── Core Functions ────────────────────────────────────────────────────────

/**
 * Compute the bias-adjusted coefficient β_max under a given δ assumption.
 *
 * Formula (Oster 2019, Equation 4):
 *   β_max = β̂ − δ × (β* − β̂) × (R²_max − R²_controlled) / (R²_controlled − R²_uncontrolled)
 *
 * Intuition: if selection on unobservables is δ times as strong as selection on
 * observables, this is what the coefficient would be after fully adjusting for
 * all confounders.
 *
 * @param betaUncontrolled  β* — short-regression coefficient
 * @param betaControlled    β̂ — long-regression coefficient
 * @param rSquaredMax       R²_max — maximum achievable R²
 * @param rSquaredControlled R²_long — R² of the long regression
 * @param rSquaredUncontrolled R²_short — R² of the short regression
 * @param delta             δ assumption (default: 1)
 * @returns β_max — bias-adjusted coefficient
 */
export function computeBetaMax(
  betaUncontrolled: number,
  betaControlled: number,
  rSquaredMax: number,
  rSquaredControlled: number,
  rSquaredUncontrolled: number,
  delta: number = DEFAULT_DELTA,
): number {
  const rSquaredDelta = rSquaredControlled - rSquaredUncontrolled;
  const rSquaredRoom = rSquaredMax - rSquaredControlled;

  // Edge case: no R² improvement from controls → cannot extrapolate
  if (Math.abs(rSquaredDelta) < 1e-12) {
    return betaControlled;
  }

  // Edge case: no room for unobservables (R²_max == R²_controlled)
  // → unobservables cannot add anything, β_max = β̂
  if (Math.abs(rSquaredRoom) < 1e-12) {
    return betaControlled;
  }

  const adjustment = delta * (betaUncontrolled - betaControlled) * (rSquaredRoom / rSquaredDelta);
  return betaControlled - adjustment;
}

/**
 * Compute the identified set [β̂, β_max].
 *
 * The identified set bounds the true coefficient under the assumption that
 * selection on unobservables is at most as strong as selection on observables (δ ≤ 1).
 * The set is always returned as [min, max] for interpretability.
 *
 * @param betaUncontrolled  β* — short-regression coefficient
 * @param betaControlled    β̂ — long-regression coefficient
 * @param rSquaredMax       R²_max
 * @param rSquaredControlled R²_long
 * @param rSquaredUncontrolled R²_short
 * @param delta             δ assumption (default: 1)
 * @returns [lower, upper] identified set
 */
export function computeIdentifiedSet(
  betaUncontrolled: number,
  betaControlled: number,
  rSquaredMax: number,
  rSquaredControlled: number,
  rSquaredUncontrolled: number,
  delta: number = DEFAULT_DELTA,
): [number, number] {
  const betaMax = computeBetaMax(
    betaUncontrolled,
    betaControlled,
    rSquaredMax,
    rSquaredControlled,
    rSquaredUncontrolled,
    delta,
  );

  return [
    Math.min(betaControlled, betaMax),
    Math.max(betaControlled, betaMax),
  ];
}

/**
 * Compute δ — the ratio of selection on unobservables to selection on observables
 * that would drive the estimated coefficient to exactly zero.
 *
 * Formula (derived from Oster 2019, Equation 4 by setting β_max = 0):
 *   δ = β̂ × (R²_controlled − R²_uncontrolled) / [(β* − β̂) × (R²_max − R²_controlled)]
 *
 * Interpretation:
 *   - δ > 1: unobservables would need to be MORE important than observables → robust
 *   - δ < 1: unobservables weaker than observables suffice → sensitive
 *
 * @param betaUncontrolled  β*
 * @param betaControlled    β̂
 * @param rSquaredUncontrolled R²_short
 * @param rSquaredControlled R²_long
 * @param rSquaredMax       R²_max
 * @returns δ value (Infinity if coefficient cannot be driven to zero)
 */
export function computeDelta(
  betaUncontrolled: number,
  betaControlled: number,
  rSquaredUncontrolled: number,
  rSquaredControlled: number,
  rSquaredMax: number,
): number {
  const rSquaredDelta = rSquaredControlled - rSquaredUncontrolled;
  const rSquaredRoom = rSquaredMax - rSquaredControlled;
  const coefficientMovement = betaUncontrolled - betaControlled;

  // Edge case: coefficient already at zero → δ = 0
  if (Math.abs(betaControlled) < 1e-12) {
    return 0;
  }

  // Edge case: coefficient did not move with controls → infinitely robust
  // (but suspicious: controls had no effect on the estimate)
  if (Math.abs(coefficientMovement) < 1e-12) {
    return Infinity;
  }

  // Edge case: no room for unobservables (R²_max == R²_controlled)
  // → unobservables cannot affect the coefficient → infinitely robust
  if (Math.abs(rSquaredRoom) < 1e-12) {
    return Infinity;
  }

  // Edge case: controls did not improve R² → no information from observables
  // → δ = 0 (any unobservable confounding suffices)
  if (Math.abs(rSquaredDelta) < 1e-12) {
    return 0;
  }

  const delta =
    (betaControlled * rSquaredDelta) /
    (coefficientMovement * rSquaredRoom);

  return delta;
}

/**
 * Assess robustness based on |δ|.
 *
 * Thresholds (Oster 2019, Section 4):
 *   - |δ| > 1   → 'robust'   (unobservables must exceed observables to overturn)
 *   - |δ| ∈ [0.5, 1] → 'marginal'
 *   - |δ| < 0.5 → 'sensitive' (weak unobservable confounding suffices)
 *
 * @param delta δ value from computeDelta
 * @returns robustness recommendation
 */
export function assessRobustness(delta: number): 'robust' | 'marginal' | 'sensitive' {
  const absDelta = Math.abs(delta);

  if (absDelta > DELTA_ROBUST_THRESHOLD) return 'robust';
  if (absDelta >= DELTA_MARGINAL_THRESHOLD) return 'marginal';
  return 'sensitive';
}

/**
 * Main entry point: Oster (2019) coefficient stability test.
 *
 * Given the controlled and uncontrolled regression results, computes:
 *   - δ: strength of unobservables needed to drive β to zero
 *   - β_max: bias-adjusted coefficient under δ=1
 *   - biasRatio: |β̂ − β*| / |β_max − β̂|
 *   - identifiedSet: [β̂, β_max] (sorted)
 *   - isRobust: |δ| > 1
 *   - recommendation: 'robust' | 'marginal' | 'sensitive'
 *
 * @example
 * // Oster (2019)-style example: robust result
 * const result = osterSensitivityTest({
 *   betaUncontrolled: 0.5,
 *   betaControlled: 0.3,
 *   rSquaredUncontrolled: 0.1,
 *   rSquaredControlled: 0.3,
 * });
 * // result.delta ≈ 3.33, result.isRobust === true
 */
export function osterSensitivityTest(params: OsterParams): OsterResult {
  const {
    betaUncontrolled,
    betaControlled,
    rSquaredUncontrolled,
    rSquaredControlled,
  } = params;

  const rSquaredMax =
    params.rSquaredMax ?? R_SQUARED_MAX_MULTIPLIER * rSquaredControlled;
  const deltaAssumption = params.delta ?? DEFAULT_DELTA;

  // Compute δ that drives β to zero
  const delta = computeDelta(
    betaUncontrolled,
    betaControlled,
    rSquaredUncontrolled,
    rSquaredControlled,
    rSquaredMax,
  );

  // Compute β_max under the assumed δ (default δ=1)
  const betaMax = computeBetaMax(
    betaUncontrolled,
    betaControlled,
    rSquaredMax,
    rSquaredControlled,
    rSquaredUncontrolled,
    deltaAssumption,
  );

  // Compute identified set [β̂, β_max] (sorted)
  const identifiedSet: [number, number] = [
    Math.min(betaControlled, betaMax),
    Math.max(betaControlled, betaMax),
  ];

  // Compute bias ratio: |β̂ − β*| / |β_max − β̂|
  // Measures how much of the total bias (β* → β_max) is captured by observables (β* → β̂)
  const numerator = Math.abs(betaControlled - betaUncontrolled);
  const denominator = Math.abs(betaMax - betaControlled);
  const biasRatio = denominator < 1e-12 ? Infinity : numerator / denominator;

  const recommendation = assessRobustness(delta);
  const isRobust = recommendation === 'robust';

  return {
    delta,
    betaMax,
    biasRatio,
    isRobust,
    identifiedSet,
    recommendation,
  };
}
