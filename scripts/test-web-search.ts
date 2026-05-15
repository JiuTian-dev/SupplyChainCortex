import { webSearch } from '../src/lib/services/web-search.service';

// Test 1: Chinese query
const r1 = await webSearch('中国家电出口 关税 2026');
console.log('1. Chinese:', r1.results.length, 'Source:', r1.source);
if (r1.results.length > 0) console.log('  ', r1.results[0].title);

// Test 2: Policy
const r2 = await webSearch('US Section 301 tariff small appliances 2026');
console.log('2. Policy:', r2.results.length, 'Source:', r2.source);
if (r2.results.length > 0) console.log('  ', r2.results[0].title);

// Test 3: Wikipedia fallback
const r3 = await webSearch('copper price history');
console.log('3. Wikipedia:', r3.results.length, 'Source:', r3.source);
if (r3.results.length > 0) console.log('  ', r3.results[0].title);
