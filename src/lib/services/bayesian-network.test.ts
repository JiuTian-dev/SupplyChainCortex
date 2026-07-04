import { describe, it, expect } from 'vitest';
import {
  createDefaultCPT,
  buildBayesianNetwork,
  forwardInference,
  doIntervention,
  learnCPT,
  getCriticalNodes,
  formatInferenceResults,
  type BNNodeState,
  type BNEdge,
} from './bayesian-network';

// ─── Helpers ────────────────────────────────────────────────────────────────

function sumDist(dist: Record<BNNodeState, number>): number {
  return dist.nominal + dist.degraded + dist.failed;
}

/** Build a simple 3-node chain: A → B → C */
function buildChainNetwork() {
  const nodeData = [
    { id: 'A', label: 'Supplier A', category: 'supplier' as const, parents: [] },
    { id: 'B', label: 'Product B', category: 'product' as const, parents: ['A'] },
    { id: 'C', label: 'Warehouse C', category: 'warehouse' as const, parents: ['B'] },
  ];
  const edges: BNEdge[] = [
    { from: 'A', to: 'B', strength: 0.8, relation: 'supplies' },
    { from: 'B', to: 'C', strength: 0.7, relation: 'stores' },
  ];
  return buildBayesianNetwork(nodeData, edges);
}

/** Build a diamond network: A → B, A → C, B → D, C → D */
function buildDiamondNetwork() {
  const nodeData = [
    { id: 'A', label: 'Root', category: 'supplier' as const, parents: [] },
    { id: 'B', label: 'Left', category: 'product' as const, parents: ['A'] },
    { id: 'C', label: 'Right', category: 'port' as const, parents: ['A'] },
    { id: 'D', label: 'Sink', category: 'warehouse' as const, parents: ['B', 'C'] },
  ];
  const edges: BNEdge[] = [
    { from: 'A', to: 'B', strength: 0.7, relation: 'supplies' },
    { from: 'A', to: 'C', strength: 0.6, relation: 'affects' },
    { from: 'B', to: 'D', strength: 0.8, relation: 'stores' },
    { from: 'C', to: 'D', strength: 0.5, relation: 'ships' },
  ];
  return buildBayesianNetwork(nodeData, edges);
}

// ─── createDefaultCPT ───────────────────────────────────────────────────────

describe('createDefaultCPT', () => {
  it('creates a root node CPT with empty parent key', () => {
    const cpt = createDefaultCPT([]);
    expect(cpt['']).toBeDefined();
    expect(sumDist(cpt[''])).toBeCloseTo(1, 10);
    expect(cpt[''].nominal).toBeGreaterThan(cpt[''].failed);
  });

  it('root CPT uses default base failure rate', () => {
    const cpt = createDefaultCPT([]);
    // baseFailureRate=0.05 → nominal=0.9, degraded=0.075, failed=0.025
    expect(cpt[''].nominal).toBeCloseTo(0.9, 5);
    expect(cpt[''].degraded).toBeCloseTo(0.075, 5);
    expect(cpt[''].failed).toBeCloseTo(0.025, 5);
  });

  it('root CPT respects custom base failure rate', () => {
    const cpt = createDefaultCPT([], 0.1);
    expect(cpt[''].nominal).toBeCloseTo(0.8, 5);
    expect(cpt[''].degraded).toBeCloseTo(0.15, 5);
    expect(cpt[''].failed).toBeCloseTo(0.05, 5);
  });

  it('generates all parent state combinations for 1 parent', () => {
    const cpt = createDefaultCPT(['P1']);
    // 3 states × 1 parent = 3 keys
    expect(Object.keys(cpt)).toHaveLength(3);
    expect(cpt['nominal']).toBeDefined();
    expect(cpt['degraded']).toBeDefined();
    expect(cpt['failed']).toBeDefined();
  });

  it('generates all parent state combinations for 2 parents', () => {
    const cpt = createDefaultCPT(['P1', 'P2']);
    // 3^2 = 9 keys
    expect(Object.keys(cpt)).toHaveLength(9);
  });

  it('all CPT entries sum to 1', () => {
    const cpt = createDefaultCPT(['P1', 'P2']);
    for (const dist of Object.values(cpt)) {
      expect(sumDist(dist)).toBeCloseTo(1, 10);
    }
  });

  it('failed parents increase failure probability (noisy-OR)', () => {
    const cpt = createDefaultCPT(['P1']);
    expect(cpt['failed'].failed).toBeGreaterThan(cpt['nominal'].failed);
    expect(cpt['degraded'].failed).toBeGreaterThan(cpt['nominal'].failed);
  });

  it('more failed parents → higher failure probability', () => {
    const cpt = createDefaultCPT(['P1', 'P2']);
    const bothFailed = cpt['failed,failed'].failed;
    const oneFailed = cpt['failed,nominal'].failed;
    const noneFailed = cpt['nominal,nominal'].failed;
    expect(bothFailed).toBeGreaterThan(oneFailed);
    expect(oneFailed).toBeGreaterThan(noneFailed);
  });
});

// ─── buildBayesianNetwork ───────────────────────────────────────────────────

describe('buildBayesianNetwork', () => {
  it('builds a network with correct number of nodes', () => {
    const net = buildChainNetwork();
    expect(net.nodes.size).toBe(3);
  });

  it('assigns CPT and prior belief to each node', () => {
    const net = buildChainNetwork();
    for (const node of net.nodes.values()) {
      expect(node.cpt).toBeDefined();
      expect(sumDist(node.belief)).toBeCloseTo(1, 10);
    }
  });

  it('computes topological order (parents before children)', () => {
    const net = buildChainNetwork();
    const idxA = net.topologicalOrder.indexOf('A');
    const idxB = net.topologicalOrder.indexOf('B');
    const idxC = net.topologicalOrder.indexOf('C');
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });

  it('handles diamond topology', () => {
    const net = buildDiamondNetwork();
    const idxA = net.topologicalOrder.indexOf('A');
    const idxB = net.topologicalOrder.indexOf('B');
    const idxC = net.topologicalOrder.indexOf('C');
    const idxD = net.topologicalOrder.indexOf('D');
    expect(idxA).toBeLessThan(idxB);
    expect(idxA).toBeLessThan(idxC);
    expect(idxB).toBeLessThan(idxD);
    expect(idxC).toBeLessThan(idxD);
  });

  it('preserves edges', () => {
    const net = buildChainNetwork();
    expect(net.edges).toHaveLength(2);
  });

  it('root node has empty parents array', () => {
    const net = buildChainNetwork();
    const nodeA = net.nodes.get('A')!;
    expect(nodeA.parents).toEqual([]);
  });

  it('child node has correct parents', () => {
    const net = buildChainNetwork();
    const nodeB = net.nodes.get('B')!;
    expect(nodeB.parents).toEqual(['A']);
  });
});

// ─── forwardInference ───────────────────────────────────────────────────────

describe('forwardInference', () => {
  it('returns results for all nodes', () => {
    const net = buildChainNetwork();
    const results = forwardInference(net, {});
    expect(results).toHaveLength(3);
  });

  it('root node uses prior when no evidence', () => {
    const net = buildChainNetwork();
    const results = forwardInference(net, {});
    const rootResult = results.find(r => r.nodeId === 'A')!;
    expect(rootResult.posterior.nominal).toBeCloseTo(0.9, 5);
  });

  it('evidence sets observed node belief to deterministic', () => {
    const net = buildChainNetwork();
    const results = forwardInference(net, { A: 'failed' });
    const aResult = results.find(r => r.nodeId === 'A')!;
    expect(aResult.posterior.failed).toBe(1);
    expect(aResult.posterior.nominal).toBe(0);
    expect(aResult.mostLikelyState).toBe('failed');
  });

  it('parent failure increases child failure probability', () => {
    const net = buildChainNetwork();
    const baseline = forwardInference(net, {});
    const withFailure = forwardInference(net, { A: 'failed' });

    const baselineB = baseline.find(r => r.nodeId === 'B')!;
    const failedB = withFailure.find(r => r.nodeId === 'B')!;

    expect(failedB.failureProbability).toBeGreaterThan(baselineB.failureProbability);
  });

  it('cascading failure propagates through chain', () => {
    const net = buildChainNetwork();
    const baseline = forwardInference(net, {});
    const withFailure = forwardInference(net, { A: 'failed' });

    const baselineC = baseline.find(r => r.nodeId === 'C')!;
    const failedC = withFailure.find(r => r.nodeId === 'C')!;

    expect(failedC.failureProbability).toBeGreaterThan(baselineC.failureProbability);
  });

  it('all posteriors sum to 1', () => {
    const net = buildChainNetwork();
    const results = forwardInference(net, { A: 'degraded' });
    for (const r of results) {
      expect(sumDist(r.posterior)).toBeCloseTo(1, 10);
    }
  });

  it('resets observed flags after inference', () => {
    const net = buildChainNetwork();
    forwardInference(net, { A: 'failed' });
    const nodeA = net.nodes.get('A')!;
    expect(nodeA.observed).toBe(false);
  });

  it('handles diamond network with shared parent', () => {
    const net = buildDiamondNetwork();
    const results = forwardInference(net, { A: 'failed' });
    // Both B and C should have elevated failure
    const bResult = results.find(r => r.nodeId === 'B')!;
    const cResult = results.find(r => r.nodeId === 'C')!;
    expect(bResult.failureProbability).toBeGreaterThan(0.05);
    expect(cResult.failureProbability).toBeGreaterThan(0.05);
    // D should have elevated failure due to two failed paths
    const dResult = results.find(r => r.nodeId === 'D')!;
    expect(dResult.failureProbability).toBeGreaterThan(0.05);
  });

  it('mostLikelyState is argmax of posterior', () => {
    const net = buildChainNetwork();
    const results = forwardInference(net, {});
    for (const r of results) {
      expect(r.posterior[r.mostLikelyState]).toBeGreaterThanOrEqual(
        r.posterior.nominal,
      );
    }
  });

  it('updated flag is false for evidence nodes, true for inferred', () => {
    const net = buildChainNetwork();
    const results = forwardInference(net, { A: 'failed' });
    const aResult = results.find(r => r.nodeId === 'A')!;
    const bResult = results.find(r => r.nodeId === 'B')!;
    expect(aResult.updated).toBe(false);
    expect(bResult.updated).toBe(true);
  });
});

// ─── doIntervention ─────────────────────────────────────────────────────────

describe('doIntervention', () => {
  it('returns intervention info', () => {
    const net = buildChainNetwork();
    const result = doIntervention(net, { nodeId: 'A', state: 'failed' });
    expect(result.intervention).toEqual({ nodeId: 'A', state: 'failed' });
  });

  it('returns results for all nodes', () => {
    const net = buildChainNetwork();
    const result = doIntervention(net, { nodeId: 'A', state: 'failed' });
    expect(result.results).toHaveLength(3);
  });

  it('computes impact with delta for each node', () => {
    const net = buildChainNetwork();
    const result = doIntervention(net, { nodeId: 'A', state: 'failed' });
    expect(result.impact).toHaveLength(3);
    for (const imp of result.impact) {
      expect(imp).toHaveProperty('baselineFailure');
      expect(imp).toHaveProperty('interventionFailure');
      expect(imp).toHaveProperty('delta');
    }
  });

  it('intervention on root increases downstream failure', () => {
    const net = buildChainNetwork();
    const result = doIntervention(net, { nodeId: 'A', state: 'failed' });
    const bImpact = result.impact.find(i => i.nodeId === 'B')!;
    expect(bImpact.delta).toBeGreaterThan(0);
  });

  it('intervention on leaf node does not affect upstream', () => {
    const net = buildChainNetwork();
    const result = doIntervention(net, { nodeId: 'C', state: 'failed' });
    const aImpact = result.impact.find(i => i.nodeId === 'A')!;
    // A is upstream, should not be affected
    expect(Math.abs(aImpact.delta)).toBeLessThan(0.001);
  });

  it('do(X=failed) differs from observing X=failed for upstream nodes', () => {
    // do(A=failed) cuts A's parents (none in this case, so same for root)
    // But for a non-root: do(B=failed) should NOT update A's belief
    const net = buildChainNetwork();

    // Observation: observe B=failed → A is not updated (A has no B as parent)
    // but the network still processes A first
    const obsResults = forwardInference(net, { B: 'failed' });
    const obsA = obsResults.find(r => r.nodeId === 'A')!;

    // Intervention: do(B=failed) → cuts A→B edge, B has no parents
    const intResult = doIntervention(net, { nodeId: 'B', state: 'failed' });
    const intA = intResult.results.find(r => r.nodeId === 'A')!;

    // A should be the same in both cases (A has no parent that depends on B)
    expect(obsA.failureProbability).toBeCloseTo(intA.failureProbability, 5);
  });

  it('intervention on non-root removes parent dependencies', () => {
    const net = buildChainNetwork();
    const result = doIntervention(net, { nodeId: 'B', state: 'failed' });
    // B is intervened: its parents are removed, so B's state is set directly
    const bResult = result.results.find(r => r.nodeId === 'B')!;
    expect(bResult.posterior.failed).toBe(1);
  });
});

// ─── learnCPT ───────────────────────────────────────────────────────────────

describe('learnCPT', () => {
  it('learns CPT from observations for root node', () => {
    const observations = [
      { nodeState: 'nominal' as BNNodeState, parentStates: {} },
      { nodeState: 'nominal' as BNNodeState, parentStates: {} },
      { nodeState: 'nominal' as BNNodeState, parentStates: {} },
      { nodeState: 'failed' as BNNodeState, parentStates: {} },
    ];
    const cpt = learnCPT([], observations);
    // With Laplace smoothing (α=1): counts = {nominal: 4, degraded: 1, failed: 2}
    // Total = 7
    expect(cpt[''].nominal).toBeCloseTo(4 / 7, 5);
    expect(cpt[''].failed).toBeCloseTo(2 / 7, 5);
  });

  it('learns CPT with parent states', () => {
    const observations = [
      { nodeState: 'nominal' as BNNodeState, parentStates: { P1: 'nominal' as BNNodeState } },
      { nodeState: 'nominal' as BNNodeState, parentStates: { P1: 'nominal' as BNNodeState } },
      { nodeState: 'failed' as BNNodeState, parentStates: { P1: 'failed' as BNNodeState } },
    ];
    const cpt = learnCPT(['P1'], observations);
    // nominal,nominal → counts: {nominal: 3, degraded: 1, failed: 1} (2 obs + smoothing)
    expect(cpt['nominal'].nominal).toBeCloseTo(3 / 5, 5);
    // failed → counts: {nominal: 1, degraded: 1, failed: 2} (1 obs + smoothing)
    expect(cpt['failed'].failed).toBeCloseTo(2 / 4, 5);
  });

  it('fills missing combinations with uniform prior', () => {
    const observations = [
      { nodeState: 'nominal' as BNNodeState, parentStates: { P1: 'nominal' as BNNodeState } },
    ];
    const cpt = learnCPT(['P1'], observations);
    // Should have all 3 keys: nominal, degraded, failed
    expect(Object.keys(cpt)).toHaveLength(3);
    // Unobserved combinations get uniform 1/3
    expect(cpt['degraded'].nominal).toBeCloseTo(1 / 3, 5);
    expect(cpt['failed'].nominal).toBeCloseTo(1 / 3, 5);
  });

  it('applies Laplace smoothing with custom parameter', () => {
    const observations = [
      { nodeState: 'nominal' as BNNodeState, parentStates: {} },
    ];
    const cpt0 = learnCPT([], observations, 0); // No smoothing
    const cpt1 = learnCPT([], observations, 1); // Default smoothing
    // Without smoothing: nominal=1, degraded=0, failed=0
    expect(cpt0[''].nominal).toBe(1);
    expect(cpt0[''].degraded).toBe(0);
    // With smoothing: nominal=2, degraded=1, failed=1 → total=4
    expect(cpt1[''].nominal).toBeCloseTo(2 / 4, 5);
  });

  it('all learned CPT entries sum to 1', () => {
    const observations = [
      { nodeState: 'nominal' as BNNodeState, parentStates: { P1: 'nominal' as BNNodeState } },
      { nodeState: 'failed' as BNNodeState, parentStates: { P1: 'failed' as BNNodeState } },
      { nodeState: 'degraded' as BNNodeState, parentStates: { P1: 'degraded' as BNNodeState } },
    ];
    const cpt = learnCPT(['P1'], observations);
    for (const dist of Object.values(cpt)) {
      expect(sumDist(dist)).toBeCloseTo(1, 10);
    }
  });

  it('handles empty observations with smoothing', () => {
    const cpt = learnCPT(['P1'], [], 1);
    // All combinations get uniform (1/3 each) since no observations
    for (const dist of Object.values(cpt)) {
      expect(dist.nominal).toBeCloseTo(1 / 3, 5);
    }
  });

  it('sorts parent keys alphabetically', () => {
    const observations = [
      {
        nodeState: 'nominal' as BNNodeState,
        parentStates: { B: 'nominal' as BNNodeState, A: 'failed' as BNNodeState },
      },
    ];
    const cpt = learnCPT(['B', 'A'], observations);
    // Keys should be sorted by parent ID: A,B → "failed,nominal"
    expect(cpt['failed,nominal']).toBeDefined();
  });
});

// ─── getCriticalNodes ───────────────────────────────────────────────────────

describe('getCriticalNodes', () => {
  it('returns top-K nodes by failure probability', () => {
    const net = buildChainNetwork();
    const results = forwardInference(net, { A: 'failed' });
    const critical = getCriticalNodes(results, 2);
    expect(critical).toHaveLength(2);
    expect(critical[0].failureProbability).toBeGreaterThanOrEqual(critical[1].failureProbability);
  });

  it('returns all nodes if topK exceeds count', () => {
    const net = buildChainNetwork();
    const results = forwardInference(net, {});
    const critical = getCriticalNodes(results, 10);
    expect(critical).toHaveLength(3);
  });
});

// ─── formatInferenceResults ─────────────────────────────────────────────────

describe('formatInferenceResults', () => {
  it('formats results as readable string', () => {
    const net = buildChainNetwork();
    const results = forwardInference(net, {});
    const formatted = formatInferenceResults(results);
    expect(formatted).toContain('Bayesian Network Inference Results:');
    expect(formatted).toContain('A:');
    expect(formatted).toContain('P(fail)');
  });

  it('includes visual bars for probabilities', () => {
    const net = buildChainNetwork();
    const results = forwardInference(net, {});
    const formatted = formatInferenceResults(results);
    // nominal should have the most bars
    expect(formatted).toContain('█');
  });
});
