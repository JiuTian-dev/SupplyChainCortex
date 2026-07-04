/**
 * RAG Pipeline — 检索增强生成管道.
 *
 * 流程: query → retrieve (向量检索) → rerank (BM25 + 关键词 + 相似度) →
 *       compressContext (压缩) → buildRagContext (完整上下文)
 *
 * 数据源: KnowledgeChunk 表 (Prisma) + 领域知识库 (domain-knowledge.ts) fallback.
 * 支持 tenant 隔离.
 *
 * 环境变量:
 *   RAG_TOP_K          — 检索 top-k (默认 5)
 *   RAG_RERANK_TOP_K   — 重排后保留 top-k (默认 3)
 *   RAG_MAX_TOKENS     — 上下文压缩最大 token (默认 1500)
 *   RAG_THRESHOLD      — 相似度阈值 (默认 0.3)
 */

import { db } from '@/lib/db';
import {
  generateEmbedding,
  cosineSimilarity,
  deserializeEmbedding,
  estimateTokens,
} from './embedding.service';
import {
  getDomainKnowledge,
  type DomainKnowledgeResult,
} from './domain-knowledge';
import { getEffectiveTenantId } from '@/lib/tenant/context';
import type { Intent } from '@/lib/agent/fsm-types';

// ─── Configuration ────────────────────────────────────────────────────────

export interface RagConfig {
  topK: number;
  rerankTopK: number;
  maxTokens: number;
  threshold: number;
}

export function getRagConfig(): RagConfig {
  return {
    topK: parseInt(process.env.RAG_TOP_K || '5', 10),
    rerankTopK: parseInt(process.env.RAG_RERANK_TOP_K || '3', 10),
    maxTokens: parseInt(process.env.RAG_MAX_TOKENS || '1500', 10),
    threshold: parseFloat(process.env.RAG_THRESHOLD || '0.3'),
  };
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface RetrievalResult {
  chunkId: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  /** 向量相似度 0-1 */
  similarity: number;
  /** 文档标题 */
  title?: string;
  /** 文档领域 */
  domain?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface RerankedResult extends RetrievalResult {
  /** 重排后综合分数 */
  rerankScore: number;
  /** BM25 分数 */
  bm25Score: number;
  /** 关键词匹配分数 */
  keywordScore: number;
  /** 原始相似度 */
  vectorScore: number;
}

export interface RagContext {
  query: string;
  intent?: Intent;
  results: RerankedResult[];
  /** 压缩后的上下文文本 (用于注入 system prompt) */
  context: string;
  domainKnowledge?: DomainKnowledgeResult;
  totalTokens: number;
  truncated: boolean;
}

export interface RetrieveOptions {
  tenantId?: string;
  topK?: number;
  threshold?: number;
  /** 仅检索特定领域 */
  domain?: string;
}

// ─── Retrieve (向量检索) ──────────────────────────────────────────────────

/**
 * 向量检索 — 从 KnowledgeChunk 表检索 top-k 相似文档块.
 * 若向量索引为空, 返回空数组 (由 buildRagContext fallback 到领域知识).
 */
export async function retrieve(
  query: string,
  options?: RetrieveOptions,
): Promise<RetrievalResult[]> {
  if (!query || query.trim().length === 0) return [];

  const cfg = getRagConfig();
  const topK = options?.topK ?? cfg.topK;
  const threshold = options?.threshold ?? cfg.threshold;
  const tenantId = options?.tenantId || getEffectiveTenantId();

  try {
    // 生成查询向量
    const queryEmbedding = await generateEmbedding(query);

    // 拉取所有 chunk (带 tenant 过滤) — 优化: 实际生产应使用 pgvector ANN 索引
    const where: Record<string, unknown> = { tenantId };
    if (options?.domain) {
      where.document = { domain: options.domain };
    }
    const chunks = await db.knowledgeChunk.findMany({
      where,
      include: {
        document: {
          select: { id: true, title: true, domain: true, source: true },
        },
      },
      take: 1000, // 安全上限
    });

    if (chunks.length === 0) return [];

    // 计算相似度并排序
    const scored = chunks
      .map(chunk => {
        const embedding = deserializeEmbedding(chunk.embedding);
        if (!embedding) return null;
        const similarity = cosineSimilarity(queryEmbedding, embedding);
        return {
          chunkId: chunk.id,
          documentId: chunk.documentId,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          similarity,
          title: chunk.document.title,
          domain: chunk.document.domain,
          source: chunk.document.source,
          metadata: chunk.metadata as Record<string, unknown> | undefined,
        } as RetrievalResult;
      })
      .filter((r): r is RetrievalResult => r !== null && r.similarity >= threshold);

    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  } catch (err) {
    console.warn('[RAG] retrieve failed:', (err as Error).message);
    return [];
  }
}

// ─── Rerank (重排序) ──────────────────────────────────────────────────────

/**
 * 重排序 — 基于 BM25 + 关键词匹配 + 向量相似度加权.
 *
 * score = 0.5 * vectorScore + 0.3 * bm25Score + 0.2 * keywordScore
 */
export function rerank(results: RetrievalResult[], query: string): RerankedResult[] {
  if (results.length === 0) return [];
  if (!query) {
    return results.map(r => ({
      ...r,
      rerankScore: r.similarity,
      bm25Score: 0,
      keywordScore: 0,
      vectorScore: r.similarity,
    }));
  }

  const queryTokens = tokenize(query);
  const queryKeywords = extractKeywords(query);

  // BM25 参数
  const k1 = 1.5;
  const b = 0.75;
  const avgDocLen = results.reduce((s, r) => s + tokenize(r.content).length, 0) / results.length || 1;

  // 计算 BM25 (基于 results 集合作为语料库)
  const df: Record<string, number> = {};
  for (const r of results) {
    const tokens = new Set(tokenize(r.content));
    for (const t of tokens) {
      df[t] = (df[t] || 0) + 1;
    }
  }
  const N = results.length;

  const scored = results.map(r => {
    const docTokens = tokenize(r.content);
    const docLen = docTokens.length || 1;
    const tf: Record<string, number> = {};
    for (const t of docTokens) {
      tf[t] = (tf[t] || 0) + 1;
    }

    // BM25 score
    let bm25 = 0;
    for (const qt of queryTokens) {
      if (tf[qt] === undefined) continue;
      const idf = Math.log((N - (df[qt] || 0) + 0.5) / ((df[qt] || 0) + 0.5) + 1);
      const numerator = tf[qt] * (k1 + 1);
      const denominator = tf[qt] + k1 * (1 - b + b * (docLen / avgDocLen));
      bm25 += idf * (numerator / denominator);
    }
    // 归一化 BM25 到 0-1
    const bm25Normalized = Math.min(1, bm25 / 10);

    // 关键词匹配分数
    const docLower = r.content.toLowerCase();
    const titleLower = (r.title || '').toLowerCase();
    let keywordScore = 0;
    for (const kw of queryKeywords) {
      if (titleLower.includes(kw)) keywordScore += 0.5; // 标题匹配权重高
      if (docLower.includes(kw)) keywordScore += 0.3;
    }
    keywordScore = Math.min(1, keywordScore);

    // 综合分数
    const rerankScore = 0.5 * r.similarity + 0.3 * bm25Normalized + 0.2 * keywordScore;

    return {
      ...r,
      rerankScore,
      bm25Score: bm25Normalized,
      keywordScore,
      vectorScore: r.similarity,
    } as RerankedResult;
  });

  return scored.sort((a, b) => b.rerankScore - a.rerankScore);
}

// ─── Compress Context (上下文压缩) ────────────────────────────────────────

/**
 * 上下文压缩 — 保留最相关片段, 控制总 token 数.
 * 优先保留高 rerankScore 片段, 按需截断低分片段.
 */
export function compressContext(results: RerankedResult[], maxTokens: number): {
  context: string;
  totalTokens: number;
  truncated: boolean;
} {
  if (results.length === 0) {
    return { context: '', totalTokens: 0, truncated: false };
  }

  const lines: string[] = [];
  let totalTokens = 0;
  let truncated = false;

  for (const r of results) {
    const header = `[${r.title || '知识片段'}] (相关度: ${r.rerankScore.toFixed(2)})`;
    const candidate = `${header}\n${r.content}`;
    const candidateTokens = estimateTokens(candidate);

    if (totalTokens + candidateTokens <= maxTokens) {
      lines.push(candidate);
      totalTokens += candidateTokens + 2; // +2 for separator
    } else {
      // 截断最后一段以填满剩余预算
      const remaining = maxTokens - totalTokens;
      if (remaining > 50) {
        const approxChars = remaining * 3; // 近似 token → char
        const truncatedContent = r.content.slice(0, approxChars) + '...';
        lines.push(`${header}\n${truncatedContent}`);
        totalTokens = maxTokens;
      }
      truncated = true;
      break;
    }
  }

  return {
    context: lines.join('\n\n---\n\n'),
    totalTokens,
    truncated,
  };
}

// ─── Build RAG Context (完整上下文) ───────────────────────────────────────

/**
 * 构建完整 RAG 上下文 — retrieve → rerank → compress.
 * 若向量检索为空, fallback 到领域知识库.
 */
export async function buildRagContext(
  query: string,
  intent?: Intent,
  options?: RetrieveOptions,
): Promise<RagContext> {
  const cfg = getRagConfig();

  // 1. Retrieve
  const retrieved = await retrieve(query, options);

  // 2. Rerank
  const reranked = rerank(retrieved, query).slice(0, cfg.rerankTopK);

  // 3. Compress
  const { context, truncated } = compressContext(reranked, cfg.maxTokens);

  // 4. Fallback: 若向量检索为空, 注入领域知识
  let domainKnowledge: DomainKnowledgeResult | undefined;
  let finalContext = context;

  if (reranked.length === 0) {
    domainKnowledge = getDomainKnowledge(query, intent);
    finalContext = formatDomainKnowledge(domainKnowledge, cfg.maxTokens);
  }

  return {
    query,
    intent,
    results: reranked,
    context: finalContext,
    domainKnowledge,
    totalTokens: finalContext ? estimateTokens(finalContext) : 0,
    truncated,
  };
}

/** 将领域知识格式化为上下文文本 */
function formatDomainKnowledge(dk: DomainKnowledgeResult, maxTokens: number): string {
  const lines: string[] = ['## 供应链领域知识参考'];

  if (dk.tariffRules.length > 0) {
    lines.push('\n### 关税规则');
    for (const r of dk.tariffRules.slice(0, 3)) {
      lines.push(`- **${r.name}** (${r.rateRange}): ${r.description}`);
    }
  }

  if (dk.regulations.length > 0) {
    lines.push('\n### 合规法规');
    for (const r of dk.regulations.slice(0, 3)) {
      lines.push(`- **${r.name}** (${r.region}): ${r.description}`);
    }
  }

  if (dk.logisticsLanes.length > 0) {
    lines.push('\n### 物流通道');
    for (const l of dk.logisticsLanes.slice(0, 2)) {
      lines.push(`- **${l.name}** (${l.transitDays.min}-${l.transitDays.max} 天, ${l.costRange}): ${l.notes}`);
    }
  }

  if (dk.hsCodes.length > 0) {
    lines.push('\n### HS 编码');
    for (const h of dk.hsCodes.slice(0, 3)) {
      lines.push(`- **${h.hsCode}** ${h.description} (美国 MFN ${h.usMFNRate}%, 欧盟 ${h.euRate}%)`);
    }
  }

  if (dk.riskFactors.length > 0) {
    lines.push('\n### 供应商风险因子');
    for (const r of dk.riskFactors.slice(0, 2)) {
      lines.push(`- **${r.name}**: ${r.description} → 缓解: ${r.mitigation}`);
    }
  }

  let result = lines.join('\n');
  // 截断到 maxTokens
  const tokens = estimateTokens(result);
  if (tokens > maxTokens) {
    const approxChars = maxTokens * 3;
    result = result.slice(0, approxChars) + '\n...(领域知识已截断)';
  }
  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** BM25 风格分词 (中英文混合) */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const tokens: string[] = [];
  const parts = text.toLowerCase().split(/([^a-z0-9\u4e00-\u9fff-]+)/);

  for (const part of parts) {
    if (/^[a-z0-9-]+$/.test(part)) {
      const subTokens = part.split(/[\s-]+/).filter(t => t.length > 1);
      tokens.push(...subTokens);
      continue;
    }
    // CJK: unigrams + bigrams
    const cjkChars = part.replace(/[^\u4e00-\u9fff]/g, '');
    if (cjkChars.length > 0) {
      for (const ch of cjkChars) {
        tokens.push(ch);
      }
      for (let i = 0; i < cjkChars.length - 1; i++) {
        tokens.push(cjkChars.slice(i, i + 2));
      }
    }
  }
  return tokens;
}

/** 提取查询关键词 (用于关键词匹配评分) */
function extractKeywords(query: string): string[] {
  if (!query) return [];
  const keywords = new Set<string>();
  // 英文词
  const enWords = query.toLowerCase().match(/[a-z0-9]{2,}/g) || [];
  for (const w of enWords) {
    if (w.length > 2) keywords.add(w);
  }
  // 中文词 (按空格/标点分割)
  const cnParts = query.split(/[\s,，。、；：!?]+/).filter(p => p.length > 1);
  for (const p of cnParts) {
    keywords.add(p.toLowerCase());
  }
  // 中文 unigram (作为补充)
  const cjkChars = query.match(/[\u4e00-\u9fff]{2,}/g) || [];
  for (const seg of cjkChars) {
    keywords.add(seg.toLowerCase());
  }
  return Array.from(keywords);
}

// ─── Legacy Compatibility Wrappers ────────────────────────────────────────
// 以下函数为旧版 engine/rag.ts 的兼容包装, 供历史调用方逐步迁移使用.
// 新代码请直接调用 buildRagContext / retrieve / rerank.
// 旧版 retrieveKnowledge 为同步函数返回 RAGResult[]; 此处为异步包装, 返回结构已调整.

/**
 * @deprecated 兼容包装: 调用 buildRagContext 并格式化为旧版 retrieveKnowledge 的返回结构.
 * 旧版签名: retrieveKnowledge(query, topK=3): RAGResult[] (同步)
 * 新版签名: retrieveKnowledge(query, options?): Promise<{ context, sources }> (异步)
 * 旧版消费者应迁移到 buildRagContext 直接调用.
 */
export async function retrieveKnowledge(
  query: string,
  options?: { tenantId?: string; topK?: number },
): Promise<{ context: string; sources: string[] }> {
  const ragCtx = await buildRagContext(query, undefined, {
    tenantId: options?.tenantId,
    topK: options?.topK,
  });
  return {
    context: ragCtx.context,
    sources: ragCtx.results.map(r => r.title || r.chunkId),
  };
}

/**
 * @deprecated 兼容包装: 旧版 augmentPrompt 接受 RAGResult[] 并格式化为 prompt 增量;
 * 此包装接受已构建的 context 字符串, 返回拼接 query 后的 prompt 增量.
 */
export async function augmentPrompt(query: string, context: string): Promise<string> {
  if (!context) return '';
  return `${context}\n\nQuery: ${query}`;
}
