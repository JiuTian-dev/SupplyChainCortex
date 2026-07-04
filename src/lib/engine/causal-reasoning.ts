/**
 * Causal Reasoning Engine — barrel re-export.
 *
 * Implementation split into ./causal-reasoning/ submodules:
 * - dag.ts            — buildCausalEdges (因果有向无环图构建) + CausalFactor/CausalEdge types
 * - identification.ts — generateCausalSummary (因果效应识别)
 * - estimation.ts     — runCounterfactual (因果效应估计/干预计算) + types
 *
 * Public import path unchanged: `@/lib/engine/causal-reasoning`
 */

export * from './causal-reasoning/index';
