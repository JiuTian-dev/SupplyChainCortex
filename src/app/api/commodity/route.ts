/**
 * GET /api/commodity — commodity price report for raw materials
 * GET /api/commodity?action=baseline — static baseline prices
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { getCommodityPrices } from '@/lib/services/commodity.service';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const report = await getCommodityPrices();
  return NextResponse.json(report);
});
