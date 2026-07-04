/**
 * Usage API
 * GET — Retrieve usage statistics for the current tenant
 */

import { NextRequest } from 'next/server';
import { withErrorHandler, apiSuccess } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth-helpers';
import { getUsageStats } from '@/lib/services/billing.service';
import { getCurrentPeriod } from '@/lib/billing/config';

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAuth();

  const tenantId = request.headers.get('x-tenant-id') || 'default';
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || getCurrentPeriod();

  const stats = await getUsageStats(tenantId, period);
  return apiSuccess({ period, stats });
});
