/**
 * Data Source Quality Monitor — freshness tracking and health scoring.
 *
 * Inspired by 2026 Edge schema registry principles. Each external data source
 * is tracked for freshness, schema stability, and success rate.
 * Degraded sources auto-flag in Decision Passport provenance.
 */

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface SourceHealth {
  source: string;
  status: 'ok' | 'degraded' | 'stale' | 'unavailable';
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  successCount: number;
  failureCount: number;
  /** Data age in minutes (time since last successful fetch) */
  stalenessMinutes: number | null;
  /** Expected refresh interval in minutes */
  expectedIntervalMin: number;
  /** 0-1 health score */
  score: number;
  /** Schema version hash (detects drift) */
  schemaHash?: string;
}

// ─── Source Registry ─────────────────────────────────────────────────────────────

const sourceRegistry: Record<string, SourceHealth> = {
  'fx:frankfurter': {
    source: 'fx:frankfurter', status: 'ok',
    lastSuccessAt: null, lastAttemptAt: null,
    successCount: 0, failureCount: 0,
    stalenessMinutes: null, expectedIntervalMin: 30, score: 1.0,
  },
  'weather:open-meteo': {
    source: 'weather:open-meteo', status: 'ok',
    lastSuccessAt: null, lastAttemptAt: null,
    successCount: 0, failureCount: 0,
    stalenessMinutes: null, expectedIntervalMin: 60, score: 1.0,
  },
  'commodities:alphavantage': {
    source: 'commodities:alphavantage', status: 'ok',
    lastSuccessAt: null, lastAttemptAt: null,
    successCount: 0, failureCount: 0,
    stalenessMinutes: null, expectedIntervalMin: 360, score: 1.0,
  },
  'scfis:futures': {
    source: 'scfis:futures', status: 'ok',
    lastSuccessAt: null, lastAttemptAt: null,
    successCount: 0, failureCount: 0,
    stalenessMinutes: null, expectedIntervalMin: 60, score: 1.0,
  },
  'carbon:eu-ets': {
    source: 'carbon:eu-ets', status: 'ok',
    lastSuccessAt: null, lastAttemptAt: null,
    successCount: 0, failureCount: 0,
    stalenessMinutes: null, expectedIntervalMin: 60, score: 1.0,
  },
  'cpsc:recalls': {
    source: 'cpsc:recalls', status: 'ok',
    lastSuccessAt: null, lastAttemptAt: null,
    successCount: 0, failureCount: 0,
    stalenessMinutes: null, expectedIntervalMin: 360, score: 1.0,
  },
  'port:congestion': {
    source: 'port:congestion', status: 'ok',
    lastSuccessAt: null, lastAttemptAt: null,
    successCount: 0, failureCount: 0,
    stalenessMinutes: null, expectedIntervalMin: 120, score: 1.0,
  },
  'tariff:ustr': {
    source: 'tariff:ustr', status: 'ok',
    lastSuccessAt: null, lastAttemptAt: null,
    successCount: 0, failureCount: 0,
    stalenessMinutes: null, expectedIntervalMin: 1440, score: 1.0,
  },
  'pboc:exchange': {
    source: 'pboc:exchange', status: 'ok',
    lastSuccessAt: null, lastAttemptAt: null,
    successCount: 0, failureCount: 0,
    stalenessMinutes: null, expectedIntervalMin: 360, score: 1.0,
  },
  'db:inventory': {
    source: 'db:inventory', status: 'ok',
    lastSuccessAt: null, lastAttemptAt: null,
    successCount: 0, failureCount: 0,
    stalenessMinutes: null, expectedIntervalMin: 5, score: 1.0,
  },
};

// ─── Health Tracking ─────────────────────────────────────────────────────────────

/** Record a successful data fetch */
export function recordSourceSuccess(sourceKey: string, schemaHash?: string): void {
  const health = sourceRegistry[sourceKey];
  if (!health) return;

  health.status = 'ok';
  health.lastSuccessAt = new Date().toISOString();
  health.lastAttemptAt = new Date().toISOString();
  health.successCount++;
  health.stalenessMinutes = 0;
  health.score = computeScore(health);

  if (schemaHash) {
    if (health.schemaHash && health.schemaHash !== schemaHash) {
      console.warn(`[ConnectorHealth] Schema drift detected for ${sourceKey}`);
    }
    health.schemaHash = schemaHash;
  }
}

/** Record a failed data fetch */
export function recordSourceFailure(sourceKey: string, error?: string): void {
  const health = sourceRegistry[sourceKey];
  if (!health) return;

  health.lastAttemptAt = new Date().toISOString();
  health.failureCount++;

  // Update staleness
  if (health.lastSuccessAt) {
    health.stalenessMinutes = Math.round(
      (Date.now() - new Date(health.lastSuccessAt).getTime()) / 60000
    );
  }

  // Degrade status
  const consecutiveFailures = health.failureCount - (health.successCount > 0 ? 1 : 0);
  if (consecutiveFailures >= 10) {
    health.status = 'unavailable';
  } else if (consecutiveFailures >= 3) {
    health.status = 'degraded';
  } else if (health.stalenessMinutes && health.stalenessMinutes > health.expectedIntervalMin * 3) {
    health.status = 'stale';
  }

  health.score = computeScore(health);
  if (error) console.error(`[ConnectorHealth] ${sourceKey} failed: ${error.slice(0, 100)}`);
}

/** Compute 0-1 health score */
function computeScore(health: SourceHealth): number {
  if (health.status === 'unavailable') return 0;
  if (health.status === 'degraded') return 0.4;
  if (health.status === 'stale') return 0.6;

  // Penalize based on staleness ratio
  if (health.stalenessMinutes && health.expectedIntervalMin > 0) {
    const ratio = health.stalenessMinutes / health.expectedIntervalMin;
    if (ratio > 5) return 0.3;
    if (ratio > 3) return 0.5;
    if (ratio > 2) return 0.7;
    if (ratio > 1) return 0.9;
  }

  // Penalize for failure rate
  const total = health.successCount + health.failureCount;
  if (total > 10) {
    const failureRate = health.failureCount / total;
    if (failureRate > 0.3) return 0.5;
    if (failureRate > 0.1) return 0.8;
  }

  return 1.0;
}

// ─── Queries ─────────────────────────────────────────────────────────────────────

/** Get health status for a specific source */
export function getSourceHealth(sourceKey: string): SourceHealth | undefined {
  return sourceRegistry[sourceKey];
}

/** Get all source health statuses */
export function getAllSourceHealths(): SourceHealth[] {
  // Update staleness for all sources
  const now = Date.now();
  for (const health of Object.values(sourceRegistry)) {
    if (health.lastSuccessAt) {
      health.stalenessMinutes = Math.round((now - new Date(health.lastSuccessAt).getTime()) / 60000);
      health.score = computeScore(health);
    }
  }
  return Object.values(sourceRegistry);
}

/** Get a summary string for injection into the system prompt */
export function getSourceHealthSummary(): string {
  const all = getAllSourceHealths();
  const degraded = all.filter(s => s.status === 'degraded' || s.status === 'stale');
  const unavailable = all.filter(s => s.status === 'unavailable');

  if (degraded.length === 0 && unavailable.length === 0) {
    return '所有数据源状态正常';
  }

  const parts: string[] = [];
  if (unavailable.length > 0) {
    parts.push(`不可用: ${unavailable.map(s => s.source).join(', ')}`);
  }
  if (degraded.length > 0) {
    parts.push(`降级/过期: ${degraded.map(s => `${s.source}(staleness:${s.stalenessMinutes}min)`).join(', ')}`);
  }

  return parts.join(' | ');
}

/** Get degraded sources for passport provenance */
export function getDegradedSources(): string[] {
  return getAllSourceHealths()
    .filter(s => s.status === 'degraded' || s.status === 'stale' || s.status === 'unavailable')
    .map(s => s.source);
}

// ─── Registration ────────────────────────────────────────────────────────────────

/** Register a new data source for tracking */
export function registerSource(key: string, expectedIntervalMin = 60): void {
  if (sourceRegistry[key]) return;
  sourceRegistry[key] = {
    source: key, status: 'ok',
    lastSuccessAt: null, lastAttemptAt: null,
    successCount: 0, failureCount: 0,
    stalenessMinutes: null, expectedIntervalMin, score: 1.0,
  };
}
