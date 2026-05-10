/**
 * Web Search Service — free web search with multiple fallback providers.
 *
 * Priority:
 *   1. DuckDuckGo HTML search (free, no API key, scrapes results)
 *   2. SearXNG public instances (free, no key)
 *
 * Used by the ChatAgent when web search mode is enabled.
 */

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ─── DuckDuckGo HTML Scrape ─────────────────────────────────────────────────────

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!res.ok) return [];
  const html = await res.text();

  // Parse result blocks
  const results: SearchResult[] = [];
  const blocks = html.split(/class="result"/gi).slice(1);
  for (const block of blocks.slice(0, 8)) {
    const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</i);
    const urlMatch = block.match(/class="result__url"[^>]*>([^<]+)</i) || block.match(/href="([^"]+)"/i);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([^<]+)</i);

    if (titleMatch) {
      results.push({
        title: decodeEntities(titleMatch[1].trim()),
        url: urlMatch ? decodeEntities(urlMatch[1].trim()) : '',
        snippet: snippetMatch ? decodeEntities(snippetMatch[1].trim()) : '',
      });
    }
  }
  return results;
}

// ─── SearXNG Public Instance ────────────────────────────────────────────────────

async function searchSearXNG(query: string): Promise<SearchResult[]> {
  const instances = [
    'https://search.sapti.me',
    'https://searx.be',
    'https://search.bus-hit.me',
  ];
  for (const base of instances) {
    try {
      const url = `${base}/search?q=${encodeURIComponent(query)}&format=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json() as { results?: Array<{ title: string; url: string; content: string }> };
      if (data.results?.length) {
        return data.results.slice(0, 8).map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.content?.slice(0, 300),
        }));
      }
    } catch { continue; }
  }
  return [];
}

// ─── Utility ─────────────────────────────────────────────────────────────────────

function decodeEntities(text: string): string {
  return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// ─── Main Export ─────────────────────────────────────────────────────────────────

export async function webSearch(query: string): Promise<{ results: SearchResult[]; source: string }> {
  // Priority 1: DuckDuckGo
  const ddg = await searchDuckDuckGo(query);
  if (ddg.length > 0) return { results: ddg, source: 'DuckDuckGo' };

  // Priority 2: SearXNG public instances
  const searx = await searchSearXNG(query);
  if (searx.length > 0) return { results: searx, source: 'SearXNG' };

  return { results: [], source: 'none' };
}

/**
 * Format search results as context for LLM prompt
 */
export function formatSearchContext(results: SearchResult[]): string {
  if (results.length === 0) return '（无搜索结果）';
  return results.map((r, i) =>
    `[${i + 1}] ${r.title}\n${r.snippet}\n${r.url}`
  ).join('\n\n');
}
