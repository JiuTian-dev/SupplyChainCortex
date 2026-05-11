/**
 * SCFI Scraper — 上海出口集装箱运价指数
 *
 * SSE (上海航运交易所) 无免费 API（订阅 ¥15,000/年），数据以图片形式渲染。
 * 本模块从公开发布的财经新闻中提取每周 SCFI 数据。
 *
 * Priority:
 *   1. Mysteel 文章解析（每周五 15:30 后更新）
 *   2. 多个财经新闻源轮询
 *   3. 失败返回 null，上游降级到 DB → 静态基线
 *
 * Free, no API key required.
 */

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface SCFIRawData {
  date: string; // YYYY-MM-DD
  compositeIndex: number;
  weeklyChangePct: number;
  routes: {
    route: string;
    origin: string;
    destination: string;
    rate: number; // USD per container (FEU for US routes, TEU for others)
    container: 'FEU' | 'TEU';
    weeklyChange: number; // percentage
  }[];
  source: string; // URL of the parsed article
}

// ─── Constants ───────────────────────────────────────────────────────────────────

const SSE_BULLETIN = 'https://en.sse.net.cn/eninfo/Bulletin/index.shtml';

// Mysteel SCFI search — finds the latest article via their portal
const MYSTEEL_SEARCH = 'https://m.mysteel.com/search?keyword=SCFI';

// ─── HTML fetch helper ───────────────────────────────────────────────────────────

async function fetchHTML(url: string, timeout = 10000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeout),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

// ─── Parse SCFI data from text ───────────────────────────────────────────────────

function parseSCFIText(text: string): SCFIRawData | null {
  // Normalize: strip HTML tags for article text, keep for structured pages
  const clean = text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

  // Pattern 1: SCFI composite index — "SCFI综合指数报XXXX点" or "SCFI为XXXX.XX点"
  const indexPatterns = [
    /SCFI[^0-9]*?([\d,]+\.?\d*)\s*点/,
    /综合指数[^0-9]*?([\d,]+\.?\d*)\s*点/,
    /上海出口集装箱运价指数[^0-9]*?([\d,]+\.?\d*)/,
    /SCFI\s+(?:composite\s+)?index[^0-9]*?([\d,]+\.?\d*)/i,
  ];

  let compositeIndex = 0;
  for (const pattern of indexPatterns) {
    const m = clean.match(pattern);
    if (m) {
      compositeIndex = parseFloat(m[1].replace(/,/g, ''));
      break;
    }
  }
  if (compositeIndex < 100) return null; // invalid

  // Pattern 2: weekly change percentage
  const changePatterns = [
    /周(?:环比)?(?:上涨|下跌|下跌|涨|跌)([\d.]+)%/,
    /较上期(?:上涨|下跌|涨|跌)([\d.]+)%/,
    /\+(?:[\d.]+)%/,
    /\+([\d.]+)%/,
    /week[-\s]?(?:on|over)?[-\s]?week[^0-9]*?\+?([\d.]+)%/i,
  ];

  let weeklyChangePct = 0;
  for (const pattern of changePatterns) {
    const m = clean.match(pattern);
    if (m) {
      weeklyChangePct = parseFloat(m[1]);
      break;
    }
  }
  // If text says "下跌" anywhere near the change, negate it
  if (/(?:下跌|跌|fall|decline|drop)/i.test(clean.slice(0, 500))) {
    weeklyChangePct = -Math.abs(weeklyChangePct);
  }

  // Pattern 3: Route rates
  const routes: SCFIRawData['routes'] = [];

  const routeDefs: { pattern: RegExp; route: string; origin: string; destination: string; container: 'FEU' | 'TEU' }[] = [
    { pattern: /美西[^0-9]*?\$?([\d,]+\.?\d*)\s*(?:美元\/FEU|\/FEU|美元)/, route: '上海→洛杉矶/长滩', origin: '上海', destination: '洛杉矶', container: 'FEU' },
    { pattern: /美东[^0-9]*?\$?([\d,]+\.?\d*)\s*(?:美元\/FEU|\/FEU|美元)/, route: '上海→纽约/新泽西', origin: '上海', destination: '纽约', container: 'FEU' },
    { pattern: /欧洲[^0-9]*?\$?([\d,]+\.?\d*)\s*(?:美元\/TEU|\/TEU|美元)/, route: '上海→汉堡/鹿特丹', origin: '上海', destination: '汉堡', container: 'TEU' },
    { pattern: /地中海[^0-9]*?\$?([\d,]+\.?\d*)\s*(?:美元\/TEU|\/TEU|美元)/, route: '深圳→地中海', origin: '深圳', destination: '地中海', container: 'TEU' },
  ];

  for (const def of routeDefs) {
    const m = clean.match(def.pattern);
    if (m) {
      routes.push({
        route: def.route,
        origin: def.origin,
        destination: def.destination,
        rate: parseFloat(m[1].replace(/,/g, '')),
        container: def.container,
        weeklyChange: 0, // filled below if found
      });
    }
  }

  if (compositeIndex === 0 && routes.length === 0) return null;

  // Try to extract date from text
  let date = new Date().toISOString().split('T')[0];
  const dateMatch = clean.match(/(\d{4})[年-](\d{1,2})[月-](\d{1,2})[日号]/);
  if (dateMatch) {
    const [_, y, m, d] = dateMatch;
    date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return { date, compositeIndex, weeklyChangePct, routes, source: 'mysteel' };
}

// ─── Main scrape function ────────────────────────────────────────────────────────

export async function fetchSCFI(): Promise<SCFIRawData | null> {
  // Strategy 1: Direct SSE bulletin page
  const sseHTML = await fetchHTML(SSE_BULLETIN, 10000);
  if (sseHTML) {
    const result = parseSCFIText(sseHTML);
    if (result && result.routes.length >= 2) {
      result.source = SSE_BULLETIN;
      return result;
    }
  }

  // Strategy 2: Mysteel search — find latest SCFI article
  const mysteelHTML = await fetchHTML(MYSTEEL_SEARCH, 10000);
  if (mysteelHTML) {
    // Extract the first article link matching SCFI weekly report
    const linkMatch = mysteelHTML.match(/href="(\/a\/\d+\/[^"]+SCFI[^"]*)"|href="(\/a\/\d+\/[^"]+运价[^"]*)"/i);
    if (linkMatch) {
      const articlePath = linkMatch[1] || linkMatch[2];
      const articleUrl = `https://m.mysteel.com${articlePath}`;
      const articleHTML = await fetchHTML(articleUrl, 10000);
      if (articleHTML) {
        const result = parseSCFIText(articleHTML);
        if (result) {
          result.source = articleUrl;
          return result;
        }
      }
    }

    // Try parsing the search results page directly (may contain snippets)
    const directResult = parseSCFIText(mysteelHTML);
    if (directResult) {
      directResult.source = MYSTEEL_SEARCH;
      return directResult;
    }
  }

  // Strategy 3: Try wedoany.com (another free aggregator)
  const wedoanyHTML = await fetchHTML('https://www.wedoany.com/search?q=SCFI', 10000);
  if (wedoanyHTML) {
    const result = parseSCFIText(wedoanyHTML);
    if (result) {
      result.source = 'wedoany.com';
      return result;
    }
  }

  return null;
}

/**
 * Convert SCFI raw data into FreightRate format for freight.service.ts
 */
export function scfiToFreightRates(data: SCFIRawData): {
  route: string;
  origin: string;
  destination: string;
  rate40GP: number;
  rate20GP: number;
  trend: 'rising' | 'falling' | 'stable';
  changePct: number;
}[] {
  return data.routes.map((r) => {
    // FEU ≈ 40GP, TEU ≈ 20GP. For TEU routes, estimate 40GP as ~1.35x TEU
    const rate40GP = r.container === 'FEU' ? r.rate : Math.round(r.rate * 1.35);
    const rate20GP = r.container === 'TEU' ? r.rate : Math.round(r.rate / 1.35);

    return {
      route: r.route,
      origin: r.origin,
      destination: r.destination,
      rate40GP,
      rate20GP,
      trend: r.weeklyChange > 2 ? 'rising' : r.weeklyChange < -2 ? 'falling' : 'stable',
      changePct: r.weeklyChange,
    };
  });
}
