/**
 * Engine Observability Layer — non-blocking decision logging, health probes,
 * and audit trail generation.
 *
 * Key principles:
 * - All writes are async and non-blocking (fire-and-forget with batch flush).
 * - Health probes are lightweight (no DB queries, just in-memory state checks).
 * - DecisionLog entries are structured for downstream Bayesian calibration.
 */

import { getAllCircuitBreakers } from './resilience';
import { engineCache } from './cache';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface DecisionLogEntry {
  id: string;
  timestamp: string;
  engine: string;                // 'cascade-risk' | 'decision-graph' | 'tariff' | 'workflow'
  action: string;                // 'propagation' | 'decision' | 'simulation' | 'execution'
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  meta: {
    durationMs: number;
    cacheHit: boolean;
    degradedSources: string[];
    errors: string[];
    version: string;             // config version hash at time of execution
  };
  passport?: DecisionPassport;   // Phase 2 — will be filled later
}

export interface DecisionPassport {
  confidence: number;            // 0-1
  ruleVersion: string;
  dataProvenance: Array<{ source: string; timestamp: string; latency: number }>;
  alternatives: Array<{ action: string; expectedImpact: string }>;
  auditId: string;
}

export interface HealthProbeResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: Record<string, { status: 'ok' | 'degraded' | 'fail'; latencyMs?: number; error?: string }>;
}

export interface EngineMetrics {
  cache: { size: number; hitRate: number };
  circuitBreakers: Record<string, { state: string; failures: number }>;
  logQueueSize: number;
  logsFlushed: number;
  startTime: string;
}

// ─── Async Log Buffer ────────────────────────────────────────────────────────────

const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 500;

class DecisionLogBuffer {
  private buffer: DecisionLogEntry[] = [];
  private flushed = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private persistFn: ((entries: DecisionLogEntry[]) => Promise<void>) | null = null;

  /** Register a persistence callback (DB write, file append, etc.) */
  onFlush(fn: (entries: DecisionLogEntry[]) => Promise<void>): void {
    this.persistFn = fn;
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  /** Enqueue a log entry (fire-and-forget, non-blocking) */
  enqueue(entry: DecisionLogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.flush().catch(() => { /* silent — logging must never throw */ });
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    this.flushed += batch.length;
    if (this.persistFn) {
      try {
        await this.persistFn(batch);
      } catch {
        // Re-enqueue on failure to avoid data loss
        this.buffer.unshift(...batch);
        this.flushed -= batch.length;
      }
    }
  }

  getStats() {
    return { queueSize: this.buffer.length, logsFlushed: this.flushed };
  }

  destroy(): void {
    if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; }
  }
}

/** Singleton log buffer */
export const decisionLogger = new DecisionLogBuffer();

// ─── Decision Log Factory ────────────────────────────────────────────────────────

let logCounter = 0;

export function createDecisionLog(
  engine: DecisionLogEntry['engine'],
  action: DecisionLogEntry['action'],
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  meta: Partial<DecisionLogEntry['meta']> = {},
): DecisionLogEntry {
  return {
    id: `dl-${engine}-${Date.now()}-${++logCounter}`,
    timestamp: new Date().toISOString(),
    engine,
    action,
    input,
    output,
    meta: {
      durationMs: meta.durationMs ?? 0,
      cacheHit: meta.cacheHit ?? false,
      degradedSources: meta.degradedSources ?? [],
      errors: meta.errors ?? [],
      version: meta.version ?? 'unknown',
    },
  };
}

/** Convenience: log and optionally persist */
export function logDecision(entry: DecisionLogEntry): void {
  decisionLogger.enqueue(entry);

  // Also log to console in development for immediate feedback
  if (process.env.NODE_ENV === 'development') {
    const degraded = entry.meta.degradedSources.length > 0
      ? ` ⚠ degraded: ${entry.meta.degradedSources.join(',')}`
      : '';
    const errors = entry.meta.errors.length > 0
      ? ` ❌ errors: ${entry.meta.errors.join(',')}`
      : '';
    console.log(
      `[EngineLog] ${entry.engine}/${entry.action} ` +
      `${entry.meta.durationMs}ms cache=${entry.meta.cacheHit}${degraded}${errors}`
    );
  }
}

// ─── Health Probe ────────────────────────────────────────────────────────────────

const engineStartTime = new Date().toISOString();

export async function runHealthProbe(): Promise<HealthProbeResult> {
  const checks: HealthProbeResult['checks'] = {};
  let degradedCount = 0;
  let failCount = 0;

  // Check circuit breakers
  const breakers = getAllCircuitBreakers();
  for (const [name, state] of Object.entries(breakers)) {
    checks[`breaker:${name}`] = {
      status: state.state === 'closed' ? 'ok' : state.state === 'half-open' ? 'degraded' : 'fail',
    };
    if (state.state === 'open') failCount++;
    if (state.state === 'half-open') degradedCount++;
  }

  // Check engine cache health
  const cacheStats = engineCache.stats();
  checks['cache'] = {
    status: cacheStats.hitRate > 0.5 ? 'ok' : 'degraded',
  };

  // Check log buffer health
  const logStats = decisionLogger.getStats();
  checks['logger'] = {
    status: logStats.queueSize < MAX_BUFFER_SIZE ? 'ok' : 'degraded',
  };

  const status = failCount > 0 ? 'unhealthy' : degradedCount > 0 ? 'degraded' : 'healthy';

  return { status, timestamp: new Date().toISOString(), checks };
}

export function getEngineMetrics(): EngineMetrics {
  return {
    cache: engineCache.stats(),
    circuitBreakers: Object.fromEntries(
      Object.entries(getAllCircuitBreakers()).map(([k, v]) => [k, { state: v.state, failures: v.failures }])
    ),
    logQueueSize: decisionLogger.getStats().queueSize,
    logsFlushed: decisionLogger.getStats().logsFlushed,
    startTime: engineStartTime,
  };
}
