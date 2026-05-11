/**
 * CPSC Recall Monitor — 美国消费品安全委员会召回数据
 *
 * CPSC 每天发布消费品召回公告，影响小家电出口合规。
 * 通过 CPSC 官网公开 RSS/JSON 获取，免费合法。
 *
 * Source: https://www.cpsc.gov/Newsroom/News-Releases
 * RSS feed: https://www.cpsc.gov/zhTiles-CPSCCatalog/Newsroom-Recall-RSS-Feed
 *
 * 本项目之前仅有 DB 静态占位 (sku='CPSC-ALERT')，本模块补充实时数据源。
 */

import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface CPSCRecallAlert {
  title: string;
  url: string;
  date: string;
  hazard: string;
  productType: string;
  remedy: string;
  source: string;
}

// ─── CPSC RSS Feed ──────────────────────────────────────────────────────────────

const CPSC_RSS = 'https://www.cpsc.gov/zhTiles-CPSCCatalog/Newsroom-Recall-RSS-Feed';

async function fetchCPSCFeed(): Promise<CPSCRecallAlert[] | null> {
  try {
    const res = await fetch(CPSC_RSS, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const xml = await res.text();

    const alerts: CPSCRecallAlert[] = [];
    // Parse RSS XML: <item><title>, <link>, <pubDate>, <description>
    const items = xml.split('<item>').slice(1);

    for (const item of items.slice(0, 10)) { // latest 10
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
      const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/);

      if (!titleMatch || !linkMatch) continue;

      const title = decodeEntities(titleMatch[1]);
      const description = descMatch ? decodeEntities(descMatch[1]) : '';
      const dateStr = dateMatch ? new Date(dateMatch[1]).toISOString().split('T')[0] : '';

      // Extract hazard type from description
      const hazard = extractHazard(description);
      const productType = isSmallAppliance(title, description) ? '小家电' : '其他消费品';
      const remedy = extractRemedy(description);

      if (productType === '小家电') {
        alerts.push({
          title,
          url: linkMatch[1],
          date: dateStr,
          hazard,
          productType,
          remedy,
          source: 'CPSC RSS',
        });
      }
    }

    return alerts.length > 0 ? alerts : null;
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function isSmallAppliance(title: string, description: string): boolean {
  const text = (title + ' ' + description).toLowerCase();
  const keywords = [
    'blender', 'mixer', 'coffee', 'toaster', 'kettle', 'juicer',
    'fan', 'heater', 'iron', 'vacuum', 'cooker', 'grill',
    'blender', 'mixer', '搅拌', '咖啡', '水壶', '烤', '风扇',
    '加热器', '熨斗', '吸尘', '锅', '榨汁', '微波',
  ];
  return keywords.some(k => text.includes(k));
}

function extractHazard(description: string): string {
  const text = description.toLowerCase();
  if (text.includes('fire') || text.includes('burn') || text.includes('flame') || text.includes('着火') || text.includes('火灾')) return '火灾';
  if (text.includes('shock') || text.includes('electric') || text.includes('触电') || text.includes('电击')) return '电击';
  if (text.includes('laceration') || text.includes('cut') || text.includes('割伤') || text.includes('切伤')) return '割伤';
  if (text.includes('choking') || text.includes('窒息') || text.includes('噎住')) return '窒息';
  if (text.includes('fall') || text.includes('tip') || text.includes('倾倒') || text.includes('翻倒')) return '翻倒';
  return '其他安全风险';
}

function extractRemedy(description: string): string {
  const text = description.toLowerCase();
  if (text.includes('refund') || text.includes('退款')) return '退款';
  if (text.includes('replace') || text.includes('更换')) return '更换';
  if (text.includes('repair') || text.includes('修理') || text.includes('维修')) return '维修';
  return '联系厂商';
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, ''); // strip remaining HTML tags
}

// ─── Main Export ─────────────────────────────────────────────────────────────────

export async function fetchCPSCRecalls(): Promise<CPSCRecallAlert[]> {
  try {
    const alerts = await fetchCPSCFeed();
    return alerts || [];
  } catch {
    return [];
  }
}

/**
 * Sync CPSC alerts to DB for compliance dashboard.
 */
export async function syncCPSCToDB(): Promise<number> {
  const alerts = await fetchCPSCRecalls();
  if (alerts.length === 0) return 0;

  let synced = 0;
  for (const alert of alerts) {
    try {
      // Check for duplicates by title
      const existing = await db.regulationChange.findFirst({
        where: { title: alert.title, source: 'CPSC' },
      });
      if (existing) continue;

      await db.regulationChange.create({
        data: {
          title: alert.title,
          source: 'CPSC',
          category: 'safety',
          description: `[${alert.hazard}] ${alert.remedy}`,
          impactLevel: 'high',
          status: 'new',
          sourceUrl: alert.url,
          effectiveDate: alert.date,
        },
      });
      synced++;
    } catch { continue; }
  }
  return synced;
}
