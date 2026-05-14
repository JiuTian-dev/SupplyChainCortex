/**
 * Memory Consolidation Engine — "sleep-like" background processing.
 *
 * Inspired by Microsoft's Human-Inspired Memory Architecture (2026):
 * - Sleep-stage consolidation: offline dedup + merge of redundant traces
 * - Interference-based forgetting: similar memories compete, low-value suppressed
 * - Memory maturation: new facts "incubate" before full activation
 * - Retrieval-induced reconsolidation: accessed memories become labile

* And Mem0's ADD-only philosophy:
 * - Facts accumulate, never overwrite
 * - Conflicts resolved via time-decay (newer = higher weight)
 *
 * Triggered by scheduler or manual API call.
 */

import { episodeStore, type Episode, type ConsolidatedFact } from './episode-store';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface ConsolidationReport {
  timestamp: string;
  actions: string[];
  dedupedFacts: number;
  mergedFacts: number;
  expiredFacts: number;
  reactivatedFacts: number;
  totalActiveFacts: number;
  totalEpisodes: number;
  durationMs: number;
}

// ─── Consolidation Pipeline ──────────────────────────────────────────────────────

/**
 * Run full memory consolidation.
 * Called periodically (e.g., every 30 min via scheduler or manually via API).
 */
export function runConsolidation(): ConsolidationReport {
  const startTime = Date.now();
  const actions: string[] = [];
  const allFacts = episodeStore._getAllFacts();
  const allEpisodes = episodeStore._getAllEpisodes();

  // ── Phase 1: Deduplicate similar facts ────────────────────────────────────
  let dedupedFacts = 0;
  const activeFacts = allFacts.filter(f => f.active);
  const toDeactivate = new Set<string>();

  for (let i = 0; i < activeFacts.length; i++) {
    if (toDeactivate.has(activeFacts[i].id)) continue;
    for (let j = i + 1; j < activeFacts.length; j++) {
      if (toDeactivate.has(activeFacts[j].id)) continue;

      const fi = activeFacts[i];
      const fj = activeFacts[j];

      // Check text similarity
      const similarity = textOverlap(fi.text, fj.text);
      if (similarity > 0.75) {
        // Merge: keep the one with more support, deactivate the other
        if (fi.supportCount >= fj.supportCount) {
          toDeactivate.add(fj.id);
          fi.supportCount += fj.supportCount;
          fi.sourceEpisodeIds = [...new Set([...fi.sourceEpisodeIds, ...fj.sourceEpisodeIds])];
          fi.confidence = Math.min(1, fi.confidence + 0.1);
        } else {
          toDeactivate.add(fi.id);
          fj.supportCount += fi.supportCount;
          fj.sourceEpisodeIds = [...new Set([...fi.sourceEpisodeIds, ...fj.sourceEpisodeIds])];
          fj.confidence = Math.min(1, fj.confidence + 0.1);
        }
        dedupedFacts++;
      }
    }
  }

  for (const factId of toDeactivate) {
    episodeStore.deactivateFact(factId);
  }
  if (dedupedFacts > 0) actions.push(`去重合并了 ${dedupedFacts} 条相似事实`);

  // ── Phase 2: Expire stale facts ──────────────────────────────────────────
  let expiredFacts = 0;
  const now = Date.now();
  const expiryThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days without confirmation

  for (const fact of allFacts) {
    if (!fact.active) continue;
    const ageMs = now - new Date(fact.lastConfirmedAt).getTime();

    if (ageMs > expiryThreshold && fact.supportCount < 3) {
      episodeStore.deactivateFact(fact.id);
      expiredFacts++;
    }
  }
  if (expiredFacts > 0) actions.push(`过期了 ${expiredFacts} 条低置信度旧事实`);

  // ── Phase 3: Promote high-confidence facts ───────────────────────────────
  let promotedCount = 0;
  for (const fact of allFacts) {
    if (!fact.active) continue;
    // Facts with high support and recent confirmation get confidence boost
    if (fact.supportCount >= 3 && fact.confidence < 0.8) {
      const daysSinceFirst = (now - new Date(fact.firstObservedAt).getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceFirst > 1) {
        // Maturation: fact has survived >1 day, boost confidence
        fact.confidence = Math.min(1, fact.confidence + 0.1);
        promotedCount++;
      }
    }
  }
  if (promotedCount > 0) actions.push(`成熟化提升了 ${promotedCount} 条事实的置信度`);

  // ── Phase 4: Extract new facts from unprocessed episodes ──────────────────
  let extractedFacts = 0;
  for (const ep of allEpisodes) {
    if (ep.derivedFacts.length > 0) continue; // Already processed

    // Extract facts from claims
    for (const claim of ep.claims) {
      if (claim.text.length < 10) continue;

      episodeStore.upsertFact({
        text: claim.text,
        sourceEpisodeId: ep.id,
        entityIds: ep.entities,
        topic: ep.topics[0] || 'general',
      });
      extractedFacts++;
    }
  }
  if (extractedFacts > 0) actions.push(`从 ${allEpisodes.filter(e => e.derivedFacts.length === 0).length} 个未处理的 Episode 中提取了 ${extractedFacts} 条事实`);

  // ── Phase 5: Reactivate facts with new supporting evidence ────────────────
  let reactivatedFacts = 0;
  for (const fact of allFacts) {
    if (fact.active) continue;
    // Check if any recent episodes support this fact
    const recentEpisodes = allEpisodes.filter(e =>
      new Date(e.timestamp).getTime() > now - 24 * 60 * 60 * 1000
    );
    for (const ep of recentEpisodes) {
      const similarity = textOverlap(fact.text, ep.agentResponse);
      if (similarity > 0.5) {
        fact.active = true;
        fact.supportCount++;
        fact.lastConfirmedAt = new Date().toISOString();
        fact.sourceEpisodeIds.push(ep.id);
        reactivatedFacts++;
        break;
      }
    }
  }
  if (reactivatedFacts > 0) actions.push(`重新激活了 ${reactivatedFacts} 条被近期对话印证的事实`);

  // ── Phase 6: Clean up orphaned inactive facts ────────────────────────────
  const orphanThreshold = 14 * 24 * 60 * 60 * 1000; // 14 days inactive
  let cleanedOrphans = 0;
  for (const fact of allFacts) {
    if (fact.active) continue;
    const ageMs = now - new Date(fact.lastConfirmedAt).getTime();
    if (ageMs > orphanThreshold) {
      episodeStore._removeFact(fact.id);
      cleanedOrphans++;
    }
  }
  if (cleanedOrphans > 0) actions.push(`清理了 ${cleanedOrphans} 条孤儿事实`);

  const activeFactsAfter = episodeStore.getActiveFacts();

  return {
    timestamp: new Date().toISOString(),
    actions: actions.length > 0 ? actions : ['无需巩固 — 记忆库状态良好'],
    dedupedFacts,
    mergedFacts: dedupedFacts,
    expiredFacts,
    reactivatedFacts,
    totalActiveFacts: activeFactsAfter.length,
    totalEpisodes: allEpisodes.length,
    durationMs: Date.now() - startTime,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────────

function textOverlap(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  const intersection = new Set([...tokensA].filter(t => tokensB.has(t)));
  return intersection.size / Math.max(tokensA.size, tokensB.size);
}

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9一-鿿\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

/**
 * Format consolidated facts for injection into the system prompt.
 */
export function formatConsolidatedFactsContext(topK = 10): string {
  const facts = episodeStore.getActiveFacts().slice(0, topK);
  if (facts.length === 0) return '';

  const lines = ['\n## 📚 巩固知识'];

  // Group by topic
  const byTopic: Record<string, ConsolidatedFact[]> = {};
  for (const f of facts) {
    (byTopic[f.topic] ||= []).push(f);
  }

  for (const [topic, topicFacts] of Object.entries(byTopic)) {
    lines.push(`### ${topic}`);
    for (const f of topicFacts.slice(0, 3)) {
      const confidenceLabel = f.confidence > 0.8 ? '高' : f.confidence > 0.5 ? '中' : '低';
      lines.push(`- ${f.text.slice(0, 120)} [置信度: ${confidenceLabel}, 来源: ${f.supportCount}次]`);
    }
  }

  return lines.join('\n');
}
