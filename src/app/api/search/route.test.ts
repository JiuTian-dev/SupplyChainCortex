import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/api-protection', () => ({
  withApiRateLimit: (handler: unknown) => handler,
}));

vi.mock('@/lib/db', () => ({
  db: {
    user: { count: vi.fn().mockResolvedValue(0) },
  },
}));

vi.mock('@/lib/auth-helpers', () => ({
  optionalRequireAuth: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/services/web-search.service', () => ({
  webSearch: vi.fn(),
  deepSearch: vi.fn(),
  searchSupplementary: vi.fn(),
  getAvailableProviders: vi.fn(),
}));

import { GET, POST } from './route';
import {
  webSearch,
  deepSearch,
  searchSupplementary,
  getAvailableProviders,
} from '@/lib/services/web-search.service';
import { optionalRequireAuth } from '@/lib/auth-helpers';

const mockWebSearch = vi.mocked(webSearch);
const mockDeepSearch = vi.mocked(deepSearch);
const mockSearchSupplementary = vi.mocked(searchSupplementary);
const mockGetAvailableProviders = vi.mocked(getAvailableProviders);
const mockOptionalRequireAuth = vi.mocked(optionalRequireAuth);

function makeGetRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

function makePostRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/search', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('/api/search route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOptionalRequireAuth.mockResolvedValue(null);
  });

  describe('GET', () => {
    it('action=providers returns providers list', async () => {
      mockGetAvailableProviders.mockReturnValue([
        { name: 'ddg', available: true, reason: 'DuckDuckGo — free' },
        { name: 'searxng', available: true, reason: 'Self-hosted' },
        { name: 'brave', available: false, reason: 'Set BRAVE_API_KEY' },
      ]);

      const request = makeGetRequest('/api/search?action=providers');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.providers).toHaveLength(3);
      expect(json.providers[0].name).toBe('ddg');
      expect(json.providers[2].available).toBe(false);
      expect(mockGetAvailableProviders).toHaveBeenCalledTimes(1);
    });

    it('without action returns API info', async () => {
      const request = makeGetRequest('/api/search');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.message).toBe('Unified Search API');
      expect(json.endpoints).toBeDefined();
      expect(json.endpoints['POST /api/search']).toBeDefined();
      expect(json.endpoints['GET /api/search?action=providers']).toBeDefined();
    });
  });

  describe('POST', () => {
    it('with valid query returns search results in fast mode', async () => {
      mockWebSearch.mockResolvedValue({
        results: [
          { title: 'Test Result', url: 'https://example.com', snippet: 'test snippet' },
        ],
        source: 'DDG',
      });

      const request = makePostRequest({ query: 'supply chain' });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.query).toBe('supply chain');
      expect(json.mode).toBe('fast');
      expect(json.totalResults).toBe(1);
      expect(json.sources.web).toBeDefined();
      expect(json.sources.web.source).toBe('DDG');
      expect(json.sources.web.count).toBe(1);
      expect(json.sources.web.results[0].title).toBe('Test Result');
      expect(mockWebSearch).toHaveBeenCalledTimes(1);
      expect(mockDeepSearch).not.toHaveBeenCalled();
    });

    it('with empty query returns 400', async () => {
      const request = makePostRequest({ query: '' });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('search query');
      expect(mockWebSearch).not.toHaveBeenCalled();
      expect(mockOptionalRequireAuth).not.toHaveBeenCalled();
    });

    it('with whitespace-only query returns 400', async () => {
      const request = makePostRequest({ query: '   ' });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(mockWebSearch).not.toHaveBeenCalled();
    });

    it('with mode=deep uses deepSearch instead of webSearch', async () => {
      mockDeepSearch.mockResolvedValue({
        results: [
          { title: 'Deep Result', url: 'https://deep.example.com', snippet: 'deep' },
        ],
        source: 'DDG + Jina Reader',
      });

      const request = makePostRequest({ query: 'tariff impact', mode: 'deep' });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.mode).toBe('deep');
      expect(json.sources.web.source).toBe('DDG + Jina Reader');
      expect(mockDeepSearch).toHaveBeenCalledTimes(1);
      expect(mockWebSearch).not.toHaveBeenCalled();
    });

    it('with includeSupplementary=true adds supplementary results', async () => {
      mockWebSearch.mockResolvedValue({
        results: [{ title: 'Web', url: 'https://web.example.com', snippet: 'web' }],
        source: 'DDG',
      });
      mockSearchSupplementary.mockResolvedValue({
        reddit: [{ title: 'Reddit Post', url: 'https://reddit.com', snippet: 'reddit' }],
        github: [{ title: 'GitHub Repo', url: 'https://github.com', snippet: 'github' }],
        hn: [],
        diagnostics: { failedProviders: [] },
      });

      const request = makePostRequest({ query: 'supply chain', includeSupplementary: true });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.sources.web).toBeDefined();
      expect(json.sources.supplementary).toBeDefined();
      expect(json.sources.supplementary.count).toBe(2);
      expect(json.sources.supplementary.source).toBe('Reddit+GitHub+HN');
      expect(mockSearchSupplementary).toHaveBeenCalledTimes(1);
    });

    it('with includeSupplementary=false does not call searchSupplementary', async () => {
      mockWebSearch.mockResolvedValue({
        results: [{ title: 'Web', url: 'https://web.example.com', snippet: 'web' }],
        source: 'DDG',
      });

      const request = makePostRequest({ query: 'supply chain', includeSupplementary: false });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.sources.web).toBeDefined();
      expect(json.sources.supplementary).toBeUndefined();
      expect(mockSearchSupplementary).not.toHaveBeenCalled();
    });

    it('with Chinese query normalizes by appending supply chain keywords', async () => {
      mockWebSearch.mockResolvedValue({ results: [], source: 'DDG' });

      const request = makePostRequest({ query: '小家电出口' });
      await POST(request);

      expect(mockWebSearch).toHaveBeenCalledWith('小家电出口 supply chain');
    });

    it('with language=en does not normalize Chinese query', async () => {
      mockWebSearch.mockResolvedValue({ results: [], source: 'DDG' });

      const request = makePostRequest({ query: '小家电出口', language: 'en' });
      await POST(request);

      expect(mockWebSearch).toHaveBeenCalledWith('小家电出口');
    });

    it('calls optionalRequireAuth for valid queries', async () => {
      mockWebSearch.mockResolvedValue({ results: [], source: 'DDG' });

      const request = makePostRequest({ query: 'supply chain' });
      await POST(request);

      expect(mockOptionalRequireAuth).toHaveBeenCalledTimes(1);
    });

    it('with supplementary failure handles gracefully and returns empty supplementary', async () => {
      mockWebSearch.mockResolvedValue({
        results: [{ title: 'Web', url: 'https://web.example.com', snippet: 'web' }],
        source: 'DDG',
      });
      mockSearchSupplementary.mockRejectedValue(new Error('Reddit API down'));

      const request = makePostRequest({ query: 'supply chain', includeSupplementary: true });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.sources.supplementary).toBeDefined();
      expect(json.sources.supplementary.count).toBe(0);
    });

    it('slices results to maximum 8 per source', async () => {
      const manyResults = Array.from({ length: 15 }, (_, i) => ({
        title: `Result ${i}`,
        url: `https://example.com/${i}`,
        snippet: `snippet ${i}`,
      }));
      mockWebSearch.mockResolvedValue({ results: manyResults, source: 'DDG' });

      const request = makePostRequest({ query: 'supply chain' });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.sources.web.count).toBe(15);
      expect(json.sources.web.results).toHaveLength(8);
    });
  });
});
