/**
 * Tests for pure functions in web-search-guard.ts
 *
 * scoreResultQuality  — scores individual search result quality (0-1)
 * checkLanguageMatch   — checks if text matches target language
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SearchResult } from './web-search.service';
import { scoreResultQuality, checkLanguageMatch } from './web-search-guard';

// ─── scoreResultQuality ────────────────────────────────────────────────────────────

describe('scoreResultQuality', () => {
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

  it('returns baseline score of 0.5 for a minimal valid result', () => {
    const result = makeResult({
      title: 'Test Result',
      url: 'https://example.com/page',
      snippet: 'A reasonable snippet with enough content to analyze.',
    });
    const score = scoreResultQuality(result, 'test');
    // Baseline 0.5 + HTTPS 0.05 = 0.55
    expect(score).toBeGreaterThanOrEqual(0.50);
    expect(score).toBeLessThanOrEqual(0.60);
  });

  it('boosts high-authority domains (reuters.com)', () => {
    const result = makeResult({
      title: 'Market Report',
      url: 'https://reuters.com/article/markets',
      snippet: 'Financial market report with detailed analysis of supply chain impacts.',
    });
    const score = scoreResultQuality(result, 'markets');
    // Baseline 0.5 + HTTPS 0.05 + Authority 0.30 = 0.85
    expect(score).toBeGreaterThan(0.8);
  });

  it('penalizes low-authority domains (reddit.com)', () => {
    const result = makeResult({
      title: 'Random thought',
      url: 'https://reddit.com/r/supplychain',
      snippet: 'Some user opinion about supply chain.',
    });
    const score = scoreResultQuality(result, 'supply chain');
    // Baseline 0.5 + HTTPS 0.05 + Penalty -0.20 = 0.35
    expect(score).toBeLessThan(0.4);
    expect(score).toBeGreaterThanOrEqual(0.3);
  });

  it('penalizes keyword stuffing in the title', () => {
    const result = makeResult({
      title: 'buy cheap buy cheap buy cheap buy cheap buy',
      url: 'https://example.com/spam',
      snippet: 'A normal length snippet for testing purposes here.',
    });
    const score = scoreResultQuality(result, 'buy');
    // Baseline 0.5 + HTTPS 0.05 + Keyword stuffing -0.20 = 0.35
    expect(score).toBeLessThan(0.4);
  });

  it('rewards long snippets (100+ chars)', () => {
    const result = makeResult({
      title: 'Normal Title',
      url: 'https://example.com/article',
      snippet: 'A'.repeat(120),
    });
    const score = scoreResultQuality(result, 'test');
    // Baseline 0.5 + HTTPS 0.05 + Long snippet 0.05 = 0.60
    expect(score).toBeGreaterThan(0.55);
  });

  it('penalizes missing or very short snippets (< 20 chars)', () => {
    const result = makeResult({
      title: 'Short Snippet',
      url: 'https://example.com/page',
      snippet: 'Short.',
    });
    const score = scoreResultQuality(result, 'test');
    // Baseline 0.5 + HTTPS 0.05 + Short snippet -0.10 = 0.45
    expect(score).toBeLessThan(0.5);
  });

  it('rewards HTTPS URLs', () => {
    const httpResult = makeResult({
      title: 'HTTP Page',
      url: 'http://example.com/page',
      snippet: 'A reasonable snippet with enough content to analyze.',
    });
    const httpsResult = makeResult({
      title: 'HTTPS Page',
      url: 'https://example.com/page',
      snippet: 'A reasonable snippet with enough content to analyze.',
    });
    const httpScore = scoreResultQuality(httpResult, 'test');
    const httpsScore = scoreResultQuality(httpsResult, 'test');
    expect(httpsScore).toBeGreaterThan(httpScore);
  });

  it('rewards fresh content published within the last 7 days', () => {
    const result = makeResult({
      title: 'Breaking News',
      url: 'https://reuters.com/article/breaking',
      snippet: 'Breaking news story with important details for the supply chain.',
      publishedAt: '2026-05-18T00:00:00Z', // 1 day ago
    });
    const score = scoreResultQuality(result, 'news');
    // Baseline 0.5 + HTTPS 0.05 + Authority 0.30 + Freshness 0.10 = 0.95
    expect(score).toBeGreaterThan(0.9);
  });

  it('clamps score to be within [0, 1] range', () => {
    // Create a result that would get a very high score
    const perfect = makeResult({
      title: 'Perfect Article',
      url: 'https://reuters.com/article/perfect',
      snippet: 'A'.repeat(120),
      publishedAt: '2026-05-18T00:00:00Z',
    });
    const score = scoreResultQuality(perfect, 'perfect');
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('handles invalid URL gracefully by returning baseline', () => {
    const result = makeResult({
      title: 'Bad URL',
      url: 'not-a-valid-url',
      snippet: 'Some snippet with enough content to analyze.',
    });
    const score = scoreResultQuality(result, 'test');
    expect(score).toBe(0.5); // baseline only, no HTTPS bonus
  });
});

// ─── checkLanguageMatch ────────────────────────────────────────────────────────────

describe('checkLanguageMatch', () => {
  it('returns true for auto language target regardless of content', () => {
    expect(checkLanguageMatch('任何内容都可以', 'auto')).toBe(true);
    expect(checkLanguageMatch('English only', 'auto')).toBe(true);
    expect(checkLanguageMatch('', 'auto')).toBe(true);
  });

  it('returns true for Chinese text with zh target', () => {
    expect(checkLanguageMatch('供应链管理非常重要', 'zh')).toBe(true);
  });

  it('returns false for English-only text with zh target', () => {
    expect(checkLanguageMatch('Supply chain management is important', 'zh')).toBe(false);
  });

  it('returns true for English text with en target', () => {
    expect(checkLanguageMatch('Supply chain management is critical', 'en')).toBe(true);
  });

  it('returns false for Chinese-only text with en target', () => {
    expect(checkLanguageMatch('供应链管理非常重要', 'en')).toBe(false);
  });

  it('returns true for mixed Chinese/English content with zh target', () => {
    expect(checkLanguageMatch('供应链 management 非常重要', 'zh')).toBe(true);
  });

  it('passes through ambiguous text (no Chinese, no English) for zh target', () => {
    // Text with only numbers and symbols — no CJK, no English
    expect(checkLanguageMatch('12345 !!! ???', 'zh')).toBe(true);
  });

  it('passes through ambiguous text (no Chinese, no English) for en target', () => {
    expect(checkLanguageMatch('12345 !!! ???', 'en')).toBe(true);
  });
});
