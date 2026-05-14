/**
 * Evidence-Level Feedback System.
 *
 * Upgrades the feedback loop from response-level (accept/reject) to
 * evidence-level (which specific claim was wrong and why).
 *
 * Architecture:
 *   Agent emits [claim-N] tagged output
 *   → User marks individual claims as accurate/inaccurate/outdated
 *   → System updates source weights & knowledge relevance
 *   → Downstream Bayesian calibration consumes updated weights
 *
 * ROZA Graphs (2026) insight: feedback must be evidence-centric,
 * not query-centric. Each claim binds to its data source.
 */

import { feedbackStore, recordFeedback, type FeedbackAction } from './feedback';
import { adjustEdgeWeight, recordSuccessTrace, recordFailureTrace, getGraph, searchNodes } from './graph-store';

// ─── Types ───────────────────────────────────────────────────────────────────────

export type ClaimVerdict = 'accurate' | 'inaccurate' | 'outdated' | 'irrelevant' | 'unverified';

export interface ClaimAnnotation {
  /** Link to the decision audit ID */
  auditId: string;
  /** Which claim in the response (e.g., "claim-3") */
  claimId: string;
  /** The claim text itself */
  claimText: string;
  /** Data source cited by the claim */
  citedSource: string;
  /** Agent's stated confidence */
  statedConfidence: 'high' | 'medium' | 'low';
  /** User's verdict */
  verdict: ClaimVerdict;
  /** User correction (if inaccurate) */
  correction?: string;
  /** User ID */
  userId?: string;
  /** When the claim was evaluated */
  evaluatedAt: string;
}

export interface SourceWeight {
  source: string;
  /** 0-1 reliability score, updated by feedback */
  reliability: number;
  /** Number of times this source was cited */
  citationCount: number;
  /** Number of times claims from this source were marked inaccurate */
  inaccuracyCount: number;
  /** Last updated */
  lastUpdated: string;
}

export interface EvidenceFeedbackStats {
  totalClaims: number;
  accurateCount: number;
  inaccurateCount: number;
  outdatedCount: number;
  accuracyRate: number;
  sourceWeights: Record<string, SourceWeight>;
}

// ─── Claim Parser ────────────────────────────────────────────────────────────────

/**
 * Extract claims from an agent response.
 * Matches: [claim-N] claim text. 数据源: source_name. 置信度: high/medium/low
 */
export function extractClaims(response: string): Array<{
  id: string;
  text: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
}> {
  const claims: Array<{
    id: string;
    text: string;
    source: string;
    confidence: 'high' | 'medium' | 'low';
  }> = [];

  // Split by claim markers
  const parts = response.split(/\[claim-(\d+)\]/g);
  for (let i = 1; i < parts.length; i += 2) {
    const claimNum = parts[i];
    const claimBody = parts[i + 1]?.trim() || '';

    // Extract source
    const sourceMatch = claimBody.match(/数据源[：:]\s*([^,，。.\n]+)/);
    const source = sourceMatch ? sourceMatch[1].trim() : '未标注';

    // Extract confidence
    const confMatch = claimBody.match(/置信度[：:]\s*(高|中|低)/);
    const confidence = (confMatch ? confMatch[1] : '中') as 'high' | 'medium' | 'low';
    const confidenceMap: Record<string, 'high' | 'medium' | 'low'> = {
      '高': 'high', '中': 'medium', '低': 'low',
    };

    claims.push({
      id: `claim-${claimNum}`,
      text: claimBody.split(/数据源[：:]/)[0].trim().replace(/[。.]$/g, ''),
      source,
      confidence: confidenceMap[confidence] || 'medium',
    });
  }

  return claims;
}

// ─── Source Weight Tracker ───────────────────────────────────────────────────────

class EvidenceTracker {
  private weights: Map<string, SourceWeight> = new Map();
  private annotations: ClaimAnnotation[] = [];
  private maxAnnotations = 2000;

  /** Record a user verdict on a claim */
  annotate(annotation: ClaimAnnotation): void {
    this.annotations.push(annotation);
    if (this.annotations.length > this.maxAnnotations) {
      this.annotations.splice(0, this.annotations.length - this.maxAnnotations);
    }

    // Update source weight
    const sw = this.weights.get(annotation.citedSource) || {
      source: annotation.citedSource,
      reliability: 0.8, // prior: assume 80% reliable
      citationCount: 0,
      inaccuracyCount: 0,
      lastUpdated: new Date().toISOString(),
    };

    sw.citationCount++;
    if (annotation.verdict === 'inaccurate' || annotation.verdict === 'outdated') {
      sw.inaccuracyCount++;
    }

    // Bayesian update: reliability = (prior_strength * prior + successes) / (prior_strength + total)
    const priorStrength = 5; // weight of prior belief
    const successes = sw.citationCount - sw.inaccuracyCount;
    sw.reliability = Math.round(
      ((priorStrength * 0.8 + successes) / (priorStrength + sw.citationCount)) * 100
    ) / 100;
    sw.lastUpdated = new Date().toISOString();

    this.weights.set(annotation.citedSource, sw);
  }

  /** Get reliability score for a source */
  getReliability(source: string): number {
    return this.weights.get(source)?.reliability ?? 0.8;
  }

  /** Get all source weights */
  getAllWeights(): Record<string, SourceWeight> {
    return Object.fromEntries(this.weights);
  }

  /** Get stats */
  getStats(): EvidenceFeedbackStats {
    const total = this.annotations.length;
    const accurateCount = this.annotations.filter(a => a.verdict === 'accurate').length;
    const inaccurateCount = this.annotations.filter(a => a.verdict === 'inaccurate').length;
    const outdatedCount = this.annotations.filter(a => a.verdict === 'outdated').length;

    return {
      totalClaims: total,
      accurateCount,
      inaccurateCount,
      outdatedCount,
      accuracyRate: total > 0 ? Math.round(accurateCount / total * 100) / 100 : 1,
      sourceWeights: this.getAllWeights(),
    };
  }

  /** Get recent annotations for a source */
  getAnnotationsForSource(source: string, limit = 20): ClaimAnnotation[] {
    return this.annotations
      .filter(a => a.citedSource === source)
      .slice(-limit)
      .reverse();
  }

  /** Export for persistence */
  exportAll(): { annotations: ClaimAnnotation[]; weights: Record<string, SourceWeight> } {
    return {
      annotations: [...this.annotations],
      weights: this.getAllWeights(),
    };
  }

  _clear(): void {
    this.annotations = [];
    this.weights.clear();
  }
}

export const evidenceTracker = new EvidenceTracker();

// ─── Feedback Recorder (extended) ────────────────────────────────────────────────

/**
 * Record user feedback on a complete agent response, including per-claim annotations.
 */
export function recordEvidenceFeedback(params: {
  auditId: string;
  engine: string;
  action: FeedbackAction;
  claims: Array<{
    claimId: string;
    claimText: string;
    citedSource: string;
    statedConfidence: 'high' | 'medium' | 'low';
    verdict: ClaimVerdict;
    correction?: string;
  }>;
  userNotes?: string;
  userId?: string;
}): void {
  // Record the overall decision feedback
  recordFeedback({
    auditId: params.auditId,
    engine: params.engine,
    action: params.action,
    userNotes: params.userNotes,
    userId: params.userId,
    tags: params.claims
      .filter(c => c.verdict !== 'accurate')
      .map(c => `${c.verdict}:${c.claimId}`),
  });

  // Record per-claim annotations
  const now = new Date().toISOString();
  for (const claim of params.claims) {
    evidenceTracker.annotate({
      auditId: params.auditId,
      claimId: claim.claimId,
      claimText: claim.claimText,
      citedSource: claim.citedSource,
      statedConfidence: claim.statedConfidence,
      verdict: claim.verdict,
      correction: claim.correction,
      userId: params.userId,
      evaluatedAt: now,
    });

    // ── Graph edge weight feedback ──────────────────────────────────────────
    tryWiringFeedbackToGraph(claim.claimText, claim.citedSource, claim.verdict);
  }
}

/**
 * Wire evidence feedback to graph edge weights.
 * Accepted claims reinforce related graph edges, rejected claims weaken them.
 */
async function tryWiringFeedbackToGraph(
  claimText: string,
  citedSource: string,
  verdict: string,
): Promise<void> {
  try {
    const graph = await getGraph();
    if (!graph || graph.nodes.size === 0) return;

    // Extract entities from the claim text and source
    const entityNames = extractEntityNames(claimText);
    const sourceEntities = extractEntityNames(citedSource);

    // Find matching graph nodes
    const matchedNodeIds: string[] = [];
    for (const name of [...entityNames, ...sourceEntities]) {
      const found = searchNodes(graph, name);
      for (const n of found) matchedNodeIds.push(n.id);
    }

    if (matchedNodeIds.length < 2) return;

    // Track affected edges
    const affectedEdgeKeys: string[] = [];
    const delta = verdict === 'accurate' ? 0.05 : verdict === 'inaccurate' ? -0.1 : verdict === 'outdated' ? -0.05 : 0;

    // Adjust weights on edges between matched nodes
    for (let i = 0; i < matchedNodeIds.length; i++) {
      for (let j = i + 1; j < matchedNodeIds.length; j++) {
        const outEdges = graph.outgoingEdges.get(matchedNodeIds[i]) || [];
        for (const edge of outEdges) {
          if (edge.to === matchedNodeIds[j]) {
            adjustEdgeWeight(matchedNodeIds[i], matchedNodeIds[j], edge.type, delta);
            affectedEdgeKeys.push(`${matchedNodeIds[i]}→${matchedNodeIds[j]}:${edge.type}`);
          }
        }
        // Also check reverse
        const reverseEdges = graph.outgoingEdges.get(matchedNodeIds[j]) || [];
        for (const edge of reverseEdges) {
          if (edge.to === matchedNodeIds[i]) {
            adjustEdgeWeight(matchedNodeIds[j], matchedNodeIds[i], edge.type, delta);
            affectedEdgeKeys.push(`${matchedNodeIds[j]}→${matchedNodeIds[i]}:${edge.type}`);
          }
        }
      }
    }

    // Record in dual memory traces
    const factId = `fact-${Date.now()}`;
    if (verdict === 'accurate') {
      recordSuccessTrace(factId, matchedNodeIds, affectedEdgeKeys);
    } else {
      recordFailureTrace(factId, matchedNodeIds, affectedEdgeKeys);
    }
  } catch {
    // Graph feedback is best-effort, non-blocking
  }
}

function extractEntityNames(text: string): string[] {
  const patterns = [
    /SKU[-:]\s*\w+/gi,
    /(?:智能|便携|无线|多功能|蒸汽|超声波|HEPA)[一-鿿\w]{2,8}[器锅机杯壶]/g,
    /(?:洛杉矶|长滩|纽约|上海|宁波|深圳|汉堡|鹿特丹)/g,
    /\w{2,4}-\d{3,5}/g,
  ];
  const names: string[] = [];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) names.push(...m);
  }
  return [...new Set(names)].slice(0, 5);
}

/**
 * Get sources ranked by reliability for use in confidence scoring.
 * Sources with reliability < 0.5 should trigger a degraded provenance flag.
 */
export function getSourceReliabilityMap(): Record<string, number> {
  const weights = evidenceTracker.getAllWeights();
  const map: Record<string, number> = {};
  for (const [source, sw] of Object.entries(weights)) {
    map[source] = sw.reliability;
  }
  return map;
}

/**
 * Build a feedback insight string for injection into the system prompt.
 * Tells the agent which data sources have been problematic recently.
 */
export function buildFeedbackInsight(): string {
  const stats = evidenceTracker.getStats();
  if (stats.totalClaims < 5) return '';

  const lowReliabilitySources = Object.entries(stats.sourceWeights)
    .filter(([, sw]) => sw.reliability < 0.6 && sw.citationCount >= 3)
    .map(([source, sw]) => `${source}(可靠性${(sw.reliability * 100).toFixed(0)}%)`);

  const lines: string[] = [];
  lines.push(`\n## 反馈历史洞察`);
  lines.push(`总声明: ${stats.totalClaims}, 准确率: ${(stats.accuracyRate * 100).toFixed(0)}%`);

  if (lowReliabilitySources.length > 0) {
    lines.push(`低可靠性数据源（谨慎引用）: ${lowReliabilitySources.join(', ')}`);
  }

  return lines.join('\n');
}
