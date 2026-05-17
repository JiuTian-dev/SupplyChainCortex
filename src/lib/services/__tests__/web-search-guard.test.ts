// src/lib/services/__tests__/web-search-guard.test.ts
import { describe, it, expect } from 'vitest';
import {
  guardResults,
  checkLanguageMatch,
  filterBlacklistedDomains,
  detectEmptyOrDegraded,
  scoreResultQuality,
} from '../web-search-guard';
import type { SearchResult } from '../web-search.service';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    title: 'Test Result',
    url: 'https://example.com/article',
    snippet: 'This is a test result about supply chain.',
    ...overrides,
  };
}

describe('filterBlacklistedDomains', () => {
  it('filters out known adult/suspicious domains', () => {
    const results = [
      makeResult({ url: 'https://example.com/news' }),
      makeResult({ url: 'https://bokep-viral.xyz/supply-chain' }),
      makeResult({ url: 'https://reuters.com/article' }),
    ];
    const filtered = filterBlacklistedDomains(results);
    expect(filtered).toHaveLength(2);
    expect(filtered.every(r => r.url.includes('example.com') || r.url.includes('reuters.com'))).toBe(true);
  });

  it('filters URLs containing suspicious patterns', () => {
    const results = [
      makeResult({ url: 'https://site.com/porn-video-supply-chain' }),
      makeResult({ url: 'https://news.com/legit' }),
    ];
    const filtered = filterBlacklistedDomains(results);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].url).toBe('https://news.com/legit');
  });
});

describe('checkLanguageMatch', () => {
  it('detects Chinese content correctly', () => {
    expect(checkLanguageMatch('中国家电供应链', 'zh')).toBe(true);
    expect(checkLanguageMatch('This is about supply chains in China', 'en')).toBe(true);
  });

  it('flags language mismatches', () => {
    expect(checkLanguageMatch('Indonesia viral terbaru', 'zh')).toBe(false);
  });
});

describe('detectEmptyOrDegraded', () => {
  it('detects empty results', () => {
    const result = detectEmptyOrDegraded([], 'supply chain');
    expect(result.isDegraded).toBe(true);
    expect(result.reason).toContain('empty');
  });

  it('detects when all results are from low-quality sources', () => {
    const results = [
      makeResult({ url: 'https://reddit.com/r/anything' }),
      makeResult({ url: 'https://quora.com/question' }),
    ];
    const result = detectEmptyOrDegraded(results, 'supply chain trends');
    expect(result.isDegraded).toBe(true);
    expect(result.reason).toContain('low_quality');
  });

  it('passes good results through', () => {
    const results = [
      makeResult({ url: 'https://reuters.com/article', title: 'Supply Chain News' }),
      makeResult({ url: 'https://bloomberg.com/news', title: 'Trade Update' }),
    ];
    const result = detectEmptyOrDegraded(results, 'supply chain');
    expect(result.isDegraded).toBe(false);
  });
});

describe('scoreResultQuality', () => {
  it('scores high-authority domains higher', () => {
    const govResult = makeResult({ url: 'https://www.ustr.gov/policy', snippet: 'Trade policy update for 2026' });
    const forumResult = makeResult({ url: 'https://reddit.com/r/supplychain', snippet: 'Anyone know about tariffs?' });
    const govScore = scoreResultQuality(govResult, 'US trade policy');
    const forumScore = scoreResultQuality(forumResult, 'US trade policy');
    expect(govScore).toBeGreaterThan(forumScore);
  });

  it('penalizes results with keyword-stuffed titles', () => {
    const cleanResult = makeResult({ title: 'US-China Trade Relations Update' });
    const stuffedResult = makeResult({ title: 'supply chain AI blockchain supply chain 2026 supply chain' });
    const cleanScore = scoreResultQuality(cleanResult, 'supply chain trends');
    const stuffedScore = scoreResultQuality(stuffedResult, 'supply chain trends');
    expect(cleanScore).toBeGreaterThanOrEqual(stuffedScore);
  });
});

describe('guardResults', () => {
  it('returns degraded flag when all results are filtered', () => {
    const results = [
      makeResult({ url: 'https://adult-site.xyz/supply-chain' }),
    ];
    const output = guardResults(results, 'supply chain');
    expect(output.passed).toBe(false);
    expect(output.reason).toBeDefined();
  });

  it('returns passed results sorted by quality', () => {
    const results = [
      makeResult({ url: 'https://reddit.com/r/supplychain', snippet: 'discussion' }),
      makeResult({ url: 'https://reuters.com/article', snippet: 'news report' }),
    ];
    const output = guardResults(results, 'supply chain');
    expect(output.passed).toBe(true);
    expect(output.results[0].url).toContain('reuters.com');
  });
});
