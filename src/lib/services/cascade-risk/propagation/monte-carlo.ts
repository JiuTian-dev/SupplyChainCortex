/**
 * Cascade Risk — Monte Carlo Probabilistic Propagation
 *
 * Runs BFS propagation `iterations` times with sampled attenuation
 * to produce per-node risk distributions (mean, stdDev, P5, P50, P95).
 *
 * Extracted from cascade-risk.propagation.ts for modularity.
 */
import { calibratedAttenuation } from '../../cascade-risk.calibration';
import type {
  CascadeNode, CascadeEdge, MonteCarloConfig, MonteCarloResult,
} from '../../cascade-risk.types';
import { propagate, percentile } from './analysis';

/** Box-Muller transform for normal distribution sampling */
function sampleNormal(mean: number, stdDev: number, rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1 || 0.0001)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

/** Seeded PRNG (Mulberry32) for reproducible Monte Carlo runs */
function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Monte Carlo propagation: runs BFS `iterations` times with sampled attenuation.
 * Returns per-node risk distribution (mean, stdDev, P5, P50, P95).
 */
export function propagateMonteCarlo(
  nodes: Map<string, CascadeNode>,
  edges: CascadeEdge[],
  sources: Array<{ nodeId: string; riskScore: number; cause: string }>,
  config: MonteCarloConfig = { iterations: 500 },
): MonteCarloResult[] {
  const { iterations, seed = 42 } = config;
  const rng = createRng(seed);

  // Compute per-edge stdDev from calibration or default ~8% of attenuation
  const edgeStdDevs = new Map<string, number>();
  for (const edge of edges) {
    const cal = calibratedAttenuation?.[edge.type];
    edgeStdDevs.set(edge.id, cal?.stdDev ?? (edge.attenuation * 0.08));
  }

  // Accumulator: nodeId → risk values across iterations
  const accumulator = new Map<string, number[]>();

  for (let iter = 0; iter < iterations; iter++) {
    // Sample attenuations for this iteration
    const sampledEdges = edges.map(e => {
      const std = edgeStdDevs.get(e.id) ?? 0.05;
      const sampledAttenuation = Math.min(Math.max(sampleNormal(e.attenuation, std, rng), 0), 1);
      return { ...e, attenuation: sampledAttenuation };
    });

    // Run deterministic BFS with sampled attenuations
    const result = propagate(nodes, sampledEdges, sources);

    for (const step of result) {
      const list = accumulator.get(step.nodeId) || [];
      list.push(step.riskScore);
      accumulator.set(step.nodeId, list);
    }
  }

  // Compute statistics
  const results: MonteCarloResult[] = [];
  for (const [nodeId, risks] of accumulator) {
    const node = nodes.get(nodeId);
    if (!node) continue;
    const mean = risks.reduce((a, b) => a + b, 0) / risks.length;
    const variance = risks.reduce((s, r) => s + (r - mean) ** 2, 0) / risks.length;

    results.push({
      nodeId,
      label: node.label,
      type: node.type,
      meanRisk: Math.round(mean * 10) / 10,
      stdDev: Math.round(Math.sqrt(variance) * 10) / 10,
      p5: Math.round(percentile(risks, 5) * 10) / 10,
      p50: Math.round(percentile(risks, 50) * 10) / 10,
      p95: Math.round(percentile(risks, 95) * 10) / 10,
      iterations: risks.length,
    });
  }

  return results.sort((a, b) => b.meanRisk - a.meanRisk);
}
