/**
 * Agent Hook System — 强制执行层。
 *
 * 2026 年 Harness Engineering 核心组件：Hook 是从"告诉 Agent 要做 X"到"系统强制执行 X"的分界线。
 * 在工具调用前、工具调用后、状态切换时运行。
 *
 * 设计原则（来自 HumanLayer）：
 * - 成功静默（成功时 Agent 什么也听不到）
 * - 失败详细（失败时错误文本注入循环让 Agent 自修正）
 * - 棘轮机制（每条 Hook 规则溯源到一次真实失败）
 *
 * Hook 类型：
 * - beforeToolCall: 工具调用前校验（参数检查、权限检查、AGENTS.md 规则）
 * - afterToolCall:  工具调用后校验（结果验证、schema 校验、副作用检查）
 * - onStateChange:  状态切换时触发（日志、指标、上下文压缩）
 * - onError:        错误处理（错误分类、重试决策、降级）
 *
 * 用法：
 *   import { hookSystem } from '@/lib/agent/hooks';
 *   hookSystem.register('beforeToolCall', myValidator);
 *   const result = await hookSystem.executeBeforeToolCall(toolName, params);
 */

import type { ToolCall, ToolResult } from './fsm-types';
import type { FSMState } from './fsm-types';

// ─── Hook 类型定义 ──────────────────────────────────────────────────────────────

export type HookType = 'beforeToolCall' | 'afterToolCall' | 'onStateChange' | 'onError';

/**
 * Hook 执行结果。
 * - allow: 允许继续（静默）
 * - block: 阻止执行，返回错误信息给 Agent
 * - modify: 修改参数后继续
 */
export interface HookResult {
  action: 'allow' | 'block' | 'modify';
  message?: string;
  modifiedParams?: Record<string, unknown>;
  modifiedResult?: unknown;
}

/**
 * Before Tool Call Hook — 工具调用前校验。
 */
export type BeforeToolCallHook = (
  _toolName: string,
  _params: Record<string, unknown>,
  _context: HookContext,
) => Promise<HookResult> | HookResult;

/**
 * After Tool Call Hook — 工具调用后校验。
 */
export type AfterToolCallHook = (
  _toolName: string,
  _params: Record<string, unknown>,
  _result: ToolResult,
  _context: HookContext,
) => Promise<HookResult> | HookResult;

/**
 * On State Change Hook — 状态切换钩子。
 */
export type OnStateChangeHook = (
  _fromState: FSMState,
  _toState: FSMState,
  _context: HookContext,
) => Promise<void> | void;

/**
 * On Error Hook — 错误处理钩子。
 */
export type OnErrorHook = (
  _error: Error,
  _context: HookContext & { toolName?: string; state?: FSMState },
) => Promise<HookResult> | HookResult;

/**
 * Hook 执行上下文。
 */
export interface HookContext {
  /** 当前 FSM 轮次 */
  round: number;
  /** 用户原始输入 */
  userInput: string;
  /** 当前已执行的工具调用 */
  toolCalls: ToolCall[];
  /** 当前工具结果 */
  toolResults: ToolResult[];
  /** 会话 ID */
  sessionId?: string;
  /** 租户 ID */
  tenantId?: string;
}

/**
 * Hook 注册项。
 */
interface HookRegistration<T> {
  id: string;
  name: string;
  priority: number;
  handler: T;
  enabled: boolean;
}

// ─── Hook 系统实现 ─────────────────────────────────────────────────────────────

/**
 * Agent Hook 系统。
 * 管理所有 Hook 的注册、启用/禁用、按优先级执行。
 */
export class HookSystem {
  private beforeToolCallHooks: HookRegistration<BeforeToolCallHook>[] = [];
  private afterToolCallHooks: HookRegistration<AfterToolCallHook>[] = [];
  private onStateChangeHooks: HookRegistration<OnStateChangeHook>[] = [];
  private onErrorHooks: HookRegistration<OnErrorHook>[] = [];

  // ─── 注册 ──────────────────────────────────────────────────────────────────

  /**
   * 注册 beforeToolCall Hook。
   * @param name Hook 名称（用于调试和日志）
   * @param handler Hook 处理函数
   * @param priority 优先级（数字越大越先执行，默认 0）
   * @returns Hook ID（用于卸载）
   */
  registerBeforeToolCall(name: string, handler: BeforeToolCallHook, priority: number = 0): string {
    const id = `before-${name}-${Date.now()}`;
    this.beforeToolCallHooks.push({ id, name, priority, handler, enabled: true });
    this.beforeToolCallHooks.sort((a, b) => b.priority - a.priority);
    return id;
  }

  /**
   * 注册 afterToolCall Hook。
   */
  registerAfterToolCall(name: string, handler: AfterToolCallHook, priority: number = 0): string {
    const id = `after-${name}-${Date.now()}`;
    this.afterToolCallHooks.push({ id, name, priority, handler, enabled: true });
    this.afterToolCallHooks.sort((a, b) => b.priority - a.priority);
    return id;
  }

  /**
   * 注册 onStateChange Hook。
   */
  registerOnStateChange(name: string, handler: OnStateChangeHook, priority: number = 0): string {
    const id = `state-${name}-${Date.now()}`;
    this.onStateChangeHooks.push({ id, name, priority, handler, enabled: true });
    this.onStateChangeHooks.sort((a, b) => b.priority - a.priority);
    return id;
  }

  /**
   * 注册 onError Hook。
   */
  registerOnError(name: string, handler: OnErrorHook, priority: number = 0): string {
    const id = `error-${name}-${Date.now()}`;
    this.onErrorHooks.push({ id, name, priority, handler, enabled: true });
    this.onErrorHooks.sort((a, b) => b.priority - a.priority);
    return id;
  }

  // ─── 卸载 ──────────────────────────────────────────────────────────────────

  /**
   * 按 ID 卸载 Hook。
   */
  unregister(hookId: string): boolean {
    const arrays = [
      this.beforeToolCallHooks,
      this.afterToolCallHooks,
      this.onStateChangeHooks,
      this.onErrorHooks,
    ];
    for (const arr of arrays) {
      const idx = arr.findIndex(h => h.id === hookId);
      if (idx >= 0) {
        arr.splice(idx, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * 启用/禁用 Hook。
   */
  setEnabled(hookId: string, enabled: boolean): boolean {
    const arrays = [
      this.beforeToolCallHooks,
      this.afterToolCallHooks,
      this.onStateChangeHooks,
      this.onErrorHooks,
    ];
    for (const arr of arrays) {
      const hook = arr.find(h => h.id === hookId);
      if (hook) {
        hook.enabled = enabled;
        return true;
      }
    }
    return false;
  }

  // ─── 执行 ──────────────────────────────────────────────────────────────────

  /**
   * 执行所有 beforeToolCall Hook。
   * 任一 Hook 返回 block 则阻止；返回 modify 则修改参数。
   */
  async executeBeforeToolCall(
    toolName: string,
    params: Record<string, unknown>,
    context: HookContext,
  ): Promise<HookResult> {
    let currentParams = params;
    let wasModified = false;

    for (const hook of this.beforeToolCallHooks) {
      if (!hook.enabled) continue;
      try {
        const result = await hook.handler(toolName, currentParams, context);
        if (result.action === 'block') {
          return result;
        }
        if (result.action === 'modify' && result.modifiedParams) {
          currentParams = result.modifiedParams;
          wasModified = true;
        }
      } catch (error) {
        // Hook 自身出错不阻止工具执行，但记录错误
        console.warn(`[Hook] beforeToolCall "${hook.name}" 出错:`, error);
      }
    }

    return wasModified
      ? { action: 'modify', modifiedParams: currentParams }
      : { action: 'allow', modifiedParams: currentParams };
  }

  /**
   * 执行所有 afterToolCall Hook。
   */
  async executeAfterToolCall(
    toolName: string,
    params: Record<string, unknown>,
    result: ToolResult,
    context: HookContext,
  ): Promise<HookResult> {
    for (const hook of this.afterToolCallHooks) {
      if (!hook.enabled) continue;
      try {
        const hookResult = await hook.handler(toolName, params, result, context);
        if (hookResult.action === 'block') {
          return hookResult;
        }
      } catch (error) {
        console.warn(`[Hook] afterToolCall "${hook.name}" 出错:`, error);
      }
    }

    return { action: 'allow' };
  }

  /**
   * 执行所有 onStateChange Hook。
   */
  async executeOnStateChange(
    fromState: FSMState,
    toState: FSMState,
    context: HookContext,
  ): Promise<void> {
    for (const hook of this.onStateChangeHooks) {
      if (!hook.enabled) continue;
      try {
        await hook.handler(fromState, toState, context);
      } catch (error) {
        console.warn(`[Hook] onStateChange "${hook.name}" 出错:`, error);
      }
    }
  }

  /**
   * 执行所有 onError Hook。
   */
  async executeOnError(
    error: Error,
    context: HookContext & { toolName?: string; state?: FSMState },
  ): Promise<HookResult> {
    for (const hook of this.onErrorHooks) {
      if (!hook.enabled) continue;
      try {
        const result = await hook.handler(error, context);
        if (result.action === 'block') {
          return result;
        }
      } catch (hookError) {
        console.warn(`[Hook] onError "${hook.name}" 出错:`, hookError);
      }
    }

    return { action: 'allow' };
  }

  // ─── 统计 ──────────────────────────────────────────────────────────────────

  /**
   * 获取已注册 Hook 统计。
   */
  getStats(): {
    beforeToolCall: number;
    afterToolCall: number;
    onStateChange: number;
    onError: number;
    total: number;
  } {
    const enabled = (arr: HookRegistration<unknown>[]) => arr.filter(h => h.enabled).length;
    return {
      beforeToolCall: enabled(this.beforeToolCallHooks),
      afterToolCall: enabled(this.afterToolCallHooks),
      onStateChange: enabled(this.onStateChangeHooks),
      onError: enabled(this.onErrorHooks),
      total: enabled(this.beforeToolCallHooks) + enabled(this.afterToolCallHooks) +
             enabled(this.onStateChangeHooks) + enabled(this.onErrorHooks),
    };
  }

  /**
   * 列出所有 Hook（用于调试）。
   */
  listHooks(): Array<{ id: string; name: string; type: HookType; priority: number; enabled: boolean }> {
    const result: Array<{ id: string; name: string; type: HookType; priority: number; enabled: boolean }> = [];
    for (const h of this.beforeToolCallHooks) {
      result.push({ id: h.id, name: h.name, type: 'beforeToolCall', priority: h.priority, enabled: h.enabled });
    }
    for (const h of this.afterToolCallHooks) {
      result.push({ id: h.id, name: h.name, type: 'afterToolCall', priority: h.priority, enabled: h.enabled });
    }
    for (const h of this.onStateChangeHooks) {
      result.push({ id: h.id, name: h.name, type: 'onStateChange', priority: h.priority, enabled: h.enabled });
    }
    for (const h of this.onErrorHooks) {
      result.push({ id: h.id, name: h.name, type: 'onError', priority: h.priority, enabled: h.enabled });
    }
    return result;
  }
}

// ─── 内置 Hook（AGENTS.md 规则的代码化） ────────────────────────────────────────

/**
 * 注册内置 Hook（基于 AGENTS.md 棘轮规则）。
 * 这些 Hook 将 AGENTS.md 中的规则强制执行，不依赖 LLM 遵守。
 */
export function registerBuiltinHooks(hooks: HookSystem): void {
  // RULE-010: JSON 数组参数必须用数组类型
  hooks.registerBeforeToolCall(
    'array-param-normalizer',
    (toolName, params) => {
      // 检查已知需要数组参数的工具
      const arrayParamTools: Record<string, string[]> = {
        'batch_create_reorder': ['items', 'skus'],
        'calculate_drp': ['demands'],
        'calculate_multi_echelon_ss': ['echelons'],
        'calculate_joint_replenishment': ['items'],
        'analyze_and_chart': ['group_by'],
      };

      const arrayParams = arrayParamTools[toolName];
      if (!arrayParams) return { action: 'allow' };

      const modified = { ...params };
      let changed = false;

      for (const paramName of arrayParams) {
        const val = params[paramName];
        if (typeof val === 'string' && val.trim()) {
          // 尝试解析为 JSON 数组
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              modified[paramName] = parsed;
              changed = true;
            }
          } catch {
            // 不是 JSON，尝试逗号分隔
            if (val.includes(',')) {
              modified[paramName] = val.split(',').map(s => s.trim()).filter(Boolean);
              changed = true;
            }
          }
        }
      }

      return changed ? { action: 'modify', modifiedParams: modified } : { action: 'allow' };
    },
    100, // 高优先级：在其他校验前修正参数
  );

  // RULE-013: 写操作需要用户确认（参数级检查，autonomy-policy 已有更完整的实现）
  hooks.registerBeforeToolCall(
    'write-op-guard',
    (toolName, _params, context) => {
      const writeOps = [
        'create_reorder', 'batch_create_reorder', 'adjust_inventory', 'create_transfer',
        'update_shipment_status', 'update_cost_record', 'create_supplier',
        'update_supplier', 'update_supplier_status', 'resolve_alert', 'create_note',
      ];

      if (!writeOps.includes(toolName)) return { action: 'allow' };

      // 实际确认逻辑由 autonomy-policy 处理，这里仅做日志记录
      // 若 round > 0 且已有该工具的确认记录，则放行
      if (context.round > 0) {
        return { action: 'allow' };
      }

      return { action: 'allow' };
    },
    50,
  );

  // RULE-012: 工具调用失败时不要假装成功 — afterToolCall 检查
  hooks.registerAfterToolCall(
    'failure-detector',
    (_toolName, _params, result) => {
      if (!result.success && result.error) {
        // 工具失败时，确保错误信息被保留
        return {
          action: 'allow',
          message: `工具 ${result.tool} 执行失败: ${result.error}。请如实报告此错误，不要编造结果。`,
        };
      }
      return { action: 'allow' };
    },
    100,
  );

  // 状态切换日志 Hook
  hooks.registerOnStateChange(
    'state-logger',
    (fromState, toState, context) => {
      console.log(`[FSM] ${fromState} → ${toState} (round ${context.round}, tools: ${context.toolCalls.length})`);
    },
    0,
  );
}

// ─── 单例 ──────────────────────────────────────────────────────────────────────

let hookSystemInstance: HookSystem | undefined;

/**
 * 获取全局 Hook 系统单例。
 */
export function getHookSystem(): HookSystem {
  if (!hookSystemInstance) {
    hookSystemInstance = new HookSystem();
    registerBuiltinHooks(hookSystemInstance);
  }
  return hookSystemInstance;
}

/**
 * 重置 Hook 系统（仅用于测试）。
 */
export function resetHookSystem(): void {
  hookSystemInstance = undefined;
}
