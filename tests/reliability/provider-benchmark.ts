/**
 * Provider Benchmark — runs all test cases against one or more providers.
 *
 * Features:
 * - Supports DeepSeek, OpenAI, Anthropic providers
 * - Mock mode (default): uses deterministic mock responses, no API calls
 * - Real mode: actual API calls via RUN_REAL_BENCHMARK=true
 * - Concurrency control to avoid rate limits
 * - Retry on network errors (not on tool-call errors)
 * - Statistics: success rate, avg latency, failure mode distribution
 * - Output: JSON report + Markdown summary
 */

import type { ProviderAdapter } from '@/lib/agent/adapter';
import type { ToolCall } from '@/lib/agent/fsm-types';
import type { MCPTool } from '@/lib/mcp/tools';
import { getToolSchemas } from '@/lib/mcp/tools';
import type { ToolTestCase, ToolFamily } from './tool-cases';
import { allToolCases, getCasesByFamily } from './tool-cases';
import { validateToolCall, type ValidationResult, type ToolCallInput } from './tool-schema-validator';
import {
  classifyFailure,
  analyzeFailures,
  formatFailureReport,
  generateSuggestions,
  type FailureRecord,
  type FailureDistribution,
  type CaseResult,
} from './failure-analyzer';
import { compareParams as compareParamsNormalized } from './tool-schema-validator';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ProviderId = 'deepseek' | 'openai' | 'anthropic';

export interface BenchmarkConfig {
  /** Provider to test */
  provider: ProviderId;
  /** Max test cases to run (0 = all) */
  limit: number;
  /** Filter by tool family */
  family?: ToolFamily;
  /** Output directory for reports */
  outputDir: string;
  /** Concurrency (simultaneous API calls) */
  concurrency: number;
  /** Max retries on network error (default 2) */
  maxRetries: number;
  /** Whether to run real API calls (default false = mock mode) */
  realApi: boolean;
  /** Timeout per request in ms */
  timeoutMs: number;
}

export const DEFAULT_CONFIG: BenchmarkConfig = {
  provider: 'deepseek',
  limit: 0,
  outputDir: './tests/reliability/reports',
  concurrency: 3,
  maxRetries: 2,
  realApi: false,
  timeoutMs: 30000,
};

export interface CaseOutcome {
  caseId: string;
  passed: boolean;
  actualToolCall: ToolCallInput | null;
  validationResult: ValidationResult | null;
  parseError: boolean;
  latencyMs: number;
  failure?: FailureRecord;
  rawOutput?: string;
}

export interface ProviderStats {
  provider: ProviderId;
  totalCases: number;
  passed: number;
  failed: number;
  successRate: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  failureDistribution: FailureDistribution;
  failureRecords: FailureRecord[];
  caseResults: CaseResult[];
  durationMs: number;
}

export interface BenchmarkReport {
  generatedAt: string;
  config: BenchmarkConfig;
  stats: ProviderStats;
  suggestions: string[];
  failureReport: string;
}

// ─── Mock Provider ──────────────────────────────────────────────────────────

/**
 * Mock provider that returns deterministic tool calls based on test cases.
 * This is the DEFAULT mode — no real API calls, runs in CI.
 *
 * The mock "simulates" an LLM by looking at the test case's expected tool
 * and returning it with correct params ~85% of the time (to simulate the
 * current ~74% DeepSeek reliability with some headroom for testing the
 * failure analysis path).
 */
export class MockProviderAdapter implements ProviderAdapter {
  readonly providerId = 'mock';
  readonly defaultModel = 'mock-model';

  /** Cases that should fail (for testing failure analysis) */
  private failureSet: Set<string>;
  /** Failure type to simulate for each case */
  private failureType: Map<string, string>;

  constructor(failureRate = 0.15) {
    this.failureSet = new Set();
    this.failureType = new Map();
    // Deterministically select ~15% of cases to fail
    for (const tc of allToolCases) {
      // Use a simple hash to deterministically pick failures
      const hash = tc.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
      if (hash % 100 < failureRate * 100) {
        this.failureSet.add(tc.id);
        // Cycle through failure types
        const types = ['WRONG_TOOL', 'MISSING_REQUIRED_PARAM', 'INVALID_ENUM', 'HALLUCINATED_PARAM', 'NO_TOOL_CALL'];
        this.failureType.set(tc.id, types[hash % types.length]);
      }
    }
  }

  normalizeMessages(): unknown[] { return []; }
  normalizeTools(): unknown[] { return []; }

  async *streamText(): AsyncGenerator<{ type: string; content?: string; error?: string }> {
    yield { type: 'token', content: 'mock response' };
    yield { type: 'done' };
  }

  async *streamWithTools(): AsyncGenerator<{ type: string; content?: string; toolCall?: { name: string; arguments: string }; error?: string }> {
    yield { type: 'done' };
  }

  /**
   * Simulate a tool call for a test case.
   * Returns the expected tool call for passing cases, or a corrupted one for failing cases.
   */
  async callWithTools(
    _messages: unknown[],
    _tools: MCPTool[],
    _opts?: unknown,
  ): Promise<{ toolCalls: ToolCall[]; content: string }> {
    // This is called by the benchmark runner with the test case context
    // The benchmark runner uses callWithToolsForCase instead
    throw new Error('Use callWithToolsForCase instead');
  }

  async classify(): Promise<{ intent: string; confidence: number; reason: string }> {
    return { intent: 'supply_chain_data', confidence: 0.9, reason: 'mock' };
  }

  parseToolCalls(): ToolCall[] { return []; }
  resolveApiKey(): string | undefined { return 'mock-key'; }
  resolveModel(): string { return this.defaultModel; }

  /**
   * Get the simulated tool call for a specific test case.
   * Returns null if simulating "no tool call".
   */
  getToolCallForCase(testCase: ToolTestCase): ToolCallInput | null {
    if (this.failureSet.has(testCase.id)) {
      const failureType = this.failureType.get(testCase.id) || 'WRONG_TOOL';

      switch (failureType) {
        case 'NO_TOOL_CALL':
          return null;

        case 'WRONG_TOOL': {
          // Return a different tool (pick the next one in the list)
          const allTools = getToolSchemas();
          const wrongTool = allTools.find(t => t.name !== testCase.expectedTool);
          return {
            name: wrongTool?.name || 'query_inventory',
            params: {},
          };
        }

        case 'MISSING_REQUIRED_PARAM': {
          // Return correct tool but omit a required param
          const params = { ...testCase.expectedParams };
          const requiredKeys = Object.keys(params);
          if (requiredKeys.length > 0) {
            delete params[requiredKeys[0]];
          }
          return { name: testCase.expectedTool, params };
        }

        case 'INVALID_ENUM': {
          // Return correct tool but with a bad enum value
          const params = { ...testCase.expectedParams };
          // Find an enum param and corrupt it
          for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'string' && value.length > 0) {
              params[key] = `INVALID_${value.toUpperCase()}`;
              break;
            }
          }
          return { name: testCase.expectedTool, params };
        }

        case 'HALLUCINATED_PARAM': {
          // Return correct tool but add a fake param
          return {
            name: testCase.expectedTool,
            params: { ...testCase.expectedParams, hallucinated_field: 'fake_value' },
          };
        }

        default:
          return { name: testCase.expectedTool, params: testCase.expectedParams };
      }
    }

    // Passing case — return the expected tool call
    return {
      name: testCase.expectedTool,
      params: { ...testCase.expectedParams },
    };
  }

  /** Check if a case is in the failure set */
  isFailureCase(caseId: string): boolean {
    return this.failureSet.has(caseId);
  }
}

// ─── Benchmark Runner ───────────────────────────────────────────────────────

/**
 * Run benchmark for a single provider.
 */
export async function runBenchmark(
  config: BenchmarkConfig,
  adapter?: ProviderAdapter,
): Promise<BenchmarkReport> {
  const startTime = Date.now();

  // Select test cases
  let cases = config.family ? getCasesByFamily(config.family) : [...allToolCases];
  if (config.limit > 0) {
    cases = cases.slice(0, config.limit);
  }

  // Get tool schemas for the prompt
  const toolSchemas = getToolSchemas();

  // Create adapter (mock or real)
  let providerAdapter: ProviderAdapter;
  let mockProvider: MockProviderAdapter | null = null;

  if (config.realApi) {
    if (!adapter) {
      throw new Error('Real API mode requires a ProviderAdapter instance');
    }
    providerAdapter = adapter;
  } else {
    mockProvider = new MockProviderAdapter();
    providerAdapter = mockProvider as unknown as ProviderAdapter;
  }

  // Run cases with concurrency control
  const outcomes: CaseOutcome[] = [];
  const semaphore = new Semaphore(config.concurrency);

  const tasks = cases.map(testCase => semaphore.run(async () => {
    return runSingleCase(testCase, providerAdapter, mockProvider, toolSchemas, config);
  }));

  const results = await Promise.all(tasks);
  outcomes.push(...results);

  // Compute stats
  const stats = computeStats(config.provider, outcomes, cases, Date.now() - startTime);

  // Generate report
  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    config,
    stats,
    suggestions: generateSuggestions(stats.failureDistribution),
    failureReport: formatFailureReport(stats.failureDistribution),
  };

  return report;
}

/**
 * Run a single test case.
 */
async function runSingleCase(
  testCase: ToolTestCase,
  _adapter: ProviderAdapter,
  mockProvider: MockProviderAdapter | null,
  _toolSchemas: ReturnType<typeof getToolSchemas>,
  config: BenchmarkConfig,
): Promise<CaseOutcome> {
  const startMs = Date.now();
  let lastError: Error | null = null;

  // Retry loop (for network errors only)
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      let actualToolCall: ToolCallInput | null = null;
      let parseError = false;
      let rawOutput = '';

      if (mockProvider) {
        // Mock mode — get deterministic response
        const mockCall = mockProvider.getToolCallForCase(testCase);
        if (mockCall === null) {
          actualToolCall = null;
        } else {
          actualToolCall = mockCall;
          rawOutput = JSON.stringify({
            tool_calls: [{
              function: { name: mockCall.name, arguments: JSON.stringify(mockCall.params) },
            }],
          });
        }
      } else {
        // Real API mode — call the actual adapter
        // This path is only taken when RUN_REAL_BENCHMARK=true
        const result = await callRealAdapter(_adapter, testCase, _toolSchemas, config);
        actualToolCall = result.toolCall;
        parseError = result.parseError;
        rawOutput = result.rawOutput;
      }

      // Validate the tool call against schema
      const validationResult = actualToolCall
        ? validateToolCall(actualToolCall)
        : null;

      // Check if the test case passed
      const passed = checkPass(testCase, actualToolCall, validationResult);

      // Classify failure if not passed
      let failure: FailureRecord | undefined;
      if (!passed) {
        failure = classifyFailure(
          testCase,
          actualToolCall,
          validationResult,
          parseError,
          rawOutput,
        );
      }

      return {
        caseId: testCase.id,
        passed,
        actualToolCall,
        validationResult,
        parseError,
        latencyMs: Date.now() - startMs,
        failure,
        rawOutput: rawOutput.slice(0, 500),
      };
    } catch (err) {
      lastError = err as Error;
      // Only retry on network errors, not on tool-call errors
      const isNetworkError = isNetworkError_(err as Error);
      if (!isNetworkError || attempt === config.maxRetries) {
        // Final failure
        return {
          caseId: testCase.id,
          passed: false,
          actualToolCall: null,
          validationResult: null,
          parseError: false,
          latencyMs: Date.now() - startMs,
          failure: {
            caseId: testCase.id,
            actualTool: '',
            expectedTool: testCase.expectedTool,
            category: 'NETWORK_ERROR',
            message: `网络错误: ${(err as Error).message}`,
          },
        };
      }
      // Wait before retry (exponential backoff)
      await sleep(Math.pow(2, attempt) * 500);
    }
  }

  // Should not reach here, but handle gracefully
  return {
    caseId: testCase.id,
    passed: false,
    actualToolCall: null,
    validationResult: null,
    parseError: false,
    latencyMs: Date.now() - startMs,
    failure: {
      caseId: testCase.id,
      actualTool: '',
      expectedTool: testCase.expectedTool,
      category: 'UNKNOWN',
      message: `Unexpected error: ${lastError?.message || 'unknown'}`,
    },
  };
}

/**
 * Call the real adapter for a test case (only in real API mode).
 */
async function callRealAdapter(
  adapter: ProviderAdapter,
  testCase: ToolTestCase,
  toolSchemas: ReturnType<typeof getToolSchemas>,
  _config: BenchmarkConfig,
): Promise<{ toolCall: ToolCallInput | null; parseError: boolean; rawOutput: string }> {
  const messages = [
    {
      role: 'system' as const,
      content: `You are a supply chain tool-calling assistant for cross-border e-commerce. Available tools: ${toolSchemas.map(t => t.name).join(', ')}.

Tool selection guidelines:
- query_analytics: 综合分析多个数据源（库存+成本+销售+供应商），用于"分析报告""综合评估""趋势分析"等请求。不要用于查询单一数据源。
- query_cascade_risk: 级联风险评估（多风险因子传播），用于"级联风险""风险传播""综合风险""连锁影响"等请求。不要用于查询单一风险因子（天气用 query_weather、汇率用 query_exchange_rates、港口用 query_port_congestion）。
- query_decision_graph: 决策推理图（因果分析+反事实推理），用于"决策图""因果分析""反事实""推理链"等请求。不要用于查看仪表盘概览（用 query_dashboard）。
- execute_workflow: 执行自动化工作流，用于"执行工作流""自动化流程""批量操作"等请求。不要用于单一数据查询。
- create_transfer: 创建库存转移操作，用于"转移库存""调拨""从A仓转到B仓"等请求。不要用于查询库存（用 query_inventory）。

When the user requests a specific single data source, use the specific query tool.
When the user requests comprehensive/cascade/cross-domain analysis, use the analytics/risk/decision tool.

Call the most appropriate tool for the user's request.`,
    },
    { role: 'user' as const, content: testCase.userInput },
  ];

  try {
    const result = await adapter.callWithTools(
      messages,
      toolSchemas as MCPTool[],
      { toolChoice: 'required', temperature: 0 },
    );

    const rawOutput = JSON.stringify(result);

    // Parse tool calls from the adapter result
    if (result.toolCalls.length === 0) {
      return { toolCall: null, parseError: false, rawOutput };
    }

    const firstCall = result.toolCalls[0];
    return {
      toolCall: { name: firstCall.name, params: firstCall.params },
      parseError: false,
      rawOutput,
    };
  } catch (err) {
    return {
      toolCall: null,
      parseError: true,
      rawOutput: `Error: ${(err as Error).message}`,
    };
  }
}

/**
 * Check if a test case passed.
 */
function checkPass(
  testCase: ToolTestCase,
  actualToolCall: ToolCallInput | null,
  validationResult: ValidationResult | null,
): boolean {
  // Must have a tool call
  if (!actualToolCall) return false;

  // Tool name must match (unless multiToolOk and we'd need a list — for now strict match)
  if (actualToolCall.name !== testCase.expectedTool) return false;

  // Schema must be valid
  if (validationResult && !validationResult.valid) return false;

  // Check expected params match using normalized comparison (handles whitespace, JSON formatting, etc.)
  if (validationResult) {
    const paramResult = compareParamsNormalized(
      actualToolCall.params,
      testCase.expectedParams,
      testCase.forbiddenParams,
    );
    if (!paramResult.matched) return false;
  }

  return true;
}

/**
 * Compute aggregate statistics from case outcomes.
 */
function computeStats(
  provider: ProviderId,
  outcomes: CaseOutcome[],
  testCases: ToolTestCase[],
  durationMs: number,
): ProviderStats {
  const total = outcomes.length;
  const passed = outcomes.filter(o => o.passed).length;
  const failed = total - passed;

  const latencies = outcomes.map(o => o.latencyMs).sort((a, b) => a - b);
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((s, l) => s + l, 0) / latencies.length) : 0;
  const minLatency = latencies.length > 0 ? latencies[0] : 0;
  const maxLatency = latencies.length > 0 ? latencies[latencies.length - 1] : 0;
  const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
  const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;

  const failureRecords = outcomes
    .filter(o => o.failure)
    .map(o => o.failure!) as FailureRecord[];

  const failureDistribution = analyzeFailures(failureRecords, testCases);

  const caseResults: CaseResult[] = outcomes.map(o => ({
    caseId: o.caseId,
    passed: o.passed,
    failure: o.failure,
    latencyMs: o.latencyMs,
  }));

  return {
    provider,
    totalCases: total,
    passed,
    failed,
    successRate: total > 0 ? Math.round((passed / total) * 1000) / 10 : 0,
    avgLatencyMs: avgLatency,
    minLatencyMs: minLatency,
    maxLatencyMs: maxLatency,
    p50LatencyMs: p50,
    p95LatencyMs: p95,
    failureDistribution,
    failureRecords,
    caseResults,
    durationMs,
  };
}

// ─── Report Formatting ──────────────────────────────────────────────────────

/**
 * Generate a Markdown summary report.
 */
export function formatMarkdownReport(report: BenchmarkReport): string {
  const { stats, config, suggestions, failureReport } = report;
  const lines: string[] = [
    '# 工具调用可靠性基准测试报告',
    '',
    `**生成时间**: ${report.generatedAt}`,
    `**Provider**: ${config.provider}`,
    `**模式**: ${config.realApi ? '真实 API' : 'Mock（模拟）'}`,
    `**测试用例数**: ${stats.totalCases}`,
    '',
    '## 核心指标',
    '',
    '| 指标 | 值 |',
    '|------|----|',
    `| 成功率 | **${stats.successRate}%** |`,
    `| 通过/失败 | ${stats.passed}/${stats.failed} |`,
    `| 平均延迟 | ${stats.avgLatencyMs}ms |`,
    `| P50 延迟 | ${stats.p50LatencyMs}ms |`,
    `| P95 延迟 | ${stats.p95LatencyMs}ms |`,
    `| 最小/最大延迟 | ${stats.minLatencyMs}ms / ${stats.maxLatencyMs}ms |`,
    `| 总耗时 | ${stats.durationMs}ms |`,
    '',
    failureReport,
    '',
  ];

  if (suggestions.length > 0) {
    lines.push('## 改进建议');
    lines.push('');
    for (const s of suggestions) {
      lines.push(`- ${s}`);
    }
    lines.push('');
  }

  // Detailed case results
  lines.push('## 详细结果');
  lines.push('');
  lines.push('| 用例 ID | 工具 | 结果 | 延迟 | 失败类别 |');
  lines.push('|---------|------|------|------|----------|');
  for (const cr of stats.caseResults) {
    const outcome = report.stats.failureRecords.find(f => f.caseId === cr.caseId);
    const tool = outcome?.actualTool || outcome?.expectedTool || '-';
    const result = cr.passed ? '✅ 通过' : '❌ 失败';
    const failCat = cr.failure ? cr.failure.category : '';
    lines.push(`| ${cr.caseId} | ${tool} | ${result} | ${cr.latencyMs}ms | ${failCat} |`);
  }

  return lines.join('\n');
}

/**
 * Generate a JSON report (for programmatic consumption).
 */
export function formatJsonReport(report: BenchmarkReport): string {
  return JSON.stringify(report, null, 2);
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/** Simple semaphore for concurrency control */
class Semaphore {
  private available: number;
  private waiters: Array<() => void> = [];

  constructor(max: number) {
    this.available = max;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return;
    }
    await new Promise<void>(resolve => this.waiters.push(resolve));
  }

  private release(): void {
    if (this.waiters.length > 0) {
      const next = this.waiters.shift()!;
      next();
    } else {
      this.available++;
    }
  }
}

/** Check if an error is a network error (worth retrying) */
function isNetworkError_(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('enotfound') ||
    msg.includes('rate limit') ||
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('502');
}

/** Sleep helper */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
