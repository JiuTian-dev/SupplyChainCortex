/**
 * Model Validation — Main Module Barrel
 *
 * Re-exports all public API from the extracted sub-modules.
 * Export order matches the original model-validation.ts.
 *
 * Sub-modules:
 *   types.ts    — Shared type definitions (HoldoutResult, BrierResult, etc.)
 *   shared.ts   — Internal numeric helpers (not re-exported)
 *   holdout.ts  — Holdout-set validation, time-series split, k-fold CV
 *   brier.ts    — Brier Score, calibration curve, Murphy decomposition
 *   report.ts   — Comprehensive Markdown validation report
 */
export type { HoldoutResult } from './types';
export { holdoutValidation } from './holdout';
export { timeSeriesSplit } from './holdout';
export { crossValidation } from './holdout';
export type { CalibrationPoint } from './types';
export type { BrierResult } from './types';
export { brierScore } from './brier';
export { calibrationCurve } from './brier';
export { decomposeBrierScore } from './brier';
export type { ValidationReportInput } from './types';
export type { ValidationReport } from './types';
export { generateValidationReport } from './report';
