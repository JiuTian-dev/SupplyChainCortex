/**
 * Data Source Health Monitor — tracks all scraper/source health metrics.
 *
 * Monitors every data source (both local scrapers and the Supplier API),
 * records success/failure counts with timestamps, computes SLA percentages,
 * and integrates with the connector-health dashboard.
 *
 * Architecture:
 * - registry: Record of all sources with accumulated stats
 * - recordSuccess / recordFailure: called by each scraper after execution
 * - getHealthReport: aggregated health for the connector dashboard
 * - Persisted to in-memory store (resets on process restart; backed by DB log table)
 */

import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface SourceStats {
  name: string;
  category: 'scraper' | 'supplier_api' | 'graph';
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastSuccess: string | null;
  lastFailure: string | null;
  totalRecords: number;
  avgLatencyMs: number;
}

export interface SourceHealthReport {
  generatedAt: string;
  totalSources: number;
  healthySources: number;
  degradedSources: number;
  offlineSources: number;
  overallSla: string;
  sources: SourceStats[];
}

export interface SourceHealthSummary {
  name: string;
  status: 'healthy' | 'degraded' | 'offline';
  consecutiveFailures: number;
  lastSuccess: string | null;
  successRate: string;
}

// ─── In-memory registry ──────────────────────────────────────────────────────────

interface MetricsStore {
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastSuccess: number | null;
  lastFailure: number | null;
  totalRecords: number;
  totalLatencyMs: number;
  sampleCount: number;
}

const registry = new Map<string, MetricsStore>();

function ensure(name: string): MetricsStore {
  if (!registry.has(name)) {
    registry.set(name, {
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
      lastSuccess: null,
      lastFailure: null,
      totalRecords: 0,
      totalLatencyMs: 0,
      sampleCount: 0,
    });
  }
  return registry.get(name)!;
}

// ─── Public API ──────────────────────────────────────────────────────────────────

export function recordSuccess(name: string, recordCount = 0, latencyMs = 0): void {
  const m = ensure(name);
  m.successCount++;
  m.consecutiveFailures = 0;
  m.lastSuccess = Date.now();
  m.totalRecords += recordCount;
  if (latencyMs > 0) {
    m.totalLatencyMs += latencyMs;
    m.sampleCount++;
  }
}

export function recordFailure(name: string, latencyMs = 0): void {
  const m = ensure(name);
  m.failureCount++;
  m.consecutiveFailures++;
  m.lastFailure = Date.now();
  if (latencyMs > 0) {
    m.totalLatencyMs += latencyMs;
    m.sampleCount++;
  }
}

/** Mark a source as healthy based on whether it passes a canary call. */
export function updateFromCanary(name: string, success: boolean, recordCount = 0, latencyMs = 0): void {
  if (success) {
    recordSuccess(name, recordCount, latencyMs);
  } else {
    recordFailure(name, latencyMs);
  }
}

// ─── Source registry — all known data sources ────────────────────────────────────

const SCRAPER_SOURCES = [
  'alphavantage-commodities',
  'scfi-scraper',
  'pboc-exchange-rate',
  'carbon-price',
  'port-congestion',
  'scfis-futures',
  'cpsc-recall',
  'financial-indices',
  'social-sentiment',
  'amazon-competitor',
  'tariff.service',
  'weather.service',
  'freight.service',
] as const;

const SUPPLIER_API_SOURCES = [
  'supplier-api.dependency',
  'supplier-api.network',
  'supplier-api.impact',
  'supplier-api.chokepoints',
  'supplier-api.geo-risk',
  'supplier-api.tiers',
] as const;

const GRAPH_SOURCES = [
  'neo4j.graph',
] as const;

// ─── Health computation ──────────────────────────────────────────────────────────

function computeStatus(m: MetricsStore): 'healthy' | 'degraded' | 'offline' {
  if (m.consecutiveFailures >= 5) return 'offline';
  if (m.consecutiveFailures >= 3) return 'degraded';
  const total = m.successCount + m.failureCount;
  if (total === 0) return 'offline'; // never run
  const rate = m.successCount / total;
  if (rate < 0.7) return 'degraded';
  return 'healthy';
}

function computeSuccessRate(m: MetricsStore): string {
  const total = m.successCount + m.failureCount;
  if (total === 0) return 'N/A';
  return `${(m.successCount / total * 100).toFixed(1)}%`;
}

function computeAvgLatency(m: MetricsStore): number {
  if (m.sampleCount === 0) return 0;
  return Math.round(m.totalLatencyMs / m.sampleCount);
}

function toISO(ts: number | null): string | null {
  return ts ? new Date(ts).toISOString() : null;
}

export function getHealthReport(): SourceHealthReport {
  const allSources = [
    ...SCRAPER_SOURCES,
    ...SUPPLIER_API_SOURCES,
    ...GRAPH_SOURCES,
  ];

  const sources: SourceStats[] = [];
  let healthy = 0, degraded = 0, offline = 0;

  for (const name of allSources) {
    const m = registry.get(name);
    if (!m) {
      sources.push({
        name,
        category: getCategory(name),
        successCount: 0,
        failureCount: 0,
        consecutiveFailures: 0,
        lastSuccess: null,
        lastFailure: null,
        totalRecords: 0,
        avgLatencyMs: 0,
      });
      offline++;
      continue;
    }
    const status = computeStatus(m);
    if (status === 'healthy') healthy++;
    else if (status === 'degraded') degraded++;
    else offline++;

    const category = getCategory(name);
    sources.push({
      name,
      category,
      successCount: m.successCount,
      failureCount: m.failureCount,
      consecutiveFailures: m.consecutiveFailures,
      lastSuccess: toISO(m.lastSuccess),
      lastFailure: toISO(m.lastFailure),
      totalRecords: m.totalRecords,
      avgLatencyMs: computeAvgLatency(m),
    });
  }

  const total = allSources.length;
  return {
    generatedAt: new Date().toISOString(),
    totalSources: total,
    healthySources: healthy,
    degradedSources: degraded,
    offlineSources: offline,
    overallSla: total > 0 ? `${(healthy / total * 100).toFixed(1)}%` : 'N/A',
    sources,
  };
}

/** Lightweight summary — for the connector dashboard. */
export function getHealthSummary(): SourceHealthSummary[] {
  const report = getHealthReport();
  return report.sources.map(s => ({
    name: s.name,
    status: computeStatus(
      registry.get(s.name) || { successCount: 0, failureCount: 0, consecutiveFailures: 0, lastSuccess: null, lastFailure: null, totalRecords: 0, totalLatencyMs: 0, sampleCount: 0 },
    ),
    consecutiveFailures: s.consecutiveFailures,
    lastSuccess: s.lastSuccess,
    successRate: computeSuccessRate(
      registry.get(s.name) || { successCount: 0, failureCount: 0, consecutiveFailures: 0, lastSuccess: null, lastFailure: null, totalRecords: 0, totalLatencyMs: 0, sampleCount: 0 },
    ),
  }));
}

/** Persist stats to database for cross-restart durability. */
export async function persistHealthLog(): Promise<void> {
  try {
    const report = getHealthReport();
    await db.auditLog.create({
      data: {
        action: 'source_health_snapshot',
        entity: 'system',
        details: {
          overallSla: report.overallSla,
          healthySources: report.healthySources,
          degradedSources: report.degradedSources,
          offlineSources: report.offlineSources,
          timestamp: report.generatedAt,
        },
      },
    });
  } catch {
    // Non-critical — health log is best-effort
  }
}

function getCategory(name: string): 'scraper' | 'supplier_api' | 'graph' {
  if (name.startsWith('supplier-api.')) return 'supplier_api';
  if (name.startsWith('neo4j.')) return 'graph';
  return 'scraper';
}
