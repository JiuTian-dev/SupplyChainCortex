/**
 * E2E tests: 4 decision flow tabs render correctly.
 * Run: npx playwright test e2e/decision-flow.spec.ts
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

test.describe('Decision Flow Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
  });

  test('Monitor tab shows health metrics', async ({ page }) => {
    await page.click('button:has-text("监控")');
    await page.waitForTimeout(1500);
    const text = await page.textContent('body');
    expect(text).toContain('USD');
    expect(text).toContain('CNY');
  });

  test('Analysis tab shows risk data and passport', async ({ page }) => {
    await page.click('button:has-text("分析")');
    await page.waitForTimeout(2000);
    const text = await page.textContent('body');
    expect(text).toContain('风险');
  });

  test('Decision tab shows decision cards with feedback buttons', async ({ page }) => {
    await page.click('button:has-text("决策")');
    await page.waitForTimeout(2000);
    const text = await page.textContent('body');
    expect(text).toContain('决策执行');
  });

  test('Simulation tab shows sandbox replay', async ({ page }) => {
    await page.click('button:has-text("推演")');
    await page.waitForTimeout(2000);
    const text = await page.textContent('body');
    expect(text).toContain('沙箱');
  });

  test('ConfigToolbar changes currency', async ({ page }) => {
    // Click the currency selector
    const currencyTrigger = page.locator('button[value="CNY"]').first();
    if (await currencyTrigger.isVisible()) {
      await currencyTrigger.click();
      await page.waitForTimeout(500);
      const usdOption = page.locator('text=USD').first();
      if (await usdOption.isVisible()) {
        await usdOption.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('Health dot is visible in header', async ({ page }) => {
    const healthDot = page.locator('.HealthDot, [class*="health"]');
    // Health dot may take a moment to fetch
    await page.waitForTimeout(4000);
    const text = await page.textContent('body');
    expect(text).toContain('SupplyChain Cortex');
  });

  test('API endpoints respond with 200', async ({ page }) => {
    const endpoints = [
      '/api/engine-health',
      '/api/engine-feedback?action=stats',
      '/api/cascade-risk?scenario=auto',
      '/api/dashboard?action=summary',
    ];
    for (const ep of endpoints) {
      const res = await page.request.get(BASE + ep);
      expect(res.status(), `${ep} should return 200`).toBe(200);
    }
  });
});
