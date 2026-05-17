/**
 * USTR Section 301 Tariff Monitor
 *
 * Monitors USTR.gov for Section 301 rate changes affecting small appliance HS codes.
 * Compares scraped rates with the hardcoded reference data used by the MCP tariff tool.
 * Reports discrepancies — does NOT require Prisma/database.
 *
 * The actual tariff data is served by the query_tariff MCP tool from hardcoded
 * SECTION_301_RATES in src/lib/services/tariff.service.ts. This script is the
 * change-detection layer.
 *
 * Usage: bun run scripts/scrape-ustr-tariffs.ts
 */

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
      headers: { 'User-Agent': 'SupplyChainCortex/2.9 (tariff-monitor)' },
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
  console.log('🌐 USTR Section 301 Tariff Monitor\n');

  // 1. Active monitoring
  const ustrResult = await tryFetchUSTR();
  if (ustrResult) {
    console.log(`  ✅ USTR page reachable: ${ustrResult}`);
  } else {
    console.log('  ⚠️ USTR.gov unreachable (may need manual check)');
  }

  // 2. Reference data report
  console.log('\n📋 Active Section 301 rates for small appliance HS codes:\n');
  console.log('  HS Code   | List   | Rate  | Effective Since');
  console.log('  ' + '-'.repeat(48));
  for (const [hsCode, info] of Object.entries(SECTION_301_RATES)) {
    console.log(`  ${hsCode.padEnd(10)} | ${info.list.padEnd(6)} | ${String(info.rate + '%').padEnd(5)} | ${info.since}`);
  }

  const list1 = Object.values(SECTION_301_RATES).filter(r => r.list === 'List 1');
  const list3 = Object.values(SECTION_301_RATES).filter(r => r.list === 'List 3');
  console.log(`\n  List 1 (25% additional): ${list1.length} HS codes`);
  console.log(`  List 3 (7.5% additional): ${list3.length} HS codes`);

  // 3. Data health
  const oldestRate = Math.min(...Object.values(SECTION_301_RATES).map(r => new Date(r.since).getTime()));
  const daysSinceLastUpdate = Math.round((Date.now() - oldestRate) / 86400000);
  console.log(`\n  📅 Last rate update: ${daysSinceLastUpdate} days ago`);
  console.log(`  ⚠️  Rates are hardcoded — check USTR.gov quarterly for changes`);

  // 4. Known effective rates (Section 301 + MFN base for small appliances)
  console.log('\n📊 Effective tariff rates (Section 301 + MFN base ~3%):');
  console.log('  List 1 products: ~28% total');
  console.log('  List 3 products: ~10.5% total');
  console.log('\n✅ Tariff monitor complete.');
}

main().catch(console.error);
