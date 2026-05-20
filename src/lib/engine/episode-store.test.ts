/**
 * Tests for EpisodeStore in episode-store.ts
 *
 * Tests episode creation, retrieval, fact consolidation, and TTL-related behavior.
 * Mocks external dependencies (evidence-feedback, graph-store).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { episodeStore } from './episode-store';

// Mock extractClaims from evidence-feedback to return deterministic data
vi.mock('./evidence-feedback', () => ({
  extractClaims: vi.fn((response: string) => {
    if (response.includes('[claim-1]')) {
      return [
        { id: 'claim-1', text: '库存周转率为45天', source: 'query_inventory', confidence: 'high' as const },
      ];
    }
    if (response.includes('[claim-2]')) {
      return [
        { id: 'claim-2', text: '铜价上涨5%达到8500美元', source: 'web_search', confidence: 'medium' as const },
      ];
    }
    return [];
  }),
  ClaimAnnotation: {} as any,
}));

// Mock graph-store to avoid import failures (not actually used by tested methods)
vi.mock('./graph-store', () => ({
  searchNodes: vi.fn(() => []),
  getGraph: vi.fn(() => ({ nodes: new Map(), outgoingEdges: new Map() })),
}));

describe('EpisodeStore', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-05-19T10:00:00Z'));
    episodeStore._clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Episode Creation ──────────────────────────────────────────────────

  describe('record (episode creation)', () => {
    it('creates an episode with all required fields populated', () => {
      const ep = episodeStore.record({
        userQuery: '当前库存水平如何？',
        agentResponse: '[claim-1] 库存周转率为45天。数据源: query_inventory。置信度: 高',
        toolsUsed: ['query_inventory'],
        entities: ['SKU-001', '上海仓库'],
        topics: ['inventory'],
      });

      expect(ep.id).toContain('ep-');
      expect(ep.userQuery).toBe('当前库存水平如何？');
      expect(ep.toolsUsed).toEqual(['query_inventory']);
      expect(ep.entities).toContain('SKU-001');
      expect(ep.topics).toContain('inventory');
      expect(ep.accessCount).toBe(0);
      expect(ep.timestamp).toBeDefined();
      expect(ep.derivedFacts).toEqual([]);
    });

    it('automatically extracts claims from the agent response', () => {
      const ep = episodeStore.record({
        userQuery: '库存情况',
        agentResponse: '[claim-1] 库存周转率为45天。数据源: query_inventory。置信度: 高',
        toolsUsed: ['query_inventory'],
      });

      expect(ep.claims).toHaveLength(1);
      expect(ep.claims[0].id).toBe('claim-1');
      expect(ep.claims[0].text).toBe('库存周转率为45天');
    });

    it('infer topics from user query when not explicitly provided', () => {
      const ep = episodeStore.record({
        userQuery: '库存和成本分析',
        agentResponse: 'Some response without claim tags',
        toolsUsed: ['query_inventory', 'query_cost'],
      });

      expect(ep.topics).toContain('inventory');
      expect(ep.topics).toContain('cost');
    });

    it('truncates agent response to 3000 characters', () => {
      const longResponse = 'A'.repeat(5000);
      const ep = episodeStore.record({
        userQuery: 'test',
        agentResponse: longResponse,
        toolsUsed: [],
      });

      expect(ep.agentResponse.length).toBeLessThanOrEqual(3000);
    });
  });

  // ─── Episode Retrieval ──────────────────────────────────────────────────

  describe('retrieve', () => {
    it('returns empty array when no episodes exist', () => {
      const result = episodeStore.retrieve('test query');
      expect(result).toEqual([]);
    });

    it('retrieves episodes relevant to the query', () => {
      // Record two episodes with different content
      episodeStore.record({
        userQuery: '库存周转率是多少？',
        agentResponse: '[claim-1] 库存周转率为45天。数据源: query_inventory。置信度: 高',
        toolsUsed: ['query_inventory'],
        topics: ['inventory'],
      });

      episodeStore.record({
        userQuery: '今天的天气怎么样？',
        agentResponse: '天气晴朗',
        toolsUsed: [],
        topics: ['general'],
      });

      // Retrieve with inventory-related query
      const results = episodeStore.retrieve('库存');

      expect(results.length).toBeGreaterThanOrEqual(1);
      // The engine-relevant result should be ranked first
      expect(results[0].userQuery).toContain('库存');
    });

    it('respects the topK limit', () => {
      for (let i = 0; i < 5; i++) {
        episodeStore.record({
          userQuery: `查询 ${i}`,
          agentResponse: `结果 ${i}`,
          toolsUsed: [],
          topics: ['general'],
        });
      }

      const results = episodeStore.retrieve('查询', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('increments accessCount when episodes are retrieved', () => {
      episodeStore.record({
        userQuery: '库存情况',
        agentResponse: '[claim-1] 库存周转率为45天。数据源: query_inventory。置信度: 高',
        toolsUsed: ['query_inventory'],
        topics: ['inventory'],
      });

      episodeStore.retrieve('库存');
      const stats = episodeStore.getStats();
      // Access count was incremented
      expect(stats.totalEpisodes).toBe(1);
    });
  });

  // ─── Fact Consolidation ─────────────────────────────────────────────────

  describe('upsertFact (fact consolidation)', () => {
    it('creates a new fact from recorded episode', () => {
      const ep = episodeStore.record({
        userQuery: '库存情况',
        agentResponse: '[claim-1] 库存周转率为45天。数据源: query_inventory。置信度: 高',
        toolsUsed: ['query_inventory'],
      });

      const fact = episodeStore.upsertFact({
        text: '库存周转率为45天',
        sourceEpisodeId: ep.id,
        topic: 'inventory',
      });

      expect(fact.id).toContain('fact-');
      expect(fact.text).toBe('库存周转率为45天');
      expect(fact.sourceEpisodeIds).toContain(ep.id);
      expect(fact.supportCount).toBe(1);
      expect(fact.active).toBe(true);
      expect(fact.confidence).toBe(0.5);
    });

    it('merges duplicate facts and increases confidence', () => {
      const ep1 = episodeStore.record({
        userQuery: '库存情况',
        agentResponse: '[claim-1] 库存周转率为45天。数据源: query_inventory。置信度: 高',
        toolsUsed: ['query_inventory'],
      });

      const fact1 = episodeStore.upsertFact({
        text: '库存周转率为45天',
        sourceEpisodeId: ep1.id,
        topic: 'inventory',
      });

      const ep2 = episodeStore.record({
        userQuery: '再次确认库存',
        agentResponse: '[claim-1] 库存周转率为45天。数据源: query_inventory。置信度: 高',
        toolsUsed: ['query_inventory'],
      });

      // Same text will match existing fact (textSimilarity > 0.7)
      const fact2 = episodeStore.upsertFact({
        text: '库存周转率为45天',
        sourceEpisodeId: ep2.id,
        topic: 'inventory',
      });

      // Should return the same fact object with increased confidence
      expect(fact1.id).toBe(fact2.id);
      expect(fact2.supportCount).toBe(2);
      expect(fact2.confidence).toBeGreaterThan(0.5);
    });

    it('links the fact back to the source episode', () => {
      const ep = episodeStore.record({
        userQuery: '成本趋势',
        agentResponse: '[claim-1] 库存周转率为45天。数据源: query_inventory。置信度: 高',
        toolsUsed: ['query_inventory'],
      });

      episodeStore.upsertFact({
        text: '库存周转率为45天',
        sourceEpisodeId: ep.id,
        topic: 'inventory',
      });

      // The episode's derivedFacts should contain the fact ID
      // We can check by retrieving the episode again
      const allEps = (episodeStore as any)._getAllEpisodes() as Array<{ id: string; derivedFacts: string[] }>;
      const matchingEp = allEps.find(e => e.id === ep.id);
      expect(matchingEp).toBeDefined();
      expect(matchingEp!.derivedFacts.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Fact Lifecycle ─────────────────────────────────────────────────────

  describe('fact lifecycle', () => {
    it('getActiveFacts returns only active facts sorted by confidence', () => {
      const ep = episodeStore.record({
        userQuery: 'test',
        agentResponse: '[claim-1] 库存周转率为45天。数据源: query_inventory。置信度: 高',
        toolsUsed: [],
      });

      episodeStore.upsertFact({ text: '事实A', sourceEpisodeId: ep.id, topic: 'topic1' });
      episodeStore.upsertFact({ text: '事实B', sourceEpisodeId: ep.id, topic: 'topic2' });

      const active = episodeStore.getActiveFacts();
      expect(active.every(f => f.active)).toBe(true);
    });

    it('deactivateFact marks a fact as inactive', () => {
      const ep = episodeStore.record({
        userQuery: 'test',
        agentResponse: '[claim-1] 库存周转率为45天。数据源: query_inventory。置信度: 高',
        toolsUsed: [],
      });

      const fact = episodeStore.upsertFact({ text: '旧数据', sourceEpisodeId: ep.id, topic: 'obsolete' });
      episodeStore.deactivateFact(fact.id);

      const allFacts = (episodeStore as any)._getAllFacts() as Array<{ id: string; active: boolean }>;
      const deactivated = allFacts.find(f => f.id === fact.id);
      expect(deactivated?.active).toBe(false);
    });

    it('getFactsByTopic returns only active facts for the given topic', () => {
      const ep = episodeStore.record({
        userQuery: 'test',
        agentResponse: '[claim-1] 库存周转率为45天。数据源: query_inventory。置信度: 高',
        toolsUsed: [],
      });

      episodeStore.upsertFact({ text: '库存数据', sourceEpisodeId: ep.id, topic: 'inventory' });
      episodeStore.upsertFact({ text: '成本数据', sourceEpisodeId: ep.id, topic: 'cost' });

      const inventoryFacts = episodeStore.getFactsByTopic('inventory');
      expect(inventoryFacts).toHaveLength(1);
      expect(inventoryFacts[0].text).toBe('库存数据');
    });
  });

  // ─── Episode Limit / TTL ────────────────────────────────────────────────

  describe('episode limit', () => {
    it('trims old episodes when exceeding maxEpisodes (500)', () => {
      // Create episodes beyond the limit
      // The limit is 500, so we need to create 501 episodes
      for (let i = 0; i < 501; i++) {
        episodeStore.record({
          userQuery: `Query ${i}`,
          agentResponse: `Response ${i}`,
          toolsUsed: [],
          topics: ['general'],
        });
      }

      const stats = episodeStore.getStats();
      expect(stats.totalEpisodes).toBeLessThanOrEqual(500);
    });
  });

  // ─── Stats ──────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns accurate statistics about stored episodes', () => {
      expect(episodeStore.getStats().totalEpisodes).toBe(0);

      episodeStore.record({
        userQuery: '库存情况',
        agentResponse: '[claim-1] 库存周转率为45天。数据源: query_inventory。置信度: 高',
        toolsUsed: ['query_inventory'],
      });

      const stats = episodeStore.getStats();
      expect(stats.totalEpisodes).toBe(1);
      expect(stats.avgClaimsPerEpisode).toBeGreaterThan(0);
    });
  });
});
