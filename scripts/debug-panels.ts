/**
 * Debug script — tests the three slow panels directly
 */
const t0 = Date.now();

async function test(name: string, fn: () => Promise<any>) {
  const start = Date.now();
  try {
    const r = await fn();
    const ms = Date.now() - start;
    console.log(`✓ ${name}: ${ms}ms — ${typeof r === 'object' ? JSON.stringify(r).slice(0, 200) : r}`);
    return { ok: true, ms };
  } catch (e: any) {
    console.log(`✗ ${name}: ${Date.now() - start}ms FAILED — ${e.message}`);
    return { ok: false, ms: Date.now() - start, error: e.message };
  }
}

async function main() {
  console.log('=== Cascade Risk ===');
  const r1 = await test('getCascadeRisk(auto)', async () => {
    const { getCascadeRisk } = await import('../src/lib/services/cascade-risk.service');
    return getCascadeRisk({ scenario: 'auto', includeForwardProjection: false, includeCounterfactuals: false });
  });

  console.log('\n=== Decision Graph ===');
  const r2 = await test('executeDecisionGraph(all)', async () => {
    const { executeDecisionGraph } = await import('../src/lib/services/decision-graph.service');
    return executeDecisionGraph({ includeAll: true });
  });

  console.log('\n=== Summary ===');
  const total = Date.now() - t0;
  console.log(`Total: ${total}ms`);
  console.log(`CascadeRisk: ${r1.ok ? '✓' : '✗'} ${r1.ms}ms`);
  console.log(`DecisionGraph: ${r2.ok ? '✓' : '✗'} ${r2.ms}ms`);
}

main().catch(console.error);
