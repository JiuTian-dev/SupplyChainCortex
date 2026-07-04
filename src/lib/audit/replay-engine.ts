// src/lib/audit/replay-engine.ts
import { db } from '@/lib/db';
import { executeTool } from '@/lib/mcp/tools';
import { getAdapter } from '@/lib/agent/adapter-factory';
import type { ProviderId } from '@/lib/agent/adapter-factory';
import type { ChatMessage } from '@/lib/services/ai-providers.service';
import { SYSTEM_PROMPT } from '@/lib/agent/prompts/system-prompt';
import { extractClaims } from './trace-writer';

export interface ReplayModification {
  toolName: string;
  newParams: Record<string, unknown>;
}

export interface ReplayDiff {
  claimsChanged: number;
  claimsAddressed: number;
  claimsTotal: number;
  confidenceDelta: number;
  newToolsUsed: string[];
  originalClaims: number;
  replayedClaims: number;
  originalConfidence: number;
  replayedConfidence: number;
}

export async function replayTrace(
  originalTraceId: string,
  modifications: ReplayModification[],
  providerId: ProviderId = 'deepseek',
): Promise<{ newTraceId: string; diff: ReplayDiff }> {
  // 1. Fetch original trace (steps fetched separately to avoid heavy includes)
  const original = await db.decisionTrace.findUnique({
    where: { id: originalTraceId },
  });
  if (!original) throw new Error('Original trace not found');

  // 2. Re-execute modified tools with latency tracking
  const modifiedResults: Array<{ toolName: string; success: boolean; data: unknown; error?: string; latencyMs: number }> = [];
  for (const mod of modifications) {
    const t0 = Date.now();
    try {
      const result = await executeTool(mod.toolName, mod.newParams);
      modifiedResults.push({ toolName: mod.toolName, success: true, data: result, latencyMs: Date.now() - t0 });
    } catch (err) {
      modifiedResults.push({ toolName: mod.toolName, success: false, data: null, error: (err as Error).message, latencyMs: Date.now() - t0 });
    }
  }

  // 3. Build re-synthesis prompt
  // Note: replay only includes the original user query and modified tool results.
  // The original conversation history and previous tool results are not included,
  // which means the re-synthesis LLM lacks context from the original multi-round execution.
  const toolResultsText = modifiedResults.map(r => {
    const dataStr = JSON.stringify(r.data);
    const truncated = dataStr.length > 2000
      ? dataStr.slice(0, 1997) + '...'
      : dataStr;
    return `[${r.toolName}] ${r.success ? truncated : `Error: ${r.error}`}`;
  }).join('\n\n');

  const synthesisMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}\n\n## 反事实回放分析\n原始查询: ${original.userQuery}\n\n修改后的工具结果:\n${toolResultsText}\n\n请基于新的工具结果生成分析。每个数字带 [来源][置信度] 标签。`,
    },
    { role: 'user', content: original.userQuery },
  ];

  // 4. Call LLM for re-synthesis
  let replayedResponse = '';
  try {
    const adapter = getAdapter(providerId);
    for await (const chunk of adapter.streamText(synthesisMessages, { maxTokens: 4000, temperature: 0.7 })) {
      if (chunk.type === 'token' && chunk.content) replayedResponse += chunk.content;
      if (chunk.type === 'error') {
        console.error('[Replay] LLM synthesis error:', chunk.error);
        break;
      }
    }
  } catch (err) {
    console.error('[Replay] Failed to call LLM for re-synthesis:', (err as Error).message);
    replayedResponse = `[Replay synthesis failed: ${(err as Error).message}] Original analysis may still be valid.`;
  }

  // 5. Extract claims from replayed response
  const replayedClaims = extractClaims(replayedResponse);
  const originalClaims = original.claimsCount;
  const replayedConfidence = replayedClaims.length > 0
    ? replayedClaims.filter(c => c.confidence === 'high').length / replayedClaims.length
    : 0.5;

  // 5b. Fetch original claims for text-level comparison
  const origClaims = await db.tracedClaim.findMany({
    where: { step: { traceId: original.id, state: 'synthesize' } },
  });
  const addressedClaims = origClaims.filter(oc =>
    replayedResponse.includes(oc.text.slice(0, 50))
  );

  // 6. Persist as new trace
  const newTrace = await db.decisionTrace.create({
    data: {
      auditId: `replay-${original.auditId}-${Date.now()}`,
      userQuery: `[回放] ${original.userQuery}`,
      intent: original.intent,
      confidence: replayedConfidence,
      mode: 'fsm-v2-replay',
      tier: original.tier,
      durationMs: 0,
      toolsUsed: modifications.map(m => m.toolName),
      claimsCount: replayedClaims.length,
      passport: JSON.parse(JSON.stringify({ replayOf: original.auditId })),
      summary: `Counterfactual replay of ${original.auditId}. Modified tools: ${modifications.map(m => m.toolName).join(', ')}. Note: replay compresses all execution into one synthesize step.`,
      steps: {
        create: [{
          stepIndex: 0,
          state: 'synthesize',
          confidence: replayedConfidence,
          findings: `Replayed with ${modifications.length} modification(s): ${modifications.map(m => m.toolName).join(', ')}`,
          durationMs: 0,
          toolCalls: {
            create: modifiedResults.map(r => ({
              toolName: r.toolName,
              params: JSON.parse(JSON.stringify(modifications.find(m => m.toolName === r.toolName)?.newParams || {})),
              result: r.data ? JSON.parse(JSON.stringify(r.data)) : undefined,
              success: r.success,
              latencyMs: r.latencyMs,
              error: r.error,
            })),
          },
          claims: {
            create: replayedClaims.map((c, i) => ({
              claimIndex: i + 1,
              text: c.text,
              source: c.source,
              confidence: c.confidence,
            })),
          },
        }],
      },
    },
  });

  // 7. Compute diff
  const diff: ReplayDiff = {
    claimsChanged: Math.abs(originalClaims - replayedClaims.length),
    claimsAddressed: addressedClaims.length,
    claimsTotal: origClaims.length,
    confidenceDelta: Math.round((replayedConfidence - original.confidence) * 100) / 100,
    newToolsUsed: modifications.map(m => m.toolName),
    originalClaims,
    replayedClaims: replayedClaims.length,
    originalConfidence: original.confidence,
    replayedConfidence,
  };

  return { newTraceId: newTrace.id, diff };
}
