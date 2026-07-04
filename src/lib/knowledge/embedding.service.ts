/**
 * Embedding Service — 文本嵌入向量生成 + 相似度计算 + 文本分块.
 *
 * 支持两种 provider:
 *   1. openai — OpenAI text-embedding-3-small (默认, 需 OPENAI_API_KEY)
 *   2. local  — 本地确定性伪嵌入 (开发/测试 fallback, 不依赖外部 API)
 *
 * 环境变量:
 *   EMBEDDING_PROVIDER  — "openai" | "local" (默认 "openai")
 *   EMBEDDING_MODEL     — OpenAI 模型名 (默认 "text-embedding-3-small")
 *   EMBEDDING_DIMENSION — 嵌入维度 (默认 1536, 仅 local provider 使用)
 *   OPENAI_API_KEY      — OpenAI API 密钥
 *   OPENAI_BASE_URL     — OpenAI API 基础 URL (可选, 兼容代理)
 */

// ─── Configuration ────────────────────────────────────────────────────────

export interface EmbeddingConfig {
  provider: 'openai' | 'local';
  model: string;
  dimension: number;
  apiKey?: string;
  baseUrl?: string;
}

export function getEmbeddingConfig(): EmbeddingConfig {
  const provider = (process.env.EMBEDDING_PROVIDER || 'openai') as 'openai' | 'local';
  return {
    provider,
    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    dimension: parseInt(process.env.EMBEDDING_DIMENSION || '1536', 10),
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com',
  };
}

/** 是否启用 OpenAI 嵌入 (有 key 且 provider=openai) */
export function isOpenAIEmbeddingEnabled(): boolean {
  const cfg = getEmbeddingConfig();
  return cfg.provider === 'openai' && !!cfg.apiKey;
}

// ─── Embedding Generation ─────────────────────────────────────────────────

/**
 * 生成单段文本的嵌入向量.
 * - provider=openai 且有 API key → 调用 OpenAI API
 * - 否则 → 本地确定性伪嵌入 (开发/测试 fallback)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const cfg = getEmbeddingConfig();
  const normalized = text.slice(0, 8000); // OpenAI 输入上限保护

  if (cfg.provider === 'openai' && cfg.apiKey) {
    try {
      const url = `${cfg.baseUrl}/v1/embeddings`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          input: normalized,
        }),
      });

      if (response.ok) {
        const data = await response.json() as { data: Array<{ embedding: number[] }> };
        if (data.data?.[0]?.embedding) {
          return data.data[0].embedding;
        }
      } else {
        console.warn(`[Embedding] OpenAI API returned ${response.status}, falling back to local.`);
      }
    } catch (err) {
      console.warn('[Embedding] OpenAI request failed, using local fallback:', (err as Error).message);
    }
  }

  return localEmbedding(normalized, cfg.dimension);
}

/**
 * 批量生成嵌入向量.
 * OpenAI 支持批量输入 (最多 2048 段), 本地 fallback 逐段生成.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const cfg = getEmbeddingConfig();

  if (cfg.provider === 'openai' && cfg.apiKey) {
    try {
      const url = `${cfg.baseUrl}/v1/embeddings`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          input: texts.map(t => t.slice(0, 8000)),
        }),
      });

      if (response.ok) {
        const data = await response.json() as { data: Array<{ embedding: number[] }> };
        if (data.data?.length === texts.length) {
          return data.data.map(d => d.embedding);
        }
      } else {
        console.warn(`[Embedding] OpenAI batch API returned ${response.status}, falling back to local.`);
      }
    } catch (err) {
      console.warn('[Embedding] OpenAI batch request failed, using local fallback:', (err as Error).message);
    }
  }

  // 本地 fallback: 逐段生成 (并行)
  return Promise.all(texts.map(t => localEmbedding(t, cfg.dimension)));
}

// ─── Local Deterministic Embedding (Fallback) ─────────────────────────────

/**
 * 本地确定性伪嵌入 — 基于文本 hash 的伪随机向量 + L2 归一化.
 * 相同输入始终产生相同输出, 适合开发/测试.
 * 注意: 语义相似度有限, 仅用于无 OpenAI key 的环境.
 */
export function localEmbedding(text: string, dimension = 1536): number[] {
  const vec = new Float64Array(dimension);

  // 多 hash 种子提升分散性
  const seeds = [hashString(text), hashString(text + '#salt1'), hashString(text + '#salt2')];
  for (let s = 0; s < seeds.length; s++) {
    let state = Math.abs(seeds[s]) || 1;
    for (let i = s; i < dimension; i += seeds.length) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      vec[i] += (state / 0x7fffffff) * 2 - 1; // [-1, 1]
    }
  }

  // L2 归一化为单位向量
  let norm = 0;
  for (let i = 0; i < dimension; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm) || 1;
  return Array.from(vec, v => v / norm);
}

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return hash;
}

// ─── Similarity ───────────────────────────────────────────────────────────

/**
 * 计算两个向量的余弦相似度. 返回 [-1, 1], 越接近 1 越相似.
 * 处理维度不一致 (按较短维度计算) 和零向量.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

// ─── Text Chunking ────────────────────────────────────────────────────────

export interface ChunkOptions {
  /** 每块最大 token 数 (近似: 1 token ≈ 4 字符英文 / 1.5 字符中文) */
  maxTokens?: number;
  /** 块间重叠 token 数 (默认 50, 提升 retrieval 召回) */
  overlapTokens?: number;
  /** 分隔符优先级 (按段落 → 句子 → 词) */
  separators?: string[];
}

export const DEFAULT_CHUNK_OPTIONS: Required<ChunkOptions> = {
  maxTokens: 256,
  overlapTokens: 50,
  separators: ['\n\n', '\n', '。', '. ', '!', '?', ';', ' '],
};

export interface TextChunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
}

/**
 * 估算文本 token 数 (近似).
 * 英文: 1 token ≈ 4 字符; 中文: 1 token ≈ 1.5 字符 (按 GPT tokenizer 经验值).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) {
      cjk++;
    } else {
      other++;
    }
  }
  return Math.ceil(cjk / 1.5 + other / 4);
}

/**
 * 文本分块 — 按 token 数切分, 支持重叠.
 * 优先在分隔符处切分以保持语义完整性.
 */
export function chunkText(text: string, options?: ChunkOptions): TextChunk[] {
  const opts = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  if (!text || text.trim().length === 0) return [];

  const totalTokens = estimateTokens(text);
  if (totalTokens <= opts.maxTokens) {
    return [{ content: text.trim(), chunkIndex: 0, tokenCount: totalTokens }];
  }

  const chunks: TextChunk[] = [];
  let remaining = text;
  let chunkIndex = 0;
  let lastTail = ''; // 上一块的尾部用于重叠

  while (remaining.length > 0) {
    const trimmed = (lastTail + remaining).trim();
    if (!trimmed) break;

    const targetChars = approxCharsForTokens(opts.maxTokens);
    if (trimmed.length <= targetChars) {
      chunks.push({ content: trimmed, chunkIndex, tokenCount: estimateTokens(trimmed) });
      break;
    }

    // 在 targetChars 附近找最佳分隔符
    const cutPos = Math.max(1, findSplitPoint(trimmed, targetChars, opts.separators));
    const chunkContent = trimmed.slice(0, cutPos).trim();
    if (chunkContent) {
      chunks.push({ content: chunkContent, chunkIndex, tokenCount: estimateTokens(chunkContent) });
      chunkIndex++;
    }

    // 计算重叠: 取上一块尾部 overlapTokens 对应的字符数 (不超过 chunkContent 的一半, 避免无限循环)
    const maxOverlap = Math.min(approxCharsForTokens(opts.overlapTokens), Math.floor(chunkContent.length / 2));
    const prevLastTailLen = lastTail.length;
    lastTail = maxOverlap > 0 ? chunkContent.slice(-maxOverlap) + ' ' : '';
    // remaining 必须前进: 从原始 remaining 中移除已消费的部分
    // trimmed = lastTail(prev) + remaining, chunk 消费了 trimmed[0:cutPos]
    // 所以从 remaining 中消费了 (cutPos - prevLastTailLen) 个字符
    const consumedFromRemaining = Math.max(1, cutPos - prevLastTailLen);
    remaining = remaining.slice(consumedFromRemaining);
  }

  return chunks;
}

/** 根据目标 token 数估算字符数 (取中英文混合保守值 ~3 字符/token) */
function approxCharsForTokens(tokens: number): number {
  return Math.max(1, tokens * 3);
}

/** 在 targetPos 附近 (优先向后) 找分隔符位置 */
function findSplitPoint(text: string, targetPos: number, separators: string[]): number {
  // 先尝试在 targetPos 之后 20% 范围内找分隔符 (避免切太碎)
  const searchStart = Math.floor(targetPos * 0.8);
  const searchEnd = Math.min(text.length, Math.floor(targetPos * 1.2));

  for (const sep of separators) {
    // 从后往前找最近的分隔符
    let lastIdx = -1;
    let from = searchStart;
    while (true) {
      const idx = text.indexOf(sep, from);
      if (idx === -1 || idx > searchEnd) break;
      lastIdx = idx + sep.length;
      from = idx + 1;
    }
    if (lastIdx > 0) return lastIdx;
  }

  // 找不到分隔符, 硬切
  return Math.min(targetPos, text.length);
}

// ─── Serialization Helpers ────────────────────────────────────────────────

/** 将向量序列化为字符串 (用于 Prisma 存储) */
export function serializeEmbedding(vec: number[] | null | undefined): string | null {
  if (!vec || vec.length === 0) return null;
  return JSON.stringify(vec);
}

/** 从字符串反序列化向量 */
export function deserializeEmbedding(s: string | null | undefined): number[] | null {
  if (!s) return null;
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
