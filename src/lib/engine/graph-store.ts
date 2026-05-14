/**
 * Supply Chain Graph Store — in-memory directed graph for cascade analysis.
 *
 * Builds a multi-tier supply chain graph from Prisma data, refreshed on demand.
 * Nodes: Product, Supplier, Warehouse, Port, Certification, Regulation
 * Edges: SUPPLIED_BY, STORED_AT, SHIPS_FROM, SHIPS_TO, REQUIRES_CERT,
 *        AFFECTED_BY, COSTS_AT, COMPETES_WITH (same category)
 *
 * Architecture:
 *   DB → buildGraph() → in-memory adjacency lists → graph algorithms
 */

import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────────

export type NodeType = 'product' | 'supplier' | 'warehouse' | 'port' | 'certification' | 'regulation';

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: string;
  weight: number;        // 0-1, higher = stronger connection
  properties: Record<string, unknown>;
}

export interface SupplyChainGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  /** Adjacency list: nodeId → [targetNodeIds] */
  adjacency: Map<string, string[]>;
  /** Reverse adjacency: nodeId → [sourceNodeIds] */
  reverseAdjacency: Map<string, string[]>;
  /** NodeId → outgoing edges */
  outgoingEdges: Map<string, GraphEdge[]>;
  /** Build timestamp */
  builtAt: string;
  /** Node count */
  nodeCount: number;
  /** Edge count */
  edgeCount: number;
}

export interface GraphQueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: string;
}

// ─── Graph State ─────────────────────────────────────────────────────────────────

let cachedGraph: SupplyChainGraph | null = null;

// ─── Graph Builder ───────────────────────────────────────────────────────────────

export async function buildGraph(): Promise<SupplyChainGraph> {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // ── Fetch all data ─────────────────────────────────────────────────────────
  const [products, inventories, suppliers, shipments, costs, certs, regulations] =
    await Promise.all([
      db.product.findMany({ select: { id: true, sku: true, name: true, category: true, subCategory: true, origin: true, unitCost: true, sellingPrice: true } }),
      db.inventory.findMany({ select: { productId: true, sku: true, warehouse: true, quantity: true, stockStatus: true } }),
      db.supplier.findMany({ select: { id: true, code: true, name: true, region: true, category: true, rating: true, leadTime: true, status: true } }),
      db.shipmentItem.findMany({ select: { id: true, productId: true, sku: true, origin: true, destination: true, carrier: true, status: true, riskLevel: true, delayDays: true } }),
      db.costRecord.findMany({ select: { productId: true, sku: true, totalLanded: true, grossMargin: true, tariff: true, logistics: true } }),
      db.complianceCert.findMany({ select: { id: true, certName: true, sku: true, status: true, expiryDate: true } }),
      db.regulationChange.findMany({ select: { id: true, title: true, category: true, impactLevel: true, status: true, affectedSkus: true } }),
    ]);

  // ── Product nodes ──────────────────────────────────────────────────────────
  for (const p of products) {
    nodes.set(p.id, {
      id: p.id,
      type: 'product',
      label: `${p.sku}: ${p.name}`,
      properties: { sku: p.sku, name: p.name, category: p.category, subCategory: p.subCategory, origin: p.origin, unitCost: p.unitCost, sellingPrice: p.sellingPrice },
    });
  }

  // ── Warehouse nodes ────────────────────────────────────────────────────────
  const warehouseSet = new Set<string>();
  for (const inv of inventories) {
    warehouseSet.add(inv.warehouse);
    // Edge: product → warehouse
    if (nodes.has(inv.productId)) {
      const riskWeight = inv.stockStatus === 'critical' ? 0.9 : inv.stockStatus === 'warning' ? 0.6 : 0.2;
      edges.push({
        from: inv.productId,
        to: `warehouse:${inv.warehouse}`,
        type: 'STORED_AT',
        weight: riskWeight,
        properties: { quantity: inv.quantity, stockStatus: inv.stockStatus },
      });
    }
  }
  for (const w of warehouseSet) {
    const id = `warehouse:${w}`;
    nodes.set(id, { id, type: 'warehouse', label: w, properties: { name: w } });
  }

  // ── Supplier nodes ─────────────────────────────────────────────────────────
  const productSupplierMap = new Map<string, string[]>(); // productId → supplierIds
  for (const s of suppliers) {
    nodes.set(s.id, {
      id: s.id,
      type: 'supplier',
      label: `${s.code}: ${s.name}`,
      properties: { code: s.code, name: s.name, region: s.region, category: s.category, rating: s.rating, leadTime: s.leadTime, status: s.status },
    });

    // Link suppliers to products by category matching
    for (const p of products) {
      if (p.category === s.category || p.subCategory === s.category) {
        const existing = productSupplierMap.get(p.id) || [];
        existing.push(s.id);
        productSupplierMap.set(p.id, existing);

        const riskWeight = s.rating < 3 ? 0.8 : s.rating < 4 ? 0.5 : 0.2;
        edges.push({
          from: p.id,
          to: s.id,
          type: 'SUPPLIED_BY',
          weight: riskWeight,
          properties: { rating: s.rating, leadTime: s.leadTime, region: s.region },
        });
      }
    }
  }

  // ── Port nodes (from shipments) ────────────────────────────────────────────
  const portSet = new Set<string>();
  for (const sh of shipments) {
    portSet.add(sh.origin);
    portSet.add(sh.destination);
    // Edge: product → origin port
    if (nodes.has(sh.productId)) {
      edges.push({
        from: sh.productId,
        to: `port:${sh.origin}`,
        type: 'SHIPS_FROM',
        weight: sh.riskLevel === 'critical' ? 0.9 : sh.riskLevel === 'high' ? 0.6 : 0.3,
        properties: { status: sh.status, riskLevel: sh.riskLevel, delayDays: sh.delayDays },
      });
      edges.push({
        from: `port:${sh.origin}`,
        to: `port:${sh.destination}`,
        type: 'SHIPS_TO',
        weight: sh.riskLevel === 'critical' ? 0.9 : sh.riskLevel === 'high' ? 0.6 : 0.3,
        properties: { carrier: sh.carrier, status: sh.status },
      });
    }
  }
  for (const port of portSet) {
    const id = `port:${port}`;
    if (!nodes.has(id)) {
      nodes.set(id, { id, type: 'port', label: port, properties: { name: port } });
    }
  }

  // ── Certification nodes ────────────────────────────────────────────────────
  for (const cert of certs) {
    const id = `cert:${cert.id}`;
    nodes.set(id, {
      id,
      type: 'certification',
      label: cert.certName,
      properties: { certName: cert.certName, status: cert.status, expiryDate: cert.expiryDate },
    });
    // Edge: product → certification
    if (cert.sku) {
      const product = products.find(p => p.sku === cert.sku);
      if (product) {
        const expiringSoon = cert.expiryDate && new Date(cert.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        edges.push({
          from: product.id,
          to: id,
          type: 'REQUIRES_CERT',
          weight: expiringSoon ? 0.7 : 0.2,
          properties: { status: cert.status, expiryDate: cert.expiryDate },
        });
      }
    }
  }

  // ── Regulation nodes ───────────────────────────────────────────────────────
  for (const reg of regulations) {
    const id = `regulation:${reg.id}`;
    nodes.set(id, {
      id,
      type: 'regulation',
      label: reg.title,
      properties: { category: reg.category, impactLevel: reg.impactLevel, status: reg.status },
    });
    // Edge: regulation → affected products
    if (reg.affectedSkus) {
      try {
        const skus = typeof reg.affectedSkus === 'string' ? JSON.parse(reg.affectedSkus) : reg.affectedSkus;
        if (Array.isArray(skus)) {
          for (const sku of skus) {
            const product = products.find(p => p.sku === sku);
            if (product) {
              edges.push({
                from: id,
                to: product.id,
                type: 'AFFECTED_BY',
                weight: reg.impactLevel === 'high' ? 0.9 : reg.impactLevel === 'medium' ? 0.5 : 0.2,
                properties: { impactLevel: reg.impactLevel },
              });
            }
          }
        }
      } catch { /* JSON parse may fail */ }
    }
  }

  // ── Cost edges ─────────────────────────────────────────────────────────────
  for (const c of costs) {
    const product = products.find(p => p.id === c.productId);
    if (product) {
      edges.push({
        from: c.productId,
        to: `product:${c.productId}`,
        type: 'COSTS_AT',
        weight: c.grossMargin < 0.15 ? 0.7 : 0.3,
        properties: { totalLanded: c.totalLanded, grossMargin: c.grossMargin, tariff: c.tariff, logistics: c.logistics },
      });
    }
  }

  // ── Same-category competition edges ────────────────────────────────────────
  const categoryProducts = new Map<string, string[]>();
  for (const p of products) {
    const existing = categoryProducts.get(p.category) || [];
    existing.push(p.id);
    categoryProducts.set(p.category, existing);
  }
  for (const [, productIds] of categoryProducts) {
    for (let i = 0; i < productIds.length; i++) {
      for (let j = i + 1; j < productIds.length; j++) {
        edges.push({
          from: productIds[i],
          to: productIds[j],
          type: 'COMPETES_WITH',
          weight: 0.3,
          properties: {},
        });
      }
    }
  }

  // ── Build adjacency ────────────────────────────────────────────────────────
  const adjacency = new Map<string, string[]>();
  const reverseAdjacency = new Map<string, string[]>();
  const outgoingEdges = new Map<string, GraphEdge[]>();

  for (const nodeId of nodes.keys()) {
    adjacency.set(nodeId, []);
    reverseAdjacency.set(nodeId, []);
    outgoingEdges.set(nodeId, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
    reverseAdjacency.get(edge.to)?.push(edge.from);
    outgoingEdges.get(edge.from)?.push(edge);
  }

  const graph: SupplyChainGraph = {
    nodes,
    edges,
    adjacency,
    reverseAdjacency,
    outgoingEdges,
    builtAt: new Date().toISOString(),
    nodeCount: nodes.size,
    edgeCount: edges.length,
  };

  cachedGraph = graph;
  return graph;
}

/** Get the cached graph, building if needed */
export async function getGraph(): Promise<SupplyChainGraph> {
  if (cachedGraph) return cachedGraph;
  return buildGraph();
}

/** Force rebuild */
export async function refreshGraph(): Promise<SupplyChainGraph> {
  cachedGraph = null;
  return buildGraph();
}

/** Search nodes by label or property */
export function searchNodes(graph: SupplyChainGraph, query: string): GraphNode[] {
  const q = query.toLowerCase();
  const results: GraphNode[] = [];
  for (const node of graph.nodes.values()) {
    if (node.label.toLowerCase().includes(q)) results.push(node);
    if (node.id.toLowerCase().includes(q)) results.push(node);
    const sku = node.properties?.sku as string | undefined;
    if (sku?.toLowerCase().includes(q)) results.push(node);
  }
  return results.slice(0, 20);
}

/** Get neighbors of a node (outgoing) */
export function getNeighbors(graph: SupplyChainGraph, nodeId: string, depth = 1): GraphQueryResult {
  const visited = new Set<string>();
  const resultNodes: GraphNode[] = [];
  const resultEdges: GraphEdge[] = [];
  let frontier = [nodeId];
  visited.add(nodeId);

  const startNode = graph.nodes.get(nodeId);
  if (startNode) resultNodes.push(startNode);

  for (let d = 0; d < depth; d++) {
    const nextFrontier: string[] = [];
    for (const current of frontier) {
      const neighbors = graph.adjacency.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          const node = graph.nodes.get(neighbor);
          if (node) resultNodes.push(node);
          nextFrontier.push(neighbor);

          // Get edges between current and neighbor
          const outEdges = graph.outgoingEdges.get(current) || [];
          for (const e of outEdges) {
            if (e.to === neighbor) resultEdges.push(e);
          }
        }
      }
    }
    frontier = nextFrontier;
  }

  return {
    nodes: resultNodes,
    edges: resultEdges,
    summary: `从 ${graph.nodes.get(nodeId)?.label || nodeId} 出发，${depth}层深度找到 ${resultNodes.length} 个关联节点，${resultEdges.length} 条关系`,
  };
}

/** Get upstream nodes (who affects this node) */
export function getUpstream(graph: SupplyChainGraph, nodeId: string, depth = 2): GraphQueryResult {
  const visited = new Set<string>();
  const resultNodes: GraphNode[] = [];
  const resultEdges: GraphEdge[] = [];
  let frontier = [nodeId];
  visited.add(nodeId);

  const startNode = graph.nodes.get(nodeId);
  if (startNode) resultNodes.push(startNode);

  for (let d = 0; d < depth; d++) {
    const nextFrontier: string[] = [];
    for (const current of frontier) {
      const sources = graph.reverseAdjacency.get(current) || [];
      for (const source of sources) {
        if (!visited.has(source)) {
          visited.add(source);
          const node = graph.nodes.get(source);
          if (node) resultNodes.push(node);
          nextFrontier.push(source);

          const outEdges = graph.outgoingEdges.get(source) || [];
          for (const e of outEdges) {
            if (e.to === current) resultEdges.push(e);
          }
        }
      }
    }
    frontier = nextFrontier;
  }

  return {
    nodes: resultNodes,
    edges: resultEdges,
    summary: `${graph.nodes.get(nodeId)?.label || nodeId} 的上游供应链 (${depth}层): ${resultNodes.length} 个节点`,
  };
}

// ─── Incremental Mutations ───────────────────────────────────────────────────────

/** Add or update a node in the cached graph */
export function upsertNode(node: GraphNode): void {
  if (!cachedGraph) return;
  cachedGraph.nodes.set(node.id, node);
  if (!cachedGraph.adjacency.has(node.id)) {
    cachedGraph.adjacency.set(node.id, []);
    cachedGraph.reverseAdjacency.set(node.id, []);
    cachedGraph.outgoingEdges.set(node.id, []);
  }
  cachedGraph.nodeCount = cachedGraph.nodes.size;
}

/** Add or update an edge with weight */
export function upsertEdge(edge: GraphEdge): void {
  if (!cachedGraph) return;
  // Replace existing edge between same from→to with same type
  const existing = cachedGraph.outgoingEdges.get(edge.from) || [];
  const idx = existing.findIndex(e => e.to === edge.to && e.type === edge.type);
  if (idx >= 0) {
    existing[idx] = edge;
  } else {
    existing.push(edge);
    cachedGraph.adjacency.get(edge.from)?.push(edge.to);
    cachedGraph.reverseAdjacency.get(edge.to)?.push(edge.from);
    cachedGraph.edges.push(edge);
  }
  cachedGraph.outgoingEdges.set(edge.from, existing);
  cachedGraph.edgeCount = cachedGraph.edges.length;
}

/**
 * Adjust an edge's weight based on feedback.
 * Positive delta = reinforce (user accepted), negative = weaken (user rejected).
 */
export function adjustEdgeWeight(
  fromId: string,
  toId: string,
  edgeType: string,
  delta: number,
): { oldWeight: number; newWeight: number } | null {
  if (!cachedGraph) return null;
  const edges = cachedGraph.outgoingEdges.get(fromId) || [];
  const edge = edges.find(e => e.to === toId && e.type === edgeType);
  if (!edge) return null;

  const oldWeight = edge.weight;
  edge.weight = Math.max(0.01, Math.min(1.0, oldWeight + delta));
  edge.properties = { ...edge.properties, lastAdjustedAt: new Date().toISOString(), adjustmentDelta: delta };

  // Also update the edge in the global edges array
  const globalEdge = cachedGraph.edges.find(
    e => e.from === fromId && e.to === toId && e.type === edgeType
  );
  if (globalEdge) globalEdge.weight = edge.weight;

  return { oldWeight, newWeight: edge.weight };
}

/**
 * Merge two similar nodes into one. Transfers all edges to the surviving node.
 */
export function mergeNodes(keepId: string, removeId: string): boolean {
  if (!cachedGraph) return false;
  const keepNode = cachedGraph.nodes.get(keepId);
  const removeNode = cachedGraph.nodes.get(removeId);
  if (!keepNode || !removeNode) return false;
  if (keepNode.type !== removeNode.type) return false;

  // Reroute incoming edges from remove → keep
  const incomingSources = cachedGraph.reverseAdjacency.get(removeId) || [];
  for (const source of [...incomingSources]) {
    const outEdges = cachedGraph.outgoingEdges.get(source) || [];
    for (const e of outEdges) {
      if (e.to === removeId) {
        e.to = keepId;
        cachedGraph.reverseAdjacency.get(keepId)?.push(source);
      }
    }
  }

  // Reroute outgoing edges from remove → keep
  const outEdges = cachedGraph.outgoingEdges.get(removeId) || [];
  for (const e of [...outEdges]) {
    e.from = keepId;
    cachedGraph.outgoingEdges.get(keepId)?.push(e);
    cachedGraph.adjacency.get(keepId)?.push(e.to);
    cachedGraph.reverseAdjacency.get(e.to)?.push(keepId);
  }

  // Remove the old node
  cachedGraph.nodes.delete(removeId);
  cachedGraph.adjacency.delete(removeId);
  cachedGraph.reverseAdjacency.delete(removeId);
  cachedGraph.outgoingEdges.delete(removeId);
  cachedGraph.nodeCount = cachedGraph.nodes.size;

  // Clean up reverse adjacency duplicates
  for (const [nodeId, sources] of cachedGraph.reverseAdjacency) {
    cachedGraph.reverseAdjacency.set(nodeId, [...new Set(sources)]);
  }

  keepNode.properties = { ...keepNode.properties, mergedFrom: removeNode.label, mergedAt: new Date().toISOString() };
  return true;
}

// ─── Dual Memory Tracking ────────────────────────────────────────────────────────

interface MemoryTrace {
  factId: string;
  status: 'success' | 'failure';
  graphNodeIds: string[];
  graphEdgeKeys: string[];
  timestamp: string;
}

const successTraces: MemoryTrace[] = [];
const failureTraces: MemoryTrace[] = [];
const MAX_TRACES = 200;

/** Record a successful fact (user accepted the claim) */
export function recordSuccessTrace(factId: string, nodeIds: string[], edgeKeys: string[]): void {
  successTraces.push({ factId, status: 'success', graphNodeIds: nodeIds, graphEdgeKeys: edgeKeys, timestamp: new Date().toISOString() });
  if (successTraces.length > MAX_TRACES) successTraces.splice(0, successTraces.length - MAX_TRACES);
}

/** Record a failed fact (user rejected the claim) */
export function recordFailureTrace(factId: string, nodeIds: string[], edgeKeys: string[]): void {
  failureTraces.push({ factId, status: 'failure', graphNodeIds: nodeIds, graphEdgeKeys: edgeKeys, timestamp: new Date().toISOString() });
  if (failureTraces.length > MAX_TRACES) failureTraces.splice(0, failureTraces.length - MAX_TRACES);
}

export function getMemoryTraces(): { success: MemoryTrace[]; failure: MemoryTrace[] } {
  return { success: [...successTraces], failure: [...failureTraces] };
}

/** Get graph summary for prompt injection */
export function summarizeGraph(graph: SupplyChainGraph): string {
  const nodeTypeCounts: Record<string, number> = {};
  for (const node of graph.nodes.values()) {
    nodeTypeCounts[node.type] = (nodeTypeCounts[node.type] || 0) + 1;
  }

  const edgeTypeCounts: Record<string, number> = {};
  for (const edge of graph.edges) {
    edgeTypeCounts[edge.type] = (edgeTypeCounts[edge.type] || 0) + 1;
  }

  const lines = [
    `供应链图谱: ${graph.nodeCount} 节点, ${graph.edgeCount} 关系`,
    `节点: ${Object.entries(nodeTypeCounts).map(([t, c]) => `${t}×${c}`).join(', ')}`,
    `关系: ${Object.entries(edgeTypeCounts).map(([t, c]) => `${t}×${c}`).join(', ')}`,
    `构建时间: ${graph.builtAt}`,
  ];
  return lines.join('\n');
}
