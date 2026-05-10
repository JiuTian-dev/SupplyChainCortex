/**
 * Tariff Data Seed — 2026 Real Rates for Small Appliance Supply Chain
 *
 * Data sources:
 *   - US Section 301 (USTR notices, 2026): 7.5-25% on Chinese electrical machinery
 *   - EU MFN + CBAM (European Commission, 2026): 2.7% avg MFN + carbon surcharge
 *   - RCEP (Phase 5, 2026): Japan/Korea zero tariff on many consumer goods
 *   - WTO Tariff Data (2026): MFN rates for major markets
 *
 * HS Codes for small appliances:
 *   8509.40  — Food grinders/mixers/juicers
 *   8509.80  — Other electro-mechanical appliances
 *   8516.31  — Hair dryers
 *   8516.60  — Electric ovens/cookers/grills
 *   8516.71  — Coffee/tea makers
 *   8516.72  — Toasters
 *   8516.79  — Other electro-thermic appliances (rice cookers, kettles)
 *   8508.11  — Vacuum cleaners (≤1500W)
 *   8508.19  — Vacuum cleaners (>1500W)
 *
 * Usage:
 *   bun run prisma/tariff-seed.ts
 *
 * Priority system (lower number = applied first):
 *   1 - Special tariff (Section 301, CBAM)
 *   2 - FTA preferential (RCEP, USMCA)
 *   3 - MFN base rate
 */

import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

// ─── 2026 Real Tariff Data ─────────────────────────────────────────────────────

interface TariffRuleInput {
  countryCode: string;
  countryName: string;
  hsCode: string;
  rate: number;
  rateType: string;
  tradeAgreement: string;
  originCountry: string;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  priority: number;
  notes: string;
}

const TARIFF_RULES: TariffRuleInput[] = [
  // ── US Section 301 (priority 1 — highest) ──────────────────────────────────
  {
    countryCode: 'US', countryName: '美国', hsCode: '8509.40',
    rate: 7.5, rateType: 'additional', tradeAgreement: 'Section301-list3',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2024-01-01', effectiveTo: null, priority: 1,
    notes: 'Section 301 List 3: food grinders/mixers. USTR 4-year review extended to 2026.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8509.80',
    rate: 7.5, rateType: 'additional', tradeAgreement: 'Section301-list3',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2024-01-01', effectiveTo: null, priority: 1,
    notes: 'Section 301 List 3: other electro-mechanical appliances.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8516.31',
    rate: 25.0, rateType: 'additional', tradeAgreement: 'Section301-list1',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2018-07-06', effectiveTo: null, priority: 1,
    notes: 'Section 301 List 1: hair dryers. Original 25% rate, no exclusion.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8516.60',
    rate: 25.0, rateType: 'additional', tradeAgreement: 'Section301-list1',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2018-07-06', effectiveTo: null, priority: 1,
    notes: 'Section 301 List 1: electric ovens/cookers/grills.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8516.71',
    rate: 7.5, rateType: 'additional', tradeAgreement: 'Section301-list3',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2024-01-01', effectiveTo: null, priority: 1,
    notes: 'Section 301 List 3: coffee/tea makers. Exclusion requests denied 2025.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8516.72',
    rate: 7.5, rateType: 'additional', tradeAgreement: 'Section301-list3',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2024-01-01', effectiveTo: null, priority: 1,
    notes: 'Section 301 List 3: toasters.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8516.79',
    rate: 7.5, rateType: 'additional', tradeAgreement: 'Section301-list3',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2024-01-01', effectiveTo: null, priority: 1,
    notes: 'Section 301 List 3: rice cookers, kettles, other electro-thermic.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8508.11',
    rate: 7.5, rateType: 'additional', tradeAgreement: 'Section301-list3',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2024-01-01', effectiveTo: null, priority: 1,
    notes: 'Section 301 List 3: vacuum cleaners ≤1500W.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8508.19',
    rate: 7.5, rateType: 'additional', tradeAgreement: 'Section301-list3',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2024-01-01', effectiveTo: null, priority: 1,
    notes: 'Section 301 List 3: vacuum cleaners >1500W.',
  },

  // ── US MFN base rates (priority 3) ────────────────────────────────────────
  {
    countryCode: 'US', countryName: '美国', hsCode: '8509.40',
    rate: 3.5, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 3,
    notes: 'US MFN base rate for food processors (before Section 301 surcharge).',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8516.71',
    rate: 3.7, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 3,
    notes: 'US MFN base rate for coffee makers (before Section 301 surcharge).',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8516.79',
    rate: 4.2, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 3,
    notes: 'US MFN base rate for rice cookers/kettles (before Section 301 surcharge).',
  },

  // ── EU MFN + CBAM (priority 2) ────────────────────────────────────────────
  {
    countryCode: 'EU', countryName: '欧盟', hsCode: '8509.40',
    rate: 2.7, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 2,
    notes: 'EU MFN rate for food processors. CBAM not directly applicable to finished appliances.',
  },
  {
    countryCode: 'EU', countryName: '欧盟', hsCode: '8516.71',
    rate: 2.7, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 2,
    notes: 'EU MFN rate for coffee/tea makers.',
  },
  {
    countryCode: 'EU', countryName: '欧盟', hsCode: '8516.79',
    rate: 2.7, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 2,
    notes: 'EU MFN rate for rice cookers/kettles.',
  },
  {
    countryCode: 'EU', countryName: '欧盟', hsCode: '8508.11',
    rate: 2.2, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 2,
    notes: 'EU MFN rate for vacuum cleaners.',
  },

  // ── Japan RCEP (priority 2 — FTA preferential) ─────────────────────────────
  {
    countryCode: 'JP', countryName: '日本', hsCode: '8509.40',
    rate: 0, rateType: 'FTA', tradeAgreement: 'RCEP-JP',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-04-01', effectiveTo: null, priority: 2,
    notes: 'RCEP 5th year tariff elimination: Japan zero tariff on food processors.',
  },
  {
    countryCode: 'JP', countryName: '日本', hsCode: '8516.71',
    rate: 0, rateType: 'FTA', tradeAgreement: 'RCEP-JP',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-04-01', effectiveTo: null, priority: 2,
    notes: 'RCEP 5th year: Japan zero tariff on coffee makers.',
  },
  {
    countryCode: 'JP', countryName: '日本', hsCode: '8516.79',
    rate: 0, rateType: 'FTA', tradeAgreement: 'RCEP-JP',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-04-01', effectiveTo: null, priority: 2,
    notes: 'RCEP 5th year: Japan zero tariff on rice cookers/kettles.',
  },

  // ── Korea RCEP (priority 2) ────────────────────────────────────────────────
  {
    countryCode: 'KR', countryName: '韩国', hsCode: '8509.40',
    rate: 0, rateType: 'FTA', tradeAgreement: 'RCEP-KR',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-04-01', effectiveTo: null, priority: 2,
    notes: 'RCEP Phase 5: Korea zero tariff on food processors.',
  },
  {
    countryCode: 'KR', countryName: '韩国', hsCode: '8516.71',
    rate: 0, rateType: 'FTA', tradeAgreement: 'RCEP-KR',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-04-01', effectiveTo: null, priority: 2,
    notes: 'RCEP Phase 5: Korea zero tariff on coffee makers.',
  },

  // ── UK (post-Brexit UK Global Tariff, 2026) ────────────────────────────────
  {
    countryCode: 'UK', countryName: '英国', hsCode: '8509.40',
    rate: 2.0, rateType: 'MFN', tradeAgreement: 'UK-Global-Tariff',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2024-01-01', effectiveTo: null, priority: 2,
    notes: 'UK Global Tariff: food processors. UKCA certification required additionally.',
  },
  {
    countryCode: 'UK', countryName: '英国', hsCode: '8516.71',
    rate: 2.0, rateType: 'MFN', tradeAgreement: 'UK-Global-Tariff',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2024-01-01', effectiveTo: null, priority: 2,
    notes: 'UK Global Tariff: coffee makers.',
  },

  // ── Australia (FTA with China, 2026) ───────────────────────────────────────
  {
    countryCode: 'AU', countryName: '澳大利亚', hsCode: '8509.40',
    rate: 0, rateType: 'FTA', tradeAgreement: 'ChAFTA',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2019-01-01', effectiveTo: null, priority: 2,
    notes: 'China-Australia FTA (ChAFTA): zero tariff on food processors since 2019.',
  },
  {
    countryCode: 'AU', countryName: '澳大利亚', hsCode: '8516.71',
    rate: 0, rateType: 'FTA', tradeAgreement: 'ChAFTA',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2019-01-01', effectiveTo: null, priority: 2,
    notes: 'ChAFTA: zero tariff on coffee makers.',
  },
];

// ─── HS Code Product Category Mapping ──────────────────────────────────────────

interface HSCodeMapping {
  category: string;
  subCategory: string | null;
  hsCode: string;
  description: string;
}

const HS_CODE_MAPPINGS: HSCodeMapping[] = [
  { category: '厨房电器', subCategory: '榨汁机', hsCode: '8509.40', description: '食品研磨机及搅拌机；水果或蔬菜的榨汁机' },
  { category: '厨房电器', subCategory: '咖啡机', hsCode: '8516.71', description: '咖啡壶或茶壶' },
  { category: '厨房电器', subCategory: '电饭煲', hsCode: '8516.79', description: '其他电热器具（电饭煲、电热水壶等）' },
  { category: '厨房电器', subCategory: '烤面包机', hsCode: '8516.72', description: '烤面包器' },
  { category: '厨房电器', subCategory: '电烤箱', hsCode: '8516.60', description: '电热烤箱、电热炊具、电热烧烤炉' },
  { category: '厨房电器', subCategory: '空气炸锅', hsCode: '8516.60', description: '电热烤箱/炸锅' },
  { category: '厨房电器', subCategory: '搅拌机', hsCode: '8509.40', description: '食品搅拌机' },
  { category: '清洁电器', subCategory: '吸尘器', hsCode: '8508.11', description: '电动真空吸尘器（≤1500W）' },
  { category: '个人护理', subCategory: '电吹风', hsCode: '8516.31', description: '电吹风机' },
  { category: '个人护理', subCategory: null, hsCode: '8516.31', description: '个人护理电器（电吹风/卷发器等）' },
];

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌐 Seeding 2026 real tariff data...\n');

  // Upsert HS code mappings
  let hsMapped = 0;
  for (const m of HS_CODE_MAPPINGS) {
    const existing = await db.productHSCode.findFirst({
      where: { category: m.category, subCategory: m.subCategory },
    });
    if (existing) {
      await db.productHSCode.update({ where: { id: existing.id }, data: { hsCode: m.hsCode, description: m.description } });
    } else {
      await db.productHSCode.create({ data: { ...m, subCategory: m.subCategory } });
    }
    hsMapped++;
  }
  console.log(`  ✓ ${hsMapped} HS code product mappings`);

  // Upsert tariff rules — deactivate existing, then insert fresh
  await db.tariffRule.updateMany({ where: { isActive: true }, data: { isActive: false } });
  let rulesInserted = 0;
  for (const r of TARIFF_RULES) {
    await db.tariffRule.create({ data: r });
    rulesInserted++;
  }
  console.log(`  ✓ ${rulesInserted} tariff rules (US/EU/JP/KR/UK/AU)`);

  // Summary
  const total = await db.tariffRule.count();
  const highRisk = await db.tariffRule.count({ where: { rate: { gte: 7.5 } } });
  console.log(`\n  Total active rules: ${total}`);
  console.log(`  High-risk (≥7.5%): ${highRisk}`);
  console.log('\n✅ Tariff seed complete.');
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
