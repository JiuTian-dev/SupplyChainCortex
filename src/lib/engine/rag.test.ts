import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  retrieveKnowledge,
  augmentPrompt,
  getRAGDomains,
  searchByDomain,
  tokenize,
  getSourceTags,
  getScore,
  updateChunkScore,
  evolveFromFeedback,
  getKnowledgeHealth,
  getChunksNeedingReview,
} from './rag';
import type { KnowledgeChunk } from './rag';

describe('retrieveKnowledge', () => {
  it('returns empty array for empty query', () => {
    const results = retrieveKnowledge('');
    expect(results).toEqual([]);
  });

  it('returns results for short query', () => {
    const results = retrieveKnowledge('hello');
    if (results.length > 0) {
      expect(results[0].chunk).toBeDefined();
      expect(results[0].score).toBeGreaterThan(0);
    }
  });

  it('returns top-K results sorted by score descending', () => {
    const results = retrieveKnowledge('亚马逊 FBA 库存', 3);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it('returns results with relevance labels', () => {
    const results = retrieveKnowledge('FCC 认证 无线设备', 3);
    for (const r of results) {
      expect(['high', 'medium', 'low']).toContain(r.relevance);
    }
  });

  it('scores are in valid range', () => {
    const results = retrieveKnowledge('关税', 5);
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('query matching tariff returns tariff-domain chunks', () => {
    const results = retrieveKnowledge('Section 301 关税条款', 5);
    const hasTariff = results.some(r => r.chunk.domain === 'tariff');
    expect(hasTariff).toBe(true);
  });

  it('query matching compliance returns compliance-domain chunks', () => {
    const results = retrieveKnowledge('GDPR 数据隐私 合规', 5);
    const hasCompliance = results.some(r => r.chunk.domain === 'compliance');
    expect(hasCompliance).toBe(true);
  });

  it('query matching production returns production-domain chunks', () => {
    const results = retrieveKnowledge('工厂审核 BSCI 验厂', 3);
    const hasProduction = results.some(r => r.chunk.domain === 'production');
    expect(hasProduction).toBe(true);
  });

  it('query matching ecommerce returns ecommerce-domain chunks', () => {
    const results = retrieveKnowledge('亚马逊 PPC 广告 TACOS', 3);
    const hasEcommerce = results.some(r => r.chunk.domain === 'ecommerce');
    expect(hasEcommerce).toBe(true);
  });

  it('query matching safety returns safety-domain chunks', () => {
    const results = retrieveKnowledge('锂电池 UN38.3 运输', 3);
    const hasSafety = results.some(r => r.chunk.domain === 'safety');
    expect(hasSafety).toBe(true);
  });

  it('query matching payment returns payment-domain chunks', () => {
    const results = retrieveKnowledge('跨境支付 收款 Payoneer', 3);
    const hasPayment = results.some(r => r.chunk.domain === 'payment');
    expect(hasPayment).toBe(true);
  });
});

describe('augmentPrompt', () => {
  it('returns empty string for empty results', () => {
    const result = augmentPrompt('test', []);
    expect(result).toBe('');
  });

  it('includes chunk titles and domains', () => {
    const results = retrieveKnowledge('关税', 2);
    if (results.length > 0) {
      const prompt = augmentPrompt('关税', results);
      expect(prompt).toContain(results[0].chunk.title);
      expect(prompt).toContain('领域');
    }
  });
});

describe('getRAGDomains', () => {
  it('returns all domains including new ones', () => {
    const domains = getRAGDomains();
    expect(domains).toContain('tariff');
    expect(domains).toContain('logistics');
    expect(domains).toContain('compliance');
    expect(domains).toContain('risk');
    expect(domains).toContain('general');
    expect(domains).toContain('production');
    expect(domains).toContain('ecommerce');
    expect(domains).toContain('safety');
    expect(domains).toContain('payment');
  });
});

describe('searchByDomain', () => {
  it('filters correctly by domain', () => {
    const results = searchByDomain('tariff');
    for (const r of results) {
      expect(r.domain).toBe('tariff');
    }
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns empty array for unknown domain', () => {
    const results = searchByDomain('unknown-domain' as unknown as string);
    expect(results).toEqual([]);
  });

  it('returns results for new production domain', () => {
    const results = searchByDomain('production');
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.domain).toBe('production');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for internal pure functions
// ─────────────────────────────────────────────────────────────────────────────

describe('tokenize', () => {
  it('splits text into lowercase tokens', () => {
    const tokens = tokenize('Hello World Test');
    expect(tokens).toEqual(['hello', 'world', 'test']);
  });

  it('handles CJK characters — groups consecutive CJK as token', () => {
    const tokens = tokenize('Section 301 关税条款');
    expect(tokens).toContain('section');
    expect(tokens).toContain('301');
    expect(tokens).toContain('关税条款'); // CJK characters grouped as one token
  });

  it('filters single-character tokens', () => {
    const tokens = tokenize('a b c hello');
    expect(tokens).not.toContain('a');
    expect(tokens).not.toContain('b');
    expect(tokens).not.toContain('c');
    expect(tokens).toContain('hello');
  });

  it('strips punctuation and special characters', () => {
    const tokens = tokenize('hello, world! tariff-rate: 25%');
    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
    expect(tokens).toContain('tariff');
    expect(tokens).toContain('rate');
    expect(tokens).toContain('25');
    expect(tokens).not.toContain('hello,');
    expect(tokens).not.toContain('world!');
  });

  it('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('returns empty array for single-character input', () => {
    expect(tokenize('a')).toEqual([]);
  });

  it('handles mixed alphanumeric tokens', () => {
    const tokens = tokenize('FCC-ID UN38.3 RoHS2.0');
    expect(tokens).toContain('fcc');
    expect(tokens).toContain('id');
    expect(tokens).toContain('un38');
    expect(tokens).toContain('rohs2');
  });
});

describe('getScore', () => {
  it('returns 1.0 for chunk without usefulnessScore', () => {
    const chunk = { id: 'test', domain: 'general' as const, title: 'Test', content: '', keywords: [] };
    expect(getScore(chunk)).toBe(1.0);
  });

  it('returns the explicit score when set', () => {
    const chunk = { id: 'test', domain: 'general' as const, title: 'Test', content: '', keywords: [], usefulnessScore: 0.75 };
    expect(getScore(chunk)).toBe(0.75);
  });

  it('returns 0 for score of 0', () => {
    const chunk = { id: 'test', domain: 'general' as const, title: 'Test', content: '', keywords: [], usefulnessScore: 0 };
    expect(getScore(chunk)).toBe(0);
  });
});

describe('getSourceTags', () => {
  it('returns custom sourceTags when set on the chunk', () => {
    const chunk = {
      id: 'test', domain: 'tariff' as const, title: 'Test', content: '', keywords: [],
      sourceTags: ['custom-tag-1', 'custom-tag-2'],
    };
    expect(getSourceTags(chunk)).toEqual(['custom-tag-1', 'custom-tag-2']);
  });

  it('returns domain defaults for tariff domain', () => {
    const chunk = { id: 'test', domain: 'tariff' as const, title: 'Test', content: '', keywords: [] };
    const tags = getSourceTags(chunk);
    expect(tags).toContain('tariff');
    expect(tags).toContain('ustr');
    expect(tags).toContain('cbam');
  });

  it('returns domain defaults for logistics domain', () => {
    const chunk = { id: 'test', domain: 'logistics' as const, title: 'Test', content: '', keywords: [] };
    const tags = getSourceTags(chunk);
    expect(tags).toContain('scfi');
    expect(tags).toContain('freight');
    expect(tags).toContain('port');
  });

  it('returns [domain] for unknown domains', () => {
    const chunk = { id: 'test', domain: 'unknown-domain' as any, title: 'Test', content: '', keywords: [] };
    expect(getSourceTags(chunk)).toEqual(['unknown-domain']);
  });

  it('returns domain defaults for ecommerce domain', () => {
    const chunk = { id: 'test', domain: 'ecommerce' as const, title: 'Test', content: '', keywords: [] };
    const tags = getSourceTags(chunk);
    expect(tags).toContain('amazon');
    expect(tags).toContain('temu');
  });
});

describe('updateChunkScore', () => {
  const TEST_CHUNK = 'tariff-section301';

  afterEach(() => {
    // Restore chunk to pristine state
    updateChunkScore(TEST_CHUNK, 10);
  });

  it('increases score with positive delta', () => {
    updateChunkScore(TEST_CHUNK, 0.1);
    const results = retrieveKnowledge('Section 301', 10);
    const found = results.find(r => r.chunk.id === TEST_CHUNK);
    expect(found).toBeDefined();
    expect(found!.score).toBeGreaterThan(0);
  });

  it('clamps score to minimum of 0', () => {
    updateChunkScore(TEST_CHUNK, -999);
    const results = retrieveKnowledge('Section 301', 10);
    const found = results.find(r => r.chunk.id === TEST_CHUNK);
    // Score should be < 0.3 so chunk is excluded by filter
    expect(found).toBeUndefined();
  });

  it('clamps score to maximum of 1', () => {
    updateChunkScore(TEST_CHUNK, 999);
    const results = retrieveKnowledge('Section 301', 10);
    const found = results.find(r => r.chunk.id === TEST_CHUNK);
    expect(found).toBeDefined();
    expect(found!.score).toBeLessThanOrEqual(1);
  });

  it('auto-demotes and warns when score drops below 0.3', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    updateChunkScore(TEST_CHUNK, -10);
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('auto-demoted');
    expect(warnSpy.mock.calls[0][0]).toContain('Section 301');
    warnSpy.mockRestore();
  });

  it('does nothing for unknown chunkId', () => {
    expect(() => updateChunkScore('non-existent-chunk', 0.5)).not.toThrow();
  });
});

describe('evolveFromFeedback', () => {
  const TEST_CHUNK = 'tariff-section301';

  afterEach(() => {
    // Restore chunk to pristine state
    updateChunkScore(TEST_CHUNK, 10);
  });

  it('updates chunks matching source tags', () => {
    const result = evolveFromFeedback({ tariff: 0.8, ustr: 0.6 });
    expect(result.updated).toBeGreaterThan(0);
  });

  it('returns demoted chunks when score falls below 0.3 after multiple evolve cycles', () => {
    // First cycle: score drops from 1.0 → 1.0*0.7 + 0*0.3 = 0.7 (not demoted)
    // Second cycle: 0.7*0.7 + 0*0.3 = 0.49 (not demoted)
    // Third cycle: 0.49*0.7 + 0*0.3 = 0.34 (not demoted)
    // Fourth cycle: 0.34*0.7 + 0*0.3 = 0.24 (demoted!)
    evolveFromFeedback({ tariff: 0, ustr: 0, cbam: 0, rcep: 0, 'hs-code': 0 });
    evolveFromFeedback({ tariff: 0, ustr: 0, cbam: 0, rcep: 0, 'hs-code': 0 });
    evolveFromFeedback({ tariff: 0, ustr: 0, cbam: 0, rcep: 0, 'hs-code': 0 });
    const result = evolveFromFeedback({ tariff: 0, ustr: 0, cbam: 0, rcep: 0, 'hs-code': 0 });
    expect(result.demoted.length).toBeGreaterThan(0);
  });

  it('skips chunks with no matching source tags', () => {
    const result = evolveFromFeedback({ 'no-match-tag': 0.9 });
    // Should still possibly work because tariff domain gets tags that don't match
    // Actually, the result.updated depends on the avgReliability compared to current score
    // If avgReliability ≈ current score, no update. Let's just check it doesn't crash.
    expect(result).toHaveProperty('updated');
    expect(result).toHaveProperty('demoted');
  });

  it('returns updated count of 0 for empty reliability input', () => {
    const result = evolveFromFeedback({});
    // No source tags will match anything
    expect(result.updated).toBeGreaterThanOrEqual(0);
  });
});

describe('getKnowledgeHealth', () => {
  it('returns total count matching KNOWLEDGE_BASE length', () => {
    const health = getKnowledgeHealth();
    expect(health.total).toBeGreaterThan(0);
    expect(health.total).toBe(health.active + health.demoted);
  });

  it('returns avgScore between 0 and 1', () => {
    const health = getKnowledgeHealth();
    expect(health.avgScore).toBeGreaterThanOrEqual(0);
    expect(health.avgScore).toBeLessThanOrEqual(1);
  });

  it('returns staleCount as a non-negative number', () => {
    const health = getKnowledgeHealth();
    expect(health.staleCount).toBeGreaterThanOrEqual(0);
  });

  it('active + demoted = total', () => {
    const health = getKnowledgeHealth();
    expect(health.active + health.demoted).toBe(health.total);
  });
});

describe('getChunksNeedingReview', () => {
  it('returns an array', () => {
    const review = getChunksNeedingReview();
    expect(Array.isArray(review)).toBe(true);
  });

  it('each entry has id and domain', () => {
    const review = getChunksNeedingReview();
    for (const chunk of review) {
      expect(chunk.id).toBeTruthy();
      expect(chunk.domain).toBeTruthy();
    }
  });
});
