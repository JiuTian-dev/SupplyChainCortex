/**
 * Web Search Service — multi-source free web search.
 *
 * Priority (no API keys required):
 *   1. Wikipedia API — factual/encyclopedic queries (always works)
 *   2. Google News RSS — current events (free, no key)
 *   3. DuckDuckGo Lite — fallback (may be blocked from some regions)
 *
 * IMPORTANT: For commodity prices, freight rates, carbon prices, recalls —
 * use the dedicated MCP tools (query_commodities, query_scfis, etc.) instead
 * of web search. Those have direct market data access. Web search is for
 * news, policy changes, and general information.
 */

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ─── Wikipedia API ──────────────────────────────────────────────────────────────

async function searchWikipedia(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=8&origin=*`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'SupplyChainCortex/2.9' },
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      query?: { search?: Array<{ title: string; snippet: string; pageid: number }> };
    };
    return (data.query?.search || []).map(r => ({
      title: r.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
      snippet: stripHtml(r.snippet),
    }));
  } catch {
    return [];
  }
}

// ─── Google News RSS ─────────────────────────────────────────────────────────────

async function searchGoogleNews(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const results: SearchResult[] = [];
    const items = xml.split('<item>').slice(1);
    for (const item of items.slice(0, 8)) {
      const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
      const linkMatch = item.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/);
      const descMatch = item.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/);

      if (titleMatch) {
        results.push({
          title: decodeEntities(titleMatch[1]),
          url: linkMatch?.[1] || '',
          snippet: descMatch ? stripHtml(decodeEntities(descMatch[1])).slice(0, 300) : '',
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// ─── DuckDuckGo Lite (fallback) ──────────────────────────────────────────────────

async function searchDuckDuckGoLite(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
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

    // Parse Lite results: <a rel="nofollow" href="...">title</a><span class="result-snippet">snippet</span>
    const results: SearchResult[] = [];
    const linkRegex = /<a[^>]*rel="nofollow"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    const snippetRegex = /<span[^>]*class="result-snippet"[^>]*>([^<]+)<\/span>/gi;

    const links: Array<{ url: string; title: string }> = [];
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      const url = m[1];
      if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
        links.push({ url: decodeEntities(url), title: decodeEntities(m[2].trim()) });
      }
    }

    const snippets: string[] = [];
    while ((m = snippetRegex.exec(html)) !== null) {
      snippets.push(decodeEntities(m[1].trim()));
    }

    for (let i = 0; i < Math.min(links.length, 8); i++) {
      results.push({
        title: links[i].title,
        url: links[i].url,
        snippet: snippets[i] || '',
      });
    }
    return results;
  } catch {
    return [];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

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

// ─── Main Export ─────────────────────────────────────────────────────────────────

export async function webSearch(query: string): Promise<{ results: SearchResult[]; source: string }> {
  // Strategy 1: Wikipedia (for factual queries)
  const wiki = await searchWikipedia(query);
  if (wiki.length >= 3) return { results: wiki, source: 'Wikipedia' };

  // Strategy 2: Google News RSS (for current events)
  const news = await searchGoogleNews(query);
  if (news.length > 0) return { results: news, source: 'Google News' };

  // Strategy 3: DuckDuckGo Lite
  const ddg = await searchDuckDuckGoLite(query);
  if (ddg.length > 0) return { results: ddg, source: 'DuckDuckGo Lite' };

  return { results: [], source: 'none' };
}

/**
 * Format search results as context for LLM prompt
 */
export function formatSearchContext(results: SearchResult[]): string {
  if (results.length === 0) return '（未找到搜索结果。建议使用专用MCP工具查询具体数据：query_commodities(大宗商品)、query_scfis(运价)、query_carbon_price(碳价)、query_cpsc_recalls(召回)）';
  return results.map((r, i) =>
    `[${i + 1}] ${r.title}\n${r.snippet}\n${r.url}`
  ).join('\n\n');
}
