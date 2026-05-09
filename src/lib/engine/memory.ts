/**
 * Agent Memory — shared context & namespaced KV store for inter-agent communication.
 *
 * Enables cascade-risk, decision-graph, sandbox, and MCP orchestrator agents
 * to share findings through a lightweight in-memory store with TTL support.
 *
 * Architecture:
 *   Agent produces data → agentMemory.set(namespace, key, value, ttl?)
 *   Agent consumes data → agentMemory.get<T>(namespace, key)
 *   Cross-agent context → agentMemory.updateShared(section, data)
 */

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface CascadeRiskContext {
  lastRun: string;
  overallRisk: number;
  affectedNodes: number;
  maxDepth: number;
  scenario: string;
  topRisks: Array<{ nodeId: string; riskScore: number; label?: string }>;
}

export interface DecisionGraphContext {
  lastRun: string;
  urgentActions: number;
  thisWeekActions: number;
  estimatedTotalSaving: number;
  actionPlan: Array<{ priority: number; action: string; domain: string; urgency: string }>;
}

export interface SandboxContext {
  lastRun: string;
  scenario: string;
  resilienceScore: number;
  survivalRate: number;
  totalStockouts: number;
  totalDelays: number;
  summary: string;
}

export interface MCPOrchestratorContext {
  lastRun: string;
  lastWorkflowId: string;
  lastSummary: string;
  success: boolean;
}

export interface SharedContext {
  cascadeRisk: CascadeRiskContext | null;
  decisionGraph: DecisionGraphContext | null;
  sandbox: SandboxContext | null;
  mcpOrchestrator: MCPOrchestratorContext | null;
}

interface StoredEntry {
  value: unknown;
  expiresAt: number;
}

// ─── AgentMemory Class ──────────────────────────────────────────────────────────

class AgentMemory {
  private store = new Map<string, StoredEntry>();
  private shared: SharedContext = {
    cascadeRisk: null,
    decisionGraph: null,
    sandbox: null,
    mcpOrchestrator: null,
  };

  /** Set a namespaced key with optional TTL (milliseconds). */
  set(namespace: string, key: string, value: unknown, ttlMs?: number): void {
    const fullKey = `${namespace}:${key}`;
    this.store.set(fullKey, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : Infinity,
    });
  }

  /** Get a namespaced key (returns null if expired or missing). */
  get<T>(namespace: string, key: string): T | null {
    const fullKey = `${namespace}:${key}`;
    const entry = this.store.get(fullKey);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(fullKey);
      return null;
    }
    return entry.value as T;
  }

  /** Delete a namespaced key. */
  delete(namespace: string, key: string): void {
    const fullKey = `${namespace}:${key}`;
    this.store.delete(fullKey);
  }

  /** Read the shared context (immutable snapshot). */
  getSharedContext(): Readonly<SharedContext> {
    return { ...this.shared };
  }

  /** Update a section of the shared context. */
  updateShared<K extends keyof SharedContext>(
    section: K,
    data: Partial<SharedContext[K] & Record<string, unknown>>,
  ): void {
    const current = this.shared[section] || {};
    this.shared[section] = { ...current, ...data } as SharedContext[K];
  }

  /** Clear expired entries. Returns number of evicted entries. */
  evictExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /** List all active namespaces. */
  getNamespaces(): string[] {
    const namespaces = new Set<string>();
    for (const key of this.store.keys()) {
      const ns = key.split(':')[0];
      if (ns) namespaces.add(ns);
    }
    return [...namespaces];
  }

  /** Clear everything (for testing). */
  _clear(): void {
    this.store.clear();
    this.shared = {
      cascadeRisk: null,
      decisionGraph: null,
      sandbox: null,
      mcpOrchestrator: null,
    };
  }
}

export const agentMemory = new AgentMemory();
