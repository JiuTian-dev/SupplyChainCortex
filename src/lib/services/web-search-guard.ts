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
  'ngentot', 'memek',
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

  if (targetLang === 'zh') return hasChinese || (!hasEnglish && !hasChinese);
  if (targetLang === 'en') return hasEnglish || (!hasChinese && !hasEnglish);
  return true;
}

export function detectEmptyOrDegraded(
  results: SearchResult[],
  _query: string,
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

export function scoreResultQuality(result: SearchResult, _query: string): number {
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
      if (!Number.isNaN(daysAgo)) {
        if (daysAgo < 0) { /* future date, ignore */ }
        else if (daysAgo < 7) score += 0.1;
        else if (daysAgo < 90) score += 0.05;
        else if (daysAgo > 365) score -= 0.1;
      }
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
