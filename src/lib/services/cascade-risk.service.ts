// @ts-nocheck
/**
 * Supply Chain Cascading Risk Propagation Engine v2
 *
 * Barrel file — re-exports all public API from the extracted sub-modules.
 *
 * Sub-modules:
 *   cascade-risk.types.ts         — Type definitions
 *   cascade-risk.calibration.ts   — Phase 1: Calibrated attenuation factors
 *   cascade-risk.propagation.ts   — Phases 2,3,5: Fusion, projection, BFS propagation, graph
 *   cascade-risk.validation.ts    — Phase 4: Sensitivity, boundaries, counterfactuals
 *   cascade-risk.main.ts          — Orchestrator: getCascadeRisk() + backtest()
 */
export * from './cascade-risk.types';
export { calibrateAttenuationFactors } from './cascade-risk.calibration';
export { setPropagationRules, fuseMultiSourceRisks, applyCustomRules, generateExplanation, generatePreventiveActions, weatherDesc } from './cascade-risk.propagation';
export { backtest, getCascadeRisk } from './cascade-risk.main';
export { runCounterfactual, sensitivityAnalysis, boundaryTest } from './cascade-risk.validation';
