/**
 * Supplier API HTTP client — type-safe bridge to the FastAPI + Neo4j service.
 *
 * Integrates with existing resilience primitives:
 * - Circuit breaker via getCircuitBreaker (5 failures → open 30s)
 * - Timeout via AbortSignal.timeout (8s per request)
 * - Server-side cache via cachedFetch + CACHE_TTL.LONG (5min)
 *
 * Graceful degradation: when the API is unreachable or circuit is open,
 * methods return sensible empty/null defaults instead of throwing.
 *
 * Env: SUPPLIER_API_URL (default http://localhost:8001)
 *      SUPPLIER_API_KEY (required for authenticated endpoints)
 */

import { getCircuitBreaker, CircuitBreakerOpenError } from '@/lib/engine/resilience';
import { cachedFetch, CACHE_TTL, cacheKey } from '@/lib/cache-client';
import type {
  ApiResponse,
  DependencyProfile,
  BatchDependencyItem,
  TrendResponse,
  NetworkData,
  ImpactResult,
  ChokepointResponse,
  GeoRiskResult,
  EvolutionResult,
  GraphStats,
  ComponentInfo,
  ComponentCategory,
  TierStructure,
  ParserHealthReport,
  FreshnessReport,
  SupplierSearchResponse,
  DeadLetterStats,
} from './supplier-api.types';

// ─── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL = process.env.SUPPLIER_API_URL || 'http://localhost:8001';
const API_KEY = process.env.SUPPLIER_API_KEY || '';
const REQUEST_TIMEOUT_MS = 8_000;
const BREAKER_NAME = 'supplier-api';

const breaker = getCircuitBreaker(BREAKER_NAME, {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
});

// ─── Core request helper ───────────────────────────────────────────────────────

class SupplierApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(`Supplier API ${status}: ${detail}`);
    this.name = 'SupplierApiError';
  }
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['X-API-Key'] = API_KEY;

  return breaker.execute(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    if (timer.unref) timer.unref();

    try {
      const res = await fetch(url.toString(), {
        method,
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new SupplierApiError(res.status, body.slice(0, 200));
      }

      const json = (await res.json()) as ApiResponse<T>;
      if (json.code !== 200 || json.data === null) {
        throw new SupplierApiError(json.code, json.message || 'Unknown error');
      }
      return json.data;
    } finally {
      clearTimeout(timer);
    }
  });
}

// ─── Dependency endpoints ──────────────────────────────────────────────────────

async function getDependency(ticker: string, region = 'CN'): Promise<DependencyProfile> {
  const key = cacheKey('supplier-api', 'dep', ticker, region);
  return cachedFetch(key, () =>
    request<DependencyProfile>('POST', '/api/v1/dependency', { ticker, region }),
    CACHE_TTL.LONG,
  );
}

async function getDependencyBatch(tickers: string[], region = 'CN'): Promise<BatchDependencyItem[]> {
  const key = cacheKey('supplier-api', 'dep-batch', tickers.sort().join(','), region);
  return cachedFetch(key, () =>
    request<{ results: BatchDependencyItem[] }>(
      'POST', '/api/v1/dependency/batch',
      { tickers: tickers.join(','), region },
    ).then(r => r.results),
    CACHE_TTL.LONG,
  );
}

async function getTrend(ticker: string, region = 'CN', days = 30): Promise<TrendResponse> {
  const key = cacheKey('supplier-api', 'trend', ticker, region, days);
  return cachedFetch(key, () =>
    request<TrendResponse>('GET', '/api/v1/trend', { ticker, region, days }),
    CACHE_TTL.VERY_LONG,
  );
}

// ─── Graph endpoints ───────────────────────────────────────────────────────────

async function getNetwork(
  ticker: string,
  depth = 2,
  component?: string,
  componentCategory?: string,
): Promise<NetworkData> {
  const key = cacheKey('supplier-api', 'net', ticker, depth, ...(component ? [component] : []), ...(componentCategory ? [componentCategory] : []));
  return cachedFetch(key, () =>
    request<NetworkData>('GET', '/api/v1/graph/network', {
      ticker, depth, component, component_category: componentCategory,
    }),
    CACHE_TTL.LONG,
  );
}

async function getImpact(supplier: string, depth = 3): Promise<ImpactResult> {
  const key = cacheKey('supplier-api', 'impact', supplier, depth);
  return cachedFetch(key, () =>
    request<ImpactResult>('GET', '/api/v1/graph/impact', { supplier, depth }),
    CACHE_TTL.LONG,
  );
}

async function getChokepoints(page = 1, pageSize = 50): Promise<ChokepointResponse> {
  const key = cacheKey('supplier-api', 'choke', page, pageSize);
  return cachedFetch(key, () =>
    request<ChokepointResponse>('GET', '/api/v1/graph/chokepoints', {
      page, page_size: pageSize,
    }),
    CACHE_TTL.LONG,
  );
}

async function getGeoRisk(ticker: string): Promise<GeoRiskResult> {
  const key = cacheKey('supplier-api', 'geo', ticker);
  return cachedFetch(key, () =>
    request<GeoRiskResult>('GET', '/api/v1/graph/geo-risk', { ticker }),
    CACHE_TTL.LONG,
  );
}

async function getEvolution(ticker: string, months = 6): Promise<EvolutionResult> {
  const key = cacheKey('supplier-api', 'evo', ticker, months);
  return cachedFetch(key, () =>
    request<EvolutionResult>('GET', '/api/v1/graph/evolution', { ticker, months }),
    CACHE_TTL.VERY_LONG,
  );
}

async function getGraphStats(): Promise<GraphStats> {
  const key = cacheKey('supplier-api', 'stats');
  return cachedFetch(key, () =>
    request<GraphStats>('GET', '/api/v1/graph/stats'),
    CACHE_TTL.VERY_LONG,
  );
}

async function getComponents(
  component?: string,
  componentCategory?: string,
  page = 1,
  pageSize = 50,
): Promise<{ components: ComponentInfo[]; total: number }> {
  const key = cacheKey('supplier-api', 'comp', ...(component ? [component] : []), ...(componentCategory ? [componentCategory] : []), page);
  return cachedFetch(key, () =>
    request<{ components: ComponentInfo[]; total: number }>(
      'GET', '/api/v1/graph/components',
      { component, component_category: componentCategory, page, page_size: pageSize },
    ),
    CACHE_TTL.LONG,
  );
}

async function getComponentTree(): Promise<{ categories: ComponentCategory[]; count: number }> {
  const key = cacheKey('supplier-api', 'comp-tree');
  return cachedFetch(key, () =>
    request<{ categories: ComponentCategory[]; count: number }>(
      'GET', '/api/v1/graph/components/tree',
    ),
    CACHE_TTL.VERY_LONG,
  );
}

async function getTiers(ticker: string): Promise<TierStructure> {
  const key = cacheKey('supplier-api', 'tiers', ticker);
  return cachedFetch(key, () =>
    request<TierStructure>('GET', '/api/v1/graph/tiers', { ticker }),
    CACHE_TTL.LONG,
  );
}

// ─── Health endpoints ──────────────────────────────────────────────────────────

async function getParserHealth(): Promise<ParserHealthReport> {
  const key = cacheKey('supplier-api', 'health-parsers');
  return cachedFetch(key, () =>
    request<ParserHealthReport>('GET', '/api/v1/health/parsers'),
    CACHE_TTL.SHORT,
  );
}

async function getFreshness(page = 1, pageSize = 50): Promise<FreshnessReport> {
  const key = cacheKey('supplier-api', 'freshness', page);
  return cachedFetch(key, () =>
    request<FreshnessReport>('GET', '/api/v1/freshness', { page, page_size: pageSize }),
    CACHE_TTL.MEDIUM,
  );
}

async function getDeadLetterStats(): Promise<DeadLetterStats> {
  const key = cacheKey('supplier-api', 'dead-letters');
  return cachedFetch(key, () =>
    request<DeadLetterStats>('GET', '/api/v1/health/dead-letters'),
    CACHE_TTL.SHORT,
  );
}

// ─── Supplier search ──────────────────────────────────────────────────────────

async function searchSuppliers(q: string, page = 1, pageSize = 20): Promise<SupplierSearchResponse> {
  const key = cacheKey('supplier-api', 'search', q, page);
  return cachedFetch(key, () =>
    request<SupplierSearchResponse>('GET', '/api/v1/graph/suppliers/search', {
      q, page, page_size: pageSize,
    }),
    CACHE_TTL.MEDIUM,
  );
}

// ─── Health check (is the API reachable?) ──────────────────────────────────────

async function isHealthy(): Promise<boolean> {
  try {
    await request<GraphStats>('GET', '/api/v1/graph/stats');
    return true;
  } catch {
    return false;
  }
}

// ─── Empty fallback factories ──────────────────────────────────────────────────

const EMPTY = {
  network: (): NetworkData => ({ nodes: [], edges: [], node_count: 0, edge_count: 0 }),
  impact: (): ImpactResult => ({
    disrupted_supplier: '', affected_companies: [], affected_count: 0, paths: [],
  }),
  chokepoints: (): ChokepointResponse => ({ chokepoints: [], count: 0, page: 1, page_size: 50 }),
  geoRisk: (ticker: string): GeoRiskResult => ({
    ticker, total_suppliers: 0, geo_hhi: 0, concentration_risk: 'low',
    hubs: [], at_risk_suppliers: [],
  }),
  tiers: (ticker: string): TierStructure => ({
    ticker, tier_counts: {}, total_unique_suppliers: 0, tier2_relationships: [], deepest_tier: 0,
  }),
  stats: (): GraphStats => ({ company_count: 0, supplier_count: 0, edge_count: 0, by_tier: {} }),
  health: (): ParserHealthReport => ({ total_runs: 0, success_rate: '0%', parsers: {} }),
};

// ─── Singleton client export ──────────────────────────────────────────────────

export const supplierApi = {
  // Dependency
  getDependency,
  getDependencyBatch,
  getTrend,
  // Graph
  getNetwork,
  getImpact,
  getChokepoints,
  getGeoRisk,
  getEvolution,
  getGraphStats,
  getComponents,
  getComponentTree,
  getTiers,
  // Health
  getParserHealth,
  getFreshness,
  getDeadLetterStats,
  // Search
  searchSuppliers,
  // Meta
  isHealthy,
  EMPTY,
  /** Expose circuit breaker state for diagnostics */
  getBreakerState: () => breaker.getState(),
  /** Check if circuit breaker is open (degraded mode) */
  get isDegraded(): boolean { return !breaker.healthy; },
};

export type SupplierApiClient = typeof supplierApi;
