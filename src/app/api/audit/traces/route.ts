import { NextRequest, NextResponse } from 'next/server';
import { getTraces, getTraceStats } from '@/lib/audit/trace-reader';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'list';

  if (action === 'stats') {
    try {
      const from = searchParams.get('from') || undefined;
      const to = searchParams.get('to') || undefined;
      const data = await getTraceStats({ from, to });
      return NextResponse.json({ success: true, data });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: (err as Error).message },
        { status: 500 },
      );
    }
  }

  // Default: list traces
  const intent = searchParams.get('intent') || undefined;
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(50, parseInt(searchParams.get('limit') || '20'));

  try {
    const data = await getTraces({ intent, from, to, page, limit });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
