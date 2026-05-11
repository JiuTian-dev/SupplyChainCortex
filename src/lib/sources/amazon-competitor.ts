/**
 * Amazon Competitor Price Monitor — small appliance market intelligence
 *
 * Tracks Amazon.com public search results for key product categories:
 *   - Competitor count, avg/min/max price, avg rating, review count
 *
 * Data: Amazon search results (public, no login). Approximate — use for trend
 * direction, not absolute pricing. Runs weekly to be polite.
 *
 * Categories match the 10 product lines in the seed data (air fryers, coffee
 * makers, vacuums, rice cookers, hair dryers, juicers, kettles, toasters,
 * blenders, fans).
 */

import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface CompetitorSnapshot {
  keyword: string;
  date: string;
  competitorCount: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  avgRating: number;
  avgReviews: number;
}

// ─── Categories ──────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'air fryer',
  'coffee maker',
  'cordless vacuum cleaner',
  'rice cooker',
  'hair dryer',
  'juicer machine',
  'electric kettle',
  'toaster oven',
  'blender',
  'portable fan',
];

// ─── Scraper ─────────────────────────────────────────────────────────────────────

function searchUrl(keyword: string): string {
  return `https://www.amazon.com/s?k=${encodeURIComponent(keyword)}`;
}

async function scrapeCategory(keyword: string): Promise<CompetitorSnapshot> {
  const empty = (): CompetitorSnapshot => ({
    keyword, date: new Date().toISOString().slice(0, 10),
    competitorCount: 0, avgPrice: 0, minPrice: 0, maxPrice: 0, avgRating: 0, avgReviews: 0,
  });

  try {
    const res = await fetch(searchUrl(keyword), {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return empty();
    const html = await res.text();

    // If Amazon blocks, return empty
    if (html.includes('Type the characters you see') || html.includes('robot check')) {
      return empty();
    }

    const priceMatches = html.match(/\$\d{1,4}(?:\.\d{2})?/g) || [];
    const prices = priceMatches.map(p => parseFloat(p.replace('$', ''))).filter(p => p > 5 && p < 500);

    const ratingMatches = html.match(/(\d\.\d)\s*out\s*of\s*5/g) || [];
    const ratings = ratingMatches.map(r => parseFloat(r.match(/(\d\.\d)/)?.[0] || '0'));

    const reviewMatches = html.match(/([\d,]+)\s*(?:ratings|reviews)/gi) || [];
    const reviews = reviewMatches
      .map(r => parseInt((r.match(/[\d,]+/)?.[0] || '0').replace(/,/g, '')))
      .filter(n => n > 0);

    return {
      keyword,
      date: new Date().toISOString().slice(0, 10),
      competitorCount: prices.length,
      avgPrice: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100 : 0,
      minPrice: prices.length > 0 ? Math.min(...prices) : 0,
      maxPrice: prices.length > 0 ? Math.max(...prices) : 0,
      avgRating: ratings.length > 0 ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length * 10) / 10 : 0,
      avgReviews: reviews.length > 0 ? Math.round(reviews.reduce((a, b) => a + b, 0) / reviews.length) : 0,
    };
  } catch {
    return empty();
  }
}

// ─── Main Export ─────────────────────────────────────────────────────────────────

export async function fetchCompetitorPrices(): Promise<CompetitorSnapshot[]> {
  const results: CompetitorSnapshot[] = [];

  for (const cat of CATEGORIES) {
    const snap = await scrapeCategory(cat);
    results.push(snap);
    // Polite delay between requests
    await new Promise(r => setTimeout(r, 2000));
  }

  return results;
}

/**
 * Persist snapshots to DB for trending.
 */
export async function syncCompetitorToDB(): Promise<number> {
  const snapshots = await fetchCompetitorPrices();
  const valid = snapshots.filter(s => s.competitorCount > 0);
  if (valid.length === 0) return 0;

  let synced = 0;
  for (const snap of valid) {
    try {
      await db.supplyChainEvent.create({
        data: {
          type: 'competitor_update',
          title: `Amazon "${snap.keyword}": $${snap.avgPrice} avg (${snap.competitorCount} listings)`,
          description: JSON.stringify(snap),
          icon: '🛒',
          color: '#6366f1',
          severity: 'info',
        },
      });
      synced++;
    } catch { continue; }
  }
  return synced;
}
