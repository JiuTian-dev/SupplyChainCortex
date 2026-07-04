/**
 * Vector Store — Tests
 *
 * Tests embedding generation, database operations, and vector search
 * with mocked Prisma database layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module before importing vector-store
const mockExecuteRawUnsafe = vi.fn();
const mockQueryRawUnsafe = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    $executeRawUnsafe: (...args: unknown[]) => mockExecuteRawUnsafe(...args),
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
  },
}));

import {
  generateEmbedding,
  ensureVectorTable,
  upsertEmbedding,
  batchUpsertEmbeddings,
  vectorSearch,
  getEmbeddingCount,
  clearEmbeddings,
} from './vector-store';
import type { EmbeddingInput } from './vector-store';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEmbeddingInput(overrides?: Partial<EmbeddingInput>): EmbeddingInput {
  return {
    nodeId: 'test-node-1',
    nodeType: 'product',
    label: 'SKU-001: Test Product',
    text: '产品: SKU-001: Test Product | SKU: SKU-001 | 类别: 电子产品',
    properties: { sku: 'SKU-001', category: '电子产品' },
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('VectorStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── generateEmbedding ───────────────────────────────────────────────────

  describe('generateEmbedding', () => {
    it('should return a 1536-dimensional unit vector', async () => {
      // Without OPENAI_API_KEY, it falls back to pseudoEmbedding
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const embedding = await generateEmbedding('test text');
      expect(embedding).toHaveLength(1536);

      // Should be a unit vector (norm ≈ 1)
      const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 5);

      // All values should be in [-1, 1]
      for (const v of embedding) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }

      process.env.OPENAI_API_KEY = originalKey;
    });

    it('should produce deterministic embeddings for same input', async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const emb1 = await generateEmbedding('deterministic test');
      const emb2 = await generateEmbedding('deterministic test');
      expect(emb1).toEqual(emb2);

      process.env.OPENAI_API_KEY = originalKey;
    });

    it('should produce different embeddings for different inputs', async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const emb1 = await generateEmbedding('text about electronics');
      const emb2 = await generateEmbedding('text about furniture');
      // At least some dimensions should differ
      const sameDimensions = emb1.filter((v, i) => v === emb2[i]).length;
      expect(sameDimensions).toBeLessThan(1536);

      process.env.OPENAI_API_KEY = originalKey;
    });

    it('should fall back to pseudo-embedding when OpenAI API returns non-OK', async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'test-key';

      // Mock fetch to return non-OK response (falls through to pseudoEmbedding)
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key' } }),
      });

      const embedding = await generateEmbedding('fallback test');
      expect(embedding).toHaveLength(1536);

      globalThis.fetch = originalFetch;
      process.env.OPENAI_API_KEY = originalKey;
    });

    it('should fall back and warn when OpenAI API throws network error', async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'test-key';

      // Mock fetch to throw (triggers catch block with warning)
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const embedding = await generateEmbedding('network error test');
      expect(embedding).toHaveLength(1536);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[VectorStore] OpenAI embedding failed'),
        expect.any(String),
      );

      globalThis.fetch = originalFetch;
      process.env.OPENAI_API_KEY = originalKey;
      warnSpy.mockRestore();
    });

    it('should use OpenAI API when key is available and API responds', async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'test-key';

      const fakeEmbedding = Array(1536).fill(0).map((_, i) => i / 1536);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ embedding: fakeEmbedding }],
        }),
      });

      const embedding = await generateEmbedding('api test');
      expect(embedding).toEqual(fakeEmbedding);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        expect.objectContaining({ method: 'POST' }),
      );

      globalThis.fetch = originalFetch;
      process.env.OPENAI_API_KEY = originalKey;
    });

    it('should truncate long text to 2000 chars before embedding', async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'test-key';

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ embedding: Array(1536).fill(0) }],
        }),
      });

      const longText = 'a'.repeat(3000);
      await generateEmbedding(longText);

      const callBody = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
      );
      expect(callBody.input.length).toBeLessThanOrEqual(2000);

      globalThis.fetch = originalFetch;
      process.env.OPENAI_API_KEY = originalKey;
    });
  });

  // ── ensureVectorTable ───────────────────────────────────────────────────

  describe('ensureVectorTable', () => {
    it('should create pgvector extension and table', async () => {
      mockExecuteRawUnsafe.mockResolvedValue(undefined);

      await ensureVectorTable();

      // Should call CREATE EXTENSION, CREATE TABLE, HNSW INDEX, and TYPE INDEX
      expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(4);

      const firstCall = mockExecuteRawUnsafe.mock.calls[0][0] as string;
      expect(firstCall).toContain('CREATE EXTENSION IF NOT EXISTS vector');

      const secondCall = mockExecuteRawUnsafe.mock.calls[1][0] as string;
      expect(secondCall).toContain('CREATE TABLE IF NOT EXISTS graph_embeddings');
      expect(secondCall).toContain('embedding vector(1536)');
    });

    it('should handle index creation errors gracefully', async () => {
      mockExecuteRawUnsafe
        .mockResolvedValueOnce(undefined)  // CREATE EXTENSION
        .mockResolvedValueOnce(undefined)  // CREATE TABLE
        .mockRejectedValueOnce(new Error('HNSW not available')) // HNSW index
        .mockRejectedValueOnce(new Error('Index exists'));       // Type index

      // Should not throw
      await expect(ensureVectorTable()).resolves.toBeUndefined();
    });
  });

  // ── upsertEmbedding ─────────────────────────────────────────────────────

  describe('upsertEmbedding', () => {
    it('should insert embedding with correct SQL', async () => {
      mockExecuteRawUnsafe.mockResolvedValue(undefined);

      const input = makeEmbeddingInput();
      const embedding = Array(1536).fill(0).map((_, i) => i / 1536);

      await upsertEmbedding(input, embedding);

      expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
      const sql = mockExecuteRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO graph_embeddings');
      expect(sql).toContain('ON CONFLICT (node_id) DO UPDATE');
    });

    it('should pass correct parameters', async () => {
      mockExecuteRawUnsafe.mockResolvedValue(undefined);

      const input = makeEmbeddingInput();
      const embedding = [0.1, 0.2, 0.3];

      await upsertEmbedding(input, embedding);

      const args = mockExecuteRawUnsafe.mock.calls[0];
      expect(args[1]).toBe(input.nodeId);
      expect(args[2]).toBe(input.nodeType);
      expect(args[3]).toBe(input.label);
      expect(args[4]).toBe(input.text);
      expect(args[5]).toBe('[0.1,0.2,0.3]'); // vector string
      expect(args[6]).toBe(JSON.stringify(input.properties));
    });
  });

  // ── batchUpsertEmbeddings ───────────────────────────────────────────────

  describe('batchUpsertEmbeddings', () => {
    it('should upsert all items sequentially', async () => {
      mockExecuteRawUnsafe.mockResolvedValue(undefined);

      const items = [
        { input: makeEmbeddingInput({ nodeId: 'node-1' }), embedding: Array(1536).fill(0.1) },
        { input: makeEmbeddingInput({ nodeId: 'node-2' }), embedding: Array(1536).fill(0.2) },
        { input: makeEmbeddingInput({ nodeId: 'node-3' }), embedding: Array(1536).fill(0.3) },
      ];

      await batchUpsertEmbeddings(items);

      expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(3);
    });

    it('should handle empty batch', async () => {
      await batchUpsertEmbeddings([]);
      expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
    });
  });

  // ── vectorSearch ────────────────────────────────────────────────────────

  describe('vectorSearch', () => {
    it('should query with cosine similarity and return formatted results', async () => {
      const mockResults = [
        {
          node_id: 'node-1',
          node_type: 'product',
          label: 'SKU-001',
          similarity: 0.95,
          properties: { sku: 'SKU-001' },
        },
        {
          node_id: 'node-2',
          node_type: 'supplier',
          label: 'SUP-001',
          similarity: 0.82,
          properties: '{"code": "SUP-001"}', // JSON string from DB
        },
      ];
      mockQueryRawUnsafe.mockResolvedValue(mockResults);

      const queryEmbedding = Array(1536).fill(0.1);
      const results = await vectorSearch(queryEmbedding, { topK: 5, threshold: 0.5 });

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        nodeId: 'node-1',
        nodeType: 'product',
        label: 'SKU-001',
        similarity: 0.95,
        properties: { sku: 'SKU-001' },
      });
      // JSON string properties should be parsed
      expect(results[1].properties).toEqual({ code: 'SUP-001' });
    });

    it('should use default topK and threshold when not specified', async () => {
      mockQueryRawUnsafe.mockResolvedValue([]);

      const queryEmbedding = Array(1536).fill(0);
      await vectorSearch(queryEmbedding);

      const args = mockQueryRawUnsafe.mock.calls[0];
      expect(args[2]).toBe(0.5);  // default threshold
      expect(args[3]).toBe(10);   // default topK
    });

    it('should add node_type filter when specified', async () => {
      mockQueryRawUnsafe.mockResolvedValue([]);

      const queryEmbedding = Array(1536).fill(0);
      await vectorSearch(queryEmbedding, { nodeType: 'product' });

      const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain("AND node_type = 'product'");
    });

    it('should round similarity to 3 decimal places', async () => {
      mockQueryRawUnsafe.mockResolvedValue([
        {
          node_id: 'n1',
          node_type: 'product',
          label: 'Test',
          similarity: 0.123456789,
          properties: {},
        },
      ]);

      const results = await vectorSearch(Array(1536).fill(0));
      expect(results[0].similarity).toBe(0.123);
    });

    it('should return empty array when no results match', async () => {
      mockQueryRawUnsafe.mockResolvedValue([]);

      const results = await vectorSearch(Array(1536).fill(0));
      expect(results).toEqual([]);
    });
  });

  // ── getEmbeddingCount ───────────────────────────────────────────────────

  describe('getEmbeddingCount', () => {
    it('should return count from database', async () => {
      mockQueryRawUnsafe.mockResolvedValue([{ count: BigInt(42) }]);

      const count = await getEmbeddingCount();
      expect(count).toBe(42);
    });

    it('should return 0 when no results', async () => {
      mockQueryRawUnsafe.mockResolvedValue([]);

      const count = await getEmbeddingCount();
      expect(count).toBe(0);
    });
  });

  // ── clearEmbeddings ─────────────────────────────────────────────────────

  describe('clearEmbeddings', () => {
    it('should truncate the table', async () => {
      mockExecuteRawUnsafe.mockResolvedValue(undefined);

      await clearEmbeddings();

      expect(mockExecuteRawUnsafe).toHaveBeenCalledWith('TRUNCATE graph_embeddings;');
    });
  });
});
