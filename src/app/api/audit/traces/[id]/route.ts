import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, NotFoundError } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { getTraceById, deleteTrace } from '@/lib/audit/trace-reader';
import { optionalRequireAuth, requireAdmin } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

export const GET = withApiRateLimit(withErrorHandler(async (
  _request: NextRequest,
  context?: unknown,
) => {
  await optionalRequireAuth();
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const trace = await getTraceById(id);
  if (!trace) throw NotFoundError('Not found');
  return NextResponse.json({ success: true, data: trace });
}));

export const DELETE = withApiRateLimit(withErrorHandler(async (
  _request: NextRequest,
  context?: unknown,
) => {
  await requireAdmin();
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  await deleteTrace(id);
  return NextResponse.json({ success: true });
}));
