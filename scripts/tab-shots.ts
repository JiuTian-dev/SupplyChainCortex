import { chromium } from 'playwright';

const OUT = 'D:/vibe-coding/jiadian_supply/02_LocalDev/2/2.9.3/screenshots';

async function main() {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await p.waitForTimeout(3000);

  const tabs = [
    { value: 'monitor', label: '监控' },
    { value: 'analysis', label: '分析' },
    { value: 'decision', label: '决策' },
    { value: 'simulation', label: '推演' },
  ];

  for (const tab of tabs) {
    // Click the decision flow tab
    const trigger = await p.$(`button[value="${tab.value}"]`);
    if (trigger) {
      await trigger.click();
      await p.waitForTimeout(2000);
    }

    // Check content rendered
    const info = await p.evaluate((t) => {
      const text = document.body.textContent || '';
      return {
        tab: t,
        hasContent: text.length > 1000,
        textPreview: text.slice(200, 500).replace(/\s+/g, ' '),
      };
    }, tab.label);

    console.log(`${tab.label}: content=${info.hasContent} preview="${info.textPreview.slice(0, 80)}..."`);

    // Clip screenshot just the tab content area
    await p.screenshot({
      path: `${OUT}/tab-${tab.value}.png`,
      clip: { x: 0, y: 120, width: 1280, height: 500 },
    });
  }

  console.log('\nDone. 4 tab screenshots saved.');
  await b.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
