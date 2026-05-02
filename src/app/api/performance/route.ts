/**
 * Performance Monitoring API Endpoint
 * Returns API response times, cache hit rates, system health metrics,
 * and top slow endpoints for the dashboard performance monitor panel.
 */

import { NextRequest } from 'next/server';
import { withErrorHandler, apiSuccess } from '@/lib/api-utils';
import { serverCache } from '@/lib/cache';

// ─── In-memory API call tracking (last 100 calls) ────────────────────────────

interface ApiCallRecord {
  endpoint: string;
  duration: number; // ms
  status: number;
  timestamp: number; // Unix ms
}

const MAX_CALL_RECORDS = 100;
const apiCallRecords: ApiCallRecord[] = [];

/**
 * Track an API call for performance monitoring.
 * Call this from API route handlers after measuring response time.
 */
export function trackApiCall(endpoint: string, duration: number, status: number): void {
  apiCallRecords.push({
    endpoint,
    duration,
    status,
    timestamp: Date.now(),
  });
  // Keep only the last MAX_CALL_RECORDS
  if (apiCallRecords.length > MAX_CALL_RECORDS) {
    apiCallRecords.splice(0, apiCallRecords.length - MAX_CALL_RECORDS);
  }
}

// ─── Helper: Compute top slow endpoints ──────────────────────────────────────

interface SlowEndpoint {
  endpoint: string;
  avgTime: number;
  callCount: number;
  maxTime: number;
}

function computeTopSlowEndpoints(): SlowEndpoint[] {
  const endpointMap: Record<string, { total: number; count: number; max: number }> = {};

  for (const record of apiCallRecords) {
    if (!endpointMap[record.endpoint]) {
      endpointMap[record.endpoint] = { total: 0, count: 0, max: 0 };
    }
    endpointMap[record.endpoint].total += record.duration;
    endpointMap[record.endpoint].count += 1;
    endpointMap[record.endpoint].max = Math.max(endpointMap[record.endpoint].max, record.duration);
  }

  const endpoints: SlowEndpoint[] = Object.entries(endpointMap).map(([endpoint, data]) => ({
    endpoint,
    avgTime: Math.round(data.total / data.count),
    callCount: data.count,
    maxTime: data.max,
  }));

  // Sort by average time descending, take top 5
  endpoints.sort((a, b) => b.avgTime - a.avgTime);
  return endpoints.slice(0, 5);
}

// ─── Helper: Compute cache stats ─────────────────────────────────────────────

function computeCacheStats() {
  const cacheData = serverCache.stats();
  const hitCounts = cacheData.hitCounts;
  const entries = Object.entries(hitCounts);

  let totalHits = 0;
  let totalMisses = 0;

  for (const [, hits] of entries) {
    totalHits += hits;
    // Each entry was a miss when first created
    totalMisses += 1;
  }

  const total = totalHits + totalMisses;
  const hitRate = total > 0 ? Math.round((totalHits / total) * 100) : 0;
  const missRate = total > 0 ? 100 - hitRate : 0;

  return {
    hitRate,
    missRate,
    totalEntries: cacheData.size,
    totalHits,
    totalMisses,
    memoryUsage: `${Math.round(JSON.stringify(hitCounts).length / 1024)}KB`,
  };
}

// ─── Helper: System health ───────────────────────────────────────────────────

function computeSystemHealth() {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();

  return {
    uptime: Math.round(uptime),
    uptimeFormatted: formatUptime(uptime),
    memoryUsage: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
      heapUsedPercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    },
    activeConnections: 0, // Placeholder - no connection tracking in this context
  };
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── Seed some demo data if no real data exists ──────────────────────────────

function seedDemoDataIfEmpty(): void {
  if (apiCallRecords.length > 0) return;

  const demoEndpoints = [
    '/api/dashboard', '/api/inventory', '/api/cost', '/api/logistics',
    '/api/sales', '/api/suppliers', '/api/risk', '/api/warehouse',
    '/api/stats', '/api/products', '/api/events', '/api/notes',
    '/api/supply-chain-score', '/api/cache', '/api/alert-rules',
  ];

  const now = Date.now();
  for (let i = 0; i < 80; i++) {
    const endpoint = demoEndpoints[i % demoEndpoints.length];
    // Simulate varying response times
    const baseDuration = endpoint === '/api/dashboard' ? 120 : endpoint === '/api/stats' ? 200 : 50;
    const duration = baseDuration + Math.floor(Math.random() * baseDuration * 0.8);
    const status = Math.random() > 0.05 ? 200 : 500;
    apiCallRecords.push({
      endpoint,
      duration,
      status,
      timestamp: now - (80 - i) * 3000, // Every 3 seconds going back
    });
  }
}

// ─── GET handler ─────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (_req: NextRequest) => {
  seedDemoDataIfEmpty();

  // Last 20 API response times (most recent first)
  const recentCalls = apiCallRecords.slice(-20).reverse().map((r) => ({
    endpoint: r.endpoint,
    duration: r.duration,
    timestamp: r.timestamp,
    status: r.status,
  }));

  const cacheStats = computeCacheStats();
  const systemHealth = computeSystemHealth();
  const topSlowEndpoints = computeTopSlowEndpoints();

  return apiSuccess({
    apiResponseTimes: recentCalls,
    cacheStats,
    systemHealth,
    topSlowEndpoints,
    totalTrackedCalls: apiCallRecords.length,
  });
});
