import { describe, it, expect } from 'vitest';
import { filterToolsByIntent, getToolFilterStats } from './tool-filter';
import type { Intent } from './fsm-types';

function mockTools(names: string[]) {
  return names.map((name) => ({
    name,
    description: `${name} description`,
    parameters: { type: 'object' as const, properties: {} },
  }));
}

describe('filterToolsByIntent', () => {
  const allTools = mockTools([
    'query_inventory',
    'query_cost',
    'query_suppliers',
    'query_logistics',
    'query_risk',
    'query_sales',
    'query_dashboard',
    'web_search',
    'create_note',
    'calculate_eoq',
    'query_tariff',
    'forecast_demand',
    'generate_chart',
    'query_warehouse_capacity',
    'create_transfer',
  ]);

  it('returns all relevant tools for supply_chain_data', () => {
    const filtered = filterToolsByIntent(allTools, 'supply_chain_data');
    expect(filtered.length).toBeGreaterThan(5);
    expect(filtered.find((t) => t.name === 'query_inventory')).toBeTruthy();
    expect(filtered.find((t) => t.name === 'web_search')).toBeTruthy();
  });

  it('returns empty array for chat_greeting', () => {
    const filtered = filterToolsByIntent(allTools, 'chat_greeting');
    expect(filtered.length).toBe(0);
  });

  it('returns only universal tools for general_knowledge', () => {
    const filtered = filterToolsByIntent(allTools, 'general_knowledge');
    const names = filtered.map((t) => t.name);
    expect(names).toContain('web_search');
    expect(names).toContain('query_dashboard');
    expect(names).not.toContain('query_inventory');
  });

  it('includes inventory tools for supply_chain_data', () => {
    const filtered = filterToolsByIntent(allTools, 'supply_chain_data');
    const names = filtered.map((t) => t.name);
    expect(names).toContain('query_inventory');
    expect(names).toContain('calculate_eoq');
    expect(names).toContain('query_warehouse_capacity');
  });

  it('includes supplier tools for supply_chain_knowledge', () => {
    const filtered = filterToolsByIntent(allTools, 'supply_chain_knowledge');
    const names = filtered.map((t) => t.name);
    expect(names).toContain('query_suppliers');
  });

  it('includes risk + logistics for news_event', () => {
    const filtered = filterToolsByIntent(allTools, 'news_event');
    const names = filtered.map((t) => t.name);
    expect(names).toContain('query_risk');
    expect(names).toContain('query_logistics');
    expect(names).not.toContain('calculate_eoq');
  });

  it('returns empty for unknown tool names', () => {
    const tools = mockTools(['some_unknown_tool']);
    const filtered = filterToolsByIntent(tools, 'supply_chain_data');
    expect(filtered.length).toBe(0);
  });

  it('handles opinion_recommendation with only universal tools', () => {
    const filtered = filterToolsByIntent(allTools, 'opinion_recommendation');
    const names = filtered.map((t) => t.name);
    expect(names).toContain('web_search');
    expect(names).toContain('query_dashboard');
    expect(names).not.toContain('query_cost');
    expect(names).not.toContain('query_inventory');
  });

  it('supply_chain_knowledge excludes market tools', () => {
    const filtered = filterToolsByIntent(allTools, 'supply_chain_knowledge');
    const names = filtered.map((t) => t.name);
    expect(names).toContain('query_suppliers');
    expect(names).toContain('query_inventory');
    expect(names).not.toContain('query_sales');
  });
});

describe('getToolFilterStats', () => {
  it('computes correct reduction percentage', () => {
    const allTools = mockTools(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
    const filtered = mockTools(['a', 'b', 'c']);
    const stats = getToolFilterStats(allTools, filtered, 'supply_chain_data');
    expect(stats.totalTools).toBe(10);
    expect(stats.filteredCount).toBe(3);
    expect(stats.reductionPercent).toBe(70);
  });

  it('returns 0% reduction when all tools pass through', () => {
    const allTools = mockTools(['a', 'b', 'c']);
    const stats = getToolFilterStats(allTools, allTools, 'supply_chain_data');
    expect(stats.totalTools).toBe(3);
    expect(stats.filteredCount).toBe(3);
    expect(stats.reductionPercent).toBe(0);
  });

  it('returns 100% reduction for chat_greeting', () => {
    const allTools = mockTools(['a', 'b', 'c']);
    const filtered: Array<{ name: string }> = [];
    const stats = getToolFilterStats(allTools, filtered, 'chat_greeting');
    expect(stats.totalTools).toBe(3);
    expect(stats.filteredCount).toBe(0);
    expect(stats.reductionPercent).toBe(100);
  });
});
