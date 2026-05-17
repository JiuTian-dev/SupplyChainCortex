// src/lib/services/__tests__/web-search-rewriter.test.ts
import { describe, it, expect } from 'vitest';
import { rewriteQuery, injectContext, extractKeywords, type ConversationTurn } from '../web-search-rewriter';

describe('extractKeywords', () => {
  it('extracts Chinese supply chain entities', () => {
    const result = extractKeywords('中国家电出口美国 301关税 最新政策 2026');
    expect(result.entities).toContain('中国');
    expect(result.entities).toContain('美国');
    expect(result.entities).toContain('家电');
    expect(result.entities).toContain('301');
    expect(result.entities).toContain('关税');
  });

  it('extracts mixed Chinese-English terms', () => {
    const result = extractKeywords('CBAM carbon tariff 对欧盟小家电出口影响');
    expect(result.entities).toContain('CBAM');
    expect(result.entities).toContain('欧盟');
  });

  it('returns empty for short query', () => {
    const result = extractKeywords('你好');
    expect(result.entities.length).toBe(0);
  });
});

describe('injectContext', () => {
  it('injects entities from previous conversation turns', () => {
    const history: ConversationTurn[] = [
      { role: 'user', content: '我们在越南海防有工厂吗' },
      { role: 'assistant', content: '是的，海防工厂主要生产小家电' },
    ];
    const result = injectContext('那边的关税怎么算', history, 2);
    expect(result.startsWith('越南')).toBe(true);
    expect(result).toContain('海防');
  });

  it('returns original query if history has no entities', () => {
    const history: ConversationTurn[] = [
      { role: 'user', content: '你好' },
    ];
    const result = injectContext('今天天气怎么样', history, 2);
    expect(result).toBe('今天天气怎么样');
  });

  it('caps entities to maxContextTerms', () => {
    const history: ConversationTurn[] = [
      { role: 'user', content: '中国 美国 越南 欧盟 日本 韩国 印度 巴西 德国 法国' },
    ];
    const result = injectContext('关税政策', history, 3);
    const addedTerms = result.split(' ').length - '关税政策'.split(' ').length;
    expect(addedTerms).toBeLessThanOrEqual(3);
  });
});

describe('rewriteQuery', () => {
  it('generates multiple search variants', () => {
    const variants = rewriteQuery('小家电出口关税影响');
    expect(variants.length).toBeGreaterThanOrEqual(2);
    expect(variants.length).toBeLessThanOrEqual(5);
    // Each variant should be different from the original
    variants.forEach(v => {
      expect(v.length).toBeGreaterThanOrEqual(5);
    });
  });

  it('includes the original query as one variant', () => {
    const variants = rewriteQuery('供应链风险');
    const hasOriginal = variants.some(v => v.includes('供应链') && v.includes('风险'));
    expect(hasOriginal).toBe(true);
  });
});
