// src/lib/services/__tests__/web-search-reranker.test.ts
import { describe, it, expect } from 'vitest';
import { rerankResults, computeSemanticSimilarity, computeAuthorityBoost } from '../web-search-reranker';
import type { SearchResult } from '../web-search.service';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    title: 'Test Result',
    url: 'https://example.com/article',
    snippet: 'This is a test result about supply chain management.',
    ...overrides,
  };
}

describe('computeSemanticSimilarity', () => {
  it('returns higher score for more relevant content', () => {
    const score1 = computeSemanticSimilarity(
      'US-China tariff impact on home appliances 2026',
      'The United States has announced new tariff measures affecting small home appliances imported from China in 2026.',
    );
    const score2 = computeSemanticSimilarity(
      'US-China tariff impact on home appliances 2026',
      'The weather today is sunny with a chance of rain in the afternoon.',
    );
    expect(score1).toBeGreaterThan(score2);
  });

  it('handles Chinese text', () => {
    const score = computeSemanticSimilarity(
      '中国家电出口关税',
      '中国出口家电产品面临美国301关税',
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('returns low score for empty snippet', () => {
    const score = computeSemanticSimilarity('supply chain', '');
    expect(score).toBe(0);
  });
});

describe('computeAuthorityBoost', () => {
  it('boosts .gov domains', () => {
    const boost = computeAuthorityBoost('https://ustr.gov/policy-update');
    expect(boost).toBeGreaterThan(0.15);
  });

  it('does not boost low-authority domains', () => {
    const boost = computeAuthorityBoost('https://random-blog.xyz/post');
    expect(boost).toBeLessThanOrEqual(0.05);
  });
});

describe('rerankResults', () => {
  it('places more relevant results at the top', () => {
    const results: SearchResult[] = [
      makeResult({ title: 'Weather Forecast', snippet: 'Sunny with clouds', url: 'https://news.com/weather' }),
      makeResult({ title: 'Tariff Impact Report', snippet: 'The 2026 US-China tariff escalation affects small home appliance exports...', url: 'https://reuters.com/tariff' }),
      makeResult({ title: 'Sports News', snippet: 'The championship game was exciting', url: 'https://news.com/sports' }),
    ];
    const reranked = rerankResults(results, 'US China tariff impact home appliances');
    expect(reranked[0].url).toContain('reuters.com');
  });

  it('handles empty results', () => {
    expect(rerankResults([], 'anything')).toEqual([]);
  });
});
