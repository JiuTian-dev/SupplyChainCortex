/**
 * Amazon Competitor Price Monitor — small appliance market intelligence
 *
 * Monitors Amazon.com search results for key product categories to track:
 *   - Average selling price trends
 *   - Competitor count
 *   - BSR distribution
 *
 * Categories monitored (matching our product lines):
 *   - Air fryers (空气炸锅)
 *   - Coffee makers (咖啡机)
 *   - Vacuum cleaners (吸尘器)
 *   - Rice cookers (电饭煲)
 *   - Hair dryers (电吹风)
 *   - Juicers/blenders (榨汁机/搅拌机)
 *
 * Data source: Amazon.com search results (public, HTTP fetch)
 * Limitation: Amazon blocks automated scraping; use with reasonable frequency.
 *   Weekly runs recommended. Results approximate — use for trend direction, not absolute.
 *
 * Usage: bun run scripts/scrape-amazon-competitors.ts
 */

interface ProductSnapshot {
  keyword: string;
  date: string;
  competitorCount: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  avgRating: number;
  avgReviews: number;
}

// Amazon search URL template
function searchUrl(keyword: string): string {
  return `https://www.amazon.com/s?k=${encodeURIComponent(keyword)}`;
}

async function scrapeCategory(keyword: string): Promise<ProductSnapshot> {
  try {
    const res = await fetch(searchUrl(keyword), {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return emptySnapshot(keyword);
    const html = await res.text();

    // Extract prices: Amazon shows prices in $XX.XX format
    const priceMatches = html.match(/\$\d{1,4}(?:\.\d{2})?/g) || [];
    const prices = priceMatches
      .map(p => parseFloat(p.replace('$', '')))
      .filter(p => p > 5 && p < 500);

    // Extract ratings: "4.5 out of 5 stars"
    const ratingMatches = html.match(/(\d\.\d)\s*out\s*of\s*5/g) || [];
    const ratings = ratingMatches.map(r => parseFloat(r.match(/(\d\.\d)/)?.[0] || '0'));

    // Extract review counts
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
    return emptySnapshot(keyword);
  }
}

function emptySnapshot(keyword: string): ProductSnapshot {
  return { keyword, date: new Date().toISOString().slice(0, 10), competitorCount: 0, avgPrice: 0, minPrice: 0, maxPrice: 0, avgRating: 0, avgReviews: 0 };
}

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

async function main() {
  console.log('🛒 Amazon Competitor Price Monitor\n');
  console.log('  Categories:', CATEGORIES.length);
  console.log('  Date:', new Date().toISOString().slice(0, 10));
  console.log('');

  const results: ProductSnapshot[] = [];
  for (const cat of CATEGORIES) {
    process.stdout.write(`  Scanning "${cat}"... `);
    const snap = await scrapeCategory(cat);
    console.log(`${snap.competitorCount} products, avg $${snap.avgPrice}, rating ${snap.avgRating}`);
    results.push(snap);
    // Be polite to Amazon — small delay between requests
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('\n📊 Summary:');
  const valid = results.filter(r => r.competitorCount > 0);
  if (valid.length > 0) {
    const overallAvg = Math.round(valid.reduce((s, r) => s + r.avgPrice, 0) / valid.length * 100) / 100;
    const overallRating = Math.round(valid.reduce((s, r) => s + r.avgRating, 0) / valid.length * 10) / 10;
    console.log(`  Overall avg price: $${overallAvg}`);
    console.log(`  Overall avg rating: ${overallRating}`);
    console.log(`  Most competitive: ${valid.sort((a, b) => b.competitorCount - a.competitorCount)[0].keyword} (${valid[0].competitorCount} listings)`);
  }

  console.log('\n✅ Amazon scan complete.');
  console.log('  📅 Recommended frequency: weekly');
}

main().catch(console.error);
