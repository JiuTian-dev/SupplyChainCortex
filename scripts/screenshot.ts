/**
 * Quick screenshot tool — captures the dashboard at http://localhost:3000
 * Usage: npx tsx scripts/screenshot.ts
 */

import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Navigate and wait for hydration
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });

  // Wait for tab content to load
  await page.waitForTimeout(3000);

  // Full page screenshot
  await page.screenshot({ path: 'screenshots/full-page.png', fullPage: true });
  console.log('Saved: screenshots/full-page.png');

  // Scrolled to top viewport only
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/viewport-top.png', fullPage: false });
  console.log('Saved: screenshots/viewport-top.png');

  // Check for JS console errors
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await page.waitForTimeout(2000);

  if (errors.length > 0) {
    console.log(`\n⚠ ${errors.length} console errors:`);
    errors.forEach(e => console.log(`  - ${e}`));
  } else {
    console.log('\n✓ No console errors');
  }

  await browser.close();
}

main().catch(err => {
  console.error('Screenshot failed:', err.message);
  process.exit(1);
});
