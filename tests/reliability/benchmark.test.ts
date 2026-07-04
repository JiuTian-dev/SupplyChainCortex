/**
 * Benchmark Meta-Tests — validates the reliability benchmark suite itself.
 *
 * These tests ensure:
 * 1. tool-cases.ts has 100+ cases with correct format
 * 2. tool-schema-validator.ts correctly identifies various errors
 * 3. failure-analyzer.ts classifies failures correctly
 * 4. provider-benchmark.ts mock mode runs successfully
 *
 * This is "testing the tests" — meta-testing for benchmark reliability.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  allToolCases,
  getCaseCount,
  getCasesByFamily,
  getCasesByTool,
  getCaseById,
  getFamilyStats,
  getDifficultyStats,
  getCoveredTools,
  type ToolTestCase,
} from './tool-cases';
import {
  validateToolCall,
  compareParams,
  loadSchemas,
  clearSchemaCache,
} from './tool-schema-validator';
import {
  classifyFailure,
  analyzeFailures,
  formatFailureReport,
  generateSuggestions,
  type FailureRecord,
} from './failure-analyzer';
import {
  MockProviderAdapter,
  runBenchmark,
  formatMarkdownReport,
  formatJsonReport,
  DEFAULT_CONFIG,
  type BenchmarkConfig,
} from './provider-benchmark';

// ─── Test Case Format Validation ────────────────────────────────────────────

describe('Tool Cases Format', () => {
  it('should have at least 100 test cases', () => {
    expect(getCaseCount()).toBeGreaterThanOrEqual(100);
  });

  it('should cover all 5 tool families', () => {
    const stats = getFamilyStats();
    expect(stats.crud).toBeGreaterThan(0);
    expect(stats.operations).toBeGreaterThan(0);
    expect(stats.intelligence).toBeGreaterThan(0);
    expect(stats['supply-chain']).toBeGreaterThan(0);
    expect(stats['supplier-graph']).toBeGreaterThan(0);
  });

  it('every case should have required fields', () => {
    for (const tc of allToolCases) {
      expect(tc.id).toBeTruthy();
      expect(tc.family).toBeTruthy();
      expect(tc.userInput).toBeTruthy();
      expect(tc.expectedTool).toBeTruthy();
      expect(tc.expectedParams).toBeDefined();
      expect(tc.description).toBeTruthy();
      expect(tc.difficulty).toBeTruthy();
      expect(['easy', 'medium', 'hard']).toContain(tc.difficulty);
    }
  });

  it('every case ID should be unique', () => {
    const ids = allToolCases.map(c => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('every case should have a non-empty user input', () => {
    for (const tc of allToolCases) {
      expect(tc.userInput.length).toBeGreaterThan(3);
    }
  });

  it('every case should reference a valid tool family', () => {
    const validFamilies = ['crud', 'operations', 'intelligence', 'supply-chain', 'supplier-graph'];
    for (const tc of allToolCases) {
      expect(validFamilies).toContain(tc.family);
    }
  });

  it('should have a mix of difficulty levels', () => {
    const stats = getDifficultyStats();
    expect(stats.easy).toBeGreaterThan(0);
    expect(stats.medium).toBeGreaterThan(0);
    expect(stats.hard).toBeGreaterThan(0);
  });

  it('getCaseById should return the correct case', () => {
    const firstCase = allToolCases[0];
    const found = getCaseById(firstCase.id);
    expect(found).toBeDefined();
    expect(found?.id).toBe(firstCase.id);
  });

  it('getCasesByFamily should filter correctly', () => {
    const crudCases = getCasesByFamily('crud');
    expect(crudCases.length).toBeGreaterThan(0);
    expect(crudCases.every(c => c.family === 'crud')).toBe(true);
  });

  it('getCasesByTool should filter correctly', () => {
    const firstTool = allToolCases[0].expectedTool;
    const toolCases = getCasesByTool(firstTool);
    expect(toolCases.length).toBeGreaterThan(0);
    expect(toolCases.every(c => c.expectedTool === firstTool)).toBe(true);
  });

  it('should cover at least 50 unique tools', () => {
    const covered = getCoveredTools();
    expect(covered.length).toBeGreaterThanOrEqual(50);
  });
});

// ─── Schema Validator Tests ─────────────────────────────────────────────────

describe('Tool Schema Validator', () => {
  beforeAll(() => {
    clearSchemaCache();
  });

  it('should load all tool schemas from the registry', () => {
    const schemas = loadSchemas();
    expect(schemas.size).toBeGreaterThanOrEqual(50);
  });

  it('should validate a correct tool call', () => {
    const result = validateToolCall({
      name: 'query_inventory',
      params: { action: 'overview' },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.toolExists).toBe(true);
  });

  it('should detect missing required parameters', () => {
    const result = validateToolCall({
      name: 'query_inventory',
      params: {}, // missing required 'action'
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.category === 'MISSING_REQUIRED_PARAM')).toBe(true);
    expect(result.errors.some(e => e.param === 'action')).toBe(true);
  });

  it('should detect invalid enum values', () => {
    const result = validateToolCall({
      name: 'query_inventory',
      params: { action: 'invalid_action' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.category === 'INVALID_ENUM')).toBe(true);
  });

  it('should detect hallucinated parameters', () => {
    const result = validateToolCall({
      name: 'query_inventory',
      params: { action: 'overview', fake_param: 'should not be here' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.category === 'HALLUCINATED_PARAM')).toBe(true);
    expect(result.errors.some(e => e.param === 'fake_param')).toBe(true);
  });

  it('should detect invalid parameter types', () => {
    const result = validateToolCall({
      name: 'query_inventory',
      params: { action: 'overview', days: 'ninety' }, // should be number
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.category === 'INVALID_TYPE')).toBe(true);
  });

  it('should detect non-existent tools', () => {
    const result = validateToolCall({
      name: 'nonexistent_tool_xyz',
      params: {},
    });
    expect(result.valid).toBe(false);
    expect(result.toolExists).toBe(false);
  });

  it('should validate create_reorder with all required params', () => {
    const result = validateToolCall({
      name: 'create_reorder',
      params: {
        sku: 'KA-RC4001',
        productName: '智能电饭煲',
        quantity: 100,
        warehouse: '深圳仓',
      },
    });
    expect(result.valid).toBe(true);
  });

  it('should detect missing multiple required params in create_reorder', () => {
    const result = validateToolCall({
      name: 'create_reorder',
      params: { sku: 'KA-RC4001' }, // missing productName, quantity, warehouse
    });
    expect(result.valid).toBe(false);
    const missingParams = result.errors
      .filter(e => e.category === 'MISSING_REQUIRED_PARAM')
      .map(e => e.param);
    expect(missingParams).toContain('productName');
    expect(missingParams).toContain('quantity');
    expect(missingParams).toContain('warehouse');
  });

  it('compareParams should detect value mismatches', () => {
    const result = compareParams(
      { action: 'list', warehouse: '北京仓' },
      { action: 'list', warehouse: '深圳仓' },
    );
    expect(result.matched).toBe(false);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0].param).toBe('warehouse');
    expect(result.mismatches[0].reason).toBe('wrong_value');
  });

  it('compareParams should detect forbidden params', () => {
    const result = compareParams(
      { action: 'overview', priority: 'urgent' },
      { action: 'overview' },
      ['priority'],
    );
    expect(result.matched).toBe(false);
    expect(result.forbiddenPresent).toContain('priority');
  });

  it('compareParams should pass for matching params', () => {
    const result = compareParams(
      { action: 'overview', warehouse: '深圳仓' },
      { action: 'overview', warehouse: '深圳仓' },
    );
    expect(result.matched).toBe(true);
  });

  it('compareParams should allow extra params (partial match)', () => {
    const result = compareParams(
      { action: 'overview', warehouse: '深圳仓', extra: 'ok' },
      { action: 'overview', warehouse: '深圳仓' },
    );
    expect(result.matched).toBe(true);
  });
});

// ─── Failure Analyzer Tests ─────────────────────────────────────────────────

describe('Failure Analyzer', () => {
  const sampleTestCase: ToolTestCase = {
    id: 'test-001',
    family: 'crud',
    userInput: '查询库存',
    expectedTool: 'query_inventory',
    expectedParams: { action: 'overview', warehouse: '深圳仓' },
    description: 'test case',
    difficulty: 'easy',
  };

  it('should classify NO_TOOL_CALL when no tool is called', () => {
    const failure = classifyFailure(sampleTestCase, null, null, false, 'some text');
    expect(failure.category).toBe('NO_TOOL_CALL');
  });

  it('should classify JSON_PARSE_ERROR when parse fails', () => {
    const failure = classifyFailure(sampleTestCase, null, null, true, 'invalid json');
    expect(failure.category).toBe('JSON_PARSE_ERROR');
  });

  it('should classify TOOL_NOT_FOUND for unknown tools', () => {
    const failure = classifyFailure(
      sampleTestCase,
      { name: 'fake_tool', params: {} },
      { valid: false, toolName: 'fake_tool', errors: [], toolExists: false, validatedParams: {} },
      false,
    );
    expect(failure.category).toBe('TOOL_NOT_FOUND');
  });

  it('should classify WRONG_TOOL when tool differs from expected', () => {
    const failure = classifyFailure(
      sampleTestCase,
      { name: 'query_cost', params: { action: 'overview' } },
      { valid: true, toolName: 'query_cost', errors: [], toolExists: true, validatedParams: { action: 'overview' } },
      false,
    );
    expect(failure.category).toBe('WRONG_TOOL');
    expect(failure.actualTool).toBe('query_cost');
    expect(failure.expectedTool).toBe('query_inventory');
  });

  it('should classify MISSING_REQUIRED_PARAM', () => {
    const failure = classifyFailure(
      sampleTestCase,
      { name: 'query_inventory', params: {} },
      {
        valid: false,
        toolName: 'query_inventory',
        errors: [{ category: 'MISSING_REQUIRED_PARAM', param: 'action', message: 'missing action' }],
        toolExists: true,
        validatedParams: {},
      },
      false,
    );
    expect(failure.category).toBe('MISSING_REQUIRED_PARAM');
  });

  it('should classify PARAM_MISMATCH when tool correct but params wrong', () => {
    const failure = classifyFailure(
      sampleTestCase,
      { name: 'query_inventory', params: { action: 'overview', warehouse: '北京仓' } },
      { valid: true, toolName: 'query_inventory', errors: [], toolExists: true, validatedParams: { action: 'overview', warehouse: '北京仓' } },
      false,
    );
    expect(failure.category).toBe('PARAM_MISMATCH');
    expect(failure.paramMismatches).toBeDefined();
    expect(failure.paramMismatches!.some(m => m.param === 'warehouse')).toBe(true);
  });

  it('should classify HALLUCINATED_PARAM', () => {
    const failure = classifyFailure(
      sampleTestCase,
      { name: 'query_inventory', params: { action: 'overview', warehouse: '深圳仓', fake: 'x' } },
      {
        valid: false,
        toolName: 'query_inventory',
        errors: [{ category: 'HALLUCINATED_PARAM', param: 'fake', message: 'hallucinated' }],
        toolExists: true,
        validatedParams: { action: 'overview', warehouse: '深圳仓' },
      },
      false,
    );
    expect(failure.category).toBe('HALLUCINATED_PARAM');
  });

  it('should classify INVALID_ENUM', () => {
    const failure = classifyFailure(
      sampleTestCase,
      { name: 'query_inventory', params: { action: 'bad_action' } },
      {
        valid: false,
        toolName: 'query_inventory',
        errors: [{ category: 'INVALID_ENUM', param: 'action', message: 'bad enum', expected: 'overview|list', actual: 'bad_action' }],
        toolExists: true,
        validatedParams: {},
      },
      false,
    );
    expect(failure.category).toBe('INVALID_ENUM');
  });

  it('analyzeFailures should produce correct distribution', () => {
    const failures: FailureRecord[] = [
      { caseId: 'c1', actualTool: 'a', expectedTool: 'b', category: 'WRONG_TOOL', message: 'm' },
      { caseId: 'c2', actualTool: 'a', expectedTool: 'b', category: 'WRONG_TOOL', message: 'm' },
      { caseId: 'c3', actualTool: 'a', expectedTool: 'b', category: 'MISSING_REQUIRED_PARAM', message: 'm' },
    ];
    const dist = analyzeFailures(failures, [sampleTestCase]);
    expect(dist.totalFailures).toBe(3);
    expect(dist.byCategory.WRONG_TOOL).toBe(2);
    expect(dist.byCategory.MISSING_REQUIRED_PARAM).toBe(1);
    expect(dist.dominantCategory).toBe('WRONG_TOOL');
    expect(dist.byCategoryPct.WRONG_TOOL).toBe(66.7);
  });

  it('formatFailureReport should generate markdown', () => {
    const failures: FailureRecord[] = [
      { caseId: 'c1', actualTool: 'a', expectedTool: 'b', category: 'WRONG_TOOL', message: 'm' },
    ];
    const dist = analyzeFailures(failures, [sampleTestCase]);
    const report = formatFailureReport(dist);
    expect(report).toContain('失败模式分析报告');
    expect(report).toContain('WRONG_TOOL');
    expect(report).toContain('| 类别 |');
  });

  it('generateSuggestions should provide actionable advice', () => {
    const failures: FailureRecord[] = [
      { caseId: 'c1', actualTool: '', expectedTool: 'query_inventory', category: 'NO_TOOL_CALL', message: 'm' },
      { caseId: 'c2', actualTool: 'a', expectedTool: 'b', category: 'WRONG_TOOL', message: 'm' },
    ];
    const dist = analyzeFailures(failures, [sampleTestCase]);
    const suggestions = generateSuggestions(dist);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some(s => s.includes('NO_TOOL_CALL'))).toBe(true);
    expect(suggestions.some(s => s.includes('WRONG_TOOL'))).toBe(true);
  });
});

// ─── Provider Benchmark Tests (Mock Mode) ───────────────────────────────────

describe('Provider Benchmark (Mock Mode)', () => {
  it('MockProviderAdapter should return correct tool call for passing cases', () => {
    const mock = new MockProviderAdapter(0); // 0% failure rate
    const testCase = allToolCases[0];
    const call = mock.getToolCallForCase(testCase);
    expect(call).not.toBeNull();
    expect(call!.name).toBe(testCase.expectedTool);
  });

  it('MockProviderAdapter should simulate failures at specified rate', () => {
    const mock = new MockProviderAdapter(1.0); // 100% failure rate
    const testCase = allToolCases[0];
    expect(mock.isFailureCase(testCase.id)).toBe(true);
  });

  it('MockProviderAdapter should simulate NO_TOOL_CALL', () => {
    const mock = new MockProviderAdapter(1.0);
    // Find a case that's set to NO_TOOL_CALL
    const noCallCase = allToolCases.find(tc => {
      const call = mock.getToolCallForCase(tc);
      return call === null;
    });
    // With 100% failure rate, at least some should be NO_TOOL_CALL
    expect(noCallCase).toBeDefined();
  });

  it('MockProviderAdapter should simulate WRONG_TOOL', () => {
    const mock = new MockProviderAdapter(1.0);
    const wrongToolCase = allToolCases.find(tc => {
      const call = mock.getToolCallForCase(tc);
      return call !== null && call.name !== tc.expectedTool;
    });
    expect(wrongToolCase).toBeDefined();
  });

  it('runBenchmark should run in mock mode without API calls', async () => {
    const config: BenchmarkConfig = {
      ...DEFAULT_CONFIG,
      provider: 'deepseek',
      limit: 10,
      realApi: false,
      concurrency: 2,
    };

    const report = await runBenchmark(config);

    expect(report).toBeDefined();
    expect(report.stats.totalCases).toBe(10);
    expect(report.stats.passed + report.stats.failed).toBe(10);
    expect(report.stats.successRate).toBeGreaterThanOrEqual(0);
    expect(report.stats.successRate).toBeLessThanOrEqual(100);
    expect(report.stats.avgLatencyMs).toBeGreaterThanOrEqual(0);
    expect(report.stats.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('runBenchmark should produce failure distribution when failures exist', async () => {
    const config: BenchmarkConfig = {
      ...DEFAULT_CONFIG,
      provider: 'deepseek',
      limit: 20,
      realApi: false,
    };

    const report = await runBenchmark(config);

    // With ~15% failure rate, 20 cases should have at least 1 failure
    if (report.stats.failed > 0) {
      expect(report.stats.failureDistribution.totalFailures).toBe(report.stats.failed);
      expect(report.stats.failureRecords.length).toBe(report.stats.failed);
      expect(report.suggestions.length).toBeGreaterThan(0);
    }
  });

  it('formatMarkdownReport should generate valid markdown', async () => {
    const config: BenchmarkConfig = {
      ...DEFAULT_CONFIG,
      provider: 'deepseek',
      limit: 5,
      realApi: false,
    };

    const report = await runBenchmark(config);
    const md = formatMarkdownReport(report);

    expect(md).toContain('工具调用可靠性基准测试报告');
    expect(md).toContain('核心指标');
    expect(md).toContain('成功率');
    expect(md).toContain('| 指标 |');
  });

  it('formatJsonReport should generate valid JSON', async () => {
    const config: BenchmarkConfig = {
      ...DEFAULT_CONFIG,
      provider: 'deepseek',
      limit: 5,
      realApi: false,
    };

    const report = await runBenchmark(config);
    const json = formatJsonReport(report);

    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.stats).toBeDefined();
    expect(parsed.config).toBeDefined();
  });

  it('runBenchmark should respect family filter', async () => {
    const config: BenchmarkConfig = {
      ...DEFAULT_CONFIG,
      provider: 'deepseek',
      family: 'crud',
      realApi: false,
    };

    const report = await runBenchmark(config);
    const crudCount = getCasesByFamily('crud').length;
    expect(report.stats.totalCases).toBe(crudCount);
  });

  it('runBenchmark should respect limit', async () => {
    const config: BenchmarkConfig = {
      ...DEFAULT_CONFIG,
      provider: 'deepseek',
      limit: 5,
      realApi: false,
    };

    const report = await runBenchmark(config);
    expect(report.stats.totalCases).toBe(5);
  });
});

// ─── Integration: End-to-End Mock Benchmark ─────────────────────────────────

describe('End-to-End Mock Benchmark', () => {
  it('should run a full benchmark and generate a complete report', async () => {
    const config: BenchmarkConfig = {
      ...DEFAULT_CONFIG,
      provider: 'deepseek',
      limit: 15,
      realApi: false,
      concurrency: 3,
    };

    const report = await runBenchmark(config);

    // Verify report structure
    expect(report.generatedAt).toBeTruthy();
    expect(report.config.provider).toBe('deepseek');
    expect(report.config.realApi).toBe(false);

    // Verify stats
    expect(report.stats.totalCases).toBe(15);
    expect(report.stats.passed + report.stats.failed).toBe(15);
    expect(report.stats.successRate).toBeGreaterThanOrEqual(0);

    // Verify case results
    expect(report.stats.caseResults.length).toBe(15);
    expect(report.stats.caseResults.every(cr => cr.caseId)).toBe(true);
    expect(report.stats.caseResults.every(cr => typeof cr.passed === 'boolean')).toBe(true);

    // Verify failure analysis (if there are failures)
    if (report.stats.failed > 0) {
      expect(report.stats.failureDistribution.totalFailures).toBe(report.stats.failed);
      expect(report.stats.failureRecords.length).toBe(report.stats.failed);
      expect(report.failureReport).toContain('失败模式分析报告');
    }

    // Verify markdown and JSON output
    const md = formatMarkdownReport(report);
    const json = formatJsonReport(report);
    expect(md.length).toBeGreaterThan(100);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
