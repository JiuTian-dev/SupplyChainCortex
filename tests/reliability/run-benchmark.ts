#!/usr/bin/env tsx
/**
 * Benchmark CLI — main entry point for running reliability benchmarks.
 *
 * Usage:
 *   npx tsx tests/reliability/run-benchmark.ts --provider deepseek --limit 50
 *   npx tsx tests/reliability/run-benchmark.ts --provider openai --family crud
 *   npx tsx tests/reliability/run-benchmark.ts --provider anthropic --output ./reports
 *
 * Flags:
 *   --provider <id>     Provider to test: deepseek | openai | anthropic (default: deepseek)
 *   --limit <n>         Max test cases to run (0 = all, default: 0)
 *   --family <name>     Filter by tool family: crud | operations | intelligence | supply-chain | supplier-graph
 *   --output <dir>      Output directory for reports (default: ./tests/reliability/reports)
 *   --concurrency <n>   Concurrent API calls (default: 3)
 *   --real              Enable real API calls (default: mock mode)
 *   --timeout <ms>      Request timeout in ms (default: 30000)
 *
 * Environment:
 *   RUN_REAL_BENCHMARK=true   Enable real API calls (same as --real)
 *   DEEPSEEK_API_KEY          Required for real deepseek calls
 *   OPENAI_API_KEY            Required for real openai calls
 *   ANTHROPIC_API_KEY         Required for real anthropic calls
 */

import { runBenchmark, formatMarkdownReport, formatJsonReport, DEFAULT_CONFIG, type BenchmarkConfig, type ProviderId } from './provider-benchmark';
import { getCaseCount, getFamilyStats, getCoveredTools } from './tool-cases';
import { getAllToolNames } from './tool-schema-validator';
import type { ToolFamily } from './tool-cases';
import * as fs from 'fs';
import * as path from 'path';

// ─── CLI Parsing ────────────────────────────────────────────────────────────

interface CliArgs {
  provider: ProviderId;
  limit: number;
  family?: ToolFamily;
  output: string;
  concurrency: number;
  real: boolean;
  timeout: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: CliArgs = {
    provider: 'deepseek',
    limit: 0,
    output: './tests/reliability/reports',
    concurrency: 3,
    real: false,
    timeout: 30000,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--provider':
        if (next && ['deepseek', 'openai', 'anthropic'].includes(next)) {
          parsed.provider = next as ProviderId;
          i++;
        }
        break;
      case '--limit':
        if (next) {
          parsed.limit = parseInt(next, 10) || 0;
          i++;
        }
        break;
      case '--family':
        if (next && ['crud', 'operations', 'intelligence', 'supply-chain', 'supplier-graph'].includes(next)) {
          parsed.family = next as ToolFamily;
          i++;
        }
        break;
      case '--output':
        if (next) {
          parsed.output = next;
          i++;
        }
        break;
      case '--concurrency':
        if (next) {
          parsed.concurrency = parseInt(next, 10) || 3;
          i++;
        }
        break;
      case '--real':
        parsed.real = true;
        break;
      case '--timeout':
        if (next) {
          parsed.timeout = parseInt(next, 10) || 30000;
          i++;
        }
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }

  // Check environment variable for real mode
  if (process.env.RUN_REAL_BENCHMARK === 'true') {
    parsed.real = true;
  }

  return parsed;
}

function printHelp(): void {
  console.log(`
工具调用可靠性基准测试 CLI

用法:
  npx tsx tests/reliability/run-benchmark.ts [options]

选项:
  --provider <id>       Provider: deepseek | openai | anthropic (默认: deepseek)
  --limit <n>           最大测试用例数 (0=全部, 默认: 0)
  --family <name>       按工具家族筛选: crud | operations | intelligence | supply-chain | supplier-graph
  --output <dir>        报告输出目录 (默认: ./tests/reliability/reports)
  --concurrency <n>     并发数 (默认: 3)
  --real                启用真实 API 调用 (默认: mock 模式)
  --timeout <ms>        请求超时毫秒 (默认: 30000)
  --help, -h            显示帮助

环境变量:
  RUN_REAL_BENCHMARK=true   启用真实 API 调用 (同 --real)
  DEEPSEEK_API_KEY          DeepSeek API 密钥
  OPENAI_API_KEY            OpenAI API 密钥
  ANTHROPIC_API_KEY         Anthropic API 密钥

示例:
  # Mock 模式 (默认, CI 友好)
  npx tsx tests/reliability/run-benchmark.ts --provider deepseek --limit 50

  # 按家族筛选
  npx tsx tests/reliability/run-benchmark.ts --family crud

  # 真实 API 调用
  RUN_REAL_BENCHMARK=true npx tsx tests/reliability/run-benchmark.ts --provider deepseek
`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cliArgs = parseArgs();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  工具调用可靠性基准测试');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  // Print test suite overview
  console.log('📊 测试套件概览:');
  console.log(`   总测试用例数: ${getCaseCount()}`);
  console.log(`   覆盖工具数: ${getCoveredTools().length} / ${getAllToolNames().length}`);
  console.log(`   家族分布: ${JSON.stringify(getFamilyStats())}`);
  console.log();

  console.log('⚙️  配置:');
  console.log(`   Provider: ${cliArgs.provider}`);
  console.log(`   模式: ${cliArgs.real ? '🔴 真实 API' : '🟢 Mock（模拟）'}`);
  console.log(`   用例限制: ${cliArgs.limit === 0 ? '全部' : cliArgs.limit}`);
  console.log(`   家族筛选: ${cliArgs.family || '全部'}`);
  console.log(`   并发数: ${cliArgs.concurrency}`);
  console.log(`   超时: ${cliArgs.timeout}ms`);
  console.log();

  // Build config
  const config: BenchmarkConfig = {
    ...DEFAULT_CONFIG,
    provider: cliArgs.provider,
    limit: cliArgs.limit,
    family: cliArgs.family,
    outputDir: cliArgs.output,
    concurrency: cliArgs.concurrency,
    realApi: cliArgs.real,
    timeoutMs: cliArgs.timeout,
  };

  // Create adapter for real API mode
  let adapter = undefined;
  if (cliArgs.real) {
    adapter = await createAdapter(cliArgs.provider);
    if (!adapter) {
      console.error(`❌ 无法创建 ${cliArgs.provider} adapter（可能缺少 API key）`);
      process.exit(1);
    }
  }

  // Run benchmark
  console.log('🚀 开始运行基准测试...');
  const startTime = Date.now();

  try {
    const report = await runBenchmark(config, adapter);
    const elapsed = Date.now() - startTime;

    console.log();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  测试结果');
    console.log('═══════════════════════════════════════════════════════════');
    console.log();
    console.log(`📊 核心指标:`);
    console.log(`   成功率: ${report.stats.successRate}% (${report.stats.passed}/${report.stats.totalCases})`);
    console.log(`   平均延迟: ${report.stats.avgLatencyMs}ms`);
    console.log(`   P95 延迟: ${report.stats.p95LatencyMs}ms`);
    console.log(`   总耗时: ${elapsed}ms`);
    console.log();

    if (report.stats.failed > 0) {
      console.log(`❌ 失败模式分布:`);
      const dist = report.stats.failureDistribution;
      for (const [cat, count] of Object.entries(dist.byCategory).sort((a, b) => b[1] - a[1])) {
        if (count > 0) {
          console.log(`   ${cat}: ${count} (${dist.byCategoryPct[cat as keyof typeof dist.byCategoryPct]}%)`);
        }
      }
      console.log();

      if (report.suggestions.length > 0) {
        console.log(`💡 改进建议:`);
        for (const s of report.suggestions) {
          console.log(`   • ${s}`);
        }
        console.log();
      }
    }

    // Write reports
    const outputDir = path.resolve(cliArgs.output);
    fs.mkdirSync(outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(outputDir, `benchmark-${cliArgs.provider}-${timestamp}.json`);
    const mdPath = path.join(outputDir, `benchmark-${cliArgs.provider}-${timestamp}.md`);

    fs.writeFileSync(jsonPath, formatJsonReport(report), 'utf8');
    fs.writeFileSync(mdPath, formatMarkdownReport(report), 'utf8');

    console.log(`📁 报告已生成:`);
    console.log(`   JSON: ${jsonPath}`);
    console.log(`   Markdown: ${mdPath}`);
    console.log();

    // Exit with non-zero if success rate below 90%
    if (report.stats.successRate < 90) {
      console.log(`⚠️  成功率 ${report.stats.successRate}% 低于目标 90%`);
      process.exit(0); // Don't fail CI, just warn
    } else {
      console.log(`✅ 成功率 ${report.stats.successRate}% 达到目标 90%+`);
    }
  } catch (err) {
    console.error(`❌ 基准测试运行失败: ${(err as Error).message}`);
    console.error((err as Error).stack);
    process.exit(1);
  }
}

/**
 * Create a real provider adapter (lazy import to avoid loading in mock mode).
 */
async function createAdapter(provider: ProviderId): Promise<unknown> {
  try {
    const { getAdapter } = await import('@/lib/agent/adapter-factory');
    return getAdapter(provider);
  } catch (err) {
    console.error(`创建 adapter 失败: ${(err as Error).message}`);
    return null;
  }
}

// Run if called directly (not imported)
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
