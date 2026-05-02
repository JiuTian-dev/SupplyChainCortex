/**
 * LLM-Driven Multi-Agent Sandbox API.
 *
 * GET /api/sandbox-llm?rounds=10        → run all 4 agents with LLM
 * GET /api/sandbox-llm?role=warehouse    → run single agent
 * GET /api/sandbox-llm?mode=compare      → compare LLM vs rule-based outputs
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { runLLMAgent, runAllAgents } from '@/lib/engine/llm-agent';
import { runSandbox } from '@/lib/services/agent-sandbox.service';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const rounds = parseInt(searchParams.get('rounds') || '5');
  const role = searchParams.get('role');
  const mode = searchParams.get('mode') || 'run';

  // Initialize sandbox state
  const sandboxResult = await runSandbox({
    scenario: 'baseline',
    rounds: Math.min(rounds, 20),
    seed: searchParams.get('seed') || '42',
  });

  const state = {
    round: rounds,
    weatherSeverity: (sandboxResult as any).weatherSeverity || 20,
    exchangeRate: (sandboxResult as any).exchangeRate || 7.25,
    tariffRate: (sandboxResult as any).tariffRate || 7.5,
    marketDemand: (sandboxResult as any).marketDemand || 100,
    inventory: [
      { sku: 'RC-4001', quantity: 200, safetyStock: 150, status: 'healthy' },
      { sku: 'RC-4002', quantity: 80, safetyStock: 120, status: 'warning' },
      { sku: 'RC-4003', quantity: 30, safetyStock: 100, status: 'critical' },
    ],
    shipments: [
      { id: 'SH-001', delayDays: 2, status: 'in_transit', eta: 5 },
      { id: 'SH-002', delayDays: 7, status: 'delayed', eta: 12 },
    ],
    suppliers: [
      { name: '深圳供应商A', rating: 4.5, leadTime: 7 },
      { name: '绍兴供应商B', rating: 3.2, leadTime: 14 },
      { name: '越南供应商C', rating: 4.0, leadTime: 21 },
    ],
    stockoutEvents: (sandboxResult as any).stockoutEvents || 0,
    totalDelays: (sandboxResult as any).totalDelays || 0,
  };

  // ── Single agent mode ──────────────────────────────────────────────
  if (role && ['warehouse', 'supplier', 'forwarder', 'market'].includes(role)) {
    const decision = await runLLMAgent({ role: role as any, state });
    return NextResponse.json({
      success: true,
      mode: 'single',
      role,
      state: { round: state.round, weatherSeverity: state.weatherSeverity, exchangeRate: state.exchangeRate },
      decision,
    });
  }

  // ── Compare mode: LLM vs rule-based ────────────────────────────────
  if (mode === 'compare') {
    const llmDecisions = await runAllAgents(state);
    return NextResponse.json({
      success: true,
      mode: 'compare',
      state: { round: state.round, weatherSeverity: state.weatherSeverity },
      decisions: llmDecisions,
      note: 'fallback=true means LLM was unavailable and rule-based logic was used',
    });
  }

  // ── All agents mode ─────────────────────────────────────────────────
  const decisions = await runAllAgents(state);
  return NextResponse.json({
    success: true,
    mode: 'all',
    state: { round: state.round, weatherSeverity: state.weatherSeverity, exchangeRate: state.exchangeRate },
    decisions,
    summary: Object.entries(decisions).map(([role, d]) => ({
      role,
      action: d.action,
      confidence: d.confidence,
      llmMode: !d.fallback,
    })),
  });
});
