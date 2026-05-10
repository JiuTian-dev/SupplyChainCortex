/**
 * GET /api/agent-memory — read shared agent context (cross-agent awareness)
 * POST /api/agent-memory?action=clear — clear memory (debug/testing)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { agentMemory } from '@/lib/engine/memory';

export const GET = withErrorHandler(async (_request: NextRequest) => {
  const ctx = agentMemory.getSharedContext();
  const namespaces = agentMemory.getNamespaces();
  return NextResponse.json({
    shared: ctx,
    namespaces,
    updatedAt: new Date().toISOString(),
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('action') === 'clear') {
    agentMemory._clear();
    return NextResponse.json({ success: true, message: 'Agent memory cleared' });
  }
  return NextResponse.json({ success: false, message: 'Unknown action' }, { status: 400 });
});
