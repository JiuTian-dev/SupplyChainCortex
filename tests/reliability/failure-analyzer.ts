/**
 * Failure Analyzer — classifies and aggregates tool call failures.
 *
 * Categories:
 * - TOOL_NOT_FOUND: LLM chose a tool that doesn't exist in the registry
 * - WRONG_TOOL: LLM chose a different tool than expected
 * - MISSING_REQUIRED_PARAM: Required parameter is absent
 * - INVALID_TYPE: Parameter has wrong type (e.g., string instead of number)
 * - INVALID_ENUM: Enum value not in allowed list
 * - HALLUCINATED_PARAM: LLM invented a parameter not in schema
 * - JSON_PARSE_ERROR: LLM output couldn't be parsed as valid JSON
 * - NO_TOOL_CALL: LLM didn't call any tool
 * - PARAM_MISMATCH: Tool was correct but key params didn't match expected
 */

import type { ToolTestCase } from './tool-cases';
import type { ValidationResult, ValidationError } from './tool-schema-validator';
import { compareParams } from './tool-schema-validator';

// ─── Types ──────────────────────────────────────────────────────────────────

export type FailureCategory =
  | 'TOOL_NOT_FOUND'
  | 'WRONG_TOOL'
  | 'MISSING_REQUIRED_PARAM'
  | 'INVALID_TYPE'
  | 'INVALID_ENUM'
  | 'HALLUCINATED_PARAM'
  | 'JSON_PARSE_ERROR'
  | 'NO_TOOL_CALL'
  | 'PARAM_MISMATCH'
  | 'EMPTY_REQUIRED_PARAM'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface FailureRecord {
  /** Test case ID that failed */
  caseId: string;
  /** Tool the LLM chose (may be empty if no tool was called) */
  actualTool: string;
  /** Tool that was expected */
  expectedTool: string;
  /** Primary failure category */
  category: FailureCategory;
  /** Detailed failure message */
  message: string;
  /** Raw LLM output (truncated for logging) */
  rawOutput?: string;
  /** Sub-errors from schema validation (if any) */
  validationErrors?: ValidationError[];
  /** Which params mismatched (if PARAM_MISMATCH) */
  paramMismatches?: Array<{ param: string; expected: unknown; actual: unknown; reason: string }>;
}

export interface FailureDistribution {
  /** Total failures analyzed */
  totalFailures: number;
  /** Count by category */
  byCategory: Record<FailureCategory, number>;
  /** Percentage by category */
  byCategoryPct: Record<FailureCategory, number>;
  /** Failures grouped by tool family */
  byFamily: Record<string, number>;
  /** Failures grouped by difficulty */
  byDifficulty: Record<string, number>;
  /** Most common failure (the dominant pattern) */
  dominantCategory: FailureCategory | null;
}

export interface CaseResult {
  caseId: string;
  passed: boolean;
  failure?: FailureRecord;
  latencyMs?: number;
}

// ─── Classification Logic ───────────────────────────────────────────────────

/**
 * Classify a single failure into a category.
 *
 * Priority order:
 * 1. JSON_PARSE_ERROR — couldn't parse LLM output at all
 * 2. NO_TOOL_CALL — LLM returned text without any tool call
 * 3. TOOL_NOT_FOUND — tool name doesn't exist in registry
 * 4. WRONG_TOOL — tool exists but isn't the expected one
 * 5. MISSING_REQUIRED_PARAM / INVALID_TYPE / INVALID_ENUM / HALLUCINATED_PARAM — schema errors
 * 6. PARAM_MISMATCH — tool correct but params don't match expected
 */
export function classifyFailure(
  testCase: ToolTestCase,
  actualToolCall: { name: string; params: Record<string, unknown> } | null,
  validationResult: ValidationResult | null,
  parseError: boolean,
  rawOutput?: string,
): FailureRecord {
  const caseId = testCase.id;
  const expectedTool = testCase.expectedTool;

  // 1. JSON parse error
  if (parseError) {
    return {
      caseId,
      actualTool: '',
      expectedTool,
      category: 'JSON_PARSE_ERROR',
      message: 'LLM 返回的工具调用无法解析为有效 JSON',
      rawOutput: rawOutput?.slice(0, 500),
    };
  }

  // 2. No tool call
  if (!actualToolCall || !actualToolCall.name) {
    return {
      caseId,
      actualTool: '',
      expectedTool,
      category: 'NO_TOOL_CALL',
      message: 'LLM 未调用任何工具',
      rawOutput: rawOutput?.slice(0, 500),
    };
  }

  const actualTool = actualToolCall.name;

  // 3. Tool not found
  if (validationResult && !validationResult.toolExists) {
    return {
      caseId,
      actualTool,
      expectedTool,
      category: 'TOOL_NOT_FOUND',
      message: `LLM 选择了不存在的工具: ${actualTool}`,
      rawOutput: rawOutput?.slice(0, 500),
    };
  }

  // 4. Wrong tool
  if (actualTool !== expectedTool) {
    return {
      caseId,
      actualTool,
      expectedTool,
      category: 'WRONG_TOOL',
      message: `LLM 选择了 ${actualTool}，期望 ${expectedTool}`,
      rawOutput: rawOutput?.slice(0, 500),
    };
  }

  // 5. Schema validation errors — pick the most severe
  if (validationResult && validationResult.errors.length > 0) {
    // Priority: MISSING_REQUIRED_PARAM > INVALID_TYPE > INVALID_ENUM > HALLUCINATED_PARAM > EMPTY
    const priority: FailureCategory[] = [
      'MISSING_REQUIRED_PARAM',
      'INVALID_TYPE',
      'INVALID_ENUM',
      'HALLUCINATED_PARAM',
      'EMPTY_REQUIRED_PARAM',
    ];

    for (const cat of priority) {
      const error = validationResult.errors.find(e => e.category === cat);
      if (error) {
        return {
          caseId,
          actualTool,
          expectedTool,
          category: cat as FailureCategory,
          message: error.message,
          validationErrors: validationResult.errors,
          rawOutput: rawOutput?.slice(0, 500),
        };
      }
    }

    // Fallback to first error
    const firstError = validationResult.errors[0];
    return {
      caseId,
      actualTool,
      expectedTool,
      category: firstError.category as FailureCategory,
      message: firstError.message,
      validationErrors: validationResult.errors,
      rawOutput: rawOutput?.slice(0, 500),
    };
  }

  // 6. Param mismatch — tool correct, schema valid, but params don't match expected
  const paramResult = compareParams(
    actualToolCall.params,
    testCase.expectedParams,
    testCase.forbiddenParams,
  );

  if (!paramResult.matched) {
    const mismatchDetails = paramResult.mismatches
      .map(m => `${m.param}(期望:${JSON.stringify(m.expected)}, 实际:${JSON.stringify(m.actual)}, 原因:${m.reason})`)
      .join('; ');
    const forbiddenInfo = paramResult.forbiddenPresent.length > 0
      ? `; 不应出现的参数: ${paramResult.forbiddenPresent.join(', ')}`
      : '';

    return {
      caseId,
      actualTool,
      expectedTool,
      category: 'PARAM_MISMATCH',
      message: `参数不匹配: ${mismatchDetails}${forbiddenInfo}`,
      paramMismatches: paramResult.mismatches.map(m => ({
        param: m.param,
        expected: m.expected,
        actual: m.actual,
        reason: m.reason,
      })),
      rawOutput: rawOutput?.slice(0, 500),
    };
  }

  // Should not reach here if the case actually failed, but handle gracefully
  return {
    caseId,
    actualTool,
    expectedTool,
    category: 'UNKNOWN',
    message: '未知失败原因',
    rawOutput: rawOutput?.slice(0, 500),
  };
}

// ─── Aggregation ────────────────────────────────────────────────────────────

/**
 * Analyze a batch of failure records and produce a distribution report.
 */
export function analyzeFailures(
  failures: FailureRecord[],
  testCases: ToolTestCase[],
): FailureDistribution {
  const byCategory: Record<FailureCategory, number> = {
    TOOL_NOT_FOUND: 0,
    WRONG_TOOL: 0,
    MISSING_REQUIRED_PARAM: 0,
    INVALID_TYPE: 0,
    INVALID_ENUM: 0,
    HALLUCINATED_PARAM: 0,
    JSON_PARSE_ERROR: 0,
    NO_TOOL_CALL: 0,
    PARAM_MISMATCH: 0,
    EMPTY_REQUIRED_PARAM: 0,
    NETWORK_ERROR: 0,
    UNKNOWN: 0,
  };

  const byFamily: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};

  const caseMap = new Map(testCases.map(c => [c.id, c]));

  for (const failure of failures) {
    byCategory[failure.category]++;

    const testCase = caseMap.get(failure.caseId);
    if (testCase) {
      byFamily[testCase.family] = (byFamily[testCase.family] || 0) + 1;
      byDifficulty[testCase.difficulty] = (byDifficulty[testCase.difficulty] || 0) + 1;
    }
  }

  const total = failures.length;
  const byCategoryPct: Record<FailureCategory, number> = {} as Record<FailureCategory, number>;
  for (const key of Object.keys(byCategory) as FailureCategory[]) {
    byCategoryPct[key] = total > 0 ? Math.round((byCategory[key] / total) * 1000) / 10 : 0;
  }

  // Find dominant category
  let dominantCategory: FailureCategory | null = null;
  let maxCount = 0;
  for (const key of Object.keys(byCategory) as FailureCategory[]) {
    if (byCategory[key] > maxCount) {
      maxCount = byCategory[key];
      dominantCategory = key;
    }
  }

  return {
    totalFailures: total,
    byCategory,
    byCategoryPct,
    byFamily,
    byDifficulty,
    dominantCategory: maxCount > 0 ? dominantCategory : null,
  };
}

// ─── Reporting ──────────────────────────────────────────────────────────────

/**
 * Generate a human-readable failure distribution report (Markdown).
 */
export function formatFailureReport(distribution: FailureDistribution): string {
  const lines: string[] = [
    '## 失败模式分析报告',
    '',
    `**总失败数**: ${distribution.totalFailures}`,
    '',
    '### 按失败类别分布',
    '',
    '| 类别 | 数量 | 占比 |',
    '|------|------|------|',
  ];

  const categoryLabels: Record<FailureCategory, string> = {
    TOOL_NOT_FOUND: '工具不存在',
    WRONG_TOOL: '工具选择错误',
    MISSING_REQUIRED_PARAM: '缺少必填参数',
    INVALID_TYPE: '参数类型错误',
    INVALID_ENUM: '枚举值非法',
    HALLUCINATED_PARAM: '编造参数',
    JSON_PARSE_ERROR: 'JSON解析错误',
    NO_TOOL_CALL: '未调用工具',
    PARAM_MISMATCH: '参数值不匹配',
    EMPTY_REQUIRED_PARAM: '必填参数为空',
    NETWORK_ERROR: '网络错误',
    UNKNOWN: '未知错误',
  };

  // Sort by count descending
  const sortedCategories = (Object.keys(distribution.byCategory) as FailureCategory[])
    .filter(c => distribution.byCategory[c] > 0)
    .sort((a, b) => distribution.byCategory[b] - distribution.byCategory[a]);

  for (const cat of sortedCategories) {
    lines.push(
      `| ${categoryLabels[cat]} (${cat}) | ${distribution.byCategory[cat]} | ${distribution.byCategoryPct[cat]}% |`,
    );
  }

  lines.push('');
  lines.push('### 按工具家族分布');
  lines.push('');
  lines.push('| 家族 | 失败数 |');
  lines.push('|------|--------|');
  for (const [family, count] of Object.entries(distribution.byFamily).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${family} | ${count} |`);
  }

  lines.push('');
  lines.push('### 按难度分布');
  lines.push('');
  lines.push('| 难度 | 失败数 |');
  lines.push('|------|--------|');
  for (const [diff, count] of Object.entries(distribution.byDifficulty).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${diff} | ${count} |`);
  }

  if (distribution.dominantCategory) {
    lines.push('');
    lines.push(`**主要失败模式**: ${categoryLabels[distribution.dominantCategory]} (${distribution.dominantCategory})`);
  }

  return lines.join('\n');
}

/**
 * Generate improvement suggestions based on failure distribution.
 */
export function generateSuggestions(distribution: FailureDistribution): string[] {
  const suggestions: string[] = [];

  if (distribution.byCategory.NO_TOOL_CALL > 0) {
    suggestions.push(
      `NO_TOOL_CALL (${distribution.byCategory.NO_TOOL_CALL}次): 在 system prompt 中强化"必须调用工具"的指令，` +
      '使用 tool_choice: "required" 强制工具调用。',
    );
  }

  if (distribution.byCategory.WRONG_TOOL > 0) {
    suggestions.push(
      `WRONG_TOOL (${distribution.byCategory.WRONG_TOOL}次): 改进工具描述，增加区分性关键词。` +
      '考虑在 system prompt 中添加工具选择示例（few-shot）。',
    );
  }

  if (distribution.byCategory.MISSING_REQUIRED_PARAM > 0) {
    suggestions.push(
      `MISSING_REQUIRED_PARAM (${distribution.byCategory.MISSING_REQUIRED_PARAM}次): 在工具描述中明确标注必填参数，` +
      '使用 "必须提供X" 的措辞。考虑在 prompt 中重申参数要求。',
    );
  }

  if (distribution.byCategory.HALLUCINATED_PARAM > 0) {
    suggestions.push(
      `HALLUCINATED_PARAM (${distribution.byCategory.HALLUCINATED_PARAM}次): LLM 编造了 schema 外的参数。` +
      '检查是否有旧版工具参数被 LLM 记忆，或在描述中明确"仅接受以下参数"。',
    );
  }

  if (distribution.byCategory.INVALID_ENUM > 0) {
    suggestions.push(
      `INVALID_ENUM (${distribution.byCategory.INVALID_ENUM}次): 枚举值不匹配。` +
      '在工具描述中用自然语言列出所有合法值，而非仅依赖 schema enum。',
    );
  }

  if (distribution.byCategory.INVALID_TYPE > 0) {
    suggestions.push(
      `INVALID_TYPE (${distribution.byCategory.INVALID_TYPE}次): 参数类型错误。` +
      '在描述中添加类型示例，如 "quantity: 数字，如 100"。',
    );
  }

  if (distribution.byCategory.JSON_PARSE_ERROR > 0) {
    suggestions.push(
      `JSON_PARSE_ERROR (${distribution.byCategory.JSON_PARSE_ERROR}次): LLM 输出无法解析。` +
      '增强 text-fallback 解析逻辑，或使用 response_format: json_object。',
    );
  }

  if (distribution.byCategory.PARAM_MISMATCH > 0) {
    suggestions.push(
      `PARAM_MISMATCH (${distribution.byCategory.PARAM_MISMATCH}次): 工具正确但参数值与期望不符。` +
      '检查 LLM 是否正确理解了用户输入中的数值/名称，可能需要在 prompt 中强化信息提取。',
    );
  }

  return suggestions;
}
