/**
 * Test script — manually triggers all data source jobs and reports results.
 *
 * Usage: bun --env-file=.env run scripts/test-scheduler.ts
 *
 * Tests each external data source independently:
 *   1. SCFI freight rates (Mysteel scrape)
 *   2. PBOC exchange rate midpoint (ALAPI / BOC fallback)
 *   3. Commodity daily prices (Alpha Vantage / SHFE)
 *   4. Weather (Open-Meteo — existing)
 *   5. FX rates (Frankfurter — existing)
 */

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Data Source Connectivity Test              ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const results: Array<{ name: string; status: string; time: string; detail: string }> = [];

  // ── Test 1: SCFI ────────────────────────────────────────────────────────

  console.log('[1/5] Testing SCFI freight rate scraper...');
  try {
    const { fetchSCFI, scfiToFreightRates } = await import('../src/lib/sources/scfi-scraper.ts');
    const start = Date.now();
    const data = await fetchSCFI();
    const ms = Date.now() - start;

    if (data && data.routes.length > 0) {
      console.log(`  ✓ Composite Index: ${data.compositeIndex} pts (${data.weeklyChangePct > 0 ? '+' : ''}${data.weeklyChangePct}%)`);
      console.log(`  ✓ Routes: ${data.routes.length} routes found`);
      for (const r of scfiToFreightRates(data)) {
        console.log(`    - ${r.route}: $${r.rate40GP}/40GP (${r.trend})`);
      }
      console.log(`  ✓ Source: ${data.source}`);
      results.push({ name: 'SCFI', status: '✓ OK', time: `${ms}ms`, detail: `${data.compositeIndex} pts, ${data.routes.length} routes` });
    } else {
      console.log('  ⚠ No data returned (source may not have published yet this week)');
      results.push({ name: 'SCFI', status: '⚠ NO DATA', time: `${ms}ms`, detail: 'Try again Friday 15:30+ BJT' });
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err}`);
    results.push({ name: 'SCFI', status: '✗ FAIL', time: '-', detail: String(err).slice(0, 80) });
  }

  console.log('');

  // ── Test 2: PBOC ────────────────────────────────────────────────────────

  console.log('[2/5] Testing PBOC exchange rate midpoint...');
  try {
    const { getPBOCMidpoints } = await import('../src/lib/sources/pboc-exchange-rate.ts');
    const start = Date.now();
    const data = await getPBOCMidpoints();
    const ms = Date.now() - start;

    if (data && data.midpoints.length > 0) {
      console.log(`  ✓ Date: ${data.date}`);
      console.log(`  ✓ Source: ${data.source}`);
      for (const m of data.midpoints) {
        console.log(`    - USD/CNY: ${m.currency === 'USD' ? m.midpoint : ''}${m.currency !== 'USD' ? `${m.currency}/CNY: ${m.midpoint}` : ''}`);
      }
      // Print all midpoints
      const usd = data.midpoints.find(m => m.currency === 'USD');
      if (usd) console.log(`    → PBOC midpoint: 1 USD = ${usd.midpoint} CNY`);
      const eur = data.midpoints.find(m => m.currency === 'EUR');
      if (eur) console.log(`    → PBOC midpoint: 1 EUR = ${eur.midpoint} CNY`);
      results.push({ name: 'PBOC', status: '✓ OK', time: `${ms}ms`, detail: `${data.source}, ${data.midpoints.length} currencies` });
    } else {
      console.log('  ⚠ No data — ALAPI_TOKEN may not be set and BOC scrape failed');
      console.log('  → Register for free token at https://www.alapi.cn');
      results.push({ name: 'PBOC', status: '⚠ NO DATA', time: `${ms}ms`, detail: 'Set ALAPI_TOKEN in .env' });
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err}`);
    results.push({ name: 'PBOC', status: '✗ FAIL', time: '-', detail: String(err).slice(0, 80) });
  }

  console.log('');

  // ── Test 3: Commodities ─────────────────────────────────────────────────

  console.log('[3/5] Testing commodity daily prices...');
  try {
    const { fetchDailyCommodities } = await import('../src/lib/sources/alphavantage-commodities.ts');
    const start = Date.now();
    const data = await fetchDailyCommodities();
    const ms = Date.now() - start;

    if (data.length > 0) {
      for (const d of data) {
        console.log(`  ✓ ${d.name}: ${d.price} ${d.unit} (${d.changePct > 0 ? '+' : ''}${d.changePct}% DoD) [${d.source}]`);
      }
      results.push({ name: 'Commodities', status: '✓ OK', time: `${ms}ms`, detail: `${data.length} commodities` });
    } else {
      console.log('  ⚠ No data — ALPHA_VANTAGE_API_KEY may not be set');
      console.log('  → Register for free key at https://www.alphavantage.co/support/#api-key');
      console.log('  → Steel rebar (SHFE) may not return data outside trading hours');
      results.push({ name: 'Commodities', status: '⚠ NO DATA', time: `${ms}ms`, detail: 'Set ALPHA_VANTAGE_API_KEY in .env' });
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err}`);
    results.push({ name: 'Commodities', status: '✗ FAIL', time: '-', detail: String(err).slice(0, 80) });
  }

  console.log('');

  // ── Test 4: Weather ─────────────────────────────────────────────────────

  console.log('[4/5] Testing weather (Open-Meteo)...');
  try {
    const { getAllPortsWeather } = await import('../src/lib/services/weather.service.ts');
    const start = Date.now();
    const data = await getAllPortsWeather();
    const ms = Date.now() - start;

    if (data && data.length > 0) {
      console.log(`  ✓ ${data.length} ports returned`);
      const alerts = data.filter((p: { alert?: string }) => p.alert);
      console.log(`  ✓ ${alerts.length} ports with weather alerts`);
      results.push({ name: 'Weather', status: '✓ OK', time: `${ms}ms`, detail: `${data.length} ports, ${alerts.length} alerts` });
    } else {
      console.log('  ⚠ No data returned');
      results.push({ name: 'Weather', status: '⚠ NO DATA', time: `${ms}ms`, detail: 'Open-Meteo may be down' });
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err}`);
    results.push({ name: 'Weather', status: '✗ FAIL', time: '-', detail: String(err).slice(0, 80) });
  }

  console.log('');

  // ── Test 5: FX ──────────────────────────────────────────────────────────

  console.log('[5/5] Testing exchange rates (Frankfurter)...');
  try {
    const { getLatestRates } = await import('../src/lib/queries/exchange-rate.queries.ts');
    const start = Date.now();
    const data = await getLatestRates();
    const ms = Date.now() - start;

    if (data && data.rates) {
      const currencies = Object.keys(data.rates);
      console.log(`  ✓ Base: ${data.base}`);
      console.log(`  ✓ ${currencies.length} currencies returned`);
      if (data.rates.USD) console.log(`  ✓ USD/CNY: ${(1 / data.rates.USD).toFixed(4)} (market rate)`);
      if (data.midpoints?.USD) {
        console.log(`  ✓ PBOC midpoint: 1 USD = ${data.midpoints.USD.midpoint} CNY (spread: ${data.midpoints.USD.spread}%)`);
      }
      results.push({ name: 'FX (Frankfurter)', status: '✓ OK', time: `${ms}ms`, detail: `${currencies.length} currencies` + (data.midpoints?.USD ? ', midpoint available' : '') });
    } else {
      console.log('  ⚠ No data returned');
      results.push({ name: 'FX', status: '⚠ NO DATA', time: `${ms}ms`, detail: 'Frankfurter API may be down' });
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err}`);
    results.push({ name: 'FX', status: '✗ FAIL', time: '-', detail: String(err).slice(0, 80) });
  }

  // ── Summary ─────────────────────────────────────────────────────────────

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   Test Summary                                ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  for (const r of results) {
    const icon = r.status.startsWith('✓') ? '✅' : r.status.startsWith('⚠') ? '⚠️' : '❌';
    console.log(`${icon} ${r.name.padEnd(20)} ${r.status.padEnd(12)} ${r.time.padEnd(8)} ${r.detail}`);
  }

  const okCount = results.filter(r => r.status.startsWith('✓')).length;
  const warnCount = results.filter(r => r.status.startsWith('⚠')).length;
  const failCount = results.filter(r => r.status.startsWith('✗')).length;

  console.log(`\n${okCount} passed, ${warnCount} warnings, ${failCount} failed (out of ${results.length})\n`);

  if (warnCount > 0) {
    console.log('⚠ Some data sources need API keys to work:');
    console.log('  - ALAPI_TOKEN (PBOC midpoint): register at https://www.alapi.cn');
    console.log('  - ALPHA_VANTAGE_API_KEY (daily commodities): register at https://www.alphavantage.co');
  }
}

main().catch(console.error);
