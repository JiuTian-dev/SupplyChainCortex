/**
 * User Journey Test — simulates a real cross-border seller's workflow.
 *
 * Run: node scripts/user-journey-test.js
 * Prereq: dev server running on localhost:3000
 *
 * Tests the complete "find problem → analyze → decide → act" loop
 * from a seller's perspective, not a developer counting divs.
 */

const { chromium } = require('playwright');

const BASE = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const results = { pass: [], fail: [], warn: [] };

  function pass(msg) { results.pass.push(msg); console.log('  ✅ ' + msg); }
  function fail(msg) { results.fail.push(msg); console.log('  ❌ ' + msg); }
  function warn(msg) { results.warn.push(msg); console.log('  ⚠️ ' + msg); }

  async function closeOverlays() {
    try {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const overlays = await page.locator('.fixed.inset-0.z-40').count();
      if (overlays > 0) { await page.mouse.click(10, 10); await page.waitForTimeout(300); }
    } catch {}
  }

  async function switchTab(name) {
    await closeOverlays();
    try {
      await page.locator('button[role="tab"]:has-text("' + name + '")').click({ timeout: 5000 });
      await page.waitForTimeout(2000);
    } catch { fail('Cannot switch to tab: ' + name); }
  }

  // ===== START =====
  console.log('\n🔍 SupplyChain Cortex — User Journey Test\n');

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
  } catch { fail('Page failed to load'); await browser.close(); return; }

  // ===== 1. HOME — at-a-glance health check =====
  console.log('\n── 1. Homepage — 3-second health check ──');
  const healthScore = await page.locator('text=/\\d+.*100/').first().textContent().catch(() => '');
  if (healthScore && /\d+/.test(healthScore)) pass('Health score visible: ' + healthScore.trim());
  else fail('No health score on homepage');

  const alertCount = await page.locator('text=高危, text=预警').count();
  if (alertCount > 0) pass('Alert indicators visible');
  else warn('No alert count visible on homepage');

  // ===== 2. INVENTORY — find problem SKUs =====
  console.log('\n── 2. Inventory — find stockout SKUs ──');
  await switchTab('库存');

  const filterBtn = await page.locator('button:has-text("筛选产品")').count();
  if (filterBtn > 0) pass('Product filter button exists');
  else fail('Product filter button missing');

  const charts = await page.locator('.recharts-wrapper').count();
  if (charts > 0) pass('Charts rendering: ' + charts);
  else fail('No charts on inventory tab');

  // Check for alert-colored table rows
  const redRows = await page.locator('.border-l-red-500').count();
  const yellowRows = await page.locator('.border-l-amber-500').count();
  if (redRows + yellowRows > 0) pass('Alert row coloring: ' + redRows + ' red, ' + yellowRows + ' yellow');
  else warn('No alert-colored rows — check if any SKU is critical/warning');

  // Try filter
  if (filterBtn > 0) {
    await closeOverlays();
    await page.locator('button:has-text("筛选产品")').first().click({ timeout: 3000 });
    await page.waitForTimeout(800);
    const filterItems = await page.locator('button:has-text("SKU-")').count();
    if (filterItems > 0) {
      pass('Filter dropdown shows ' + filterItems + ' SKUs');
      await page.locator('button:has-text("SKU-")').first().click();
      await page.waitForTimeout(1500);
      await closeOverlays();
      // Check if filter chips appear
      const chips = await page.locator('button:has-text("清除全部")').count();
      if (chips > 0) pass('Filter chips appear after selection');
      else warn('No filter chips after selecting SKU');
      // Clear filter
      if (chips > 0) { await page.locator('button:has-text("清除全部")').click(); await page.waitForTimeout(500); }
    } else fail('Filter dropdown empty');
  }

  // ===== 3. COST — check margins =====
  console.log('\n── 3. Cost — check profit margins ──');
  await switchTab('成本');
  const costFilter = await page.locator('button:has-text("筛选产品")').count();
  const costCharts = await page.locator('.recharts-wrapper').count();
  if (costFilter > 0) pass('Cost filter exists');
  else fail('Cost filter missing');
  if (costCharts > 0) pass('Cost charts: ' + costCharts);
  else fail('No cost charts');

  // ===== 4. LOGISTICS — shipment status =====
  console.log('\n── 4. Logistics — shipment tracking ──');
  await switchTab('物流');
  const logFilter = await page.locator('button:has-text("筛选产品")').count();
  const logCharts = await page.locator('.recharts-wrapper').count();
  if (logFilter > 0) pass('Logistics filter exists');
  else fail('Logistics filter missing');
  if (logCharts > 0) pass('Logistics charts: ' + logCharts);
  else fail('Logistics: NO charts rendering ⚠️');

  // ===== 5. RISK — risk overview =====
  console.log('\n── 5. Risk — dashboard check ──');
  await switchTab('风险仪表');
  const riskScore = await page.locator('text=风险评分').count();
  const riskMatrix = await page.locator('text=风险矩阵').count();
  if (riskScore > 0) pass('Risk score visible');
  else fail('Risk score not visible');
  if (riskMatrix > 0) pass('Risk matrix visible');
  else warn('Risk matrix not visible');

  // ===== 6. CHAT — AI assistant access =====
  console.log('\n── 6. Chat — AI assistant ──');
  const chatBtn = await page.locator('button[aria-label="打开供应链助手"]').count();
  if (chatBtn > 0) pass('Chat entry button visible');
  else fail('Chat entry button missing');

  // ===== 7. OTHER TABS — filter coverage =====
  console.log('\n── 7. Filter coverage across tabs ──');
  for (const tab of ['销售', '供应商', '概览']) {
    await switchTab(tab);
    const hasFilter = await page.locator('button:has-text("筛选产品")').count();
    if (hasFilter > 0) pass(tab + ': filter exists');
    else warn(tab + ': NO filter (may need one)');
  }

  // ===== SUMMARY =====
  console.log('\n═══════════════════════════════════');
  console.log('  RESULTS: ' + results.pass.length + ' passed, ' + results.fail.length + ' failed, ' + results.warn.length + ' warnings');
  console.log('═══════════════════════════════════\n');
  if (results.fail.length > 0) {
    console.log('FAILURES:');
    results.fail.forEach(f => console.log('  ❌ ' + f));
  }
  if (results.warn.length > 0) {
    console.log('WARNINGS:');
    results.warn.forEach(w => console.log('  ⚠️ ' + w));
  }

  await browser.close();
  process.exit(results.fail.length > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
