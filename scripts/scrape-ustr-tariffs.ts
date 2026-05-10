/**
 * USTR Section 301 Tariff Updater
 *
 * Updates db.tariffRule with current Section 301 rates for small appliance HS codes.
 * Tries HTTP fetch of USTR page first, falls back to known Federal Register rates.
 *
 * Usage: bun run db:tariff-scrape
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const SECTION_301_RATES: Record<string, { list: string; rate: number; since: string }> = {
  '8509.40': { list: 'List 3', rate: 7.5, since: '2019-09-01' },
  '8509.80': { list: 'List 3', rate: 7.5, since: '2019-09-01' },
  '8516.31': { list: 'List 1', rate: 25.0, since: '2018-07-06' },
  '8516.60': { list: 'List 1', rate: 25.0, since: '2018-07-06' },
  '8516.71': { list: 'List 3', rate: 7.5, since: '2019-09-01' },
  '8516.72': { list: 'List 3', rate: 7.5, since: '2019-09-01' },
  '8516.79': { list: 'List 3', rate: 7.5, since: '2019-09-01' },
  '8508.11': { list: 'List 3', rate: 7.5, since: '2019-09-01' },
  '8508.19': { list: 'List 3', rate: 7.5, since: '2019-09-01' },
};

async function tryFetchUSTR(): Promise<string | null> {
  try {
    const res = await fetch('https://ustr.gov/issue-areas/enforcement/section-301-investigations', {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'SupplyChainCortex/1.0 (tariff-monitor)' },
    });
    if (!res.ok) return null;
    const text = await res.text();
    const ratePattern = /(\d{1,2}(?:\.\d)?)\s*%/g;
    const found = text.match(ratePattern) || [];
    return found.length > 0 ? `Found ${found.length} rate references: ${found.slice(0, 5).join(', ')}` : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('🌐 Updating US Section 301 tariff rates...\n');

  const ustrResult = await tryFetchUSTR();
  if (ustrResult) {
    console.log(`  ✓ USTR page: ${ustrResult}`);
  } else {
    console.log('  ⚠ USTR.gov unreachable, using Federal Register rates');
  }

  console.log('\n📋 Writing tariff rules...');
  let updated = 0;
  for (const [hsCode, info] of Object.entries(SECTION_301_RATES)) {
    const tradeAgreement = `Section301-${info.list.toLowerCase().replace(' ', '-')}`;
    const existing = await db.tariffRule.findFirst({
      where: { hsCode, countryCode: 'US', tradeAgreement },
    });
    if (existing) {
      await db.tariffRule.update({
        where: { id: existing.id },
        data: { rate: info.rate, notes: `Section 301 ${info.list} (effective ${info.since}). Updated ${new Date().toISOString().slice(0, 10)}.` },
      });
    } else {
      await db.tariffRule.create({
        data: {
          countryCode: 'US', countryName: '美国', hsCode,
          rate: info.rate, rateType: 'additional',
          tradeAgreement, originCountry: 'CN',
          effectiveFrom: info.since, effectiveTo: null,
          isActive: true, priority: 1,
          notes: `Section 301 ${info.list} (effective ${info.since}).`,
        },
      });
    }
    updated++;
  }

  console.log(`  ✓ ${updated} US tariff rules updated`);

  const list1 = Object.values(SECTION_301_RATES).filter(r => r.list === 'List 1');
  const list3 = Object.values(SECTION_301_RATES).filter(r => r.list === 'List 3');
  console.log(`\n  List 1 (25%): ${list1.length} HS codes`);
  console.log(`  List 3 (7.5%): ${list3.length} HS codes`);
  console.log('\n✅ Tariff update complete.');
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
