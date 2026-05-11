/**
 * Product Recall Monitor — CPSC/US & Canada recalls affecting China-made appliances
 *
 * 美国 CPSC 官方 RSS 不稳定（404/403/API 下线）。
 * 改用江苏省进出口公平贸易综合预警平台 (CCPIT 贸促会)，每天转载 CPSC/Health Canada
 * 召回公告并翻译为中文，专门服务中国出口企业。
 *
 * Source: https://fairtrade.ccpitjs.org/col/col2618/index.html
 * Free, government-backed, no key required.
 *
 * Filters: 仅匹配小家电相关品类（厨房电器、清洁电器、加热电器、个护电器等）
 */

import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface ProductRecall {
  title: string;
  url: string;
  date: string;       // YYYY-MM-DD
  country: string;    // 美国 / 加拿大 / 美国和加拿大
  hazard: string;     // 火灾 / 烫伤 / 电击 / 割伤 / 其他
  productType: string;
  productName: string;
  remedy: string;
  source: string;
}

// ─── CCPIT Recall Listing ────────────────────────────────────────────────────────

const CCPIT_LIST_URL = 'https://fairtrade.ccpitjs.org/col/col2618/index.html?pageNum=-1';
const CCPIT_BASE = 'https://fairtrade.ccpitjs.org';

// Small appliance keywords in Chinese
const APPLIANCE_KEYWORDS = [
  '蒸汽清洁', '清洁机', '清洗机',
  '电风扇', '风扇', '暖风机', '取暖器', '加热器',
  '挂烫机', '蒸汽熨', '熨斗',
  '烧水壶', '电水壶', '水壶', '咖啡', '咖啡机', '咖啡壶',
  '搅拌', '榨汁', '豆浆', '料理', '破壁', '切碎',
  '烤面包', '多士炉', '烤炉', '微波', '烤箱', '空气炸',
  '电饭', '压力锅', '慢炖', '电磁炉', '电陶',
  '吸尘', '扫地', '拖地',
  '冰箱', '冰柜', '冷藏',
  '排插', '插排', '充电器', '充电宝', '电源', '适配器',
  '美容', '美发', '吹风', '卷发', '直发', '脱毛',
  '加湿', '除湿', '净化', '香薰',
  '电热毯', '电暖',
  'LED灯', '灯泡', '灯具',
];

function isSmallAppliance(title: string): boolean {
  return APPLIANCE_KEYWORDS.some(k => title.includes(k));
}

// ─── Fetch & Parse ───────────────────────────────────────────────────────────────

async function fetchCCPITList(): Promise<{ title: string; url: string; date: string }[]> {
  try {
    const res = await fetch(CCPIT_LIST_URL, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Parse article links:
    // <a href="/art/2026/5/11/art_2618_67806.html" class="titleA"><span class="STYLE1">[召回]</span>美国对中国产保温罐等实施召回</a>
    const linkPattern = /<a\s+href="(\/art\/\d{4}\/\d{1,2}\/\d{1,2}\/art_\d+_\d+\.html)"[^>]*class="titleA"[^>]*>([\s\S]*?)<\/a>/gi;
    const results: { title: string; url: string; date: string }[] = [];

    let match;
    while ((match = linkPattern.exec(html)) !== null) {
      const path = match[1];
      const rawTitle = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (!rawTitle.includes('召回')) continue;

      const dateMatch = path.match(/\/art\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);
      const date = dateMatch
        ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
        : '';

      results.push({ title: rawTitle, url: CCPIT_BASE + path, date });
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Parse Detail Page ───────────────────────────────────────────────────────────

async function fetchRecallDetail(url: string): Promise<{
  country: string;
  hazard: string;
  productName: string;
  remedy: string;
} | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Strip tags for text extraction
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

    // Extract country
    const countryMatch = text.match(/(美国|加拿大|美国和加拿大|欧盟|澳大利亚)(?:对|联合)/);
    const country = countryMatch ? countryMatch[1] : '美国';

    // Extract product name — usually in title or first paragraph
    const nameMatch = text.match(/对[中印越国]*产(.{2,30}?)实施召回/);
    const productName = nameMatch ? nameMatch[1].trim() : '';

    // Extract hazard
    const hazards = [
      { pattern: /火灾|着火|起火|自燃|过热|冒烟|熔化/, label: '火灾' },
      { pattern: /烫伤|烧伤|灼伤|高温|蒸汽喷/, label: '烫伤' },
      { pattern: /电击|触电|漏电|绝缘|接地/, label: '电击' },
      { pattern: /割伤|划伤|割裂|锐利|锋利|破裂|爆裂/, label: '割伤' },
      { pattern: /窒息|噎住|吞咽|误食|小零件|脱落/, label: '窒息' },
      { pattern: /跌倒|摔倒|翻倒|倾覆|不稳定/, label: '翻倒' },
      { pattern: /中毒|化学|铅|镉|邻苯|甲醛|有害物质/, label: '化学品' },
    ];
    const found = hazards.find(h => h.pattern.test(text));
    const hazard = found ? found.label : '其他安全风险';

    // Extract remedy
    const remedyPatterns = [
      { pattern: /退款/, label: '退款' },
      { pattern: /更换|换货|免费换/, label: '更换' },
      { pattern: /维修|修理|免费维修|免费修理/, label: '维修' },
    ];
    const foundRemedy = remedyPatterns.find(r => r.pattern.test(text));
    const remedy = foundRemedy ? foundRemedy.label : '联系厂商';

    return { country, hazard, productName, remedy };
  } catch {
    return null;
  }
}

// ─── Main Export ─────────────────────────────────────────────────────────────────

export async function fetchProductRecalls(): Promise<ProductRecall[]> {
  const list = await fetchCCPITList();
  if (list.length === 0) return [];

  const results: ProductRecall[] = [];

  // Only process small-appliance recalls (limit detail fetches to avoid hammering)
  const applianceList = list.filter(item => isSmallAppliance(item.title));

  for (const item of applianceList.slice(0, 10)) {
    const detail = await fetchRecallDetail(item.url);
    results.push({
      title: item.title,
      url: item.url,
      date: item.date,
      country: detail?.country || '美国',
      hazard: detail?.hazard || '其他安全风险',
      productType: '小家电',
      productName: detail?.productName || '',
      remedy: detail?.remedy || '联系厂商',
      source: 'CCPIT/CPSC',
    });

    // Polite delay between detail page fetches
    await new Promise(r => setTimeout(r, 500));
  }

  return results;
}

// ─── DB Sync ─────────────────────────────────────────────────────────────────────

export async function syncRecallsToDB(): Promise<number> {
  const recalls = await fetchProductRecalls();
  if (recalls.length === 0) return 0;

  let synced = 0;
  for (const recall of recalls) {
    try {
      const existing = await db.regulationChange.findFirst({
        where: { title: recall.title, source: 'CCPIT/CPSC' },
      });
      if (existing) continue;

      await db.regulationChange.create({
        data: {
          title: recall.title,
          source: 'CCPIT/CPSC',
          category: 'safety',
          description: `[${recall.hazard}] 产品: ${recall.productName}. 处理: ${recall.remedy}. 国家: ${recall.country}`,
          impactLevel: recall.hazard === '火灾' || recall.hazard === '电击' ? 'critical' : 'high',
          status: 'new',
          sourceUrl: recall.url,
          effectiveDate: recall.date,
        },
      });
      synced++;
    } catch { continue; }
  }
  return synced;
}

// Backward compatibility
export { fetchProductRecalls as fetchCPSCRecalls };
export { syncRecallsToDB as syncCPSCToDB };
