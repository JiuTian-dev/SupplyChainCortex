/**
 * Episodic Memory Store — structured conversation memory with retrieval.
 *
 * Inspired by GAAMA (2026) Episode → Fact architecture and Mem0's ADD-only
 * multi-signal retrieval. Each conversation turn is stored as an Episode
 * with extracted claims, entities, and graph context.
 *
 * Architecture:
 *   Conversation → Episode (stored) → Consolidation → Facts
 *   Query → TF-IDF + Entity match + Time decay → Top-K Episodes → Context
 */

import { extractClaims, type ClaimAnnotation } from './evidence-feedback';
import { searchNodes, getGraph } from './graph-store';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface Episode {
  id: string;
  /** User's query */
  userQuery: string;
  /** Agent's full response */
  agentResponse: string;
  /** Extracted claims from [claim-N] tags */
  claims: Array<{
    id: string;
    text: string;
    source: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  /** Tools called during this turn */
  toolsUsed: string[];
  /** Entity names referenced (products, suppliers, ports, etc.) */
  entities: string[];
  /** Graph node IDs involved */
  graphNodeIds: string[];
  /** Key topics extracted */
  topics: string[];
  /** ISO timestamp */
  timestamp: string;
  /** Access count for retention scoring */
  accessCount: number;
  /** Last accessed timestamp */
  lastAccessedAt: string;
  /** Consolidated facts derived from this episode */
  derivedFacts: string[];
}

export interface ConsolidatedFact {
  id: string;
  /** The atomic fact text */
  text: string;
  /** Source episode IDs */
  sourceEpisodeIds: string[];
  /** Confidence 0-1 based on repetition and source reliability */
  confidence: number;
  /** Entity IDs this fact relates to */
  entityIds: string[];
  /** Topic category */
  topic: string;
  /** When first observed */
  firstObservedAt: string;
  /** When last confirmed/updated */
  lastConfirmedAt: string;
  /** Number of episodes supporting this fact */
  supportCount: number;
  /** Whether this fact is still considered valid */
  active: boolean;
}

// ─── In-Memory Store ─────────────────────────────────────────────────────────────

class EpisodeStore {
  private episodes: Episode[] = [];
  private facts: ConsolidatedFact[] = [];
  private maxEpisodes = 500;
  private maxFacts = 1000;

  /** Record a new episode from a completed conversation turn */
  record(params: {
    userQuery: string;
    agentResponse: string;
    toolsUsed: string[];
    entities?: string[];
    graphNodeIds?: string[];
    topics?: string[];
  }): Episode {
    const claims = extractClaims(params.agentResponse);

    // Extract entities from query if not provided
    const entities = params.entities || extractEntitiesFromText(params.userQuery);

    const episode: Episode = {
      id: `ep-${Date.now()}-${this.episodes.length}`,
      userQuery: params.userQuery,
      agentResponse: params.agentResponse.slice(0, 3000),
      claims: claims.map(c => ({
        id: c.id,
        text: c.text.slice(0, 200),
        source: c.source,
        confidence: c.confidence,
      })),
      toolsUsed: params.toolsUsed,
      entities,
      graphNodeIds: params.graphNodeIds || [],
      topics: params.topics || inferTopics(params.userQuery),
      timestamp: new Date().toISOString(),
      accessCount: 0,
      lastAccessedAt: new Date().toISOString(),
      derivedFacts: [],
    };

    this.episodes.push(episode);

    // Trim if over max
    if (this.episodes.length > this.maxEpisodes) {
      const removed = this.episodes.splice(0, this.episodes.length - this.maxEpisodes);
      // Don't lose facts derived from removed episodes
      for (const ep of removed) {
        for (const factId of ep.derivedFacts) {
          const fact = this.facts.find(f => f.id === factId);
          if (fact) fact.sourceEpisodeIds = fact.sourceEpisodeIds.filter(id => id !== ep.id);
        }
      }
    }

    return episode;
  }

  /**
   * Retrieve top-K most relevant episodes for a query.
   * Uses multi-signal scoring: TF-IDF + entity overlap + time decay.
   */
  retrieve(query: string, topK = 3): Episode[] {
    if (this.episodes.length === 0) return [];

    const queryTokens = tokenize(query);
    const queryEntities = extractEntitiesFromText(query);
    const now = Date.now();

    // Compute TF-IDF index over episode corpus
    const epTexts = this.episodes.map(e => e.userQuery + ' ' + e.agentResponse.slice(0, 500));
    const { tfs, idf } = buildTfIdf(epTexts);

    const scored = this.episodes.map((ep, i) => {
      // 1. TF-IDF cosine similarity
      const tfidfScore = cosineSimilarity(queryTokens, tfs[i], idf);

      // 2. Entity overlap bonus
      const entityOverlap = queryEntities.filter(e =>
        ep.entities.some(ee => ee.toLowerCase().includes(e.toLowerCase()))
      ).length;
      const entityScore = queryEntities.length > 0
        ? entityOverlap / Math.max(queryEntities.length, 1)
        : 0;

      // 3. Topic overlap
      const epTopics = ep.topics;
      const queryTopics = inferTopics(query);
      const topicOverlap = queryTopics.filter(t => epTopics.includes(t)).length;
      const topicScore = queryTopics.length > 0
        ? topicOverlap / Math.max(queryTopics.length, 1)
        : 0;

      // 4. Time decay — exponential, half-life of 1 hour
      const ageMs = now - new Date(ep.timestamp).getTime();
      const halfLifeMs = 60 * 60 * 1000; // 1 hour
      const timeDecay = Math.exp(-Math.LN2 * ageMs / halfLifeMs);

      // 5. Access frequency bonus (log-scaled)
      const accessBonus = Math.log2(ep.accessCount + 2) / 5;

      // Combined score
      const score =
        tfidfScore * 0.30 +
        entityScore * 0.25 +
        topicScore * 0.20 +
        timeDecay * 0.15 +
        accessBonus * 0.10;

      return { episode: ep, score };
    });

    const results = scored
      .filter(s => s.score > 0.03)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // Update access metadata
    for (const { episode } of results) {
      episode.accessCount++;
      episode.lastAccessedAt = new Date().toISOString();
    }

    return results.map(r => r.episode);
  }

  /** Get recent episodes (last N) */
  getRecent(n = 10): Episode[] {
    return this.episodes.slice(-n).reverse();
  }

  /** Find episodes by entity */
  findByEntity(entity: string): Episode[] {
    const q = entity.toLowerCase();
    return this.episodes.filter(e =>
      e.entities.some(ee => ee.toLowerCase().includes(q))
    ).slice(-20);
  }

  /** Get episode stats */
  getStats(): { totalEpisodes: number; totalFacts: number; oldestEpisode: string; newestEpisode: string; avgClaimsPerEpisode: number } {
    const totalClaims = this.episodes.reduce((s, e) => s + e.claims.length, 0);
    return {
      totalEpisodes: this.episodes.length,
      totalFacts: this.facts.filter(f => f.active).length,
      oldestEpisode: this.episodes[0]?.timestamp || 'N/A',
      newestEpisode: this.episodes[this.episodes.length - 1]?.timestamp || 'N/A',
      avgClaimsPerEpisode: this.episodes.length > 0 ? Math.round(totalClaims / this.episodes.length * 10) / 10 : 0,
    };
  }

  // ── Fact Management ──────────────────────────────────────────────────────

  /** Upsert a consolidated fact */
  upsertFact(params: {
    text: string;
    sourceEpisodeId: string;
    entityIds?: string[];
    topic?: string;
  }): ConsolidatedFact {
    // Check for existing similar fact
    const existing = this.facts.find(f =>
      f.active && textSimilarity(f.text, params.text) > 0.7
    );

    if (existing) {
      existing.sourceEpisodeIds.push(params.sourceEpisodeId);
      existing.supportCount++;
      existing.lastConfirmedAt = new Date().toISOString();
      existing.confidence = Math.min(1, existing.confidence + 0.05);
      if (params.entityIds) {
        existing.entityIds = [...new Set([...existing.entityIds, ...params.entityIds])];
      }
      return existing;
    }

    const fact: ConsolidatedFact = {
      id: `fact-${Date.now()}-${this.facts.length}`,
      text: params.text,
      sourceEpisodeIds: [params.sourceEpisodeId],
      confidence: 0.5,
      entityIds: params.entityIds || [],
      topic: params.topic || 'general',
      firstObservedAt: new Date().toISOString(),
      lastConfirmedAt: new Date().toISOString(),
      supportCount: 1,
      active: true,
    };

    this.facts.push(fact);

    // Link back to episode
    const episode = this.episodes.find(e => e.id === params.sourceEpisodeId);
    if (episode) episode.derivedFacts.push(fact.id);

    // Trim facts
    if (this.facts.length > this.maxFacts) {
      // Remove inactive facts first, then oldest
      this.facts.sort((a, b) => {
        if (a.active !== b.active) return a.active ? 1 : -1;
        return new Date(a.lastConfirmedAt).getTime() - new Date(b.lastConfirmedAt).getTime();
      });
      this.facts.splice(0, this.facts.length - this.maxFacts);
    }

    return fact;
  }

  /** Get all active facts */
  getActiveFacts(): ConsolidatedFact[] {
    return this.facts.filter(f => f.active).sort((a, b) => b.confidence - a.confidence);
  }

  /** Get facts by topic */
  getFactsByTopic(topic: string): ConsolidatedFact[] {
    return this.facts.filter(f => f.active && f.topic === topic);
  }

  /** Deactivate a fact */
  deactivateFact(factId: string): void {
    const fact = this.facts.find(f => f.id === factId);
    if (fact) fact.active = false;
  }

  /** Get all facts (including inactive, for consolidation) */
  _getAllFacts(): ConsolidatedFact[] {
    return this.facts;
  }

  /** Get all episodes (for consolidation) */
  _getAllEpisodes(): Episode[] {
    return this.episodes;
  }

  /** Remove a fact entirely */
  _removeFact(factId: string): void {
    this.facts = this.facts.filter(f => f.id !== factId);
  }

  _clear(): void {
    this.episodes = [];
    this.facts = [];
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────────

export const episodeStore = new EpisodeStore();

// ─── Helper Functions ────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9一-鿿\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function buildTfIdf(docs: string[]): { tfs: Record<string, number>[]; idf: Record<string, number> } {
  const tokenizedDocs = docs.map(tokenize);
  const tfs: Record<string, number>[] = [];
  const df: Record<string, number> = {};

  for (const tokens of tokenizedDocs) {
    const tf: Record<string, number> = {};
    for (const t of tokens) {
      tf[t] = (tf[t] || 0) + 1;
    }
    const total = tokens.length || 1;
    for (const t of Object.keys(tf)) tf[t] /= total;
    tfs.push(tf);

    for (const t of new Set(tokens)) {
      df[t] = (df[t] || 0) + 1;
    }
  }

  const N = docs.length;
  const idf: Record<string, number> = {};
  for (const [t, count] of Object.entries(df)) {
    idf[t] = Math.log((N - count + 0.5) / (count + 0.5) + 1);
  }

  return { tfs, idf };
}

function cosineSimilarity(
  queryTokens: string[],
  docTf: Record<string, number>,
  idf: Record<string, number>,
): number {
  const queryTf: Record<string, number> = {};
  for (const t of queryTokens) queryTf[t] = (queryTf[t] || 0) + 1;
  const queryLen = queryTokens.length || 1;
  for (const t of Object.keys(queryTf)) queryTf[t] = (queryTf[t] / queryLen) * (idf[t] || 1);

  let dotProduct = 0, queryNorm = 0, docNorm = 0;
  for (const t of Object.keys(queryTf)) {
    dotProduct += queryTf[t] * (docTf[t] || 0);
    queryNorm += queryTf[t] ** 2;
  }
  for (const v of Object.values(docTf)) docNorm += v ** 2;

  return dotProduct / (Math.sqrt(queryNorm) * Math.sqrt(docNorm) + 0.0001);
}

function textSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  const intersection = new Set([...tokensA].filter(t => tokensB.has(t)));
  return intersection.size / Math.max(tokensA.size, tokensB.size);
}

function extractEntitiesFromText(text: string): string[] {
  const patterns = [
    /SKU[-:]\s*\w+/gi,
    /(?:智能|便携|无线|多功能|蒸汽|超声波|HEPA)[一-鿿\w]{2,8}[器锅机杯壶]/g,
    /(?:洛杉矶|长滩|纽约|上海|宁波|深圳|汉堡|鹿特丹)/g,
    /供应商[:：\s]*(\S+)/g,
  ];

  const entities: string[] = [];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) entities.push(...matches);
  }
  return [...new Set(entities)].slice(0, 10);
}

function inferTopics(text: string): string[] {
  const topicMap: Record<string, string> = {
    '库存': 'inventory', '成本': 'cost', '物流': 'logistics', '货运': 'logistics',
    '供应商': 'supplier', '风险': 'risk', '销售': 'sales', '关税': 'tariff',
    '合规': 'compliance', '汇率': 'fx', '铜': 'commodities', '碳': 'carbon',
    '价格': 'pricing', '利润': 'margin', '仓库': 'warehouse', '港口': 'port',
  };
  const topics: string[] = [];
  for (const [keyword, topic] of Object.entries(topicMap)) {
    if (text.includes(keyword) && !topics.includes(topic)) topics.push(topic);
  }
  return topics.length > 0 ? topics : ['general'];
}

/**
 * Format retrieved episodes for injection into the system prompt.
 */
export function formatEpisodeContext(episodes: Episode[]): string {
  if (episodes.length === 0) return '';

  const lines = ['\n## 🧠 相关历史记忆'];
  for (const ep of episodes.slice(0, 3)) {
    const time = new Date(ep.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const claimSummary = ep.claims.length > 0
      ? ep.claims.slice(0, 2).map(c => `  · ${c.text.slice(0, 80)}`).join('\n')
      : '  (无提取声明)';

    lines.push(`### ${time} — ${ep.userQuery.slice(0, 60)}`);
    lines.push(`关键发现:${claimSummary}`);
    if (ep.entities.length > 0) {
      lines.push(`涉及: ${ep.entities.slice(0, 5).join(', ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
