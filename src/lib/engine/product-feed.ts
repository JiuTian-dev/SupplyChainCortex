/**
 * Agent-Ready Product Feed — "让AI代理看到你的货"
 *
 * Generates structured product feeds in schema.org JSON-LD format
 * optimized for AI agent discovery (GEO — Generative Engine Optimization).
 *
 * 2026 context: AI agent shopping traffic +393% YoY, conversion +42% vs human.
 * Products must be discoverable by ChatGPT/Claude/Siri shopping agents.
 *
 * Formats:
 *   - JSON-LD (schema.org/Product) — for web embedding
 *   - Product Feed JSON — for API / MCP tool consumption
 *   - Google Merchant Center compatible feed
 */

import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface AgentProductFeed {
  /** Feed metadata */
  metadata: {
    generatedAt: string;
    version: string;
    totalProducts: number;
    feedUrl: string;
  };
  /** Individual product entries */
  products: AgentProductEntry[];
}

export interface AgentProductEntry {
  /** schema.org context */
  '@context'?: string;
  '@type'?: string;
  /** Core attributes */
  sku: string;
  name: string;
  description: string;
  /** Multi-language names */
  nameMultilingual?: Record<string, string>;
  /** Category */
  category: string;
  subCategory: string;
  /** Pricing */
  price: number;
  priceCurrency: string;
  priceValidUntil: string;
  /** Availability */
  availability: 'InStock' | 'OutOfStock' | 'PreOrder';
  inventoryQuantity: number;
  /** Physical attributes */
  weight: { value: number; unitText: string };
  dimensions?: { length: number; width: number; height: number; unitText: string };
  /** Origin & Compliance */
  countryOfOrigin: string;
  hsCode: string | null;
  certifications: string[];
  /** Shipping */
  shippingWeight: { value: number; unitText: string };
  estimatedDeliveryDays: number;
  /** Market attributes */
  targetMarkets: string[];
  /** AI agent discovery metadata */
  aiMetadata: {
    keywords: string[];
    useCase: string;
    competitorAsins: string[];
    marginTier: 'high' | 'medium' | 'low';
    restockFrequency: string;
    seasonalDemand: boolean;
    peakSeasons: string[];
  };
}

export type FeedFormat = 'json-ld' | 'json-api' | 'google-merchant';

// ─── Feed Builder ────────────────────────────────────────────────────────────────

export async function generateProductFeed(
  format: FeedFormat = 'json-api',
  maxProducts = 50,
): Promise<string> {
  const products = await db.product.findMany({
    include: {
      inventory: true,
      cost: true,
    },
    take: maxProducts,
  });

  const entries: AgentProductEntry[] = [];

  for (const p of products) {
    // Get HS code
    let hsCode: string | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hs = await (db as any).productHSCode?.findFirst({
        where: { category: p.category },
      });
      hsCode = hs?.hsCode || null;
    } catch { /* best-effort */ }

    // Get certifications
    let certifications: string[] = [];
    try {
      const certs = await db.complianceCert.findMany({
        where: { sku: p.sku, status: 'active' },
        select: { certName: true },
      });
      certifications = certs.map(c => c.certName);
    } catch { /* best-effort */ }

    // Infer keywords from name + category
    const keywords = inferKeywords(p.name, p.category, p.subCategory);

    const entry: AgentProductEntry = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      sku: p.sku,
      name: p.name,
      description: `${p.name} — ${p.category} > ${p.subCategory}. 产地: ${p.origin}. ${p.abcClass === 'A' ? '核心爆款产品' : p.abcClass === 'B' ? '稳定走量产品' : '长尾产品'}.`,
      category: p.category,
      subCategory: p.subCategory,
      price: p.sellingPrice,
      priceCurrency: 'USD',
      priceValidUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
      availability: p.inventory && p.inventory.quantity > 0 ? 'InStock' : 'OutOfStock',
      inventoryQuantity: p.inventory?.quantity || 0,
      weight: { value: p.weight, unitText: 'kg' },
      countryOfOrigin: p.origin,
      hsCode,
      certifications,
      shippingWeight: { value: p.weight * 1.3, unitText: 'kg' },
      estimatedDeliveryDays: 15,
      targetMarkets: ['US', 'EU', 'UK'],
      aiMetadata: {
        keywords,
        useCase: inferUseCase(p.category, p.subCategory),
        competitorAsins: [],
        marginTier: p.cost ? (p.cost.grossMargin > 0.5 ? 'high' : p.cost.grossMargin > 0.3 ? 'medium' : 'low') : 'medium',
        restockFrequency: p.inventory && p.inventory.turnoverDays < 30 ? '高频' : p.inventory && p.inventory.turnoverDays < 60 ? '中频' : '低频',
        seasonalDemand: /空调|风扇|加湿|暖|heater|cooler|fan/i.test(p.name),
        peakSeasons: inferPeakSeasons(p.name, p.category),
      },
    };

    entries.push(entry);
  }

  switch (format) {
    case 'json-ld':
      return entries.map(e => `<script type="application/ld+json">\n${JSON.stringify(e, null, 2)}\n</script>`).join('\n');
    case 'google-merchant':
      return buildGoogleMerchantFeed(entries);
    case 'json-api':
    default:
      return JSON.stringify({
        metadata: {
          generatedAt: new Date().toISOString(),
          version: '1.0.0',
          totalProducts: entries.length,
          feedUrl: '/api/product-feed',
        },
        products: entries,
      }, null, 2);
  }
}

function buildGoogleMerchantFeed(entries: AgentProductEntry[]): string {
  const lines = [
    'id\ttitle\tdescription\tprice\tavailability\tcondition\tlink\timage_link\tgtin',
  ];
  for (const e of entries) {
    lines.push([
      e.sku, e.name, e.description.slice(0, 200),
      `${e.price} ${e.priceCurrency}`,
      e.availability === 'InStock' ? 'in_stock' : 'out_of_stock',
      'new', '', '', '',
    ].join('\t'));
  }
  return lines.join('\n');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function inferKeywords(name: string, category: string, subCategory: string): string[] {
  const text = `${name} ${category} ${subCategory}`.toLowerCase();
  const kw: string[] = [];

  const maps: Record<string, string[]> = {
    'coffee': ['coffee maker', 'espresso machine', 'coffee brewer', 'cafetera'],
    'blender': ['blender', 'juicer', 'smoothie maker', 'licuadora'],
    'vacuum': ['vacuum cleaner', 'cordless vacuum', 'stick vacuum', 'aspiradora'],
    'air fryer': ['air fryer', 'oil less fryer', 'healthy cooker', 'freidora'],
    'humidifier': ['humidifier', 'air moisturizer', 'cool mist', 'humidificador'],
    'kettle': ['electric kettle', 'water boiler', 'tea kettle', 'hervidor'],
    'fan': ['tower fan', 'cooling fan', 'desk fan', 'ventilador'],
  };

  for (const [key, values] of Object.entries(maps)) {
    if (text.includes(key)) { kw.push(...values); break; }
  }
  if (kw.length === 0) kw.push(name.toLowerCase(), category.toLowerCase());
  return [...new Set(kw)].slice(0, 8);
}

function inferUseCase(category: string, subCategory: string): string {
  if (/kitchen|厨房|coffee|blender|cook|锅/i.test(category + subCategory)) return '厨房烹饪';
  if (/cleaning|清洁|vacuum|吸尘/i.test(category + subCategory)) return '家居清洁';
  if (/personal|个人|hair|beauty|美容/i.test(category + subCategory)) return '个人护理';
  if (/air|空净|purif|净化|humidif|加湿/i.test(category + subCategory)) return '空气管理';
  return '家居生活';
}

function inferPeakSeasons(name: string, category: string): string[] {
  const seasons: string[] = [];
  if (/空调|风扇|cooler|fan/i.test(name)) seasons.push('夏季(6-8月)');
  if (/加湿|humidif|取暖|heater|暖/i.test(name)) seasons.push('冬季(11-1月)');
  if (/空气炸锅|air fryer|grill|烤/i.test(name)) seasons.push('Prime Day(7月)', '黑五(11月)');
  if (/礼物|gift|按摩|massage/i.test(name)) seasons.push('圣诞季(12月)', '情人节(2月)');
  if (seasons.length === 0) seasons.push('全年稳定', 'Prime Day(7月)', '黑五(11月)');
  return seasons;
}

/**
 * Generate a single product's agent-ready card for MCP tool output.
 */
export async function getProductAgentCard(sku: string): Promise<AgentProductEntry | null> {
  const p = await db.product.findUnique({
    where: { sku },
    include: { inventory: true, cost: true },
  });
  if (!p) return null;

  let hsCode: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hs = await (db as any).productHSCode?.findFirst({ where: { category: p.category } });
    hsCode = hs?.hsCode || null;
  } catch { /* best-effort */ }

  return {
    sku: p.sku,
    name: p.name,
    description: `${p.category} > ${p.subCategory}`,
    category: p.category,
    subCategory: p.subCategory,
    price: p.sellingPrice,
    priceCurrency: 'USD',
    priceValidUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
    availability: p.inventory && p.inventory.quantity > 0 ? 'InStock' : 'OutOfStock',
    inventoryQuantity: p.inventory?.quantity || 0,
    weight: { value: p.weight, unitText: 'kg' },
    countryOfOrigin: p.origin,
    hsCode,
    certifications: [],
    shippingWeight: { value: p.weight * 1.3, unitText: 'kg' },
    estimatedDeliveryDays: 15,
    targetMarkets: ['US', 'EU', 'UK'],
    aiMetadata: {
      keywords: inferKeywords(p.name, p.category, p.subCategory),
      useCase: inferUseCase(p.category, p.subCategory),
      competitorAsins: [],
      marginTier: p.cost ? (p.cost.grossMargin > 0.5 ? 'high' : 'medium') : 'medium',
      restockFrequency: '中频',
      seasonalDemand: false,
      peakSeasons: inferPeakSeasons(p.name, p.category),
    },
  };
}
