/**
 * RAG Pipeline Tests — retrieve / rerank / compressContext / buildRagContext.
 *
 * Mocks Prisma db to avoid real DB connection.
 * Uses local embedding (no OpenAI API).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockKnowledgeChunkFindMany = vi.fn();
const mockKnowledgeChunkCount = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    knowledgeChunk: {
      findMany: (...args: unknown[]) => mockKnowledgeChunkFindMany(...args),
      count: (...args: unknown[]) => mockKnowledgeChunkCount(...args),
    },
    knowledgeDocument: {
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

import {
  retrieve,
  rerank,
  compressContext,
  buildRagContext,
  getRagConfig,
  tokenize,
  type RetrievalResult,
  type RerankedResult,
} from './rag-pipeline';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeChunkResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    chunkId: `chunk-${Math.random().toString(36).slice(2, 8)}`,
    documentId: 'doc-1',
    content: 'Sample knowledge chunk content about supply chain.',
    chunkIndex: 0,
    similarity: 0.8,
    title: 'Sample Document',
    domain: 'tariff',
    ...overrides,
  };
}

function makeRerankedResult(overrides: Partial<RerankedResult> = {}): RerankedResult {
  return {
    ...makeChunkResult(),
    rerankScore: 0.7,
    bm25Score: 0.5,
    keywordScore: 0.6,
    vectorScore: 0.8,
    ...overrides,
  };
}

function makeDbChunk(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chunk-1',
    documentId: 'doc-1',
    content: 'FCC 认证是无线设备的强制要求',
    chunkIndex: 0,
    embedding: JSON.stringify([0.1, 0.2, 0.3]),
    metadata: {},
    document: { id: 'doc-1', title: 'FCC 认证指南', domain: 'compliance', source: 'manual' },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('rag-pipeline', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Force local embedding for deterministic tests
    process.env.EMBEDDING_PROVIDER = 'local';
    process.env.EMBEDDING_DIMENSION = '64';
    process.env.RAG_TOP_K = '5';
    process.env.RAG_RERANK_TOP_K = '3';
    process.env.RAG_MAX_TOKENS = '1500';
    process.env.RAG_THRESHOLD = '0.3';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ── getRagConfig ────────────────────────────────────────────────────────

  describe('getRagConfig', () => {
    it('returns config from env vars', () => {
      const cfg = getRagConfig();
      expect(cfg.topK).toBe(5);
      expect(cfg.rerankTopK).toBe(3);
      expect(cfg.maxTokens).toBe(1500);
      expect(cfg.threshold).toBe(0.3);
    });

    it('uses defaults when env unset', () => {
      delete process.env.RAG_TOP_K;
      delete process.env.RAG_RERANK_TOP_K;
      const cfg = getRagConfig();
      expect(cfg.topK).toBe(5);
      expect(cfg.rerankTopK).toBe(3);
    });
  });

  // ── retrieve ────────────────────────────────────────────────────────────

  describe('retrieve', () => {
    it('returns empty array for empty query', async () => {
      const result = await retrieve('');
      expect(result).toEqual([]);
    });

    it('returns empty array when DB has no chunks', async () => {
      mockKnowledgeChunkFindMany.mockResolvedValue([]);
      const result = await retrieve('FCC 认证');
      expect(result).toEqual([]);
    });

    it('retrieves and ranks chunks by similarity', async () => {
      // Two chunks: one with embedding close to query, one far
      const queryEmbedding = await import('./embedding.service').then(m => m.localEmbedding('FCC 认证', 64));
      const similarEmbedding = queryEmbedding.slice(); // identical → similarity 1.0
      const differentEmbedding = await import('./embedding.service').then(m => m.localEmbedding('亚马逊 FBA 库存', 64));

      mockKnowledgeChunkFindMany.mockResolvedValue([
        makeDbChunk({
          id: 'chunk-similar',
          content: 'FCC 认证是无线设备的强制要求',
          embedding: JSON.stringify(similarEmbedding),
        }),
        makeDbChunk({
          id: 'chunk-different',
          content: '亚马逊 FBA 库存优化策略',
          embedding: JSON.stringify(differentEmbedding),
          document: { id: 'doc-2', title: 'FBA 指南', domain: 'ecommerce', source: 'manual' },
        }),
      ]);

      const result = await retrieve('FCC 认证', { threshold: 0.0 });
      expect(result.length).toBe(2);
      // Similar chunk should rank first
      expect(result[0].similarity).toBeGreaterThanOrEqual(result[1].similarity);
      expect(result[0].chunkId).toBe('chunk-similar');
    });

    it('filters by threshold', async () => {
      const differentEmbedding = await import('./embedding.service').then(m => m.localEmbedding('完全不同的内容 xyz', 64));
      mockKnowledgeChunkFindMany.mockResolvedValue([
        makeDbChunk({
          embedding: JSON.stringify(differentEmbedding),
        }),
      ]);
      const result = await retrieve('FCC 认证', { threshold: 0.99 });
      expect(result).toEqual([]);
    });

    it('respects topK option', async () => {
      const queryEmbedding = await import('./embedding.service').then(m => m.localEmbedding('test', 64));
      const chunks = Array.from({ length: 10 }, (_, i) =>
        makeDbChunk({
          id: `chunk-${i}`,
          embedding: JSON.stringify(queryEmbedding),
        }),
      );
      mockKnowledgeChunkFindMany.mockResolvedValue(chunks);
      const result = await retrieve('test', { topK: 3, threshold: 0.0 });
      expect(result.length).toBe(3);
    });

    it('skips chunks with null embedding', async () => {
      mockKnowledgeChunkFindMany.mockResolvedValue([
        makeDbChunk({ id: 'no-emb', embedding: null }),
        makeDbChunk({ id: 'with-emb', embedding: JSON.stringify([0.1, 0.2]) }),
      ]);
      const result = await retrieve('test', { threshold: 0.0 });
      expect(result.length).toBe(1);
      expect(result[0].chunkId).toBe('with-emb');
    });

    it('returns empty on DB error', async () => {
      mockKnowledgeChunkFindMany.mockRejectedValue(new Error('DB connection failed'));
      const result = await retrieve('test');
      expect(result).toEqual([]);
    });
  });

  // ── rerank ──────────────────────────────────────────────────────────────

  describe('rerank', () => {
    it('returns empty array for empty input', () => {
      expect(rerank([], 'query')).toEqual([]);
    });

    it('preserves results when query is empty', () => {
      const results = [makeChunkResult()];
      const reranked = rerank(results, '');
      expect(reranked).toHaveLength(1);
      expect(reranked[0].rerankScore).toBe(reranked[0].similarity);
    });

    it('boosts results with keyword matches in title', () => {
      const results = [
        makeChunkResult({
          chunkId: 'no-match',
          title: 'Generic Title',
          content: 'Some content without keywords',
          similarity: 0.8,
        }),
        makeChunkResult({
          chunkId: 'title-match',
          title: 'FCC 认证指南',
          content: 'Some content',
          similarity: 0.8,
        }),
      ];
      const reranked = rerank(results, 'FCC 认证');
      const titleMatchIdx = reranked.findIndex(r => r.chunkId === 'title-match');
      const noMatchIdx = reranked.findIndex(r => r.chunkId === 'no-match');
      expect(titleMatchIdx).toBeLessThan(noMatchIdx);
    });

    it('combines vector + bm25 + keyword scores', () => {
      const results = [
        makeChunkResult({
          chunkId: 'r1',
          content: 'FCC 认证 无线设备',
          title: 'FCC',
          similarity: 0.9,
        }),
        makeChunkResult({
          chunkId: 'r2',
          content: '完全无关的内容',
          title: 'Other',
          similarity: 0.5,
        }),
      ];
      const reranked = rerank(results, 'FCC 认证');
      expect(reranked[0].chunkId).toBe('r1');
      expect(reranked[0].rerankScore).toBeGreaterThan(reranked[1].rerankScore);
    });

    it('sorts by rerankScore descending', () => {
      const results = [
        makeChunkResult({ chunkId: 'a', similarity: 0.3, content: 'aaa', title: 'a' }),
        makeChunkResult({ chunkId: 'b', similarity: 0.9, content: 'bbb', title: 'b' }),
        makeChunkResult({ chunkId: 'c', similarity: 0.6, content: 'ccc', title: 'c' }),
      ];
      const reranked = rerank(results, 'test query');
      for (let i = 1; i < reranked.length; i++) {
        expect(reranked[i].rerankScore).toBeLessThanOrEqual(reranked[i - 1].rerankScore);
      }
    });

    it('includes all score components', () => {
      const results = [makeChunkResult()];
      const reranked = rerank(results, 'test');
      expect(reranked[0]).toHaveProperty('rerankScore');
      expect(reranked[0]).toHaveProperty('bm25Score');
      expect(reranked[0]).toHaveProperty('keywordScore');
      expect(reranked[0]).toHaveProperty('vectorScore');
    });
  });

  // ── compressContext ─────────────────────────────────────────────────────

  describe('compressContext', () => {
    it('returns empty for empty input', () => {
      const result = compressContext([], 1000);
      expect(result.context).toBe('');
      expect(result.totalTokens).toBe(0);
      expect(result.truncated).toBe(false);
    });

    it('includes all results when under token limit', () => {
      const results = [
        makeRerankedResult({ content: 'Short content 1', title: 'Doc1' }),
        makeRerankedResult({ content: 'Short content 2', title: 'Doc2' }),
      ];
      const result = compressContext(results, 1000);
      expect(result.context).toContain('Doc1');
      expect(result.context).toContain('Doc2');
      expect(result.truncated).toBe(false);
    });

    it('truncates when exceeding token limit', () => {
      const longContent = 'A'.repeat(5000);
      const results = [
        makeRerankedResult({ content: longContent, title: 'LongDoc' }),
        makeRerankedResult({ content: longContent, title: 'LongDoc2' }),
      ];
      const result = compressContext(results, 100);
      expect(result.truncated).toBe(true);
    });

    it('includes title and relevance score in output', () => {
      const results = [
        makeRerankedResult({ content: 'Test content', title: 'My Document', rerankScore: 0.85 }),
      ];
      const result = compressContext(results, 1000);
      expect(result.context).toContain('My Document');
      expect(result.context).toContain('0.85');
    });

    it('separates chunks with delimiter', () => {
      const results = [
        makeRerankedResult({ content: 'Content A', title: 'A' }),
        makeRerankedResult({ content: 'Content B', title: 'B' }),
      ];
      const result = compressContext(results, 1000);
      expect(result.context).toContain('---');
    });
  });

  // ── buildRagContext ─────────────────────────────────────────────────────

  describe('buildRagContext', () => {
    it('returns context with empty results when DB is empty', async () => {
      mockKnowledgeChunkFindMany.mockResolvedValue([]);
      const ctx = await buildRagContext('FCC 认证');
      expect(ctx.results).toEqual([]);
      // Should fallback to domain knowledge
      expect(ctx.domainKnowledge).toBeDefined();
      expect(ctx.context).toContain('供应链领域知识参考');
    });

    it('returns RAG context with results when DB has chunks', async () => {
      const queryEmbedding = await import('./embedding.service').then(m => m.localEmbedding('FCC 认证', 64));
      mockKnowledgeChunkFindMany.mockResolvedValue([
        makeDbChunk({
          id: 'fcc-chunk',
          content: 'FCC 认证是无线设备的强制要求',
          embedding: JSON.stringify(queryEmbedding),
          document: { id: 'doc-1', title: 'FCC 指南', domain: 'compliance', source: 'manual' },
        }),
      ]);
      const ctx = await buildRagContext('FCC 认证', undefined, { threshold: 0.0 });
      expect(ctx.results.length).toBeGreaterThan(0);
      expect(ctx.context).toContain('FCC');
      expect(ctx.totalTokens).toBeGreaterThan(0);
    });

    it('includes query in result', async () => {
      mockKnowledgeChunkFindMany.mockResolvedValue([]);
      const ctx = await buildRagContext('my query');
      expect(ctx.query).toBe('my query');
    });

    it('falls back to domain knowledge on retrieve error', async () => {
      mockKnowledgeChunkFindMany.mockRejectedValue(new Error('DB error'));
      const ctx = await buildRagContext('关税');
      expect(ctx.results).toEqual([]);
      expect(ctx.domainKnowledge).toBeDefined();
    });

    it('domain knowledge fallback includes relevant sections', async () => {
      mockKnowledgeChunkFindMany.mockResolvedValue([]);
      const ctx = await buildRagContext('FCC 认证 无线');
      expect(ctx.context).toContain('供应链领域知识参考');
      // Should include compliance regulations (FCC related)
      expect(ctx.domainKnowledge?.regulations.length).toBeGreaterThan(0);
    });
  });

  // ── tokenize ────────────────────────────────────────────────────────────

  describe('tokenize', () => {
    it('returns empty array for empty input', () => {
      expect(tokenize('')).toEqual([]);
    });

    it('tokenizes English text', () => {
      const tokens = tokenize('hello world test');
      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
      expect(tokens).toContain('test');
    });

    it('tokenizes Chinese text with unigrams and bigrams', () => {
      const tokens = tokenize('你好世界');
      expect(tokens).toContain('你');
      expect(tokens).toContain('你好');
      expect(tokens).toContain('世界');
    });

    it('lowercases English tokens', () => {
      const tokens = tokenize('HELLO World');
      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
    });

    it('handles mixed content', () => {
      const tokens = tokenize('FCC 认证 hello');
      expect(tokens).toContain('fcc');
      expect(tokens).toContain('hello');
      expect(tokens).toContain('认');
    });
  });
});
