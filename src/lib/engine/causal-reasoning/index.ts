/**
 * Causal Reasoning Engine — barrel re-export.
 *
 * Implementation split into submodules:
 * - dag.ts            — buildCausalEdges (DAG 构建) + CausalFactor/CausalEdge types
 * - identification.ts — generateCausalSummary (因果效应识别)
 * - estimation.ts     — runCounterfactual (因果效应估计/干预计算) + types
 */

export type { CausalFactor, CausalEdge } from './dag';
export type { CounterfactualQuery, CounterfactualResult } from './estimation';
export { buildCausalEdges } from './dag';
export { runCounterfactual } from './estimation';
export { generateCausalSummary } from './identification';
