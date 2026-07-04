/**
 * Hook System 单元测试。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { HookSystem, registerBuiltinHooks, resetHookSystem, getHookSystem } from '@/lib/agent/hooks';
import type { ToolResult } from '@/lib/agent/fsm-types';

describe('Hook System', () => {
  let hooks: HookSystem;

  beforeEach(() => {
    resetHookSystem();
    hooks = new HookSystem();
  });

  describe('注册与执行', () => {
    it('应注册并执行 beforeToolCall Hook', async () => {
      let called = false;
      hooks.registerBeforeToolCall('test', () => {
        called = true;
        return { action: 'allow' as const };
      });

      const result = await hooks.executeBeforeToolCall('query_inventory', {}, {
        round: 0,
        userInput: 'test',
        toolCalls: [],
        toolResults: [],
      });

      expect(called).toBe(true);
      expect(result.action).toBe('allow');
    });

    it('block 应阻止工具执行', async () => {
      hooks.registerBeforeToolCall('blocker', () => ({
        action: 'block' as const,
        message: '被阻止',
      }));

      const result = await hooks.executeBeforeToolCall('query_inventory', {}, {
        round: 0,
        userInput: 'test',
        toolCalls: [],
        toolResults: [],
      });

      expect(result.action).toBe('block');
      expect(result.message).toBe('被阻止');
    });

    it('modify 应修改参数', async () => {
      hooks.registerBeforeToolCall('modifier', (_name, params) => ({
        action: 'modify' as const,
        modifiedParams: { ...params, added: true },
      }));

      const result = await hooks.executeBeforeToolCall('query_inventory', { sku: '123' }, {
        round: 0,
        userInput: 'test',
        toolCalls: [],
        toolResults: [],
      });

      expect(result.action).toBe('modify');
      expect(result.modifiedParams).toEqual({ sku: '123', added: true });
    });

    it('应按优先级执行', async () => {
      const order: string[] = [];
      hooks.registerBeforeToolCall('low', () => {
        order.push('low');
        return { action: 'allow' as const };
      }, 10);
      hooks.registerBeforeToolCall('high', () => {
        order.push('high');
        return { action: 'allow' as const };
      }, 100);

      await hooks.executeBeforeToolCall('test', {}, {
        round: 0,
        userInput: '',
        toolCalls: [],
        toolResults: [],
      });

      expect(order).toEqual(['high', 'low']);
    });
  });

  describe('afterToolCall', () => {
    it('应执行 afterToolCall Hook', async () => {
      let called = false;
      hooks.registerAfterToolCall('test', () => {
        called = true;
        return { action: 'allow' as const };
      });

      const toolResult: ToolResult = {
        tool: 'query_inventory',
        success: true,
        data: { items: [] },
        latencyMs: 100,
      };

      await hooks.executeAfterToolCall('query_inventory', {}, toolResult, {
        round: 0,
        userInput: '',
        toolCalls: [],
        toolResults: [],
      });

      expect(called).toBe(true);
    });
  });

  describe('卸载与禁用', () => {
    it('应能卸载 Hook', async () => {
      let callCount = 0;
      const id = hooks.registerBeforeToolCall('test', () => {
        callCount++;
        return { action: 'allow' as const };
      });

      const ctx = { round: 0, userInput: '', toolCalls: [], toolResults: [] };
      await hooks.executeBeforeToolCall('test', {}, ctx);
      expect(callCount).toBe(1);

      const unregistered = hooks.unregister(id);
      expect(unregistered).toBe(true);

      await hooks.executeBeforeToolCall('test', {}, ctx);
      expect(callCount).toBe(1); // 不再增加
    });

    it('应能禁用/启用 Hook', async () => {
      let callCount = 0;
      const id = hooks.registerBeforeToolCall('test', () => {
        callCount++;
        return { action: 'allow' as const };
      });

      const ctx = { round: 0, userInput: '', toolCalls: [], toolResults: [] };

      hooks.setEnabled(id, false);
      await hooks.executeBeforeToolCall('test', {}, ctx);
      expect(callCount).toBe(0);

      hooks.setEnabled(id, true);
      await hooks.executeBeforeToolCall('test', {}, ctx);
      expect(callCount).toBe(1);
    });
  });

  describe('内置 Hook', () => {
    it('应注册内置 Hook', () => {
      const system = new HookSystem();
      registerBuiltinHooks(system);
      const stats = system.getStats();
      expect(stats.total).toBeGreaterThan(0);
    });

    it('array-param-normalizer 应将字符串转为数组', async () => {
      const system = new HookSystem();
      registerBuiltinHooks(system);

      const result = await system.executeBeforeToolCall(
        'batch_create_reorder',
        { items: '["SKU001","SKU002"]' },
        { round: 0, userInput: '', toolCalls: [], toolResults: [] },
      );

      expect(result.action).toBe('modify');
      expect(result.modifiedParams?.items).toEqual(['SKU001', 'SKU002']);
    });

    it('array-param-normalizer 应处理逗号分隔字符串', async () => {
      const system = new HookSystem();
      registerBuiltinHooks(system);

      const result = await system.executeBeforeToolCall(
        'batch_create_reorder',
        { items: 'SKU001,SKU002,SKU003' },
        { round: 0, userInput: '', toolCalls: [], toolResults: [] },
      );

      expect(result.action).toBe('modify');
      expect(result.modifiedParams?.items).toEqual(['SKU001', 'SKU002', 'SKU003']);
    });

    it('非数组参数工具应直接放行', async () => {
      const system = new HookSystem();
      registerBuiltinHooks(system);

      const result = await system.executeBeforeToolCall(
        'query_inventory',
        { action: 'overview' },
        { round: 0, userInput: '', toolCalls: [], toolResults: [] },
      );

      expect(result.action).toBe('allow');
    });
  });

  describe('单例', () => {
    it('getHookSystem 应返回单例', () => {
      resetHookSystem();
      const h1 = getHookSystem();
      const h2 = getHookSystem();
      expect(h1).toBe(h2);
    });

    it('单例应包含内置 Hook', () => {
      resetHookSystem();
      const h = getHookSystem();
      expect(h.getStats().total).toBeGreaterThan(0);
    });
  });

  describe('统计', () => {
    it('应返回正确的统计信息', () => {
      hooks.registerBeforeToolCall('a', () => ({ action: 'allow' as const }));
      hooks.registerAfterToolCall('b', () => ({ action: 'allow' as const }));

      const stats = hooks.getStats();
      expect(stats.beforeToolCall).toBe(1);
      expect(stats.afterToolCall).toBe(1);
      expect(stats.total).toBe(2);
    });

    it('listHooks 应列出所有 Hook', () => {
      hooks.registerBeforeToolCall('test-hook', () => ({ action: 'allow' as const }));
      const list = hooks.listHooks();
      expect(list.length).toBe(1);
      expect(list[0].name).toBe('test-hook');
      expect(list[0].type).toBe('beforeToolCall');
    });
  });
});
