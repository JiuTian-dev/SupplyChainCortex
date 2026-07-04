import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { getFreightRates } from '@/lib/services/freight.service';

export const GET = withApiRateLimit(withErrorHandler(async (_request: NextRequest) => {
  await optionalRequireAuth();
  const report = await getFreightRates();
  return NextResponse.json(report);
}));
