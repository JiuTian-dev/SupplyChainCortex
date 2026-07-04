// src/lib/audit/trace-writer.ts
import { db } from '@/lib/db';
import type { FSMContext, ToolResult } from '@/lib/agent/fsm-types';
import type { DecisionPassport } from '@/lib/engine/passport';
import {
  computeTraceContentHash,
  signContentHash,
  getLastTraceHash,
} from './crypto-trail';

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

  // Fallback: if no [claim-N] found and text is long, look for MARC-tagged statements
  if (results.length === 0 && text.length > 500) {
    const marcRegex = /(.+?)\[T\d-(MCP|KB|Search|LLM)\]\[(高|中|低|high|medium|low)\]/g;
    let marcMatch;
    while ((marcMatch = marcRegex.exec(text)) !== null) {
      results.push({
        text: marcMatch[1].trim().slice(0, 500),
        source: marcMatch[2],
        confidence: ['高', 'high'].includes(marcMatch[3]) ? 'high' : ['中', 'medium'].includes(marcMatch[3]) ? 'medium' : 'low',
      });
    }
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
    const elapsed = Date.now() - ctx.startTimeMs;

    const historySummary = ctx.history?.length > 0
      ? ctx.history.slice(-4).map(m => `${m.role}: ${m.content?.slice(0, 80)}`).join(' | ')
      : null;

    const previousHash = await getLastTraceHash();
    const createdAt = new Date();

    const contentHash = computeTraceContentHash({
      id: 'pending',
      auditId: passport.auditId,
      userQuery: ctx.query,
      intent: ctx.routing?.intent || 'unknown',
      confidence: passport.confidence,
      mode: 'fsm-v2',
      tier: ctx.routing ? (ctx.routing.shouldUseTools ? 1 : ctx.routing.shouldSearch ? 3 : 0) : 0,
      durationMs: elapsed,
      toolsUsed: [...new Set(ctx.toolsUsed)],
      claimsCount: claims.length,
      passport: {
        auditId: passport.auditId,
        generatedAt: passport.generatedAt,
        engine: passport.engine,
        confidence: passport.confidence,
        ruleVersion: passport.ruleVersion,
        dataProvenance: passport.dataProvenance,
        alternatives: passport.alternatives,
        trace: passport.trace,
        warnings: passport.warnings,
      },
      userId: undefined,
      summary: historySummary || undefined,
      createdAt,
      previousHash,
    });

    const signature = signContentHash(contentHash);

    const trace = await db.decisionTrace.create({
      data: {
        auditId: passport.auditId,
        userQuery: ctx.query,
        intent: ctx.routing?.intent || 'unknown',
        confidence: passport.confidence,
        mode: 'fsm-v2',
        tier: ctx.routing ? (ctx.routing.shouldUseTools ? 1 : ctx.routing.shouldSearch ? 3 : 0) : 0,
        durationMs: elapsed,
        toolsUsed: [...new Set(ctx.toolsUsed)],
        claimsCount: claims.length,
        summary: historySummary || undefined,
        passport: JSON.parse(JSON.stringify({
          auditId: passport.auditId,
          generatedAt: passport.generatedAt,
          engine: passport.engine,
          confidence: passport.confidence,
          ruleVersion: passport.ruleVersion,
          dataProvenance: passport.dataProvenance,
          alternatives: passport.alternatives,
          trace: passport.trace,
          warnings: passport.warnings,
        })),
        previousHash,
        contentHash,
        signature,
        steps: {
          create: buildStepData(ctx, claims, passport, elapsed),
        },
      },
      include: { steps: true },
    });

    return trace.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[TraceWriter] Failed to write trace for auditId=${passport.auditId}: ${msg}`);
    if (err instanceof Error && err.stack) {
      console.error('[TraceWriter] Stack:', err.stack.split('\n').slice(0, 3).join('\n'));
    }
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
  // `any[]` is acceptable here because stepData is constructed for Prisma create,
  // and Prisma's specific create types vary per schema. Using a narrower type would
  // require importing Prisma types and would not add meaningful safety.
  let resultCursor = 0;

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

    if (planTools.length > 0) {
      // Find matching tool results for this round using sequential cursor
      const roundResults: ToolResult[] = [];
      for (const tc of planTools) {
        for (let i = resultCursor; i < ctx.toolResults.length; i++) {
          if (ctx.toolResults[i].tool === tc.name) {
            roundResults.push(ctx.toolResults[i]);
            resultCursor = i + 1;
            break;
          }
        }
      }

      // Execute step
      stepData.push({
        stepIndex: roundBase + 1,
        state: 'execute',
        confidence: ctx.routing?.confidence,
        findings: `Executed ${planTools.length} tool(s)`,
        nextState: 'observe',
        durationMs: 0,
        toolCalls: {
          create: roundResults.map(r => ({
              toolName: r.tool,
              params: planTools.find(tc => tc.name === r.tool)?.params as Record<string, unknown> || {},
              result: r.success ? (r.data as Record<string, unknown> ?? { raw: String(r.data) }) : undefined,
              success: r.success,
              latencyMs: r.latencyMs,
              error: !r.success ? r.error : undefined,
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

  // Spread total duration across non-synthesize steps so they are not all zero
  const nonSynthSteps = stepData.filter(s => s.state !== 'synthesize' && s.durationMs === 0);
  const avgMs = nonSynthSteps.length > 0 ? Math.round(totalDurationMs / (nonSynthSteps.length + 1)) : 0;
  for (const step of nonSynthSteps) {
    step.durationMs = avgMs;
  }

  return stepData;
}
