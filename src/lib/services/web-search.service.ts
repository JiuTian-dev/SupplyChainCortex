/**
 * Web Search Service — Multi-provider architecture.
 *
 * Provider Router: SearXNG (self-hosted) | Brave | Tavily | Jina Search
 * Content Extraction: Jina Reader (shared across all providers)
 * Fallback chain: primary → Reddit → GitHub → Hacker News
 *
 * .env config:
 *   SEARCH_PROVIDER=searxng|brave|tavily|jina
 *   SEARXNG_BASE_URL=http://localhost:8081
 *   BRAVE_API_KEY=...
 *   TAVILY_API_KEY=...
 */

import { rewriteQuery, injectContext, type ConversationTurn } from './web-search-rewriter';
import { guardResults } from './web-search-guard';
import { rerankResults } from './web-search-reranker';
import { crossValidate } from './web-search-cross-validator';
import {
  searchSearXNG, searchDuckDuckGoHTML, searchWikipedia, searchPublicSearXNGPool,
  searchReddit, searchGitHub, searchHackerNews,
  searchByProvider, fetchPageContent,
  type SearXNGOptions,
} from './web-search.providers';

// ─── Types ────────────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
  source?: string;
  publishedAt?: string;
}

export type SearchProvider = 'searxng' | 'brave' | 'tavily' | 'jina' | 'ddg';

export interface ProviderConfig {
  provider: SearchProvider;
  baseUrl?: string;
  apiKey?: string;
}

// ─── Simple URL Safety ────────────────────────────────────────────────────────────

function sanitizeQuery(query: string): string {
  return query.replace(/[<>"']/g, '').slice(0, 500);
}

// ─── Search Diagnostics Type ──────────────────────────────────────────────────

export interface SearchDiagnostics {
  failedProviders: Array<{ provider: string; error: string }>;
}

// ─── In-Memory Search Result Cache (LRU + TTL) ───────────────────────────────

const searchCache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 60_000;
const CACHE_MAX = 100;

function getCacheKey(query: string, config: ProviderConfig, extra?: string): string {
  const raw = `${query}|${config.provider}|${config.baseUrl || ''}|${extra || ''}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function cacheGet<T>(key: string): T | undefined {
  const entry = searchCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiry) {
    searchCache.delete(key);
    return undefined;
  }
  searchCache.delete(key);
  searchCache.set(key, entry);
  return entry.data as T;
}

function cacheSet<T>(key: string, data: T): void {
  if (searchCache.size >= CACHE_MAX) {
    const oldest = searchCache.keys().next().value;
    if (oldest) searchCache.delete(oldest);
  }
  searchCache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

// ─── Prompt Injection Sanitizer ───────────────────────────────────────────────

function sanitizeForLLM(text: string): string {
  let sanitized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  const injectionPatterns: RegExp[] = [
    /ignore\s+(all\s+)?previous\s+instructions/gi,
    /system:/gi,
    /you\s+are\s+now/gi,
    /new\s+instructions/gi,
    /override\s+(all\s+)?previous/gi,
    /disregard\s+(all\s+)?previous/gi,
    /you\s+are\s+(not|no\s+longer)/gi,
    /your\s+(new\s+)?(task|role|job|mission)\s+is/gi,
    /ignore\s+all\s+prior/gi,
  ];
  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, '[redacted]');
  }

  if (sanitized.length > 500) {
    sanitized = sanitized.slice(0, 497) + '...';
  }

  return sanitized;
}

// ─── Config ───────────────────────────────────────────────────────────────────────

function getConfig(): ProviderConfig {
  const baseUrl = process.env.SEARXNG_BASE_URL || 'http://localhost:8081';
  return {
    provider: (process.env.SEARCH_PROVIDER as SearchProvider) || 'searxng',
    baseUrl,
    apiKey: process.env.BRAVE_API_KEY || process.env.TAVILY_API_KEY || undefined,
  };
}

// ─── Provider Router (tiered fallback) ────────────────────────────────────────

async function tryAllSources(query: string, config: ProviderConfig): Promise<{ results: SearchResult[]; source: string; diagnostics: SearchDiagnostics }> {
  const diagnostics: SearchDiagnostics = { failedProviders: [] };

  // Tier 1: Primary provider
  try {
    const result = await searchByProvider(query, config);
    if (result.results.length > 0) return { ...result, diagnostics };
  } catch (err) {
    const msg = (err as Error).message || 'Unknown error';
    const safeMsg = msg.replace(/key[=:][^\s&]{8,}/gi, 'key=***');
    console.warn('[web-search] Primary provider failed:', safeMsg);
    diagnostics.failedProviders.push({ provider: config.provider, error: safeMsg });
  }

  // Tier 2-4: Reddit → GitHub → Hacker News
  const fallbackSources: Array<{ name: string; fn: (_q: string) => Promise<SearchResult[]> }> = [
    { name: 'Reddit', fn: searchReddit },
    { name: 'GitHub', fn: searchGitHub },
    { name: 'Hacker News', fn: searchHackerNews },
  ];

  for (const { name, fn } of fallbackSources) {
    try {
      const results = await fn(query);
      if (results.length > 0) return { results, source: name, diagnostics };
    } catch (err) {
      const msg = (err as Error).message || 'Unknown error';
      console.warn(`[web-search] ${name} search failed:`, msg);
      diagnostics.failedProviders.push({ provider: name, error: msg });
    }
  }

  return { results: [], source: 'none', diagnostics };
}

// ─── Public API ────────────────────────────────────────────────────────────────────

export async function webSearch(query: string): Promise<{ results: SearchResult[]; source: string; diagnostics?: SearchDiagnostics }> {
  const q = sanitizeQuery(query);
  if (!q) return { results: [], source: 'none' };

  const config = getConfig();
  const cacheKey = getCacheKey(q, config);
  const cached = cacheGet<{ results: SearchResult[]; source: string }>(cacheKey);
  if (cached) return cached;

  const result = await tryAllSources(q, config);
  if (result.results.length === 0) return { results: [], source: 'none', diagnostics: result.diagnostics };

  const guarded = guardResults(result.results, q, 'auto');
  const finalResult = {
    results: guarded.results.length > 0 ? guarded.results : result.results,
    source: result.source,
    diagnostics: result.diagnostics,
  };

  cacheSet(cacheKey, { results: finalResult.results, source: finalResult.source });
  return finalResult;
}

export async function deepSearch(query: string): Promise<{ results: SearchResult[]; source: string; diagnostics?: SearchDiagnostics }> {
  const { results, source, diagnostics } = await webSearch(query);
  if (results.length === 0) return { results: [], source, diagnostics };

  const enriched = await Promise.all(
    results.slice(0, 3).map(async (r) => {
      const content = await fetchPageContent(r.url);
      return { ...r, content };
    })
  );

  return {
    results: [...enriched, ...results.slice(3)],
    source: `${source} + Jina Reader`,
    diagnostics,
  };
}

export async function searchSupplementary(query: string): Promise<{ reddit: SearchResult[]; github: SearchResult[]; hn: SearchResult[]; diagnostics: SearchDiagnostics }> {
  const q = sanitizeQuery(query);
  const diagnostics: SearchDiagnostics = { failedProviders: [] };

  const [redditRes, githubRes, hnRes] = await Promise.allSettled([
    searchReddit(q), searchGitHub(q), searchHackerNews(q),
  ]);

  const unwrap = <T>(res: PromiseSettledResult<T>, name: string, diag: SearchDiagnostics): T => {
    if (res.status === 'fulfilled') return res.value;
    diag.failedProviders.push({ provider: name, error: (res.reason as Error)?.message || 'Unknown' });
    return [] as unknown as T;
  };

  return {
    reddit: unwrap(redditRes, 'Reddit', diagnostics),
    github: unwrap(githubRes, 'GitHub', diagnostics),
    hn: unwrap(hnRes, 'Hacker News', diagnostics),
    diagnostics,
  };
}

export function formatSearchContext(results: SearchResult[], maxResults = 6): string {
  if (results.length === 0) {
    const provider = getConfig().provider;
    if (provider === 'searxng') {
      return `未找到搜索结果。\n\n💡 SearXNG 容器可能未启动。运行 \`docker compose up -d searxng\` 即可。\n也可用内置MCP工具：query_commodities(大宗商品)、query_scfis(运价)、query_carbon_price(碳价)、query_cpsc_recalls(召回)、query_tariff(关税)、query_exchange_rates(汇率)`;
    }
    return `未找到搜索结果（当前 provider: ${provider}）。建议使用专用MCP工具查询具体数据。`;
  }

  const sanitizedResults = results.map(r => ({
    ...r,
    title: sanitizeForLLM(r.title),
    snippet: sanitizeForLLM(r.snippet),
    content: r.content ? sanitizeForLLM(r.content) : undefined,
  }));

  const LOW_QUALITY_DOMAINS = ['reddit.com', 'forum.adrenaline.com.br', 'quora.com', 'answers.com'];
  const filtered = sanitizedResults.filter(r => {
    try {
      const host = new URL(r.url).hostname.replace('www.', '');
      return !LOW_QUALITY_DOMAINS.some(d => host.includes(d));
    } catch { return true; }
  });

  const now = Date.now();
  const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
  const STALE_MS = 90 * 24 * 60 * 60 * 1000;
  const HIGH_AUTHORITY = ['wikipedia.org', '.gov', 'who.int', 'un.org', 'ustr.gov', 'cpsc.gov',
    'reuters.com', 'bloomberg.com', 'bbc.com', 'ft.com', 'wsj.com', 'chinabriefing.com',
    'scmp.com', 'nrf.com', 'freightos.com', 'project44.com'];

  const scored = filtered.map(r => {
    let freshnessScore = 0.5;
    if (r.publishedAt) {
      const age = now - new Date(r.publishedAt).getTime();
      if (age < FRESH_MS) freshnessScore = 1.0;
      else if (age < 30 * 24 * 60 * 60 * 1000) freshnessScore = 0.85;
      else if (age < STALE_MS) freshnessScore = 0.6;
      else freshnessScore = 0.3;
    }
    return { result: r, freshnessScore };
  });

  scored.sort((a, b) => {
    if ((a.freshnessScore < 0.4) !== (b.freshnessScore < 0.4)) return a.freshnessScore < 0.4 ? 1 : -1;
    return b.freshnessScore - a.freshnessScore;
  });

  const tagged = scored.map((s, i) => {
    const r = s.result;
    let authority = '';
    try {
      const host = new URL(r.url).hostname.replace('www.', '');
      if (HIGH_AUTHORITY.some(d => host.includes(d))) authority = ' [权威]';
      else if (host.includes('linkedin.com') || host.includes('medium.com')) authority = ' [博客]';
      else if (host.includes('github.com') || host.includes('ycombinator.com')) authority = ' [社区]';
    } catch { /* ignore */ }
    if (s.freshnessScore >= 1.0) authority += ' [最新]';
    else if (s.freshnessScore < 0.4) authority += ' ⚠️[过时]';

    const parts = [`[${i + 1}]${authority} ${r.title}`, r.snippet, r.url];
    if (r.content) parts.push(`\n全文:\n${r.content.slice(0, 1500)}`);
    if (r.publishedAt) {
      const ageDays = Math.round((now - new Date(r.publishedAt).getTime()) / 86400000);
      parts.push(`📅 ${r.publishedAt} (${ageDays}天前)`);
    } else {
      parts.push(`📅 发布日期未知`);
    }
    return parts.join('\n');
  });

  const header = `📡 联网搜索结果 (${tagged.length}条，[权威]=政府/媒体/机构 [博客]=个人分析 [社区]=论坛)。
⚠️ 优先使用内置MCP工具的精准数据。搜索结果用于补充政策背景和行业动态，可能包含过时或主观内容。\n`;

  return header + tagged.slice(0, maxResults).join('\n\n');
}

export function getSearchProvider(): SearchProvider {
  return getConfig().provider;
}

export function getAvailableProviders(): Array<{ name: SearchProvider; available: boolean; reason: string }> {
  return [
    { name: 'ddg', available: true, reason: 'DuckDuckGo — free, no API key, no Docker' },
    { name: 'searxng', available: true, reason: 'Self-hosted — requires Docker' },
    { name: 'brave', available: !!process.env.BRAVE_API_KEY, reason: process.env.BRAVE_API_KEY ? 'Configured' : 'Set BRAVE_API_KEY in .env' },
    { name: 'tavily', available: !!process.env.TAVILY_API_KEY, reason: process.env.TAVILY_API_KEY ? 'Configured' : 'Set TAVILY_API_KEY in .env' },
    { name: 'jina', available: !!process.env.JINA_API_KEY, reason: process.env.JINA_API_KEY ? 'Configured' : 'Needs JINA_API_KEY (free tier available)' },
  ];
}

// ─── Quality Pipeline ───────────────────────────────────────────────────────────

export interface QualitySearchResult {
  results: SearchResult[];
  source: string;
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

function classifyQueryForSearch(query: string): {
  categories: string;
  time_range?: string;
  engines: string;
} {
  const q = query.toLowerCase();
  const hasChinese = /[一-鿿]/.test(query);
  const cnEngines = 'google,bing,duckduckgo';
  const enEngines = 'google,bing,duckduckgo,wikipedia';

  if (/关税|贸易|政策|法规|制裁|限制|宣布|实施/.test(query) ||
      /tariff|trade|policy|sanction|regulation|announce/.test(q)) {
    return { categories: 'general,news', time_range: 'month', engines: hasChinese ? cnEngines : enEngines };
  }

  if (/价格|汇率|铜|铝|钢|碳|运价|指数|趋势|分析/.test(query) ||
      /price|rate|index|trend|analysis|forecast/.test(q)) {
    return { categories: 'general', engines: hasChinese ? cnEngines : enEngines };
  }

  if (/技术|系统|架构|代码|API|数据库|算法/.test(query) ||
      /technical|system|architecture|code|api|database|algorithm/.test(q)) {
    return { categories: 'general,it', engines: 'google,github,duckduckgo,qwant' };
  }

  return { categories: 'general', engines: hasChinese ? cnEngines : enEngines };
}

const TARGET_MIN_RESULTS = 10;

async function fetchFromSource(
  query: string, config: ProviderConfig, searchOptions: SearXNGOptions,
): Promise<{ results: SearchResult[]; source: string }> {
  if (config.provider === 'searxng') {
    const baseUrl = config.baseUrl || 'http://localhost:8081';
    const results = await searchSearXNG(query, baseUrl, searchOptions);
    return { results, source: 'SearXNG' };
  }
  return searchByProvider(query, config);
}

function mergeResults(existing: SearchResult[], incoming: SearchResult[]): SearchResult[] {
  const seen = new Set(existing.map(r => r.url));
  for (const r of incoming) {
    if (!seen.has(r.url)) {
      existing.push(r);
      seen.add(r.url);
    }
  }
  return existing;
}

export async function webSearchWithQuality(
  query: string,
  conversationHistory: ConversationTurn[] = [],
): Promise<QualitySearchResult> {
  const startTime = Date.now();
  const safeQuery = sanitizeQuery(query);

  const contextQuery = injectContext(safeQuery, conversationHistory);
  const rewrittenQueries = rewriteQuery(contextQuery);
  const primaryQuery = rewrittenQueries[0] || contextQuery;
  const searchOptions = classifyQueryForSearch(primaryQuery);
  const config = getConfig();

  // Cache check
  const cacheKey = getCacheKey(primaryQuery, config,
    `${searchOptions.categories || ''}|${searchOptions.time_range || ''}|${searchOptions.engines || ''}`);
  const cached = cacheGet<QualitySearchResult>(cacheKey);
  if (cached) return cached;

  const allResults: SearchResult[] = [];
  const sources: string[] = [];

  // Multi-source parallel racing
  const parallelSources: Array<Promise<{ results: SearchResult[]; source: string }>> = [];

  parallelSources.push(
    fetchFromSource(primaryQuery, config, searchOptions)
      .catch(err => {
        const msg = (err as Error).message || 'Unknown error';
        console.warn('[web-search-quality] SearXNG failed:', msg.replace(/key[=:][^\s&]{8,}/gi, 'key=***'));
        return { results: [] as SearchResult[], source: 'SearXNG' };
      })
  );

  parallelSources.push(
    searchDuckDuckGoHTML(primaryQuery).then(r => ({ results: r, source: 'DDG' }))
  );

  parallelSources.push(
    searchWikipedia(primaryQuery).then(r => ({ results: r, source: 'Wikipedia' }))
  );

  parallelSources.push(
    searchPublicSearXNGPool(primaryQuery, 3).then(r => ({ results: r, source: 'PublicPool' }))
  );

  const settled = await Promise.allSettled(parallelSources);
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value.results.length > 0) {
      mergeResults(allResults, s.value.results);
      sources.push(s.value.source);
    }
  }

  // Multi-query variant expansion
  const variantsNeeded = allResults.length < 15;
  if (rewrittenQueries.length > 1 && variantsNeeded) {
    const extraQueries = rewrittenQueries.slice(1, 3);
    const variantResults = await Promise.allSettled(
      extraQueries.map(vq =>
        config.provider === 'searxng'
          ? searchSearXNG(vq, config.baseUrl || 'http://localhost:8081', searchOptions)
          : searchByProvider(vq, config).then(r => r.results)
      )
    );
    for (const vr of variantResults) {
      if (vr.status === 'fulfilled' && vr.value.length > 0) {
        mergeResults(allResults, vr.value);
      }
    }
  }

  // Adaptive recall loop
  let iteration = 0;
  const MAX_ITERATIONS = 2;

  while (iteration < MAX_ITERATIONS) {
    const guardTargetLang = /[一-鿿]/.test(primaryQuery) ? 'zh' : 'auto';
    const guarded = guardResults(allResults, primaryQuery, guardTargetLang as 'zh' | 'en' | 'auto');
    let pool = guarded.passed ? guarded.results : allResults;
    pool = rerankResults(pool, primaryQuery);

    if (pool.length >= TARGET_MIN_RESULTS || iteration === MAX_ITERATIONS - 1) {
      const verified = crossValidate(pool, primaryQuery);
      const pipelineMs = Date.now() - startTime;
      const combinedSource = [...new Set(sources)].join(' + ');

      const qualityResult: QualitySearchResult = {
        results: pool.slice(0, TARGET_MIN_RESULTS),
        source: guarded.passed ? combinedSource : `${combinedSource} ⚠️degraded`,
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
      cacheSet(cacheKey, qualityResult);
      return qualityResult;
    }

    iteration++;
    const broadenedOptions: SearXNGOptions = {
      ...searchOptions,
      categories: 'general',
      time_range: undefined,
      engines: undefined,
    };

    try {
      const broadResults = await fetchFromSource(primaryQuery, config, broadenedOptions);
      if (broadResults.results.length > 0) {
        mergeResults(allResults, broadResults.results);
        sources.push(broadResults.source + '(broad)');
      }
    } catch { /* continue */ }

    try {
      const broadDDG = await searchDuckDuckGoHTML(primaryQuery);
      if (broadDDG.length > 0) mergeResults(allResults, broadDDG);
    } catch { /* continue */ }
  }

  const verified = crossValidate(allResults, primaryQuery);
  const pipelineMs = Date.now() - startTime;
  const combinedSource = [...new Set(sources)].join(' + ');

  const fallbackResult: QualitySearchResult = {
    results: allResults.slice(0, TARGET_MIN_RESULTS),
    source: combinedSource || 'none',
    diagnostics: {
      originalQuery: query,
      rewrittenQueries,
      guardPassed: false,
      guardReason: 'adaptive_recall_exhausted',
      rerankApplied: false,
      crossValidation: {
        confidence: verified.confidence,
        caveats: verified.caveats,
        supportingSources: verified.supportingSources,
        sourceCount: verified.sourceCount,
      },
      pipelineMs,
    },
  };
  cacheSet(cacheKey, fallbackResult);
  return fallbackResult;
}
