/**
 * AI Supplier Discovery Engine — "1688上谁家能做这个？"
 *
 * Searches 1688/Alibaba/GlobalSources for product suppliers.
 * Evaluates by price, MOQ, lead time, certifications, geographic risk.
 * Generates ranked list with landed cost estimates and inquiry templates.
 *
 * Uses existing web_search tool — zero API cost.
 */

import { webSearch } from '@/lib/services/web-search.service';
import { runSimulation, type SimInput } from '@/lib/engine/financial-simulator';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface DiscoveredSupplier {
  name: string;
  platform: '1688' | 'Alibaba' | 'GlobalSources' | 'Other';
  location: string;
  priceCny: number;
  moq: number;
  leadTimeDays: number;
  certifications: string[];
  rating: number; // 0-5
  productUrl?: string;
  score: number; // 0-100 composite
  strengths: string[];
  weaknesses: string[];
}

export interface SupplierDiscoveryResult {
  productDescription: string;
  suppliers: DiscoveredSupplier[];
  estimatedLandedCost: {
    procurementCny: number;
    landedUsd: number;
    marginPct: number;
    targetPriceUsd: number;
  };
  inquiryTemplate: string;
  searchLinks?: Record<string, string>;
  disclaimer?: string;
  summary: string;
}

// ─── Main Discovery ──────────────────────────────────────────────────────────────

export async function discoverSuppliers(
  productDescription: string,
  targetMarket = 'US',
): Promise<SupplierDiscoveryResult> {
  const suppliers: DiscoveredSupplier[] = [];

  // Search across platforms
  const queries = [
    `${productDescription} 1688 工厂 批发`,
    `${productDescription} alibaba supplier manufacturer`,
    `${productDescription} 源头工厂 跨境 一件代发`,
  ];

  for (const q of queries) {
    try {
      const { results } = await webSearch(q);
      for (const r of results.slice(0, 5)) {
        const supplier = parseSupplierFromResult(r.title, r.snippet, r.url);
        if (supplier && !suppliers.find(s => s.name === supplier.name)) {
          suppliers.push(supplier);
        }
      }
    } catch { /* best-effort */ }
  }

  // Score and rank
  for (const s of suppliers) {
    s.score = computeSupplierScore(s);
  }
  suppliers.sort((a, b) => b.score - a.score);

  // Estimate landed cost using best supplier
  const bestSupplier = suppliers[0];
  const estimatedPrice = bestSupplier ? bestSupplier.priceCny : estimatePrice(productDescription);
  const simInput: SimInput = {
    productName: productDescription,
    procurementPriceCny: estimatedPrice,
    sellingPriceUsd: estimatedPrice * 6 / 7.2, // rough retail markup
    monthlySales: 300,
    market: targetMarket as 'US' | 'EU' | 'UK' | 'JP',
    weightKg: 1.5,
  };
  const sim = runSimulation(simInput);

  // Generate inquiry template
  const inquiryTemplate = generateInquiryTemplate(productDescription, bestSupplier);

  // Build direct search links for the user
  const searchLinks = {
    '1688搜索': `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(productDescription)}`,
    '阿里巴巴国际站': `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(productDescription)}`,
  };

  const summary = suppliers.length > 0
    ? `搜索到 ${suppliers.length} 条供应商线索。⚠️ 这些数据来自公开搜索结果，非实时数据库。建议点击下方链接直达1688/Alibaba查看完整商家信息和联系方式。`
    : `未在搜索结果中提取到结构化供应商数据。请直接使用下方链接在1688/Alibaba上搜索。`;

  return {
    productDescription,
    suppliers: suppliers.slice(0, 8),
    estimatedLandedCost: {
      procurementCny: sim.input.procurementPriceCny,
      landedUsd: sim.unitCost.totalLandedUsd,
      marginPct: sim.unitProfit.grossMarginPct,
      targetPriceUsd: sim.input.sellingPriceUsd,
    },
    inquiryTemplate,
    searchLinks,
    summary,
    disclaimer: '供应商数据来自公开网页搜索，非实时数据库。公司名称、报价、MOQ等信息可能与实际有出入。请通过下方链接直接访问平台核实，并使用询盘模板联系商家。',
  };
}

// ─── Parsing ─────────────────────────────────────────────────────────────────────

function parseSupplierFromResult(title: string, snippet: string, url: string): DiscoveredSupplier | null {
  const text = (title + ' ' + snippet).toLowerCase();

  // Detect platform
  let platform: DiscoveredSupplier['platform'] = 'Other';
  if (url.includes('1688.com')) platform = '1688';
  else if (url.includes('alibaba.com')) platform = 'Alibaba';
  else if (url.includes('globalsources.com')) platform = 'GlobalSources';

  // Extract price
  let priceCny = 0;
  const priceMatch = text.match(/[¥￥]\s*(\d+\.?\d*)/);
  if (priceMatch) priceCny = parseFloat(priceMatch[1]);

  // Extract MOQ
  let moq = 100;
  const moqMatch = text.match(/(\d+)\s*(个|件|台|pcs|pieces?|units?)/i);
  if (moqMatch) moq = parseInt(moqMatch[1], 10);

  // Extract location
  let location = '未知';
  const locMatch = text.match(/(深圳|广州|东莞|义乌|宁波|温州|杭州|佛山|中山|汕头|yiwu|shenzhen|guangzhou|dongguan|ningbo)/i);
  if (locMatch) location = locMatch[1];

  // Extract rating (if available)
  let rating = 3.5;
  const ratingMatch = text.match(/(\d+\.?\d*)\s*(分|星|star)/);
  if (ratingMatch) rating = Math.min(5, parseFloat(ratingMatch[1]));

  // Extract name
  let name = title.split(/[-—|·]/)[0].trim().slice(0, 40);
  if (name.length < 3) name = title.slice(0, 40);

  return {
    name,
    platform,
    location,
    priceCny: priceCny || estimatePrice(title),
    moq,
    leadTimeDays: estimateLeadTime(location),
    certifications: detectCertifications(text),
    rating,
    productUrl: url,
    score: 0,
    strengths: [],
    weaknesses: [],
  };
}

// ─── Scoring ─────────────────────────────────────────────────────────────────────

function computeSupplierScore(s: DiscoveredSupplier): number {
  let score = 50;

  // Price competitiveness (0-25)
  const expectedPrice = estimatePrice(s.name);
  if (s.priceCny > 0 && s.priceCny < expectedPrice * 0.8) score += 25;
  else if (s.priceCny < expectedPrice * 1.0) score += 18;
  else if (s.priceCny < expectedPrice * 1.2) score += 10;
  else score += 0;

  // Platform trust (0-15)
  if (s.platform === '1688') score += 12;
  else if (s.platform === 'Alibaba') score += 15;
  else if (s.platform === 'GlobalSources') score += 10;
  else score += 5;

  // Location proximity to ports (0-15)
  if (/深圳|东莞|广州|shenzhen|dongguan|guangzhou/i.test(s.location)) score += 15;
  else if (/宁波|义乌|ningbo|yiwu/i.test(s.location)) score += 12;
  else if (/佛山|中山|foshan/i.test(s.location)) score += 10;
  else score += 5;

  // Certifications (0-20)
  const certCount = s.certifications.length;
  score += Math.min(20, certCount * 5);

  // Rating (0-15)
  score += Math.round(s.rating * 3);

  // MOQ reasonableness (0-10)
  if (s.moq <= 100) score += 10;
  else if (s.moq <= 500) score += 7;
  else if (s.moq <= 1000) score += 4;

  // Compute strengths/weaknesses
  s.strengths = [];
  s.weaknesses = [];
  if (score >= 75) s.strengths.push('价格有竞争力', '地理位置靠近港口');
  if (certCount >= 2) s.strengths.push('认证资质齐全');
  if (s.rating >= 4.0) s.strengths.push('评分较高');
  if (s.moq > 1000) s.weaknesses.push(`MOQ较高(${s.moq}件)`);
  if (s.leadTimeDays > 20) s.weaknesses.push(`交期较长(${s.leadTimeDays}天)`);
  if (certCount === 0) s.weaknesses.push('无认证信息');
  if (s.priceCny === 0) s.weaknesses.push('价格不明确');

  return Math.min(100, Math.max(0, score));
}

// ─── Inquiry Template Generator ──────────────────────────────────────────────────

function generateInquiryTemplate(product: string, supplier?: DiscoveredSupplier): string {
  const supplierName = supplier?.name || '贵司';
  return `【询盘】${product} 采购需求

${supplierName} 您好，

我们在寻找 ${product} 的供应商，对贵司的产品很感兴趣。

请提供以下信息：
1. FOB报价（人民币/件）
2. 最小起订量（MOQ）
3. 交期（从下单到发货）
4. 产品认证（FCC/CE/UL/RoHS等）
5. 是否可以OEM贴牌？模具费多少？
6. 样品政策和费用

目标市场：美国Amazon，月销量预估 300-500 台。

期待您的回复。
[联系方式]`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function estimatePrice(product: string): number {
  const lower = product.toLowerCase();
  if (/coffee|咖啡/.test(lower)) return 85;
  if (/blender|榨汁|juicer/.test(lower)) return 45;
  if (/vacuum|吸尘/.test(lower)) return 120;
  if (/air fryer|空气炸锅/.test(lower)) return 95;
  if (/humidifier|加湿/.test(lower)) return 35;
  if (/kettle|水壶/.test(lower)) return 25;
  if (/fan|风扇/.test(lower)) return 40;
  if (/speaker|音箱/.test(lower)) return 55;
  return 50;
}

function estimateLeadTime(location: string): number {
  if (/深圳|东莞|shenzhen|dongguan/i.test(location)) return 15;
  if (/义乌|温州|yiwu/i.test(location)) return 18;
  if (/宁波|杭州|ningbo/i.test(location)) return 16;
  return 20;
}

function detectCertifications(text: string): string[] {
  const certs: string[] = [];
  if (/fcc/i.test(text)) certs.push('FCC');
  if (/ce\b/i.test(text)) certs.push('CE');
  if (/ul\b/i.test(text)) certs.push('UL');
  if (/rohs/i.test(text)) certs.push('RoHS');
  if (/fda/i.test(text)) certs.push('FDA');
  if (/iso\s*9001/i.test(text)) certs.push('ISO9001');
  if (/bsci/i.test(text)) certs.push('BSCI');
  return certs;
}

