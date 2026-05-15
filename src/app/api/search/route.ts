/**
 * Unified Search API — aggregates web + MCP sources.
 *
 * POST /api/search  { query, mode?: "fast"|"deep", language?: "auto"|"zh"|"en", includeSupplementary?: boolean }
 *   For RAG results, call /api/rag separately.
 * GET  /api/search?action=providers  → list available search providers
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { webSearch, deepSearch, searchSupplementary, getAvailableProviders, type SearchResult } from '@/lib/services/web-search.service';

export const dynamic = 'force-dynamic';

// ─── Helpers ───────────────────────────────────────────────────────────────────────

function normalizeQuery(query: string, language: string): string {
  if (language === 'en') return query;
  // For Chinese queries, append context keywords to improve results
  if (/[一-鿿]/.test(query) && !/(supply chain|tariff|freight|logistics|commodity|exchange rate|port|carbon)/i.test(query)) {
    return `${query} supply chain`;
  }
  return query;
}

// ─── GET Handler — list providers ──────────────────────────────────────────────────

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'providers') {
    const providers = getAvailableProviders();
    return NextResponse.json({ providers });
  }

  return NextResponse.json({
    message: 'Unified Search API',
    endpoints: {
      'POST /api/search': 'Execute search { query, mode: "fast"|"deep", language: "auto"|"zh"|"en", includeSupplementary: boolean }. For RAG, call /api/rag separately.',
      'GET /api/search?action=providers': 'List available search providers',
    },
  });
}

// ─── POST Handler ──────────────────────────────────────────────────────────────────

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const raw = await request.text();
  const body = JSON.parse(raw) as {
    query?: string;
    mode?: 'fast' | 'deep';
    language?: 'auto' | 'zh' | 'en';
    includeSupplementary?: boolean;
  };

  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ success: false, error: 'Please provide a search query' }, { status: 400 });
  }

  // Auth check (same level as chat API)
  await optionalRequireAuth();

  const mode = body.mode || 'fast';
  const language = body.language || 'auto';
  const includeSupplementary = body.includeSupplementary === true;

  const q = normalizeQuery(query, language);
  const startTime = Date.now();

  // ─── Execute searches in parallel ──────────────────────────────────────────
  const jobs: Promise<{ key: string; results: SearchResult[]; source: string }>[] = [];

  // Primary search
  if (mode === 'deep') {
    jobs.push(
      deepSearch(q).then(r => ({ key: 'web', results: r.results, source: r.source }))
    );
  } else {
    jobs.push(
      webSearch(q).then(r => ({ key: 'web', results: r.results, source: r.source }))
    );
  }

  // Supplementary sources
  if (includeSupplementary) {
    jobs.push((async () => {
      try {
        const { reddit, github, hn } = await searchSupplementary(q);
        const all = [...reddit, ...github, ...hn];
        return { key: 'supplementary', source: 'Reddit+GitHub+HN', results: all };
      } catch { return { key: 'supplementary', source: 'Supplementary', results: [] as SearchResult[] }; }
    })());
  }

  const jobResults = await Promise.all(jobs);
  const elapsed = Date.now() - startTime;

  // ─── Build response ─────────────────────────────────────────────────────────
  const aggregated: Record<string, { source: string; count: number; results: SearchResult[] }> = {};
  for (const { key, results, source } of jobResults) {
    aggregated[key] = { source, count: results.length, results: results.slice(0, 8) };
  }

  const totalResults = Object.values(aggregated).reduce((s, g) => s + g.count, 0);

  return NextResponse.json({
    success: true,
    query,
    mode,
    elapsed: `${elapsed}ms`,
    totalResults,
    sources: aggregated,
  });
}

// ─── Export ────────────────────────────────────────────────────────────────────────

export const GET = withApiRateLimit(withErrorHandler(handleGet));
export const POST = withApiRateLimit(withErrorHandler(handlePost));
