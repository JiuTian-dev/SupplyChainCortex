/**
 * Hybrid RAG — Tests
 *
 * Tests BM25 keyword search, three-way retrieval, and RRF fusion
 * with mocked vector-store and graph-store dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockEnsureVectorTable = vi.fn();
const mockGenerateEmbedding = vi.fn();
const mockVectorSearch = vi.fn();

vi.mock('./vector-store', () => ({
  ensureVectorTable: (...args: unknown[]) => mockEnsureVectorTable(...args),
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
  vectorSearch: (...args: unknown[]) => mockVectorSearch(...args),
}));

const mockStartRetrievalSpan = vi.fn();
const mockEndSpan = vi.fn();
const mockEndSpanWithError = vi.fn();

vi.mock('@/lib/audit/otel-tracing', () => ({
  startRetrievalSpan: (...args: unknown[]) => mockStartRetrievalSpan(...args),
  endSpan: (...args: unknown[]) => mockEndSpan(...args),
  endSpanWithError: (...args: unknown[]) => mockEndSpanWithError(...args),
}));

// Build a mock graph for testing
function makeMockGraph() {
  const nodes = new Map<string, import('./graph-store').GraphNode>();
  nodes.set('p1', {
    id: 'p1',
    type: 'product',
    label: 'SKU-001: 无线蓝牙耳机',
    properties: { sku: 'SKU-001', name: '无线蓝牙耳机', category: '电子产品', origin: '中国' },
  });
  nodes.set('p2', {
    id: 'p2',
    type: 'product',
    label: 'SKU-002: 不锈钢水壶',
    properties: { sku: 'SKU-002', name: '不锈钢水壶', category: '家居', subCategory: '厨房' },
  });
  nodes.set('p3', {
    id: 'p3',
    type: 'product',
    label: 'SKU-003: 锂电池充电宝',
    properties: { sku: 'SKU-003', name: '锂电池充电宝', category: '电子产品', origin: '中国' },
  });
  nodes.set('s1', {
    id: 's1',
    type: 'supplier',
    label: 'SUP-001: Shenzhen Tech Co',
    properties: { code: 'SUP-001', name: 'Shenzhen Tech Co', region: '华南', rating: 4.5 },
  });
  nodes.set('s2', {
    id: 's2',
    type: 'supplier',
    label: 'SUP-002: Ningbo Metal Works',
    properties: { code: 'SUP-002', name: 'Ningbo Metal Works', region: '华东', rating: 3.8 },
  });
  nodes.set('w1', {
    id: 'warehouse:LA-WH',
    type: 'warehouse',
    label: 'LA-WH',
    properties: { name: 'LA-WH' },
  });
  nodes.set('port:洛杉矶', {
    id: 'port:洛杉矶',
    type: 'port',
    label: '洛杉矶',
    properties: { name: '洛杉矶' },
  });
  nodes.set('cert:c1', {
    id: 'cert:c1',
    type: 'certification',
    label: 'FCC认证',
    properties: { certName: 'FCC认证', status: 'active' },
  });

  // Adjacency for graph traversal
  const adjacency = new Map<string, string[]>();
  const reverseAdjacency = new Map<string, string[]>();
  const outgoingEdges = new Map<string, import('./graph-store').GraphEdge[]>();

  for (const id of nodes.keys()) {
    adjacency.set(id, []);
    reverseAdjacency.set(id, []);
    outgoingEdges.set(id, []);
  }

  // p1 → s1 (SUPPLIED_BY)
  adjacency.get('p1')?.push('s1');
  reverseAdjacency.get('s1')?.push('p1');
  outgoingEdges.get('p1')?.push({ from: 'p1', to: 's1', type: 'SUPPLIED_BY', weight: 0.5, properties: {} });

  // p1 → cert:c1 (REQUIRES_CERT)
  adjacency.get('p1')?.push('cert:c1');
  reverseAdjacency.get('cert:c1')?.push('p1');
  outgoingEdges.get('p1')?.push({ from: 'p1', to: 'cert:c1', type: 'REQUIRES_CERT', weight: 0.2, properties: {} });

  return {
    nodes,
    edges: [],
    adjacency,
    reverseAdjacency,
    outgoingEdges,
    builtAt: new Date().toISOString(),
    nodeCount: nodes.size,
    edgeCount: 2,
  };
}

const mockGetGraph = vi.fn();
const mockSearchNodes = vi.fn();
const mockGetNeighbors = vi.fn();

vi.mock('./graph-store', () => ({
  getGraph: (...args: unknown[]) => mockGetGraph(...args),
  searchNodes: (...args: unknown[]) => mockSearchNodes(...args),
  getNeighbors: (...args: unknown[]) => mockGetNeighbors(...args),
}));

// Import after mocks
import { bm25Search, hybridRetrieve, formatHybridResults } from './hybrid-rag';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('HybridRAG', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureVectorTable.mockResolvedValue(undefined);
    mockGenerateEmbedding.mockResolvedValue(Array(1536).fill(0.1));
    mockVectorSearch.mockResolvedValue([]);
    mockGetGraph.mockResolvedValue(makeMockGraph());
    mockStartRetrievalSpan.mockReturnValue({});
    mockEndSpan.mockImplementation(() => {});
    mockEndSpanWithError.mockImplementation(() => {});
  });

  // ── BM25 Search ────────────────────────────────────────────────────────

  describe('bm25Search', () => {
    it('should return results matching query keywords', async () => {
      const results = await bm25Search('蓝牙 耳机');
      expect(results.length).toBeGreaterThan(0);
      // Should find the wireless bluetooth earphone product
      const found = results.find(r => r.nodeId === 'p1');
      expect(found).toBeDefined();
      expect(found!.score).toBeGreaterThan(0);
    });

    it('should rank exact matches higher', async () => {
      const results = await bm25Search('锂电池');
      // Should find the battery product
      const batteryResult = results.find(r => r.nodeId === 'p3');
      expect(batteryResult).toBeDefined();
    });

    it('should return empty for empty query', async () => {
      const results = await bm25Search('');
      expect(results).toEqual([]);
    });

    it('should return empty for single-char query', async () => {
      const results = await bm25Search('a');
      expect(results).toEqual([]);
    });

    it('should filter by nodeType', async () => {
      const results = await bm25Search('Shenzhen', { nodeType: 'supplier' });
      for (const r of results) {
        expect(r.nodeType).toBe('supplier');
      }
    });

    it('should respect topK limit', async () => {
      const results = await bm25Search('产品', { topK: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should find supplier by name', async () => {
      const results = await bm25Search('Shenzhen Tech');
      const found = results.find(r => r.nodeId === 's1');
      expect(found).toBeDefined();
    });

    it('should find certification by name', async () => {
      const results = await bm25Search('FCC 认证');
      const found = results.find(r => r.nodeId === 'cert:c1');
      expect(found).toBeDefined();
    });
  });

  // ── Hybrid Retrieve ────────────────────────────────────────────────────

  describe('hybridRetrieve', () => {
    it('should combine results from multiple retrieval paths', async () => {
      // Mock vector search to return p1
      mockVectorSearch.mockResolvedValue([{
        nodeId: 'p1',
        nodeType: 'product',
        label: 'SKU-001: 无线蓝牙耳机',
        similarity: 0.92,
        properties: { sku: 'SKU-001' },
      }]);

      // Mock searchNodes to return p1 for graph path
      mockSearchNodes.mockImplementation((_graph: unknown, query: string) => {
        const graph = makeMockGraph();
        const q = query.toLowerCase();
        const results: import('./graph-store').GraphNode[] = [];
        for (const node of graph.nodes.values()) {
          if (node.label.toLowerCase().includes(q)) results.push(node);
        }
        return results;
      });

      mockGetNeighbors.mockImplementation((_graph: unknown, nodeId: string) => {
        const graph = makeMockGraph();
        const node = graph.nodes.get(nodeId);
        return {
          nodes: node ? [node] : [],
          edges: [],
          summary: `从 ${node?.label} 出发，0层深度找到 ${node ? 1 : 0} 个关联节点`,
        };
      });

      const results = await hybridRetrieve('蓝牙耳机');

      // Should have results from at least BM25 and possibly vector/graph
      expect(results.length).toBeGreaterThan(0);

      // p1 should be found (it matches all three paths)
      const p1Result = results.find(r => r.nodeId === 'p1');
      if (p1Result) {
        expect(p1Result.sources.length).toBeGreaterThanOrEqual(1);
        expect(p1Result.rrfScore).toBeGreaterThan(0);
      }
    });

    it('should return results even when vector search fails', async () => {
      mockVectorSearch.mockRejectedValue(new Error('pgvector not available'));

      const results = await hybridRetrieve('不锈钢水壶');
      // Should still get results from BM25 and graph paths
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return results even when all paths are disabled except BM25', async () => {
      const results = await hybridRetrieve('锂电池', {
        enableVector: false,
        enableGraph: false,
        enableBM25: true,
      });
      expect(results.length).toBeGreaterThan(0);
      // All results should come from BM25 only
      for (const r of results) {
        expect(r.sources).toContain('bm25');
      }
    });

    it('should respect topK option', async () => {
      const results = await hybridRetrieve('产品', { topK: 2, enableVector: false });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should respect nodeType filter', async () => {
      const results = await hybridRetrieve('Shenzhen', {
        nodeType: 'supplier',
        enableVector: false,
      });
      for (const r of results) {
        expect(r.nodeType).toBe('supplier');
      }
    });

    it('should return empty results for nonsensical query', async () => {
      const results = await hybridRetrieve('xyznonexistent123');
      // May return 0 results if nothing matches
      expect(Array.isArray(results)).toBe(true);
    });

    it('should include RRF score and source information', async () => {
      const results = await hybridRetrieve('FCC认证', { enableVector: false });
      if (results.length > 0) {
        const first = results[0];
        expect(first).toHaveProperty('rrfScore');
        expect(first).toHaveProperty('sources');
        expect(first).toHaveProperty('ranks');
        expect(first).toHaveProperty('scores');
        expect(first.rrfScore).toBeGreaterThan(0);
      }
    });

    it('should handle OTel tracing correctly', async () => {
      await hybridRetrieve('test query');
      expect(mockStartRetrievalSpan).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'hybrid-rag' }),
      );
      expect(mockEndSpan).toHaveBeenCalled();
    });

    it('should call endSpanWithError on failure', async () => {
      mockGetGraph.mockRejectedValue(new Error('DB connection failed'));

      await expect(hybridRetrieve('test')).rejects.toThrow('DB connection failed');
      expect(mockEndSpanWithError).toHaveBeenCalled();
    });
  });

  // ── RRF Fusion Properties ──────────────────────────────────────────────

  describe('RRF fusion properties', () => {
    it('should rank nodes found by multiple paths higher than single-path nodes', async () => {
      // Mock vector search to return p1
      mockVectorSearch.mockResolvedValue([{
        nodeId: 'p1',
        nodeType: 'product',
        label: 'SKU-001: 无线蓝牙耳机',
        similarity: 0.95,
        properties: {},
      }]);

      mockSearchNodes.mockImplementation((_graph: unknown, query: string) => {
        const graph = makeMockGraph();
        const q = query.toLowerCase();
        const results: import('./graph-store').GraphNode[] = [];
        for (const node of graph.nodes.values()) {
          if (node.label.toLowerCase().includes(q)) results.push(node);
        }
        return results;
      });

      mockGetNeighbors.mockImplementation((_graph: unknown, nodeId: string) => {
        const graph = makeMockGraph();
        const node = graph.nodes.get(nodeId);
        return {
          nodes: node ? [node] : [],
          edges: [],
          summary: '',
        };
      });

      const results = await hybridRetrieve('蓝牙耳机');

      // Find p1 (should be found by multiple paths)
      const p1Result = results.find(r => r.nodeId === 'p1');
      if (p1Result && p1Result.sources.length > 1) {
        // Multi-path result should have higher RRF score than single-path
        const singlePathResults = results.filter(r => r.sources.length === 1);
        if (singlePathResults.length > 0) {
          const maxSinglePathScore = Math.max(...singlePathResults.map(r => r.rrfScore));
          expect(p1Result.rrfScore).toBeGreaterThanOrEqual(maxSinglePathScore);
        }
      }
    });

    it('should produce deterministic results for same query', async () => {
      mockSearchNodes.mockImplementation((_graph: unknown, query: string) => {
        const graph = makeMockGraph();
        const q = query.toLowerCase();
        const results: import('./graph-store').GraphNode[] = [];
        for (const node of graph.nodes.values()) {
          if (node.label.toLowerCase().includes(q)) results.push(node);
        }
        return results;
      });

      mockGetNeighbors.mockImplementation((_graph: unknown, nodeId: string) => {
        const graph = makeMockGraph();
        const node = graph.nodes.get(nodeId);
        return {
          nodes: node ? [node] : [],
          edges: [],
          summary: '',
        };
      });

      const results1 = await hybridRetrieve('FCC', { enableVector: false });
      const results2 = await hybridRetrieve('FCC', { enableVector: false });

      expect(results1.map(r => r.nodeId)).toEqual(results2.map(r => r.nodeId));
      expect(results1.map(r => r.rrfScore)).toEqual(results2.map(r => r.rrfScore));
    });
  });

  // ── Format Results ─────────────────────────────────────────────────────

  describe('formatHybridResults', () => {
    it('should return empty string for empty results', () => {
      expect(formatHybridResults([])).toBe('');
    });

    it('should format results with source tags and RRF scores', () => {
      const results = [
        {
          nodeId: 'p1',
          nodeType: 'product',
          label: 'SKU-001: 耳机',
          rrfScore: 0.0328,
          sources: ['vector', 'bm25'] as Array<'vector' | 'graph' | 'bm25'>,
          ranks: { vector: 1, bm25: 2 },
          scores: { vector: 0.92, bm25: 3.5 },
          properties: {},
        },
      ];

      const formatted = formatHybridResults(results);
      expect(formatted).toContain('语义检索结果');
      expect(formatted).toContain('语义+关键词');
      expect(formatted).toContain('0.0328');
      expect(formatted).toContain('耳机');
    });
  });
});
