// src/lib/audit/trace-writer.ts
import { db } from '@/lib/db';
import type { FSMContext } from '@/lib/agent/fsm-types';
import type { DecisionPassport } from '@/lib/engine/passport';

export function extractClaims(
  text: string,
): Array<{ text: string; source: string; confidence: string }> {
  const results: Array<{ text: string; source: string; confidence: string }> = [];
  const claimRegex = /\[claim-(\d+)\]\s*([\s\S]+?)(?=\[claim-\d+\]|$)/g;
  let match;

  while ((match = claimRegex.exec(text)) !== null) {
    const claimText = match[2].trim();
    const sourceMatch = claimText.match(/\[T\d-(MCP|KB|Search|LLM)\]/);
    const source = sourceMatch ? sourceMatch[1] : 'LLM';
    const confMatchEN = claimText.match(/\[(high|medium|low)\]/i);
    const confMatchZH = claimText.match(/\[(高|中|低)\]/);
    const confidence = confMatchEN
      ? confMatchEN[1].toLowerCase()
      : confMatchZH
        ? ({ '高': 'high', '中': 'medium', '低': 'low' }[confMatchZH[1]] || 'medium')
        : 'medium';

    results.push({ text: claimText.slice(0, 500), source, confidence });
  }
  return results;
}

export async function writeTrace(
  ctx: FSMContext,
  finalResponse: string,
  passport: DecisionPassport,
): Promise<string | null> {
  try {
    const claims = extractClaims(finalResponse);

    const trace = await db.decisionTrace.create({
      data: {
        auditId: passport.auditId,
        userQuery: ctx.query,
        intent: ctx.routing?.intent || 'unknown',
        confidence: passport.confidence,
        mode: 'fsm-v2',
        tier: ctx.routing?.shouldUseTools ? 1 : ctx.routing?.shouldSearch ? 3 : 0,
        durationMs: Date.now() - ctx.startTimeMs,
        toolsUsed: ctx.toolsUsed,
        claimsCount: claims.length,
        passport: JSON.parse(JSON.stringify(passport)),
        steps: {
          create: buildStepData(ctx, claims, passport, Date.now() - ctx.startTimeMs),
        },
      },
      include: { steps: true },
    });

    return trace.id;
  } catch (err) {
    console.error('[TraceWriter] Failed to write trace:', (err as Error).message);
    return null;
  }
}

function buildStepData(
  ctx: FSMContext,
  claims: ReturnType<typeof extractClaims>,
  passport: DecisionPassport,
  totalDurationMs: number,
) {
  const stepData: any[] = [];

  // Classify step
  stepData.push({
    stepIndex: 0,
    state: 'classify',
    confidence: ctx.routing?.confidence,
    findings: ctx.routing
      ? `Intent: ${ctx.routing.intent}, Confidence: ${(ctx.routing.confidence * 100).toFixed(0)}%`
      : 'No routing',
    nextState: 'plan',
    durationMs: 0,
    toolCalls: { create: [] },
    claims: { create: [] },
  });

  // For each round: plan -> execute -> observe -> decide
  for (let round = 0; round < ctx.round; round++) {
    const roundBase = 1 + round * 4;

    // Plan step
    const planTools = ctx.plan || [];
    stepData.push({
      stepIndex: roundBase,
      state: 'plan',
      confidence: ctx.routing?.confidence,
      findings: `Round ${round + 1}: Planned ${planTools.length} tool(s)`,
      nextState: planTools.length > 0 ? 'execute' : 'synthesize',
      durationMs: 0,
      toolCalls: { create: [] },  // tool calls go to execute step
      claims: { create: [] },
    });

    // Execute step
    stepData.push({
      stepIndex: roundBase + 1,
      state: 'execute',
      confidence: ctx.routing?.confidence,
      findings: `Executed ${planTools.length} tool(s)`,
      nextState: 'observe',
      durationMs: 0,
      toolCalls: {
        create: planTools.map(tc => ({
          toolName: tc.name,
          params: tc.params as Record<string, unknown>,
          result: undefined,
          success: true,
          latencyMs: 0,
        })),
      },
      claims: { create: [] },
    });

    // Observe step
    const obs = ctx.observations[round];
    stepData.push({
      stepIndex: roundBase + 2,
      state: 'observe',
      confidence: obs?.overallConfidence,
      findings: obs
        ? `Valid: ${obs.validResults.length}/${ctx.toolResults.length}, Conflicts: ${obs.conflicts.length}, Missing: ${obs.missingData.join(', ') || 'none'}`
        : 'No observations',
      nextState: 'decide',
      durationMs: 0,
      toolCalls: { create: [] },
      claims: { create: [] },
    });

    // Decide step
    const hasData = ctx.toolResults.some(r => r.success);
    stepData.push({
      stepIndex: roundBase + 3,
      state: 'decide',
      confidence: obs?.overallConfidence,
      findings: hasData ? 'Sufficient data, proceeding to synthesize' : 'No data, re-planning',
      nextState: hasData ? 'synthesize' : (round + 1 < ctx.config.maxRounds ? 'plan' : 'synthesize'),
      durationMs: 0,
      toolCalls: { create: [] },
      claims: { create: [] },
    });
  }

  // Synthesize step
  stepData.push({
    stepIndex: stepData.length,
    state: 'synthesize',
    confidence: passport.confidence,
    findings: `Produced ${claims.length} claim(s) across ${ctx.toolsUsed.length} tool(s) in ${totalDurationMs}ms`,
    nextState: null,
    durationMs: totalDurationMs,
    toolCalls: { create: [] },
    claims: {
      create: claims.map((c, i) => ({
        claimIndex: i + 1,
        text: c.text,
        source: c.source,
        confidence: c.confidence,
      })),
    },
  });

  return stepData;
}
