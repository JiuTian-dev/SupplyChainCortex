/**
 * Hybrid RAG — Three-way retrieval with Reciprocal Rank Fusion.
 *
 * Combines three retrieval paths for supply chain entity discovery:
 *   1. Vector semantic search (pgvector cosine similarity)
 *   2. Graph traversal (entity lookup + neighbor expansion)
 *   3. BM25 keyword search (term frequency + document length normalization)
 *
 * Results are merged using RRF (Reciprocal Rank Fusion):
 *   score(d) = Σ_{r∈R} 1 / (k + rank_r(d))
 * where k=60 is a constant that reduces the impact of high ranks.
 *
 * Architecture:
 *   Query → [Vector] → ranked list ─┐
 *   Query → [Graph]  → ranked list ─┤→ RRF Fusion → merged ranked list
 *   Query → [BM25]   → ranked list ─┘
 */

import { getGraph, searchNodes, getNeighbors, type SupplyChainGraph, type GraphNode } from './graph-store';
import { generateEmbedding, vectorSearch, ensureVectorTable, type VectorSearchResult } from './vector-store';
import { startRetrievalSpan, endSpan, endSpanWithError } from '@/lib/audit/otel-tracing';

// ─── Configuration ──────────────────────────────────────────────────────────

const RRF_K = 60; // Standard RRF constant (Cormack et al., 2009)
const DEFAULT_TOP_K = 10;
const VECTOR_TOP_K = 15;
const GRAPH_TOP_K = 15;
const BM25_TOP_K = 15;

// BM25 parameters
const BM25_K1 = 1.5;  // Term frequency saturation
const BM25_B = 0.75;  // Document length normalization

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HybridSearchResult {
  nodeId: string;
  nodeType: string;
  label: string;
  /** RRF fusion score */
  rrfScore: number;
  /** Which retrieval paths found this node */
  sources: Array<'vector' | 'graph' | 'bm25'>;
  /** Per-path rank (undefined if not found by that path) */
  ranks: {
    vector?: number;
    graph?: number;
    bm25?: number;
  };
  /** Per-path raw score */
  scores: {
    vector?: number;
    graph?: number;
    bm25?: number;
  };
  properties: Record<string, unknown>;
}

export interface HybridSearchOptions {
  topK?: number;
  /** Enable/disable individual retrieval paths */
  enableVector?: boolean;
  enableGraph?: boolean;
  enableBM25?: boolean;
  /** Filter by node type */
  nodeType?: string;
  /** Vector search similarity threshold */
  vectorThreshold?: number;
}

// ─── BM25 Keyword Search ────────────────────────────────────────────────────

/**
 * Tokenize text for BM25: lowercase, split on non-alphanumeric/CJK,
 * then generate bigrams for CJK runs (Chinese text needs sub-word matching).
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];

  // First, extract runs of alphanumeric and runs of CJK separately
  const parts = text.toLowerCase().split(/([^a-z0-9\u4e00-\u9fff-]+)/);

  for (const part of parts) {
    // Alphanumeric tokens (split on whitespace within)
    if (/^[a-z0-9-]+$/.test(part)) {
      const subTokens = part.split(/\s+/).filter(t => t.length > 1);
      tokens.push(...subTokens);
      continue;
    }

    // CJK run: generate unigrams and bigrams for sub-word matching
    const cjkChars = part.replace(/[^\u4e00-\u9fff]/g, '');
    if (cjkChars.length > 0) {
      // Unigrams (for single-char matching)
      for (const ch of cjkChars) {
        tokens.push(ch);
      }
      // Bigrams (for 2-char phrase matching, most common in Chinese)
      for (let i = 0; i < cjkChars.length - 1; i++) {
        tokens.push(cjkChars[i] + cjkChars[i + 1]);
      }
      // Trigrams (for 3-char phrase matching)
      for (let i = 0; i < cjkChars.length - 2; i++) {
        tokens.push(cjkChars[i] + cjkChars[i + 1] + cjkChars[i + 2]);
      }
    }
  }

  return tokens;
}

interface BM25Doc {
  nodeId: string;
  nodeType: string;
  label: string;
  tokens: string[];
  /** Document length in tokens */
  dl: number;
  properties: Record<string, unknown>;
}

/**
 * Build BM25 document index from graph nodes.
 */
function buildBM25Index(graph: SupplyChainGraph): {
  docs: BM25Doc[];
  avgDl: number;
  df: Record<string, number>;
  N: number;
} {
  const docs: BM25Doc[] = [];
  let totalLen = 0;

  for (const node of graph.nodes.values()) {
    const text = nodeToSearchableText(node);
    const tokens = tokenize(text);
    docs.push({
      nodeId: node.id,
      nodeType: node.type,
      label: node.label,
      tokens,
      dl: tokens.length,
      properties: node.properties,
    });
    totalLen += tokens.length;
  }

  const N = docs.length;
  const avgDl = N > 0 ? totalLen / N : 1;

  // Document frequency: how many docs contain each term
  const df: Record<string, number> = {};
  for (const doc of docs) {
    const uniqueTerms = new Set(doc.tokens);
    for (const term of uniqueTerms) {
      df[term] = (df[term] || 0) + 1;
    }
  }

  return { docs, avgDl, df, N };
}

/**
 * Compute BM25 score for a query against a document.
 */
function bm25Score(
  queryTokens: string[],
  doc: BM25Doc,
  avgDl: number,
  df: Record<string, number>,
  N: number,
): number {
  let score = 0;

  for (const term of queryTokens) {
    const termFreq = doc.tokens.filter(t => t === term).length;
    if (termFreq === 0) continue;

    // IDF component
    const docFreq = df[term] || 0;
    const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);

    // TF component with saturation
    const tfNorm = (termFreq * (BM25_K1 + 1)) /
      (termFreq + BM25_K1 * (1 - BM25_B + BM25_B * (doc.dl / avgDl)));

    score += idf * tfNorm;
  }

  return score;
}

/**
 * BM25 keyword search over graph nodes.
 */
export async function bm25Search(
  query: string,
  options?: { topK?: number; nodeType?: string },
): Promise<Array<{ nodeId: string; nodeType: string; label: string; score: number; properties: Record<string, unknown> }>> {
  const graph = await getGraph();
  const topK = options?.topK ?? BM25_TOP_K;
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) return [];

  const { docs, avgDl, df, N } = buildBM25Index(graph);

  // Score each document
  const scored = docs
    .filter(doc => !options?.nodeType || doc.nodeType === options.nodeType)
    .map(doc => ({
      nodeId: doc.nodeId,
      nodeType: doc.nodeType,
      label: doc.label,
      score: bm25Score(queryTokens, doc, avgDl, df, N),
      properties: doc.properties,
    }))
    .filter(d => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

// ─── Searchable Text Generation ─────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  product: '产品',
  supplier: '供应商',
  warehouse: '仓库',
  port: '港口',
  certification: '认证',
  regulation: '法规',
};

/**
 * Generate searchable text for a graph node.
 * Shared between vector-index-builder and BM25 search.
 */
function nodeToSearchableText(node: GraphNode): string {
  const parts: string[] = [];
  parts.push(`${TYPE_LABELS[node.type] || node.type}: ${node.label}`);

  const props = node.properties;
  if (props.sku) parts.push(`SKU: ${props.sku}`);
  if (props.name) parts.push(`名称: ${props.name}`);
  if (props.category) parts.push(`类别: ${props.category}`);
  if (props.subCategory) parts.push(`子类: ${props.subCategory}`);
  if (props.origin) parts.push(`产地: ${props.origin}`);
  if (props.region) parts.push(`地区: ${props.region}`);
  if (props.rating) parts.push(`评级: ${props.rating}`);
  if (props.status) parts.push(`状态: ${props.status}`);
  if (props.stockStatus) parts.push(`库存状态: ${props.stockStatus}`);
  if (props.impactLevel) parts.push(`影响级别: ${props.impactLevel}`);
  if (props.certName) parts.push(`认证名: ${props.certName}`);

  return parts.join(' | ');
}

// ─── Three-Way Retrieval ────────────────────────────────────────────────────

interface RetrievalPathResult {
  nodeId: string;
  nodeType: string;
  label: string;
  score: number;
  properties: Record<string, unknown>;
}

async function vectorRetrieval(
  query: string,
  options?: { topK?: number; nodeType?: string; threshold?: number },
): Promise<RetrievalPathResult[]> {
  try {
    await ensureVectorTable();
    const queryEmbedding = await generateEmbedding(query);
    const results = await vectorSearch(queryEmbedding, {
      topK: options?.topK ?? VECTOR_TOP_K,
      nodeType: options?.nodeType,
      threshold: options?.threshold ?? 0.3,
    });
    return results.map(r => ({
      nodeId: r.nodeId,
      nodeType: r.nodeType,
      label: r.label,
      score: r.similarity,
      properties: r.properties,
    }));
  } catch (err) {
    console.warn('[HybridRAG] Vector retrieval failed:', (err as Error).message);
    return [];
  }
}

async function graphRetrieval(
  query: string,
  graph: SupplyChainGraph,
  options?: { topK?: number; nodeType?: string },
): Promise<RetrievalPathResult[]> {
  const topK = options?.topK ?? GRAPH_TOP_K;

  // Search by label/id/sku match
  const matched = searchNodes(graph, query);

  // Also search by tokenized terms
  const queryTokens = tokenize(query);
  const tokenMatched: GraphNode[] = [];
  for (const token of queryTokens) {
    const found = searchNodes(graph, token);
    tokenMatched.push(...found);
  }

  // Deduplicate and score by match quality
  const seen = new Set<string>();
  const scored: RetrievalPathResult[] = [];

  for (const node of [...matched, ...tokenMatched]) {
    if (seen.has(node.id)) continue;
    if (options?.nodeType && node.type !== options.nodeType) continue;
    seen.add(node.id);

    // Score: exact label match = 1.0, partial = 0.7, token match = 0.5
    const labelLower = node.label.toLowerCase();
    const queryLower = query.toLowerCase();
    let score = 0.5;

    if (labelLower === queryLower) {
      score = 1.0;
    } else if (labelLower.includes(queryLower)) {
      score = 0.85;
    } else {
      // Check how many query tokens match
      const nodeTokens = new Set(tokenize(node.label + ' ' + Object.values(node.properties).join(' ')));
      const matchCount = queryTokens.filter(t => nodeTokens.has(t)).length;
      score = Math.min(0.8, matchCount / Math.max(queryTokens.length, 1));
    }

    if (score > 0) {
      scored.push({
        nodeId: node.id,
        nodeType: node.type,
        label: node.label,
        score,
        properties: node.properties,
      });
    }
  }

  // Expand with neighbors for top matches (graph traversal bonus)
  const expanded = new Set<string>(scored.map(s => s.nodeId));
  for (const result of scored.slice(0, 3)) {
    const neighbors = getNeighbors(graph, result.nodeId, 1);
    for (const neighbor of neighbors.nodes) {
      if (!expanded.has(neighbor.id) && (!options?.nodeType || neighbor.type === options.nodeType)) {
        expanded.add(neighbor.id);
        scored.push({
          nodeId: neighbor.id,
          nodeType: neighbor.type,
          label: neighbor.label,
          score: 0.3, // Neighbor bonus score (lower than direct match)
          properties: neighbor.properties,
        });
      }
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ─── RRF Fusion ─────────────────────────────────────────────────────────────

/**
 * Reciprocal Rank Fusion: merge multiple ranked lists into one.
 *
 * Formula: score(d) = Σ 1/(k + rank_i(d))
 * where k=60 dampens the effect of top ranks.
 */
function rrfFusion(
  rankedLists: Array<{ path: 'vector' | 'graph' | 'bm25'; results: RetrievalPathResult[] }>,
): Map<string, { rrfScore: number; sources: Array<'vector' | 'graph' | 'bm25'>; ranks: Record<string, number | undefined>; scores: Record<string, number | undefined> }> {
  const fusionMap = new Map<string, {
    rrfScore: number;
    sources: Array<'vector' | 'graph' | 'bm25'>;
    ranks: Record<string, number | undefined>;
    scores: Record<string, number | undefined>;
  }>();

  for (const { path, results } of rankedLists) {
    for (let rank = 0; rank < results.length; rank++) {
      const result = results[rank];
      const existing = fusionMap.get(result.nodeId);

      const rrfContribution = 1 / (RRF_K + rank + 1); // rank is 0-based, so +1

      if (existing) {
        existing.rrfScore += rrfContribution;
        existing.sources.push(path);
        existing.ranks[path] = rank + 1;
        existing.scores[path] = result.score;
      } else {
        fusionMap.set(result.nodeId, {
          rrfScore: rrfContribution,
          sources: [path],
          ranks: { [path]: rank + 1 },
          scores: { [path]: result.score },
        });
      }
    }
  }

  return fusionMap;
}

// ─── Main Hybrid Search ────────────────────────────────────────────────────

/**
 * Hybrid retrieval: three-way search + RRF fusion.
 *
 * This is the primary entry point for supply chain entity discovery.
 * It combines vector semantic search, graph traversal, and BM25 keyword
 * search, then merges results using Reciprocal Rank Fusion.
 */
export async function hybridRetrieve(
  query: string,
  options?: HybridSearchOptions,
): Promise<HybridSearchResult[]> {
  const topK = options?.topK ?? DEFAULT_TOP_K;
  const enableVector = options?.enableVector ?? true;
  const enableGraph = options?.enableGraph ?? true;
  const enableBM25 = options?.enableBM25 ?? true;

  const span = startRetrievalSpan({ query, source: 'hybrid-rag' });

  try {
    const graph = await getGraph();
    const rankedLists: Array<{ path: 'vector' | 'graph' | 'bm25'; results: RetrievalPathResult[] }> = [];

    // ── Path 1: Vector semantic search ──────────────────────────────────
    if (enableVector) {
      const vectorResults = await vectorRetrieval(query, {
        topK: VECTOR_TOP_K,
        nodeType: options?.nodeType,
        threshold: options?.vectorThreshold,
      });
      if (vectorResults.length > 0) {
        rankedLists.push({ path: 'vector', results: vectorResults });
      }
    }

    // ── Path 2: Graph traversal ─────────────────────────────────────────
    if (enableGraph) {
      const graphResults = await graphRetrieval(query, graph, {
        topK: GRAPH_TOP_K,
        nodeType: options?.nodeType,
      });
      if (graphResults.length > 0) {
        rankedLists.push({ path: 'graph', results: graphResults });
      }
    }

    // ── Path 3: BM25 keyword search ─────────────────────────────────────
    if (enableBM25) {
      const bm25Results = await bm25Search(query, {
        topK: BM25_TOP_K,
        nodeType: options?.nodeType,
      });
      if (bm25Results.length > 0) {
        rankedLists.push({ path: 'bm25', results: bm25Results });
      }
    }

    // ── RRF Fusion ──────────────────────────────────────────────────────
    const fusionMap = rrfFusion(rankedLists);

    // Build final results with node metadata from graph
    const results: HybridSearchResult[] = [];
    for (const [nodeId, fusion] of fusionMap) {
      const node = graph.nodes.get(nodeId);
      if (!node) continue; // Skip nodes not in current graph

      results.push({
        nodeId,
        nodeType: node.type,
        label: node.label,
        rrfScore: Math.round(fusion.rrfScore * 10000) / 10000, // 4 decimal precision
        sources: fusion.sources,
        ranks: fusion.ranks as HybridSearchResult['ranks'],
        scores: fusion.scores as HybridSearchResult['scores'],
        properties: node.properties,
      });
    }

    // Sort by RRF score descending
    results.sort((a, b) => b.rrfScore - a.rrfScore);

    endSpan(span);
    return results.slice(0, topK);
  } catch (err) {
    endSpanWithError(span, err);
    throw err;
  }
}

/**
 * Format hybrid search results for prompt injection.
 */
export function formatHybridResults(results: HybridSearchResult[]): string {
  if (results.length === 0) return '';

  const lines: string[] = ['\n## 语义检索结果 (Hybrid RAG)'];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const sourceTags = r.sources.map(s => {
      const labels: Record<string, string> = { vector: '语义', graph: '图谱', bm25: '关键词' };
      return labels[s];
    }).join('+');

    const rankInfo = Object.entries(r.ranks)
      .filter(([, v]) => v !== undefined)
      .map(([path, rank]) => `${path}#${rank}`)
      .join(', ');

    lines.push(`${i + 1}. [${sourceTags}] ${r.label} (${r.nodeType}, RRF=${r.rrfScore}, ${rankInfo})`);
  }

  return lines.join('\n');
}
