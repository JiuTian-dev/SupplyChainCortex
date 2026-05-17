// src/lib/services/web-search-reranker.ts

import type { SearchResult } from './web-search.service';

// ─── TF-IDF Style Semantic Similarity (keyword-based, no external API) ──────────

function tokenize(text: string): Map<string, number> {
  const tokens = new Map<string, number>();

  // Chinese: overlapping bigrams and trigrams for better matching
  const chineseChars = text.match(/[一-鿿]/g) || [];
  for (let i = 0; i < chineseChars.length; i++) {
    if (i + 1 < chineseChars.length) {
      const bigram = chineseChars[i] + chineseChars[i + 1];
      tokens.set(bigram, (tokens.get(bigram) || 0) + 1);
    }
    if (i + 2 < chineseChars.length) {
      const trigram = chineseChars[i] + chineseChars[i + 1] + chineseChars[i + 2];
      tokens.set(trigram, (tokens.get(trigram) || 0) + 1);
    }
  }

  // English: words of 3+ characters
  const englishTokens = text.match(/[a-zA-Z]{3,}/g) || [];
  for (const t of englishTokens) {
    const lower = t.toLowerCase();
    tokens.set(lower, (tokens.get(lower) || 0) + 1);
  }

  return tokens;
}

export function computeSemanticSimilarity(query: string, text: string): number {
  if (!text || text.length === 0) return 0;

  const queryTokens = tokenize(query);
  const textTokens = tokenize(text);

  if (queryTokens.size === 0) return 0.3;

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
  if (Number.isNaN(age)) return 0;
  if (age < 0) return 0; // future date, ignore
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

    const finalScore = simScore * 0.55 + authBoost * 0.25 + freshBoost * 0.10 + 0.10;

    return { result: r, score: finalScore };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.result);
}
