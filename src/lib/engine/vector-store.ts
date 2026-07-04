/**
 * Vector Store — pgvector-based semantic search for Graph RAG.
 *
 * Enables embedding-based retrieval of supply chain entities,
 * replacing regex-based entity extraction with semantic similarity search.
 *
 * Architecture:
 *   Query → Embedding → pgvector cosine search → top-k nodes → graph traversal
 *
 * Prerequisites:
 *   - pgvector extension enabled in PostgreSQL
 *   - Embedding model configured (OpenAI text-embedding-3-small or local)
 */

import { db } from '@/lib/db';

// ─── Configuration ─────────────────────────────────────────────────────────

const EMBEDDING_DIM = 1536; // OpenAI text-embedding-3-small dimension
const DEFAULT_TOP_K = 10;
const SIMILARITY_THRESHOLD = 0.5;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface VectorSearchResult {
  nodeId: string;
  nodeType: string;
  label: string;
  similarity: number;
  properties: Record<string, unknown>;
}

export interface EmbeddingInput {
  nodeId: string;
  nodeType: string;
  label: string;
  text: string; // The text to embed
  properties: Record<string, unknown>;
}

// ─── Embedding Generation ──────────────────────────────────────────────────

/**
 * Generate embeddings using OpenAI API.
 * Falls back to a simple hash-based pseudo-embedding for development.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text.slice(0, 2000),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.data[0].embedding;
      }
    } catch (err) {
      console.warn('[VectorStore] OpenAI embedding failed, using fallback:', (err as Error).message);
    }
  }

  // Fallback: deterministic pseudo-embedding from text hash
  return pseudoEmbedding(text);
}

/**
 * Deterministic pseudo-embedding for development/testing.
 * NOT suitable for production — use real embeddings instead.
 */
function pseudoEmbedding(text: string): number[] {
  const vec = new Float64Array(EMBEDDING_DIM);
  // Simple hash-based seeding
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }

  // Seed a simple PRNG from the hash
  let state = Math.abs(hash) || 1;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    vec[i] = (state / 0x7fffffff) * 2 - 1; // Range [-1, 1]
  }

  // Normalize to unit vector
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  return Array.from(vec, v => v / Math.max(norm, 1e-8));
}

// ─── Database Operations ───────────────────────────────────────────────────

/**
 * Ensure pgvector extension and table exist.
 * Called once at startup.
 */
export async function ensureVectorTable(): Promise<void> {
  await db.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS graph_embeddings (
      node_id   TEXT PRIMARY KEY,
      node_type TEXT NOT NULL,
      label     TEXT NOT NULL,
      text      TEXT NOT NULL,
      embedding vector(${EMBEDDING_DIM}),
      properties JSONB DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Create HNSW index for fast cosine similarity search
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_graph_embeddings_cosine
    ON graph_embeddings USING hnsw (embedding vector_cosine_ops);
  `).catch(() => {
    // Index may already exist or HNSW not available; skip
  });

  // Create type index
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_graph_embeddings_type
    ON graph_embeddings (node_type);
  `).catch(() => {});
}

/**
 * Upsert an embedding for a graph node.
 */
export async function upsertEmbedding(input: EmbeddingInput, embedding: number[]): Promise<void> {
  const vecStr = `[${embedding.join(',')}]`;
  await db.$executeRawUnsafe(`
    INSERT INTO graph_embeddings (node_id, node_type, label, text, embedding, properties, updated_at)
    VALUES ($1, $2, $3, $4, $5::vector, $6, NOW())
    ON CONFLICT (node_id) DO UPDATE SET
      node_type = EXCLUDED.node_type,
      label = EXCLUDED.label,
      text = EXCLUDED.text,
      embedding = EXCLUDED.embedding,
      properties = EXCLUDED.properties,
      updated_at = NOW();
  `, input.nodeId, input.nodeType, input.label, input.text, vecStr, JSON.stringify(input.properties));
}

/**
 * Batch upsert embeddings.
 */
export async function batchUpsertEmbeddings(items: Array<{ input: EmbeddingInput; embedding: number[] }>): Promise<void> {
  for (const item of items) {
    await upsertEmbedding(item.input, item.embedding);
  }
}

/**
 * Search for similar nodes using cosine similarity.
 */
export async function vectorSearch(
  queryEmbedding: number[],
  options?: {
    topK?: number;
    nodeType?: string;
    threshold?: number;
  },
): Promise<VectorSearchResult[]> {
  const topK = options?.topK ?? DEFAULT_TOP_K;
  const threshold = options?.threshold ?? SIMILARITY_THRESHOLD;
  const vecStr = `[${queryEmbedding.join(',')}]`;

  const typeFilter = options?.nodeType
    ? `AND node_type = '${options.nodeType}'`
    : '';

  const results = await db.$queryRawUnsafe<Array<{
    node_id: string;
    node_type: string;
    label: string;
    similarity: number;
    properties: unknown;
  }>>(`
    SELECT node_id, node_type, label,
           1 - (embedding <=> $1::vector) AS similarity,
           properties
    FROM graph_embeddings
    WHERE 1 - (embedding <=> $1::vector) > $2
    ${typeFilter}
    ORDER BY embedding <=> $1::vector
    LIMIT $3;
  `, vecStr, threshold, topK);

  return results.map(r => ({
    nodeId: r.node_id,
    nodeType: r.node_type,
    label: r.label,
    similarity: Math.round(r.similarity * 1000) / 1000,
    properties: (typeof r.properties === 'string' ? JSON.parse(r.properties) : r.properties) as Record<string, unknown>,
  }));
}

/**
 * Count embeddings in the store.
 */
export async function getEmbeddingCount(): Promise<number> {
  const result = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
    'SELECT COUNT(*)::bigint AS count FROM graph_embeddings;',
  );
  return Number(result[0]?.count ?? 0);
}

/**
 * Delete all embeddings (for re-indexing).
 */
export async function clearEmbeddings(): Promise<void> {
  await db.$executeRawUnsafe('TRUNCATE graph_embeddings;');
}
