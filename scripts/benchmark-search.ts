#!/usr/bin/env bun
// scripts/benchmark-search.ts
// Search quality benchmark — compares old webSearch vs new webSearchWithQuality

import { webSearch, webSearchWithQuality } from '../src/lib/services/web-search.service';

// ─── Test Queries ───────────────────────────────────────────────────────────────

const TEST_CASES = [
  {
    id: 'T1',
    query: '中国家电出口美国301关税最新政策',
    expectedTopics: ['关税', '美国', '家电'],
    minResults: 2,
    description: '中文政策类搜索',
  },
  {
    id: 'T2',
    query: 'US-China trade war small home appliances 2026',
    expectedTopics: ['tariff', 'trade', 'China', 'US', 'appliance'],
    minResults: 2,
    description: '英文政策类搜索',
  },
  {
    id: 'T3',
    query: '东南亚供应链转移 越南 家电制造',
    expectedTopics: ['越南', '东南亚', '供应链', '制造'],
    minResults: 2,
    description: '中文趋势类搜索',
  },
  {
    id: 'T4',
    query: 'copper price forecast 2026',
    expectedTopics: ['copper', 'price', 'forecast'],
    minResults: 2,
    description: '英文数据类搜索',
  },
  {
    id: 'T5',
    query: '欧盟CBAM碳关税对家电出口影响',
    expectedTopics: ['CBAM', '碳', '欧盟', '家电'],
    minResults: 2,
    description: '中文法规类搜索',
  },
];

// ─── Scoring ────────────────────────────────────────────────────────────────────

function topicCoverage(results: Array<{ title: string; snippet: string }>, topics: string[]): number {
  if (topics.length === 0) return 1.0;
  const text = results.map(r => `${r.title} ${r.snippet}`).join(' ').toLowerCase();
  let covered = 0;
  for (const topic of topics) {
    if (text.includes(topic.toLowerCase())) covered++;
  }
  return covered / topics.length;
}

function authorityRatio(results: Array<{ url: string }>): number {
  if (results.length === 0) return 0;
  const highAuth = results.filter(r => {
    try {
      const host = new URL(r.url).hostname;
      return /\.gov|gov\.cn|reuters|bloomberg|bbc|ft\.com|wsj\.com|scmp|wikipedia/i.test(host);
    } catch { return false; }
  });
  return highAuth.length / results.length;
}

// ─── Main ───────────────────────────────────────────────────────────────────────

async function runBenchmark() {
  console.log('Search Quality Benchmark\n');
  console.log('='.repeat(80));

  let totalOldScore = 0;
  let totalNewScore = 0;
  const resultsList: Array<Record<string, unknown>> = [];

  for (const test of TEST_CASES) {
    console.log(`\n${test.id}: ${test.description}`);
    console.log(`   Query: "${test.query}"`);

    // ─── Old pipeline ────────────────────────────────────────────────
    const oldStart = Date.now();
    const oldResult = await webSearch(test.query);
    const oldTime = Date.now() - oldStart;

    const oldCoverage = topicCoverage(oldResult.results, test.expectedTopics);
    const oldAuth = authorityRatio(oldResult.results);
    const oldHasResults = oldResult.results.length >= test.minResults ? 1 : 0;
    const oldScore = oldCoverage * 0.5 + oldAuth * 0.3 + oldHasResults * 0.2;

    console.log(`   OLD: ${oldResult.results.length} results | coverage=${(oldCoverage*100).toFixed(0)}% | authority=${(oldAuth*100).toFixed(0)}% | ${oldTime}ms | score=${oldScore.toFixed(2)}`);

    // ─── New pipeline ────────────────────────────────────────────────
    const newStart = Date.now();
    const newResult = await webSearchWithQuality(test.query);
    const newTime = Date.now() - newStart;

    const newCoverage = topicCoverage(newResult.results, test.expectedTopics);
    const newAuth = authorityRatio(newResult.results);
    const newHasResults = newResult.results.length >= test.minResults ? 1 : 0;
    const newScore = newCoverage * 0.5 + newAuth * 0.3 + newHasResults * 0.2;

    console.log(`   NEW: ${newResult.results.length} results | coverage=${(newCoverage*100).toFixed(0)}% | authority=${(newAuth*100).toFixed(0)}% | ${newTime}ms | score=${newScore.toFixed(2)}`);
    console.log(`   Diag: queries=${newResult.diagnostics.rewrittenQueries.length} | guard=${newResult.diagnostics.guardPassed} | confidence=${newResult.diagnostics.crossValidation.confidence} | pipeline=${newResult.diagnostics.pipelineMs}ms`);
    if (newResult.diagnostics.crossValidation.caveats.length > 0) {
      console.log(`   Caveats: ${newResult.diagnostics.crossValidation.caveats[0]}`);
    }

    totalOldScore += oldScore;
    totalNewScore += newScore;
    resultsList.push({
      id: test.id,
      description: test.description,
      oldResults: oldResult.results.length,
      newResults: newResult.results.length,
      oldCoverage,
      newCoverage,
      oldAuth,
      newAuth,
      oldTime,
      newTime,
      oldScore,
      newScore,
      confidence: newResult.diagnostics.crossValidation.confidence,
    });
  }

  // ─── Summary ──────────────────────────────────────────────────────────────────
  const oldAvg = totalOldScore / TEST_CASES.length;
  const newAvg = totalNewScore / TEST_CASES.length;
  const improvement = ((newAvg - oldAvg) / Math.max(oldAvg, 0.01)) * 100;

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`   Old pipeline avg score: ${oldAvg.toFixed(2)}`);
  console.log(`   New pipeline avg score: ${newAvg.toFixed(2)}`);
  console.log(`   Improvement: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%`);

  console.log('\n   ID  | Description              | Old  | New  | Confidence');
  console.log('   ' + '-'.repeat(60));
  for (const r of resultsList) {
    console.log(`   ${r.id} | ${String(r.description).padEnd(24)} | ${String((r.oldScore as number).toFixed(2)).padEnd(4)} | ${String((r.newScore as number).toFixed(2)).padEnd(4)} | ${r.confidence}`);
  }
}

runBenchmark()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
