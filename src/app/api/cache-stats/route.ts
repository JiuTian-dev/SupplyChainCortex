/**
 * Cache Stats API
 *
 * GET /api/cache-stats  → query cache statistics
 * POST /api/cache-stats  → { action: 'clear' } → clear all cache
 */

/**
 * @internal 待评估 — 此路由在前端组件中无直接调用，疑似无运行时引用。
 * 决策：保留以备运维/外部系统/未来用途，但标注待评估。
 * 评估建议：如确认无任何调用方（含外部脚本、Prometheus、运维工具），可考虑删除。
 */

import { NextRequest } from 'next/server';
import { withErrorHandler, apiSuccess } from '@/lib/api-utils';
import { optionalRequireAuth, requireAdmin } from '@/lib/auth-helpers';
import { queryCache } from '@/lib/engine/query-cache';

export const dynamic = 'force-dynamic';

async function handleGet() {
  await optionalRequireAuth();
  return apiSuccess(queryCache.getStats());
}

async function handlePost(request: NextRequest) {
  await requireAdmin();
  const body = await request.json().catch(() => ({}));
  if (body.action === 'clear') {
    const stats = queryCache.getStats();
    queryCache.clear();
    return apiSuccess({ message: 'Cache cleared', previousStats: stats });
  }
  return apiSuccess({ message: 'Use action=clear to clear cache' });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
