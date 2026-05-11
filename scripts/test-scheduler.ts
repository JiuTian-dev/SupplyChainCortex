/**
 * Test script — manually triggers all data source jobs and reports results.
 *
 * Usage: bun --env-file=.env run scripts/test-scheduler.ts
 *
 * Tests:
 *   1. SCFIS futures (INE/Sina) — compliant, replaces Mysteel SCFI scrape
 *   2. PBOC midpoint (ALAPI / BOC)
 *   3. Commodities (Alpha Vantage / SHFE)
 *   4. EU Carbon Price (ICE/Sina hf_EUA)
 *   5. Port Congestion (baseline + GSCPI)
 *   6. CPSC Recalls (RSS feed)
 *   7. Weather (Open-Meteo)
 *   8. FX rates (Frankfurter)
 */

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Data Source Connectivity Test                ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const results: Array<{ name: string; status: string; time: string; detail: string }> = [];

  // ── Test 1: SCFIS Futures ──────────────────────────────────────────────────
  console.log('[1/8] Testing SCFIS futures (INE, compliant)...');
  try {
    const { fetchSCFISPrice, scfisToFreightRate } = await import('../src/lib/sources/scfis-futures.ts');
    const start = Date.now();
    const data = await fetchSCFISPrice();
    const ms = Date.now() - start;

    if (data) {
      const freight = scfisToFreightRate(data.price);
      console.log(`  ✓ SCFIS Europe: ${data.price} pts (${data.changePct > 0 ? '+' : ''}${data.changePct}%)`);
      console.log(`  ✓ Contract: ${data.contract}, Date: ${data.date}`);
      console.log(`  ✓ Est. freight: $${freight.rateUSD}/FEU — ${freight.route}`);
      console.log(`  ✓ High/Low: ${data.high}/${data.low}`);
      results.push({ name: 'SCFIS Futures', status: '✓ OK', time: `${ms}ms`, detail: `${data.price} pts → ~$${freight.rateUSD}/FEU` });
    } else {
      console.log('  ⚠ No data — market closed or contract not found');
      results.push({ name: 'SCFIS Futures', status: '⚠ NO DATA', time: `${ms}ms`, detail: 'Outside trading hours?' });
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err}`);
    results.push({ name: 'SCFIS Futures', status: '✗ FAIL', time: '-', detail: String(err).slice(0, 80) });
  }
  console.log('');

  // ── Test 2: PBOC ──────────────────────────────────────────────────────────
  console.log('[2/8] Testing PBOC midpoint...');
  try {
    const { getPBOCMidpoints } = await import('../src/lib/sources/pboc-exchange-rate.ts');
    const start = Date.now();
    const data = await getPBOCMidpoints();
    const ms = Date.now() - start;

    if (data && data.midpoints.length > 0) {
      const usd = data.midpoints.find(m => m.currency === 'USD');
      console.log(`  ✓ Source: ${data.source}`);
      console.log(`  ✓ ${data.midpoints.length} currencies`);
      if (usd) console.log(`  ✓ USD/CNY midpoint: ${usd.midpoint}`);
      results.push({ name: 'PBOC', status: '✓ OK', time: `${ms}ms`, detail: `${data.source}, ${data.midpoints.length} currencies` });
    } else {
      console.log('  ⚠ No data');
      results.push({ name: 'PBOC', status: '⚠ NO DATA', time: `${ms}ms`, detail: 'Set ALAPI_TOKEN in .env' });
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err}`);
    results.push({ name: 'PBOC', status: '✗ FAIL', time: '-', detail: String(err).slice(0, 80) });
  }
  console.log('');

  // ── Test 3: Commodities ───────────────────────────────────────────────────
  console.log('[3/8] Testing commodities...');
  try {
    const { fetchDailyCommodities } = await import('../src/lib/sources/alphavantage-commodities.ts');
    const start = Date.now();
    const data = await fetchDailyCommodities();
    const ms = Date.now() - start;

    if (data.length > 0) {
      for (const d of data) {
        console.log(`  ✓ ${d.name}: ${d.price} ${d.unit} [${d.source}]`);
      }
      results.push({ name: 'Commodities', status: '✓ OK', time: `${ms}ms`, detail: `${data.length} commodities` });
    } else {
      console.log('  ⚠ No data');
      results.push({ name: 'Commodities', status: '⚠ NO DATA', time: `${ms}ms`, detail: 'Set ALPHA_VANTAGE_API_KEY' });
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err}`);
    results.push({ name: 'Commodities', status: '✗ FAIL', time: '-', detail: String(err).slice(0, 80) });
  }
  console.log('');

  // ── Test 4: EU Carbon Price ───────────────────────────────────────────────
  console.log('[4/8] Testing EU Carbon Price (ICE/Sina)...');
  try {
    const { fetchCarbonPrice } = await import('../src/lib/sources/carbon-price.ts');
    const start = Date.now();
    const data = await fetchCarbonPrice();
    const ms = Date.now() - start;

    if (data) {
      console.log(`  ✓ EUA: €${data.price}/t CO2 (${data.changePct > 0 ? '+' : ''}${data.changePct}%)`);
      console.log(`  ✓ High/Low: €${data.high}/€${data.low}, Date: ${data.date}`);
      results.push({ name: 'EU Carbon', status: '✓ OK', time: `${ms}ms`, detail: `€${data.price}/t CO2` });
    } else {
      console.log('  ⚠ No data — market closed or symbol mismatch');
      results.push({ name: 'EU Carbon', status: '⚠ NO DATA', time: `${ms}ms`, detail: 'ICE market closed?' });
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err}`);
    results.push({ name: 'EU Carbon', status: '✗ FAIL', time: '-', detail: String(err).slice(0, 80) });
  }
  console.log('');

  // ── Test 5: Port Congestion ───────────────────────────────────────────────
  console.log('[5/8] Testing Port Congestion Index...');
  try {
    const { getPortCongestion } = await import('../src/lib/sources/port-congestion.ts');
    const start = Date.now();
    const data = await getPortCongestion();
    const ms = Date.now() - start;

    const highOrSevere = data.ports.filter(p => p.congestionLevel === 'high' || p.congestionLevel === 'severe');
    console.log(`  ✓ Global level: ${data.globalLevel}`);
    console.log(`  ✓ ${data.ports.length} ports, ${highOrSevere.length} congested`);
    console.log(`  ✓ Source: ${data.source}`);
    if (highOrSevere.length > 0) {
      console.log(`  ✓ Hot spots: ${highOrSevere.map(p => p.port).join(', ')}`);
    }
    results.push({ name: 'Port Congestion', status: '✓ OK', time: `${ms}ms`, detail: `${data.globalLevel}, ${highOrSevere.length}/${data.ports.length} congested` });
  } catch (err) {
    console.log(`  ✗ Error: ${err}`);
    results.push({ name: 'Port Congestion', status: '✗ FAIL', time: '-', detail: String(err).slice(0, 80) });
  }
  console.log('');

  // ── Test 6: CPSC Recalls ──────────────────────────────────────────────────
  console.log('[6/8] Testing CPSC Recall RSS...');
  try {
    const { fetchCPSCRecalls } = await import('../src/lib/sources/cpsc-recall.ts');
    const start = Date.now();
    const data = await fetchCPSCRecalls();
    const ms = Date.now() - start;

    if (data.length > 0) {
      console.log(`  ✓ ${data.length} small appliance recalls found`);
      for (const r of data.slice(0, 3)) {
        console.log(`    - [${r.hazard}] ${r.title.slice(0, 60)}...`);
      }
      results.push({ name: 'CPSC Recalls', status: '✓ OK', time: `${ms}ms`, detail: `${data.length} recalls` });
    } else {
      console.log('  ⚠ No small appliance recalls in recent feed');
      console.log('  (Only small-appliance recalls are filtered; feed may have other products)');
      results.push({ name: 'CPSC Recalls', status: '⚠ NO DATA', time: `${ms}ms`, detail: 'RSS OK, no appliance recalls' });
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err}`);
    results.push({ name: 'CPSC Recalls', status: '✗ FAIL', time: '-', detail: String(err).slice(0, 80) });
  }
  console.log('');

  // ── Test 7: Weather ───────────────────────────────────────────────────────
  console.log('[7/8] Testing weather (Open-Meteo)...');
  try {
    const { getAllPortsWeather } = await import('../src/lib/services/weather.service.ts');
    const start = Date.now();
    const data = await getAllPortsWeather();
    const ms = Date.now() - start;

    if (data && (data as any).ports && (data as any).ports.length > 0) {
      console.log(`  ✓ ${(data as any).ports.length} ports returned`);
      results.push({ name: 'Weather', status: '✓ OK', time: `${ms}ms`, detail: `${(data as any).ports.length} ports` });
    } else {
      console.log('  ⚠ No data (@/ alias may not resolve)');
      results.push({ name: 'Weather', status: '⚠ NO DATA', time: `${ms}ms`, detail: '@/ path alias issue' });
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err}`);
    results.push({ name: 'Weather', status: '✗ FAIL', time: '-', detail: String(err).slice(0, 80) });
  }
  console.log('');

  // ── Test 8: FX ────────────────────────────────────────────────────────────
  console.log('[8/8] Testing exchange rates (Frankfurter)...');
  try {
    const { getLatestRates } = await import('../src/lib/queries/exchange-rate.queries.ts');
    const start = Date.now();
    const data = await getLatestRates();
    const ms = Date.now() - start;

    if (data && data.rates) {
      console.log(`  ✓ ${Object.keys(data.rates).length} currencies`);
      if (data.rates.USD) console.log(`  ✓ USD/CNY: ${(1 / data.rates.USD).toFixed(4)} (market)`);
      if (data.midpoints?.USD) {
        console.log(`  ✓ Midpoint spread: ${data.midpoints.USD.spread}%`);
      }
      results.push({ name: 'FX', status: '✓ OK', time: `${ms}ms`, detail: `${Object.keys(data.rates).length} currencies` });
    } else {
      console.log('  ⚠ No data');
      results.push({ name: 'FX', status: '⚠ NO DATA', time: `${ms}ms`, detail: 'Frankfurter down?' });
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err}`);
    results.push({ name: 'FX', status: '✗ FAIL', time: '-', detail: String(err).slice(0, 80) });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   Test Summary                                ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  for (const r of results) {
    const icon = r.status.startsWith('✓') ? '✅' : r.status.startsWith('⚠') ? '⚠️' : '❌';
    console.log(`${icon} ${r.name.padEnd(18)} ${r.status.padEnd(12)} ${r.time.padEnd(8)} ${r.detail}`);
  }

  const okCount = results.filter(r => r.status.startsWith('✓')).length;
  const warnCount = results.filter(r => r.status.startsWith('⚠')).length;
  const failCount = results.filter(r => r.status.startsWith('✗')).length;

  console.log(`\n${okCount} passed, ${warnCount} warnings, ${failCount} failed (out of ${results.length})\n`);

  if (warnCount > 0) {
    console.log('⚠ Notes:');
    console.log('  SCFIS/EUA Carbon: may show no data outside trading hours');
    console.log('  Weather: @/ path aliases only resolve inside Next.js dev server');
    console.log('  CPSC: only small-appliance-related recalls are reported');
    console.log('\n  To register for free API keys:');
    console.log('  - ALAPI (PBOC midpoint): https://www.alapi.cn');
    console.log('  - Alpha Vantage (daily commodities): https://www.alphavantage.co');
  }
}

main().catch(console.error);
