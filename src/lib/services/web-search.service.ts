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
  const termMap: Record<string, string> = {
    '关税': 'tariff', '贸易战': 'trade war', '中美': 'US China',
    '供应链': 'supply chain', '小家电': 'small appliance',
    '运价': 'freight rate', '运费': 'shipping cost', '集装箱': 'container',
    '铜价': 'copper price', '铜': 'copper', '铝价': 'aluminum price', '铝': 'aluminum',
    '钢价': 'steel price', '螺纹钢': 'steel rebar', '碳价': 'carbon price',
    '碳关税': 'CBAM carbon', '召回': 'recall CPSC', '港口': 'port congestion',
    '汇率': 'exchange rate', '人民币': 'CNY USD', '美元': 'USD',
    '出口': 'export', '进口': 'import', '政策': 'policy regulation',
    '合规': 'compliance', '认证': 'certification', '库存': 'inventory',
    '物流': 'logistics', '供应商': 'supplier', '销售': 'sales',
    '成本': 'cost', '风险': 'risk', '新闻': 'news', '最新': 'latest',
    '动态': 'update', '变化': 'change', '2026': '2026', '2025': '2025',
  };
  let result = query;
  for (const [zh, en] of Object.entries(termMap)) {
    result = result.replace(new RegExp(zh, 'g'), en);
  }
  // Remove remaining Chinese characters and clean up
  result = result.replace(/[一-鿿]+/g, ' ').replace(/\s+/g, ' ').trim();
  return result || query.replace(/[一-鿿]/g, '').trim() || 'supply chain';
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
  } catch { return []; }
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
  } catch { return []; }
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
  } catch { return []; }
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
async function tryAllSources(query: string, config: ProviderConfig): Promise<{ results: SearchResult[]; source: string }> {
  // Tier 1: Primary provider
  try {
    const result = await searchByProvider(query, config);
    if (result.results.length > 0) return result;
  } catch (err) {
    const msg = (err as Error).message || 'Unknown error';
    console.warn('[web-search] Primary provider failed:', msg.replace(/key[=:][^\s&]{8,}/gi, 'key=***'));
  }

  // Tier 2: Reddit
  try {
    const reddit = await searchReddit(query);
    if (reddit.length > 0) return { results: reddit, source: 'Reddit' };
  } catch { /* continue */ }

  // Tier 3: GitHub
  try {
    const github = await searchGitHub(query);
    if (github.length > 0) return { results: github, source: 'GitHub' };
  } catch { /* continue */ }

  // Tier 4: Hacker News
  try {
    const hn = await searchHackerNews(query);
    if (hn.length > 0) return { results: hn, source: 'Hacker News' };
  } catch { /* continue */ }

  return { results: [], source: 'none' };
}

export async function webSearch(query: string): Promise<{ results: SearchResult[]; source: string }> {
  const q = sanitizeQuery(query);
  if (!q) return { results: [], source: 'none' };

  const config = getConfig();

  // First attempt with original query
  const firstTry = await tryAllSources(q, config);
  if (firstTry.results.length > 0) return firstTry;

  // If query contains Chinese and got 0 results, retry with English keywords
  if (hasChinese(q)) {
    const enKeywords = extractEnglishKeywords(q);
    if (enKeywords && enKeywords !== q) {
      console.log('[web-search] Chinese query got 0 results, retrying with:', enKeywords);
      const retry = await tryAllSources(enKeywords, config);
      if (retry.results.length > 0) return retry;
    }
  }

  return { results: [], source: 'none' };
}

/**
 * Deep search: primary provider + Jina Reader for full page content.
 * Fetches up to 3 top results' full content via Jina Reader concurrently.
 */
export async function deepSearch(query: string): Promise<{ results: SearchResult[]; source: string }> {
  const { results, source } = await webSearch(query);
  if (results.length === 0) return { results: [], source };

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
  };
}

/**
 * Search supplementary sources only (no primary provider).
 * Used when the user specifically wants community/developer content.
 */
export async function searchSupplementary(query: string): Promise<{ reddit: SearchResult[]; github: SearchResult[]; hn: SearchResult[] }> {
  const q = sanitizeQuery(query);
  const [reddit, github, hn] = await Promise.all([
    searchReddit(q),
    searchGitHub(q),
    searchHackerNews(q),
  ]);
  return { reddit, github, hn };
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

  // Filter out low-quality domains
  const LOW_QUALITY_DOMAINS = ['reddit.com', 'forum.adrenaline.com.br', 'quora.com', 'answers.com'];
  const filtered = results.filter(r => {
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
  time_range: string;
  engines: string;
} {
  const q = query.toLowerCase();
  const hasChinese = /[一-鿿]/.test(query);

  if (/关税|贸易|政策|法规|制裁|限制|宣布|实施/.test(query) ||
      /tariff|trade|policy|sanction|regulation|announce/.test(q)) {
    return {
      categories: 'general,news',
      time_range: 'month',
      engines: hasChinese ? 'google,bing,duckduckgo' : 'google,bing,duckduckgo,wikipedia',
    };
  }

  if (/价格|汇率|铜|铝|钢|碳|运价|指数|趋势|分析/.test(query) ||
      /price|rate|index|trend|analysis|forecast/.test(q)) {
    return {
      categories: 'general',
      time_range: 'year',
      engines: hasChinese ? 'google,bing,duckduckgo' : 'google,bing,duckduckgo,wikipedia',
    };
  }

  if (/技术|系统|架构|代码|API|数据库|算法/.test(query) ||
      /technical|system|architecture|code|api|database|algorithm/.test(q)) {
    return {
      categories: 'general,it',
      time_range: 'year',
      engines: 'google,github,duckduckgo,qwant',
    };
  }

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
  const safeQuery = sanitizeQuery(query);

  // Step 1: Inject context from conversation history
  const contextQuery = injectContext(safeQuery, conversationHistory);

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
