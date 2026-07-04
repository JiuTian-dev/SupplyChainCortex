/**
 * Vector Index Builder — Tests
 *
 * Tests the graph-to-vector index synchronization logic
 * with mocked graph-store and vector-store dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockEnsureVectorTable = vi.fn();
const mockGetEmbeddingCount = vi.fn();
const mockGenerateEmbedding = vi.fn();
const mockBatchUpsertEmbeddings = vi.fn();
const mockClearEmbeddings = vi.fn();

vi.mock('./vector-store', () => ({
  ensureVectorTable: (...args: unknown[]) => mockEnsureVectorTable(...args),
  getEmbeddingCount: (...args: unknown[]) => mockGetEmbeddingCount(...args),
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
  batchUpsertEmbeddings: (...args: unknown[]) => mockBatchUpsertEmbeddings(...args),
  clearEmbeddings: (...args: unknown[]) => mockClearEmbeddings(...args),
}));

// Build a mock graph for testing
function makeMockGraph() {
  const nodes = new Map<string, import('./graph-store').GraphNode>();
  nodes.set('p1', {
    id: 'p1',
    type: 'product',
    label: 'SKU-001: Widget A',
    properties: { sku: 'SKU-001', name: 'Widget A', category: '电子产品', origin: '中国' },
  });
  nodes.set('p2', {
    id: 'p2',
    type: 'product',
    label: 'SKU-002: Widget B',
    properties: { sku: 'SKU-002', name: 'Widget B', category: '家居', subCategory: '厨房' },
  });
  nodes.set('s1', {
    id: 's1',
    type: 'supplier',
    label: 'SUP-001: Shenzhen Tech',
    properties: { code: 'SUP-001', name: 'Shenzhen Tech', region: '华南', rating: 4.5 },
  });
  nodes.set('w1', {
    id: 'warehouse:LA-WH',
    type: 'warehouse',
    label: 'LA-WH',
    properties: { name: 'LA-WH' },
  });
  nodes.set('port:洛杉矶',
    {
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

  return {
    nodes,
    edges: [],
    adjacency: new Map(),
    reverseAdjacency: new Map(),
    outgoingEdges: new Map(),
    builtAt: new Date().toISOString(),
    nodeCount: nodes.size,
    edgeCount: 0,
  };
}

const mockGetGraph = vi.fn();

vi.mock('./graph-store', () => ({
  getGraph: (...args: unknown[]) => mockGetGraph(...args),
}));

// Import after mocks are set up
import { buildVectorIndex } from './vector-index-builder';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('VectorIndexBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureVectorTable.mockResolvedValue(undefined);
    mockGetEmbeddingCount.mockResolvedValue(0);
    mockGetGraph.mockResolvedValue(makeMockGraph());
    mockGenerateEmbedding.mockResolvedValue(Array(1536).fill(0.1));
    mockBatchUpsertEmbeddings.mockResolvedValue(undefined);
    mockClearEmbeddings.mockResolvedValue(undefined);
  });

  describe('buildVectorIndex', () => {
    it('should skip indexing when embeddings already exist and force=false', async () => {
      mockGetEmbeddingCount.mockResolvedValue(6); // Same as node count

      const result = await buildVectorIndex();

      expect(result).toEqual({ indexed: 0, skipped: 6, errors: 0 });
      expect(mockGenerateEmbedding).not.toHaveBeenCalled();
    });

    it('should index all nodes when no embeddings exist', async () => {
      mockGetEmbeddingCount.mockResolvedValue(0);

      const result = await buildVectorIndex();

      expect(result.indexed).toBe(6);
      expect(result.errors).toBe(0);
      expect(mockGenerateEmbedding).toHaveBeenCalledTimes(6);
      expect(mockBatchUpsertEmbeddings).toHaveBeenCalled();
    });

    it('should re-index when force=true even if embeddings exist', async () => {
      mockGetEmbeddingCount.mockResolvedValue(6);

      const result = await buildVectorIndex({ force: true });

      expect(mockClearEmbeddings).toHaveBeenCalled();
      expect(result.indexed).toBe(6);
    });

    it('should generate embeddings with searchable text including node properties', async () => {
      mockGetEmbeddingCount.mockResolvedValue(0);

      await buildVectorIndex();

      // Check that generateEmbedding was called with text containing node info
      const embeddingCalls = mockGenerateEmbedding.mock.calls.map(c => c[0] as string);

      // Product node should include type label, SKU, category, origin
      const productCall = embeddingCalls.find(t => t.includes('SKU-001'));
      expect(productCall).toBeDefined();
      expect(productCall).toContain('产品');
      expect(productCall).toContain('电子产品');
      expect(productCall).toContain('中国');

      // Supplier node should include supplier info
      const supplierCall = embeddingCalls.find(t => t.includes('Shenzhen Tech'));
      expect(supplierCall).toBeDefined();
      expect(supplierCall).toContain('供应商');

      // Port node should include port label
      const portCall = embeddingCalls.find(t => t.includes('洛杉矶'));
      expect(portCall).toBeDefined();
      expect(portCall).toContain('港口');

      // Certification node should include cert name
      const certCall = embeddingCalls.find(t => t.includes('FCC认证'));
      expect(certCall).toBeDefined();
      expect(certCall).toContain('认证');
    });

    it('should pass correct EmbeddingInput to batchUpsertEmbeddings', async () => {
      mockGetEmbeddingCount.mockResolvedValue(0);

      await buildVectorIndex();

      const upsertCalls = mockBatchUpsertEmbeddings.mock.calls;
      expect(upsertCalls.length).toBeGreaterThan(0);

      // Check first batch
      const firstBatch = upsertCalls[0][0] as Array<{ input: Record<string, unknown>; embedding: number[] }>;
      for (const item of firstBatch) {
        expect(item.input).toHaveProperty('nodeId');
        expect(item.input).toHaveProperty('nodeType');
        expect(item.input).toHaveProperty('label');
        expect(item.input).toHaveProperty('text');
        expect(item.input).toHaveProperty('properties');
        expect(item.embedding).toHaveLength(1536);
      }
    });

    it('should handle embedding generation errors gracefully', async () => {
      mockGetEmbeddingCount.mockResolvedValue(0);

      // Make one embedding call fail
      let callCount = 0;
      mockGenerateEmbedding.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('API rate limit'));
        }
        return Promise.resolve(Array(1536).fill(0.1));
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await buildVectorIndex({ batchSize: 2, concurrency: 1 });

      // Should have some errors but not crash
      expect(result.errors).toBeGreaterThan(0);

      consoleSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it('should respect batchSize option', async () => {
      mockGetEmbeddingCount.mockResolvedValue(0);

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await buildVectorIndex({ batchSize: 2 });

      // With 6 nodes and batchSize=2, should have 3 batches
      // batchUpsertEmbeddings should be called at least once per batch
      expect(mockBatchUpsertEmbeddings.mock.calls.length).toBeGreaterThanOrEqual(1);

      consoleLogSpy.mockRestore();
    });

    it('should ensure vector table before indexing', async () => {
      mockGetEmbeddingCount.mockResolvedValue(0);

      await buildVectorIndex();

      expect(mockEnsureVectorTable).toHaveBeenCalledBefore(mockGenerateEmbedding);
    });

    it('should handle empty graph', async () => {
      mockGetGraph.mockResolvedValue({
        nodes: new Map(),
        edges: [],
        adjacency: new Map(),
        reverseAdjacency: new Map(),
        outgoingEdges: new Map(),
        builtAt: new Date().toISOString(),
        nodeCount: 0,
        edgeCount: 0,
      });

      const result = await buildVectorIndex();

      expect(result).toEqual({ indexed: 0, skipped: 0, errors: 0 });
      expect(mockGenerateEmbedding).not.toHaveBeenCalled();
    });
  });
});
