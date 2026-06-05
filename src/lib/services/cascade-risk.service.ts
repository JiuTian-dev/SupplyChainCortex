/**
 * Supply Chain Cascading Risk Propagation Engine v2
 *
 * Barrel file — re-exports all public API from the extracted sub-modules.
 *
 * Sub-modules:
 *   cascade-risk.types.ts         — Type definitions (SEIR, Causal ML, Monte Carlo)
 *   cascade-risk.calibration.ts   — Phase 1: Calibrated attenuation factors
 *   cascade-risk.propagation.ts   — Phases 2,3,5: Fusion, projection, BFS, Monte Carlo, SEIR, graph
 *   cascade-risk.validation.ts    — Phase 4: Sensitivity, boundaries, counterfactuals, Causal ML
 *   cascade-risk.main.ts          — Orchestrator: getCascadeRisk() + backtest()
 */
export * from './cascade-risk.types';
export { calibrateAttenuationFactors } from './cascade-risk.calibration';
export {
  setPropagationRules, fuseMultiSourceRisks, applyCustomRules,
  generateExplanation, generatePreventiveActions, weatherDesc,
  propagateMonteCarlo, computeDamageRatio, propagateSEIR,
} from './cascade-risk.propagation';
export { backtest, getCascadeRisk } from './cascade-risk.main';
export { runCounterfactual, runCausalCounterfactual, sensitivityAnalysis, boundaryTest } from './cascade-risk.validation';
