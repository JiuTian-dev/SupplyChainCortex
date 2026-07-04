/**
 * Graph-RAG — Graph-enhanced Retrieval for supply chain reasoning.
 *
 * Enriches RAG queries with graph traversal results. Before sending a query
 * to the ReAct agent, we check if it mentions entities in the graph and
 * inject relevant subgraph context.
 *
 * Architecture (v3 — with Hybrid RAG):
 *   User query → Hybrid RAG (vector + graph + BM25) → RRF fusion →
 *   graph traversal → format as context → inject into system prompt
 */

import { getGraph, searchNodes, getNeighbors, getUpstream, summarizeGraph, type SupplyChainGraph } from './graph-store';
import { cascadePropagation, findPath, impactRadius, betweennessCentrality } from './graph-algorithms';
import { hybridRetrieve, formatHybridResults, type HybridSearchResult } from './hybrid-rag';
import { startRetrievalSpan, endSpan, endSpanWithError } from '@/lib/audit/otel-tracing';

// ─── Entity Extraction ───────────────────────────────────────────────────────────

const ENTITY_PATTERNS: Array<{ regex: RegExp; type: string }> = [
  { regex: /SKU[-:]\s*\w+/gi, type: 'product' },
  { regex: /供应商[:：\s]*(\S+)/g, type: 'supplier' },
  { regex: /仓库[:：\s]*(\S+)/g, type: 'warehouse' },
  { regex: /港口[:：\s]*(\S+)/g, type: 'port' },
  { regex: /(?:洛杉矶|长滩|纽约|上海|宁波|深圳|汉堡|鹿特丹)/g, type: 'port' },
  { regex: /认证[:：\s]*(\S+)/g, type: 'certification' },
];

function extractEntities(query: string): Array<{ name: string; type: string }> {
  const entities: Array<{ name: string; type: string }> = [];
  const seen = new Set<string>();

  for (const pattern of ENTITY_PATTERNS) {
    const matches = query.match(pattern.regex);
    if (matches) {
      for (const m of matches) {
        const cleaned = m.replace(/^(SKU|供应商|仓库|港口|认证)[-:：\s]*/i, '').trim();
        if (cleaned && !seen.has(cleaned)) {
          seen.add(cleaned);
          entities.push({ name: cleaned, type: pattern.type });
        }
      }
    }
  }

  return entities;
}

// ─── Graph Context Builder ───────────────────────────────────────────────────────

export interface GraphContext {
  summary: string;
  relevantSubgraph: string;
  cascadeRisk?: string;
  criticalNodes?: string;
  impactPaths?: string;
  hybridResults?: string;
}

/**
 * Build graph-enhanced context for a user query.
 * Uses Hybrid RAG (vector + graph + BM25) for entity discovery,
 * then enriches with graph traversal and cascade analysis.
 */
export async function buildGraphContext(query: string): Promise<GraphContext> {
  const graph = await getGraph();

  // OTel: trace the retrieval
  const span = startRetrievalSpan({ query, source: 'graph-rag-hybrid' });

  try {
    // ── Step 1: Discover entities via vector search + regex ──────────────
    const matchedNodeIds = await discoverEntities(query, graph);

    // If no entities found, return basic graph summary
    if (matchedNodeIds.length === 0) {
      const topCentrality = betweennessCentrality(graph, 10).slice(0, 5);
      const result = {
        summary: summarizeGraph(graph),
        relevantSubgraph: '',
        criticalNodes: `关键节点 (中心度Top5): ${topCentrality.map(c => `${c.label}(${c.type}, ${c.score.toFixed(2)})`).join(', ')}`,
      };
      endSpan(span);
      return result;
    }

    // ── Step 2: Graph traversal from matched nodes ──────────────────────
    const subgraphNodes = new Set<string>();
    const subgraphDescriptions: string[] = [];

    for (const nodeId of matchedNodeIds.slice(0, 5)) {
      const neighbors = getNeighbors(graph, nodeId, 2);
      neighbors.nodes.forEach(n => subgraphNodes.add(n.id));
      subgraphDescriptions.push(neighbors.summary);
    }

    // Cascade analysis from first matched node
    let cascadeAnalysis = '';
    if (matchedNodeIds.length > 0) {
      const cascade = cascadePropagation(graph, matchedNodeIds[0], 0.7, 3);
      if (cascade.propagationPaths.length > 0) {
        cascadeAnalysis = cascade.summary;
      }
    }

    // Top centrality nodes
    const centrality = betweennessCentrality(graph, 15);
    const criticalNodes = centrality.slice(0, 5)
      .map(c => `${c.label}(${c.type})`)
      .join(', ');

    // Impact paths for entities
    const impactDescriptions: string[] = [];
    for (const nodeId of matchedNodeIds.slice(0, 3)) {
      const impacts = impactRadius(graph, nodeId, 2);
      if (impacts.length > 0) {
        const topImpacts = impacts.slice(0, 5)
          .map(i => `${i.node.label}(${i.node.type}, 风险${i.riskScore.toFixed(2)})`);
        impactDescriptions.push(`${graph.nodes.get(nodeId)?.label || nodeId} 影响: ${topImpacts.join(', ')}`);
      }
    }

    endSpan(span);
    return {
      summary: summarizeGraph(graph),
      relevantSubgraph: subgraphDescriptions.join('\n'),
      cascadeRisk: cascadeAnalysis || undefined,
      criticalNodes: `关键节点: ${criticalNodes}`,
      impactPaths: impactDescriptions.length > 0 ? impactDescriptions.join('\n') : undefined,
      hybridResults: formatHybridResultsForContext(matchedNodeIds, graph),
    };
  } catch (err) {
    endSpanWithError(span, err);
    throw err;
  }
}

// ─── Entity Discovery (Hybrid RAG) ─────────────────────────────────────────

/**
 * Format hybrid retrieval results for context injection.
 * Shows which entities were found and via which retrieval paths.
 */
function formatHybridResultsForContext(nodeIds: string[], graph: SupplyChainGraph): string {
  const entries = nodeIds.slice(0, 5).map(id => {
    const node = graph.nodes.get(id);
    return node ? `${node.label} (${node.type})` : id;
  });
  return entries.length > 0 ? `检索命中: ${entries.join(', ')}` : '';
}

/**
 * Discover graph entities from a query using Hybrid RAG
 * (vector + graph + BM25 three-way retrieval with RRF fusion).
 * Falls back to regex extraction if hybrid retrieval fails.
 */
async function discoverEntities(
  query: string,
  graph: SupplyChainGraph,
): Promise<string[]> {
  const nodeIds = new Set<string>();

  // ── Hybrid RAG retrieval (primary path) ────────────────────────────────
  try {
    const hybridResults = await hybridRetrieve(query, {
      topK: 5,
      enableVector: true,
      enableGraph: true,
      enableBM25: true,
    });

    for (const result of hybridResults) {
      if (graph.nodes.has(result.nodeId)) {
        nodeIds.add(result.nodeId);
      }
    }
  } catch (err) {
    console.warn('[GraphRAG] Hybrid retrieval failed, using regex fallback:', (err as Error).message);
  }

  // ── Regex entity extraction (complement for pattern-based entities) ────
  const regexEntities = extractEntities(query);
  for (const entity of regexEntities) {
    const found = searchNodes(graph, entity.name);
    for (const node of found) {
      nodeIds.add(node.id);
    }
  }

  return Array.from(nodeIds);
}

/**
 * Format graph context for injection into the system prompt.
 * Kept concise to minimize token usage.
 */
export function formatGraphContext(ctx: GraphContext): string {
  const lines: string[] = ['\n## 供应链图谱分析'];

  if (ctx.summary) {
    lines.push(`📊 ${ctx.summary}`);
  }

  if (ctx.criticalNodes) {
    lines.push(`🎯 ${ctx.criticalNodes}`);
  }

  if (ctx.relevantSubgraph) {
    lines.push(`🔗 相关子图:\n${ctx.relevantSubgraph}`);
  }

  if (ctx.cascadeRisk) {
    lines.push(`⚠️ 级联风险: ${ctx.cascadeRisk}`);
  }

  if (ctx.impactPaths) {
    lines.push(`📈 影响路径:\n${ctx.impactPaths}`);
  }

  if (ctx.hybridResults) {
    lines.push(`🔍 ${ctx.hybridResults}`);
  }

  return lines.join('\n');
}
