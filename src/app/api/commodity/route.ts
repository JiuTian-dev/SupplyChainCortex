/**
 * GET /api/commodity — commodity price report for raw materials
 * GET /api/commodity?action=baseline — static baseline prices
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { getCommodityPrices } from '@/lib/services/commodity.service';

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const report = await getCommodityPrices();
  return NextResponse.json(report);
}));
