/**
 * Supply Chain RAG API — knowledge retrieval + ingestion + graph query.
 *
 * GET  /api/rag?query=xxx              → retrieve relevant knowledge (new RAG pipeline)
 * GET  /api/rag?q=xxx                  → legacy retrieve (TF-IDF, backward compat)
 * GET  /api/rag?action=domains         → list knowledge domains
 * GET  /api/rag?action=health          → RAG pipeline health check
 *
 * POST /api/rag                         → same as GET but accepts JSON body
 * POST /api/rag/ingest                  → 知识入库 (文档分块 + 嵌入 + 存储)
 *   Body: { title, content, source?, domain?, tenantId? }
 * POST /api/rag/graph                   → 图谱查询
 *   Body: { query: { entityTypes?, relationTypes?, nameContains?, limit? } }
 *
 * Backward compatibility: 旧的 `q` 参数和 `augment` 参数仍然支持 (走 legacy TF-IDF).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { retrieveKnowledge, augmentPrompt, getRAGDomains, searchByDomain } from '@/lib/engine/rag';
import {
  buildRagContext,
  getRagConfig,
} from '@/lib/knowledge/rag-pipeline';
import {
  chunkText,
  generateEmbeddings,
  serializeEmbedding,
} from '@/lib/knowledge/embedding.service';
import { queryGraph } from '@/lib/knowledge/graph.service';
import { db } from '@/lib/db';

// ─── GET ──────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const query = searchParams.get('query') || searchParams.get('q') || '';
  const domain = searchParams.get('domain');
  const augment = searchParams.get('augment') === 'true';
  const topK = parseInt(searchParams.get('topK') || '3');
  const tenantId = searchParams.get('tenantId') || 'default';

  // ── action=domains (legacy) ──────────────────────────────────────────────
  if (action === 'domains') {
    return NextResponse.json({
      domains: getRAGDomains(),
      totalChunks: 15,
      note: 'Self-contained TF-IDF retrieval. No external API required.',
    });
  }

  // ── action=health ────────────────────────────────────────────────────────
  if (action === 'health') {
    const cfg = getRagConfig();
    let chunkCount = 0;
    let docCount = 0;
    try {
      [chunkCount, docCount] = await Promise.all([
        db.knowledgeChunk.count({ where: { tenantId } }),
        db.knowledgeDocument.count({ where: { tenantId } }),
      ]);
    } catch { /* DB may be unavailable */ }
    return NextResponse.json({
      status: 'ok',
      config: cfg,
      knowledgeChunks: chunkCount,
      knowledgeDocuments: docCount,
      ragEnabled: process.env.ENABLE_RAG === 'true' || process.env.ENABLE_RAG === '1',
      embeddingProvider: process.env.EMBEDDING_PROVIDER || 'openai',
      embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    });
  }

  // ── domain filter (legacy) ───────────────────────────────────────────────
  if (domain) {
    const chunks = searchByDomain(domain);
    return NextResponse.json({ domain, chunks: chunks.map(c => ({ title: c.title, id: c.id })) });
  }

  // ── New RAG pipeline (query param) ───────────────────────────────────────
  if (searchParams.has('query')) {
    try {
      const ragCtx = await buildRagContext(query, undefined, { tenantId, topK });
      return NextResponse.json({
        query,
        results: ragCtx.results.map(r => ({
          chunkId: r.chunkId,
          title: r.title,
          domain: r.domain,
          content: r.content.slice(0, 300) + (r.content.length > 300 ? '...' : ''),
          rerankScore: Math.round(r.rerankScore * 1000) / 1000,
          vectorScore: Math.round(r.vectorScore * 1000) / 1000,
          bm25Score: Math.round(r.bm25Score * 1000) / 1000,
        })),
        context: ragCtx.context.slice(0, 2000),
        totalTokens: ragCtx.totalTokens,
        truncated: ragCtx.truncated,
        usedDomainKnowledge: !!ragCtx.domainKnowledge,
      });
    } catch (err) {
      console.warn('[RAG API] new pipeline failed, falling back to legacy:', (err as Error).message);
    }
  }

  // ── Legacy TF-IDF retrieval (q param) ────────────────────────────────────
  const results = retrieveKnowledge(query, topK);

  if (augment) {
    const promptAddition = augmentPrompt(query, results);
    return NextResponse.json({
      query,
      results: results.map(r => ({
        title: r.chunk.title,
        domain: r.chunk.domain,
        score: Math.round(r.score * 1000) / 1000,
        relevance: r.relevance,
      })),
      augmentedPrompt: promptAddition
        ? promptAddition.slice(0, 2000)
        : '(无相关知识库匹配)',
    });
  }

  return NextResponse.json({
    query,
    results: results.map(r => ({
      title: r.chunk.title,
      domain: r.chunk.domain,
      content: r.chunk.content.slice(0, 300) + '...',
      score: Math.round(r.score * 1000) / 1000,
      relevance: r.relevance,
    })),
  });
});

// ─── POST (retrieve via body) ─────────────────────────────────────────────

export const POST = withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const body = await request.json();
  const action = body.action as string | undefined;

  // ── POST /api/rag/ingest — 知识入库 ──────────────────────────────────────
  if (action === 'ingest' || body.title && body.content) {
    return await handleIngest(body);
  }

  // ── POST /api/rag/graph — 图谱查询 ───────────────────────────────────────
  if (action === 'graph' || body.graphQuery) {
    return await handleGraphQuery(body);
  }

  // ── Default: retrieve via body ───────────────────────────────────────────
  const query: string = body.query ?? '';
  const topK: number = body.topK ?? 3;
  const augment: boolean = body.augment ?? false;
  const domain: string | undefined = body.domain;
  const tenantId: string = body.tenantId || 'default';

  if (domain) {
    const chunks = searchByDomain(domain);
    return NextResponse.json({ domain, chunks: chunks.map(c => ({ title: c.title, id: c.id })) });
  }

  // Try new RAG pipeline first
  try {
    const ragCtx = await buildRagContext(query, undefined, { tenantId, topK });
    if (ragCtx.results.length > 0 || ragCtx.context) {
      return NextResponse.json({
        query,
        results: ragCtx.results.map(r => ({
          chunkId: r.chunkId,
          title: r.title,
          domain: r.domain,
          content: r.content.slice(0, 300) + (r.content.length > 300 ? '...' : ''),
          rerankScore: Math.round(r.rerankScore * 1000) / 1000,
          vectorScore: Math.round(r.vectorScore * 1000) / 1000,
          bm25Score: Math.round(r.bm25Score * 1000) / 1000,
        })),
        context: ragCtx.context.slice(0, 2000),
        totalTokens: ragCtx.totalTokens,
        truncated: ragCtx.truncated,
        usedDomainKnowledge: !!ragCtx.domainKnowledge,
      });
    }
  } catch (err) {
    console.warn('[RAG API POST] new pipeline failed, falling back to legacy:', (err as Error).message);
  }

  // Legacy fallback
  const results = retrieveKnowledge(query, topK);

  if (augment) {
    const promptAddition = augmentPrompt(query, results);
    return NextResponse.json({
      query,
      results: results.map(r => ({
        title: r.chunk.title,
        domain: r.chunk.domain,
        score: Math.round(r.score * 1000) / 1000,
        relevance: r.relevance,
      })),
      augmentedPrompt: promptAddition
        ? promptAddition.slice(0, 2000)
        : '(无相关知识库匹配)',
    });
  }

  return NextResponse.json({
    query,
    results: results.map(r => ({
      title: r.chunk.title,
      domain: r.chunk.domain,
      content: r.chunk.content.slice(0, 300) + '...',
      score: Math.round(r.score * 1000) / 1000,
      relevance: r.relevance,
    })),
  });
});

// ─── Ingest Handler ───────────────────────────────────────────────────────

async function handleIngest(body: {
  title: string;
  content: string;
  source?: string;
  domain?: string;
  tenantId?: string;
  maxTokens?: number;
  overlapTokens?: number;
}): Promise<NextResponse> {
  const tenantId = body.tenantId || 'default';
  const title = body.title?.trim();
  const content = body.content?.trim();

  if (!title || !content) {
    return NextResponse.json(
      { success: false, error: 'title and content are required' },
      { status: 400 },
    );
  }

  // 1. 创建文档
  const document = await db.knowledgeDocument.create({
    data: {
      tenantId,
      title,
      content,
      source: body.source || null,
      domain: body.domain || 'general',
      metadata: {},
    },
  });

  // 2. 文本分块
  const chunks = chunkText(content, {
    maxTokens: body.maxTokens ?? 256,
    overlapTokens: body.overlapTokens ?? 50,
  });

  if (chunks.length === 0) {
    return NextResponse.json({
      success: true,
      documentId: document.id,
      chunkCount: 0,
      message: '文档已创建但无有效分块',
    });
  }

  // 3. 批量生成嵌入
  const embeddings = await generateEmbeddings(chunks.map(c => c.content));

  // 4. 存储分块 + 嵌入
  const chunkRecords = await Promise.all(
    chunks.map((chunk, i) =>
      db.knowledgeChunk.create({
        data: {
          tenantId,
          documentId: document.id,
          content: chunk.content,
          embedding: serializeEmbedding(embeddings[i]),
          chunkIndex: chunk.chunkIndex,
          tokenCount: chunk.tokenCount,
          metadata: { source: body.source || null, section: i },
        },
      }),
    ),
  );

  // 5. 更新文档 chunkCount
  await db.knowledgeDocument.update({
    where: { id: document.id },
    data: { chunkCount: chunkRecords.length },
  });

  return NextResponse.json({
    success: true,
    documentId: document.id,
    title,
    chunkCount: chunkRecords.length,
    totalTokens: chunks.reduce((s, c) => s + c.tokenCount, 0),
    domain: body.domain || 'general',
  });
}

// ─── Graph Query Handler ──────────────────────────────────────────────────

async function handleGraphQuery(body: {
  graphQuery?: {
    tenantId?: string;
    entityTypes?: string[];
    relationTypes?: string[];
    nameContains?: string;
    externalId?: string;
    limit?: number;
  };
}): Promise<NextResponse> {
  const gq = body.graphQuery || {};

  const result = await queryGraph({
    tenantId: gq.tenantId || 'default',
    entityTypes: gq.entityTypes as never,
    relationTypes: gq.relationTypes as never,
    nameContains: gq.nameContains,
    externalId: gq.externalId,
    limit: gq.limit,
  });

  return NextResponse.json({
    success: true,
    entities: result.entities.map(e => ({
      id: e.id,
      type: e.type,
      name: e.name,
      description: e.description,
      externalId: e.externalId,
    })),
    relations: result.relations.map(r => ({
      id: r.id,
      sourceId: r.sourceId,
      targetId: r.targetId,
      type: r.type,
      weight: r.weight,
    })),
    summary: result.summary,
  });
}
