import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, apiError } from '@/lib/api-utils';
import { runSandbox, SCENARIOS } from '@/lib/services/agent-sandbox.service';
import {
  runStrategyComparison,
  optimizeStrategyParams,
  suggestStrategyParams,
  compareStrategies,
} from '@/lib/engine/strategy-sandbox';
import {
  STRATEGY_TEMPLATES,
  STRATEGY_TEMPLATE_LIST,
  getStrategyTemplate,
} from '@/lib/engine/strategy-templates';

const VALID_SCENARIOS = Object.keys(SCENARIOS);

// ═══════════════════════════════════════════════════════════════════════════════
// GET  — run standard sandbox (legacy)
// ═══════════════════════════════════════════════════════════════════════════════

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const scenario = (searchParams.get('scenario') as string) || 'perfect_storm';
  const rounds = parseInt(searchParams.get('rounds') || '100');
  const seedParam = searchParams.get('seed');

  if (!VALID_SCENARIOS.includes(scenario)) {
    return NextResponse.json({
      error: `Unknown scenario: ${scenario}. Available: ${VALID_SCENARIOS.join(', ')}`,
    }, { status: 400 });
  }

  const seed = seedParam ? (isNaN(Number(seedParam)) ? seedParam : Number(seedParam)) : undefined;
  const report = await runSandbox({
    scenario: scenario as 'baseline' | 'trade_war' | 'typhoon_season' | 'perfect_storm',
    rounds: Math.min(rounds, 200),
    seed,
  });
  return NextResponse.json({ success: true, ...report });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST — strategy operations
// ═══════════════════════════════════════════════════════════════════════════════

export const POST = withErrorHandler(async (request: NextRequest) => {
  const body: Record<string, unknown> = await request.json();
  const { action } = body;

  switch (action) {

    // ─── list_strategies ─────────────────────────────────────────────────
    case 'list_strategies': {
      return NextResponse.json({
        success: true,
        strategies: STRATEGY_TEMPLATE_LIST,
      });
    }

    // ─── compare_strategies ──────────────────────────────────────────────
    case 'compare_strategies': {
      const scenario = String(body.scenario || 'perfect_storm');
      if (!VALID_SCENARIOS.includes(scenario)) {
        return apiError(`Unknown scenario: ${scenario}. Available: ${VALID_SCENARIOS.join(', ')}`, 400);
      }

      const rawStrategies = body.strategies as Array<{
        id: string;
        params?: Record<string, number>;
      }> | undefined;

      if (!Array.isArray(rawStrategies) || rawStrategies.length === 0) {
        return apiError('strategies must be a non-empty array of {id, params?}', 400);
      }

      const ids = rawStrategies.map(s => s.id);
      const params = rawStrategies.map(s => s.params ?? {});

      // Validate all strategy IDs
      for (const id of ids) {
        if (!getStrategyTemplate(id)) {
          return apiError(`Unknown strategy: ${id}`, 400);
        }
      }

      const result = await runStrategyComparison(scenario, ids, params);
      return NextResponse.json({ success: true, ...result });
    }

    // ─── optimize ────────────────────────────────────────────────────────
    case 'optimize': {
      const strategyId = String(body.strategyId || '');
      const scenario = String(body.scenario || 'perfect_storm');
      const rawRanges = body.paramRanges as Record<string, [number, number]> | undefined;

      if (!strategyId) return apiError('strategyId is required', 400);
      if (!getStrategyTemplate(strategyId)) {
        return apiError(`Unknown strategy: ${strategyId}`, 400);
      }
      if (!rawRanges || Object.keys(rawRanges).length === 0) {
        return apiError('paramRanges must be a non-empty object', 400);
      }

      const result = await optimizeStrategyParams(strategyId, scenario, rawRanges);
      return NextResponse.json({ success: true, ...result });
    }

    // ─── suggest_params (LLM-assisted) ────────────────────────────────────
    case 'suggest_params': {
      const strategyId = String(body.strategyId || '');
      if (!strategyId) return apiError('strategyId is required', 400);
      const template = getStrategyTemplate(strategyId);
      if (!template) return apiError(`Unknown strategy: ${strategyId}`, 400);

      const result = await suggestStrategyParams(template, template.applyStrategy(
        // Use a minimal default state — the LLM works with text description
        {
          round: 0,
          products: [],
          inventory: {},
          shipments: [],
          suppliers: [],
          marketDemand: 100,
          exchangeRate: 7.25,
          weatherSeverity: 15,
          tariffRate: 7.5,
          totalRevenueLost: 0,
          totalDelays: 0,
          stockoutEvents: 0,
        },
        {},
      ));

      return NextResponse.json({ success: true, strategyId, suggestedParams: result });
    }

    default:
      return apiError(
        `Unknown action: ${action}. Available: list_strategies, compare_strategies, optimize, suggest_params`,
        400,
      );
  }
});
