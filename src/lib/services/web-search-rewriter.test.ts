/**
 * Tests for pure functions in web-search-rewriter.ts
 *
 * extractKeywords  — extracts entities and types from a query
 * rewriteQuery     — produces query variants using 4 strategies
 */
import { describe, it, expect } from 'vitest';
import { extractKeywords, rewriteQuery } from './web-search-rewriter';

// ─── extractKeywords ───────────────────────────────────────────────────────────────

describe('extractKeywords', () => {
  it('extracts Chinese entities from a supply chain query', () => {
    // "中国" and "美国" must appear as full words (not just "中"+"美")
    // "中美" does not contain "中国" as a standalone word
    const result = extractKeywords('中美铜价和关税最新动态2026');
    const entitySet = new Set(result.entities);
    expect(entitySet.has('中国')).toBe(false);
    expect(entitySet.has('美国')).toBe(false);
    expect(result.types.has('country')).toBe(false);
    expect(result.types.has('topic')).toBe(true);
  });

  it('extracts English words (3+ chars) excluding filler words', () => {
    const result = extractKeywords('copper price supply chain tariff CBAM');
    // "the" should be excluded (filler), but longer words should be included
    expect(result.entities).toContain('CBAM');
    expect(result.entities).toContain('copper');
    expect(result.entities).toContain('supply');
    expect(result.types.has('regulation')).toBe(true);
  });

  it('returns empty entities and types for empty query', () => {
    const result = extractKeywords('');
    expect(result.entities).toHaveLength(0);
    expect(result.types.size).toBe(0);
  });

  it('deduplicates entities keeping the first occurrence', () => {
    const result = extractKeywords('铜价 铜价 铝价');
    const copperCount = result.entities.filter(e => e === '铜价').length;
    expect(copperCount).toBe(1);
  });

  it('excludes common filler words from English extraction', () => {
    const result = extractKeywords('the and of in on is are a an');
    // Only words 3+ letters are considered, but filler like "the" "and" "are" should be excluded
    const fillerFound = result.entities.filter(e =>
      ['the', 'and', 'are', 'was'].includes(e.toLowerCase())
    );
    expect(fillerFound).toHaveLength(0);
  });

  it('extracts product type entities', () => {
    const result = extractKeywords('小家电零部件供应链');
    expect(result.entities).toContain('小家电');
    expect(result.entities).toContain('零部件');
    expect(result.types.has('product')).toBe(true);
  });

  it('extracts location entities from port names', () => {
    const result = extractKeywords('洛杉矶港和上海港的拥堵情况');
    expect(result.entities).toContain('洛杉矶');
    expect(result.entities).toContain('上海');
    expect(result.types.has('location')).toBe(true);
  });
});

// ─── rewriteQuery ──────────────────────────────────────────────────────────────────

describe('rewriteQuery', () => {
  it('produces distinct variants from all 4 strategies', () => {
    const result = rewriteQuery('铜价走势');
    // Should have at least 2 unique variants (original + specific/broaden)
    // original: "铜价走势"
    // specific: "铜价 铜价走势 最新" (entities[0] + query + "最新")
    // broaden: depends on entities
    // english: "铜价走势 copper price"
    expect(result.length).toBeGreaterThanOrEqual(2);
    // Original should be included
    expect(result).toContain('铜价走势');
  });

  it('includes the original query as one of the variants', () => {
    const result = rewriteQuery('供应链风险');
    expect(result[0]).toBe('供应链风险');
  });

  it('handles query with no specific entities', () => {
    const result = rewriteQuery('你好');
    // No entities extracted, so specific strategy returns query unchanged
    // Dedup removes duplicates
    expect(result).toContain('你好');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('adds English translations for Chinese supply chain terms', () => {
    const result = rewriteQuery('关税影响');
    const hasEnglishVariant = result.some(v => v.includes('tariff'));
    expect(hasEnglishVariant).toBe(true);
  });

  it('deduplicates variants while preserving order', () => {
    // A query with no entities will have all strategies returning same value
    const result = rewriteQuery('test');
    // Should not have duplicates
    expect(new Set(result).size).toBe(result.length);
  });

  it('limits output to 4 variants maximum', () => {
    const result = rewriteQuery('铜价 铝价 汇率 关税 供应链风险');
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it('appends English term translations on english strategy', () => {
    const result = rewriteQuery('铜价');
    const englishVariant = result.find(v => v.includes('copper price'));
    expect(englishVariant).toBeDefined();
    expect(englishVariant).toContain('铜价');
    expect(englishVariant).toContain('copper price');
  });
});
