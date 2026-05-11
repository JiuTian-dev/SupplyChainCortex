const t0 = Date.now();

async function timed(name: string, fn: () => Promise<any>) {
  const s = Date.now();
  const r = await fn();
  console.log(`  ${name}: ${Date.now() - s}ms`);
  return r;
}

async function main() {
  console.log('Profiling getCascadeRisk bottlenecks...\n');

  // Test weather alone
  const { getAllPortsWeather } = await import('../src/lib/services/weather.service');
  await timed('Weather (12 ports)', () => getAllPortsWeather());

  // Test FX
  const { getLatestRates } = await import('../src/lib/queries/exchange-rate.queries');
  await timed('FX rates', () => getLatestRates());

  // Test DB graph build
  const { db } = await import('../src/lib/db');
  await timed('DB products(500)', () => db.product.findMany({ take: 50 }));
  await timed('DB inventory(200)', () => db.inventory.findMany({ take: 50 }));
  await timed('DB shipments(200)', () => db.shipmentItem.findMany({ take: 50 }));
  await timed('DB suppliers', () => db.supplier.findMany({ take: 10 }));

  // Full cascade risk second run (after cache warm)
  console.log('\nSecond run (cache warm):');
  const { getCascadeRisk } = await import('../src/lib/services/cascade-risk.service');
  await timed('getCascadeRisk(auto)', () =>
    getCascadeRisk({ scenario: 'auto', includeForwardProjection: false, includeCounterfactuals: false })
  );

  console.log(`\nTotal: ${Date.now() - t0}ms`);
}

main().catch(console.error);
