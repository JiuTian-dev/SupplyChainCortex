/**
 * Policy-as-Code Bounded Autonomy Framework.
 *
 * Defines what the AI agent can execute autonomously vs. what requires
 * human confirmation. Implements the 2026 "graduated autonomy" pattern:
 *
 *   Stage 1 — Assisted:  Agent recommends with rationale
 *   Stage 2 — Automated:  Agent executes within policy guardrails
 *   Stage 3 — Autonomous: Agent executes end-to-end (future)
 *
 * Each MCP tool is classified into an autonomy level with optional
 * value limits and daily rate caps.
 */

// ─── Types ───────────────────────────────────────────────────────────────────────

export type AutonomyLevel = 'auto' | 'confirm' | 'forbid';

export interface ToolPolicy {
  /** Autonomy level for this tool */
  level: AutonomyLevel;
  /** Max auto-executions per day (only for 'auto' level) */
  maxDaily: number;
  /** Max monetary value affected per execution, in CNY (only for 'auto') */
  valueLimit?: number;
  /** Human-readable description of why this policy exists */
  rationale: string;
}

export interface AutonomyPolicy {
  version: string;
  tools: Record<string, ToolPolicy>;
  defaults: {
    /** Default level for tools not explicitly listed */
    unknownTool: AutonomyLevel;
    /** Max total auto-executions per day across all tools */
    globalDailyLimit: number;
  };
  alerts: {
    /** Whether agent can auto-send notifications */
    autoNotify: boolean;
    /** Whether agent can auto-create reorder orders */
    autoCreateReorder: boolean;
    /** Max reorder value that can be auto-created (CNY) */
    reorderValueLimit: number;
  };
}

// ─── Default Policy ──────────────────────────────────────────────────────────────

/**
 * Default policy for SMB cross-border e-commerce supply chain.
 * Conservative: read-only ops are auto, write ops require confirmation,
 * dangerous ops are forbidden.
 */
export const DEFAULT_POLICY: AutonomyPolicy = {
  version: '1.0.0',
  tools: {
    // ── Read-only queries — always auto ──────────────────────────────────────
    query_inventory:       { level: 'auto', maxDaily: Infinity, rationale: '只读查询，无副作用' },
    query_cost:            { level: 'auto', maxDaily: Infinity, rationale: '只读查询，无副作用' },
    query_sales:           { level: 'auto', maxDaily: Infinity, rationale: '只读查询，无副作用' },
    query_logistics:       { level: 'auto', maxDaily: Infinity, rationale: '只读查询，无副作用' },
    query_suppliers:       { level: 'auto', maxDaily: Infinity, rationale: '只读查询，无副作用' },
    query_dashboard:       { level: 'auto', maxDaily: Infinity, rationale: '只读查询，无副作用' },
    query_risk:            { level: 'auto', maxDaily: Infinity, rationale: '只读查询，无副作用' },
    query_exchange_rates:  { level: 'auto', maxDaily: Infinity, rationale: '只读查询，无副作用' },
    query_weather:         { level: 'auto', maxDaily: Infinity, rationale: '只读查询，无副作用' },
    query_tariff:          { level: 'auto', maxDaily: Infinity, rationale: '只读查询，无副作用' },
    query_cascade_risk:    { level: 'auto', maxDaily: Infinity, rationale: '只读分析，无副作用' },
    query_decision_graph:  { level: 'auto', maxDaily: Infinity, rationale: '只读分析，无副作用' },
    query_analytics:       { level: 'auto', maxDaily: Infinity, rationale: '只读分析，无副作用' },
    query_commodities:     { level: 'auto', maxDaily: Infinity, rationale: '外部数据查询，无副作用' },
    query_scfis:           { level: 'auto', maxDaily: Infinity, rationale: '外部数据查询，无副作用' },
    query_carbon_price:    { level: 'auto', maxDaily: Infinity, rationale: '外部数据查询，无副作用' },
    query_cpsc_recalls:    { level: 'auto', maxDaily: Infinity, rationale: '外部数据查询，无副作用' },
    query_port_congestion: { level: 'auto', maxDaily: Infinity, rationale: '外部数据查询，无副作用' },
    query_financial_index: { level: 'auto', maxDaily: Infinity, rationale: '外部数据查询，无副作用' },

    // ── Simulation & workflow — auto (no side effects) ────────────────────────
    execute_workflow:      { level: 'auto', maxDaily: 50, rationale: '工作流执行，结果仅展示' },
    run_sandbox:           { level: 'auto', maxDaily: 30, rationale: '仿真模拟，无实际业务影响' },

    // ── Search — auto with rate limit ─────────────────────────────────────────
    web_search:            { level: 'auto', maxDaily: 50, rationale: '联网搜索，需控制API成本' },

    // ── Write operations — require confirmation ───────────────────────────────
    create_reorder: {
      level: 'confirm',
      maxDaily: 20,
      valueLimit: 5000,
      rationale: '创建补货订单涉及实际采购成本，需人工确认金额和数量',
    },
    adjust_inventory: {
      level: 'confirm',
      maxDaily: 10,
      rationale: '库存调整影响财务报表，需人工确认',
    },
    create_note: {
      level: 'auto',
      maxDaily: 50,
      rationale: '创建备注无业务风险，可自动执行',
    },
    update_shipment_status: {
      level: 'confirm',
      maxDaily: 20,
      rationale: '更新货运状态影响物流跟踪和客户通知，需确认',
    },
  },

  defaults: {
    unknownTool: 'confirm',    // unknown tools default to confirm (safe)
    globalDailyLimit: 200,     // max 200 total auto-executions per day
  },

  alerts: {
    autoNotify: true,
    autoCreateReorder: false,
    reorderValueLimit: 3000,
  },
};

// ─── Policy Engine ───────────────────────────────────────────────────────────────

class AutonomyPolicyEngine {
  private policy: AutonomyPolicy;
  private dailyCounts: Map<string, number> = new Map();
  private dayStamp: string = new Date().toISOString().split('T')[0];

  constructor(policy: AutonomyPolicy = DEFAULT_POLICY) {
    this.policy = policy;
  }

  /** Reset daily counters if day changed */
  private checkDayRollover(): void {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.dayStamp) {
      this.dailyCounts.clear();
      this.dayStamp = today;
    }
  }

  /** Get policy for a specific tool */
  getToolPolicy(toolName: string): ToolPolicy {
    return this.policy.tools[toolName] || {
      level: this.policy.defaults.unknownTool,
      maxDaily: 10,
      rationale: '未在策略中显式定义的工具，默认需确认',
    };
  }

  /**
   * Check if a tool can be auto-executed.
   * Returns { allowed, reason }.
   */
  checkExecution(
    toolName: string,
    params: Record<string, unknown>,
  ): { allowed: boolean; level: AutonomyLevel; reason: string } {
    this.checkDayRollover();

    const toolPolicy = this.getToolPolicy(toolName);

    // Forbid always blocks
    if (toolPolicy.level === 'forbid') {
      return {
        allowed: false,
        level: 'forbid',
        reason: `工具 ${toolName} 被策略禁止自动执行: ${toolPolicy.rationale}`,
      };
    }

    // Confirm always requires human approval
    if (toolPolicy.level === 'confirm') {
      return {
        allowed: false,
        level: 'confirm',
        reason: `工具 ${toolName} 需要人工确认后执行`,
      };
    }

    // Auto — check rate limits
    const currentCount = this.dailyCounts.get(toolName) || 0;

    if (currentCount >= toolPolicy.maxDaily) {
      return {
        allowed: false,
        level: 'confirm',
        reason: `工具 ${toolName} 已达每日自动执行上限 (${toolPolicy.maxDaily}次)`,
      };
    }

    // Global limit
    let globalTotal = 0;
    for (const count of this.dailyCounts.values()) {
      globalTotal += count;
    }
    if (globalTotal >= this.policy.defaults.globalDailyLimit) {
      return {
        allowed: false,
        level: 'confirm',
        reason: `全局每日自动执行上限已达 (${this.policy.defaults.globalDailyLimit}次)`,
      };
    }

    // Value limit check
    if (toolPolicy.valueLimit && params.value) {
      const value = typeof params.value === 'number' ? params.value :
        typeof params.quantity === 'number' ? params.quantity : 0;
      if (value > toolPolicy.valueLimit) {
        return {
          allowed: false,
          level: 'confirm',
          reason: `操作涉及金额 ¥${value}，超过自动执行限额 ¥${toolPolicy.valueLimit}`,
        };
      }
    }

    return {
      allowed: true,
      level: 'auto',
      reason: '策略允许自动执行',
    };
  }

  /** Record a successful auto-execution */
  recordExecution(toolName: string): void {
    this.checkDayRollover();
    this.dailyCounts.set(toolName, (this.dailyCounts.get(toolName) || 0) + 1);
  }

  /** Get current daily stats */
  getDailyStats(): { globalTotal: number; byTool: Record<string, number> } {
    this.checkDayRollover();
    let globalTotal = 0;
    const byTool: Record<string, number> = {};
    for (const [tool, count] of this.dailyCounts) {
      byTool[tool] = count;
      globalTotal += count;
    }
    return { globalTotal, byTool };
  }

  /** Update policy at runtime (e.g., from admin panel) */
  updatePolicy(partial: Partial<AutonomyPolicy>): void {
    this.policy = { ...this.policy, ...partial, version: `${Date.now()}` };
  }

  /** Get the full policy */
  getPolicy(): Readonly<AutonomyPolicy> {
    return this.policy;
  }

  /** Build a confirmation prompt for the frontend */
  buildConfirmationCard(
    toolName: string,
    params: Record<string, unknown>,
    reason: string,
  ): {
    title: string;
    description: string;
    toolName: string;
    params: Record<string, unknown>;
    riskLevel: 'low' | 'medium' | 'high';
    confirmLabel: string;
    cancelLabel: string;
  } {
    const toolPolicy = this.getToolPolicy(toolName);

    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (toolName === 'create_reorder' || toolName === 'adjust_inventory') {
      riskLevel = 'medium';
    }

    const confirmLabelMap: Record<string, string> = {
      create_reorder: '确认创建补货订单',
      adjust_inventory: '确认调整库存',
      update_shipment_status: '确认更新货运状态',
    };

    return {
      title: `确认操作: ${toolName}`,
      description: `${reason}\n\n策略说明: ${toolPolicy.rationale}\n参数: ${JSON.stringify(params, null, 2)}`,
      toolName,
      params,
      riskLevel,
      confirmLabel: confirmLabelMap[toolName] || '确认执行',
      cancelLabel: '取消',
    };
  }
}

export const autonomyPolicy = new AutonomyPolicyEngine();

/**
 * Tool execution wrapper — checks policy before executing.
 * Use this instead of raw executeTool() for write operations.
 */
export async function executeWithPolicy(
  toolName: string,
  params: Record<string, unknown>,
): Promise<{
  executed: boolean;
  needsConfirmation: boolean;
  confirmationCard?: ReturnType<AutonomyPolicyEngine['buildConfirmationCard']>;
  result?: unknown;
  error?: string;
}> {
  const { executeTool } = await import('@/lib/mcp/tools');

  const check = autonomyPolicy.checkExecution(toolName, params);

  if (check.level === 'forbid') {
    return {
      executed: false,
      needsConfirmation: false,
      error: check.reason,
    };
  }

  if (check.level === 'confirm') {
    return {
      executed: false,
      needsConfirmation: true,
      confirmationCard: autonomyPolicy.buildConfirmationCard(toolName, params, check.reason),
    };
  }

  // Auto — execute directly
  try {
    const result = await executeTool(toolName, params);
    autonomyPolicy.recordExecution(toolName);
    return { executed: true, needsConfirmation: false, result };
  } catch (err) {
    return {
      executed: false,
      needsConfirmation: false,
      error: (err as Error).message,
    };
  }
}
