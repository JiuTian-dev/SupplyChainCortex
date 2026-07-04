/**
 * Cascade Risk — Main Module Barrel
 *
 * Re-exports all public API from the extracted sub-modules.
 * Export order matches the original cascade-risk.main.ts.
 *
 * Sub-modules:
 *   reporter.ts     — Report formatting & model validation
 *   orchestrator.ts — Main pipeline orchestration (getCascadeRisk)
 *   coordinator.ts  — Backtesting coordination
 */
export { buildCounterfactualAuditSnapshot } from './reporter';
export { buildPassportAlternatives } from './reporter';
export { getCascadeRisk } from './orchestrator';
export { backtest } from './coordinator';
export { runModelValidation } from './reporter';
