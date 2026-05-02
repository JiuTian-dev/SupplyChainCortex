import { NextRequest } from 'next/server';
import { withErrorHandler, apiSuccess, apiError } from '@/lib/api-utils';
import { serverCache } from '@/lib/cache';

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const stats = serverCache.stats();
  return apiSuccess({
    size: stats.size,
    keys: stats.keys,
    hitCounts: stats.hitCounts,
  });
});

// Invalidate cache (POST with { prefix } or { all: true })
export const POST = withErrorHandler(async (req: NextRequest) => {
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
