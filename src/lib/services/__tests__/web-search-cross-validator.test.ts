// src/lib/services/__tests__/web-search-cross-validator.test.ts
import { describe, it, expect } from 'vitest';
import { crossValidate, extractClaim, computeSourceAgreement } from '../web-search-cross-validator';
import type { SearchResult } from '../web-search.service';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    title: 'Test Result',
    url: 'https://example.com/article',
    snippet: 'Supply chain analysis.',
    ...overrides,
  };
}

describe('extractClaim', () => {
  it('extracts factual claims about tariffs', () => {
    const claims = extractClaim('The US imposed 25% tariff on Chinese home appliances in 2026.');
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.some(c => c.includes('tariff') || c.includes('US') || c.includes('25%'))).toBe(true);
  });

  it('handles Chinese text', () => {
    const claims = extractClaim('美国在2026年对中国家电加征25%关税。');
    expect(claims.length).toBeGreaterThan(0);
  });

  it('returns empty for non-factual text', () => {
    const claims = extractClaim('Hello world. How are you today?');
    expect(claims.length).toBe(0);
  });
});

describe('computeSourceAgreement', () => {
  it('returns high agreement for similar claims from different sources', () => {
    const claim = 'US tariff 25% on Chinese appliances';
    const sources = [
      'US imposes 25% tariff on Chinese home appliances',
      '25% tariff rate applied to Chinese appliance imports to US',
      'The tariff rate is 25% for Chinese appliance exports',
    ];
    const agreement = computeSourceAgreement(claim, sources);
    expect(agreement.score).toBeGreaterThan(0.5);
    expect(agreement.supportingSources).toBeGreaterThanOrEqual(2);
  });

  it('returns low agreement for contradictory sources', () => {
    const claim = 'US tariff 25% on Chinese appliances';
    const sources = [
      'Chocolate chip cookies are delicious',
      'The weather is sunny today',
    ];
    const agreement = computeSourceAgreement(claim, sources);
    expect(agreement.score).toBeLessThan(0.3);
  });
});

describe('crossValidate', () => {
  it('flags results with low source agreement', () => {
    const results = [
      makeResult({ url: 'https://reuters.com', snippet: 'US imposes 25% tariff on Chinese appliances' }),
      makeResult({ url: 'https://bloomberg.com', snippet: 'Tariff rate for Chinese appliances set at 25%' }),
      makeResult({ url: 'https://random-blog.xyz', snippet: 'Aliens caused the tariff increase' }),
    ];
    const verified = crossValidate(results, 'US China tariff rate');
    expect(verified.sourceCount).toBeGreaterThanOrEqual(1);
  });

  it('handles empty results', () => {
    const verified = crossValidate([], 'anything');
    expect(verified.sourceCount).toBe(0);
    expect(verified.confidence).toBe('low');
  });
});
