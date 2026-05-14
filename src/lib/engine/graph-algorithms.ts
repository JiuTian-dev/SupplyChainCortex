/**
 * Graph Algorithms — cascade propagation, centrality, path finding
 * for supply chain risk analysis.
 *
 * All algorithms operate on the SupplyChainGraph from graph-store.ts.
 * No external graph library required.
 */

import type { SupplyChainGraph, GraphNode, GraphEdge } from './graph-store';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface CascadeResult {
  sourceNodeId: string;
  sourceLabel: string;
  propagationPaths: PropagationPath[];
  totalAffectedNodes: number;
  maxDepth: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
}

export interface PropagationPath {
  path: string[];          // node IDs in propagation order
  depth: number;
  accumulatedRisk: number; // product of edge weights along path
  finalNode: string;
  finalNodeLabel: string;
}

export interface CentralityResult {
  nodeId: string;
  label: string;
  type: string;
  score: number;
  rank: number;
}

export interface PathResult {
  path: string[];
  pathLabels: string[];
  totalWeight: number;
  edges: GraphEdge[];
  summary: string;
}

// ─── Cascade Propagation ─────────────────────────────────────────────────────────

/**
 * Simulate cascade risk propagation from a source node.
 * Uses BFS with weighted attenuation along edges.
 *
 * @param graph - The supply chain graph
 * @param sourceNodeId - Starting node for propagation
 * @param initialRisk - Starting risk score (0-1)
 * @param maxDepth - Maximum propagation depth
 * @param attenuation - How much risk attenuates per hop (0-1, default 0.6)
 */
export function cascadePropagation(
  graph: SupplyChainGraph,
  sourceNodeId: string,
  initialRisk = 0.8,
  maxDepth = 4,
  attenuation = 0.6,
): CascadeResult {
  const sourceNode = graph.nodes.get(sourceNodeId);
  if (!sourceNode) {
    return {
      sourceNodeId,
      sourceLabel: 'Unknown',
      propagationPaths: [],
      totalAffectedNodes: 0,
      maxDepth: 0,
      severity: 'low',
      summary: '源节点未找到',
    };
  }

  const propagationPaths: PropagationPath[] = [];
  const visited = new Set<string>([sourceNodeId]);
  const queue: Array<{ nodeId: string; path: string[]; depth: number; risk: number }> = [
    { nodeId: sourceNodeId, path: [sourceNodeId], depth: 0, risk: initialRisk },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const neighbors = graph.adjacency.get(current.nodeId) || [];
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);

      const edges = graph.outgoingEdges.get(current.nodeId) || [];
      const edge = edges.find(e => e.to === neighbor);
      const edgeWeight = edge?.weight || 0.5;
      const propagatedRisk = current.risk * edgeWeight * attenuation;

      if (propagatedRisk > 0.05) { // cutoff: ignore negligible risk
        const newPath = [...current.path, neighbor];
        propagationPaths.push({
          path: newPath,
          depth: current.depth + 1,
          accumulatedRisk: Math.round(propagatedRisk * 1000) / 1000,
          finalNode: neighbor,
          finalNodeLabel: graph.nodes.get(neighbor)?.label || neighbor,
        });

        queue.push({
          nodeId: neighbor,
          path: newPath,
          depth: current.depth + 1,
          risk: propagatedRisk,
        });
      }
    }
  }

  // Sort by accumulated risk descending
  propagationPaths.sort((a, b) => b.accumulatedRisk - a.accumulatedRisk);

  const maxDepthReached = propagationPaths.reduce((max, p) => Math.max(max, p.depth), 0);
  const uniqueAffected = new Set(propagationPaths.map(p => p.finalNode));

  // Severity based on affected nodes and max depth
  let severity: CascadeResult['severity'] = 'low';
  if (uniqueAffected.size >= 8 && maxDepthReached >= 3) severity = 'critical';
  else if (uniqueAffected.size >= 5 && maxDepthReached >= 2) severity = 'high';
  else if (uniqueAffected.size >= 3) severity = 'medium';

  return {
    sourceNodeId,
    sourceLabel: sourceNode.label,
    propagationPaths: propagationPaths.slice(0, 30),
    totalAffectedNodes: uniqueAffected.size,
    maxDepth: maxDepthReached,
    severity,
    summary: `${sourceNode.label} 的风险将级联影响 ${uniqueAffected.size} 个节点，最大传播深度 ${maxDepthReached} 层。最严重路径: ${propagationPaths[0]?.path.map(id => graph.nodes.get(id)?.label || id).join(' → ') || '无'}`,
  };
}

// ─── Betweenness Centrality ──────────────────────────────────────────────────────

/**
 * Compute approximate betweenness centrality for all nodes.
 * Identifies bottleneck/critical nodes in the supply chain.
 * Uses a sampling-based approach for large graphs.
 */
export function betweennessCentrality(
  graph: SupplyChainGraph,
  sampleSize = 30,
): CentralityResult[] {
  const nodeIds = Array.from(graph.nodes.keys());
  const centrality = new Map<string, number>();

  // Initialize
  for (const id of nodeIds) {
    centrality.set(id, 0);
  }

  // Sample source nodes
  const sources = nodeIds.length <= sampleSize
    ? nodeIds
    : Array.from({ length: sampleSize }, () => nodeIds[Math.floor(Math.random() * nodeIds.length)]);

  for (const source of sources) {
    // BFS from source
    const predecessors = new Map<string, string[]>();
    const distances = new Map<string, number>();
    const pathCounts = new Map<string, number>();
    const stack: string[] = [];

    for (const id of nodeIds) {
      predecessors.set(id, []);
      distances.set(id, -1);
      pathCounts.set(id, 0);
    }

    distances.set(source, 0);
    pathCounts.set(source, 1);

    const queue = [source];
    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);
      const dv = distances.get(v)!;

      const neighbors = graph.adjacency.get(v) || [];
      for (const w of neighbors) {
        const dw = distances.get(w)!;
        if (dw < 0) {
          distances.set(w, dv + 1);
          queue.push(w);
        }
        if (dw === dv + 1) {
          pathCounts.set(w, (pathCounts.get(w) || 0) + (pathCounts.get(v) || 0));
          predecessors.get(w)?.push(v);
        }
      }
    }

    // Back-propagate dependencies
    const dependency = new Map<string, number>();
    for (const id of nodeIds) dependency.set(id, 0);

    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of predecessors.get(w) || []) {
        const delta = ((pathCounts.get(v) || 1) / (pathCounts.get(w) || 1)) * (1 + (dependency.get(w) || 0));
        dependency.set(v, (dependency.get(v) || 0) + delta);
      }
      if (w !== source) {
        centrality.set(w, (centrality.get(w) || 0) + (dependency.get(w) || 0));
      }
    }
  }

  // Normalize and rank
  const results: CentralityResult[] = [];
  for (const [nodeId, score] of centrality) {
    const node = graph.nodes.get(nodeId);
    if (!node) continue;
    results.push({
      nodeId,
      label: node.label,
      type: node.type,
      score: Math.round(score * 10000) / 10000,
      rank: 0,
    });
  }

  results.sort((a, b) => b.score - a.score);
  results.forEach((r, i) => { r.rank = i + 1; });

  return results.slice(0, 20);
}

// ─── Shortest Path ───────────────────────────────────────────────────────────────

/**
 * Find the shortest weighted path between two nodes.
 * Uses Dijkstra-like traversal with edge weights as "distances".
 */
export function findPath(
  graph: SupplyChainGraph,
  fromId: string,
  toId: string,
  maxDepth = 6,
): PathResult | null {
  if (!graph.nodes.has(fromId) || !graph.nodes.has(toId)) return null;

  // BFS with path tracking
  const visited = new Set<string>();
  const queue: Array<{ nodeId: string; path: string[]; edges: GraphEdge[]; weight: number }> = [
    { nodeId: fromId, path: [fromId], edges: [], weight: 0 },
  ];
  visited.add(fromId);

  while (queue.length > 0) {
    queue.sort((a, b) => a.weight - b.weight); // Simple priority
    const current = queue.shift()!;

    if (current.path.length > maxDepth) continue;

    if (current.nodeId === toId) {
      return {
        path: current.path,
        pathLabels: current.path.map(id => graph.nodes.get(id)?.label || id),
        totalWeight: Math.round(current.weight * 1000) / 1000,
        edges: current.edges,
        summary: `${graph.nodes.get(fromId)?.label || fromId} → ${graph.nodes.get(toId)?.label || toId}: ${current.path.length - 1} 步，路径权重 ${Math.round(current.weight * 1000) / 1000}`,
      };
    }

    const neighbors = graph.adjacency.get(current.nodeId) || [];
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);

      const outEdges = graph.outgoingEdges.get(current.nodeId) || [];
      const edge = outEdges.find(e => e.to === neighbor);
      const edgeWeight = edge?.weight || 0.5;

      queue.push({
        nodeId: neighbor,
        path: [...current.path, neighbor],
        edges: [...current.edges, ...(edge ? [edge] : [])],
        weight: current.weight + edgeWeight,
      });
    }
  }

  return null;
}

// ─── Impact Radius ───────────────────────────────────────────────────────────────

/**
 * Find all nodes within a certain risk radius of a source.
 * Returns nodes sorted by proximity × risk weight.
 */
export function impactRadius(
  graph: SupplyChainGraph,
  sourceNodeId: string,
  radius = 3,
): { node: GraphNode; distance: number; riskScore: number; incomingFrom: string }[] {
  const results: { node: GraphNode; distance: number; riskScore: number; incomingFrom: string }[] = [];
  const visited = new Set<string>([sourceNodeId]);
  const queue: Array<{ nodeId: string; distance: number; risk: number; incomingFrom: string }> = [
    { nodeId: sourceNodeId, distance: 0, risk: 1.0, incomingFrom: sourceNodeId },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.distance > radius) continue;

    if (current.nodeId !== sourceNodeId) {
      const node = graph.nodes.get(current.nodeId);
      if (node) {
        results.push({
          node,
          distance: current.distance,
          riskScore: Math.round(current.risk * 1000) / 1000,
          incomingFrom: current.incomingFrom,
        });
      }
    }

    const neighbors = graph.adjacency.get(current.nodeId) || [];
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);

      const edges = graph.outgoingEdges.get(current.nodeId) || [];
      const edge = edges.find(e => e.to === neighbor);
      const edgeWeight = edge?.weight || 0.5;

      queue.push({
        nodeId: neighbor,
        distance: current.distance + 1,
        risk: current.risk * edgeWeight,
        incomingFrom: current.nodeId,
      });
    }
  }

  return results.sort((a, b) => b.riskScore - a.riskScore);
}
