/**
 * Decision Tracer — Deep agent decision trace with causal DAG.
 *
 * Captures the full decision pipeline of the FSM agent:
 *   1. Prompt/Response pairs (LLM input → output at each state)
 *   2. Memory state snapshots (what the agent "knew" at each step)
 *   3. Causal DAG (which decisions influenced which subsequent decisions)
 *
 * This enables post-hoc auditing: "Why did the agent make this decision?"
 *
 * Architecture:
 *   FSM state transitions → DecisionNode[] → CausalDAG → provenance
 */

import { startOrchestrationSpan, endSpan } from '@/lib/audit/otel-tracing';

// ─── Types ──────────────────────────────────────────────────────────────────

export type FSMState = 'classify' | 'plan' | 'retrieve' | 'execute' | 'observe' | 'decide' | 'synthesize';

export interface PromptResponsePair {
  /** FSM state when this LLM call was made */
  state: FSMState;
  /** Round number (0-based) */
  round: number;
  /** The system + user prompt sent to the LLM */
  prompt: string;
  /** The LLM's response */
  response: string;
  /** Model used */
  model: string;
  /** Token counts */
  inputTokens?: number;
  outputTokens?: number;
  /** Latency in ms */
  latencyMs: number;
  /** Timestamp */
  timestamp: string;
}

export interface MemorySnapshot {
  /** FSM state */
  state: FSMState;
  /** Round number */
  round: number;
  /** Knowledge base chunks retrieved */
  retrievedChunks: Array<{ id: string; domain: string; score: number }>;
  /** Graph entities discovered */
  graphEntities: Array<{ nodeId: string; nodeType: string; label: string }>;
  /** Tool results available */
  toolResults: Array<{ tool: string; success: boolean; latencyMs: number }>;
  /** Current confidence */
  confidence?: number;
  /** Timestamp */
  timestamp: string;
}

export interface DecisionNode {
  /** Unique ID for this decision point */
  id: string;
  /** FSM state */
  state: FSMState;
  /** Round number */
  round: number;
  /** What was decided */
  decision: string;
  /** Why it was decided (reasoning) */
  reasoning: string;
  /** What inputs influenced this decision */
  inputs: string[];
  /** What outputs this decision produced */
  outputs: string[];
  /** Confidence at this decision point */
  confidence?: number;
  /** Timestamp */
  timestamp: string;
}

export interface CausalEdge {
  /** Source decision node ID */
  from: string;
  /** Target decision node ID */
  to: string;
  /** Type of causal influence */
  type: 'enables' | 'constrains' | 'informs' | 'triggers';
  /** Description of the influence */
  label: string;
}

export interface CausalDAG {
  nodes: DecisionNode[];
  edges: CausalEdge[];
  /** Root decision (first node) */
  rootId: string | null;
  /** Leaf decisions (final outputs) */
  leafIds: string[];
}

export interface DecisionTrace {
  /** Trace ID (linked to auditId) */
  id: string;
  /** Query that triggered this trace */
  query: string;
  /** Intent classification */
  intent: string;
  /** Prompt/Response pairs */
  promptResponses: PromptResponsePair[];
  /** Memory state snapshots */
  memorySnapshots: MemorySnapshot[];
  /** Causal DAG */
  causalDAG: CausalDAG;
  /** Total duration */
  totalDurationMs: number;
  /** Timestamp */
  startedAt: string;
  completedAt: string;
}

// ─── Trace Builder ──────────────────────────────────────────────────────────

/**
 * DecisionTracer accumulates trace data as the FSM agent executes.
 * Call the recording methods at each FSM state transition.
 */
export class DecisionTracer {
  private traceId: string;
  private query: string;
  private intent: string = 'unknown';
  private promptResponses: PromptResponsePair[] = [];
  private memorySnapshots: MemorySnapshot[] = [];
  private decisionNodes: DecisionNode[] = [];
  private causalEdges: CausalEdge[] = [];
  private startedAt: string;
  private nodeCounter = 0;

  constructor(query: string) {
    this.traceId = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.query = query;
    this.startedAt = new Date().toISOString();
  }

  /** Set the classified intent */
  setIntent(intent: string): void {
    this.intent = intent;
    this.addDecisionNode('classify', 0, `Classified as: ${intent}`, `Intent routing`, [], [`intent:${intent}`]);
  }

  /** Record a prompt/response pair from an LLM call */
  recordPromptResponse(pair: Omit<PromptResponsePair, 'timestamp'>): void {
    this.promptResponses.push({
      ...pair,
      timestamp: new Date().toISOString(),
    });
  }

  /** Record a memory state snapshot */
  recordMemorySnapshot(snapshot: Omit<MemorySnapshot, 'timestamp'>): void {
    this.memorySnapshots.push({
      ...snapshot,
      timestamp: new Date().toISOString(),
    });
  }

  /** Add a decision node to the causal DAG */
  addDecisionNode(
    state: FSMState,
    round: number,
    decision: string,
    reasoning: string,
    inputs: string[],
    outputs: string[],
    confidence?: number,
  ): string {
    const id = `decision-${++this.nodeCounter}`;
    this.decisionNodes.push({
      id,
      state,
      round,
      decision,
      reasoning,
      inputs,
      outputs,
      confidence,
      timestamp: new Date().toISOString(),
    });
    return id;
  }

  /** Add a causal edge between two decision nodes */
  addCausalEdge(
    from: string,
    to: string,
    type: CausalEdge['type'],
    label: string,
  ): void {
    this.causalEdges.push({ from, to, type, label });
  }

  /** Auto-link consecutive decisions in the same round */
  autoLinkDecisions(): void {
    const nodesByRound = new Map<number, DecisionNode[]>();
    for (const node of this.decisionNodes) {
      const existing = nodesByRound.get(node.round) || [];
      existing.push(node);
      existing.sort((a, b) => {
        const order: Record<FSMState, number> = { classify: 0, plan: 1, retrieve: 2, execute: 3, observe: 4, decide: 5, synthesize: 6 };
        return (order[a.state] ?? 99) - (order[b.state] ?? 99);
      });
      nodesByRound.set(node.round, existing);
    }

    // Link consecutive decisions within each round
    for (const [, nodes] of nodesByRound) {
      for (let i = 1; i < nodes.length; i++) {
        const prev = nodes[i - 1];
        const curr = nodes[i];

        // Check if edge already exists
        const exists = this.causalEdges.some(e => e.from === prev.id && e.to === curr.id);
        if (!exists) {
          this.causalEdges.push({
            from: prev.id,
            to: curr.id,
            type: 'enables',
            label: `${prev.state} → ${curr.state}`,
          });
        }
      }
    }

    // Link last decision of round N to first decision of round N+1
    const rounds = [...nodesByRound.keys()].sort((a, b) => a - b);
    for (let i = 1; i < rounds.length; i++) {
      const prevRoundNodes = nodesByRound.get(rounds[i - 1])!;
      const currRoundNodes = nodesByRound.get(rounds[i])!;

      if (prevRoundNodes.length > 0 && currRoundNodes.length > 0) {
        const lastOfPrev = prevRoundNodes[prevRoundNodes.length - 1];
        const firstOfCurr = currRoundNodes[0];

        const exists = this.causalEdges.some(e => e.from === lastOfPrev.id && e.to === firstOfCurr.id);
        if (!exists) {
          this.causalEdges.push({
            from: lastOfPrev.id,
            to: firstOfCurr.id,
            type: 'triggers',
            label: `Round ${rounds[i - 1]} → Round ${rounds[i]}`,
          });
        }
      }
    }
  }

  /** Build the final decision trace */
  build(): DecisionTrace {
    this.autoLinkDecisions();

    // Find root (first node)
    const rootId = this.decisionNodes.length > 0 ? this.decisionNodes[0].id : null;

    // Find leaves (nodes with no outgoing edges)
    const sources = new Set(this.causalEdges.map(e => e.from));
    const leafIds = this.decisionNodes
      .filter(n => !sources.has(n.id))
      .map(n => n.id);

    return {
      id: this.traceId,
      query: this.query,
      intent: this.intent,
      promptResponses: this.promptResponses,
      memorySnapshots: this.memorySnapshots,
      causalDAG: {
        nodes: this.decisionNodes,
        edges: this.causalEdges,
        rootId,
        leafIds,
      },
      totalDurationMs: Date.now() - new Date(this.startedAt).getTime(),
      startedAt: this.startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  /** Get the trace ID */
  getId(): string {
    return this.traceId;
  }
}

// ─── DAG Utilities ──────────────────────────────────────────────────────────

/**
 * Validate that the causal DAG has no cycles (must be a DAG, not a general graph).
 * Uses DFS cycle detection.
 */
export function validateDAG(dag: CausalDAG): { valid: boolean; cyclePath: string[] | null } {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const parent = new Map<string, string>();

  function dfs(nodeId: string): string[] | null {
    visited.add(nodeId);
    inStack.add(nodeId);

    const outEdges = dag.edges.filter(e => e.from === nodeId);
    for (const edge of outEdges) {
      if (inStack.has(edge.to)) {
        // Found cycle — reconstruct path
        const path = [edge.to, nodeId];
        let current = nodeId;
        while (parent.has(current) && parent.get(current) !== edge.to) {
          current = parent.get(current)!;
          path.push(current);
        }
        return path.reverse();
      }
      if (!visited.has(edge.to)) {
        parent.set(edge.to, nodeId);
        const cycle = dfs(edge.to);
        if (cycle) return cycle;
      }
    }

    inStack.delete(nodeId);
    return null;
  }

  for (const node of dag.nodes) {
    if (!visited.has(node.id)) {
      const cycle = dfs(node.id);
      if (cycle) {
        return { valid: false, cyclePath: cycle };
      }
    }
  }

  return { valid: true, cyclePath: null };
}

/**
 * Get the decision path from root to a specific node.
 */
export function getDecisionPath(dag: CausalDAG, targetId: string): DecisionNode[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of dag.edges) {
    const existing = adjacency.get(edge.from) || [];
    existing.push(edge.to);
    adjacency.set(edge.from, existing);
  }

  // BFS from root to find path
  const root = dag.rootId;
  if (!root) return [];

  const queue: Array<{ nodeId: string; path: DecisionNode[] }> = [
    { nodeId: root, path: [dag.nodes.find(n => n.id === root)!] },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { nodeId, path } = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    if (nodeId === targetId) return path;

    const neighbors = adjacency.get(nodeId) || [];
    const nodeMap = new Map(dag.nodes.map(n => [n.id, n]));
    for (const neighbor of neighbors) {
      const neighborNode = nodeMap.get(neighbor);
      if (neighborNode && !visited.has(neighbor)) {
        queue.push({ nodeId: neighbor, path: [...path, neighborNode] });
      }
    }
  }

  return []; // No path found
}

/**
 * Format the causal DAG as a human-readable string.
 */
export function formatCausalDAG(dag: CausalDAG): string {
  const lines: string[] = [`Decision DAG (${dag.nodes.length} nodes, ${dag.edges.length} edges)`];

  for (const node of dag.nodes) {
    const inEdges = dag.edges.filter(e => e.to === node.id);
    const outEdges = dag.edges.filter(e => e.from === node.id);

    lines.push(`  [${node.id}] ${node.state} (R${node.round}): ${node.decision}`);
    if (inEdges.length > 0) {
      lines.push(`    ← ${inEdges.map(e => `${e.from}(${e.type})`).join(', ')}`);
    }
    if (outEdges.length > 0) {
      lines.push(`    → ${outEdges.map(e => `${e.to}(${e.label})`).join(', ')}`);
    }
  }

  return lines.join('\n');
}
