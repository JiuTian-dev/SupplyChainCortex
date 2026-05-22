// src/lib/audit/replay-engine.ts
import { db } from '@/lib/db';
import { executeTool } from '@/lib/mcp/tools';
import { getAdapter } from '@/lib/agent/adapter-factory';
import type { ProviderId } from '@/lib/agent/adapter-factory';
import type { ChatMessage } from '@/lib/services/ai-providers.service';
import { SYSTEM_PROMPT } from '@/app/api/chat/chat.prompt';
import { extractClaims } from './trace-writer';

export interface ReplayModification {
  toolName: string;
  newParams: Record<string, unknown>;
}

export interface ReplayDiff {
  claimsChanged: number;
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
  // 1. Fetch original trace
  const original = await db.decisionTrace.findUnique({
    where: { id: originalTraceId },
    include: { steps: { include: { toolCalls: true, claims: true } } },
  });
  if (!original) throw new Error('Original trace not found');

  // 2. Re-execute modified tools
  const modifiedResults: Array<{ toolName: string; success: boolean; data: unknown; error?: string }> = [];
  for (const mod of modifications) {
    try {
      const result = await executeTool(mod.toolName, mod.newParams);
      modifiedResults.push({ toolName: mod.toolName, success: true, data: result });
    } catch (err) {
      modifiedResults.push({ toolName: mod.toolName, success: false, data: null, error: (err as Error).message });
    }
  }

  // 3. Build re-synthesis prompt
  const toolResultsText = modifiedResults.map(r =>
    `[${r.toolName}] ${r.success ? JSON.stringify(r.data).slice(0, 2000) : `Error: ${r.error}`}`
  ).join('\n\n');

  const synthesisMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}\n\n## 反事实回放分析\n原始查询: ${original.userQuery}\n\n修改后的工具结果:\n${toolResultsText}\n\n请基于新的工具结果生成分析。每个数字带 [来源][置信度] 标签。`,
    },
    { role: 'user', content: original.userQuery },
  ];

  // 4. Call LLM for re-synthesis
  let replayedResponse = '';
  const adapter = getAdapter(providerId);
  for await (const chunk of adapter.streamText(synthesisMessages, { maxTokens: 4000, temperature: 0.7 })) {
    if (chunk.type === 'token' && chunk.content) {
      replayedResponse += chunk.content;
    }
  }

  // 5. Extract claims from replayed response
  const replayedClaims = extractClaims(replayedResponse);
  const originalClaims = original.claimsCount;
  const replayedConfidence = replayedClaims.length > 0
    ? replayedClaims.filter(c => c.confidence === 'high').length / replayedClaims.length
    : 0.5;

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
      passport: JSON.parse(JSON.stringify({ replayOf: original.auditId, modifications })),
      summary: replayedResponse.slice(0, 500),
      steps: {
        create: [{
          stepIndex: 0,
          state: 'synthesize',
          confidence: replayedConfidence,
          findings: `Replay with modified params: ${JSON.stringify(modifications)}`,
          durationMs: 0,
          toolCalls: {
            create: modifiedResults.map(r => ({
              toolName: r.toolName,
              params: JSON.parse(JSON.stringify(modifications.find(m => m.toolName === r.toolName)?.newParams || {})),
              result: r.data ? JSON.parse(JSON.stringify(r.data)) : undefined,
              success: r.success,
              latencyMs: 0,
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
    confidenceDelta: Math.round((replayedConfidence - original.confidence) * 100) / 100,
    newToolsUsed: modifications.map(m => m.toolName),
    originalClaims,
    replayedClaims: replayedClaims.length,
    originalConfidence: original.confidence,
    replayedConfidence,
  };

  return { newTraceId: newTrace.id, diff };
}
