/**
 * Social Media Sentiment Monitor — free, web-search-based.
 *
 * Uses existing web_search tool for targeted queries across
 * Reddit, Twitter/X, and forums. Extracts sentiment signals
 * from search snippets. Zero API cost.
 *
 * Monitors brand mentions, product reviews, quality complaints,
 * and competitor discussion for supply chain risk signals.
 */

import { webSearch } from '@/lib/services/web-search.service';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface SentimentSignal {
  platform: string;
  title: string;
  snippet: string;
  url: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  date: string | null;
  relevance: 'high' | 'medium' | 'low';
}

export interface BrandSentimentReport {
  brand: string;
  generatedAt: string;
  totalMentions: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  sentimentScore: number; // -1 to +1
  topSignals: SentimentSignal[];
  riskFlags: string[];
  source: string;
}

// ─── Sentiment Keywords ──────────────────────────────────────────────────────────

const POSITIVE_KEYWORDS = ['great', 'love', 'best', 'excellent', 'recommend', 'perfect',
  'amazing', 'worth', 'good quality', '好评', '推荐', '不错', '好用', '满意', '五星'];

const NEGATIVE_KEYWORDS = ['broke', 'defective', 'recall', 'dangerous', 'fire', 'shock',
  'scam', 'fake', 'poor quality', 'disappointed', 'waste', 'returned', '差评', '坏了',
  '退货', '质量问题', '不安全', '着火', '触电', '召回', '投诉', '退款', '不推荐', '千万别买'];

const RISK_KEYWORDS = ['recall', 'fire', 'burn', 'shock', 'injury', 'exploded', 'lawsuit',
  'CPSC', 'safety', '召回', '着火', '触电', '爆炸', '受伤', '起诉'];

// ─── Platform Search Templates ───────────────────────────────────────────────────

const PLATFORM_QUERIES: Array<{ platform: string; template: string }> = [
  { platform: 'Reddit', template: 'site:reddit.com {brand}' },
  { platform: 'Reddit', template: 'site:reddit.com {brand} review quality' },
  { platform: 'Twitter/X', template: '{brand} review complaint' },
  { platform: 'Forums', template: '{brand} quality issue OR defect OR recall' },
];

// ─── Sentiment Analysis ──────────────────────────────────────────────────────────

function analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const lower = text.toLowerCase();
  let pos = 0, neg = 0;

  for (const kw of POSITIVE_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) pos++;
  }
  for (const kw of NEGATIVE_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) neg++;
  }

  if (neg > pos + 1) return 'negative';
  if (pos > neg + 1) return 'positive';
  return 'neutral';
}

function detectRiskFlags(text: string): string[] {
  const flags: string[] = [];
  const lower = text.toLowerCase();
  for (const kw of RISK_KEYWORDS) {
    if (lower.includes(kw.toLowerCase()) && !flags.includes(kw)) {
      flags.push(kw);
    }
  }
  return flags;
}

function estimateRelevance(signal: SentimentSignal, brand: string): 'high' | 'medium' | 'low' {
  const text = (signal.title + ' ' + signal.snippet).toLowerCase();
  const brandLower = brand.toLowerCase();

  // Title contains brand name = high relevance
  if (signal.title.toLowerCase().includes(brandLower)) return 'high';
  // Snippet contains brand name + risk keyword = high
  if (text.includes(brandLower) && detectRiskFlags(text).length > 0) return 'high';
  // Contains brand name somewhere = medium
  if (text.includes(brandLower)) return 'medium';
  return 'low';
}

// ─── Main Functions ──────────────────────────────────────────────────────────────

/**
 * Search for brand/product mentions across social platforms.
 * Returns structured sentiment signals.
 */
export async function searchBrandMentions(
  brand: string,
  maxQueries = 6,
): Promise<SentimentSignal[]> {
  const signals: SentimentSignal[] = [];
  const seen = new Set<string>();

  for (const pq of PLATFORM_QUERIES.slice(0, maxQueries)) {
    try {
      const query = pq.template.replace('{brand}', brand);
      const { results } = await webSearch(query);

      for (const r of results) {
        const key = r.url;
        if (seen.has(key)) continue;
        seen.add(key);

        const sentiment = analyzeSentiment(r.title + ' ' + r.snippet);
        signals.push({
          platform: pq.platform,
          title: r.title,
          snippet: r.snippet.slice(0, 200),
          url: r.url,
          sentiment,
          date: r.publishedAt || null,
          relevance: 'medium', // will be updated below
        });
      }
    } catch { /* best-effort */ }
  }

  // Update relevance scores
  for (const s of signals) {
    s.relevance = estimateRelevance(s, brand);
  }

  // Sort: negative + high relevance first
  signals.sort((a, b) => {
    const scoreA = (a.sentiment === 'negative' ? 3 : a.sentiment === 'positive' ? 1 : 2)
      + (a.relevance === 'high' ? 3 : a.relevance === 'medium' ? 2 : 1);
    const scoreB = (b.sentiment === 'negative' ? 3 : b.sentiment === 'positive' ? 1 : 2)
      + (b.relevance === 'high' ? 3 : b.relevance === 'medium' ? 2 : 1);
    return scoreB - scoreA;
  });

  return signals;
}

/**
 * Generate a full brand sentiment report.
 */
export async function generateSentimentReport(brand: string): Promise<BrandSentimentReport> {
  const signals = await searchBrandMentions(brand);
  const positive = signals.filter(s => s.sentiment === 'positive').length;
  const negative = signals.filter(s => s.sentiment === 'negative').length;
  const neutral = signals.filter(s => s.sentiment === 'neutral').length;
  const total = signals.length;

  // Sentiment score: -1 (all negative) to +1 (all positive)
  const sentimentScore = total > 0
    ? Math.round(((positive - negative) / total) * 100) / 100
    : 0;

  // Collect risk flags from negative signals
  const riskFlags: string[] = [];
  for (const s of signals) {
    if (s.sentiment === 'negative') {
      riskFlags.push(...detectRiskFlags(s.title + ' ' + s.snippet));
    }
  }

  return {
    brand,
    generatedAt: new Date().toISOString(),
    totalMentions: total,
    positiveCount: positive,
    negativeCount: negative,
    neutralCount: neutral,
    sentimentScore,
    topSignals: signals.slice(0, 15),
    riskFlags: [...new Set(riskFlags)].slice(0, 10),
    source: 'Web Search (免费)',
  };
}

/**
 * Monitor product reviews for quality/recall signals.
 * Focused on CPSC-relevant keywords for small appliances.
 */
export async function monitorProductReviews(
  productName: string,
): Promise<SentimentSignal[]> {
  const queries = [
    `${productName} review problem OR issue OR defect`,
    `${productName} safety OR recall OR fire OR shock`,
    `${productName} amazon review 1 star`,
  ];

  const allSignals: SentimentSignal[] = [];
  for (const q of queries) {
    try {
      const { results } = await webSearch(q);
      for (const r of results) {
        const sentiment = analyzeSentiment(r.title + ' ' + r.snippet);
        if (sentiment === 'negative') {
          allSignals.push({
            platform: 'Reviews',
            title: r.title,
            snippet: r.snippet.slice(0, 200),
            url: r.url,
            sentiment,
            date: r.publishedAt || null,
            relevance: 'high',
          });
        }
      }
    } catch { /* best-effort */ }
  }

  return allSignals.slice(0, 20);
}

/**
 * Quick check: are there any urgent risk signals for a brand/product?
 */
export async function quickRiskScan(brand: string): Promise<{
  hasRisks: boolean;
  riskCount: number;
  topRisks: string[];
  summary: string;
}> {
  const signals = await searchBrandMentions(brand, 4);
  const riskSignals = signals.filter(s =>
    s.sentiment === 'negative' && s.relevance === 'high'
  );
  const allFlags = riskSignals.flatMap(s => detectRiskFlags(s.title + ' ' + s.snippet));
  const uniqueFlags = [...new Set(allFlags)];

  return {
    hasRisks: riskSignals.length > 0,
    riskCount: riskSignals.length,
    topRisks: uniqueFlags.slice(0, 5),
    summary: riskSignals.length > 0
      ? `发现 ${riskSignals.length} 条高风险负面信号: ${uniqueFlags.slice(0, 3).join(', ')}`
      : '未发现显著风险信号',
  };
}
