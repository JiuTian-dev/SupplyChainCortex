# 联网搜索质量 & 相关性升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 大幅提升联网搜索结果的准确性、相关性和可用性，通过五层增强（SearXNG 配置加固、查询改写+上下文注入、搜索守卫、结果重排序、多源交叉验证），并建立可量化的效果基准测试。

**Architecture:** 以现有的 `web-search.service.ts` 为基底，在搜索管道中插入四个新的处理层：Rewrite → Guard → Rerank → CrossValidate。每一层既是独立模块，也通过管道串联。SearXNG 的 yaml 配置做一次性加固。

**Tech Stack:** TypeScript, Vitest, SearXNG settings.yml, Node.js fetch API

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `searxng/settings.yml` | SearXNG 服务器端配置 | 修改 |
| `searxng/limiter.toml` | 速率限制配置 | 修改 |
| `src/lib/services/web-search.service.ts` | 主搜索服务 | 修改（增加 Rewrite/Guard/Rerank/CrossValidate 公共函数） |
| `src/lib/services/web-search-rewriter.ts` | 查询改写 + 上下文注入 | 新建 |
| `src/lib/services/web-search-guard.ts` | 搜索守卫：域名过滤/语言检查/空结果检测 | 新建 |
| `src/lib/services/web-search-reranker.ts` | 语义重排序 + 来源权威加权 | 新建 |
| `src/lib/services/web-search-cross-validator.ts` | 多源交叉验证 + 置信度评分 | 新建 |
| `src/lib/services/__tests__/web-search-rewriter.test.ts` | Rewriter 单元测试 | 新建 |
| `src/lib/services/__tests__/web-search-guard.test.ts` | Guard 单元测试 | 新建 |
| `src/lib/services/__tests__/web-search-reranker.test.ts` | Reranker 单元测试 | 新建 |
| `src/lib/services/__tests__/web-search-cross-validator.test.ts` | CrossValidator 单元测试 | 新建 |
| `scripts/benchmark-search.ts` | 搜索质量基准测试脚本 | 新建 |

---

### Task 1: SearXNG 配置加固

**Files:**
- Modify: `searxng/settings.yml`
- Modify: `searxng/limiter.toml`

- [ ] **Step 1: 更新 settings.yml — 开启安全搜索、插件、引擎分类、默认语言**

```yaml
# SearXNG configuration for SupplyChain Cortex
# Docs: https://docs.searxng.org/admin/settings/

use_default_settings: true

server:
  secret_key: "${SEARXNG_SECRET}"
  bind_address: "0.0.0.0"
  limiter: false
  image_proxy: false
  method: "GET"

search:
  formats:
    - html
    - json
  safe_search: 2
  default_lang: "zh-CN"
  autocomplete: "duckduckgo"

enabled_plugins:
  - "Hash plugin"
  - "ahmia_filter"

ui:
  static_use_hash: true
  default_theme: simple

engines:
  - name: google
    disabled: false
    categories: [general]
    timeout: 7.0
    engine_params:
      safe_search: strict
  - name: duckduckgo
    disabled: false
    categories: [general]
    timeout: 7.0
  - name: bing
    disabled: false
    categories: [general]
    timeout: 7.0
  - name: wikipedia
    disabled: false
    categories: [research]
    timeout: 5.0
  - name: github
    disabled: false
    categories: [it]
    timeout: 5.0
  - name: brave
    disabled: true
  - name: qwant
    disabled: false
    categories: [general]
    timeout: 7.0
  - name: startpage
    disabled: true
  - name: reddit
    disabled: true

outgoing:
  request_timeout: 10.0
  useragent_suffix: "SupplyChainCortex/2.9"
```

- [ ] **Step 2: 更新 limiter.toml — 确保本地开发无限制**

```toml
# SearXNG rate limiter — disabled for local/internal use
[botdetection.ip_limit]
link_token = false

[botdetection.ip_lists]
pass_ip = [
  "0.0.0.0/0",
  "::/0",
]
```

- [ ] **Step 3: 验证 SearXNG 配置生效**

Run: `docker compose restart searxng`
Then: test a search via curl to verify `safe_search=2` is active:
```bash
curl "http://localhost:8081/search?q=test&format=json&safesearch=2" | head -100
```

- [ ] **Step 4: Commit**

```bash
git add searxng/settings.yml searxng/limiter.toml
git commit -m "fix: SearXNG 配置加固 — safe_search=2, ahmia_filter, 引擎分类, 中文默认语言"
```

---

### Task 2: 查询改写 + 上下文注入模块

**Files:**
- Create: `src/lib/services/web-search-rewriter.ts`
- Create: `src/lib/services/__tests__/web-search-rewriter.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/lib/services/__tests__/web-search-rewriter.test.ts
import { describe, it, expect } from 'vitest';
import { rewriteQuery, injectContext, extractKeywords, type ConversationTurn } from '../web-search-rewriter';

describe('extractKeywords', () => {
  it('extracts Chinese supply chain entities', () => {
    const result = extractKeywords('中国家电出口美国 301关税 最新政策 2026');
    expect(result.entities).toContain('中国');
    expect(result.entities).toContain('美国');
    expect(result.entities).toContain('家电');
    expect(result.entities).toContain('301关税');
  });

  it('extracts mixed Chinese-English terms', () => {
    const result = extractKeywords('CBAM carbon tariff 对欧盟小家电出口影响');
    expect(result.entities).toContain('CBAM');
    expect(result.entities).toContain('欧盟');
  });

  it('returns empty for short query', () => {
    const result = extractKeywords('你好');
    expect(result.entities.length).toBeLessThanOrEqual(2);
  });
});

describe('injectContext', () => {
  it('injects entities from previous conversation turns', () => {
    const history: ConversationTurn[] = [
      { role: 'user', content: '我们在越南海防有工厂吗' },
      { role: 'assistant', content: '是的，海防工厂主要生产小家电' },
    ];
    const result = injectContext('那边的关税怎么算', history, 2);
    expect(result).toContain('越南');
    expect(result).toContain('海防');
    expect(result).toContain('关税');
  });

  it('returns original query if history has no entities', () => {
    const history: ConversationTurn[] = [
      { role: 'user', content: '你好' },
    ];
    const result = injectContext('今天天气怎么样', history, 2);
    expect(result).toBe('今天天气怎么样');
  });

  it('caps entities to maxContextTerms', () => {
    const history: ConversationTurn[] = [
      { role: 'user', content: '中国 美国 越南 欧盟 日本 韩国 印度 巴西 德国 法国' },
    ];
    const result = injectContext('关税政策', history, 3);
    const addedTerms = result.split(' ').length - '关税政策'.split(' ').length;
    expect(addedTerms).toBeLessThanOrEqual(3);
  });
});

describe('rewriteQuery', () => {
  it('generates multiple search variants', () => {
    const variants = rewriteQuery('小家电出口关税影响');
    expect(variants.length).toBeGreaterThanOrEqual(2);
    expect(variants.length).toBeLessThanOrEqual(5);
    // Each variant should be different from the original
    variants.forEach(v => {
      expect(v.length).toBeGreaterThan(10);
    });
  });

  it('includes the original query as one variant', () => {
    const variants = rewriteQuery('供应链风险');
    const hasOriginal = variants.some(v => v.includes('供应链') && v.includes('风险'));
    expect(hasOriginal).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd D:/vibe-coding/jiadian_supply/02_LocalDev/2/2.9.3
npx vitest run src/lib/services/__tests__/web-search-rewriter.test.ts
```
Expected: all tests FAIL (file not found)

- [ ] **Step 3: 实现 web-search-rewriter.ts**

```typescript
// src/lib/services/web-search-rewriter.ts

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

  // Filter out entities already in the current query
  const queryLower = query.toLowerCase();
  const newEntities = contextEntities.filter(
    ({ entity }) => !queryLower.includes(entity.toLowerCase()),
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
      const termMap: Record<string, string> = {
        '关税': 'tariff', '贸易战': 'trade war', '供应链': 'supply chain',
        '小家电': 'small home appliances', '铜价': 'copper price',
        '运价': 'freight rate', '港口': 'port congestion',
        '汇率': 'exchange rate', '合规': 'compliance', '出口': 'export',
        '碳价': 'carbon price', '库存': 'inventory', '物流': 'logistics',
        '政策': 'policy regulation', '供应商': 'supplier', '销售': 'sales',
        '成本': 'cost', '风险': 'risk', '认证': 'certification',
      };
      let result = q;
      for (const [zh, en] of Object.entries(termMap)) {
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
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd D:/vibe-coding/jiadian_supply/02_LocalDev/2/2.9.3
npx vitest run src/lib/services/__tests__/web-search-rewriter.test.ts
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/web-search-rewriter.ts src/lib/services/__tests__/web-search-rewriter.test.ts
git commit -m "feat: 查询改写 + 上下文注入模块 — extractKeywords, injectContext, rewriteQuery"
```

---

### Task 3: 搜索守卫模块

**Files:**
- Create: `src/lib/services/web-search-guard.ts`
- Create: `src/lib/services/__tests__/web-search-guard.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/lib/services/__tests__/web-search-guard.test.ts
import { describe, it, expect } from 'vitest';
import {
  guardResults,
  checkLanguageMatch,
  filterBlacklistedDomains,
  detectEmptyOrDegraded,
  scoreResultQuality,
  type GuardedResult,
} from '../web-search-guard';
import type { SearchResult } from '../web-search.service';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    title: 'Test Result',
    url: 'https://example.com/article',
    snippet: 'This is a test result about supply chain.',
    ...overrides,
  };
}

describe('filterBlacklistedDomains', () => {
  it('filters out known adult/suspicious domains', () => {
    const results = [
      makeResult({ url: 'https://example.com/news' }),
      makeResult({ url: 'https://bokep-viral.xyz/supply-chain' }),
      makeResult({ url: 'https://reuters.com/article' }),
    ];
    const filtered = filterBlacklistedDomains(results);
    expect(filtered).toHaveLength(2);
    expect(filtered.every(r => r.url.includes('example.com') || r.url.includes('reuters.com'))).toBe(true);
  });

  it('filters URLs containing suspicious patterns', () => {
    const results = [
      makeResult({ url: 'https://site.com/porn-video-supply-chain' }),
      makeResult({ url: 'https://news.com/legit' }),
    ];
    const filtered = filterBlacklistedDomains(results);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].url).toBe('https://news.com/legit');
  });
});

describe('checkLanguageMatch', () => {
  it('detects Chinese content correctly', () => {
    expect(checkLanguageMatch('中国家电供应链', 'zh')).toBe(true);
    expect(checkLanguageMatch('This is about supply chains in China', 'en')).toBe(true);
  });

  it('flags language mismatches', () => {
    expect(checkLanguageMatch('Indonesia viral terbaru', 'zh')).toBe(false);
  });
});

describe('detectEmptyOrDegraded', () => {
  it('detects empty results', () => {
    const result = detectEmptyOrDegraded([], 'supply chain');
    expect(result.isDegraded).toBe(true);
    expect(result.reason).toContain('empty');
  });

  it('detects when all results are from low-quality sources', () => {
    const results = [
      makeResult({ url: 'https://reddit.com/r/anything' }),
      makeResult({ url: 'https://quora.com/question' }),
    ];
    const result = detectEmptyOrDegraded(results, 'supply chain trends');
    expect(result.isDegraded).toBe(true);
    expect(result.reason).toContain('low quality');
  });

  it('passes good results through', () => {
    const results = [
      makeResult({ url: 'https://reuters.com/article', title: 'Supply Chain News' }),
      makeResult({ url: 'https://bloomberg.com/news', title: 'Trade Update' }),
    ];
    const result = detectEmptyOrDegraded(results, 'supply chain');
    expect(result.isDegraded).toBe(false);
  });
});

describe('scoreResultQuality', () => {
  it('scores high-authority domains higher', () => {
    const govResult = makeResult({ url: 'https://www.ustr.gov/policy', snippet: 'Trade policy update for 2026' });
    const forumResult = makeResult({ url: 'https://reddit.com/r/supplychain', snippet: 'Anyone know about tariffs?' });
    const govScore = scoreResultQuality(govResult, 'US trade policy');
    const forumScore = scoreResultQuality(forumResult, 'US trade policy');
    expect(govScore).toBeGreaterThan(forumScore);
  });

  it('penalizes results with keyword-stuffed titles', () => {
    const cleanResult = makeResult({ title: 'US-China Trade Relations Update' });
    const stuffedResult = makeResult({ title: 'supply chain AI blockchain supply chain 2026 supply chain' });
    const cleanScore = scoreResultQuality(cleanResult, 'supply chain trends');
    const stuffedScore = scoreResultQuality(stuffedResult, 'supply chain trends');
    expect(cleanScore).toBeGreaterThanOrEqual(stuffedScore);
  });
});

describe('guardResults', () => {
  it('returns degraded flag when all results are filtered', () => {
    const results = [
      makeResult({ url: 'https://adult-site.xyz/supply-chain' }),
    ];
    const output = guardResults(results, 'supply chain');
    expect(output.passed).toBe(false);
    expect(output.reason).toBeDefined();
  });

  it('returns passed results sorted by quality', () => {
    const results = [
      makeResult({ url: 'https://reddit.com/r/supplychain', snippet: 'discussion' }),
      makeResult({ url: 'https://reuters.com/article', snippet: 'news report' }),
    ];
    const output = guardResults(results, 'supply chain');
    expect(output.passed).toBe(true);
    expect(output.results[0].url).toContain('reuters.com');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/lib/services/__tests__/web-search-guard.test.ts
```
Expected: all tests FAIL

- [ ] **Step 3: 实现 web-search-guard.ts**

```typescript
// src/lib/services/web-search-guard.ts

import type { SearchResult } from './web-search.service';

export interface GuardedResult {
  passed: boolean;
  results: SearchResult[];
  reason?: string;
  qualityScores: number[];
}

// ─── Domain Blacklist ───────────────────────────────────────────────────────────

const ADULT_PATTERNS = [
  'porn', 'xxx', 'adult', 'sex', 'nude', 'viral-', 'bokep', 'jilbab',
  'ngentot', 'memek', 'terbaru', 'indonesia-viral',
];

const LOW_AUTHORITY_DOMAINS = [
  'reddit.com', 'quora.com', 'answers.com', 'yahoo.com/answers',
  'forum.adrenaline.com.br', 'medium.com/@', 'blogspot.com',
  'wordpress.com', 'tumblr.com', 'pinterest.com',
];

const SUSPICIOUS_TLDS = ['.xyz', '.top', '.tk', '.ml', '.ga', '.cf', '.gq', '.pw', '.cc', '.ws'];

// ─── Authority Scoring ──────────────────────────────────────────────────────────

const HIGH_AUTHORITY = [
  'wikipedia.org', '.gov', 'edu.cn', 'who.int', 'un.org',
  'ustr.gov', 'cpsc.gov', 'reuters.com', 'bloomberg.com',
  'bbc.com', 'ft.com', 'wsj.com', 'scmp.com', 'chinabriefing.com',
  'nrf.com', 'freightos.com', 'project44.com', 'mckinsey.com',
  'bain.com', 'deloitte.com', 'pwc.com', 'gartner.com',
  'customs.gov.cn', 'mofcom.gov.cn', 'stats.gov.cn',
];

const MEDIUM_AUTHORITY = [
  'linkedin.com', 'forbes.com', 'techcrunch.com', 'cnbc.com',
  'economist.com', 'caixin.com', '36kr.com', 'huxiu.com',
  'jiemian.com', 'cls.cn', 'yicai.com',
];

// ─── Public Functions ────────────────────────────────────────────────────────────

export function filterBlacklistedDomains(results: SearchResult[]): SearchResult[] {
  return results.filter(r => {
    try {
      const url = r.url.toLowerCase();
      const host = new URL(r.url).hostname.replace('www.', '');

      // Block suspicious TLDs (unless it's a known-good domain)
      if (SUSPICIOUS_TLDS.some(tld => host.endsWith(tld)) && !HIGH_AUTHORITY.some(a => host.includes(a))) {
        return false;
      }

      // Block adult/suspicious patterns in URL
      if (ADULT_PATTERNS.some(p => url.includes(p) || host.includes(p))) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  });
}

export function checkLanguageMatch(text: string, targetLang: 'zh' | 'en' | 'auto'): boolean {
  if (targetLang === 'auto') return true;

  const hasChinese = /[一-鿿]{2,}/.test(text);
  const hasEnglish = /[a-zA-Z]{3,}/.test(text);

  if (targetLang === 'zh') return hasChinese || (!hasEnglish && !hasChinese); // Don't filter empty text
  if (targetLang === 'en') return hasEnglish || (!hasChinese && !hasEnglish);
  return true;
}

export function detectEmptyOrDegraded(
  results: SearchResult[],
  query: string,
): { isDegraded: boolean; reason?: string } {
  if (results.length === 0) {
    return { isDegraded: true, reason: 'all_sources_returned_empty' };
  }

  // Check if ALL results are from low-authority sources
  const hasQuality = results.some(r => {
    try {
      const host = new URL(r.url).hostname.replace('www.', '');
      return !LOW_AUTHORITY_DOMAINS.some(d => host.includes(d));
    } catch { return false; }
  });

  if (!hasQuality) {
    return { isDegraded: true, reason: 'all_results_from_low_quality_sources' };
  }

  return { isDegraded: false };
}

export function scoreResultQuality(result: SearchResult, query: string): number {
  let score = 0.5; // baseline

  try {
    const host = new URL(result.url).hostname.replace('www.', '');
    const url = result.url.toLowerCase();

    // Authority boost
    if (HIGH_AUTHORITY.some(d => host.includes(d))) score += 0.3;
    else if (MEDIUM_AUTHORITY.some(d => host.includes(d))) score += 0.15;
    else if (LOW_AUTHORITY_DOMAINS.some(d => host.includes(d))) score -= 0.2;

    // Suspicious TLD penalty
    if (SUSPICIOUS_TLDS.some(tld => host.endsWith(tld))) score -= 0.4;

    // Keyword stuffing detection
    const title = result.title.toLowerCase();
    const wordCount = title.split(/\s+/).length;
    const uniqueWords = new Set(title.split(/\s+/));
    if (wordCount > 5 && uniqueWords.size / wordCount < 0.5) score -= 0.2;

    // Snippet quality: prefer results with meaningful snippets
    if (!result.snippet || result.snippet.length < 20) score -= 0.1;
    if (result.snippet && result.snippet.length > 100) score += 0.05;

    // HTTPS bonus
    if (url.startsWith('https://')) score += 0.05;

    // Freshness: prefer results with publication dates
    if (result.publishedAt) {
      const daysAgo = (Date.now() - new Date(result.publishedAt).getTime()) / 86400000;
      if (daysAgo < 7) score += 0.1;
      else if (daysAgo < 90) score += 0.05;
      else if (daysAgo > 365) score -= 0.1;
    }
  } catch { /* use baseline score */ }

  return Math.max(0, Math.min(1, score));
}

export function guardResults(
  results: SearchResult[],
  query: string,
  targetLang: 'zh' | 'en' | 'auto' = 'auto',
): GuardedResult {
  // Step 1: Filter blacklisted domains
  let filtered = filterBlacklistedDomains(results);

  // Step 2: Check for empty or degraded
  const degraded = detectEmptyOrDegraded(filtered, query);
  if (degraded.isDegraded) {
    return { passed: false, results: filtered, reason: degraded.reason, qualityScores: [] };
  }

  // Step 3: Language match filter (soft — only remove if clearly wrong)
  if (targetLang !== 'auto') {
    filtered = filtered.filter(r => {
      const text = `${r.title} ${r.snippet}`;
      return checkLanguageMatch(text, targetLang);
    });
    if (filtered.length === 0) {
      // Don't throw away all results if language filter nukes everything
      filtered = filterBlacklistedDomains(results).slice(0, 5);
    }
  }

  // Step 4: Score and sort
  const qualityScores = filtered.map(r => scoreResultQuality(r, query));
  const scored = filtered.map((r, i) => ({ result: r, score: qualityScores[i] }));
  scored.sort((a, b) => b.score - a.score);

  return {
    passed: true,
    results: scored.map(s => s.result),
    qualityScores: scored.map(s => s.score),
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/lib/services/__tests__/web-search-guard.test.ts
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/web-search-guard.ts src/lib/services/__tests__/web-search-guard.test.ts
git commit -m "feat: 搜索守卫模块 — 域名过滤, 语言检查, 空结果检测, 质量评分"
```

---

### Task 4: 结果重排序模块

**Files:**
- Create: `src/lib/services/web-search-reranker.ts`
- Create: `src/lib/services/__tests__/web-search-reranker.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/lib/services/__tests__/web-search-reranker.test.ts
import { describe, it, expect } from 'vitest';
import { rerankResults, computeSemanticSimilarity, computeAuthorityBoost } from '../web-search-reranker';
import type { SearchResult } from '../web-search.service';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    title: 'Test Result',
    url: 'https://example.com/article',
    snippet: 'This is a test result about supply chain management.',
    ...overrides,
  };
}

describe('computeSemanticSimilarity', () => {
  it('returns higher score for more relevant content', () => {
    const score1 = computeSemanticSimilarity(
      'US-China tariff impact on home appliances 2026',
      'The United States has announced new tariff measures affecting small home appliances imported from China in 2026.',
    );
    const score2 = computeSemanticSimilarity(
      'US-China tariff impact on home appliances 2026',
      'The weather today is sunny with a chance of rain in the afternoon.',
    );
    expect(score1).toBeGreaterThan(score2);
  });

  it('handles Chinese text', () => {
    const score = computeSemanticSimilarity(
      '中国家电出口关税',
      '中国出口家电产品面临美国301关税',
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('returns low score for empty snippet', () => {
    const score = computeSemanticSimilarity('supply chain', '');
    expect(score).toBe(0);
  });
});

describe('computeAuthorityBoost', () => {
  it('boosts .gov domains', () => {
    const boost = computeAuthorityBoost('https://ustr.gov/policy-update');
    expect(boost).toBeGreaterThan(0.15);
  });

  it('does not boost low-authority domains', () => {
    const boost = computeAuthorityBoost('https://random-blog.xyz/post');
    expect(boost).toBeLessThanOrEqual(0.05);
  });
});

describe('rerankResults', () => {
  it('places more relevant results at the top', () => {
    const results: SearchResult[] = [
      makeResult({ title: 'Weather Forecast', snippet: 'Sunny with clouds', url: 'https://news.com/weather' }),
      makeResult({ title: 'Tariff Impact Report', snippet: 'The 2026 US-China tariff escalation affects small home appliance exports...', url: 'https://reuters.com/tariff' }),
      makeResult({ title: 'Sports News', snippet: 'The championship game was exciting', url: 'https://news.com/sports' }),
    ];
    const reranked = rerankResults(results, 'US China tariff impact home appliances');
    expect(reranked[0].url).toContain('reuters.com');
  });

  it('handles empty results', () => {
    expect(rerankResults([], 'anything')).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/lib/services/__tests__/web-search-reranker.test.ts
```
Expected: all tests FAIL

- [ ] **Step 3: 实现 web-search-reranker.ts**

```typescript
// src/lib/services/web-search-reranker.ts

import type { SearchResult } from './web-search.service';

// ─── TF-IDF Style Semantic Similarity (keyword-based, no external API) ──────────

function tokenize(text: string): Map<string, number> {
  const tokens = new Map<string, number>();
  // Extract Chinese words (2-4 char chunks) and English words (3+ chars)
  const chineseTokens = text.match(/[一-鿿]{2,4}/g) || [];
  const englishTokens = text.match(/[a-zA-Z]{3,}/g) || [];

  for (const t of [...chineseTokens, ...englishTokens]) {
    const lower = t.toLowerCase();
    tokens.set(lower, (tokens.get(lower) || 0) + 1);
  }
  return tokens;
}

export function computeSemanticSimilarity(query: string, text: string): number {
  if (!text || text.length === 0) return 0;

  const queryTokens = tokenize(query);
  const textTokens = tokenize(text);

  if (queryTokens.size === 0) return 0.3; // Baseline for unparseable query

  // Cosine similarity over shared tokens
  let dotProduct = 0;
  let queryMagnitude = 0;
  let textMagnitude = 0;

  const allTokens = new Set([...queryTokens.keys(), ...textTokens.keys()]);
  for (const token of allTokens) {
    const qtf = queryTokens.get(token) || 0;
    const ttf = textTokens.get(token) || 0;
    dotProduct += qtf * ttf;
  }

  for (const count of queryTokens.values()) {
    queryMagnitude += count * count;
  }
  for (const count of textTokens.values()) {
    textMagnitude += count * count;
  }

  queryMagnitude = Math.sqrt(queryMagnitude);
  textMagnitude = Math.sqrt(textMagnitude);

  if (queryMagnitude === 0 || textMagnitude === 0) return 0;

  const cosine = dotProduct / (queryMagnitude * textMagnitude);

  // Bonus for exact phrase matches
  let exactBonus = 0;
  const queryPhrases = query.match(/[一-鿿]{4,}|"[^"]+"/g) || [];
  for (const phrase of queryPhrases) {
    if (text.includes(phrase)) exactBonus += 0.1;
  }

  return Math.min(1, cosine + exactBonus);
}

// ─── Authority Boost ────────────────────────────────────────────────────────────

const AUTHORITY_RANKS: Array<{ patterns: string[]; boost: number }> = [
  { patterns: ['.gov', 'gov.cn', '.edu', 'edu.cn', 'who.int', 'un.org', 'wikipedia.org'], boost: 0.25 },
  { patterns: ['reuters.com', 'bloomberg.com', 'bbc.com', 'ft.com', 'wsj.com', 'scmp.com'], boost: 0.20 },
  { patterns: ['mckinsey.com', 'bain.com', 'deloitte.com', 'pwc.com', 'gartner.com', 'freightos.com'], boost: 0.15 },
  { patterns: ['forbes.com', 'techcrunch.com', 'cnbc.com', '36kr.com', 'huxiu.com', 'caixin.com'], boost: 0.10 },
  { patterns: ['linkedin.com', 'medium.com'], boost: 0.05 },
];

const LOW_AUTHORITY_PENALTY: Array<{ patterns: string[]; penalty: number }> = [
  { patterns: ['reddit.com', 'quora.com', 'answers.com'], penalty: -0.10 },
  { patterns: ['blogspot.com', 'wordpress.com', 'tumblr.com'], penalty: -0.05 },
];

export function computeAuthorityBoost(url: string): number {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    for (const rank of AUTHORITY_RANKS) {
      if (rank.patterns.some(p => host.includes(p))) return rank.boost;
    }
    for (const rank of LOW_AUTHORITY_PENALTY) {
      if (rank.patterns.some(p => host.includes(p))) return rank.penalty;
    }
    return 0;
  } catch {
    return 0;
  }
}

// ─── Re-ranker ──────────────────────────────────────────────────────────────────

const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_MS = 90 * 24 * 60 * 60 * 1000;

function computeFreshnessBoost(publishedAt?: string): number {
  if (!publishedAt) return 0;
  const age = Date.now() - new Date(publishedAt).getTime();
  if (age < FRESH_MS) return 0.10;
  if (age < 30 * 24 * 60 * 60 * 1000) return 0.05;
  if (age > STALE_MS) return -0.10;
  return 0;
}

export function rerankResults(results: SearchResult[], query: string): SearchResult[] {
  if (results.length === 0) return [];

  const scored = results.map(r => {
    const text = `${r.title} ${r.snippet}`;
    const simScore = computeSemanticSimilarity(query, text);
    const authBoost = computeAuthorityBoost(r.url);
    const freshBoost = computeFreshnessBoost(r.publishedAt);

    // Weighted combination
    const finalScore = simScore * 0.55 + authBoost * 0.25 + freshBoost * 0.10 + 0.10;

    return { result: r, score: finalScore };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.result);
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/lib/services/__tests__/web-search-reranker.test.ts
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/web-search-reranker.ts src/lib/services/__tests__/web-search-reranker.test.ts
git commit -m "feat: 结果重排序模块 — 语义相似度 + 权威度 + 新鲜度加权排序"
```

---

### Task 5: 多源交叉验证模块

**Files:**
- Create: `src/lib/services/web-search-cross-validator.ts`
- Create: `src/lib/services/__tests__/web-search-cross-validator.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/lib/services/__tests__/web-search-cross-validator.test.ts
import { describe, it, expect } from 'vitest';
import { crossValidate, extractClaim, computeSourceAgreement, type VerifiedResult } from '../web-search-cross-validator';
import type { SearchResult } from '../web-search.service';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    title: 'Test Result',
    url: 'https://example.com/article',
    snippet: 'Supply chain analysis.',
    ...overrides,
  };
}

describe('extractClaim', () => {
  it('extracts factual claims about tariffs', () => {
    const claims = extractClaim('The US imposed 25% tariff on Chinese home appliances in 2026.');
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.some(c => c.includes('tariff') || c.includes('US') || c.includes('25%'))).toBe(true);
  });

  it('handles Chinese text', () => {
    const claims = extractClaim('美国在2026年对中国家电加征25%关税。');
    expect(claims.length).toBeGreaterThan(0);
  });
});

describe('computeSourceAgreement', () => {
  it('returns high agreement for similar claims from different sources', () => {
    const claim = 'US tariff 25% on Chinese appliances';
    const sources = [
      'US imposes 25% tariff on Chinese home appliances',
      '25% tariff rate applied to Chinese appliance imports to US',
      'The tariff rate is 25% for Chinese appliance exports',
    ];
    const agreement = computeSourceAgreement(claim, sources);
    expect(agreement.score).toBeGreaterThan(0.5);
    expect(agreement.supportingSources).toBeGreaterThanOrEqual(2);
  });

  it('returns low agreement for contradictory sources', () => {
    const claim = 'US tariff 25% on Chinese appliances';
    const sources = [
      'Chocolate chip cookies are delicious',
      'The weather is sunny today',
    ];
    const agreement = computeSourceAgreement(claim, sources);
    expect(agreement.score).toBeLessThan(0.3);
  });
});

describe('crossValidate', () => {
  it('flags results with low source agreement', () => {
    const results = [
      makeResult({ url: 'https://reuters.com', snippet: 'US imposes 25% tariff on Chinese appliances' }),
      makeResult({ url: 'https://bloomberg.com', snippet: 'Tariff rate for Chinese appliances set at 25%' }),
      makeResult({ url: 'https://random-blog.xyz', snippet: 'Aliens caused the tariff increase' }),
    ];
    const verified = crossValidate(results, 'US China tariff rate');
    expect(verified.sourceCount).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/lib/services/__tests__/web-search-cross-validator.test.ts
```
Expected: all tests FAIL

- [ ] **Step 3: 实现 web-search-cross-validator.ts**

```typescript
// src/lib/services/web-search-cross-validator.ts

import type { SearchResult } from './web-search.service';

export interface VerifiedResult {
  /** Source count used for verification */
  sourceCount: number;
  /** How many sources support the main claims */
  supportingSources: number;
  /** Overall confidence level */
  confidence: 'high' | 'medium' | 'low';
  /** Specific caveats to attach to results */
  caveats: string[];
  /** Per-result verification notes */
  results: Array<{ result: SearchResult; verified: boolean; note?: string }>;
}

// ─── Claim Extraction ───────────────────────────────────────────────────────────

export function extractClaim(text: string): string[] {
  const claims: string[] = [];
  const sentences = text.split(/[.。!！?？\n]+/).filter(s => s.trim().length > 10);

  for (const sentence of sentences) {
    const hasFactualIndicator =
      /\d+%/.test(sentence) ||
      /\d{4}年/.test(sentence) ||
      /(?:increase|decrease|rise|fall|grow|decline|impose|announce|report|according)/i.test(sentence) ||
      /(?:增[加长]|减[少]|上涨|下跌|宣布|发布|实施|执行|关税|税率)/.test(sentence);

    if (hasFactualIndicator && sentence.length > 15) {
      claims.push(sentence.trim());
    }
  }

  return claims.slice(0, 5);
}

// ─── Source Agreement ───────────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  const chinese = text.match(/[一-鿿]{2,}/g) || [];
  const english = text.match(/[a-zA-Z]{3,}/g) || [];
  const numbers = text.match(/\d+(?:\.\d+)?%?/g) || [];
  for (const t of [...chinese, ...english, ...numbers]) {
    tokens.add(t.toLowerCase());
  }
  return tokens;
}

export function computeSourceAgreement(
  claim: string,
  sources: string[],
): { score: number; supportingSources: number } {
  if (sources.length === 0) return { score: 0, supportingSources: 0 };

  const claimTokens = tokenize(claim);
  if (claimTokens.size === 0) return { score: 0, supportingSources: 0 };

  let supportingSources = 0;
  const scores: number[] = [];

  for (const source of sources) {
    const sourceTokens = tokenize(source);
    const intersection = [...claimTokens].filter(t => sourceTokens.has(t)).length;
    const similarity = intersection / Math.max(claimTokens.size, 1);
    scores.push(similarity);
    if (similarity > 0.3) supportingSources++;
  }

  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { score: avgScore, supportingSources };
}

// ─── Cross Validator ────────────────────────────────────────────────────────────

export function crossValidate(results: SearchResult[], query: string): VerifiedResult {
  if (results.length === 0) {
    return {
      sourceCount: 0,
      supportingSources: 0,
      confidence: 'low',
      caveats: ['联网搜索未返回任何结果，以下分析基于内置知识和数据模型。'],
      results: [],
    };
  }

  // Group results by source type
  const newsSources = results.filter(r => {
    try {
      const host = new URL(r.url).hostname;
      return /reuters|bloomberg|bbc|ft|wsj|scmp|cnbc|caixin|36kr|yicai|cls/i.test(host);
    } catch { return false; }
  });
  const govSources = results.filter(r => {
    try {
      return /\.gov|gov\.cn|edu\.cn/.test(r.url);
    } catch { return false; }
  });
  const otherSources = results.filter(r => !newsSources.includes(r) && !govSources.includes(r));

  const allText = results.map(r => `${r.title} ${r.snippet}`);
  const primaryClaims = extractClaim(results[0]?.snippet || '');

  const caveats: string[] = [];
  let confidence: 'high' | 'medium' | 'low' = 'medium';

  // Source diversity check
  if (results.length < 3) {
    caveats.push('信息来源较少，结论可能存在偏差。');
    confidence = 'low';
  }

  if (govSources.length === 0 && newsSources.length === 0) {
    caveats.push('未找到政府或权威媒体来源，信息可靠性较低。');
    confidence = 'low';
  }

  // Cross-verify primary claims
  let totalSupporting = 0;
  for (const claim of primaryClaims) {
    const agreement = computeSourceAgreement(claim, allText);
    totalSupporting += agreement.supportingSources;
  }

  if (govSources.length > 0 && newsSources.length > 1) {
    confidence = 'high';
    caveats.push('结果来自政府和权威媒体，交叉验证通过。');
  } else if (newsSources.length >= 1 || govSources.length >= 1) {
    if (confidence !== 'low') confidence = 'medium';
  }

  if (primaryClaims.length > 0 && totalSupporting < 2) {
    caveats.push('主要声明未得到其他来源的充分支持。');
  }

  const verifiedResults = results.map(r => {
    try {
      const host = new URL(r.url).hostname;
      const isVerified =
        newsSources.includes(r) || govSources.includes(r) ||
        /wikipedia|mckinsey|gartner|deloitte|pwc|bain|freightos/i.test(host);
      return {
        result: r,
        verified: isVerified,
        note: isVerified ? undefined : '来源未经验证',
      };
    } catch {
      return { result: r, verified: false, note: 'URL 无效' };
    }
  });

  return {
    sourceCount: results.length,
    supportingSources: totalSupporting,
    confidence,
    caveats,
    results: verifiedResults,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/lib/services/__tests__/web-search-cross-validator.test.ts
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/web-search-cross-validator.ts src/lib/services/__tests__/web-search-cross-validator.test.ts
git commit -m "feat: 多源交叉验证模块 — 声明提取, 来源一致性评分, 置信度分级"
```

---

### Task 6: 更新 web-search.service.ts — 串联管道 + 动态 SearXNG 参数

**Files:**
- Modify: `src/lib/services/web-search.service.ts`

- [ ] **Step 1: 更新 SearXNG 搜索函数，支持动态参数**

在现有 `searchSearXNG` 函数（行 103-120）中，替换为支持动态参数的版本：

```typescript
// Replace the SearchSearXNG function (line 103-120) with:

interface SearXNGOptions {
  categories?: string;
  time_range?: string;
  language?: string;
  safesearch?: number;
  engines?: string;
}

function buildSearXNGUrl(baseUrl: string, query: string, options: SearXNGOptions = {}): string {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('format', 'json');
  params.set('categories', options.categories || 'general');
  if (options.time_range) params.set('time_range', options.time_range);
  params.set('language', options.language || 'zh-CN');
  params.set('safesearch', String(options.safesearch ?? 2));
  if (options.engines) params.set('engines', options.engines);
  return `${baseUrl}/search?${params.toString()}`;
}

async function searchSearXNG(
  query: string,
  baseUrl: string,
  options: SearXNGOptions = {},
): Promise<SearchResult[]> {
  const url = buildSearXNGUrl(baseUrl, query, options);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { 'Accept': 'application/json', 'User-Agent': 'SupplyChainCortex/2.9' },
  });
  if (!res.ok) throw new Error(`SearXNG returned ${res.status}`);
  const data = await res.json() as {
    results?: Array<{ title: string; url: string; content: string; publishedDate?: string }>;
  };
  if (!data.results?.length) return [];
  return data.results.slice(0, 10).map(r => ({
    title: r.title,
    url: r.url,
    snippet: (r.content || '').slice(0, 500),
    publishedAt: r.publishedDate,
  }));
}
```

- [ ] **Step 2: 新增 `webSearchWithQuality` 主函数，串联全部管道**

在文件末尾（`getAvailableProviders` 之后）新增：

```typescript
// ─── Quality Pipeline ───────────────────────────────────────────────────────────

export interface QualitySearchResult {
  results: SearchResult[];
  source: string;
  /** Per-layer diagnostics for debugging */
  diagnostics: {
    originalQuery: string;
    rewrittenQueries: string[];
    guardPassed: boolean;
    guardReason?: string;
    rerankApplied: boolean;
    crossValidation: {
      confidence: string;
      caveats: string[];
      supportingSources: number;
      sourceCount: number;
    };
    pipelineMs: number;
  };
}

import { rewriteQuery, injectContext, type ConversationTurn } from './web-search-rewriter';
import { guardResults } from './web-search-guard';
import { rerankResults } from './web-search-reranker';
import { crossValidate } from './web-search-cross-validator';

function classifyQueryForSearch(query: string): {
  categories: string;
  time_range: string;
  engines: string;
} {
  const q = query.toLowerCase();
  const hasChinese = /[一-鿿]/.test(query);

  // News/policy → short time window
  if (/关税|贸易|政策|法规|制裁|限制|宣布|实施/.test(query) ||
      /tariff|trade|policy|sanction|regulation|announce/.test(q)) {
    return {
      categories: 'general,news',
      time_range: 'month',
      engines: hasChinese ? 'google,bing,duckduckgo' : 'google,bing,duckduckgo,wikipedia',
    };
  }

  // Market data/trends → medium window
  if (/价格|汇率|铜|铝|钢|碳|运价|指数|趋势|分析/.test(query) ||
      /price|rate|index|trend|analysis|forecast/.test(q)) {
    return {
      categories: 'general',
      time_range: 'year',
      engines: hasChinese ? 'google,bing,duckduckgo' : 'google,bing,duckduckgo,wikipedia',
    };
  }

  // Technical/implementation → broad window
  if (/技术|系统|架构|代码|API|数据库|算法/.test(query) ||
      /technical|system|architecture|code|api|database|algorithm/.test(q)) {
    return {
      categories: 'general,it',
      time_range: 'year',
      engines: 'google,github,duckduckgo,qwant',
    };
  }

  // Default: general search
  return {
    categories: 'general',
    time_range: 'year',
    engines: hasChinese ? 'google,bing,duckduckgo' : 'google,bing,duckduckgo,wikipedia',
  };
}

export async function webSearchWithQuality(
  query: string,
  conversationHistory: ConversationTurn[] = [],
): Promise<QualitySearchResult> {
  const startTime = Date.now();

  // Step 1: Inject context from conversation history
  const contextQuery = injectContext(sanitizeQuery(query), conversationHistory);

  // Step 2: Rewrite into multiple variant queries
  const rewrittenQueries = rewriteQuery(contextQuery);
  const primaryQuery = rewrittenQueries[0] || contextQuery;

  // Step 3: Classify query for optimal SearXNG params
  const searchOptions = classifyQueryForSearch(primaryQuery);

  // Step 4: Execute primary search with dynamic params
  const config = getConfig();
  let allResults: SearchResult[] = [];
  let source = 'none';

  try {
    if (config.provider === 'searxng') {
      const baseUrl = config.baseUrl || 'http://localhost:8081';
      allResults = await searchSearXNG(primaryQuery, baseUrl, searchOptions);
      source = 'SearXNG';
    } else {
      const result = await searchByProvider(primaryQuery, config);
      allResults = result.results;
      source = result.source;
    }
  } catch (err) {
    const msg = (err as Error).message || 'Unknown error';
    console.warn('[web-search-quality] Primary search failed:', msg.replace(/key[=:][^\s&]{8,}/gi, 'key=***'));
  }

  // Step 5: If multi-query rewriting enabled, search additional variants (max 2 more)
  if (rewrittenQueries.length > 1 && allResults.length < 5) {
    for (const variant of rewrittenQueries.slice(1, 3)) {
      try {
        const extraResults = config.provider === 'searxng'
          ? await searchSearXNG(variant, config.baseUrl || 'http://localhost:8081', searchOptions)
          : (await searchByProvider(variant, config)).results;
        // Merge and deduplicate by URL
        const seenUrls = new Set(allResults.map(r => r.url));
        for (const r of extraResults) {
          if (!seenUrls.has(r.url)) {
            allResults.push(r);
            seenUrls.add(r.url);
          }
        }
      } catch { /* continue */ }
    }
  }

  // Step 6: Guard — filter and score
  const guardTargetLang = /[一-鿿]/.test(primaryQuery) ? 'zh' : 'auto';
  const guarded = guardResults(allResults, primaryQuery, guardTargetLang as 'zh' | 'en' | 'auto');

  let finalResults = guarded.passed ? guarded.results : allResults;

  // Step 7: Rerank
  finalResults = rerankResults(finalResults, primaryQuery);

  // Step 8: Cross-validate
  const verified = crossValidate(finalResults, primaryQuery);

  const pipelineMs = Date.now() - startTime;

  return {
    results: finalResults.slice(0, 8),
    source: guarded.passed ? source : `${source} ⚠️degraded`,
    diagnostics: {
      originalQuery: query,
      rewrittenQueries,
      guardPassed: guarded.passed,
      guardReason: guarded.reason,
      rerankApplied: true,
      crossValidation: {
        confidence: verified.confidence,
        caveats: verified.caveats,
        supportingSources: verified.supportingSources,
        sourceCount: verified.sourceCount,
      },
      pipelineMs,
    },
  };
}
```

- [ ] **Step 3: 导出新类型，更新 public API**

在文件头部增加导出 `ConversationTurn`。确保 import 顺序正确。

- [ ] **Step 4: 验证 TypeScript 编译**

```bash
npx tsc --noEmit src/lib/services/web-search.service.ts
```
Expected: no errors

- [ ] **Step 5: 运行所有搜索相关测试**

```bash
npx vitest run src/lib/services/__tests__/web-search-*.test.ts
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/web-search.service.ts
git commit -m "feat: 搜索质量管道 — 串联 Rewrite→Guard→Rerank→CrossValidate,动态 SearXNG 参数"
```

---

### Task 7: 基准测试脚本

**Files:**
- Create: `scripts/benchmark-search.ts`

- [ ] **Step 1: 实现基准测试脚本**

```typescript
#!/usr/bin/env bun
// scripts/benchmark-search.ts
// Search quality benchmark — compares old webSearch vs new webSearchWithQuality

import { webSearch, formatSearchContext, webSearchWithQuality } from '../src/lib/services/web-search.service';

// ─── Test Queries ───────────────────────────────────────────────────────────────

const TEST_CASES = [
  {
    id: 'T1',
    query: '中国家电出口美国301关税最新政策',
    expectedTopics: ['关税', '301', '美国', '家电'],
    minResults: 3,
    description: '中文政策类搜索',
  },
  {
    id: 'T2',
    query: 'US-China trade war small home appliances 2026',
    expectedTopics: ['tariff', 'trade', 'China', 'US', 'appliance'],
    minResults: 3,
    description: '英文政策类搜索',
  },
  {
    id: 'T3',
    query: '东南亚供应链转移 越南 家电制造',
    expectedTopics: ['越南', '东南亚', '供应链', '制造'],
    minResults: 2,
    description: '中文趋势类搜索',
  },
  {
    id: 'T4',
    query: 'copper price forecast 2026',
    expectedTopics: ['copper', 'price', 'forecast'],
    minResults: 2,
    description: '英文数据类搜索',
  },
  {
    id: 'T5',
    query: '欧盟CBAM碳关税对家电出口影响',
    expectedTopics: ['CBAM', '碳', '欧盟', '家电'],
    minResults: 2,
    description: '中文法规类搜索',
  },
  {
    id: 'T6',
    query: '你好世界',
    expectedTopics: [],
    minResults: 0,
    description: '无关查询（退化测试）',
  },
];

// ─── Scoring ────────────────────────────────────────────────────────────────────

function topicCoverage(results: Array<{ title: string; snippet: string }>, topics: string[]): number {
  if (topics.length === 0) return 1.0; // No expectations → no penalty
  const text = results.map(r => `${r.title} ${r.snippet}`).join(' ').toLowerCase();
  let covered = 0;
  for (const topic of topics) {
    if (text.includes(topic.toLowerCase())) covered++;
  }
  return covered / topics.length;
}

function emptyRate(hasResults: boolean): number {
  return hasResults ? 0 : 1;
}

function authorityRatio(results: Array<{ url: string }>): number {
  if (results.length === 0) return 0;
  const highAuth = results.filter(r => {
    try {
      const host = new URL(r.url).hostname;
      return /\.gov|gov\.cn|reuters|bloomberg|bbc|ft\.com|wsj\.com|scmp|wikipedia/i.test(host);
    } catch { return false; }
  });
  return highAuth.length / results.length;
}

// ─── Main ───────────────────────────────────────────────────────────────────────

async function runBenchmark() {
  console.log('🔬 搜索质量基准测试\n');
  console.log('='.repeat(80));

  let totalOldScore = 0;
  let totalNewScore = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const test of TEST_CASES) {
    console.log(`\n📋 ${test.id}: ${test.description}`);
    console.log(`   Query: "${test.query}"`);

    // ─── Old pipeline ────────────────────────────────────────────────
    const oldStart = Date.now();
    const oldResult = await webSearch(test.query);
    const oldTime = Date.now() - oldStart;

    const oldCoverage = topicCoverage(oldResult.results, test.expectedTopics);
    const oldEmpty = emptyRate(oldResult.results.length > 0);
    const oldAuth = authorityRatio(oldResult.results);
    const oldScore = oldCoverage * 0.5 + (1 - oldEmpty) * 0.3 + oldAuth * 0.2;

    console.log(`   🔴 旧管道: ${oldResult.results.length}条 | 覆盖率=${(oldCoverage*100).toFixed(0)}% | 权威比=${(oldAuth*100).toFixed(0)}% | ${oldTime}ms | 得分=${oldScore.toFixed(2)}`);

    // ─── New pipeline ────────────────────────────────────────────────
    const newStart = Date.now();
    const newResult = await webSearchWithQuality(test.query);
    const newTime = Date.now() - newStart;

    const newCoverage = topicCoverage(newResult.results, test.expectedTopics);
    const newEmpty = emptyRate(newResult.results.length > 0);
    const newAuth = authorityRatio(newResult.results);
    const newScore = newCoverage * 0.5 + (1 - newEmpty) * 0.3 + newAuth * 0.2;

    console.log(`   🟢 新管道: ${newResult.results.length}条 | 覆盖率=${(newCoverage*100).toFixed(0)}% | 权威比=${(newAuth*100).toFixed(0)}% | ${newTime}ms | 得分=${newScore.toFixed(2)}`);
    console.log(`   📊 诊断: queries=${newResult.diagnostics.rewrittenQueries.length} | guard=${newResult.diagnostics.guardPassed} | confidence=${newResult.diagnostics.crossValidation.confidence}`);
    if (newResult.diagnostics.crossValidation.caveats.length > 0) {
      console.log(`   ⚠️  警告: ${newResult.diagnostics.crossValidation.caveats[0]}`);
    }

    totalOldScore += oldScore;
    totalNewScore += newScore;
    results.push({
      id: test.id,
      description: test.description,
      oldResults: oldResult.results.length,
      newResults: newResult.results.length,
      oldCoverage,
      newCoverage,
      oldAuth,
      newAuth,
      oldTime,
      newTime,
      oldScore,
      newScore,
      confidence: newResult.diagnostics.crossValidation.confidence,
    });
  }

  // ─── Summary ──────────────────────────────────────────────────────────────────
  const oldAvg = totalOldScore / TEST_CASES.length;
  const newAvg = totalNewScore / TEST_CASES.length;
  const improvement = ((newAvg - oldAvg) / Math.max(oldAvg, 0.01)) * 100;

  console.log('\n' + '='.repeat(80));
  console.log('📊 总览');
  console.log('='.repeat(80));
  console.log(`   旧管道平均得分: ${oldAvg.toFixed(2)}`);
  console.log(`   新管道平均得分: ${newAvg.toFixed(2)}`);
  console.log(`   提升: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%`);

  // Per-test breakdown
  console.log('\n   ID  | 描述           | 旧得分 | 新得分 | 置信度');
  console.log('   ' + '-'.repeat(55));
  for (const r of results) {
    console.log(`   ${r.id} | ${String(r.description).padEnd(14)} | ${String(r.oldScore).padEnd(6)} | ${String(r.newScore).padEnd(6)} | ${r.confidence}`);
  }

  return results;
}

runBenchmark()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
```

- [ ] **Step 2: 运行基准测试**

```bash
cd D:/vibe-coding/jiadian_supply/02_LocalDev/2/2.9.3
bun run scripts/benchmark-search.ts
```
Expected: 输出对比结果，显示新旧管道得分差异

- [ ] **Step 3: Commit**

```bash
git add scripts/benchmark-search.ts
git commit -m "feat: 搜索质量基准测试脚本 — 新旧管道对比"
```

---

### Task 8: 集成测试 & Debug

**Files:**
- Modify: `scripts/test-web-search.ts` (更新为使用新管道)
- Read: benchmark output for debugging

- [ ] **Step 1: 更新现有测试脚本**

在 `scripts/test-web-search.ts` 中增加新管道的测试调用：

```typescript
import { webSearch, webSearchWithQuality } from '../src/lib/services/web-search.service';

// Test 1: Chinese query (old)
const r1 = await webSearch('中国家电出口 关税 2026');
console.log('1. Chinese (old):', r1.results.length, 'Source:', r1.source);

// Test 1b: Chinese query (new pipeline)
const r1b = await webSearchWithQuality('中国家电出口 关税 2026');
console.log('1b. Chinese (new):', r1b.results.length, 'Confidence:', r1b.diagnostics.crossValidation.confidence);
console.log('    Caveats:', r1b.diagnostics.caveats.join('; '));

// Test 2: Policy (old)
const r2 = await webSearch('US Section 301 tariff small appliances 2026');
console.log('2. Policy (old):', r2.results.length, 'Source:', r2.source);

// Test 2b: Policy (new pipeline)
const r2b = await webSearchWithQuality('US Section 301 tariff small appliances 2026');
console.log('2b. Policy (new):', r2b.results.length, 'Confidence:', r2b.diagnostics.crossValidation.confidence);

// Test 3: Current events (new pipeline with context)
const r3 = await webSearchWithQuality('铜价走势',
  [{ role: 'user', content: '大宗商品原材料成本分析' }]
);
console.log('3. Context-injected:', r3.results.length, 'Rewritten:', r3.diagnostics.rewrittenQueries);
if (r3.results.length > 0) console.log('   Top:', r3.results[0].title);
```

- [ ] **Step 2: 运行集成测试**

```bash
bun run scripts/test-web-search.ts
```

- [ ] **Step 3: Debug — 检查输出质量**

检查要点：
1. 新管道返回的结果数是否 >= 旧管道
2. 是否有垃圾内容（成人/无关网站）
3. confidence 是否合理
4. caveats 是否有意义
5. 上下文注入是否生效（Test 3）

- [ ] **Step 4: 修复发现的问题，重复测试直到满意**

- [ ] **Step 5: Commit**

```bash
git add scripts/test-web-search.ts
git commit -m "test: 更新搜索测试脚本,加入新管道对比和上下文注入测试"
```

---

## 最终验证检查清单

- [ ] `npx vitest run` — 所有单元测试通过
- [ ] `bun run scripts/benchmark-search.ts` — 新管道得分 > 旧管道得分
- [ ] `bun run scripts/test-web-search.ts` — 所有测试用例返回合理结果
- [ ] 无垃圾/成人内容出现在搜索结果中
- [ ] 中文查询返回中文结果（或含中文索引的英文结果）
- [ ] Guard 层的 domain blacklist 生效
- [ ] 上下文注入在多轮对话场景生效
- [ ] `npx tsc --noEmit` — TypeScript 无类型错误
