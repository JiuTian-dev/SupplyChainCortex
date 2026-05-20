import { describe, it, expect } from 'vitest';
import {
  parseToolCalls,
  stripToolCalls,
  formatToolResult,
} from './react-agent';

// ─────────────────────────────────────────────────────────────────────────────
// parseToolCalls
// ─────────────────────────────────────────────────────────────────────────────

describe('parseToolCalls', () => {
  it('parses a single valid tool call', () => {
    const text = `<tool>query_inventory</tool>\n<params>{"action": "overview"}</params>`;
    const result = parseToolCalls(text);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('query_inventory');
    expect(result[0].params).toEqual({ action: 'overview' });
  });

  it('parses multiple parallel tool calls', () => {
    const text = [
      '<tool>query_inventory</tool>',
      '<params>{"action": "overview"}</params>',
      '<tool>query_sales</tool>',
      '<params>{"action": "daily", "days": 30}</params>',
    ].join('\n');
    const result = parseToolCalls(text);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('query_inventory');
    expect(result[0].params).toEqual({ action: 'overview' });
    expect(result[1].name).toBe('query_sales');
    expect(result[1].params).toEqual({ action: 'daily', days: 30 });
  });

  it('skips tool calls with malformed JSON params', () => {
    const text = '<tool>query_inventory</tool>\n<params>{invalid json}</params>';
    const result = parseToolCalls(text);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when no tool call tags exist', () => {
    const text = 'This is a normal response without any tool calls.';
    expect(parseToolCalls(text)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseToolCalls('')).toEqual([]);
  });

  it('handles tool call with no params tag', () => {
    const text = '<tool>query_inventory</tool>\nJust some text';
    const result = parseToolCalls(text);
    expect(result).toHaveLength(0);
  });

  it('handles whitespace around tool name and params', () => {
    const text = '<tool>  query_inventory  </tool>\n<params>  {"action": "overview"}  </params>';
    const result = parseToolCalls(text);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('query_inventory');
  });

  it('parses tool calls with underscore names', () => {
    const text = '<tool>calculate_safety_stock</tool>\n<params>{"service_level": 0.95, "demand_std": 100, "lead_time_days": 14}</params>';
    const result = parseToolCalls(text);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('calculate_safety_stock');
    expect(result[0].params.service_level).toBe(0.95);
    expect(result[0].params.lead_time_days).toBe(14);
  });

  it('parses tool calls with nested params', () => {
    const text = '<tool>classify_abc_xyz</tool>\n<params>{"records": [{"sku": "A", "revenue": 100}, {"sku": "B", "revenue": 50}]}</params>';
    const result = parseToolCalls(text);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('classify_abc_xyz');
    expect(result[0].params.records).toHaveLength(2);
  });

  it('extracts only the last tool call when multiple have same name', () => {
    const text = [
      '<tool>query_inventory</tool><params>{"action": "overview"}</params>',
      '<tool>query_inventory</tool><params>{"action": "detail", "sku": "ABC"}</params>',
    ].join('\n');
    const result = parseToolCalls(text);
    expect(result).toHaveLength(2);
    expect(result[0].params).toEqual({ action: 'overview' });
    expect(result[1].params).toEqual({ action: 'detail', sku: 'ABC' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// stripToolCalls
// ─────────────────────────────────────────────────────────────────────────────

describe('stripToolCalls', () => {
  it('removes tool call tags and params', () => {
    const text = 'Some thinking\n<tool>query_inventory</tool>\n<params>{"action": "overview"}</params>\nMore text';
    const result = stripToolCalls(text);
    expect(result).not.toContain('<tool>');
    expect(result).not.toContain('<params>');
    expect(result).toContain('Some thinking');
    expect(result).toContain('More text');
  });

  it('removes multiple tool calls', () => {
    const text = [
      'Thought process...',
      '<tool>a</tool><params>{}</params>',
      'between text',
      '<tool>b</tool><params>{}</params>',
      'Final answer.',
    ].join('\n');
    const result = stripToolCalls(text);
    expect(result).not.toContain('<tool>');
    expect(result).toContain('Thought process...');
    expect(result).toContain('between text');
    expect(result).toContain('Final answer.');
  });

  it('returns trimmed empty string for pure tool call text', () => {
    const text = '<tool>query_inventory</tool>\n<params>{"action": "overview"}</params>';
    expect(stripToolCalls(text)).toBe('');
  });

  it('returns original text when no tool calls present', () => {
    const text = 'This is a final response with no tool calls.';
    expect(stripToolCalls(text)).toBe(text);
  });

  it('trims whitespace from result', () => {
    const text = '  \n<tool>a</tool><params>{}</params>\n  ';
    expect(stripToolCalls(text)).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatToolResult
// ─────────────────────────────────────────────────────────────────────────────

describe('formatToolResult', () => {
  it('formats query_inventory overview', () => {
    const result = formatToolResult('query_inventory', 'overview', {
      totalItems: 150,
      totalQuantity: 25000,
      lowStockAlerts: 8,
      avgTurnoverDays: 45,
    });
    expect(result).toContain('150');
    expect(result).toContain('25000');
    expect(result).toContain('8');
    expect(result).toContain('45');
  });

  it('formats query_inventory reorder', () => {
    const result = formatToolResult('query_inventory', 'reorder', {
      summary: { totalRecommendations: 12, urgentCount: 3, totalEstimatedCost: 50000 },
    });
    expect(result).toContain('12');
    expect(result).toContain('3');
    expect(result).toContain('50000');
  });

  it('formats query_sales overview', () => {
    const result = formatToolResult('query_sales', 'overview', {
      period: 'last-30-days',
      totalRevenue: 150000,
    });
    expect(result).toContain('last-30-days');
    expect(result).toContain('150000');
  });

  it('formats query_logistics stats', () => {
    const result = formatToolResult('query_logistics', 'stats', {
      totalShipments: 200,
      onTimeDeliveryRate: 92.5,
      highRiskCount: 10,
    });
    expect(result).toContain('200');
    expect(result).toContain('92.5');
    expect(result).toContain('10');
  });

  it('formats query_dashboard', () => {
    const result = formatToolResult('query_dashboard', 'summary', {
      totalProducts: 500,
      totalRevenue: 2500000,
      healthScore: 78,
    });
    expect(result).toContain('500');
    expect(result).toContain('2500000');
    expect(result).toContain('78');
  });

  it('formats query_risk', () => {
    const result = formatToolResult('query_risk', 'dashboard', {
      overallRisk: 65,
      riskLevel: 'medium',
    });
    expect(result).toContain('65');
    expect(result).toContain('medium');
  });

  it('formats query_exchange_rates with rates', () => {
    const result = formatToolResult('query_exchange_rates', 'latest', {
      base: 'CNY',
      rates: { USD: 0.14, EUR: 0.13, GBP: 0.11 },
    });
    expect(result).toContain('CNY');
    expect(result).toContain('USD: 0.14');
    expect(result).toContain('EUR: 0.13');
  });

  it('formats query_exchange_rates without rates', () => {
    const result = formatToolResult('query_exchange_rates', 'latest', { base: 'CNY' });
    expect(result).toContain('汇率查询完成');
  });

  it('formats query_weather with alerts', () => {
    const data = {
      activeAlerts: [
        { port: 'Shanghai', type: 'typhoon', severity: 'red' },
        { port: 'Rotterdam', type: 'fog', severity: 'yellow' },
      ],
    };
    const result = formatToolResult('query_weather', 'summary', data);
    expect(result).toContain('Shanghai');
    expect(result).toContain('Rotterdam');
    expect(result).toContain('typhoon');
  });

  it('formats query_weather without alerts', () => {
    const result = formatToolResult('query_weather', 'summary', { activeAlerts: [] });
    expect(result).toContain('港口天气: 所有港口海况正常');
  });

  it('formats web_search with context', () => {
    const result = formatToolResult('web_search', 'search', {
      source: 'google',
      formattedContext: 'Found 3 results about tariffs',
    });
    expect(result).toContain('google');
    expect(result).toContain('Found 3 results about tariffs');
  });

  it('formats query_cascade_risk default', () => {
    const data = { overallRisk: 72, affectedNodes: 15 };
    const result = formatToolResult('query_cascade_risk', 'auto', data);
    expect(result).toContain('72');
    expect(result).toContain('15');
  });

  it('formats query_carbon_price', () => {
    const result = formatToolResult('query_carbon_price', 'latest', { euaPrice: 85.5 });
    expect(result).toContain('85.5');
  });

  it('formats query_scfis', () => {
    const result = formatToolResult('query_scfis', 'latest', {
      index: 2850,
      estimatedFreightUSD: 3200,
      route: 'Shanghai→Europe',
    });
    expect(result).toContain('2850');
    expect(result).toContain('3200');
    expect(result).toContain('Shanghai→Europe');
  });

  it('formats adjust_inventory with adjustment', () => {
    const result = formatToolResult('adjust_inventory', 'update', {
      adjustment: {
        productName: 'Blender',
        adjustment: 10,
        previousQuantity: 50,
        newQuantity: 60,
      },
    });
    expect(result).toContain('Blender');
    expect(result).toContain('10');
    expect(result).toContain('50');
    expect(result).toContain('60');
  });

  it('formats adjust_inventory without adjustment', () => {
    const result = formatToolResult('adjust_inventory', 'update', {});
    expect(result).toContain('调整完成');
  });

  it('returns default message for null/undefined result', () => {
    expect(formatToolResult('query_inventory', 'overview', null)).toBe('查询完成，但没有找到相关数据。');
    expect(formatToolResult('query_inventory', 'overview', undefined)).toBe('查询完成，但没有找到相关数据。');
  });

  it('formats non-object result as no-data message', () => {
    expect(formatToolResult('query_inventory', 'overview', 'string result')).toBe('查询完成，但没有找到相关数据。');
    expect(formatToolResult('query_inventory', 'overview', 42)).toBe('查询完成，但没有找到相关数据。');
  });

  it('formats unknown tool with default JSON output', () => {
    const result = formatToolResult('unknown_tool', 'action', { key: 'value', nested: { a: 1 } });
    expect(result).toContain('查询完成');
    expect(result).toContain('key');
    expect(result).toContain('value');
  });
});
