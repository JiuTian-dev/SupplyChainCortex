/**
 * Knowledge Graph Service — 知识图谱 CRUD + 图查询 + 路径查找.
 *
 * 基于 Prisma KnowledgeEntity / KnowledgeRelation 模型.
 * 支持: 实体/关系 CRUD, 图查询 (按类型/属性过滤), BFS 路径查找, N 跳邻居, 子图提取.
 */

import { db } from '@/lib/db';
import { generateEmbedding, serializeEmbedding, deserializeEmbedding } from './embedding.service';
import { getEffectiveTenantId } from '@/lib/tenant/context';

// ─── Types ────────────────────────────────────────────────────────────────

export type KnowledgeEntityType =
  | 'SUPPLIER'
  | 'PRODUCT'
  | 'HS_CODE'
  | 'TARIFF_RULE'
  | 'LOGISTICS_LANE'
  | 'REGULATION'
  | 'RISK_EVENT';

export type KnowledgeRelationType =
  | 'SUPPLIES'
  | 'COMPETES_WITH'
  | 'SUBJECT_TO'
  | 'LOCATED_IN'
  | 'DEPENDS_ON'
  | 'AFFECTED_BY';

export const KNOWLEDGE_ENTITY_TYPES: readonly KnowledgeEntityType[] = [
  'SUPPLIER', 'PRODUCT', 'HS_CODE', 'TARIFF_RULE', 'LOGISTICS_LANE', 'REGULATION', 'RISK_EVENT',
] as const;

export const KNOWLEDGE_RELATION_TYPES: readonly KnowledgeRelationType[] = [
  'SUPPLIES', 'COMPETES_WITH', 'SUBJECT_TO', 'LOCATED_IN', 'DEPENDS_ON', 'AFFECTED_BY',
] as const;

export interface AddEntityInput {
  type: KnowledgeEntityType;
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  externalId?: string;
  tenantId?: string;
  /** 是否生成嵌入 (默认 true) */
  generateEmbeddingFlag?: boolean;
}

export interface AddRelationInput {
  sourceId: string;
  targetId: string;
  type: KnowledgeRelationType;
  weight?: number;
  metadata?: Record<string, unknown>;
  tenantId?: string;
}

export interface GraphQuery {
  tenantId?: string;
  entityTypes?: KnowledgeEntityType[];
  relationTypes?: KnowledgeRelationType[];
  nameContains?: string;
  externalId?: string;
  /** 属性过滤 (metadata JSON 路径 → 值) */
  metadataFilter?: Record<string, unknown>;
  limit?: number;
}

export interface GraphQueryResult {
  entities: EntityNode[];
  relations: RelationEdge[];
  summary: string;
}

export interface EntityNode {
  id: string;
  type: KnowledgeEntityType;
  name: string;
  description: string | null;
  externalId: string | null;
  metadata: Record<string, unknown>;
  tenantId: string;
}

export interface RelationEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: KnowledgeRelationType;
  weight: number;
  metadata: Record<string, unknown>;
  tenantId: string;
}

export interface PathResult {
  found: boolean;
  path: EntityNode[];
  relations: RelationEdge[];
  length: number;
  summary: string;
}

export interface SubgraphResult {
  root: EntityNode;
  entities: EntityNode[];
  relations: RelationEdge[];
  depth: number;
  summary: string;
}

// ─── Add Entity ───────────────────────────────────────────────────────────

/**
 * 添加知识实体.
 * 自动生成嵌入向量 (基于 name + description).
 */
export async function addEntity(input: AddEntityInput): Promise<EntityNode> {
  const tenantId = input.tenantId || getEffectiveTenantId();
  const embeddingText = `${input.name} ${input.description || ''}`.trim();

  let embeddingStr: string | null = null;
  if (input.generateEmbeddingFlag !== false && embeddingText) {
    try {
      const vec = await generateEmbedding(embeddingText);
      embeddingStr = serializeEmbedding(vec);
    } catch (err) {
      console.warn('[GraphService] embedding generation failed:', (err as Error).message);
    }
  }

  const entity = await db.knowledgeEntity.create({
    data: {
      tenantId,
      type: input.type,
      name: input.name,
      description: input.description || null,
      embedding: embeddingStr,
      metadata: (input.metadata || {}) as any,
      externalId: input.externalId || null,
    },
  });

  return toEntityNode(entity);
}

// ─── Add Relation ─────────────────────────────────────────────────────────

/**
 * 添加知识关系. 校验 source/target 存在.
 */
export async function addRelation(input: AddRelationInput): Promise<RelationEdge> {
  const tenantId = input.tenantId || getEffectiveTenantId();

  // 校验 source/target 存在
  const [source, target] = await Promise.all([
    db.knowledgeEntity.findUnique({ where: { id: input.sourceId } }),
    db.knowledgeEntity.findUnique({ where: { id: input.targetId } }),
  ]);
  if (!source) throw new Error(`Source entity not found: ${input.sourceId}`);
  if (!target) throw new Error(`Target entity not found: ${input.targetId}`);

  const relation = await db.knowledgeRelation.create({
    data: {
      tenantId,
      sourceId: input.sourceId,
      targetId: input.targetId,
      type: input.type,
      weight: input.weight ?? 0.5,
      metadata: (input.metadata || {}) as any,
    },
  });

  return toRelationEdge(relation);
}

// ─── Query Graph ──────────────────────────────────────────────────────────

/**
 * 图查询 — 按实体类型/关系类型/属性过滤.
 */
export async function queryGraph(query: GraphQuery): Promise<GraphQueryResult> {
  const tenantId = query.tenantId || getEffectiveTenantId();
  const limit = Math.min(query.limit || 100, 1000);

  const entityWhere: Record<string, unknown> = { tenantId };
  if (query.entityTypes && query.entityTypes.length > 0) {
    entityWhere.type = { in: query.entityTypes };
  }
  if (query.nameContains) {
    entityWhere.name = { contains: query.nameContains, mode: 'insensitive' };
  }
  if (query.externalId) {
    entityWhere.externalId = query.externalId;
  }

  const entities = await db.knowledgeEntity.findMany({
    where: entityWhere,
    take: limit,
  });

  // 查询相关 relations (仅在指定 relationTypes 或 entities 非空时)
  let relations: Array<{
    id: string; sourceId: string; targetId: string; type: string;
    weight: number; metadata: unknown; tenantId: string;
  }> = [];

  if (entities.length > 0) {
    const entityIds = entities.map(e => e.id);
    const relationWhere: Record<string, unknown> = {
      tenantId,
      OR: [
        { sourceId: { in: entityIds } },
        { targetId: { in: entityIds } },
      ],
    };
    if (query.relationTypes && query.relationTypes.length > 0) {
      relationWhere.type = { in: query.relationTypes };
    }
    relations = await db.knowledgeRelation.findMany({ where: relationWhere, take: limit });
  }

  return {
    entities: entities.map(toEntityNode),
    relations: relations.map(toRelationEdge),
    summary: `查询返回 ${entities.length} 个实体, ${relations.length} 条关系.`,
  };
}

// ─── Find Path (BFS) ──────────────────────────────────────────────────────

/**
 * 查找两个实体间的最短路径 (BFS, 忽略方向).
 * 返回路径上的实体序列和关系序列.
 */
export async function findPath(
  fromId: string,
  toId: string,
  maxDepth = 5,
): Promise<PathResult> {
  if (fromId === toId) {
    const root = await db.knowledgeEntity.findUnique({ where: { id: fromId } });
    if (!root) {
      return { found: false, path: [], relations: [], length: 0, summary: `起点不存在: ${fromId}` };
    }
    const node = toEntityNode(root);
    return { found: true, path: [node], relations: [], length: 0, summary: '起点=终点' };
  }

  // 拉取相关 relations (起点周边, 逐步扩展)
  const visited = new Set<string>([fromId]);
  const parent = new Map<string, { parentId: string; relation: RelationEdge }>();
  const queue: string[] = [fromId];
  let depth = 0;
  let found = false;

  while (queue.length > 0 && depth < maxDepth && !found) {
    const levelSize = queue.length;
    for (let i = 0; i < levelSize; i++) {
      const current = queue.shift()!;
      if (current === toId) {
        found = true;
        break;
      }

      // 获取邻居 (双向)
      const relations = await db.knowledgeRelation.findMany({
        where: {
          OR: [{ sourceId: current }, { targetId: current }],
        },
      });

      for (const rel of relations) {
        const neighbor = rel.sourceId === current ? rel.targetId : rel.sourceId;
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        parent.set(neighbor, { parentId: current, relation: toRelationEdge(rel) });
        queue.push(neighbor);
      }
    }
    depth++;
  }

  if (!found && !visited.has(toId)) {
    return {
      found: false,
      path: [],
      relations: [],
      length: 0,
      summary: `未找到 ${fromId} → ${toId} 的路径 (maxDepth=${maxDepth})`,
    };
  }

  // 回溯路径
  const pathIds: string[] = [toId];
  const pathRelations: RelationEdge[] = [];
  let current = toId;
  while (current !== fromId) {
    const p = parent.get(current);
    if (!p) break;
    pathIds.unshift(p.parentId);
    pathRelations.unshift(p.relation);
    current = p.parentId;
  }

  // 拉取路径上的实体
  const entities = await db.knowledgeEntity.findMany({
    where: { id: { in: pathIds } },
  });
  const entityMap = new Map(entities.map(e => [e.id, e]));
  const path = pathIds.map(id => {
    const e = entityMap.get(id);
    if (!e) throw new Error(`路径实体缺失: ${id}`);
    return toEntityNode(e);
  });

  return {
    found: true,
    path,
    relations: pathRelations,
    length: path.length - 1,
    summary: `找到路径: ${path.map(p => p.name).join(' → ')} (${path.length - 1} 跳)`,
  };
}

// ─── Get Related Entities (N 跳邻居) ──────────────────────────────────────

/**
 * 获取实体的 N 跳邻居 (BFS, 忽略方向).
 */
export async function getRelatedEntities(
  entityId: string,
  depth = 1,
): Promise<{ entities: EntityNode[]; relations: RelationEdge[]; summary: string }> {
  const root = await db.knowledgeEntity.findUnique({ where: { id: entityId } });
  if (!root) {
    return { entities: [], relations: [], summary: `实体不存在: ${entityId}` };
  }

  const visited = new Set<string>([entityId]);
  const allRelations: RelationEdge[] = [];
  const queue: string[] = [entityId];
  let currentDepth = 0;

  while (queue.length > 0 && currentDepth < depth) {
    const levelSize = queue.length;
    for (let i = 0; i < levelSize; i++) {
      const current = queue.shift()!;
      const relations = await db.knowledgeRelation.findMany({
        where: {
          OR: [{ sourceId: current }, { targetId: current }],
        },
      });

      for (const rel of relations) {
        const neighbor = rel.sourceId === current ? rel.targetId : rel.sourceId;
        allRelations.push(toRelationEdge(rel));
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    currentDepth++;
  }

  // 拉取所有邻居实体 (排除 root)
  const neighborIds = Array.from(visited).filter(id => id !== entityId);
  const entities = await db.knowledgeEntity.findMany({
    where: { id: { in: neighborIds } },
  });

  return {
    entities: entities.map(toEntityNode),
    relations: dedupeRelations(allRelations),
    summary: `${depth} 跳邻居: ${entities.length} 个实体, ${allRelations.length} 条关系.`,
  };
}

// ─── Get Subgraph ─────────────────────────────────────────────────────────

/**
 * 获取以 entityId 为根, depth 跳的子图.
 * 包含 root + 邻居 + 关系.
 */
export async function getSubgraph(entityId: string, depth = 2): Promise<SubgraphResult> {
  const root = await db.knowledgeEntity.findUnique({ where: { id: entityId } });
  if (!root) {
    throw new Error(`实体不存在: ${entityId}`);
  }

  const related = await getRelatedEntities(entityId, depth);

  return {
    root: toEntityNode(root),
    entities: related.entities,
    relations: related.relations,
    depth,
    summary: `子图 (根: ${root.name}, 深度 ${depth}): ${related.entities.length + 1} 个实体, ${related.relations.length} 条关系.`,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

interface PrismaEntity {
  id: string;
  type: string;
  name: string;
  description: string | null;
  embedding: string | null;
  metadata: unknown;
  externalId: string | null;
  tenantId: string;
}

interface PrismaRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  weight: number;
  metadata: unknown;
  tenantId: string;
}

function toEntityNode(e: PrismaEntity): EntityNode {
  return {
    id: e.id,
    type: e.type as KnowledgeEntityType,
    name: e.name,
    description: e.description,
    externalId: e.externalId,
    metadata: (e.metadata && typeof e.metadata === 'object' ? e.metadata : {}) as Record<string, unknown>,
    tenantId: e.tenantId,
  };
}

function toRelationEdge(r: PrismaRelation): RelationEdge {
  return {
    id: r.id,
    sourceId: r.sourceId,
    targetId: r.targetId,
    type: r.type as KnowledgeRelationType,
    weight: r.weight,
    metadata: (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as Record<string, unknown>,
    tenantId: r.tenantId,
  };
}

function dedupeRelations(relations: RelationEdge[]): RelationEdge[] {
  const seen = new Set<string>();
  const result: RelationEdge[] = [];
  for (const r of relations) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    result.push(r);
  }
  return result;
}

// ─── Entity Embedding Update ──────────────────────────────────────────────

/**
 * 重新生成实体嵌入向量 (用于实体更新后).
 */
export async function updateEntityEmbedding(entityId: string): Promise<boolean> {
  const entity = await db.knowledgeEntity.findUnique({ where: { id: entityId } });
  if (!entity) return false;

  const embeddingText = `${entity.name} ${entity.description || ''}`.trim();
  if (!embeddingText) return false;

  try {
    const vec = await generateEmbedding(embeddingText);
    await db.knowledgeEntity.update({
      where: { id: entityId },
      data: { embedding: serializeEmbedding(vec) },
    });
    return true;
  } catch (err) {
    console.warn('[GraphService] updateEntityEmbedding failed:', (err as Error).message);
    return false;
  }
}

/** 反序列化实体嵌入 (用于外部向量检索) */
export function getEntityEmbedding(entity: { embedding: string | null }): number[] | null {
  return deserializeEmbedding(entity.embedding);
}
