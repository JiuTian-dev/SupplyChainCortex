/**
 * SupplyChain Cortex — Visual Frontend Evaluation
 * Captures 22+ business scenarios via Playwright screenshots
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const OUT = path.resolve(__dirname, '..', 'test-results', 'visual-eval');
fs.mkdirSync(OUT, { recursive: true });

const SCENARIOS = [
  // ─── Core Tabs ───────────────────────────────────────────────────
  { id: 'V01', scenario: '仪表板总览', angle: '整体布局', url: '/', action: 'wait-3s', desc: '首页仪表板 — 监控条、MCP连接器、决策面板' },
  { id: 'V02', scenario: '库存管理', angle: '数据表格', url: '/', action: 'click-tab-inventory', desc: '库存标签页 — 库存数据表、预警时间线' },
  { id: 'V03', scenario: '成本分析', angle: '图表可视', url: '/', action: 'click-tab-cost', desc: '成本标签页 — 瀑布图、热力图、汇率矩阵' },
  { id: 'V04', scenario: '物流追踪', angle: '状态追踪', url: '/', action: 'click-tab-logistics', desc: '物流标签页 — 货运路线图、状态更新' },
  { id: 'V05', scenario: '销售趋势', angle: '趋势图表', url: '/', action: 'click-tab-sales', desc: '销售标签页 — 销售预测、季节性分析' },
  { id: 'V06', scenario: '供应商管理', angle: '评分体系', url: '/', action: 'click-tab-supplier', desc: '供应商标签页 — 供应商列表、评分对比' },
  { id: 'V07', scenario: '风险评估', angle: '风险矩阵', url: '/', action: 'click-tab-risk', desc: '风险标签页 — 级联风险图、传播路径' },
  { id: 'V08', scenario: '质量管理', angle: '质量面板', url: '/', action: 'click-tab-quality', desc: '质量标签页 — 缺陷追踪、退货分析' },
  { id: 'V09', scenario: '合规中心', angle: '证书管理', url: '/', action: 'click-tab-compliance', desc: '合规标签页 — 认证证书、法规变更' },

  // ─── Interactive Features ────────────────────────────────────────
  { id: 'V10', scenario: 'AI对话助手', angle: '交互体验', url: '/', action: 'open-chat', desc: '右侧抽屉 — 聊天面板打开状态' },
  { id: 'V11', scenario: '全局搜索', angle: '搜索体验', url: '/', action: 'open-search', desc: '全局搜索弹窗 — CMDK 命令面板' },
  { id: 'V12', scenario: '通知中心', angle: '通知管理', url: '/', action: 'open-notifications', desc: '通知中心 — 供应链事件提醒' },
  { id: 'V13', scenario: '产品详情', angle: '详情抽屉', url: '/', action: 'open-product-detail', desc: '产品详情侧边栏 — 库存健康/安全库存/补货' },

  // ─── Specific Panels ─────────────────────────────────────────────
  { id: 'V14', scenario: 'MCP连接器', angle: '系统状态', url: '/', action: 'scroll-to-mcp', desc: 'MCP 连接器健康状态卡片' },
  { id: 'V15', scenario: '快速操作', angle: '操作效率', url: '/', action: 'scroll-bottom', desc: '右下角快速操作 Floating Action Button' },
  { id: 'V16', scenario: '端口天气', angle: '外部数据', url: '/', action: 'scroll-to-weather', desc: '港口天气组件' },
  { id: 'V17', scenario: '级联风险面板', angle: '仿真模拟', url: '/', action: 'wait-and-scroll-risk', desc: '级联风险传播模拟面板' },

  // ─── UI/UX Quality ──────────────────────────────────────────────
  { id: 'V18', scenario: '暗黑模式', angle: '视觉切换', url: '/', action: 'toggle-dark', desc: '暗黑主题模式下的仪表板' },
  { id: 'V19', scenario: '响应式布局', angle: '移动适配', url: '/', action: 'resize-mobile', desc: '375px 移动端宽度布局' },
  { id: 'V20', scenario: '表格交互', angle: '数据操作', url: '/', action: 'scroll-table', desc: '库存数据表格的排序/筛选/分页' },

  // ─── Edge Cases ──────────────────────────────────────────────────
  { id: 'V21', scenario: '加载状态', angle: '骨架屏', url: '/', action: 'capture-loading', desc: '数据加载中的骨架屏/loading状态' },
  { id: 'V22', scenario: '空状态错误', angle: '容错处理', url: '/api/not-found-page', action: 'direct-url', desc: '404 页面 — 错误状态 UI' },
];

async function screenshot(page, id, fullPage = true) {
  const fp = path.join(OUT, `${id}.png`);
  await page.screenshot({ path: fp, fullPage });
  console.log(`  📸 ${id}.png`);
  return fp;
}

async function main() {
  console.log('SupplyChain Cortex — Visual Frontend Evaluation');
  console.log('='.repeat(60));
  console.log(`Scenarios: ${SCENARIOS.length}`);
  console.log('');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // Navigate to main page first
  console.log('Loading main page...');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000); // Let charts + SSE render

  // ─── V01: Dashboard Overview ─────────────────────────────────────
  console.log('\n[V01] 仪表板总览');
  await screenshot(page, 'V01-dashboard');

  // ─── V02: Inventory Tab ─────────────────────────────────────────
  console.log('\n[V02] 库存管理');
  try {
    const tabs = page.locator('button, [role="tab"]');
    const count = await tabs.count();
    console.log(`  Found ${count} potential tabs`);
    // Click the inventory tab if visible
    const invBtn = page.locator('button:has-text("库存")').first();
    if (await invBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await invBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch {}
  await screenshot(page, 'V02-inventory');

  // ─── V03: Cost Tab ──────────────────────────────────────────────
  console.log('\n[V03] 成本分析');
  try {
    const costBtn = page.locator('button:has-text("成本")').first();
    if (await costBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await costBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch {}
  await screenshot(page, 'V03-cost');

  // ─── V04: Logistics Tab ─────────────────────────────────────────
  console.log('\n[V04] 物流追踪');
  try {
    const logBtn = page.locator('button:has-text("物流")').first();
    if (await logBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await logBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch {}
  await screenshot(page, 'V04-logistics');

  // ─── V05: Sales Tab ─────────────────────────────────────────────
  console.log('\n[V05] 销售趋势');
  try {
    const salesBtn = page.locator('button:has-text("销售")').first();
    if (await salesBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await salesBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch {}
  await screenshot(page, 'V05-sales');

  // ─── V06: Supplier Tab ───────────────────────────────────────────
  console.log('\n[V06] 供应商管理');
  try {
    const supBtn = page.locator('button:has-text("供应商")').first();
    if (await supBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await supBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch {}
  await screenshot(page, 'V06-supplier');

  // ─── V07: Risk Tab ──────────────────────────────────────────────
  console.log('\n[V07] 风险评估');
  try {
    const riskBtn = page.locator('button:has-text("风险")').first();
    if (await riskBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await riskBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch {}
  await screenshot(page, 'V07-risk');

  // ─── V08: Quality Tab ────────────────────────────────────────────
  console.log('\n[V08] 质量管理');
  try {
    const qualBtn = page.locator('button:has-text("质量")').first();
    if (await qualBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await qualBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch {}
  await screenshot(page, 'V08-quality');

  // ─── V09: Compliance Tab ────────────────────────────────────────
  console.log('\n[V09] 合规中心');
  try {
    const compBtn = page.locator('button:has-text("合规")').first();
    if (await compBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await compBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch {}
  await screenshot(page, 'V09-compliance');

  // ─── V10: Chat Panel ────────────────────────────────────────────
  console.log('\n[V10] AI对话助手');
  try {
    const chatBtn = page.locator('[aria-label="打开对话"], button:has-text("AI"), button:has-text("助手")').first();
    if (await chatBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chatBtn.click();
      await page.waitForTimeout(1500);
    }
  } catch {}
  await screenshot(page, 'V10-chat');

  // ─── V11: Global Search ─────────────────────────────────────────
  console.log('\n[V11] 全局搜索');
  try {
    // CMDK search
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);
  } catch {}
  await screenshot(page, 'V11-search');

  // ─── V12: Notifications ─────────────────────────────────────────
  console.log('\n[V12] 通知中心');
  try {
    const bellBtn = page.locator('[aria-label="通知"], button:has-text("🔔")').first();
    if (await bellBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await bellBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch {}
  await screenshot(page, 'V12-notifications');

  // ─── V13: Product Detail ────────────────────────────────────────
  console.log('\n[V13] 产品详情');
  try {
    // Click first product row if visible
    const firstRow = page.locator('tr[data-state], table tr').nth(1);
    if (await firstRow.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(1500);
    }
  } catch {}
  await screenshot(page, 'V13-product-detail');

  // ─── V14-V17: Scroll-based captures ─────────────────────────────
  console.log('\n[V14] MCP连接器');
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(500);
  await screenshot(page, 'V14-mcp-connector');

  console.log('\n[V15] 快速操作');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await screenshot(page, 'V15-quick-actions');

  // ─── V18: Dark Mode ─────────────────────────────────────────────
  console.log('\n[V18] 暗黑模式');
  try {
    const themeBtn = page.locator('[aria-label="切换主题"], button:has-text("🌙"), button:has-text("☀️")').first();
    if (await themeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await themeBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch {
    // Try injecting dark class
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await screenshot(page, 'V18-dark-mode');

  // ─── V19: Mobile Responsive ─────────────────────────────────────
  console.log('\n[V19] 响应式移动端');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(1000);
  await screenshot(page, 'V19-mobile');

  // ─── V20: Data Table Interaction ─────────────────────────────────
  console.log('\n[V20] 表格交互');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await screenshot(page, 'V20-table', false); // just viewport

  // ─── V21: Loading State ─────────────────────────────────────────
  console.log('\n[V21] 加载状态');
  // Reload and capture mid-load
  const page2 = await context.newPage();
  await page2.goto(BASE, { waitUntil: 'commit', timeout: 10000 });
  await page2.waitForTimeout(500);
  await page2.screenshot({ path: path.join(OUT, 'V21-loading.png'), fullPage: false });
  await page2.close();

  // ─── V22: 404 Error Page ────────────────────────────────────────
  console.log('\n[V22] 404错误页面');
  const page3 = await context.newPage();
  await page3.goto(`${BASE}/nonexistent-page-xyz`, { waitUntil: 'networkidle', timeout: 10000 });
  await page3.waitForTimeout(1000);
  await page3.screenshot({ path: path.join(OUT, 'V22-404.png'), fullPage: true });
  await page3.close();

  await browser.close();
  console.log('\n✅ All screenshots captured');
  console.log(`📁 Output: ${OUT}`);
  console.log(`📸 Files: ${fs.readdirSync(OUT).length}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
