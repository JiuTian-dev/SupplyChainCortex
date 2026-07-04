import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { getTraces, getTraceStats } from '@/lib/audit/trace-reader';
import { optionalRequireAuth } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'list';

  if (action === 'stats') {
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;
    const data = await getTraceStats({ from, to });
    return NextResponse.json({ success: true, data });
  }

  // Default: list traces
  const intent = searchParams.get('intent') || undefined;
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(50, parseInt(searchParams.get('limit') || '20'));

  const data = await getTraces({ intent, from, to, page, limit });
  return NextResponse.json({ success: true, data });
}));
