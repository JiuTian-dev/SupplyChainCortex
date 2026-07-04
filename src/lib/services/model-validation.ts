/**
 * Model Validation Module — Holdout Set & Brier Score Calibration Assessment
 *
 * Thin barrel — re-exports all public API from the extracted sub-modules.
 *
 * Sub-modules (in ./model-validation/):
 *   types.ts    — Shared type definitions (HoldoutResult, BrierResult, etc.)
 *   shared.ts   — Internal numeric helpers
 *   holdout.ts  — Holdout-set validation, time-series split, k-fold CV
 *   brier.ts    — Brier Score, calibration curve, Murphy decomposition
 *   report.ts   — Comprehensive Markdown validation report
 *
 * Public import path '@/lib/services/model-validation' is preserved.
 *
 * Academic References:
 *   [1] Brier, G. W. (1950). "Verification of forecasts expressed in terms of
 *       probability." Monthly Weather Review, 78(1), 1–3.
 *   [2] Murphy, A. H. (1973). "A new vector partition of the probability score."
 *       Journal of Applied Meteorology, 12(4), 595–600.
 *   [3] Wilks, D. S. (2011). Statistical Methods in the Atmospheric Sciences,
 *       3rd ed., Academic Press, §8.4 (Brier Score), §8.5 (Reliability Diagrams).
 *   [4] Hyndman, R. J. & Athanasopoulos, G. (2018). Forecasting: Principles
 *       and Practice, 2nd ed., OTexts, §5.8 (Time-series cross-validation).
 *   [5] Kohavi, R. (1995). "A study of cross-validation and bootstrap for
 *       accuracy estimation and model selection." IJCAI'95, 1137–1143.
 */
export * from './model-validation/index';
