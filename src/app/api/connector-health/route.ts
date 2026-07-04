/**
 * GET /api/connector-health
 *
 * Returns the live health status of every MCP connector by executing
 * the underlying data-source probes.  The client-side connection store
 * calls this on mount to seed real data before the first SSE push.
 */

import { NextResponse } from 'next/server';
import { withErrorHandler, apiSuccess } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { getConnectorHealth } from '@/lib/mcp/connector-health';

const handleGET = async (): Promise<NextResponse> => {
  await optionalRequireAuth();
  const connectors = await getConnectorHealth();
  return apiSuccess({
    connectors,
    timestamp: new Date().toISOString(),
  });
};

export const GET = withApiRateLimit(withErrorHandler(handleGET));
