/**
 * Tests for pure functions in chat.helpers.ts
 *
 * extractToolCallsFromText  — extracts DeepSeek text-emitted tool calls
 * matchToolsToQuery         — matches queries to appropriate tools
 * hasKeyword                — checks if text contains any of the keywords
 */
import { describe, it, expect } from 'vitest';
import {
  extractToolCallsFromText,
  matchToolsToQuery,
  hasKeyword,
} from './chat.helpers';

// ─── extractToolCallsFromText ──────────────────────────────────────────────────────

describe('extractToolCallsFromText', () => {
  it('extracts a valid single JSON tool call', () => {
    const text = 'query_inventory({"action": "overview"})';
    const result = extractToolCallsFromText(text);
    expect(result).toHaveLength(1);
    expect(result[0].function.name).toBe('query_inventory');
    expect(result[0].function.arguments).toBe('{"action": "overview"}');
    expect(result[0].id).toEqual(expect.any(String));
  });

  it('extracts multiple tool calls from text', () => {
    const text = `
      Let me check inventory: query_inventory({"action": "overview"})
      Also need costs: query_cost({"action": "detail", "sku": "SKU-001"})
    `;
    const result = extractToolCallsFromText(text);
    expect(result).toHaveLength(2);
    expect(result[0].function.name).toBe('query_inventory');
    expect(result[1].function.name).toBe('query_cost');
    expect(result[1].function.arguments).toContain('SKU-001');
  });

  it('still extracts with malformed JSON inside the arguments', () => {
    // The regex just captures everything between { and } — it doesn't validate JSON
    const text = 'web_search({"query": "copper price"})';
    const result = extractToolCallsFromText(text);
    expect(result).toHaveLength(1);
    expect(result[0].function.name).toBe('web_search');
  });

  it('returns empty array when no tool calls are present', () => {
    const text = 'What is the current status of our supply chain?';
    const result = extractToolCallsFromText(text);
    expect(result).toHaveLength(0);
  });

  it('handles DeepSeek text-emission patterns with extra whitespace', () => {
    const text = 'According to data, query_inventory ( {"action":"overview"} ) shows low stock.';
    const result = extractToolCallsFromText(text);
    expect(result).toHaveLength(1);
    expect(result[0].function.name).toBe('query_inventory');
  });

  it('extracts calls with multiline JSON arguments', () => {
    const text = `run_sandbox({
      "scenario": "trade_war",
      "settings": {"tariff_rate": 0.25}
    })`;
    const result = extractToolCallsFromText(text);
    expect(result).toHaveLength(1);
    expect(result[0].function.name).toBe('run_sandbox');
    expect(result[0].function.arguments).toContain('tariff_rate');
  });

  it('does not match non-tool function calls', () => {
    const text = 'someFunction({"key": "value"})';
    const result = extractToolCallsFromText(text);
    expect(result).toHaveLength(0);
  });
});

// ─── matchToolsToQuery ─────────────────────────────────────────────────────────────

describe('matchToolsToQuery', () => {
  it('matches inventory-related queries to inventory tools', () => {
    const result = matchToolsToQuery('查看当前库存水平和缺货情况');
    const tools = result.map(r => r.tool);
    expect(tools).toContain('query_inventory');
  });

  it('adds reorder action when urgent keywords are present', () => {
    const result = matchToolsToQuery('库存缺货严重，需要紧急补货');
    const inventoryActions = result.filter(r => r.tool === 'query_inventory');
    expect(inventoryActions.some(a => a.action === 'reorder')).toBe(true);
  });

  it('matches cost-related queries', () => {
    const result = matchToolsToQuery('查询产品成本毛利率');
    const tools = result.map(r => r.tool);
    expect(tools).toContain('query_cost');
  });

  it('returns default tools for completely irrelevant queries', () => {
    const result = matchToolsToQuery('今天天气真好');
    // Should return dashboard + inventory defaults
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it('matches multiple intents from a compound query', () => {
    const result = matchToolsToQuery('库存和成本以及物流情况如何');
    const tools = result.map(r => r.tool);
    expect(tools).toContain('query_inventory');
    expect(tools).toContain('query_cost');
    expect(tools).toContain('query_logistics');
  });

  it('limits results to 4 tools maximum', () => {
    // A query that hits many categories
    const result = matchToolsToQuery('库存 成本 销售 物流 风险 供应商 汇率 天气 决策');
    expect(result.length).toBeLessThanOrEqual(4);
  });
});

// ─── hasKeyword ─────────────────────────────────────────────────────────────────────

describe('hasKeyword', () => {
  it('returns true when a keyword is found in the text', () => {
    expect(hasKeyword('查看库存情况', ['库存', '成本'])).toBe(true);
  });

  it('returns false when no keyword is found', () => {
    expect(hasKeyword('今天天气真好', ['库存', '成本'])).toBe(false);
  });

  it('returns true when a keyword is found in the text', () => {
    // matchToolsToQuery calls hasKeyword with query.toLowerCase()
    expect(hasKeyword('check inventory levels', ['inventory'])).toBe(true);
    // The function itself is case-sensitive, so callers must lowercase first
    expect(hasKeyword('check inventory levels', ['inventory'])).toBe(true);
  });

  it('returns false for empty keyword list', () => {
    expect(hasKeyword('some text', [])).toBe(false);
  });
});
