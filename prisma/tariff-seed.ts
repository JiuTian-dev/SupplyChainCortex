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
 *   8414.51  — Electric fans
 *   8422.11  — Dishwashers
 *   8450.11  — Washing machines (≤10kg)
 *   8508.11  — Vacuum cleaners (≤1500W)
 *   8508.19  — Vacuum cleaners (>1500W)
 *   8508.60  — Robot vacuum cleaners
 *   8508.70  — Vacuum cleaner parts
 *   8509.40  — Food grinders/mixers/juicers
 *   8509.80  — Other electro-mechanical appliances (coffee grinders)
 *   8516.10  — Electric water heaters
 *   8516.31  — Hair dryers
 *   8516.32  — Hair straighteners/curlers
 *   8516.40  — Electric irons
 *   8516.60  — Electric ovens/cookers/grills/pressure cookers
 *   8516.71  — Coffee/tea makers
 *   8516.72  — Toasters
 *   8516.79  — Other electro-thermic (kettles, air fryers, rice cookers, heaters)
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

  // ── US Section 301 List 1 (priority 1 — 25%) — New HS codes ───────────────
  {
    countryCode: 'US', countryName: '美国', hsCode: '8516.32',
    rate: 25.0, rateType: 'additional', tradeAgreement: 'Section301-list1',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2018-07-06', effectiveTo: null, priority: 1,
    notes: 'Section 301 List 1: hair straighteners/curlers. 25% since 2018.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8516.40',
    rate: 25.0, rateType: 'additional', tradeAgreement: 'Section301-list1',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2018-07-06', effectiveTo: null, priority: 1,
    notes: 'Section 301 List 1: electric irons. 25% since 2018.',
  },

  // ── US Section 301 List 3 (priority 1 — 7.5%) — New HS codes ─────────────
  {
    countryCode: 'US', countryName: '美国', hsCode: '8508.60',
    rate: 7.5, rateType: 'additional', tradeAgreement: 'Section301-list3',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2024-01-01', effectiveTo: null, priority: 1,
    notes: 'Section 301 List 3: robot vacuum cleaners. Originally 25%, reduced via exclusions.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8508.70',
    rate: 7.5, rateType: 'additional', tradeAgreement: 'Section301-list3',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2024-01-01', effectiveTo: null, priority: 1,
    notes: 'Section 301 List 3: vacuum cleaner parts.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8509.80',
    rate: 7.5, rateType: 'additional', tradeAgreement: 'Section301-list3',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2024-01-01', effectiveTo: null, priority: 1,
    notes: 'Section 301 List 3: other electro-mechanical (coffee grinders).',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8516.10',
    rate: 7.5, rateType: 'additional', tradeAgreement: 'Section301-list3',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2024-01-01', effectiveTo: null, priority: 1,
    notes: 'Section 301 List 3: electric water heaters.',
  },

  // ── US Section 301 List 4B (priority 1 — 7.5%) ────────────────────────────
  {
    countryCode: 'US', countryName: '美国', hsCode: '8414.51',
    rate: 7.5, rateType: 'additional', tradeAgreement: 'Section301-list4b',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2024-01-01', effectiveTo: null, priority: 1,
    notes: 'Section 301 List 4B: electric fans. Reduced from 15% to 7.5% under Phase One.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8422.11',
    rate: 7.5, rateType: 'additional', tradeAgreement: 'Section301-list4b',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2024-01-01', effectiveTo: null, priority: 1,
    notes: 'Section 301 List 4B: dishwashers. Also subject to AD/CVD investigation.',
  },

  // ── IEEPA/Fentanyl Emergency Tariff (priority 1 — 10%, all China goods) ──
  {
    countryCode: 'US', countryName: '美国', hsCode: '8414.51',
    rate: 10.0, rateType: 'additional', tradeAgreement: 'IEEPA-Fentanyl',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-02-04', effectiveTo: null, priority: 1,
    notes: 'IEEPA fentanyl emergency: 10% additional on all China-origin goods.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8422.11',
    rate: 10.0, rateType: 'additional', tradeAgreement: 'IEEPA-Fentanyl',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-02-04', effectiveTo: null, priority: 1,
    notes: 'IEEPA fentanyl emergency: 10% additional on all China-origin goods.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8450.11',
    rate: 10.0, rateType: 'additional', tradeAgreement: 'IEEPA-Fentanyl',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-02-04', effectiveTo: null, priority: 1,
    notes: 'IEEPA fentanyl emergency: 10% additional on all China-origin goods.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8508.60',
    rate: 10.0, rateType: 'additional', tradeAgreement: 'IEEPA-Fentanyl',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-02-04', effectiveTo: null, priority: 1,
    notes: 'IEEPA fentanyl emergency: 10% additional on all China-origin goods.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8508.70',
    rate: 10.0, rateType: 'additional', tradeAgreement: 'IEEPA-Fentanyl',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-02-04', effectiveTo: null, priority: 1,
    notes: 'IEEPA fentanyl emergency: 10% additional on all China-origin goods.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8509.80',
    rate: 10.0, rateType: 'additional', tradeAgreement: 'IEEPA-Fentanyl',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-02-04', effectiveTo: null, priority: 1,
    notes: 'IEEPA fentanyl emergency: 10% additional on all China-origin goods.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8516.10',
    rate: 10.0, rateType: 'additional', tradeAgreement: 'IEEPA-Fentanyl',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-02-04', effectiveTo: null, priority: 1,
    notes: 'IEEPA fentanyl emergency: 10% additional on all China-origin goods.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8516.32',
    rate: 10.0, rateType: 'additional', tradeAgreement: 'IEEPA-Fentanyl',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-02-04', effectiveTo: null, priority: 1,
    notes: 'IEEPA fentanyl emergency: 10% additional on all China-origin goods.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8516.40',
    rate: 10.0, rateType: 'additional', tradeAgreement: 'IEEPA-Fentanyl',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-02-04', effectiveTo: null, priority: 1,
    notes: 'IEEPA fentanyl emergency: 10% additional on all China-origin goods.',
  },

  // ── US MFN base rates (priority 3) — New HS codes ────────────────────────
  {
    countryCode: 'US', countryName: '美国', hsCode: '8414.51',
    rate: 2.3, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 3,
    notes: 'US MFN base rate for electric fans.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8422.11',
    rate: 0, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 3,
    notes: 'US MFN base rate for dishwashers (duty-free heading).',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8450.11',
    rate: 0, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 3,
    notes: 'US MFN base rate for washing machines (duty-free). Separate AD/CVD may apply.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8508.60',
    rate: 0, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 3,
    notes: 'US MFN base rate for robot vacuums (duty-free heading).',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8508.70',
    rate: 0, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 3,
    notes: 'US MFN base rate for vacuum parts (duty-free heading).',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8509.80',
    rate: 3.5, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 3,
    notes: 'US MFN base rate for other electro-mechanical appliances.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8516.10',
    rate: 2.5, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 3,
    notes: 'US MFN base rate for electric water heaters.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8516.32',
    rate: 3.9, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 3,
    notes: 'US MFN base rate for hair straighteners/curlers.',
  },
  {
    countryCode: 'US', countryName: '美国', hsCode: '8516.40',
    rate: 3.9, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 3,
    notes: 'US MFN base rate for electric irons.',
  },

  // ── EU MFN (priority 2) — New HS codes ───────────────────────────────────
  {
    countryCode: 'EU', countryName: '欧盟', hsCode: '8414.51',
    rate: 2.3, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 2,
    notes: 'EU MFN rate for electric fans.',
  },
  {
    countryCode: 'EU', countryName: '欧盟', hsCode: '8422.11',
    rate: 0, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 2,
    notes: 'EU MFN rate for dishwashers (duty-free).',
  },
  {
    countryCode: 'EU', countryName: '欧盟', hsCode: '8450.11',
    rate: 0, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 2,
    notes: 'EU MFN rate for washing machines (duty-free).',
  },
  {
    countryCode: 'EU', countryName: '欧盟', hsCode: '8508.60',
    rate: 2.2, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 2,
    notes: 'EU MFN rate for robot vacuum cleaners.',
  },
  {
    countryCode: 'EU', countryName: '欧盟', hsCode: '8508.70',
    rate: 2.2, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 2,
    notes: 'EU MFN rate for vacuum cleaner parts.',
  },
  {
    countryCode: 'EU', countryName: '欧盟', hsCode: '8509.80',
    rate: 2.7, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 2,
    notes: 'EU MFN rate for coffee grinders/other electromechanical.',
  },
  {
    countryCode: 'EU', countryName: '欧盟', hsCode: '8516.32',
    rate: 2.7, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 2,
    notes: 'EU MFN rate for hair straighteners/curlers.',
  },
  {
    countryCode: 'EU', countryName: '欧盟', hsCode: '8516.40',
    rate: 2.7, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 2,
    notes: 'EU MFN rate for electric irons.',
  },
  {
    countryCode: 'EU', countryName: '欧盟', hsCode: '8516.10',
    rate: 2.7, rateType: 'MFN', tradeAgreement: 'WTO-MFN',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2020-01-01', effectiveTo: null, priority: 2,
    notes: 'EU MFN rate for electric water heaters.',
  },

  // ── Japan RCEP (priority 2 — FTA preferential) — New HS codes ────────────
  {
    countryCode: 'JP', countryName: '日本', hsCode: '8414.51',
    rate: 0, rateType: 'FTA', tradeAgreement: 'RCEP-JP',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-04-01', effectiveTo: null, priority: 2,
    notes: 'RCEP 5th year: Japan zero tariff on electric fans.',
  },
  {
    countryCode: 'JP', countryName: '日本', hsCode: '8422.11',
    rate: 0, rateType: 'FTA', tradeAgreement: 'RCEP-JP',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-04-01', effectiveTo: null, priority: 2,
    notes: 'RCEP 5th year: Japan zero tariff on dishwashers.',
  },
  {
    countryCode: 'JP', countryName: '日本', hsCode: '8450.11',
    rate: 0, rateType: 'FTA', tradeAgreement: 'RCEP-JP',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-04-01', effectiveTo: null, priority: 2,
    notes: 'RCEP 5th year: Japan zero tariff on washing machines.',
  },
  {
    countryCode: 'JP', countryName: '日本', hsCode: '8509.80',
    rate: 0, rateType: 'FTA', tradeAgreement: 'RCEP-JP',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-04-01', effectiveTo: null, priority: 2,
    notes: 'RCEP 5th year: Japan zero tariff on coffee grinders.',
  },

  // ── Korea RCEP (priority 2) — New HS codes ───────────────────────────────
  {
    countryCode: 'KR', countryName: '韩国', hsCode: '8509.80',
    rate: 0, rateType: 'FTA', tradeAgreement: 'RCEP-KR',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2025-04-01', effectiveTo: null, priority: 2,
    notes: 'RCEP Phase 5: Korea zero tariff on coffee grinders.',
  },

  // ── UK Global Tariff (priority 2) — New HS codes ─────────────────────────
  {
    countryCode: 'UK', countryName: '英国', hsCode: '8509.80',
    rate: 2.0, rateType: 'MFN', tradeAgreement: 'UK-Global-Tariff',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2024-01-01', effectiveTo: null, priority: 2,
    notes: 'UK Global Tariff: coffee grinders.',
  },

  // ── Australia ChAFTA (priority 2) — New HS codes ─────────────────────────
  {
    countryCode: 'AU', countryName: '澳大利亚', hsCode: '8509.80',
    rate: 0, rateType: 'FTA', tradeAgreement: 'ChAFTA',
    originCountry: 'CN', isActive: true,
    effectiveFrom: '2019-01-01', effectiveTo: null, priority: 2,
    notes: 'ChAFTA: zero tariff on coffee grinders since 2019.',
  },
];

// ─── HS Code Product Category Mapping ──────────────────────────────────────────

interface HSCodeMapping {
  category: string;
  subCategory: string | null;
  hsCode: string;
  description: string;
  section?: string | null; // e.g. '301-list1', '301-list3', '301-list4b', null = exempt
}

const HS_CODE_MAPPINGS: HSCodeMapping[] = [
  // ═══ 厨房电器 (Kitchen Appliances) ═══════════════════════════════════════
  // 8509 — Electromechanical kitchen appliances
  { category: '厨房电器', subCategory: '榨汁机', hsCode: '8509.40', description: '食品研磨机及搅拌机；水果或蔬菜的榨汁机', section: '301-list3' },
  { category: '厨房电器', subCategory: '搅拌机', hsCode: '8509.40', description: '食品搅拌机/料理机', section: '301-list3' },
  { category: '厨房电器', subCategory: '食物处理器', hsCode: '8509.40', description: '食物处理器', section: '301-list3' },
  { category: '厨房电器', subCategory: '台式搅拌机', hsCode: '8509.40', description: '台式搅拌机/厨师机', section: '301-list3' },
  { category: '厨房电器', subCategory: '电动咖啡研磨机', hsCode: '8509.80', description: '电动咖啡研磨机', section: '301-list3' },
  // 8516 — Electric heating kitchen appliances
  { category: '厨房电器', subCategory: '咖啡机', hsCode: '8516.71', description: '咖啡壶或茶壶', section: '301-list3' },
  { category: '厨房电器', subCategory: '烤面包机', hsCode: '8516.72', description: '烤面包器', section: '301-list3' },
  { category: '厨房电器', subCategory: '电饭煲', hsCode: '8516.79', description: '电饭煲', section: '301-list3' },
  { category: '厨房电器', subCategory: '电水壶', hsCode: '8516.79', description: '电热水壶', section: '301-list3' },
  { category: '厨房电器', subCategory: '空气炸锅', hsCode: '8516.79', description: '空气炸锅（归类于其他电热器具）', section: '301-list3' },
  { category: '厨房电器', subCategory: '电烤箱', hsCode: '8516.60', description: '电热烤箱、电热炊具、电热烧烤炉', section: '301-list1' },
  { category: '厨房电器', subCategory: '电压力锅', hsCode: '8516.60', description: '电压力锅', section: '301-list1' },
  // 8422/8450 — Dishwashers & washing machines
  { category: '厨房电器', subCategory: '洗碗机', hsCode: '8422.11', description: '家用洗碗机', section: '301-list4b' },
  { category: '厨房电器', subCategory: '洗衣机', hsCode: '8450.11', description: '家用洗衣机（≤10kg）', section: null },

  // ═══ 清洁电器 (Cleaning Appliances) ═════════════════════════════════════
  { category: '清洁电器', subCategory: '吸尘器', hsCode: '8508.11', description: '电动真空吸尘器（≤1500W）', section: '301-list3' },
  { category: '清洁电器', subCategory: '大功率吸尘器', hsCode: '8508.19', description: '电动真空吸尘器（>1500W）', section: '301-list3' },
  { category: '清洁电器', subCategory: '扫地机器人', hsCode: '8508.60', description: '机器人吸尘器', section: '301-list3' },
  { category: '清洁电器', subCategory: '吸尘器配件', hsCode: '8508.70', description: '真空吸尘器配件', section: '301-list3' },

  // ═══ 个人护理 (Personal Care) ════════════════════════════════════════════
  { category: '个人护理', subCategory: '电吹风', hsCode: '8516.31', description: '电吹风机', section: '301-list1' },
  { category: '个人护理', subCategory: '直发器/卷发器', hsCode: '8516.32', description: '头发整理器具（直发器、卷发器）', section: '301-list1' },
  { category: '个人护理', subCategory: '电熨斗', hsCode: '8516.40', description: '电熨斗', section: '301-list1' },
  { category: '个人护理', subCategory: null, hsCode: '8516.31', description: '个人护理电器（电吹风/卷发器等）', section: '301-list1' },

  // ═══ 环境电器 (Environment Appliances) ══════════════════════════════════
  { category: '环境电器', subCategory: '电暖器', hsCode: '8516.79', description: '电暖器/取暖器', section: '301-list3' },
  { category: '环境电器', subCategory: '电热水器', hsCode: '8516.10', description: '电热水器', section: '301-list3' },
  { category: '环境电器', subCategory: '电风扇', hsCode: '8414.51', description: '电风扇', section: '301-list4b' },
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
      await db.productHSCode.update({ where: { id: existing.id }, data: { hsCode: m.hsCode, description: m.description, section: m.section ?? null } });
    } else {
      await db.productHSCode.create({ data: { ...m, subCategory: m.subCategory, section: m.section ?? null } });
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
