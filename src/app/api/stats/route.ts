// 供应链统计聚合 API
// GET: 获取按时间范围聚合的统计数据
// 参数: period (7d/30d/90d)

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { getStats } from '@/lib/queries/stats.queries';

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || '30d';
  const sku = searchParams.get('sku') || undefined;

  const result = await getStats(period, sku);

  return NextResponse.json(result);
}));
