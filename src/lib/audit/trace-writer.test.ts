// src/lib/audit/trace-writer.test.ts
import { describe, it, expect, vi } from 'vitest';
import { extractClaims } from './trace-writer';

// We only unit-test extractClaims -- writeTrace hits the DB and is tested via integration.
// Mock Prisma so the module can be imported without DB connection.
vi.mock('@/lib/db', () => ({
  db: { decisionTrace: { create: vi.fn().mockResolvedValue({ id: 'mock-id' }) } },
}));

describe('extractClaims', () => {
  it('extracts claims with Chinese confidence tags', () => {
    const text = '[claim-1] 当前库存65台 [T1-MCP][高]\n[claim-2] 预计缺货119台 [T1-MCP][中]';
    const claims = extractClaims(text);
    expect(claims).toHaveLength(2);
    expect(claims[0].text).toContain('库存65台');
    expect(claims[0].source).toBe('MCP');
    expect(claims[0].confidence).toBe('high');
    expect(claims[1].confidence).toBe('medium');
  });

  it('extracts claims with English confidence tags', () => {
    const text = '[claim-1] Inventory is 65 units [T1-MCP][high]';
    const claims = extractClaims(text);
    expect(claims[0].confidence).toBe('high');
    expect(claims[0].source).toBe('MCP');
  });

  it('returns empty array for text without claims', () => {
    expect(extractClaims('普通文本，没有声明标签')).toHaveLength(0);
  });

  it('handles KB source tag', () => {
    const claims = extractClaims('[claim-1] 数据来自知识库 [T2-KB][低]');
    expect(claims[0].source).toBe('KB');
    expect(claims[0].confidence).toBe('low');
  });

  it('handles Search and LLM source tags', () => {
    const text = '[claim-1] Web data [T3-Search][中]\n[claim-2] Model guess [T0-LLM][低]';
    const claims = extractClaims(text);
    expect(claims[0].source).toBe('Search');
    expect(claims[1].source).toBe('LLM');
  });

  it('defaults to LLM source and medium confidence when tags missing', () => {
    const claims = extractClaims('[claim-1] 没有标签的声明 text here');
    expect(claims[0].source).toBe('LLM');
    expect(claims[0].confidence).toBe('medium');
  });

  it('truncates long claim text to 500 chars', () => {
    const longText = 'x'.repeat(600);
    const claims = extractClaims(`[claim-1] ${longText} [T0-LLM][低]`);
    expect(claims[0].text.length).toBeLessThanOrEqual(500);
  });
});
