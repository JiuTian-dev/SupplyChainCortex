// src/app/api/audit/traces/[id]/replay/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { replayTrace } from '@/lib/audit/replay-engine';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { modifications } = body;

    if (!modifications || !Array.isArray(modifications) || modifications.length === 0) {
      return NextResponse.json(
        { success: false, error: 'modifications array is required' },
        { status: 400 },
      );
    }

    const result = await replayTrace(id, modifications);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
