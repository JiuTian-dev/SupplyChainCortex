/**
 * Page content audit — extracts visible text and component structure
 * to understand rendering without seeing the screen.
 */

import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('  CONSOLE ERROR:', msg.text());
  });
  page.on('pageerror', err => console.log('  PAGE ERROR:', err.message));

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(4000);

  // 1. Check page title
  const title = await page.title();
  console.log('Page title:', title);
  console.log('');

  // 2. Find all visible heading text
  const headings = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('h1,h2,h3,h4')).map(h => ({
      tag: h.tagName,
      text: h.textContent?.trim().slice(0, 80) || '',
    }));
  });
  console.log('=== Visible headings ===');
  headings.forEach(h => console.log(`  ${h.tag}: ${h.text}`));
  console.log('');

  // 3. Find key UI elements
  const elements = await page.evaluate(() => {
    const results: Record<string, boolean | string> = {};

    // MonitorStrip
    results['MonitorStrip visible'] = !!document.querySelector('.MonitorStrip') ||
      !!document.querySelector('[class*="monitor"]');
    results['汇率显示'] = !!document.body.textContent?.includes('USD') &&
      !!document.body.textContent?.includes('CNY');

    // Tabs
    const tabTriggers = document.querySelectorAll('[role="tab"]');
    results['Tab count'] = String(tabTriggers.length);
    const tabTexts = Array.from(tabTriggers).map(t => t.textContent?.trim()).join(', ');
    results['Tab labels'] = tabTexts;

    // DecisionCenter
    results['DecisionCenter visible'] = !!document.querySelector('[class*="DecisionCenter"]') ||
      document.body.textContent?.includes('决策执行中心') || 'false';
    results['决策卡片文字'] = document.body.textContent?.includes('立即执行') ? 'yes' : 'no';

    // ConfigToolbar
    results['ConfigToolbar visible'] = document.body.textContent?.includes('货币') ? 'yes' : 'no';
    results['配置滑块'] = document.querySelectorAll('[role="slider"]').length;

    // ErrorBoundary
    const errorBoundaries = document.querySelectorAll('[class*="ErrorBoundary"]');
    results['ErrorBoundary count'] = String(errorBoundaries.length);

    // Content length
    results['Body text length'] = String(document.body.textContent?.length || 0);

    return results;
  });

  console.log('=== UI elements ===');
  Object.entries(elements).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log('');

  // 4. Check for skeleton/loading states
  const skeletons = await page.evaluate(() =>
    document.querySelectorAll('[class*="skeleton"], [class*="Skeleton"]').length
  );
  console.log('Skeleton loaders visible:', skeletons);

  // 5. Check API data in DOM
  const dataPresence = await page.evaluate(() => {
    const text = document.body.textContent || '';
    return {
      healthScore: text.includes('健康库存') || text.includes('98'),
      portRisk: text.includes('高危') || text.includes('港口'),
      exchangeRate: text.includes('7.25') || text.includes('汇率'),
      decisionCards: text.includes('采纳') || text.includes('置信'),
    };
  });
  console.log('\n=== Data presence ===');
  Object.entries(dataPresence).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  await browser.close();
}

main().catch(err => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});
