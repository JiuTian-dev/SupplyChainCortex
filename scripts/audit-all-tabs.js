/**
 * Full-site DOM audit — finds dead elements, empty containers, layout issues.
 * Run: node scripts/audit-all-tabs.js
 * Output: a structured report of problems to fix.
 */

const { chromium } = require('playwright');

const BASE = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const allIssues = [];

  function issue(tab, severity, desc) {
    allIssues.push({ tab, severity, desc });
  }

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);

  // ====== GLOBAL: check top-level dead elements ======
  console.log('=== GLOBAL ===');

  // Check ConfigToolbar —货币/时间窗 actually wired?
  const configBtns = await page.locator('button').allTextContents();
  const toolbarTexts = [...new Set(configBtns.filter(t => t && t.length < 15))];
  console.log('Config bar buttons:', toolbarTexts.join(' | '));

  // Find ALL buttons with no text (icon-only, no aria-label)
  const buttonCount = await page.locator('button').count();
  let emptyButtons = 0;
  for (let i = 0; i < buttonCount; i++) {
    const text = (await page.locator('button').nth(i).textContent()) || '';
    const aria = await page.locator('button').nth(i).getAttribute('aria-label');
    if (!text.trim() && !aria) emptyButtons++;
  }
  if (emptyButtons > 0) issue('全局', 'warning', `${emptyButtons} 个按钮无文字标签且无 aria-label`);

  // ====== AUDIT EACH TAB ======
  const tabs = [
    { name: '库存', selector: '库存' },
    { name: '成本', selector: '成本' },
    { name: '物流', selector: '物流' },
    { name: '销售', selector: '销售' },
    { name: '供应商', selector: '供应商' },
    { name: '风险仪表', selector: '风险仪表' },
    { name: '概览', selector: '概览' },
  ];

  for (const tab of tabs) {
    console.log(`\n=== ${tab.name} ===`);
    try {
      await page.locator('button[role="tab"]:has-text("' + tab.selector + '")').click({ timeout: 5000 });
      await page.waitForTimeout(2000);
    } catch { issue(tab.name, 'critical', 'Tab 无法切换'); continue; }

    // 1. Check for empty/zero-value metric cards
    const metricCards = await page.locator('[class*="MetricCard"], [class*="metric"]').allTextContents();
    for (const card of metricCards) {
      if (/\\$0|¥0|0\.00|0台|0项|NaN|undefined|null/.test(card)) {
        issue(tab.name, 'warning', '指标卡片显示0值: ' + card.slice(0, 60));
      }
    }

    // 2. Check chart count
    const charts = await page.locator('.recharts-wrapper').count();
    if (charts === 0) issue(tab.name, 'critical', '无 Recharts 图表');

    // 3. Check for empty containers (large divs with no content)
    const containers = await page.locator('[class*="space-y"] > div, [class*="card"]').all();
    for (const c of containers.slice(0, 20)) {
      const text = (await c.textContent()) || '';
      if (text.trim().length === 0) {
        const cls = await c.getAttribute('class');
        issue(tab.name, 'warning', '空容器: ' + (cls || '').slice(0, 60));
      }
    }

    // 4. Check ProductFilter coverage
    const hasFilter = await page.locator('button:has-text("筛选产品")').count();
    if (hasFilter === 0 && ['库存','成本','物流','销售','供应商'].includes(tab.name)) {
      issue(tab.name, 'warning', '缺少 ProductFilter');
    }

    // 5. Check for extremely wide elements (overflow)
    const wideElements = await page.evaluate(() => {
      const issues = [];
      document.querySelectorAll('*').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > window.innerWidth + 10) {
          issues.push(el.className?.slice(0, 50) + ' width=' + rect.width + 'px');
        }
      });
      return issues.slice(0, 5);
    });
    for (const w of wideElements) issue(tab.name, 'info', '元素溢出屏幕: ' + w);

    // 6. Check for z-index stacking issues (fixed overlays that don't close)
    const overlays = await page.locator('.fixed.inset-0.z-40, .fixed.inset-0.z-50').count();
    if (overlays > 0) issue(tab.name, 'info', `${overlays} 个未关闭的遮罩层残留`);

    // 7. Count total visible elements (too many = clutter)
    const visibleDivs = await page.evaluate(() =>
      document.querySelectorAll('div:not([aria-hidden="true"])').length
    );
    if (visibleDivs > 500) issue(tab.name, 'info', `DOM 元素过多: ${visibleDivs} 个 div`);
  }

  // ====== REPORT ======
  console.log('\n\n═══════════════════════════════════');
  console.log('  AUDIT REPORT: ' + allIssues.length + ' issues found');
  console.log('═══════════════════════════════════\n');

  const bySeverity = { critical: [], warning: [], info: [] };
  for (const i of allIssues) {
    bySeverity[i.severity] = bySeverity[i.severity] || [];
    bySeverity[i.severity].push(i);
  }

  if (bySeverity.critical.length) {
    console.log('🔴 CRITICAL:');
    bySeverity.critical.forEach(i => console.log(`  [${i.tab}] ${i.desc}`));
  }
  if (bySeverity.warning.length) {
    console.log('\n🟡 WARNINGS:');
    bySeverity.warning.forEach(i => console.log(`  [${i.tab}] ${i.desc}`));
  }
  if (bySeverity.info.length) {
    console.log('\n🔵 INFO:');
    bySeverity.info.forEach(i => console.log(`  [${i.tab}] ${i.desc}`));
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
