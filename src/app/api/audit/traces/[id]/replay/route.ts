// src/app/api/audit/traces/[id]/replay/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, ValidationError } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { replayTrace } from '@/lib/audit/replay-engine';
import { optionalRequireAuth } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

export const POST = withApiRateLimit(withErrorHandler(async (
  request: NextRequest,
  context?: unknown,
) => {
  await optionalRequireAuth();
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const body = await request.json();
  const { modifications } = body;

  if (!modifications || !Array.isArray(modifications) || modifications.length === 0) {
    throw ValidationError('modifications array is required');
  }

  const result = await replayTrace(id, modifications);
  return NextResponse.json({ success: true, data: result });
}));
