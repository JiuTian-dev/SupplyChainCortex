import { webSearch, webSearchWithQuality, getSearchProvider } from '../src/lib/services/web-search.service';

console.log('Search Integration Test');
console.log('Provider:', getSearchProvider());
console.log('='.repeat(70));

// Test 1: Chinese policy query
console.log('\n--- T1: Chinese policy ---');
const r1old = await webSearch('中国家电出口 关税 2026');
console.log(`OLD: ${r1old.results.length} results | source=${r1old.source}`);
if (r1old.results[0]) console.log(`  Top: ${r1old.results[0].title}`);

const r1new = await webSearchWithQuality('中国家电出口 关税 2026');
console.log(`NEW: ${r1new.results.length} results | confidence=${r1new.diagnostics.crossValidation.confidence} | source=${r1new.source}`);
console.log(`  Diag: guard=${r1new.diagnostics.guardPassed} | queries=${r1new.diagnostics.rewrittenQueries.length} | ${r1new.diagnostics.pipelineMs}ms`);
if (r1new.results[0]) console.log(`  Top: ${r1new.results[0].title}`);
if (r1new.diagnostics.crossValidation.caveats.length > 0) console.log(`  Caveats: ${r1new.diagnostics.crossValidation.caveats.join('; ')}`);

// Test 2: English policy query
console.log('\n--- T2: English policy ---');
const r2old = await webSearch('US Section 301 tariff small appliances 2026');
console.log(`OLD: ${r2old.results.length} results | source=${r2old.source}`);

const r2new = await webSearchWithQuality('US Section 301 tariff small appliances 2026');
console.log(`NEW: ${r2new.results.length} results | confidence=${r2new.diagnostics.crossValidation.confidence}`);
console.log(`  Diag: guard=${r2new.diagnostics.guardPassed} | queries=${r2new.diagnostics.rewrittenQueries.length} | ${r2new.diagnostics.pipelineMs}ms`);

// Test 3: Context injection
console.log('\n--- T3: Context injection ---');
const r3new = await webSearchWithQuality('那边的关税怎么算', [
  { role: 'user', content: '我们在越南海防有工厂吗' },
  { role: 'assistant', content: '是的，海防工厂主要生产小家电。' },
]);
console.log(`NEW: ${r3new.results.length} results | rewritten=${r3new.diagnostics.rewrittenQueries.join(' | ')}`);
console.log(`  Diag: guard=${r3new.diagnostics.guardPassed} | confidence=${r3new.diagnostics.crossValidation.confidence}`);

// Test 4: Commodity price query
console.log('\n--- T4: Commodity price ---');
const r4old = await webSearch('copper price forecast 2026');
console.log(`OLD: ${r4old.results.length} results | source=${r4old.source}`);

const r4new = await webSearchWithQuality('copper price forecast 2026');
console.log(`NEW: ${r4new.results.length} results | confidence=${r4new.diagnostics.crossValidation.confidence}`);
if (r4new.results[0]) console.log(`  Top: ${r4new.results[0].title}`);

// Test 5: Degraded query test (nonsense query)
console.log('\n--- T5: Degraded query ---');
const r5new = await webSearchWithQuality('xyzzy nonsense query that should return nothing useful');
console.log(`NEW: ${r5new.results.length} results | guard=${r5new.diagnostics.guardPassed} | confidence=${r5new.diagnostics.crossValidation.confidence}`);

console.log('\n' + '='.repeat(70));
console.log('Integration test complete.');
