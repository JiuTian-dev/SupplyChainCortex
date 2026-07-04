/**
 * API Route — Supplier Graph Proxy
 *
 * Proxies Cortex → Supplier API calls with caching, circuit breaker,
 * and graceful degradation. All endpoints are read-only GET.
 *
 * Route: GET /api/supplier-graph?endpoint=xxx&param=yyy...
 */

/**
 * @internal 待评估 — 此路由在前端组件中无直接调用，疑似无运行时引用。
 * 决策：保留以备运维/外部系统/未来用途，但标注待评估。
 * 评估建议：如确认无任何调用方（含外部脚本、Prometheus、运维工具），可考虑删除。
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, AppError } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { supplierApi } from '@/lib/services/supplier-api.client';
import { optionalRequireAuth } from '@/lib/auth-helpers';

type GraphEndpoint = 'network' | 'impact' | 'chokepoints' | 'geo-risk'
  | 'evolution' | 'stats' | 'components' | 'component-tree'
  | 'tiers' | 'dependency' | 'trend' | 'freshness'
  | 'parser-health' | 'supplier-search';

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint') as GraphEndpoint | null;

  if (!endpoint) {
    return NextResponse.json(
      { error: 'Missing endpoint parameter', availableEndpoints: VALID_ENDPOINTS },
      { status: 400 },
    );
  }

  if (!VALID_ENDPOINTS.includes(endpoint)) {
    return NextResponse.json(
      { error: `Unknown endpoint: ${endpoint}`, availableEndpoints: VALID_ENDPOINTS },
      { status: 400 },
    );
  }

  try {
    const data = await routeEndpoint(endpoint, searchParams);

    return NextResponse.json({
      data,
      meta: {
        endpoint,
        degraded: supplierApi.isDegraded,
        breakerState: supplierApi.getBreakerState().state,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[supplier-graph] ${endpoint} failed: ${message}`);

    if (supplierApi.isDegraded) {
      throw new AppError(
        `Supplier API circuit breaker open — using degraded mode: ${message}`,
        503,
        'CIRCUIT_OPEN',
      );
    }

    throw new AppError(
      `Supplier API error: ${message} (endpoint: ${endpoint})`,
      502,
      'SUPPLIER_API_ERROR',
    );
  }
}));

const VALID_ENDPOINTS = [
  'network', 'impact', 'chokepoints', 'geo-risk',
  'evolution', 'stats', 'components', 'component-tree',
  'tiers', 'dependency', 'trend', 'freshness',
  'parser-health', 'supplier-search',
];

async function routeEndpoint(
  endpoint: GraphEndpoint,
  params: URLSearchParams,
): Promise<unknown> {
  switch (endpoint) {
    case 'network':
      return supplierApi.getNetwork(
        params.get('ticker') || '',
        Number(params.get('depth')) || 2,
        params.get('component') || undefined,
        params.get('component_category') || undefined,
      );

    case 'impact':
      return supplierApi.getImpact(
        params.get('supplier') || '',
        Number(params.get('depth')) || 3,
      );

    case 'chokepoints':
      return supplierApi.getChokepoints(
        Number(params.get('page')) || 1,
        Number(params.get('page_size')) || 50,
      );

    case 'geo-risk':
      return supplierApi.getGeoRisk(params.get('ticker') || '');

    case 'evolution':
      return supplierApi.getEvolution(
        params.get('ticker') || '',
        Number(params.get('months')) || 6,
      );

    case 'stats':
      return supplierApi.getGraphStats();

    case 'components':
      return supplierApi.getComponents(
        params.get('component') || undefined,
        params.get('component_category') || undefined,
        Number(params.get('page')) || 1,
        Number(params.get('page_size')) || 50,
      );

    case 'component-tree':
      return supplierApi.getComponentTree();

    case 'tiers':
      return supplierApi.getTiers(params.get('ticker') || '');

    case 'dependency':
      return supplierApi.getDependency(
        params.get('ticker') || '',
        params.get('region') || 'CN',
      );

    case 'trend':
      return supplierApi.getTrend(
        params.get('ticker') || '',
        params.get('region') || 'CN',
        Number(params.get('days')) || 30,
      );

    case 'freshness':
      return supplierApi.getFreshness(
        Number(params.get('page')) || 1,
        Number(params.get('page_size')) || 50,
      );

    case 'parser-health':
      return supplierApi.getParserHealth();

    case 'supplier-search':
      return supplierApi.searchSuppliers(
        params.get('q') || '',
        Number(params.get('page')) || 1,
        Number(params.get('page_size')) || 20,
      );

    default:
      throw new Error(`Unhandled endpoint: ${endpoint}`);
  }
}
