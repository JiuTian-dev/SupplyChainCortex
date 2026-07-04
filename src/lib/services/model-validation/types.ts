/**
 * Model Validation — Type Definitions
 *
 * Shared types for holdout-set validation and Brier Score calibration.
 *
 * Academic References:
 *   [1] Brier, G. W. (1950). "Verification of forecasts expressed in terms of
 *       probability." Monthly Weather Review, 78(1), 1–3.
 *   [2] Murphy, A. H. (1973). "A new vector partition of the probability score."
 *       Journal of Applied Meteorology, 12(4), 595–600.
 *   [3] Wilks, D. S. (2011). Statistical Methods in the Atmospheric Sciences,
 *       3rd ed., Academic Press, §8.4 (Brier Score), §8.5 (Reliability Diagrams).
 */

/**
 * Result of a holdout-set validation against continuous actuals.
 *
 * All error metrics are computed on the same scale as the inputs (typically
 * 0–100 risk scores). `isReliable` follows the rule of thumb that RMSE
 * should be less than 20% of the actuals' standard deviation for the model
 * to be considered operationally reliable.
 */
export interface HoldoutResult {
  /** Mean Squared Error: (1/N) Σ(pred − actual)² */
  mse: number;
  /** Root Mean Squared Error: √MSE */
  rmse: number;
  /** Mean Absolute Error: (1/N) Σ|pred − actual| */
  mae: number;
  /** Mean Absolute Percentage Error: (1/N) Σ|pred − actual| / max(|actual|, ε) × 100 */
  mape: number;
  /** Coefficient of determination R² ∈ (−∞, 1] */
  rSquared: number;
  /** Pearson correlation coefficient ∈ [−1, 1] */
  correlation: number;
  /** Bias = mean(pred) − mean(actual); >0 means over-forecasting */
  bias: number;
  /** True iff RMSE < 0.2 × std(actuals) */
  isReliable: boolean;
  /** Number of paired observations used */
  n: number;
}

/**
 * One point of a calibration (reliability) curve.
 *
 * @reference Wilks (2011) §8.5 — reliability diagrams.
 */
export interface CalibrationPoint {
  /** Midpoint of the forecast-probability bin (e.g. 0.05 for bin [0, 0.1]). */
  binCenter: number;
  /** Empirical observed frequency within this bin: (#events / #forecasts). */
  observedFrequency: number;
  /** Mean forecast probability within this bin. */
  forecastProbability: number;
  /** Number of forecasts that fell into this bin. */
  count: number;
}

/**
 * Full Brier Score assessment with Murphy (1973) three-component decomposition.
 *
 *   Brier Score  =  REL  −  RES  +  UNC
 *
 * where:
 *   REL  — reliability (calibration): smaller is better (0 = perfect).
 *   RES  — resolution: larger is better (forecasts separate events from
 *          non-events).
 *   UNC  — uncertainty: climatological base-rate variance, independent of
 *          the forecaster.
 *
 * The Brier Skill Score (BSS) is computed against the climatological
 * forecast (constant probability = base rate):
 *
 *   BSS = 1 − BS / BS_climatology
 *
 * BSS > 0 means the forecasts beat climatology; BSS = 0 means parity.
 *
 * @reference Brier (1950); Murphy (1973); Wilks (2011) §8.4.
 */
export interface BrierResult {
  /** Raw Brier Score ∈ [0, 1]; 0 = perfect, 1 = worst. */
  brierScore: number;
  /** Reliability component (calibration penalty). Lower = better. */
  reliability: number;
  /** Resolution component (forecast sharpness). Higher = better. */
  resolution: number;
  /** Uncertainty component (climatological variance). */
  uncertainty: number;
  /** Brier Skill Score relative to climatology. >0 beats climatology. */
  skillScore: number;
  /** Calibration curve with `numBins` points. */
  calibrationCurve: CalibrationPoint[];
  /** True iff reliability < 0.05 (well-calibrated threshold). */
  isCalibrated: boolean;
  /** Number of (forecast, outcome) pairs evaluated. */
  n: number;
}

/**
 * Input bundle for {@link generateValidationReport}.
 */
export interface ValidationReportInput {
  /** Continuous predictions (e.g. risk scores 0–100). Optional. */
  predictions?: number[];
  /** Observed continuous actuals aligned with `predictions`. Optional. */
  actuals?: number[];
  /** Probabilistic forecasts in [0, 1]. Optional. */
  forecasts?: number[];
  /** Binary outcomes aligned with `forecasts`. Optional. */
  outcomes?: number[];
  /** Number of bins for the calibration curve (default 10). */
  numBins?: number;
  /** Optional model name for the report header. */
  modelName?: string;
}

/**
 * Comprehensive validation report combining holdout metrics and Brier Score
 * assessment, rendered as Markdown for inclusion in risk reports.
 */
export interface ValidationReport {
  /** Markdown-formatted human-readable report. */
  markdown: string;
  /** Structured holdout metrics (if continuous predictions were provided). */
  holdout?: HoldoutResult;
  /** Structured Brier assessment (if probabilistic forecasts were provided). */
  brier?: BrierResult;
  /** Overall pass/fail verdict: holdout.isReliable && brier.isCalibrated. */
  passed: boolean;
}
