import { NextRequest } from 'next/server';
import { withErrorHandler, apiSuccess, parsePagination } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { getAuditLogs, getAuditStats } from '@/lib/services/audit.service';

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'list';

  switch (action) {
    case 'list': {
      const pagination = parsePagination(searchParams);
      const result = await getAuditLogs({
        action: searchParams.get('action_filter') || undefined,
        entity: searchParams.get('entity') || undefined,
        sku: searchParams.get('sku') || undefined,
        userId: searchParams.get('userId') || undefined,
        severity: searchParams.get('severity') || undefined,
        startDate: searchParams.get('startDate') || undefined,
        endDate: searchParams.get('endDate') || undefined,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });
      return apiSuccess(result);
    }

    case 'stats': {
      const days = parseInt(searchParams.get('days') || '30');
      const stats = await getAuditStats(days);
      return apiSuccess(stats);
    }

    default:
      return apiSuccess({ message: 'Audit API available actions: list, stats' });
  }
}));
