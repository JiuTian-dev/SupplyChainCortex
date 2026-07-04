/**
 * Embedding Service Tests — 嵌入向量生成 + 相似度 + 分块.
 *
 * 不依赖外部 API (使用 local fallback), 不依赖数据库.
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  generateEmbedding,
  generateEmbeddings,
  localEmbedding,
  cosineSimilarity,
  chunkText,
  estimateTokens,
  serializeEmbedding,
  deserializeEmbedding,
  getEmbeddingConfig,
  isOpenAIEmbeddingEnabled,
  DEFAULT_CHUNK_OPTIONS,
} from './embedding.service';

// ─── Tests ────────────────────────────────────────────────────────────────

describe('embedding.service', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Force local embedding for all tests to avoid network calls
    process.env.EMBEDDING_PROVIDER = 'local';
    process.env.EMBEDDING_DIMENSION = '128';
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ── getEmbeddingConfig ──────────────────────────────────────────────────

  describe('getEmbeddingConfig', () => {
    it('returns defaults when env unset', () => {
      delete process.env.EMBEDDING_PROVIDER;
      delete process.env.EMBEDDING_MODEL;
      delete process.env.EMBEDDING_DIMENSION;
      const cfg = getEmbeddingConfig();
      expect(cfg.provider).toBe('openai');
      expect(cfg.model).toBe('text-embedding-3-small');
      expect(cfg.dimension).toBe(1536);
    });

    it('respects EMBEDDING_PROVIDER=local', () => {
      process.env.EMBEDDING_PROVIDER = 'local';
      expect(getEmbeddingConfig().provider).toBe('local');
    });

    it('respects EMBEDDING_DIMENSION', () => {
      process.env.EMBEDDING_DIMENSION = '768';
      expect(getEmbeddingConfig().dimension).toBe(768);
    });
  });

  // ── isOpenAIEmbeddingEnabled ────────────────────────────────────────────

  describe('isOpenAIEmbeddingEnabled', () => {
    it('returns false without API key', () => {
      delete process.env.EMBEDDING_PROVIDER;
      delete process.env.OPENAI_API_KEY;
      expect(isOpenAIEmbeddingEnabled()).toBe(false);
    });

    it('returns false when provider=local', () => {
      process.env.EMBEDDING_PROVIDER = 'local';
      process.env.OPENAI_API_KEY = 'sk-test';
      expect(isOpenAIEmbeddingEnabled()).toBe(false);
    });

    it('returns true when provider=openai and key set', () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-test';
      expect(isOpenAIEmbeddingEnabled()).toBe(true);
    });
  });

  // ── localEmbedding ──────────────────────────────────────────────────────

  describe('localEmbedding', () => {
    it('produces a vector of the requested dimension', () => {
      const vec = localEmbedding('hello world', 128);
      expect(vec).toHaveLength(128);
    });

    it('produces a unit vector (L2 norm ≈ 1)', () => {
      const vec = localEmbedding('test text for embedding', 256);
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 5);
    });

    it('is deterministic (same input → same output)', () => {
      const a = localEmbedding('deterministic test', 64);
      const b = localEmbedding('deterministic test', 64);
      expect(a).toEqual(b);
    });

    it('differs for different inputs', () => {
      const a = localEmbedding('apple', 64);
      const b = localEmbedding('banana', 64);
      expect(a).not.toEqual(b);
    });

    it('values are in [-1, 1] range', () => {
      const vec = localEmbedding('range test', 128);
      for (const v of vec) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it('handles empty string', () => {
      const vec = localEmbedding('', 64);
      expect(vec).toHaveLength(64);
    });
  });

  // ── generateEmbedding ───────────────────────────────────────────────────

  describe('generateEmbedding', () => {
    it('falls back to local when no API key', async () => {
      delete process.env.EMBEDDING_PROVIDER;
      delete process.env.OPENAI_API_KEY;
      const vec = await generateEmbedding('test');
      expect(vec).toHaveLength(128);
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 4);
    });

    it('uses local provider when EMBEDDING_PROVIDER=local', async () => {
      process.env.EMBEDDING_PROVIDER = 'local';
      process.env.EMBEDDING_DIMENSION = '256';
      const vec = await generateEmbedding('local test');
      expect(vec).toHaveLength(256);
    });

    it('falls back when OpenAI API fails (no key)', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      delete process.env.OPENAI_API_KEY;
      const vec = await generateEmbedding('fallback test');
      expect(vec.length).toBeGreaterThan(0);
    });
  });

  // ── generateEmbeddings (batch) ──────────────────────────────────────────

  describe('generateEmbeddings', () => {
    it('returns empty array for empty input', async () => {
      const result = await generateEmbeddings([]);
      expect(result).toEqual([]);
    });

    it('generates embeddings for multiple texts', async () => {
      process.env.EMBEDDING_PROVIDER = 'local';
      process.env.EMBEDDING_DIMENSION = '64';
      const result = await generateEmbeddings(['apple', 'banana', 'cherry']);
      expect(result).toHaveLength(3);
      expect(result[0]).toHaveLength(64);
      expect(result[1]).toHaveLength(64);
    });

    it('preserves order', async () => {
      process.env.EMBEDDING_PROVIDER = 'local';
      process.env.EMBEDDING_DIMENSION = '64';
      const [a1] = await generateEmbeddings(['first', 'second']);
      const [a2] = await generateEmbeddings(['first']);
      expect(a1).toEqual(a2);
    });
  });

  // ── cosineSimilarity ────────────────────────────────────────────────────

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const a = [1, 0, 0];
      const b = [1, 0, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
      const a = [1, 0];
      const b = [0, 1];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
    });

    it('returns -1 for opposite vectors', () => {
      const a = [1, 0];
      const b = [-1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
    });

    it('returns 0 for empty vectors', () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });

    it('returns 0 for zero vectors', () => {
      expect(cosineSimilarity([0, 0, 0], [1, 1, 1])).toBe(0);
    });

    it('handles different dimensions (uses min)', () => {
      const a = [1, 0, 0, 0];
      const b = [1, 0];
      // Only first 2 dims compared: [1,0] vs [1,0] → 1.0
      expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
    });

    it('identical text has similarity 1.0 via localEmbedding', () => {
      const a = localEmbedding('FCC 认证 无线设备 美国', 128);
      const b = localEmbedding('FCC 认证 无线设备 美国', 128);
      const sim = cosineSimilarity(a, b);
      expect(sim).toBeCloseTo(1.0, 5);
    });
  });

  // ── estimateTokens ──────────────────────────────────────────────────────

  describe('estimateTokens', () => {
    it('returns 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('estimates English tokens (~4 chars/token)', () => {
      const text = 'hello world this is a test'; // 26 chars
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(15);
    });

    it('estimates Chinese tokens (~1.5 chars/token)', () => {
      const text = '你好世界这是一个测试'; // 10 chars
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(10);
    });

    it('handles mixed content', () => {
      const text = 'Hello 你好 World 世界';
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  // ── chunkText ───────────────────────────────────────────────────────────

  describe('chunkText', () => {
    it('returns empty array for empty input', () => {
      expect(chunkText('')).toEqual([]);
    });

    it('returns empty array for whitespace-only input', () => {
      expect(chunkText('   ')).toEqual([]);
    });

    it('returns single chunk for short text', () => {
      const text = 'This is a short text.';
      const chunks = chunkText(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe(text);
      expect(chunks[0].chunkIndex).toBe(0);
    });

    it('splits long text into multiple chunks', () => {
      // Generate text that exceeds maxTokens (256 default)
      const paragraph = 'This is a paragraph with enough content to be split. ';
      const text = paragraph.repeat(50); // ~2500 chars
      const chunks = chunkText(text, { maxTokens: 50 });
      expect(chunks.length).toBeGreaterThan(1);
      // All chunks should have content
      for (const c of chunks) {
        expect(c.content.length).toBeGreaterThan(0);
      }
    });

    it('assigns sequential chunkIndex', () => {
      const text = Array.from({ length: 20 }, (_, i) => `Paragraph ${i}. This is some content.`).join('\n\n');
      const chunks = chunkText(text, { maxTokens: 30 });
      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].chunkIndex).toBe(i);
      }
    });

    it('respects maxTokens option', () => {
      const text = 'word '.repeat(200); // ~1000 chars
      const chunks = chunkText(text, { maxTokens: 20, overlapTokens: 0 });
      for (const c of chunks) {
        // Each chunk should be roughly within maxTokens (with some slack for separator-based splitting)
        expect(c.tokenCount).toBeLessThanOrEqual(40);
      }
    });

    it('handles Chinese text', () => {
      const text = '这是一个测试段落。'.repeat(50);
      const chunks = chunkText(text, { maxTokens: 30 });
      expect(chunks.length).toBeGreaterThan(0);
      for (const c of chunks) {
        expect(c.content.length).toBeGreaterThan(0);
      }
    });

    it('uses default options when none provided', () => {
      const text = 'short text';
      const chunks = chunkText(text);
      expect(chunks).toHaveLength(1);
    });

    it('DEFAULT_CHUNK_OPTIONS has sensible defaults', () => {
      expect(DEFAULT_CHUNK_OPTIONS.maxTokens).toBe(256);
      expect(DEFAULT_CHUNK_OPTIONS.overlapTokens).toBe(50);
      expect(DEFAULT_CHUNK_OPTIONS.separators.length).toBeGreaterThan(0);
    });
  });

  // ── Serialization ───────────────────────────────────────────────────────

  describe('serialize/deserialize embedding', () => {
    it('round-trips a vector', () => {
      const vec = [0.1, 0.2, 0.3, -0.4];
      const s = serializeEmbedding(vec);
      expect(s).not.toBeNull();
      const restored = deserializeEmbedding(s);
      expect(restored).toEqual(vec);
    });

    it('serialize returns null for null/empty input', () => {
      expect(serializeEmbedding(null)).toBeNull();
      expect(serializeEmbedding(undefined)).toBeNull();
      expect(serializeEmbedding([])).toBeNull();
    });

    it('deserialize returns null for null/invalid input', () => {
      expect(deserializeEmbedding(null)).toBeNull();
      expect(deserializeEmbedding(undefined)).toBeNull();
      expect(deserializeEmbedding('not json')).toBeNull();
      expect(deserializeEmbedding('"string"')).toBeNull();
    });

    it('deserialize returns null for non-array JSON', () => {
      expect(deserializeEmbedding('{"a":1}')).toBeNull();
    });
  });
});
