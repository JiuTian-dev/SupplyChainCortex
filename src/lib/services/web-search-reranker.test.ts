/**
 * Tests for pure functions in web-search-reranker.ts
 *
 * rerankResults               — re-ranks search results by semantic + authority + freshness
 * computeSemanticSimilarity  — cosine similarity with Chinese bigram/trigram tokenization
 * computeAuthorityBoost      — domain-based authority/penalty calculation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SearchResult } from './web-search.service';
import {
  rerankResults,
  computeSemanticSimilarity,
  computeAuthorityBoost,
} from './web-search-reranker';

// ─── computeSemanticSimilarity ─────────────────────────────────────────────────────

describe('computeSemanticSimilarity', () => {
  it('returns a high score for query that closely matches text', () => {
    const score = computeSemanticSimilarity('铜价走势', '铜价走势分析 铜价 走势');
    expect(score).toBeGreaterThan(0.3);
  });

  it('returns a lower score for unrelated text', () => {
    const score = computeSemanticSimilarity('铜价走势', '今天天气晴空万里适合出行');
    expect(score).toBeLessThan(0.5);
  });

  it('returns 0 for empty text', () => {
    expect(computeSemanticSimilarity('铜价', '')).toBe(0);
  });

  it('returns 0.3 default when query produces no tokens', () => {
    // Query with only short English words (under 3 chars) and no Chinese
    expect(computeSemanticSimilarity('a b c', 'some content here')).toBe(0.3);
  });
});

// ─── computeAuthorityBoost ─────────────────────────────────────────────────────────

describe('computeAuthorityBoost', () => {
  it('returns 0.25 for .gov domains', () => {
    expect(computeAuthorityBoost('https://www.ustr.gov/tariffs')).toBe(0.25);
  });

  it('returns 0.20 for reuters.com', () => {
    const boost = computeAuthorityBoost('https://www.reuters.com/article/copper');
    expect(boost).toBe(0.20);
  });

  it('returns 0 for unknown/neutral domains', () => {
    expect(computeAuthorityBoost('https://example.com/article')).toBe(0);
  });

  it('returns -0.10 penalty for reddit.com', () => {
    const boost = computeAuthorityBoost('https://www.reddit.com/r/supplychain');
    expect(boost).toBe(-0.10);
  });

  it('returns 0 for invalid URLs', () => {
    expect(computeAuthorityBoost('not-a-valid-url')).toBe(0);
  });
});

// ─── rerankResults ─────────────────────────────────────────────────────────────────

describe('rerankResults', () => {
  // Freeze time so freshness boosts are deterministic
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-05-19T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const makeResult = (overrides: Partial<SearchResult> & { url: string; title: string; snippet: string }): SearchResult => ({
    title: overrides.title,
    url: overrides.url,
    snippet: overrides.snippet,
    source: overrides.source,
    content: overrides.content,
    publishedAt: overrides.publishedAt,
  });

  it('orders results by combined score descending (authority + relevance)', () => {
    const results: SearchResult[] = [
      makeResult({
        title: 'Copper prices surge',
        url: 'https://reuters.com/article/copper',
        snippet: 'Copper prices increased by 5% due to supply constraints',
        publishedAt: '2026-05-18T00:00:00Z',
      }),
      makeResult({
        title: 'Random discussion',
        url: 'https://reddit.com/r/random',
        snippet: 'I think copper might be going up maybe not though',
        publishedAt: undefined,
      }),
      makeResult({
        title: '天气真好',
        url: 'https://example.com/weather',
        snippet: '今天天气不错适合出去玩',
      }),
    ];

    const ordered = rerankResults(results, '铜价 copper price');

    // Reuters should be first (high authority + relevant content)
    expect(ordered[0].url).toContain('reuters.com');
    // Reddit or example should come last
    const lastUrl = ordered[ordered.length - 1].url;
    expect(lastUrl === 'https://reddit.com/r/random' || lastUrl === 'https://example.com/weather').toBe(true);
  });

  it('returns empty array when given empty input', () => {
    expect(rerankResults([], 'test query')).toEqual([]);
  });

  it('returns a single result unchanged', () => {
    const results: SearchResult[] = [
      makeResult({
        title: 'Sole result',
        url: 'https://example.com/sole',
        snippet: 'Only one result available',
      }),
    ];
    const ordered = rerankResults(results, 'test');
    expect(ordered).toHaveLength(1);
    expect(ordered[0].url).toBe('https://example.com/sole');
  });

  it('boosts high-authority .gov results even with weaker semantic match', () => {
    const results: SearchResult[] = [
      makeResult({
        title: 'Some random page about tariffs',
        url: 'https://example.com/tariff',
        snippet: 'Tariff information',
      }),
      makeResult({
        title: 'US tariff schedule',
        url: 'https://ustr.gov/tariff/schedule',
        snippet: 'Official US tariff rate schedule for imported goods',
        publishedAt: '2026-05-01T00:00:00Z',
      }),
    ];

    const ordered = rerankResults(results, 'tariff rates 2026');
    // .gov should be ranked first due to authority boost
    expect(ordered[0].url).toContain('ustr.gov');
  });
});
