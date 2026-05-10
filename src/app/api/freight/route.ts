import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { getFreightRates } from '@/lib/services/freight.service';

export const GET = withErrorHandler(async (_request: NextRequest) => {
  const report = await getFreightRates();
  return NextResponse.json(report);
});
