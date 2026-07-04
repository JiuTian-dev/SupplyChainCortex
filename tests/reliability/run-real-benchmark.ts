#!/usr/bin/env tsx
/**
 * 真实 API 基准测试运行脚本 — 通过 OpenCode Go 代理调用 DeepSeek V4 Pro。
 *
 * 架构:
 *   本脚本 → https://opencode.ai/zen/go/v1/chat/completions (OpenCode Go 套餐)
 *   模型: deepseek-v4-pro (推理模型，支持工具调用)
 *
 * 用法:
 *   npx tsx tests/reliability/run-real-benchmark.ts                    # 全部 121 用例
 *   npx tsx tests/reliability/run-real-benchmark.ts --limit 20          # 仅前 20 用例（快速验证）
 *   npx tsx tests/reliability/run-real-benchmark.ts --family crud       # 仅 crud 家族
 *   npx tsx tests/reliability/run-real-benchmark.ts --concurrency 1     # 串行（调试用）
 *
 * 环境变量:
 *   OPENCODE_API_KEY    OpenCode Go 套餐密钥（必需）
 *   OPENCODE_BASE_URL   上游 API 地址（默认: https://opencode.ai/zen/go/v1）
 *   OPENCODE_MODEL      模型 ID（默认: deepseek-v4-pro）
 */

import { runBenchmark, formatMarkdownReport, formatJsonReport, DEFAULT_CONFIG, type BenchmarkConfig } from './provider-benchmark';
import { getCaseCount, getFamilyStats, getCoveredTools } from './tool-cases';
import { getAllToolNames } from './tool-schema-validator';
import type { ToolFamily } from './tool-cases';
import type { ProviderAdapter, StreamOpts, ToolStreamOpts, TokenChunk, ToolCallChunk, Classification } from '@/lib/agent/adapter';
import type { ChatMessage } from '@/lib/services/ai-providers.service';
import type { MCPTool } from '@/lib/mcp/tools';
import type { ToolCall } from '@/lib/agent/fsm-types';
import { TOOL_DISPLAY_NAMES } from '@/lib/agent/fsm-types';
import { getToolSchemas } from '@/lib/mcp/tools';
import * as fs from 'fs';
import * as path from 'path';

// ─── OpenCode Go Adapter ────────────────────────────────────────────────────

const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1';
const OPENCODE_MODEL = process.env.OPENCODE_MODEL || 'deepseek-v4-pro';

/**
 * OpenCodeGoAdapter — 通过 OpenCode Go 套餐调用 DeepSeek V4 Pro。
 * 兼容 OpenAI Chat Completions API 格式。
 */
class OpenCodeGoAdapter implements ProviderAdapter {
  readonly providerId = 'opencode-go';
  readonly defaultModel = OPENCODE_MODEL;

  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || this.defaultModel;
  }

  normalizeMessages(messages: ChatMessage[]): unknown[] {
    return messages.map(m => {
      const normalized: Record<string, unknown> = { role: m.role, content: m.content || '' };
      if (m.name) normalized.name = m.name;
      if (m.tool_call_id) normalized.tool_call_id = m.tool_call_id;
      return normalized;
    });
  }

  normalizeTools(tools: MCPTool[]): unknown[] {
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  async *streamText(): AsyncGenerator<TokenChunk> {
    // 基准测试不需要流式文本
    yield { type: 'done' };
  }

  async *streamWithTools(): AsyncGenerator<ToolCallChunk> {
    // 基准测试不需要流式工具调用
    yield { type: 'done' };
  }

  async callWithTools(
    messages: ChatMessage[],
    tools: MCPTool[],
    opts?: StreamOpts,
  ): Promise<{ toolCalls: ToolCall[]; content: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(`${OPENCODE_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: this.normalizeMessages(messages),
          tools: this.normalizeTools(tools),
          tool_choice: 'auto', // DeepSeek V4 Pro thinking 模式不支持 "required"，用 "auto"
          thinking: { type: 'disabled' }, // 禁用推理模式以支持 tool_choice
          max_tokens: 2000,
          temperature: 0,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`OpenCode Go API error ${response.status}: ${errText.slice(0, 300)}`);
      }

      const data = await response.json() as {
        choices?: Array<{
          message?: {
            tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
            content?: string;
          };
        }>;
      };

      const msg = data.choices?.[0]?.message;
      const content = msg?.content || '';
      const rawCalls = (msg?.tool_calls as unknown[]) || [];

      const toolCalls: ToolCall[] = [];
      for (const raw of rawCalls) {
        const tc = raw as { function?: { name?: string; arguments?: string } };
        if (tc?.function?.name) {
          try {
            const params = JSON.parse(tc.function.arguments || '{}');
            toolCalls.push({
              name: tc.function.name,
              params,
              displayName: TOOL_DISPLAY_NAMES[tc.function.name] || tc.function.name,
            });
          } catch {
            // 参数 JSON 解析失败，跳过
          }
        }
      }

      // 文本回退解析
      if (toolCalls.length === 0 && content) {
        const textCalls = this.parseToolCallsFromText(content);
        toolCalls.push(...textCalls);
      }

      return { toolCalls, content };
    } finally {
      clearTimeout(timeout);
    }
  }

  async classify(): Promise<Classification> {
    return { intent: 'supply_chain_data', confidence: 0.5, reason: 'benchmark' };
  }

  parseToolCalls(_rawContent: string, structuredToolCalls: unknown[]): ToolCall[] {
    const calls: ToolCall[] = [];
    for (const raw of structuredToolCalls) {
      const tc = raw as { function?: { name?: string; arguments?: string } };
      if (tc?.function?.name) {
        try {
          const params = JSON.parse(tc.function.arguments || '{}');
          calls.push({
            name: tc.function.name,
            params,
            displayName: TOOL_DISPLAY_NAMES[tc.function.name] || tc.function.name,
          });
        } catch { /* skip */ }
      }
    }
    return calls;
  }

  private parseToolCallsFromText(text: string): ToolCall[] {
    const results: ToolCall[] = [];
    // 尝试 JSON 代码块
    const jsonBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g;
    let match;
    while ((match = jsonBlockRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.name && parsed.params) {
          results.push({
            name: parsed.name,
            params: parsed.params,
            displayName: TOOL_DISPLAY_NAMES[parsed.name] || parsed.name,
          });
        }
      } catch { /* skip */ }
    }
    // 尝试 <tool>/<params> 格式
    const xmlRegex = /<tool>\s*([\w_]+)\s*<\/tool>\s*<params>\s*(\{[\s\S]*?\})\s*<\/params>/g;
    while ((match = xmlRegex.exec(text)) !== null) {
      try {
        const params = JSON.parse(match[2]);
        results.push({
          name: match[1],
          params,
          displayName: TOOL_DISPLAY_NAMES[match[1]] || match[1],
        });
      } catch { /* skip */ }
    }
    return results;
  }

  resolveApiKey(): string | undefined { return this.apiKey; }
  resolveModel(): string { return this.model; }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

interface CliArgs {
  limit: number;
  family?: ToolFamily;
  output: string;
  concurrency: number;
  timeout: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: CliArgs = {
    limit: 0,
    output: './tests/reliability/reports',
    concurrency: 3,
    timeout: 60000,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    switch (arg) {
      case '--limit':
        if (next) { parsed.limit = parseInt(next, 10) || 0; i++; }
        break;
      case '--family':
        if (next && ['crud', 'operations', 'intelligence', 'supply-chain', 'supplier-graph'].includes(next)) {
          parsed.family = next as ToolFamily; i++;
        }
        break;
      case '--output':
        if (next) { parsed.output = next; i++; }
        break;
      case '--concurrency':
        if (next) { parsed.concurrency = parseInt(next, 10) || 3; i++; }
        break;
      case '--timeout':
        if (next) { parsed.timeout = parseInt(next, 10) || 60000; i++; }
        break;
    }
  }
  return parsed;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const apiKey = process.env.OPENCODE_API_KEY;
  if (!apiKey) {
    console.error('❌ 请设置 OPENCODE_API_KEY 环境变量');
    process.exit(1);
  }

  const cliArgs = parseArgs();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  真实 API 工具调用可靠性基准测试');
  console.log('  Provider: OpenCode Go (DeepSeek V4 Pro)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();
  console.log('📊 测试套件概览:');
  console.log(`   总测试用例数: ${getCaseCount()}`);
  console.log(`   覆盖工具数: ${getCoveredTools().length} / ${getAllToolNames().length}`);
  console.log(`   家族分布: ${JSON.stringify(getFamilyStats())}`);
  console.log();
  console.log('⚙️  配置:');
  console.log(`   上游 API: ${OPENCODE_BASE_URL}`);
  console.log(`   模型: ${OPENCODE_MODEL}`);
  console.log(`   模式: 🔴 真实 API`);
  console.log(`   用例限制: ${cliArgs.limit === 0 ? '全部' : cliArgs.limit}`);
  console.log(`   家族筛选: ${cliArgs.family || '全部'}`);
  console.log(`   并发数: ${cliArgs.concurrency}`);
  console.log(`   超时: ${cliArgs.timeout}ms`);
  console.log();

  const adapter = new OpenCodeGoAdapter(apiKey, OPENCODE_MODEL);

  const config: BenchmarkConfig = {
    ...DEFAULT_CONFIG,
    provider: 'deepseek' as never, // 复用类型，实际用 OpenCodeGoAdapter
    limit: cliArgs.limit,
    family: cliArgs.family,
    outputDir: cliArgs.output,
    concurrency: cliArgs.concurrency,
    realApi: true,
    timeoutMs: cliArgs.timeout,
    maxRetries: 1, // 真实 API 减少重试
  };

  console.log('🚀 开始运行真实 API 基准测试...');
  console.log('   (每个用例约 3-10 秒，总计约 6-20 分钟)');
  console.log();

  const startTime = Date.now();

  try {
    const report = await runBenchmark(config, adapter as unknown as ProviderAdapter);
    const elapsed = Date.now() - startTime;
    const elapsedMin = Math.floor(elapsed / 60000);
    const elapsedSec = Math.floor((elapsed % 60000) / 1000);

    console.log();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  测试结果');
    console.log('═══════════════════════════════════════════════════════════');
    console.log();
    console.log('📊 核心指标:');
    console.log(`   成功率: ${report.stats.successRate}% (${report.stats.passed}/${report.stats.totalCases})`);
    console.log(`   平均延迟: ${report.stats.avgLatencyMs}ms`);
    console.log(`   P50 延迟: ${report.stats.p50LatencyMs}ms`);
    console.log(`   P95 延迟: ${report.stats.p95LatencyMs}ms`);
    console.log(`   最小/最大延迟: ${report.stats.minLatencyMs}ms / ${report.stats.maxLatencyMs}ms`);
    console.log(`   总耗时: ${elapsedMin}分${elapsedSec}秒`);
    console.log();

    if (report.stats.failed > 0) {
      console.log('❌ 失败模式分布:');
      const dist = report.stats.failureDistribution;
      for (const [cat, count] of Object.entries(dist.byCategory).sort((a, b) => b[1] - a[1])) {
        if (count > 0) {
          console.log(`   ${cat}: ${count} (${dist.byCategoryPct[cat as keyof typeof dist.byCategoryPct]}%)`);
        }
      }
      console.log();

      console.log('📝 失败用例详情:');
      for (const fr of report.stats.failureRecords) {
        console.log(`   • ${fr.caseId}: ${fr.category} — ${fr.message.slice(0, 120)}`);
      }
      console.log();

      if (report.suggestions.length > 0) {
        console.log('💡 改进建议:');
        for (const s of report.suggestions) {
          console.log(`   • ${s}`);
        }
        console.log();
      }
    }

    // 写入报告
    const outputDir = path.resolve(cliArgs.output);
    fs.mkdirSync(outputDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(outputDir, `real-benchmark-deepseek-v4-pro-${timestamp}.json`);
    const mdPath = path.join(outputDir, `real-benchmark-deepseek-v4-pro-${timestamp}.md`);
    fs.writeFileSync(jsonPath, formatJsonReport(report), 'utf8');
    fs.writeFileSync(mdPath, formatMarkdownReport(report), 'utf8');

    console.log('📁 报告已生成:');
    console.log(`   JSON: ${jsonPath}`);
    console.log(`   Markdown: ${mdPath}`);
    console.log();

    // SLO 评估
    console.log('🎯 SLO 评估:');
    const successRateSLO = report.stats.successRate >= 95;
    const p95LatencySLO = report.stats.p95LatencyMs <= 8000;
    console.log(`   工具调用成功率 ≥ 95%: ${successRateSLO ? '✅ 达标' : '❌ 未达标'} (${report.stats.successRate}%)`);
    console.log(`   P95 延迟 ≤ 8s: ${p95LatencySLO ? '✅ 达标' : '❌ 未达标'} (${report.stats.p95LatencyMs}ms)`);
    console.log();

  } catch (err) {
    console.error(`❌ 基准测试运行失败: ${(err as Error).message}`);
    console.error((err as Error).stack);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
