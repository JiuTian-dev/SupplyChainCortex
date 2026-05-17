/**
 * Information Router — Three-Tier Architecture
 *
 * Classifies user queries and routes them to the appropriate information layer.
 *
 * Strategy: keyword scoring, not regex sequence matching.
 * Each intent gets a score based on matching keywords. Highest score wins.
 * Tier 0 patterns are checked first (they short-circuit).
 *
 *   Tier 1 (Authoritative): MCP tools + direct data sources
 *   Tier 2 (Contextual):    Wikipedia + RAG
 *   Tier 3 (Discovery):     Multi-source web search
 *   Tier 0 (LLM Direct):    No search
 */

export type Intent =
  | 'supply_chain_data'
  | 'supply_chain_knowledge'
  | 'news_event'
  | 'general_knowledge'
  | 'opinion_recommendation'
  | 'chat_greeting';

export type Tier = 0 | 1 | 2 | 3;

export interface RoutingDecision {
  intent: Intent;
  primaryTier: Tier;
  fallbackTier: Tier;
  shouldSearch: boolean;
  shouldUseTools: boolean;
  reason: string;
}

// ─── Simple keyword matching ────────────────────────────────────────────────────

interface IntentConfig {
  intent: Intent;
  keywords: string[];
  primaryTier: Tier;
  fallbackTier: Tier;
  reason: string;
}

function hasKeyword(query: string, keyword: string): boolean {
  const q = query.toLowerCase();
  const k = keyword.toLowerCase();
  // Short English words: use word boundary to avoid "hi" matching inside "this"
  if (/^[a-z]{1,3}$/.test(k)) {
    return new RegExp(`\\b${k}\\b`, 'i').test(q);
  }
  return q.includes(k);
}

function countMatches(query: string, keywords: string[]): number {
  return keywords.filter(k => hasKeyword(query, k)).length;
}

const INTENTS: IntentConfig[] = [
  // Order matters: Tier 0 checked first (short-circuit), then highest score wins

  // ── Tier 0: Chat / greeting ──────────────────────────────────────────────
  {
    intent: 'chat_greeting',
    keywords: ['你好', 'hi', 'hello', 'hey', '早安', '晚安', '早上好', '晚上好',
      '谢谢', 'thank', '多谢', '再见', 'bye', '拜拜', '回头见',
      '你是谁', '你叫什么', '你能做什么', '你会什么'],
    primaryTier: 0, fallbackTier: 0,
    reason: '闲聊/问候，不触发搜索',
  },

  // ── Tier 0: Opinion / recommendation ─────────────────────────────────────
  {
    intent: 'opinion_recommendation',
    keywords: ['推荐', '建议', '帮我选', '挑一个', '选哪个', '哪个', '比较好',
      '值得买', '值得看', 'recommend', 'suggest', 'best', 'favorite',
      '你觉得', '你认为', '怎么看'],
    primaryTier: 0, fallbackTier: 0,
    reason: '意见/推荐类问题，LLM直接回答，不触发搜索',
  },

  // ── Tier 1: Supply chain real-time data ──────────────────────────────────
  {
    intent: 'supply_chain_data',
    keywords: ['铜价', '铝价', '钢价', '运价', '汇率', '碳价', '原油', '大宗商品',
      'SCFI', 'SCFIS', 'FBX', 'WCI',
      '库存', 'SKU', '缺货', '补货', '安全库存',
      '供应商', '准时交付', '健康指数',
      '关税', '税率', 'Section 301', 'CBAM',
      '港口拥堵', '物流延迟', '清关',
      '召回', 'CPSC',
      'copper price', 'aluminum price', 'freight rate', 'carbon price',
      'exchange rate', 'tariff rate', 'port congestion', 'supplier risk'],
    primaryTier: 1, fallbackTier: 2,
    reason: '实时供应链数据，MCP工具和直连数据源优先',
  },

  // ── Tier 3: News / events ───────────────────────────────────────────────
  {
    intent: 'news_event',
    keywords: ['这周', '本周', '今天', '昨天', '最近', '最新', '刚刚', '新闻',
      '动态', '事件', '发生了什么', '大事件', '新规', '法规更新',
      'this week', 'latest', 'breaking', 'news', 'what happened', 'update'],
    primaryTier: 3, fallbackTier: 1,
    reason: '时效性新闻/事件，多源搜索优先',
  },

  // ── Tier 1+2: Supply chain domain knowledge ───────────────────────────────
  {
    intent: 'supply_chain_knowledge',
    keywords: ['什么是CBAM', '什么是供应链', 'HS编码', 'HTS', '海关归类',
      'EOQ', 'ABC分类', 'XYZ',
      'FOB', 'CIF', 'Incoterm', '贸易术语',
      '怎么计算', '如何评估', '怎么优化', '如何优化', '如何计算',
      '关税影响', '合规要求', '认证标准',
      'certification', 'compliance', 'supply chain best practice'],
    primaryTier: 1, fallbackTier: 2,
    reason: '供应链专业知识，MCP计算工具优先，Wikipedia补充',
  },

  // ── Tier 2: General knowledge ────────────────────────────────────────────
  {
    intent: 'general_knowledge',
    keywords: ['什么是', '为什么', '怎么', '如何', '解释', '定义', '原理', '概念',
      '历史', '背景',
      'what is', 'why is', 'how does', 'explain', 'define',
      'wiki', '百科'],
    primaryTier: 2, fallbackTier: 3,
    reason: '通用知识问答，Wikipedia优先',
  },
];

// ─── Router ─────────────────────────────────────────────────────────────────────

export function classifyIntent(query: string): RoutingDecision {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      intent: 'chat_greeting', primaryTier: 0, fallbackTier: 0,
      shouldSearch: false, shouldUseTools: false, reason: '空查询',
    };
  }

  // Tier 0 short-circuit: check chat and opinion first
  for (const config of INTENTS) {
    if (config.primaryTier !== 0) continue;
    if (countMatches(trimmed, config.keywords) > 0) {
      return {
        intent: config.intent, primaryTier: config.primaryTier,
        fallbackTier: config.fallbackTier,
        shouldSearch: false, shouldUseTools: false, reason: config.reason,
      };
    }
  }

  // For Tier 1-3: score all intents, pick highest (excluding Tier 0)
  let best: IntentConfig | null = null;
  let bestScore = 0;

  for (const config of INTENTS) {
    if (config.primaryTier === 0) continue;
    const score = countMatches(trimmed, config.keywords);
    if (score > bestScore) {
      bestScore = score;
      best = config;
    }
  }

  // If nothing matched, default to supply chain knowledge
  if (!best || bestScore === 0) {
    return {
      intent: 'supply_chain_knowledge', primaryTier: 1, fallbackTier: 3,
      shouldSearch: true, shouldUseTools: true,
      reason: '供应链领域默认路由，MCP工具优先，搜索兜底',
    };
  }

  return {
    intent: best.intent, primaryTier: best.primaryTier,
    fallbackTier: best.fallbackTier,
    shouldSearch: best.primaryTier === 3 || best.fallbackTier === 3,
    shouldUseTools: best.primaryTier === 1,
    reason: best.reason,
  };
}

export function getActiveSources(decision: RoutingDecision): {
  mcpTools: boolean; wikipedia: boolean; webSearch: boolean; directReply: boolean;
} {
  return {
    mcpTools: decision.primaryTier === 1 || decision.fallbackTier === 1,
    wikipedia: decision.primaryTier === 2 || decision.fallbackTier === 2,
    webSearch: decision.shouldSearch,
    directReply: decision.primaryTier === 0,
  };
}
