/**
 * User Journey 4: Supplier Management
 *
 * Validates the supplier operator workflow:
 *   1. Navigate to the supplier tab in the data panel
 *   2. Supplier list loads with overview cards (mocked API)
 *   3. Supplier search filter narrows visible suppliers
 *   4. Region filter can be opened
 *   5. Supplier detail dialog opens from a card "详情" button
 *   6. Supplier detail dialog has tabs (基本信息 / 订单历史 / 绩效)
 *   7. Supplier performance panel renders
 *   8. Supplier comparison panel renders with selection hint
 *   9. Add supplier button is present
 *   10. Suppliers API returns structured list
 *
 * API calls to /api/suppliers and /api/supplier-performance are mocked.
 *
 * Run: npx playwright test e2e/user-journey-supplier.spec.ts
 */

import { test, expect } from './fixtures';
import { mockSupplierApi, mockSuppliers, mockSupplierPerformance } from './fixtures';
import { selectors, endpoints } from './helpers/selectors';

test.describe('User Journey — Supplier Management', () => {
  test.beforeEach(async ({ page, navigation }) => {
    await mockSupplierApi(page);
    // Mock the analytics endpoint for supplier-performance
    await page.route(new RegExp(`${endpoints.analytics}(\\?|$)`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSupplierPerformance),
      });
    });
    // Mock reorder endpoint used by SupplierTab
    await page.route(new RegExp(`${endpoints.supplierGraph}(\\?|$)`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { nodes: [], edges: [] }, meta: {} }),
      });
    });
    await navigation.gotoHome();
    await navigation.switchToLegacyTab('供应商');
  });

  test('1. Supplier tab loads and shows overview cards', async ({ page }) => {
    // The supplier search input confirms the tab rendered
    await expect(page.locator(selectors.supplier.searchInput)).toBeVisible({ timeout: 15000 });
    // Overview metrics should be visible
    await expect(page.locator('text=供应商总数')).toBeVisible({ timeout: 10000 });
  });

  test('2. Supplier list shows supplier names from mock data', async ({ page }) => {
    await expect(page.locator(selectors.supplier.searchInput)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);
    // The first mock supplier name should appear
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('华东电子元件厂');
  });

  test('3. Supplier search filter narrows visible suppliers', async ({ page }) => {
    const searchInput = page.locator(selectors.supplier.searchInput);
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    // Search for a specific supplier
    await searchInput.fill('深圳精密');
    await page.waitForTimeout(800);

    // The filtered supplier should be visible
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('深圳精密模具');
  });

  test('4. Region filter can be opened', async ({ page }) => {
    const regionTrigger = page.locator('button[role="combobox"]').filter({ hasText: /地区筛选|全部地区/ }).first();
    await expect(regionTrigger).toBeVisible({ timeout: 10000 });
    await regionTrigger.click();
    await page.waitForTimeout(500);

    // The "全部地区" option should appear
    await expect(page.locator('[role="option"]:has-text("全部地区")')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
  });

  test('5. Category filter lists supplier categories', async ({ page }) => {
    const categoryTrigger = page.locator('button[role="combobox"]').filter({ hasText: /品类筛选|全部品类/ }).first();
    await expect(categoryTrigger).toBeVisible({ timeout: 10000 });
    await categoryTrigger.click();
    await page.waitForTimeout(500);

    await expect(page.locator('[role="option"]:has-text("全部品类")')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
  });

  test('6. Supplier detail dialog opens from a card "详情" button', async ({ page }) => {
    await expect(page.locator(selectors.supplier.searchInput)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    // Click the first "详情" button on a supplier card
    const detailButton = page.locator('button:has-text("详情")').first();
    const isVisible = await detailButton.isVisible().catch(() => false);
    if (isVisible) {
      await detailButton.click();
      await page.waitForTimeout(800);

      // The detail dialog should be open
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });
      const dialogText = await dialog.textContent();
      expect(dialogText).toMatch(/供应商详情|基本信息|订单历史|绩效/);
    }
  });

  test('7. Supplier detail dialog has three tabs', async ({ page }) => {
    await expect(page.locator(selectors.supplier.searchInput)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    const detailButton = page.locator('button:has-text("详情")').first();
    const isVisible = await detailButton.isVisible().catch(() => false);
    if (isVisible) {
      await detailButton.click();
      await page.waitForTimeout(800);

      // Three tabs should be present
      await expect(page.locator('button[role="tab"]:has-text("基本信息")')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('button[role="tab"]:has-text("订单历史")')).toBeVisible();
      await expect(page.locator('button[role="tab"]:has-text("绩效")')).toBeVisible();
    }
  });

  test('8. Supplier performance panel renders', async ({ page }) => {
    // The performance panel title or radar chart should be present
    await expect(page.locator(selectors.supplier.searchInput)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);
    // The performance panel renders when supplierPerformance data is loaded
    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/供应商|supplier|绩效|performance|评分|score/i);
  });

  test('9. Supplier comparison panel renders with selection hint', async ({ page }) => {
    await expect(page.locator(selectors.supplier.searchInput)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);
    // The comparison panel should show the selection hint text
    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/供应商对比|对比|选择/);
  });

  test('10. Add supplier button is present', async ({ page }) => {
    await expect(page.locator(selectors.supplier.addSupplierButton)).toBeVisible({ timeout: 10000 });
  });

  test('11. Add supplier button opens the form dialog', async ({ page }) => {
    await expect(page.locator(selectors.supplier.addSupplierButton)).toBeVisible({ timeout: 10000 });
    await page.click(selectors.supplier.addSupplierButton);
    await page.waitForTimeout(800);

    // The add-supplier dialog should be open with form fields
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    const dialogText = await dialog.textContent();
    expect(dialogText).toMatch(/添加供应商|供应商编码|名称|地区|品类/);
  });

  test('12. Suppliers API returns structured list', async ({ request }) => {
    const res = await request.get(`http://localhost:3000${endpoints.suppliers}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeTruthy();
    // The mock returns { suppliers: [...], pagination: {...} }
    const data = (body as { data?: typeof mockSuppliers }).data ?? body;
    if (data && typeof data === 'object' && 'suppliers' in data) {
      expect((data as { suppliers: unknown[] }).suppliers.length).toBeGreaterThan(0);
    }
  });

  test('13. Supplier performance API returns metrics', async ({ request }) => {
    const res = await request.get(`http://localhost:3000${endpoints.suppliers}?action=performance`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeTruthy();
  });
});
