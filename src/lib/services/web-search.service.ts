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
import { zhToEnTermMap, zhToEnRewriterMap } from './web-search-keywords';

// ─── Types ────────────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  /** Full page content (only populated in deep mode via Jina Reader) */
  content?: string;
  source?: string;
  publishedAt?: string;
}

export type SearchProvider = 'searxng' | 'brave' | 'tavily' | 'jina' | 'ddg';

interface ProviderConfig {
  provider: SearchProvider;
  baseUrl?: string;
  apiKey?: string;
}

// ─── URL Safety ───────────────────────────────────────────────────────────────────

const BLOCKED_HOSTS = ['127.0.0.1', 'localhost', '0.0.0.0', '::1', '[::1]',
  '169.254.', '10.', '172.16.', '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
  '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
  '192.168.', 'metadata.google.internal'];

function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (BLOCKED_HOSTS.some(h => u.hostname === h || u.hostname.startsWith(h))) return false;
    return true;
  } catch { return false; }
}

function sanitizeQuery(query: string): string {
  return query.replace(/[<>"']/g, '').slice(0, 500);
}

function hasChinese(text: string): boolean {
  return /[一-鿿]/.test(text);
}

/**
 * Extract English keywords from a Chinese query for fallback search.
 * Maps common Chinese supply chain terms to English equivalents.
 */
function extractEnglishKeywords(query: string): string {
  // Use the shared comprehensive map (merge both maps for maximum coverage)
  const termMap = { ...zhToEnRewriterMap, ...zhToEnTermMap };
  let result = query;
  for (const [zh, en] of Object.entries(termMap)) {
    result = result.replace(new RegExp(zh, 'g'), ' ' + en + ' ');
  }
  // Remove remaining Chinese characters and clean up
  result = result.replace(/[一-鿿]+/g, ' ').replace(/\s+/g, ' ').trim();
  return result || query.replace(/[一-鿿]/g, '').trim() || 'supply chain';
}

// ─── Search Diagnostics Type ──────────────────────────────────────────────────

export interface SearchDiagnostics {
  failedProviders: Array<{ provider: string; error: string }>;
}

// ─── In-Memory Search Result Cache (LRU + TTL) ───────────────────────────────

const searchCache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 60_000; // 60 seconds
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
  // LRU: move to end (most recently used)
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

/**
 * Sanitize text from external sources before injecting into LLM context.
 * Strips common prompt injection patterns, limits length, and removes
 * control characters.
 */
function sanitizeForLLM(text: string): string {
  // Remove control characters except newlines (\n), carriage returns (\r), and tabs (\t)
  let sanitized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Strip common prompt injection patterns (case-insensitive)
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

  // Limit length
  if (sanitized.length > 500) {
    sanitized = sanitized.slice(0, 497) + '...';
  }

  return sanitized;
}

// ─── Config ───────────────────────────────────────────────────────────────────────

function getConfig(): ProviderConfig {
  const baseUrl = process.env.SEARXNG_BASE_URL || 'http://localhost:8081';
  // Note: isSafeUrl NOT applied here — baseUrl is admin-configured (not user input).
  // isSafeUrl is used only in fetchPageContent for user-supplied URLs from search results.
  return {
    provider: (process.env.SEARCH_PROVIDER as SearchProvider) || 'searxng',
    baseUrl,
    apiKey: process.env.BRAVE_API_KEY || process.env.TAVILY_API_KEY || undefined,
  };
}

// ─── SearXNG ──────────────────────────────────────────────────────────────────────

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
  if (options.language) params.set('language', options.language);
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
  return data.results.slice(0, 25).map(r => ({
    title: r.title,
    url: r.url,
    snippet: (r.content || '').slice(0, 500),
    publishedAt: r.publishedDate,
  }));
}

// ─── Brave Search ──────────────────────────────────────────────────────────────────

async function searchBrave(query: string, apiKey: string): Promise<SearchResult[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  });
  if (!res.ok) throw new Error(`Brave returned ${res.status}`);
  const data = await res.json() as {
    web?: { results?: Array<{ title: string; url: string; description: string; published_date?: string }> };
  };
  if (!data.web?.results?.length) return [];
  return data.web.results.slice(0, 8).map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.description || '',
    publishedAt: r.published_date,
  }));
}

// ─── Tavily ────────────────────────────────────────────────────────────────────────

async function searchTavily(query: string, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      api_key: apiKey,
      search_depth: 'basic',
      max_results: 8,
      include_raw_content: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily returned ${res.status}`);
  const data = await res.json() as {
    results?: Array<{ title: string; url: string; content: string; published_date?: string }>;
  };
  if (!data.results?.length) return [];
  return data.results.slice(0, 8).map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.content || '',
    publishedAt: r.published_date,
  }));
}

// ─── Jina Search ───────────────────────────────────────────────────────────────────

async function searchJina(query: string): Promise<SearchResult[]> {
  const base = 'https://s.jina.ai';
  const url = `${base}/${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'SupplyChainCortex/2.9',
    },
  });
  if (!res.ok) throw new Error(`Jina Search returned ${res.status}`);
  const data = await res.json() as {
    data?: Array<{ title: string; url: string; content: string; publishedDate?: string }>;
  };
  if (!data.data?.length) return [];
  return data.data.slice(0, 8).map(r => ({
    title: r.title,
    url: r.url,
    snippet: (r.content || '').slice(0, 500),
    publishedAt: r.publishedDate,
  }));
}

// ─── HTML Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&rsquo;/g, "'").replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"').replace(/&ldquo;/g, '"')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–');
}

// ─── DuckDuckGo HTML Search — free, no API key, no Docker ──────────────────────────

async function searchDuckDuckGoHTML(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Parse DDG HTML results: <a rel="nofollow" class="result__a" href="...">title</a>
    // and <a class="result__snippet">snippet</a>
    const results: SearchResult[] = [];
    // Match result links with titles
    const linkRegex = /<a[^>]*rel="nofollow"[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    const links: Array<{ url: string; title: string }> = [];
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      const url = m[1];
      // Skip internal DDG links
      if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
        links.push({ url: decodeEntities(url), title: decodeEntities(stripHtml(m[2]).trim()) });
      }
    }

    const snippets: string[] = [];
    while ((m = snippetRegex.exec(html)) !== null) {
      snippets.push(decodeEntities(stripHtml(m[1]).trim()));
    }

    for (let i = 0; i < Math.min(links.length, 8); i++) {
      if (links[i].title) {
        results.push({
          title: links[i].title,
          url: links[i].url,
          snippet: snippets[i] || '',
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// ─── Wikipedia API — free, unlimited, excellent for knowledge questions ────────────

async function searchWikipedia(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=10&origin=*`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'SupplyChainCortex/2.9' },
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      query?: { search?: Array<{ title: string; snippet: string; timestamp: string }> };
    };
    if (!data.query?.search?.length) return [];
    return data.query.search.slice(0, 10).map(r => ({
      title: r.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
      snippet: stripHtml(r.snippet || ''),
      publishedAt: r.timestamp ? r.timestamp.replace(/T.*/, '') : undefined,
    }));
  } catch {
    return [];
  }
}

// ─── Public SearXNG Pool — multi-instance parallel racing for redundancy ────────────

let _publicInstanceCache: string[] = [];
let _publicInstanceCacheTs = 0;
const PUBLIC_INSTANCE_CACHE_TTL = 3600_000; // 1 hour

async function getPublicSearXNGInstances(): Promise<string[]> {
  if (Date.now() - _publicInstanceCacheTs < PUBLIC_INSTANCE_CACHE_TTL && _publicInstanceCache.length > 0) {
    return _publicInstanceCache;
  }
  try {
    const res = await fetch('https://searx.space/data/instances.json', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return _publicInstanceCache;
    const data = await res.json() as {
      instances?: Record<string, {
        network_type?: string;
        timing?: { search?: { all?: { median?: number } } };
        uptime?: number;
        generator?: string;
      }>;
    };
    if (!data.instances) return _publicInstanceCache;
    const healthy: Array<{ url: string; latency: number }> = [];
    for (const [url, info] of Object.entries(data.instances)) {
      if (info.network_type !== 'normal') continue;
      const uptime = info.uptime ?? 0;
      if (uptime < 95) continue;
      const latency = info.timing?.search?.all?.median ?? 999;
      healthy.push({ url: `https://${url}`, latency });
    }
    healthy.sort((a, b) => a.latency - b.latency);
    _publicInstanceCache = healthy.slice(0, 20).map(h => h.url);
    _publicInstanceCacheTs = Date.now();
    return _publicInstanceCache;
  } catch {
    return _publicInstanceCache;
  }
}

async function searchPublicSearXNGPool(query: string, poolSize = 3): Promise<SearchResult[]> {
  try {
    const instances = await getPublicSearXNGInstances();
    if (instances.length === 0) return [];

    // Randomly pick poolSize instances and race them in parallel
    const shuffled = [...instances].sort(() => Math.random() - 0.5).slice(0, poolSize);

    const results = await Promise.allSettled(
      shuffled.map(async (baseUrl) => {
        const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json&categories=general&safesearch=2&language=zh-CN`;
        const res = await fetch(url, {
          signal: AbortSignal.timeout(6000),
          headers: { 'Accept': 'application/json', 'User-Agent': 'SupplyChainCortex/2.9' },
        });
        if (!res.ok) return [] as SearchResult[];
        const data = await res.json() as {
          results?: Array<{ title: string; url: string; content: string; publishedDate?: string }>;
        };
        if (!data.results?.length) return [] as SearchResult[];
        return data.results.slice(0, 10).map(r => ({
          title: stripHtml(r.title || ''),
          url: r.url,
          snippet: (r.content || '').slice(0, 500),
          publishedAt: r.publishedDate,
        }));
      })
    );

    const merged: SearchResult[] = [];
    const seen = new Set<string>();
    for (const r of results) {
      if (r.status === 'fulfilled') {
        for (const item of r.value) {
          if (!seen.has(item.url)) {
            merged.push(item);
            seen.add(item.url);
          }
        }
      }
    }
    return merged;
  } catch {
    return [];
  }
}

// ─── Jina Reader — shared content extraction ───────────────────────────────────────

async function fetchPageContent(url: string): Promise<string | undefined> {
  if (!isSafeUrl(url)) return undefined;
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'Accept': 'text/markdown',
        'User-Agent': 'SupplyChainCortex/2.9',
      },
    });
    if (!res.ok) return undefined;
    const text = await res.text();
    return text.slice(0, 6000); // Cap at 6KB to avoid token overflow
  } catch {
    return undefined;
  }
}

// ─── Supplementary Sources ─────────────────────────────────────────────────────────

async function searchReddit(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=8&sort=relevance`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'SupplyChainCortex/2.9' },
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      data?: { children?: Array<{ data: { title: string; permalink: string; selftext: string; created_utc: number } }> };
    };
    if (!data.data?.children?.length) return [];
    return data.data.children.slice(0, 8).map(c => c.data).map(r => ({
      title: r.title,
      url: `https://www.reddit.com${r.permalink}`,
      snippet: (r.selftext || '').slice(0, 500),
      publishedAt: new Date(r.created_utc * 1000).toISOString(),
    }));
  } catch (err) {
    console.warn('[web-search] Reddit search failed:', (err as Error).message || 'Unknown error');
    return [];
  }
}

async function searchGitHub(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=8`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json', 'User-Agent': 'SupplyChainCortex/2.9' },
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      items?: Array<{ full_name: string; html_url: string; description: string; updated_at: string; stargazers_count: number }>;
    };
    if (!data.items?.length) return [];
    return data.items.slice(0, 8).map(r => ({
      title: `${r.full_name} (${r.stargazers_count} stars)`,
      url: r.html_url,
      snippet: r.description || '',
      publishedAt: r.updated_at,
    }));
  } catch (err) {
    console.warn('[web-search] GitHub search failed:', (err as Error).message || 'Unknown error');
    return [];
  }
}

async function searchHackerNews(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=8`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'SupplyChainCortex/2.9' },
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      hits?: Array<{ title: string; url?: string; objectID: string; points: number; created_at: string; comment_text?: string }>;
    };
    if (!data.hits?.length) return [];
    return data.hits.slice(0, 8).map(r => ({
      title: `${r.title} (${r.points} pts)`,
      url: r.url || `https://news.ycombinator.com/item?id=${r.objectID}`,
      snippet: r.comment_text || '',
      publishedAt: r.created_at,
    }));
  } catch (err) {
    console.warn('[web-search] Hacker News search failed:', (err as Error).message || 'Unknown error');
    return [];
  }
}

// ─── Provider Router ───────────────────────────────────────────────────────────────

async function searchByProvider(query: string, config: ProviderConfig): Promise<{ results: SearchResult[]; source: string }> {
  const { provider, baseUrl, apiKey } = config;

  switch (provider) {
    case 'searxng':
      return { results: await searchSearXNG(query, baseUrl || 'http://localhost:8081'), source: 'SearXNG' };
    case 'brave': {
      if (!apiKey) throw new Error('BRAVE_API_KEY is required for Brave provider. Set it in .env or switch to SEARCH_PROVIDER=searxng');
      return { results: await searchBrave(query, apiKey), source: 'Brave Search' };
    }
    case 'tavily': {
      if (!apiKey) throw new Error('TAVILY_API_KEY is required for Tavily provider. Set it in .env or switch to SEARCH_PROVIDER=searxng');
      return { results: await searchTavily(query, apiKey), source: 'Tavily' };
    }
    case 'jina':
      return { results: await searchJina(query), source: 'Jina Search' };
    case 'ddg':
      return { results: await searchDuckDuckGoHTML(query), source: 'DuckDuckGo' };
    default:
      // Fallback: try DDG (no setup needed)
      return { results: await searchDuckDuckGoHTML(query), source: 'DuckDuckGo (fallback)' };
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────────

/**
 * Web search with multi-provider support + fallback chain.
 *
 * Priority:
 *   1. Primary provider (SEARCH_PROVIDER env var or SearXNG)
 *   2. Reddit (free, no key)
 *   3. GitHub (free, no key)
 *   4. HackerNews (free, no key)
 */
/**
 * Run all search tiers with a given query.
 */
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

  // Tier 2: Reddit
  try {
    const reddit = await searchReddit(query);
    if (reddit.length > 0) return { results: reddit, source: 'Reddit', diagnostics };
  } catch (err) {
    const msg = (err as Error).message || 'Unknown error';
    console.warn('[web-search] Reddit search failed:', msg);
    diagnostics.failedProviders.push({ provider: 'Reddit', error: msg });
  }

  // Tier 3: GitHub
  try {
    const github = await searchGitHub(query);
    if (github.length > 0) return { results: github, source: 'GitHub', diagnostics };
  } catch (err) {
    const msg = (err as Error).message || 'Unknown error';
    console.warn('[web-search] GitHub search failed:', msg);
    diagnostics.failedProviders.push({ provider: 'GitHub', error: msg });
  }

  // Tier 4: Hacker News
  try {
    const hn = await searchHackerNews(query);
    if (hn.length > 0) return { results: hn, source: 'Hacker News', diagnostics };
  } catch (err) {
    const msg = (err as Error).message || 'Unknown error';
    console.warn('[web-search] Hacker News search failed:', msg);
    diagnostics.failedProviders.push({ provider: 'Hacker News', error: msg });
  }

  return { results: [], source: 'none', diagnostics };
}

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

/**
 * Deep search: primary provider + Jina Reader for full page content.
 * Fetches up to 3 top results' full content via Jina Reader concurrently.
 */
export async function deepSearch(query: string): Promise<{ results: SearchResult[]; source: string; diagnostics?: SearchDiagnostics }> {
  const { results, source, diagnostics } = await webSearch(query);
  if (results.length === 0) return { results: [], source, diagnostics };

  // Fetch full content for top 3 results concurrently
  const enriched = await Promise.all(
    results.slice(0, 3).map(async (r) => {
      const content = await fetchPageContent(r.url);
      return { ...r, content };
    })
  );

  // Merge: enriched first, then rest
  return {
    results: [...enriched, ...results.slice(3)],
    source: `${source} + Jina Reader`,
    diagnostics,
  };
}

/**
 * Search supplementary sources only (no primary provider).
 * Used when the user specifically wants community/developer content.
 */
export async function searchSupplementary(query: string): Promise<{ reddit: SearchResult[]; github: SearchResult[]; hn: SearchResult[]; diagnostics: SearchDiagnostics }> {
  const q = sanitizeQuery(query);
  const diagnostics: SearchDiagnostics = { failedProviders: [] };

  const [redditRes, githubRes, hnRes] = await Promise.allSettled([
    searchReddit(q),
    searchGitHub(q),
    searchHackerNews(q),
  ]);

  const reddit = redditRes.status === 'fulfilled' ? redditRes.value : (() => { diagnostics.failedProviders.push({ provider: 'Reddit', error: redditRes.reason?.message || 'Unknown' }); return []; })();
  const github = githubRes.status === 'fulfilled' ? githubRes.value : (() => { diagnostics.failedProviders.push({ provider: 'GitHub', error: githubRes.reason?.message || 'Unknown' }); return []; })();
  const hn = hnRes.status === 'fulfilled' ? hnRes.value : (() => { diagnostics.failedProviders.push({ provider: 'Hacker News', error: hnRes.reason?.message || 'Unknown' }); return []; })();

  return { reddit, github, hn, diagnostics };
}

/**
 * Format search results as context for LLM prompt injection.
 */
export function formatSearchContext(results: SearchResult[], maxResults = 6): string {
  if (results.length === 0) {
    const provider = getConfig().provider;
    if (provider === 'searxng') {
      return `未找到搜索结果。\n\n💡 SearXNG 容器可能未启动。运行 \`docker compose up -d searxng\` 即可。\n也可用内置MCP工具：query_commodities(大宗商品)、query_scfis(运价)、query_carbon_price(碳价)、query_cpsc_recalls(召回)、query_tariff(关税)、query_exchange_rates(汇率)`;
    }
    return `未找到搜索结果（当前 provider: ${provider}）。建议使用专用MCP工具查询具体数据。`;
  }

  // Sanitize external content before injecting into LLM context
  const sanitizedResults = results.map(r => ({
    ...r,
    title: sanitizeForLLM(r.title),
    snippet: sanitizeForLLM(r.snippet),
    content: r.content ? sanitizeForLLM(r.content) : undefined,
  }));

  // Filter out low-quality domains
  const LOW_QUALITY_DOMAINS = ['reddit.com', 'forum.adrenaline.com.br', 'quora.com', 'answers.com'];
  const filtered = sanitizedResults.filter(r => {
    try {
      const host = new URL(r.url).hostname.replace('www.', '');
      return !LOW_QUALITY_DOMAINS.some(d => host.includes(d));
    } catch { return true; }
  });

  // Tag results with authority level + freshness
  const now = Date.now();
  const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
  const STALE_MS = 90 * 24 * 60 * 60 * 1000;
  const HIGH_AUTHORITY = ['wikipedia.org', '.gov', 'who.int', 'un.org', 'ustr.gov', 'cpsc.gov',
    'reuters.com', 'bloomberg.com', 'bbc.com', 'ft.com', 'wsj.com', 'chinabriefing.com',
    'scmp.com', 'nrf.com', 'freightos.com', 'project44.com'];

  // Score and sort by freshness × authority
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

/**
 * Return the currently configured provider name.
 */
export function getSearchProvider(): SearchProvider {
  return getConfig().provider;
}

/**
 * Return all available providers with their status.
 */
export function getAvailableProviders(): Array<{ name: SearchProvider; available: boolean; reason: string }> {
  const config = getConfig();
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

  // Only news/policy queries benefit from time_range filtering.
  // Price forecasts, technical queries, and general search return better
  // results without time_range because SearXNG's date filtering can
  // incorrectly exclude relevant results.
  if (/关税|贸易|政策|法规|制裁|限制|宣布|实施/.test(query) ||
      /tariff|trade|policy|sanction|regulation|announce/.test(q)) {
    return {
      categories: 'general,news',
      time_range: 'month',
      engines: hasChinese ? cnEngines : enEngines,
    };
  }

  if (/价格|汇率|铜|铝|钢|碳|运价|指数|趋势|分析/.test(query) ||
      /price|rate|index|trend|analysis|forecast/.test(q)) {
    return {
      categories: 'general',
      engines: hasChinese ? cnEngines : enEngines,
    };
  }

  if (/技术|系统|架构|代码|API|数据库|算法/.test(query) ||
      /technical|system|architecture|code|api|database|algorithm/.test(q)) {
    return {
      categories: 'general,it',
      engines: 'google,github,duckduckgo,qwant',
    };
  }

  return {
    categories: 'general',
    engines: hasChinese ? cnEngines : enEngines,
  };
}

/** Minimum results we aim for after filtering. If below, adaptive recall kicks in. */
const TARGET_MIN_RESULTS = 10;

async function fetchFromSource(
  query: string,
  config: ProviderConfig,
  searchOptions: SearXNGOptions,
): Promise<{ results: SearchResult[]; source: string }> {
  if (config.provider === 'searxng') {
    const baseUrl = config.baseUrl || 'http://localhost:8081';
    const results = await searchSearXNG(query, baseUrl, searchOptions);
    return { results, source: 'SearXNG' };
  }
  return searchByProvider(query, config);
}

/** Merge results from multiple queries, deduplicating by URL. */
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

  // Step 1: Inject context from conversation history
  const contextQuery = injectContext(safeQuery, conversationHistory);

  // Step 2: Rewrite into multiple variant queries
  const rewrittenQueries = rewriteQuery(contextQuery);
  const primaryQuery = rewrittenQueries[0] || contextQuery;

  // Step 3: Classify query for optimal SearXNG params
  const searchOptions = classifyQueryForSearch(primaryQuery);

  const config = getConfig();

  // ── Cache check ────────────────────────────────────────────────────────
  const cacheKey = getCacheKey(primaryQuery, config,
    `${searchOptions.categories || ''}|${searchOptions.time_range || ''}|${searchOptions.engines || ''}`);
  const cached = cacheGet<QualitySearchResult>(cacheKey);
  if (cached) return cached;

  const allResults: SearchResult[] = [];
  const sources: string[] = [];

  // ── Step 4: Multi-source parallel racing (all free, all unlimited) ──────────

  // Fire all 4 sources simultaneously — fastest wins, all results merged
  const parallelSources: Array<Promise<{ results: SearchResult[]; source: string }>> = [];

  // 4a: Self-hosted SearXNG (full control, all engines)
  parallelSources.push(
    fetchFromSource(primaryQuery, config, searchOptions)
      .catch(err => {
        const msg = (err as Error).message || 'Unknown error';
        console.warn('[web-search-quality] SearXNG failed:', msg.replace(/key[=:][^\s&]{8,}/gi, 'key=***'));
        return { results: [] as SearchResult[], source: 'SearXNG' };
      })
  );

  // 4b: DDG HTML (lexical diversity, free unlimited)
  parallelSources.push(
    searchDuckDuckGoHTML(primaryQuery).then(r => ({ results: r, source: 'DDG' }))
  );

  // 4c: Wikipedia API (knowledge excellence, free unlimited)
  parallelSources.push(
    searchWikipedia(primaryQuery).then(r => ({ results: r, source: 'Wikipedia' }))
  );

  // 4d: Public SearXNG pool (redundancy, different engine configs, 3 instances raced)
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

  // 4c: Multi-query variant expansion (up to 2 additional queries in parallel)
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

  // ── Step 5: Adaptive recall loop ──────────────────────────────────────────

  let iteration = 0;
  const MAX_ITERATIONS = 2;

  while (iteration < MAX_ITERATIONS) {
    // Guard and rerank the current pool
    const guardTargetLang = /[一-鿿]/.test(primaryQuery) ? 'zh' : 'auto';
    const guarded = guardResults(allResults, primaryQuery, guardTargetLang as 'zh' | 'en' | 'auto');
    let pool = guarded.passed ? guarded.results : allResults;
    pool = rerankResults(pool, primaryQuery);

    if (pool.length >= TARGET_MIN_RESULTS || iteration === MAX_ITERATIONS - 1) {
      // Enough results or out of iterations — finalize
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

    // Not enough results — broaden and refetch
    iteration++;
    const broadenedOptions: SearXNGOptions = {
      ...searchOptions,
      categories: 'general', // Drop category restrictions
      time_range: undefined,    // Drop time range filter
      engines: undefined,       // Use all configured engines
    };

    try {
      const broadResults = await fetchFromSource(primaryQuery, config, broadenedOptions);
      if (broadResults.results.length > 0) {
        mergeResults(allResults, broadResults.results);
        sources.push(broadResults.source + '(broad)');
      }
    } catch { /* continue */ }

    // Also try a broadened DDG search
    try {
      const broadDDG = await searchDuckDuckGoHTML(primaryQuery);
      if (broadDDG.length > 0) mergeResults(allResults, broadDDG);
    } catch { /* continue */ }
  }

  // Should never reach here, but final fallback
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
