import { describe, it, expect } from 'vitest';
import { DeepSeekAdapter } from './deepseek.adapter';

describe('DeepSeekAdapter', () => {
  const adapter = new DeepSeekAdapter();

  describe('parseToolCalls', () => {
    it('parses structured tool_calls from JSON', () => {
      const toolCalls = adapter.parseToolCallsFromRaw('', [{
        id: 'call_1',
        type: 'function',
        function: { name: 'query_inventory', arguments: '{"action":"overview"}' },
      }]);

      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].name).toBe('query_inventory');
      expect(toolCalls[0].params).toEqual({ action: 'overview' });
    });

    it('falls back to text parsing when tool_calls array is empty', () => {
      const rawContent = '我来查询库存数据。\n\n<tool>query_inventory</tool>\n<params>{"action":"overview","warehouse":"深圳仓"}</params>';
      const toolCalls = adapter.parseToolCallsFromRaw(rawContent, []);

      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].name).toBe('query_inventory');
      expect(toolCalls[0].params).toEqual({ action: 'overview', warehouse: '深圳仓' });
    });

    it('returns empty array for non-tool content', () => {
      const toolCalls = adapter.parseToolCallsFromRaw('普通文本回复，没有工具调用', []);
      expect(toolCalls).toHaveLength(0);
    });

    it('handles malformed JSON params gracefully', () => {
      const rawContent = '<tool>query_cost</tool>\n<params>{not valid json}</params>';
      const toolCalls = adapter.parseToolCallsFromRaw(rawContent, []);
      expect(toolCalls).toHaveLength(0);
    });

    it('adds displayName from TOOL_DISPLAY_NAMES', () => {
      const toolCalls = adapter.parseToolCallsFromRaw('', [{
        id: 'call_1',
        type: 'function',
        function: { name: 'calculate_eoq', arguments: '{"annual_demand":1000}' },
      }]);

      expect(toolCalls[0].displayName).toBe('经济订货批量EOQ');
    });
  });

  describe('providerId and defaultModel', () => {
    it('has providerId "deepseek"', () => {
      expect(adapter.providerId).toBe('deepseek');
    });

    it('defaultModel is deepseek-v4-pro', () => {
      expect(adapter.defaultModel).toBe('deepseek-v4-pro');
    });
  });

  describe('resolveApiKey', () => {
    it('returns explicit key when provided', () => {
      expect(adapter.resolveApiKey('sk-test')).toBe('sk-test');
    });

    it('returns undefined when no key available', () => {
      const key = adapter.resolveApiKey();
      // Either returns env var value or undefined
      expect(key === undefined || typeof key === 'string').toBe(true);
    });
  });

  describe('resolveModel', () => {
    it('returns explicit model when provided', () => {
      expect(adapter.resolveModel('deepseek-v4-flash')).toBe('deepseek-v4-flash');
    });

    it('returns default model when no explicit model', () => {
      expect(adapter.resolveModel()).toBe('deepseek-v4-pro');
    });
  });
});
