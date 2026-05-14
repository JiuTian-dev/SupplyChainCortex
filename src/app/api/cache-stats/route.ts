/**
 * Cache Stats API
 *
 * GET /api/cache-stats  → query cache statistics
 * POST /api/cache-stats  → { action: 'clear' } → clear all cache
 */

import { NextRequest } from 'next/server';
import { withErrorHandler, apiSuccess } from '@/lib/api-utils';
import { queryCache } from '@/lib/engine/query-cache';

export const dynamic = 'force-dynamic';

async function handleGet() {
  return apiSuccess(queryCache.getStats());
}

async function handlePost(request: NextRequest) {
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
