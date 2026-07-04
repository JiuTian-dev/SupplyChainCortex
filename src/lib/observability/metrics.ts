/**
 * Prometheus-compatible Metrics Registry
 *
 * Self-contained implementation of Counter / Histogram / Gauge primitives that
 * expose the Prometheus 0.0.4 text exposition format. Avoids pulling in
 * `prom-client` or `@opentelemetry/exporter-prometheus` so the runtime stays
 * dependency-light while still being scrape-compatible.
 *
 * Metric naming follows Prometheus conventions (snake_case, _total suffix for
 * counters, _seconds suffix for time-based histograms).
 *
 * Exposition format reference:
 * https://prometheus.io/docs/instrumenting/exposition_formats/
 */

// ─── Label helpers ──────────────────────────────────────────────────────────

export type Labels = Record<string, string | number>;

function labelKey(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return '';
  return keys.map((k) => `${k}="${escapeLabel(labels[k])}"`).join(',');
}

function escapeLabel(v: string | number): string {
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

// ─── Metric primitives ──────────────────────────────────────────────────────

interface MetricBase {
  readonly name: string;
  readonly help: string;
  readonly type: 'counter' | 'gauge' | 'histogram';
  format(): string[];
  reset(): void;
}

class Counter implements MetricBase {
  readonly type = 'counter' as const;
  private values = new Map<string, number>();
  readonly name: string;
  readonly help: string;
  readonly labelNames: string[];

  constructor(name: string, help: string, labelNames: string[] = []) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
  }

  inc(labels: Labels = {}, value = 1): void {
    const key = labelKey(this.normalize(labels));
    this.values.set(key, (this.values.get(key) || 0) + value);
  }

  /** Snapshot as Prometheus text lines (without header). */
  format(): string[] {
    const lines: string[] = [];
    for (const [key, value] of this.values) {
      const lbl = key ? `{${key}}` : '';
      lines.push(`${this.name}${lbl} ${formatNumber(value)}`);
    }
    if (lines.length === 0) lines.push(`${this.name} 0`);
    return lines;
  }

  reset(): void {
    this.values.clear();
  }

  private normalize(labels: Labels): Labels {
    const out: Labels = {};
    for (const k of this.labelNames) {
      if (labels[k] != null) out[k] = String(labels[k]);
    }
    return out;
  }
}

class Gauge implements MetricBase {
  readonly type = 'gauge' as const;
  private values = new Map<string, number>();
  readonly name: string;
  readonly help: string;
  readonly labelNames: string[];

  constructor(name: string, help: string, labelNames: string[] = []) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
  }

  set(labels: Labels = {}, value: number): void {
    const key = labelKey(this.normalize(labels));
    this.values.set(key, value);
  }

  inc(labels: Labels = {}, value = 1): void {
    const key = labelKey(this.normalize(labels));
    this.values.set(key, (this.values.get(key) || 0) + value);
  }

  dec(labels: Labels = {}, value = 1): void {
    this.inc(labels, -value);
  }

  format(): string[] {
    const lines: string[] = [];
    for (const [key, value] of this.values) {
      const lbl = key ? `{${key}}` : '';
      lines.push(`${this.name}${lbl} ${formatNumber(value)}`);
    }
    if (lines.length === 0) lines.push(`${this.name} 0`);
    return lines;
  }

  reset(): void {
    this.values.clear();
  }

  private normalize(labels: Labels): Labels {
    const out: Labels = {};
    for (const k of this.labelNames) {
      if (labels[k] != null) out[k] = String(labels[k]);
    }
    return out;
  }
}

/**
 * Histogram with explicit bucket boundaries. Defaults align with the
 * Prometheus client_library default buckets (suitable for HTTP request
 * durations in seconds).
 */
const DEFAULT_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
];

class Histogram implements MetricBase {
  readonly type = 'histogram' as const;
  private series = new Map<
    string,
    { buckets: number[]; counts: number[]; sum: number; count: number; labels: Labels }
  >();
  readonly name: string;
  readonly help: string;
  readonly labelNames: string[];
  readonly buckets: number[];

  constructor(
    name: string,
    help: string,
    labelNames: string[] = [],
    buckets: number[] = DEFAULT_BUCKETS,
  ) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.buckets = buckets;
  }

  observe(labels: Labels = {}, value: number): void {
    const norm = this.normalize(labels);
    const key = labelKey(norm);
    let s = this.series.get(key);
    if (!s) {
      s = {
        buckets: this.buckets,
        counts: new Array(this.buckets.length).fill(0),
        sum: 0,
        count: 0,
        labels: norm,
      };
      this.series.set(key, s);
    }
    s.sum += value;
    s.count += 1;
    for (let i = 0; i < s.buckets.length; i++) {
      if (value <= s.buckets[i]) s.counts[i] += 1;
    }
  }

  format(): string[] {
    const lines: string[] = [];
    if (this.series.size === 0) {
      // Emit a zero-valued series so Prometheus always sees the metric
      lines.push(`${this.name}_bucket{le="+Inf"} 0`);
      lines.push(`${this.name}_sum 0`);
      lines.push(`${this.name}_count 0`);
      return lines;
    }
    for (const s of this.series.values()) {
      const labelStr = labelKey(s.labels);
      const prefix = labelStr ? `${this.name}_bucket{${labelStr},le="` : `${this.name}_bucket{le="`;
      for (let i = 0; i < s.buckets.length; i++) {
        lines.push(`${prefix}${formatBucket(s.buckets[i])}"} ${s.counts[i]}`);
      }
      // +Inf bucket
      const infSuffix = labelStr ? `${this.name}_bucket{${labelStr},le="+Inf"}` : `${this.name}_bucket{le="+Inf"}`;
      lines.push(`${infSuffix} ${s.count}`);

      const sumLine = labelStr ? `${this.name}_sum{${labelStr}}` : `${this.name}_sum`;
      lines.push(`${sumLine} ${formatNumber(s.sum)}`);

      const countLine = labelStr ? `${this.name}_count{${labelStr}}` : `${this.name}_count`;
      lines.push(`${countLine} ${s.count}`);
    }
    return lines;
  }

  reset(): void {
    this.series.clear();
  }

  private normalize(labels: Labels): Labels {
    const out: Labels = {};
    for (const k of this.labelNames) {
      if (labels[k] != null) out[k] = String(labels[k]);
    }
    return out;
  }
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? '+Inf' : '-Inf';
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

function formatBucket(b: number): string {
  return formatNumber(b);
}

// ─── Registry ───────────────────────────────────────────────────────────────

class MetricsRegistry {
  private metrics = new Map<string, MetricBase>();
  private order: string[] = [];

  register<T extends MetricBase>(m: T): T {
    if (!this.metrics.has(m.name)) {
      this.metrics.set(m.name, m);
      this.order.push(m.name);
    }
    return m;
  }

  counter(name: string, help: string, labelNames: string[] = []): Counter {
    return this.register(new Counter(name, help, labelNames));
  }

  gauge(name: string, help: string, labelNames: string[] = []): Gauge {
    return this.register(new Gauge(name, help, labelNames));
  }

  histogram(
    name: string,
    help: string,
    labelNames: string[] = [],
    buckets: number[] = DEFAULT_BUCKETS,
  ): Histogram {
    return this.register(new Histogram(name, help, labelNames, buckets));
  }

  /** Render the full registry in Prometheus text exposition format. */
  expose(): string {
    const blocks: string[] = [];
    for (const name of this.order) {
      const m = this.metrics.get(name)!;
      blocks.push(`# HELP ${name} ${m.help}`);
      blocks.push(`# TYPE ${name} ${m.type}`);
      blocks.push(...m.format());
    }
    return blocks.join('\n') + '\n';
  }

  /** Reset all metrics (primarily for tests). */
  reset(): void {
    for (const m of this.metrics.values()) {
      (m as { reset: () => void }).reset();
    }
  }
}

// ─── Singleton registry + domain metrics ────────────────────────────────────

export const registry = new MetricsRegistry();

/** FSM state machine transitions (from -> to). */
export const fsmStateTransitions = registry.counter(
  'fsm_state_transitions_total',
  'Total number of FSM state transitions',
  ['from', 'to'],
);

/** Tool invocations (success / failure). */
export const toolCalls = registry.counter(
  'tool_calls_total',
  'Total number of MCP / supply-chain tool calls',
  ['tool', 'status'],
);

/** Tool call duration in seconds. */
export const toolCallDuration = registry.histogram(
  'tool_call_duration_seconds',
  'Duration of tool calls in seconds',
  ['tool'],
  [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 8, 10, 20, 30],
);

/** LLM provider requests (success / error / timeout). */
export const providerRequests = registry.counter(
  'provider_requests_total',
  'Total number of LLM provider requests',
  ['provider', 'status'],
);

/** LLM provider request duration in seconds. */
export const providerRequestDuration = registry.histogram(
  'provider_request_duration_seconds',
  'Duration of LLM provider requests in seconds',
  ['provider'],
  [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60],
);

/** Accumulated provider cost in USD. */
export const providerCostUsd = registry.counter(
  'provider_cost_usd_total',
  'Total LLM provider cost in USD',
  ['provider'],
);

/** Tenant quota usage (current value, by resource). */
export const tenantQuotaUsage = registry.gauge(
  'tenant_quota_usage',
  'Current tenant quota usage by resource (0-100 percent)',
  ['tenant', 'resource'],
);

/** Stripe webhook events received. */
export const stripeWebhookEvents = registry.counter(
  'stripe_webhook_events_total',
  'Total Stripe webhook events received',
  ['event_type', 'status'],
);

/** Cascade risk computations. */
export const cascadeRiskComputations = registry.counter(
  'cascade_risk_computations_total',
  'Total cascade risk computations',
  ['method'],
);

/** Cascade risk computation duration in seconds. */
export const cascadeRiskComputationDuration = registry.histogram(
  'cascade_risk_computation_duration_seconds',
  'Duration of cascade risk computations in seconds',
  [],
  [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30, 60],
);

// ─── Convenience helpers ────────────────────────────────────────────────────

/**
 * Time an async operation and observe its duration on a histogram.
 * Returns the result or rethrows after recording.
 */
export async function observeDuration<T>(
  histogram: Histogram,
  labels: Labels,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const seconds = (Date.now() - start) / 1000;
    histogram.observe(labels, seconds);
  }
}

/** Render the registry (re-exported for the /metrics route). */
export function exposeMetrics(): string {
  return registry.expose();
}
