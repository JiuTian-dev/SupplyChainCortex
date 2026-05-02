import { chromium } from 'playwright';

const OUT = 'D:/vibe-coding/jiadian_supply/02_LocalDev/2/2.9.3/screenshots';

async function main() {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await p.waitForTimeout(5000);

  await p.screenshot({ path: OUT + '/top.png', fullPage: false });

  // Check what rendered
  const text = await p.evaluate(() => {
    const body = document.body.textContent || '';
    return {
      title: document.title,
      monitorStrip: body.includes('供应链实时监控') ? 'OK' : 'MISSING',
      decisionCenter: body.includes('决策执行中心') ? 'OK' : 'MISSING',
      configToolbar: body.includes('配置') ? 'OK' : 'MISSING',
      tabs: document.querySelectorAll('[role="tab"]').length,
      skeletonCount: document.querySelectorAll('[class*="skeleton"], [class*="Skeleton"]').length,
      consoleErrors: body.includes('Error') ? 'YES' : 'no',
    };
  });

  console.log(JSON.stringify(text, null, 2));
  await b.close();
  console.log('Screenshot: ' + OUT + '/top.png');
}

main().catch(e => { console.error(e.message); process.exit(1); });
