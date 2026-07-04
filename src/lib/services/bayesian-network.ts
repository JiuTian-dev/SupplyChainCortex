/**
 * Dynamic Bayesian Network (DBN) for Supply Chain Risk Inference.
 *
 * Models causal dependencies between supply chain events as a probabilistic
 * graphical model. Supports:
 *   - Conditional Probability Tables (CPTs) for each node
 *   - Forward inference: update beliefs given evidence
 *   - Do-Calculus: counterfactual analysis (what-if interventions)
 *
 * Architecture:
 *   SupplyChainEvent → BN Node → CPT → Forward Inference → P(failure|evidence)
 *   Intervention: do(X=x) → mutilated network → P(Y|do(X=x))
 *
 * References:
 *   - Pearl, J. (2009). Causality: Models, Reasoning, and Inference.
 *   - Murphy, K. (2002). Dynamic Bayesian Networks.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type BNNodeState = 'nominal' | 'degraded' | 'failed';

export interface BNNode {
  /** Unique node identifier */
  id: string;
  /** Human-readable label */
  label: string;
  /** Node category */
  category: 'supplier' | 'product' | 'warehouse' | 'port' | 'certification' | 'regulation' | 'logistics';
  /** Parent node IDs (nodes this node depends on) */
  parents: string[];
  /** Conditional Probability Table: P(state | parent_states) */
  cpt: CPT;
  /** Current belief state (updated by inference) */
  belief: Record<BNNodeState, number>;
  /** Whether this node has been observed (evidence) */
  observed: boolean;
}

/**
 * Conditional Probability Table.
 * Maps parent state combinations to probability distributions over child states.
 *
 * Key format: parent1_state,parent2_state,... (alphabetically sorted parent IDs)
 * Value: { nominal: P, degraded: P, failed: P } where P sums to 1
 */
export type CPT = Record<string, Record<BNNodeState, number>>;

export interface BNEdge {
  from: string;
  to: string;
  /** Causal influence strength (0-1) */
  strength: number;
  /** Type of causal relationship */
  relation: 'supplies' | 'stores' | 'ships' | 'requires' | 'affects' | 'competes';
}

export interface BayesianNetwork {
  nodes: Map<string, BNNode>;
  edges: BNEdge[];
  /** Topologically sorted node IDs (parents before children) */
  topologicalOrder: string[];
}

export interface InferenceResult {
  nodeId: string;
  /** Posterior probability distribution after incorporating evidence */
  posterior: Record<BNNodeState, number>;
  /** Most likely state */
  mostLikelyState: BNNodeState;
  /** Probability of failure */
  failureProbability: number;
  /** Whether this was updated from prior */
  updated: boolean;
}

export interface InterventionResult {
  /** The intervention applied: do(nodeId = state) */
  intervention: { nodeId: string; state: BNNodeState };
  /** Inference results under the intervention */
  results: InferenceResult[];
  /** Change in failure probability for each node vs. baseline */
  impact: Array<{ nodeId: string; baselineFailure: number; interventionFailure: number; delta: number }>;
}

// ─── CPT Construction ───────────────────────────────────────────────────────

/**
 * Create a default CPT for a node with given parents.
 * Uses a noisy-OR assumption: each parent independently contributes to failure.
 */
export function createDefaultCPT(
  parents: string[],
  baseFailureRate: number = 0.05,
  parentInfluence: number = 0.3,
): CPT {
  if (parents.length === 0) {
    // Root node: simple prior distribution
    return {
      '': {
        nominal: 1 - baseFailureRate * 2,
        degraded: baseFailureRate * 1.5,
        failed: baseFailureRate * 0.5,
      },
    };
  }

  const cpt: CPT = {};
  const parentStates: BNNodeState[] = ['nominal', 'degraded', 'failed'];

  // Generate all parent state combinations
  function generateCombinations(
    remaining: string[],
    current: Record<string, BNNodeState>,
  ): void {
    if (remaining.length === 0) {
      const key = Object.entries(current)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, state]) => state)
        .join(',');

      // Noisy-OR: failure probability increases with each degraded/failed parent
      let failProb = baseFailureRate;
      let degradedProb = baseFailureRate * 2;

      for (const state of Object.values(current)) {
        if (state === 'failed') {
          failProb = 1 - (1 - failProb) * (1 - parentInfluence);
          degradedProb = 1 - (1 - degradedProb) * (1 - parentInfluence * 0.5);
        } else if (state === 'degraded') {
          failProb = 1 - (1 - failProb) * (1 - parentInfluence * 0.3);
          degradedProb = 1 - (1 - degradedProb) * (1 - parentInfluence * 0.2);
        }
      }

      // Normalize to ensure probabilities sum to 1
      const total = (1 - failProb - degradedProb) + degradedProb + failProb;
      cpt[key] = {
        nominal: Math.max(0, (1 - failProb - degradedProb)) / total,
        degraded: Math.max(0, degradedProb) / total,
        failed: Math.max(0, failProb) / total,
      };
      return;
    }

    const [first, ...rest] = remaining;
    for (const state of parentStates) {
      generateCombinations(rest, { ...current, [first]: state });
    }
  }

  generateCombinations(parents, {});
  return cpt;
}

// ─── Network Construction ───────────────────────────────────────────────────

/**
 * Build a Bayesian Network from supply chain graph data.
 */
export function buildBayesianNetwork(
  nodeData: Array<{
    id: string;
    label: string;
    category: BNNode['category'];
    parents: string[];
    baseFailureRate?: number;
  }>,
  edges: BNEdge[],
): BayesianNetwork {
  const nodes = new Map<string, BNNode>();

  for (const data of nodeData) {
    const cpt = createDefaultCPT(data.parents, data.baseFailureRate);
    const prior = cpt[''] || { nominal: 0.85, degraded: 0.10, failed: 0.05 };

    nodes.set(data.id, {
      id: data.id,
      label: data.label,
      category: data.category,
      parents: data.parents,
      cpt,
      belief: { ...prior },
      observed: false,
    });
  }

  // Topological sort (Kahn's algorithm)
  const inDegree = new Map<string, number>();
  for (const [id] of nodes) {
    inDegree.set(id, 0);
  }
  for (const edge of edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const topologicalOrder: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    topologicalOrder.push(current);

    for (const edge of edges.filter(e => e.from === current)) {
      const newDegree = (inDegree.get(edge.to) || 1) - 1;
      inDegree.set(edge.to, newDegree);
      if (newDegree === 0) queue.push(edge.to);
    }
  }

  return { nodes, edges, topologicalOrder };
}

// ─── Forward Inference ──────────────────────────────────────────────────────

/**
 * Perform forward inference on the Bayesian Network.
 * Updates beliefs for all nodes given observed evidence.
 *
 * Uses variable elimination with topological ordering.
 */
export function forwardInference(
  network: BayesianNetwork,
  evidence: Record<string, BNNodeState>,
): InferenceResult[] {
  // Apply evidence
  for (const [nodeId, state] of Object.entries(evidence)) {
    const node = network.nodes.get(nodeId);
    if (node) {
      node.observed = true;
      node.belief = { nominal: 0, degraded: 0, failed: 0 };
      node.belief[state] = 1.0;
    }
  }

  const results: InferenceResult[] = [];

  // Process nodes in topological order
  for (const nodeId of network.topologicalOrder) {
    const node = network.nodes.get(nodeId);
    if (!node) continue;

    if (node.observed) {
      // Evidence node: belief is already set
      results.push({
        nodeId,
        posterior: { ...node.belief },
        mostLikelyState: argmax(node.belief),
        failureProbability: node.belief.failed,
        updated: false,
      });
      continue;
    }

    // Compute posterior from CPT given parent beliefs
    if (node.parents.length === 0) {
      // Root node: use prior
      const prior = node.cpt[''] || { nominal: 0.85, degraded: 0.10, failed: 0.05 };
      node.belief = { ...prior };
    } else {
      // Weighted combination of CPT entries based on parent beliefs
      const combined: Record<BNNodeState, number> = { nominal: 0, degraded: 0, failed: 0 };

      for (const [parentKey, distribution] of Object.entries(node.cpt)) {
        // Compute weight: product of parent beliefs for this combination
        let weight = 1;
        if (parentKey === '') {
          weight = 1;
        } else {
          const parentStates = parentKey.split(',');
          const sortedParents = [...node.parents].sort();
          for (let i = 0; i < sortedParents.length; i++) {
            const parentNode = network.nodes.get(sortedParents[i]);
            if (parentNode && i < parentStates.length) {
              const parentState = parentStates[i] as BNNodeState;
              weight *= parentNode.belief[parentState] || 0;
            }
          }
        }

        for (const state of ['nominal', 'degraded', 'failed'] as BNNodeState[]) {
          combined[state] += weight * (distribution[state] || 0);
        }
      }

      // Normalize
      const total = combined.nominal + combined.degraded + combined.failed;
      if (total > 0) {
        node.belief = {
          nominal: combined.nominal / total,
          degraded: combined.degraded / total,
          failed: combined.failed / total,
        };
      }
    }

    results.push({
      nodeId,
      posterior: { ...node.belief },
      mostLikelyState: argmax(node.belief),
      failureProbability: node.belief.failed,
      updated: true,
    });
  }

  // Reset observed flags for future inferences
  for (const [nodeId] of network.nodes) {
    const node = network.nodes.get(nodeId)!;
    if (evidence[nodeId]) {
      node.observed = false;
    }
  }

  return results;
}

// ─── Do-Calculus (Counterfactual Analysis) ──────────────────────────────────

/**
 * Perform a do-intervention on the Bayesian Network.
 *
 * do(X=x) means we set node X to state x, removing all incoming edges to X.
 * This models an external intervention rather than passive observation.
 *
 * The difference between do(X=x) and observing X=x:
 * - Observation: P(Y|X=x) — conditions on X=x, parent influences preserved
 * - Intervention: P(Y|do(X=x)) — sets X=x, cuts parent influences
 *
 * This is Pearl's do-calculus: the core of causal inference.
 */
export function doIntervention(
  network: BayesianNetwork,
  intervention: { nodeId: string; state: BNNodeState },
): InterventionResult {
  // Step 1: Compute baseline (no intervention)
  const baselineResults = forwardInference(network, {});
  const baselineMap = new Map(baselineResults.map(r => [r.nodeId, r]));

  // Step 2: Create mutilated network by deep-copying and modifying
  const mutilatedNodes = new Map<string, BNNode>();
  const mutilatedEdges = network.edges.filter(e => e.to !== intervention.nodeId);

  for (const [id, node] of network.nodes) {
    if (id === intervention.nodeId) {
      // Intervened node: remove parents, create root-like CPT
      const rootCpt = createDefaultCPT([]);
      const prior = rootCpt[''];
      mutilatedNodes.set(id, {
        ...node,
        parents: [],
        cpt: rootCpt,
        belief: { ...prior },
        observed: false,
      });
    } else {
      // Other nodes: keep original CPT, only remove intervened node from parents
      // CPT keys remain valid since we only filter parent list for edge removal
      mutilatedNodes.set(id, {
        ...node,
        belief: { ...node.belief },
        observed: false,
      });
    }
  }

  // Rebuild topological order for mutilated network
  const inDegree = new Map<string, number>();
  for (const [id] of mutilatedNodes) {
    inDegree.set(id, 0);
  }
  for (const edge of mutilatedEdges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }
  const topologicalOrder: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    topologicalOrder.push(current);
    for (const edge of mutilatedEdges.filter(e => e.from === current)) {
      const newDegree = (inDegree.get(edge.to) || 1) - 1;
      inDegree.set(edge.to, newDegree);
      if (newDegree === 0) queue.push(edge.to);
    }
  }

  const mutilatedNetwork: BayesianNetwork = {
    nodes: mutilatedNodes,
    edges: mutilatedEdges,
    topologicalOrder,
  };

  // Step 3: Run inference with intervention as evidence
  const interventionResults = forwardInference(mutilatedNetwork, {
    [intervention.nodeId]: intervention.state,
  });

  // Step 4: Compute impact
  const impact = interventionResults.map(r => {
    const baseline = baselineMap.get(r.nodeId);
    return {
      nodeId: r.nodeId,
      baselineFailure: baseline?.failureProbability ?? 0,
      interventionFailure: r.failureProbability,
      delta: r.failureProbability - (baseline?.failureProbability ?? 0),
    };
  });

  return {
    intervention,
    results: interventionResults,
    impact,
  };
}

// ─── CPT Learning from Data ─────────────────────────────────────────────────

/**
 * Learn CPT from historical observation data using Maximum Likelihood Estimation.
 *
 * @param parents Parent node IDs
 * @param observations Array of { nodeState, parentStates } records
 * @param smoothing Laplace smoothing parameter (default: 1 for add-1 smoothing)
 */
export function learnCPT(
  parents: string[],
  observations: Array<{ nodeState: BNNodeState; parentStates: Record<string, BNNodeState> }>,
  smoothing: number = 1,
): CPT {
  const cpt: CPT = {};
  const states: BNNodeState[] = ['nominal', 'degraded', 'failed'];

  // Count occurrences
  const counts: Record<string, Record<BNNodeState, number>> = {};

  for (const obs of observations) {
    const key = parents.length === 0
      ? ''
      : parents
          .sort()
          .map(p => obs.parentStates[p] || 'nominal')
          .join(',');

    if (!counts[key]) {
      counts[key] = { nominal: smoothing, degraded: smoothing, failed: smoothing };
    }
    counts[key][obs.nodeState]++;
  }

  // Convert counts to probabilities with Laplace smoothing
  for (const [key, stateCounts] of Object.entries(counts)) {
    const total = stateCounts.nominal + stateCounts.degraded + stateCounts.failed;
    cpt[key] = {
      nominal: stateCounts.nominal / total,
      degraded: stateCounts.degraded / total,
      failed: stateCounts.failed / total,
    };
  }

  // Fill in missing combinations with uniform prior
  if (parents.length > 0) {
    const allStates: BNNodeState[] = ['nominal', 'degraded', 'failed'];
    function fillCombinations(remaining: string[], current: Record<string, BNNodeState>): void {
      if (remaining.length === 0) {
        const key = Object.entries(current)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, state]) => state)
          .join(',');
        if (!cpt[key]) {
          cpt[key] = { nominal: 1 / 3, degraded: 1 / 3, failed: 1 / 3 };
        }
        return;
      }
      const [first, ...rest] = remaining;
      for (const state of allStates) {
        fillCombinations(rest, { ...current, [first]: state });
      }
    }
    fillCombinations(parents, {});
  }

  return cpt;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function argmax(dist: Record<BNNodeState, number>): BNNodeState {
  let maxState: BNNodeState = 'nominal';
  let maxProb = -1;
  for (const [state, prob] of Object.entries(dist)) {
    if (prob > maxProb) {
      maxProb = prob;
      maxState = state as BNNodeState;
    }
  }
  return maxState;
}

/**
 * Get the most critical nodes (highest failure probability).
 */
export function getCriticalNodes(results: InferenceResult[], topK: number = 5): InferenceResult[] {
  return [...results]
    .sort((a, b) => b.failureProbability - a.failureProbability)
    .slice(0, topK);
}

/**
 * Format inference results for display.
 */
export function formatInferenceResults(results: InferenceResult[]): string {
  const lines = ['Bayesian Network Inference Results:'];
  for (const r of results) {
    const bar = (prob: number) => '█'.repeat(Math.round(prob * 20));
    lines.push(
      `  ${r.nodeId}: ${r.mostLikelyState} (P(fail)=${(r.failureProbability * 100).toFixed(1)}%) ` +
      `[N:${bar(r.posterior.nominal)} D:${bar(r.posterior.degraded)} F:${bar(r.posterior.failed)}]`,
    );
  }
  return lines.join('\n');
}
