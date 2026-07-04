/**
 * Knowledge Graph Service Tests — CRUD + path finding + neighbors.
 *
 * Mocks Prisma db to avoid real DB connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockEntityCreate = vi.fn();
const mockEntityFindUnique = vi.fn();
const mockEntityFindMany = vi.fn();
const mockEntityUpdate = vi.fn();
const mockRelationCreate = vi.fn();
const mockRelationFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    knowledgeEntity: {
      create: (...args: unknown[]) => mockEntityCreate(...args),
      findUnique: (...args: unknown[]) => mockEntityFindUnique(...args),
      findMany: (...args: unknown[]) => mockEntityFindMany(...args),
      update: (...args: unknown[]) => mockEntityUpdate(...args),
    },
    knowledgeRelation: {
      create: (...args: unknown[]) => mockRelationCreate(...args),
      findMany: (...args: unknown[]) => mockRelationFindMany(...args),
    },
  },
}));

// Mock embedding service to avoid OpenAI calls
vi.mock('./embedding.service', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  serializeEmbedding: vi.fn().mockReturnValue('[0.1,0.2,0.3]'),
  deserializeEmbedding: vi.fn((s: string | null) => (s ? [0.1, 0.2, 0.3] : null)),
}));

// Mock tenant context so getEffectiveTenantId returns the literal 'default'
// (the .env file sets DEFAULT_TENANT_ID to a UUID which would break assertions)
vi.mock('@/lib/tenant/context', () => ({
  getEffectiveTenantId: vi.fn().mockReturnValue('default'),
  getDefaultTenantId: vi.fn().mockReturnValue('default'),
  DEFAULT_TENANT_ID: 'default',
}));

import {
  addEntity,
  addRelation,
  queryGraph,
  findPath,
  getRelatedEntities,
  getSubgraph,
  updateEntityEmbedding,
  getEntityEmbedding,
  KNOWLEDGE_ENTITY_TYPES,
  KNOWLEDGE_RELATION_TYPES,
} from './graph.service';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeDbEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entity-1',
    tenantId: 'default',
    type: 'SUPPLIER',
    name: 'Test Supplier',
    description: 'A test supplier',
    embedding: '[0.1,0.2,0.3]',
    metadata: { region: 'CN' },
    externalId: 'supplier:test-1',
    ...overrides,
  };
}

function makeDbRelation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rel-1',
    tenantId: 'default',
    sourceId: 'entity-1',
    targetId: 'entity-2',
    type: 'SUPPLIES',
    weight: 0.7,
    metadata: {},
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('graph.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Constants ───────────────────────────────────────────────────────────

  describe('constants', () => {
    it('KNOWLEDGE_ENTITY_TYPES includes all 7 types', () => {
      expect(KNOWLEDGE_ENTITY_TYPES).toHaveLength(7);
      expect(KNOWLEDGE_ENTITY_TYPES).toContain('SUPPLIER');
      expect(KNOWLEDGE_ENTITY_TYPES).toContain('PRODUCT');
      expect(KNOWLEDGE_ENTITY_TYPES).toContain('HS_CODE');
      expect(KNOWLEDGE_ENTITY_TYPES).toContain('TARIFF_RULE');
      expect(KNOWLEDGE_ENTITY_TYPES).toContain('LOGISTICS_LANE');
      expect(KNOWLEDGE_ENTITY_TYPES).toContain('REGULATION');
      expect(KNOWLEDGE_ENTITY_TYPES).toContain('RISK_EVENT');
    });

    it('KNOWLEDGE_RELATION_TYPES includes all 6 types', () => {
      expect(KNOWLEDGE_RELATION_TYPES).toHaveLength(6);
      expect(KNOWLEDGE_RELATION_TYPES).toContain('SUPPLIES');
      expect(KNOWLEDGE_RELATION_TYPES).toContain('COMPETES_WITH');
      expect(KNOWLEDGE_RELATION_TYPES).toContain('SUBJECT_TO');
      expect(KNOWLEDGE_RELATION_TYPES).toContain('LOCATED_IN');
      expect(KNOWLEDGE_RELATION_TYPES).toContain('DEPENDS_ON');
      expect(KNOWLEDGE_RELATION_TYPES).toContain('AFFECTED_BY');
    });
  });

  // ── addEntity ───────────────────────────────────────────────────────────

  describe('addEntity', () => {
    it('creates an entity and returns EntityNode', async () => {
      mockEntityCreate.mockResolvedValue(makeDbEntity());
      const entity = await addEntity({
        type: 'SUPPLIER',
        name: 'Test Supplier',
        description: 'A test supplier',
        externalId: 'supplier:test-1',
      });
      expect(mockEntityCreate).toHaveBeenCalledTimes(1);
      expect(entity.id).toBe('entity-1');
      expect(entity.type).toBe('SUPPLIER');
      expect(entity.name).toBe('Test Supplier');
    });

    it('generates embedding by default', async () => {
      mockEntityCreate.mockResolvedValue(makeDbEntity());
      await addEntity({
        type: 'PRODUCT',
        name: 'Test Product',
        description: 'desc',
      });
      const createCall = mockEntityCreate.mock.calls[0][0];
      expect(createCall.data.embedding).toBeDefined();
    });

    it('skips embedding when generateEmbeddingFlag=false', async () => {
      mockEntityCreate.mockResolvedValue(makeDbEntity({ embedding: null }));
      await addEntity({
        type: 'PRODUCT',
        name: 'Test Product',
        generateEmbeddingFlag: false,
      });
      const createCall = mockEntityCreate.mock.calls[0][0];
      expect(createCall.data.embedding).toBeNull();
    });

    it('uses default tenantId when not provided', async () => {
      mockEntityCreate.mockResolvedValue(makeDbEntity());
      await addEntity({ type: 'SUPPLIER', name: 'Test' });
      const createCall = mockEntityCreate.mock.calls[0][0];
      expect(createCall.data.tenantId).toBe('default');
    });

    it('passes metadata through', async () => {
      mockEntityCreate.mockResolvedValue(makeDbEntity());
      await addEntity({
        type: 'SUPPLIER',
        name: 'Test',
        metadata: { region: 'CN', rating: 4.5 },
      });
      const createCall = mockEntityCreate.mock.calls[0][0];
      expect(createCall.data.metadata).toEqual({ region: 'CN', rating: 4.5 });
    });
  });

  // ── addRelation ─────────────────────────────────────────────────────────

  describe('addRelation', () => {
    it('creates a relation when both entities exist', async () => {
      mockEntityFindUnique
        .mockResolvedValueOnce(makeDbEntity({ id: 'e1' }))
        .mockResolvedValueOnce(makeDbEntity({ id: 'e2' }));
      mockRelationCreate.mockResolvedValue(makeDbRelation({
        sourceId: 'e1', targetId: 'e2',
      }));

      const relation = await addRelation({
        sourceId: 'e1',
        targetId: 'e2',
        type: 'SUPPLIES',
        weight: 0.8,
      });

      expect(relation.sourceId).toBe('e1');
      expect(relation.targetId).toBe('e2');
      expect(relation.type).toBe('SUPPLIES');
      expect(mockRelationCreate).toHaveBeenCalledTimes(1);
    });

    it('throws when source entity not found', async () => {
      mockEntityFindUnique.mockResolvedValueOnce(null);
      await expect(
        addRelation({ sourceId: 'missing', targetId: 'e2', type: 'SUPPLIES' }),
      ).rejects.toThrow('Source entity not found');
    });

    it('throws when target entity not found', async () => {
      mockEntityFindUnique
        .mockResolvedValueOnce(makeDbEntity())
        .mockResolvedValueOnce(null);
      await expect(
        addRelation({ sourceId: 'e1', targetId: 'missing', type: 'SUPPLIES' }),
      ).rejects.toThrow('Target entity not found');
    });

    it('uses default weight 0.5 when not provided', async () => {
      mockEntityFindUnique
        .mockResolvedValueOnce(makeDbEntity())
        .mockResolvedValueOnce(makeDbEntity());
      mockRelationCreate.mockResolvedValue(makeDbRelation({ weight: 0.5 }));
      await addRelation({ sourceId: 'e1', targetId: 'e2', type: 'SUPPLIES' });
      const createCall = mockRelationCreate.mock.calls[0][0];
      expect(createCall.data.weight).toBe(0.5);
    });
  });

  // ── queryGraph ──────────────────────────────────────────────────────────

  describe('queryGraph', () => {
    it('returns entities and relations', async () => {
      mockEntityFindMany.mockResolvedValue([makeDbEntity()]);
      mockRelationFindMany.mockResolvedValue([makeDbRelation()]);
      const result = await queryGraph({ entityTypes: ['SUPPLIER'] });
      expect(result.entities).toHaveLength(1);
      expect(result.relations).toHaveLength(1);
      expect(result.summary).toContain('1 个实体');
    });

    it('returns empty relations when no entities match', async () => {
      mockEntityFindMany.mockResolvedValue([]);
      const result = await queryGraph({ entityTypes: ['SUPPLIER'] });
      expect(result.entities).toEqual([]);
      expect(result.relations).toEqual([]);
    });

    it('filters by nameContains', async () => {
      mockEntityFindMany.mockResolvedValue([makeDbEntity({ name: 'ABC Supplier' })]);
      await queryGraph({ nameContains: 'ABC' });
      const findManyCall = mockEntityFindMany.mock.calls[0][0];
      expect(findManyCall.where.name).toBeDefined();
    });

    it('respects limit option', async () => {
      mockEntityFindMany.mockResolvedValue([makeDbEntity()]);
      await queryGraph({ limit: 50 });
      const findManyCall = mockEntityFindMany.mock.calls[0][0];
      expect(findManyCall.take).toBe(50);
    });

    it('caps limit at 1000', async () => {
      mockEntityFindMany.mockResolvedValue([]);
      await queryGraph({ limit: 5000 });
      const findManyCall = mockEntityFindMany.mock.calls[0][0];
      expect(findManyCall.take).toBe(1000);
    });
  });

  // ── findPath ────────────────────────────────────────────────────────────

  describe('findPath', () => {
    it('returns single-node path when fromId === toId', async () => {
      mockEntityFindUnique.mockResolvedValue(makeDbEntity({ id: 'e1' }));
      const result = await findPath('e1', 'e1');
      expect(result.found).toBe(true);
      expect(result.length).toBe(0);
      expect(result.path).toHaveLength(1);
    });

    it('returns not found when source missing', async () => {
      mockEntityFindUnique.mockResolvedValue(null);
      const result = await findPath('e1', 'e1');
      expect(result.found).toBe(false);
    });

    it('finds direct path (1 hop)', async () => {
      // e1 → e2 directly
      mockEntityFindUnique
        .mockResolvedValueOnce(makeDbEntity({ id: 'e1' })) // initial check (not used in BFS)
        .mockResolvedValueOnce(makeDbEntity({ id: 'e1' }))
        .mockResolvedValueOnce(makeDbEntity({ id: 'e2' }));
      mockRelationFindMany.mockResolvedValueOnce([
        makeDbRelation({ sourceId: 'e1', targetId: 'e2' }),
      ]);
      mockEntityFindMany.mockResolvedValue([
        makeDbEntity({ id: 'e1' }),
        makeDbEntity({ id: 'e2' }),
      ]);

      const result = await findPath('e1', 'e2', 3);
      expect(result.found).toBe(true);
      expect(result.length).toBe(1);
    });

    it('returns not found when no path within maxDepth', async () => {
      mockRelationFindMany.mockResolvedValue([]); // no relations
      mockEntityFindMany.mockResolvedValue([]);
      const result = await findPath('e1', 'e2', 2);
      expect(result.found).toBe(false);
    });
  });

  // ── getRelatedEntities ──────────────────────────────────────────────────

  describe('getRelatedEntities', () => {
    it('returns empty when entity not found', async () => {
      mockEntityFindUnique.mockResolvedValue(null);
      const result = await getRelatedEntities('missing', 1);
      expect(result.entities).toEqual([]);
      expect(result.relations).toEqual([]);
    });

    it('returns neighbors at depth 1', async () => {
      mockEntityFindUnique.mockResolvedValue(makeDbEntity({ id: 'e1' }));
      mockRelationFindMany.mockResolvedValue([
        makeDbRelation({ sourceId: 'e1', targetId: 'e2' }),
      ]);
      mockEntityFindMany.mockResolvedValue([
        makeDbEntity({ id: 'e2', name: 'Neighbor' }),
      ]);

      const result = await getRelatedEntities('e1', 1);
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].id).toBe('e2');
    });

    it('deduplicates relations', async () => {
      mockEntityFindUnique.mockResolvedValue(makeDbEntity({ id: 'e1' }));
      mockRelationFindMany.mockResolvedValue([
        makeDbRelation({ id: 'r1', sourceId: 'e1', targetId: 'e2' }),
        makeDbRelation({ id: 'r1', sourceId: 'e2', targetId: 'e1' }), // same id, different direction
      ]);
      mockEntityFindMany.mockResolvedValue([makeDbEntity({ id: 'e2' })]);

      const result = await getRelatedEntities('e1', 1);
      // Deduped by id
      expect(result.relations).toHaveLength(1);
    });
  });

  // ── getSubgraph ─────────────────────────────────────────────────────────

  describe('getSubgraph', () => {
    it('throws when root entity not found', async () => {
      mockEntityFindUnique.mockResolvedValue(null);
      await expect(getSubgraph('missing', 2)).rejects.toThrow('实体不存在');
    });

    it('returns subgraph with root and neighbors', async () => {
      mockEntityFindUnique.mockResolvedValue(makeDbEntity({ id: 'e1', name: 'Root' }));
      mockRelationFindMany.mockResolvedValue([
        makeDbRelation({ sourceId: 'e1', targetId: 'e2' }),
      ]);
      mockEntityFindMany.mockResolvedValue([
        makeDbEntity({ id: 'e2', name: 'Neighbor' }),
      ]);

      const result = await getSubgraph('e1', 1);
      expect(result.root.id).toBe('e1');
      expect(result.entities).toHaveLength(1);
      expect(result.depth).toBe(1);
      expect(result.summary).toContain('子图');
    });
  });

  // ── updateEntityEmbedding ───────────────────────────────────────────────

  describe('updateEntityEmbedding', () => {
    it('returns false when entity not found', async () => {
      mockEntityFindUnique.mockResolvedValue(null);
      const result = await updateEntityEmbedding('missing');
      expect(result).toBe(false);
    });

    it('updates embedding and returns true', async () => {
      mockEntityFindUnique.mockResolvedValue(makeDbEntity({ name: 'Test', description: 'Desc' }));
      mockEntityUpdate.mockResolvedValue(makeDbEntity());
      const result = await updateEntityEmbedding('e1');
      expect(result).toBe(true);
      expect(mockEntityUpdate).toHaveBeenCalledTimes(1);
    });
  });

  // ── getEntityEmbedding ──────────────────────────────────────────────────

  describe('getEntityEmbedding', () => {
    it('returns deserialized embedding', () => {
      const result = getEntityEmbedding({ embedding: '[0.1,0.2,0.3]' });
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('returns null for null embedding', () => {
      const result = getEntityEmbedding({ embedding: null });
      expect(result).toBeNull();
    });
  });
});
