/**
 * Cascade Risk — Propagation Engine Barrel
 *
 * Re-exports all public API from the propagation sub-modules.
 * Export order matches the original cascade-risk.propagation.ts.
 *
 * Sub-modules:
 *   analysis.ts     — Fusion, graph, BFS, projection, rules, statistics
 *   monte-carlo.ts  — Monte Carlo probabilistic propagation
 *   seirs.ts        — SEIRS epidemic dynamics model
 */
export type { AnomalySource } from './analysis';
export { fuseMultiSourceRisks } from './analysis';
export { computeDamageRatio } from './analysis';
export { projectForward } from './analysis';
export { generatePreventiveActions } from './analysis';
export { setPropagationRules } from './analysis';
export { applyCustomRules } from './analysis';
export { generateExplanation } from './analysis';
export { buildGraph } from './analysis';
export { propagate } from './analysis';
export { propagateMonteCarlo } from './monte-carlo';
export { weatherDesc } from './analysis';
export { computeR0 } from './seirs';
export { computeRt } from './seirs';
export { propagateSEIRS } from './seirs';
export { propagateSEIR } from './seirs';
