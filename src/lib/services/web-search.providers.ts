import type { SearchResult, SearchProvider, ProviderConfig } from './web-search.service';

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

// ─── Types ────────────────────────────────────────────────────────────────────────

export interface SearXNGOptions {
  categories?: string;
  time_range?: string;
  language?: string;
  safesearch?: number;
  engines?: string;
}

// ─── SearXNG ──────────────────────────────────────────────────────────────────────

export function buildSearXNGUrl(baseUrl: string, query: string, options: SearXNGOptions = {}): string {
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

export async function searchSearXNG(
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

export async function searchBrave(query: string, apiKey: string): Promise<SearchResult[]> {
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

export async function searchTavily(query: string, apiKey: string): Promise<SearchResult[]> {
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

export async function searchJina(query: string): Promise<SearchResult[]> {
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

// ─── DuckDuckGo HTML ───────────────────────────────────────────────────────────────

export async function searchDuckDuckGoHTML(query: string): Promise<SearchResult[]> {
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

    const results: SearchResult[] = [];
    const linkRegex = /<a[^>]*rel="nofollow"[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    const links: Array<{ url: string; title: string }> = [];
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      const href = m[1];
      if (href.startsWith('http') && !href.includes('duckduckgo.com')) {
        links.push({ url: decodeEntities(href), title: decodeEntities(stripHtml(m[2]).trim()) });
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

// ─── Wikipedia ─────────────────────────────────────────────────────────────────────

export async function searchWikipedia(query: string): Promise<SearchResult[]> {
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

// ─── Public SearXNG Pool ────────────────────────────────────────────────────────────

let _publicInstanceCache: string[] = [];
let _publicInstanceCacheTs = 0;
const PUBLIC_INSTANCE_CACHE_TTL = 3600_000;

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

export async function searchPublicSearXNGPool(query: string, poolSize = 3): Promise<SearchResult[]> {
  try {
    const instances = await getPublicSearXNGInstances();
    if (instances.length === 0) return [];

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

// ─── Jina Reader ───────────────────────────────────────────────────────────────────

export async function fetchPageContent(url: string): Promise<string | undefined> {
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
    return text.slice(0, 6000);
  } catch {
    return undefined;
  }
}

// ─── Supplementary Sources ─────────────────────────────────────────────────────────

export async function searchReddit(query: string): Promise<SearchResult[]> {
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

export async function searchGitHub(query: string): Promise<SearchResult[]> {
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

export async function searchHackerNews(query: string): Promise<SearchResult[]> {
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

export async function searchByProvider(query: string, config: ProviderConfig): Promise<{ results: SearchResult[]; source: string }> {
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
      return { results: await searchDuckDuckGoHTML(query), source: 'DuckDuckGo (fallback)' };
  }
}
