/**
 * Tests for pure functions in web-search-cross-validator.ts
 *
 * extractClaim            — extracts factual claims from Chinese/English text
 * computeSourceAgreement  — computes token overlap agreement between claim and sources
 */
import { describe, it, expect } from 'vitest';
import { extractClaim, computeSourceAgreement } from './web-search-cross-validator';

// ─── extractClaim ──────────────────────────────────────────────────────────────────

describe('extractClaim', () => {
  it('extracts claims with percentage indicators from Chinese text', () => {
    const text = '根据最新数据，铜价上涨5%，达到每吨8500美元。市场分析人士认为供需失衡是主因。';
    const claims = extractClaim(text);
    expect(claims.length).toBeGreaterThanOrEqual(1);
    expect(claims.some(c => c.includes('5%'))).toBe(true);
  });

  it('extracts claims with year/date indicators from Chinese text', () => {
    const text = '2026年第一季度供应链成本下降3%。企业利润率有所回升。';
    const claims = extractClaim(text);
    expect(claims.some(c => c.includes('2026年'))).toBe(true);
  });

  it('ignores sentences without factual indicators', () => {
    const text = '供应链管理很重要。企业需要关注成本控制。市场需求在不断变化。';
    const claims = extractClaim(text);
    expect(claims).toHaveLength(0);
  });

  it('extracts claims with English factual indicators', () => {
    const text = 'The company announced a 15% increase in revenue. Supply chain costs decreased according to the report.';
    const claims = extractClaim(text);
    expect(claims.some(c => c.includes('announced'))).toBe(true);
  });

  it('returns empty array for short sentences (<= 10 chars after trim)', () => {
    const text = '铜价上涨。供需平衡。';
    const claims = extractClaim(text);
    expect(claims).toHaveLength(0);
  });

  it('limits to 5 claims maximum', () => {
    const text = Array.from({ length: 10 }, (_, i) =>
      `商品${i + 1}价格上涨${i + 1}%，达到${i + 1}000美元。`
    ).join('');
    const claims = extractClaim(text);
    expect(claims.length).toBeLessThanOrEqual(5);
  });

  it('extracts claims containing 关税/税率 keywords', () => {
    const text = '美国宣布对中国商品加征关税，税率提高至25%。此举将影响小家电出口。';
    const claims = extractClaim(text);
    expect(claims.some(c => c.includes('关税'))).toBe(true);
  });
});

// ─── computeSourceAgreement ────────────────────────────────────────────────────────

describe('computeSourceAgreement', () => {
  it('returns high agreement for matching sources with overlapping tokens', () => {
    const claim = '铜价2026年上涨5%达到每吨8500美元';
    const sources = [
      '2026年铜价上涨5%至每吨8500美元受供应影响',
      '铜价在2026年上涨5%达到8500美元每吨',
    ];
    const result = computeSourceAgreement(claim, sources);
    expect(result.score).toBeGreaterThan(0.3);
    expect(result.supportingSources).toBeGreaterThanOrEqual(1);
  });

  it('returns low agreement for non-matching sources', () => {
    const claim = '铜价2026年上涨5%达到每吨8500美元';
    const sources = [
      '今天天气晴空万里适合出行游玩',
      '股票市场今日收涨科技板块领涨',
    ];
    const result = computeSourceAgreement(claim, sources);
    expect(result.supportingSources).toBe(0);
  });

  it('returns score 0 and supportingSources 0 for empty sources', () => {
    const claim = '铜价上涨5%';
    const result = computeSourceAgreement(claim, []);
    expect(result.score).toBe(0);
    expect(result.supportingSources).toBe(0);
  });

  it('handles partial overlap where some sources agree and some do not', () => {
    const claim = '铝价下跌3%影响供应链成本';
    const sources = [
      '铝价下跌3%导致生产成本降低',
      '今天天气晴好公园游客增多',
    ];
    const result = computeSourceAgreement(claim, sources);
    expect(result.supportingSources).toBe(1);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(0.6);
  });

  it('returns score 0 when claim produces no tokens', () => {
    // Claim with just symbols/no meaning tokens - shouldn't happen in practice
    // but test the guard
    const claim = '!!! ??? ***';
    const sources = ['test source here'];
    const result = computeSourceAgreement(claim, sources);
    expect(result.score).toBe(0);
    expect(result.supportingSources).toBe(0);
  });

  it('detects numeric overlap (percentages, prices)', () => {
    const claim = '库存周转率提升15%达到45天';
    const sources = [
      '库存周转率15%提升至45天水平',
    ];
    const result = computeSourceAgreement(claim, sources);
    expect(result.score).toBeGreaterThan(0.3);
    expect(result.supportingSources).toBe(1);
  });
});
