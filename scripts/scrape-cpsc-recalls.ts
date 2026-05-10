/**
 * CPSC Recall Scraper — US Consumer Product Safety Commission
 *
 * Fetches CPSC RSS feed for product recalls, extracts small-appliance-related
 * items, and writes them to the quality risk engine's data pipeline.
 *
 * RSS feed: https://www.cpsc.gov/Newsroom/CPSC-RSS-Feed/Recalls-RSS
 * Refresh: daily (CPSC publishes recalls on weekdays)
 *
 * Usage: bun run scripts/scrape-cpsc-recalls.ts
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

// HS codes for small appliance categories most affected by recalls
const TARGET_CATEGORIES = [
  'kitchen', 'coffee', 'blender', 'juicer', 'toaster', 'air fryer', 'rice cooker',
  'vacuum', 'hair dryer', 'iron', 'fan', 'heater', 'humidifier', 'purifier',
  'pressure cooker', 'slow cooker', 'microwave', 'kettle', 'electric',
  'appliance', 'portable', 'household', 'kitchen appliance',
];

function isSmallAppliance(title: string): boolean {
  const lower = title.toLowerCase();
  return TARGET_CATEGORIES.some(cat => lower.includes(cat));
}

interface CPSCItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  hazard: string;
  units: number;
}

async function fetchCPSCHTML(): Promise<CPSCItem[]> {
  // Try the HTML recall page which is more reliably parsed
  const res = await fetch('https://www.cpsc.gov/Recalls', {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'SupplyChainCortex/1.0' },
  });
  if (!res.ok) return [];
  const html = await res.text();

  // Extract recall items from HTML (simple text extraction)
  const items: CPSCItem[] = [];
  const recallBlocks = html.split(/class="[^"]*recall[^"]*"/gi);
  const recallSection = html.match(/<a[^>]*href="\/Recalls\/[^"]*"[^>]*>([^<]+)<\/a>/gi) || [];

  for (const match of recallSection.slice(0, 15)) {
    const titleMatch = match.match(/>([^<]+)</);
    const linkMatch = match.match(/href="([^"]+)"/);
    if (titleMatch && linkMatch) {
      const title = titleMatch[1].trim();
      if (isSmallAppliance(title)) {
        items.push({
          title,
          link: `https://www.cpsc.gov${linkMatch[1]}`,
          description: '',
          pubDate: new Date().toISOString(),
          hazard: '',
          units: 0,
        });
      }
    }
  }

  return items;
}

async function main() {
  console.log('🔍 Scanning CPSC recalls for small appliance alerts...\n');

  const items = await fetchCPSCHTML();
  console.log(`  CPSC page: ${items.length} small appliance recalls found`);

  if (items.length === 0) {
    console.log('  ✓ No relevant recalls today');
    console.log('\n✅ CPSC scan complete.');
    return;
  }

  console.log('\n📋 Recent small appliance recalls:');
  for (const item of items) {
    console.log(`  ⚠ ${item.title.slice(0, 80)}`);
    console.log(`    ${item.link}`);

    // Write to DB as a quality risk alert
    await db.defectRecord.create({
      data: {
        sku: 'CPSC-ALERT',
        productName: item.title.slice(0, 100),
        defectType: 'regulatory',
        severity: 'critical',
        quantity: 1,
        detectedAt: 'post-market',
        rootCause: `CPSC Recall: ${item.title.slice(0, 200)}`,
        correctiveAction: `Monitor CPSC page: ${item.link}`,
      },
    });
  }

  console.log(`\n  ✓ ${items.length} recall alerts written to DB`);
  console.log('\n✅ CPSC scan complete.');
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
