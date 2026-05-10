import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { getGSCPI } from '@/lib/services/gscpi.service';

export const GET = withErrorHandler(async (_request: NextRequest) => {
  const report = await getGSCPI();
  return NextResponse.json(report);
});
