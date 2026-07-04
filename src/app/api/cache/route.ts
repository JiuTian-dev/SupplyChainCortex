/**
 * @internal 待评估 — 此路由在前端组件中无直接调用，疑似无运行时引用。
 * 决策：保留以备运维/外部系统/未来用途，但标注待评估。
 * 评估建议：如确认无任何调用方（含外部脚本、Prometheus、运维工具），可考虑删除。
 */

import { NextRequest } from 'next/server';
import { withErrorHandler, apiSuccess, apiError } from '@/lib/api-utils';
import { optionalRequireAuth, requireAdmin } from '@/lib/auth-helpers';
import { serverCache } from '@/lib/cache';

export const GET = withErrorHandler(async (_req: NextRequest) => {
  await optionalRequireAuth();
  const stats = await serverCache.statsAsync();
  return apiSuccess({
    size: stats.size,
    keys: stats.keys,
    hitCounts: stats.hitCounts,
  });
});

// Invalidate cache (POST with { prefix } or { all: true })
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const body = await req.json();
  if (body.all) {
    serverCache.clear();
    return apiSuccess({ message: 'All cache cleared' });
  }
  if (body.prefix) {
    const count = serverCache.invalidate(body.prefix);
    return apiSuccess({ message: `Invalidated ${count} entries`, count });
  }
  if (body.key) {
    const removed = serverCache.invalidateExact(body.key);
    return apiSuccess({ message: removed ? 'Key invalidated' : 'Key not found', removed });
  }
  return apiError('Provide prefix, key, or all=true', 400);
});
