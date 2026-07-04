/**
 * Vector Index Builder — Syncs graph nodes to pgvector embeddings.
 *
 * Reads all nodes from graph-store, generates embeddings for their
 * searchable text, and upserts them into the vector store.
 *
 * Run: npx tsx scripts/build-vector-index.ts
 * Or call: await buildVectorIndex() at startup
 */

import { getGraph, type SupplyChainGraph, type GraphNode } from './graph-store';
import {
  ensureVectorTable,
  generateEmbedding,
  batchUpsertEmbeddings,
  getEmbeddingCount,
  type EmbeddingInput,
} from './vector-store';

// ─── Text Generation ───────────────────────────────────────────────────────

/**
 * Generate searchable text for a graph node.
 * This text is what gets embedded and used for semantic search.
 */
function nodeToSearchableText(node: GraphNode): string {
  const parts: string[] = [];

  // Type label
  const typeLabels: Record<string, string> = {
    product: '产品',
    supplier: '供应商',
    warehouse: '仓库',
    port: '港口',
    certification: '认证',
    regulation: '法规',
  };
  parts.push(`${typeLabels[node.type] || node.type}: ${node.label}`);

  // Key properties
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

// ─── Index Builder ─────────────────────────────────────────────────────────

/**
 * Build the vector index from the current graph.
 *
 * @param batchSize Number of nodes to process per batch (for rate limiting)
 * @param concurrency Number of concurrent embedding requests
 */
export async function buildVectorIndex(options?: {
  batchSize?: number;
  concurrency?: number;
  force?: boolean;
}): Promise<{ indexed: number; skipped: number; errors: number }> {
  const batchSize = options?.batchSize ?? 20;
  const concurrency = options?.concurrency ?? 3;
  const force = options?.force ?? false;

  // Ensure table exists
  await ensureVectorTable();

  // Check if re-indexing is needed
  const existingCount = await getEmbeddingCount();
  const graph = await getGraph();

  if (!force && existingCount >= graph.nodeCount) {
    console.log(`[VectorIndex] Already indexed (${existingCount} embeddings, ${graph.nodeCount} nodes). Use force=true to re-index.`);
    return { indexed: 0, skipped: graph.nodeCount, errors: 0 };
  }

  console.log(`[VectorIndex] Building index: ${graph.nodeCount} nodes, existing=${existingCount}, force=${force}`);

  // Clear if force rebuild
  if (force && existingCount > 0) {
    const { clearEmbeddings } = await import('./vector-store');
    await clearEmbeddings();
    console.log('[VectorIndex] Cleared existing embeddings');
  }

  let indexed = 0;
  let errors = 0;
  const nodes = Array.from(graph.nodes.values());

  // Process in batches with concurrency control
  for (let i = 0; i < nodes.length; i += batchSize) {
    const batch = nodes.slice(i, i + batchSize);

    // Process batch with limited concurrency
    const chunks: GraphNode[][] = [];
    for (let j = 0; j < batch.length; j += Math.ceil(batch.length / concurrency)) {
      chunks.push(batch.slice(j, j + Math.ceil(batch.length / concurrency)));
    }

    const batchResults = await Promise.allSettled(
      chunks.map(chunk => processChunk(chunk)),
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        indexed += result.value;
      } else {
        errors += chunks[batchResults.indexOf(result)]?.length ?? 1;
        console.error('[VectorIndex] Chunk error:', result.reason);
      }
    }

    console.log(`[VectorIndex] Progress: ${Math.min(i + batchSize, nodes.length)}/${nodes.length} nodes processed`);
  }

  console.log(`[VectorIndex] Complete: indexed=${indexed}, errors=${errors}`);
  return { indexed, skipped: 0, errors };
}

async function processChunk(nodes: GraphNode[]): Promise<number> {
  const items: Array<{ input: EmbeddingInput; embedding: number[] }> = [];

  for (const node of nodes) {
    const text = nodeToSearchableText(node);
    const embedding = await generateEmbedding(text);

    items.push({
      input: {
        nodeId: node.id,
        nodeType: node.type,
        label: node.label,
        text,
        properties: node.properties,
      },
      embedding,
    });
  }

  await batchUpsertEmbeddings(items);
  return items.length;
}
