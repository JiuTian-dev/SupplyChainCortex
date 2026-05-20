// src/lib/services/web-search-rewriter.ts

import { zhToEnRewriterMap } from './web-search-keywords';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Entity Extraction ─────────────────────────────────────────────────────────

const ENTITY_PATTERNS: Array<{ regex: RegExp; type: string }> = [
  { regex: /(?:中国|美国|越南|欧盟|日本|韩国|印度|印尼|墨西哥|巴西|德国|法国|英国|泰国|马来西亚|柬埔寨)/g, type: 'country' },
  { regex: /(?:上海|深圳|宁波|广州|海防|胡志明|曼谷|雅加达|汉堡|鹿特丹|洛杉矶|长滩)/g, type: 'location' },
  { regex: /(?:301|232|CBAM|CPSC|FDA|FCC|CE|RoHS|REACH|UL|FOB|CIF|DDP)/gi, type: 'regulation' },
  { regex: /(?:关税|税率|运价|碳价|汇率|铜价|铝价|钢价|原油|政策|合规|认证)/g, type: 'topic' },
  { regex: /(?:家电|小家电|厨电|白电|黑电|零部件|芯片|电机|压缩机|PCB)/g, type: 'product' },
  { regex: /(?:TikTok|Temu|Shein|Amazon|Walmart|Shopee|Lazada|AliExpress)/g, type: 'platform' },
  { regex: /(?:供应链|库存|物流|采购|销售|成本|风险|预测)/g, type: 'domain' },
];

const FILLER_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '怎么', '什么', '为什么', '哪里', '哪个', '如何', '多少', '怎样',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'of', 'in', 'on', 'to', 'for', 'and', 'or',
]);

export function extractKeywords(query: string): { entities: string[]; types: Set<string> } {
  const entities: string[] = [];
  const types = new Set<string>();
  const seen = new Set<string>();

  for (const pattern of ENTITY_PATTERNS) {
    const matches = query.match(pattern.regex);
    if (matches) {
      for (const m of matches) {
        const lower = m.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          entities.push(m);
          types.add(pattern.type);
        }
      }
    }
  }

  // Also extract English words that aren't filler
  const englishWords = query.match(/[a-zA-Z]{3,}/g);
  if (englishWords) {
    for (const w of englishWords) {
      const lower = w.toLowerCase();
      if (!FILLER_WORDS.has(lower) && !seen.has(lower)) {
        seen.add(lower);
        entities.push(w);
      }
    }
  }

  return { entities, types };
}

// ─── Context Injection ──────────────────────────────────────────────────────────

export function injectContext(
  query: string,
  history: ConversationTurn[],
  maxContextTerms = 4,
): string {
  if (history.length === 0) return query;

  // Extract entities from last N turns (prioritize recent)
  const contextEntities: { entity: string; recency: number }[] = [];
  const seen = new Set<string>();

  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== 'user') continue;
    const recency = history.length - i;
    const { entities } = extractKeywords(turn.content);
    for (const e of entities) {
      const lower = e.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        contextEntities.push({ entity: e, recency });
      }
    }
  }

  // Instead of substring check, tokenize the query and check token-by-token
  const queryLower = query.toLowerCase();
  const queryTokens = new Set<string>();
  // Extract tokens from query same way extractKeywords does
  for (const pattern of ENTITY_PATTERNS) {
    const matches = queryLower.match(pattern.regex);
    if (matches) {
      for (const m of matches) {
        queryTokens.add(m.toLowerCase());
      }
    }
  }
  // Also add English tokens
  const englishInQuery = queryLower.match(/[a-zA-Z]{3,}/g);
  if (englishInQuery) {
    for (const w of englishInQuery) {
      queryTokens.add(w);
    }
  }

  const newEntities = contextEntities.filter(
    ({ entity }) => !queryTokens.has(entity.toLowerCase()),
  );

  if (newEntities.length === 0) return query;

  // Add most recent entities as prefix, capped
  const prefix = newEntities
    .sort((a, b) => a.recency - b.recency)
    .slice(0, maxContextTerms)
    .map(e => e.entity)
    .join(' ');

  return `${prefix} ${query}`;
}

// ─── Query Rewriting ────────────────────────────────────────────────────────────

const REWRITE_STRATEGIES = [
  {
    name: 'original',
    apply: (q: string) => q,
  },
  {
    name: 'specific',
    apply: (q: string) => {
      const { entities } = extractKeywords(q);
      if (entities.length === 0) return q;
      return `${entities.slice(0, 5).join(' ')} ${q} 最新`;
    },
  },
  {
    name: 'broaden',
    apply: (q: string) => {
      const { entities } = extractKeywords(q);
      const topics = entities.filter(e => /^[一-鿿]{2,4}$/.test(e));
      if (topics.length <= 1) return q;
      return `${topics[0]} 趋势 分析 2026`;
    },
  },
  {
    name: 'english',
    apply: (q: string) => {
      let result = q;
      for (const [zh, en] of Object.entries(zhToEnRewriterMap)) {
        if (result.includes(zh)) result += ` ${en}`;
      }
      return result === q ? q : result;
    },
  },
];

export function rewriteQuery(originalQuery: string): string[] {
  const variants = REWRITE_STRATEGIES.map(s => s.apply(originalQuery));
  // Deduplicate while preserving order
  return [...new Set(variants)].filter(Boolean).slice(0, 4);
}
