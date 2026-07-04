/**
 * Cost Tracker — records LLM call costs for the hybrid provider strategy.
 *
 * Tracks per-call: provider, input/output tokens, cost, timestamp, complexity, success.
 * Provides aggregation by provider, time range, and complexity level.
 * Generates human-readable cost reports.
 *
 * Pricing model (USD per 1K tokens, approximate 2026 rates):
 *   DeepSeek V4:     input $0.001  output $0.002   (cheapest, 74.3% tool reliability)
 *   GPT-4o:          input $0.0025 output $0.010   (high reliability)
 *   Claude 3.5:      input $0.003  output $0.015   (highest reliability)
 *
 * Persistence: in-memory by default. Optional Redis hook via `persistFn`.
 */

import type { ComplexityLevel } from './complexity-assessor';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type CostProviderId = 'deepseek' | 'openai' | 'anthropic' | 'hybrid' | string;

export interface CostRecord {
  provider: CostProviderId;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: number;
  complexity?: ComplexityLevel;
  success: boolean;
  /** Optional: model ID used */
  model?: string;
  /** Optional: latency in ms */
  latencyMs?: number;
}

export interface CostSummary {
  totalCalls: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  successCount: number;
  failureCount: number;
  byProvider: Record<string, {
    calls: number;
    cost: number;
    inputTokens: number;
    outputTokens: number;
    successRate: number;
  }>;
  byComplexity: Partial<Record<ComplexityLevel, {
    calls: number;
    cost: number;
  }>>;
}

// ─── Provider Pricing (USD per 1K tokens) ──────────────────────────────────────

export const PROVIDER_PRICING: Record<string, { input: number; output: number }> = {
  deepseek: { input: 0.001, output: 0.002 },
  openai: { input: 0.0025, output: 0.01 },
  anthropic: { input: 0.003, output: 0.015 },
  // hybrid itself doesn't have direct pricing — its sub-providers do
  hybrid: { input: 0, output: 0 },
};

// ─── Cost Calculation ──────────────────────────────────────────────────────────

export function calculateCost(
  provider: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = PROVIDER_PRICING[provider];
  if (!pricing) return 0;
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

/**
 * Estimate token count from text.
 * Rough heuristic: Chinese ~1.5 chars/token, English ~4 chars/token.
 * Mixed content: use 2.5 chars/token as compromise.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 2.5);
}

// ─── Cost Tracker ──────────────────────────────────────────────────────────────

export class CostTracker {
  private records: CostRecord[] = [];
  private maxRecords: number;
  private persistFn?: (_records: CostRecord[]) => Promise<void>;

  constructor(opts?: {
    maxRecords?: number;
    persistFn?: (_records: CostRecord[]) => Promise<void>;
  }) {
    this.maxRecords = opts?.maxRecords ?? 10_000;
    this.persistFn = opts?.persistFn;
  }

  /** Record a single LLM call. Returns the recorded entry. */
  record(entry: Omit<CostRecord, 'timestamp'>): CostRecord {
    const record: CostRecord = {
      ...entry,
      timestamp: Date.now(),
    };
    this.records.push(record);

    // Evict oldest if over capacity
    if (this.records.length > this.maxRecords) {
      this.records.shift();
    }

    return record;
  }

  /** Get all records. */
  getAll(): CostRecord[] {
    return [...this.records];
  }

  /** Filter by provider. */
  getByProvider(provider: string): CostRecord[] {
    return this.records.filter(r => r.provider === provider);
  }

  /** Filter by time range (inclusive). */
  getByTimeRange(start: number, end: number): CostRecord[] {
    return this.records.filter(r => r.timestamp >= start && r.timestamp <= end);
  }

  /** Filter by complexity level. */
  getByComplexity(level: ComplexityLevel): CostRecord[] {
    return this.records.filter(r => r.complexity === level);
  }

  /** Aggregate summary across all records. */
  getSummary(): CostSummary {
    const summary: CostSummary = {
      totalCalls: this.records.length,
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      successCount: 0,
      failureCount: 0,
      byProvider: {},
      byComplexity: {},
    };

    for (const r of this.records) {
      summary.totalCost += r.cost;
      summary.totalInputTokens += r.inputTokens;
      summary.totalOutputTokens += r.outputTokens;
      if (r.success) summary.successCount++;
      else summary.failureCount++;

      // By provider
      if (!summary.byProvider[r.provider]) {
        summary.byProvider[r.provider] = {
          calls: 0, cost: 0, inputTokens: 0, outputTokens: 0, successRate: 0,
        };
      }
      const p = summary.byProvider[r.provider];
      p.calls++;
      p.cost += r.cost;
      p.inputTokens += r.inputTokens;
      p.outputTokens += r.outputTokens;

      // By complexity
      if (r.complexity) {
        if (!summary.byComplexity[r.complexity]) {
          summary.byComplexity[r.complexity] = { calls: 0, cost: 0 };
        }
        summary.byComplexity[r.complexity]!.calls++;
        summary.byComplexity[r.complexity]!.cost += r.cost;
      }
    }

    // Compute success rates per provider
    for (const [provider, p] of Object.entries(summary.byProvider)) {
      const providerRecords = this.records.filter(r => r.provider === provider);
      const successes = providerRecords.filter(r => r.success).length;
      p.successRate = p.calls > 0 ? successes / p.calls : 0;
    }

    // Round total cost
    summary.totalCost = Math.round(summary.totalCost * 1_000_000) / 1_000_000;

    return summary;
  }

  /** Generate a human-readable cost report. */
  generateReport(): string {
    const summary = this.getSummary();
    const lines: string[] = [
      '═══ LLM Cost Report ═══',
      `Total calls: ${summary.totalCalls}`,
      `Total cost: $${summary.totalCost.toFixed(6)}`,
      `Total input tokens: ${summary.totalInputTokens}`,
      `Total output tokens: ${summary.totalOutputTokens}`,
      `Success: ${summary.successCount} | Failure: ${summary.failureCount}`,
      '',
      '── By Provider ──',
    ];

    for (const [provider, stats] of Object.entries(summary.byProvider)) {
      lines.push(
        `  ${provider}: ${stats.calls} calls, $${stats.cost.toFixed(6)}, ` +
        `in=${stats.inputTokens} out=${stats.outputTokens}, ` +
        `success=${(stats.successRate * 100).toFixed(1)}%`,
      );
    }

    lines.push('', '── By Complexity ──');
    for (const [level, stats] of Object.entries(summary.byComplexity)) {
      lines.push(`  ${level}: ${stats.calls} calls, $${stats.cost.toFixed(6)}`);
    }

    lines.push('═══ End Report ═══');
    return lines.join('\n');
  }

  /** Clear all records. */
  clear(): void {
    this.records = [];
  }

  /** Get current record count. */
  get size(): number {
    return this.records.length;
  }

  /** Persist records (if persistFn configured). */
  async persist(): Promise<void> {
    if (this.persistFn) {
      await this.persistFn(this.records);
    }
  }
}

// ─── Singleton accessor (optional global tracker) ──────────────────────────────

let globalTracker: CostTracker | null = null;

export function getGlobalCostTracker(): CostTracker {
  if (!globalTracker) {
    globalTracker = new CostTracker();
  }
  return globalTracker;
}

export function resetGlobalCostTracker(): void {
  globalTracker = null;
}
