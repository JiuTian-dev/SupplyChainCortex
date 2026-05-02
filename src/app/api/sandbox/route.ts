import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { runSandbox, SCENARIOS } from '@/lib/services/agent-sandbox.service';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const scenario = (searchParams.get('scenario') as string) || 'perfect_storm';
  const rounds = parseInt(searchParams.get('rounds') || '100');
  const seedParam = searchParams.get('seed');

  if (!Object.keys(SCENARIOS).includes(scenario)) {
    return NextResponse.json({ error: `Unknown scenario: ${scenario}. Available: ${Object.keys(SCENARIOS).join(', ')}` }, { status: 400 });
  }

  const seed = seedParam ? (isNaN(Number(seedParam)) ? seedParam : Number(seedParam)) : undefined;
  const report = await runSandbox({
    scenario: scenario as "baseline" | "trade_war" | "typhoon_season" | "perfect_storm",
    rounds: Math.min(rounds, 200),
    seed,
  });
  return NextResponse.json({ success: true, ...report });
});
