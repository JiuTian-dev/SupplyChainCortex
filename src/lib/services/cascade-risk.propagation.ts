/**
 * Cascade Risk — Propagation Engine Module (Phases 2, 3, 5)
 *
 * Thin barrel — re-exports all public API from the extracted sub-modules.
 *
 * Sub-modules (in ./cascade-risk/propagation/):
 *   analysis.ts     — Multi-source fusion, graph construction, BFS propagation,
 *                     forward projection, custom rules, statistical helpers
 *   monte-carlo.ts  — Monte Carlo probabilistic propagation
 *   seirs.ts        — SEIRS epidemic-style contagion dynamics with R→S cycle
 *
 * Public import path '@/lib/services/cascade-risk.propagation' is preserved.
 */
export * from './cascade-risk/propagation/index';
