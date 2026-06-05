import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  // Click "数据面板" nav button
  const navButtons = page.locator('button');
  const allButtons = await navButtons.all();
  for (const btn of allButtons) {
    const text = await btn.textContent();
    if (text?.includes('数据面板')) {
      await btn.click();
      break;
    }
  }
  await page.waitForTimeout(3000);

  // Screenshot each tab
  const tabs = ['inventory', 'cost', 'supplier', 'logistics', 'risk', 'sales'];
  for (const tab of tabs) {
    try {
      const tabBtn = page.locator(`button[value="${tab}"], [role="tab"][value="${tab}"]`);
      if (await tabBtn.count() > 0) {
        await tabBtn.first().click();
      } else {
        // Try clicking by text
        const allTabs = page.locator('[role="tab"]');
        const count = await allTabs.count();
        for (let i = 0; i < count; i++) {
          const t = allTabs.nth(i);
          const txt = await t.textContent();
          if (txt?.toLowerCase().includes(tab)) {
            await t.click();
            break;
          }
        }
      }
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `screenshots/${tab}.png`, fullPage: false });
      console.log(`✓ ${tab}`);
    } catch (err) {
      console.log(`✗ ${tab}: ${(err as Error).message}`);
    }
  }

  await browser.close();
  console.log('Done — screenshots saved to screenshots/');
}

main().catch(console.error);
