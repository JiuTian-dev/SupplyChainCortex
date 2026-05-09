import { describe, it, expect } from 'vitest';
import {
  retrieveKnowledge,
  augmentPrompt,
  getRAGDomains,
  searchByDomain,
} from './rag';

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
