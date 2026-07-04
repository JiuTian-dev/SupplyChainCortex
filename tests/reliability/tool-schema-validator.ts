/**
 * Tool Schema Validator — validates LLM tool calls against MCP tool schemas.
 *
 * Loads all 82 tool schemas from the MCP registry and validates:
 * - Required parameters are present
 * - Parameter types match (string, number, boolean, array, object)
 * - Enum values are within allowed lists
 * - No hallucinated (unknown) parameters
 *
 * Returns detailed validation results for failure analysis.
 */

import { getToolSchemas, hasTool, type MCPTool } from '@/lib/mcp/tools';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ValidationError {
  /** Error category, matches failure-analyzer classifications */
  category:
    | 'MISSING_REQUIRED_PARAM'
    | 'INVALID_TYPE'
    | 'INVALID_ENUM'
    | 'HALLUCINATED_PARAM'
    | 'EMPTY_REQUIRED_PARAM';
  /** Parameter name that caused the error */
  param: string;
  /** Human-readable error message */
  message: string;
  /** Expected value/type (if applicable) */
  expected?: string;
  /** Actual value received (if applicable) */
  actual?: string;
}

export interface ValidationResult {
  /** Whether the tool call is valid */
  valid: boolean;
  /** Tool name that was validated */
  toolName: string;
  /** All validation errors found (empty if valid) */
  errors: ValidationError[];
  /** Whether the tool exists in the registry */
  toolExists: boolean;
  /** Validated parameters (cleaned) */
  validatedParams: Record<string, unknown>;
}

export interface ToolCallInput {
  /** Tool name the LLM chose */
  name: string;
  /** Parameters the LLM provided */
  params: Record<string, unknown>;
}

// ─── Schema Cache ───────────────────────────────────────────────────────────

let schemaCache: Map<string, MCPTool> | null = null;

/** Load all tool schemas into a Map for O(1) lookup. Cached after first call. */
export function loadSchemas(): Map<string, MCPTool> {
  if (schemaCache) return schemaCache;

  schemaCache = new Map();
  const schemas = getToolSchemas();
  for (const schema of schemas) {
    schemaCache.set(schema.name, schema as MCPTool);
  }
  return schemaCache;
}

/** Clear the schema cache (useful for testing) */
export function clearSchemaCache(): void {
  schemaCache = null;
}

/** Get a tool schema by name */
export function getSchema(toolName: string): MCPTool | undefined {
  return loadSchemas().get(toolName);
}

/** Get all tool names */
export function getAllToolNames(): string[] {
  return Array.from(loadSchemas().keys());
}

// ─── Type Checking ──────────────────────────────────────────────────────────

type JsonSchemaType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'integer';

/**
 * Check if a value matches a JSON Schema type.
 * Note: JSON doesn't distinguish int from float, so 'number' accepts both.
 * Supports both single type (string) and multiple types (array of strings).
 */
function checkType(value: unknown, expectedType: string | string[]): boolean {
  const types = Array.isArray(expectedType) ? expectedType : [expectedType];
  // Value is valid if it matches ANY of the allowed types
  return types.some(t => checkSingleType(value, t));
}

/** Check a value against a single JSON Schema type. */
function checkSingleType(value: unknown, expectedType: string): boolean {
  switch (expectedType as JsonSchemaType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      // JSON numbers parse as JS numbers; reject strings that look numeric
      return typeof value === 'number' && !Number.isNaN(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return true; // Unknown type, don't fail
  }
}

/**
 * Get the JS type name for a value (for error messages).
 */
function getTypeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

// ─── Core Validation ────────────────────────────────────────────────────────

/**
 * Validate a single tool call against its schema.
 *
 * @param input - The tool call to validate
 * @returns Detailed validation result
 */
export function validateToolCall(input: ToolCallInput): ValidationResult {
  const errors: ValidationError[] = [];
  const validatedParams: Record<string, unknown> = {};

  // Check if tool exists
  if (!hasTool(input.name)) {
    return {
      valid: false,
      toolName: input.name,
      errors: [],
      toolExists: false,
      validatedParams: input.params,
    };
  }

  const schema = getSchema(input.name);
  if (!schema) {
    return {
      valid: false,
      toolName: input.name,
      errors: [],
      toolExists: false,
      validatedParams: input.params,
    };
  }

  const properties = schema.parameters.properties || {};
  const required = schema.parameters.required || [];
  const params = input.params || {};

  // 1. Check required params are present and non-empty
  for (const reqParam of required) {
    if (!(reqParam in params)) {
      errors.push({
        category: 'MISSING_REQUIRED_PARAM',
        param: reqParam,
        message: `缺少必填参数: ${reqParam}`,
        expected: properties[reqParam]?.type || 'unknown',
      });
    } else if (params[reqParam] === '' || params[reqParam] === null || params[reqParam] === undefined) {
      errors.push({
        category: 'EMPTY_REQUIRED_PARAM',
        param: reqParam,
        message: `必填参数为空: ${reqParam}`,
        expected: properties[reqParam]?.type || 'unknown',
        actual: String(params[reqParam]),
      });
    }
  }

  // 2. Check each provided param against schema
  for (const [paramName, paramValue] of Object.entries(params)) {
    const paramSchema = properties[paramName];

    // Check for hallucinated params (not in schema)
    if (!paramSchema) {
      errors.push({
        category: 'HALLUCINATED_PARAM',
        param: paramName,
        message: `参数 "${paramName}" 不在工具 schema 中（LLM 编造了不存在的参数）`,
        actual: String(paramValue),
      });
      continue;
    }

    // Skip null/undefined for optional params
    if (paramValue === null || paramValue === undefined) {
      validatedParams[paramName] = paramValue;
      continue;
    }

    // Type check
    if (paramSchema.type && !checkType(paramValue, paramSchema.type)) {
      const expectedType = Array.isArray(paramSchema.type)
        ? paramSchema.type.join(' | ')
        : paramSchema.type;
      errors.push({
        category: 'INVALID_TYPE',
        param: paramName,
        message: `参数 "${paramName}" 类型错误: 期望 ${expectedType}, 实际 ${getTypeName(paramValue)}`,
        expected: expectedType,
        actual: getTypeName(paramValue),
      });
      continue;
    }

    // Enum check
    if (paramSchema.enum && !paramSchema.enum.includes(String(paramValue))) {
      errors.push({
        category: 'INVALID_ENUM',
        param: paramName,
        message: `参数 "${paramName}" 的值 "${paramValue}" 不在允许的枚举列表中`,
        expected: paramSchema.enum.join(' | '),
        actual: String(paramValue),
      });
      continue;
    }

    validatedParams[paramName] = paramValue;
  }

  return {
    valid: errors.length === 0,
    toolName: input.name,
    errors,
    toolExists: true,
    validatedParams,
  };
}

/**
 * Validate multiple tool calls at once.
 */
export function validateToolCalls(calls: ToolCallInput[]): ValidationResult[] {
  return calls.map(validateToolCall);
}

// ─── Expected vs Actual Comparison ──────────────────────────────────────────

export interface ParamMatchResult {
  /** Whether all expected params match */
  matched: boolean;
  /** Params that were expected but missing or mismatched */
  mismatches: Array<{
    param: string;
    expected: unknown;
    actual: unknown;
    reason: 'missing' | 'wrong_value' | 'wrong_type';
  }>;
  /** Params that were forbidden but present */
  forbiddenPresent: string[];
}

/**
 * Compare actual LLM output params against expected params from test cases.
 * Uses deep equality for objects/arrays, partial match (other keys allowed).
 */
export function compareParams(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  forbidden?: string[],
): ParamMatchResult {
  const mismatches: ParamMatchResult['mismatches'] = [];
  const forbiddenPresent: string[] = [];

  // Check each expected param
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (!(key in actual)) {
      mismatches.push({ param: key, expected: expectedValue, actual: undefined, reason: 'missing' });
      continue;
    }

    const actualValue = actual[key];
    if (!deepEqual(actualValue, expectedValue)) {
      const reason = typeof expectedValue !== typeof actualValue ? 'wrong_type' : 'wrong_value';
      mismatches.push({ param: key, expected: expectedValue, actual: actualValue, reason });
    }
  }

  // Check forbidden params
  if (forbidden) {
    for (const f of forbidden) {
      if (f in actual) {
        forbiddenPresent.push(f);
      }
    }
  }

  return {
    matched: mismatches.length === 0 && forbiddenPresent.length === 0,
    mismatches,
    forbiddenPresent,
  };
}

/** Deep equality check for params comparison */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;

  // Cross-type comparison: JSON string vs array/object
  // (handles cases where LLM returns an array but test case expects a JSON string, or vice versa)
  if (typeof a === 'string' && (Array.isArray(b) || (typeof b === 'object' && b !== null))) {
    const aParsed = tryParseJson(a);
    if (aParsed !== undefined && deepEqual(aParsed, b)) return true;
  }
  if (typeof b === 'string' && (Array.isArray(a) || (typeof a === 'object' && a !== null))) {
    const bParsed = tryParseJson(b);
    if (bParsed !== undefined && deepEqual(a, bParsed)) return true;
  }

  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    return arrayMatch(a, b);
  }

  if (typeof a === 'object' && typeof b === 'object') {
    // Partial match for objects: all keys in `expected` (b) must be present and match in `actual` (a).
    // Extra keys in `actual` are allowed (consistent with top-level partial match philosophy).
    // This handles cases where LLM adds extra fields to items (e.g., priority in batch reorder items).
    const bKeys = Object.keys(b as object);
    return bKeys.every(key => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
  }

  // For numbers, allow small float tolerance
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 0.001;
  }

  // For strings, apply normalization:
  // 1. JSON string normalization (parse and compare parsed values, ignoring whitespace)
  // 2. Whitespace normalization for plain strings (remove all spaces and compare)
  if (typeof a === 'string' && typeof b === 'string') {
    return normalizedStringEqual(a, b);
  }

  return false;
}

/**
 * Array comparison with order-independent matching and superset tolerance.
 * Semantics: every element in `expected` (b) must have a matching element in `actual` (a).
 * Extra elements in `actual` are allowed (partial match philosophy, consistent with
 * how extra top-level params are allowed). This handles:
 * - LLM adding extra symbols (e.g., ['QQQ','SMH'] expected, ['QQQ','SMH','^IXIC'] actual)
 * - LLM returning items in a different order
 */
function arrayMatch(actual: unknown[], expected: unknown[]): boolean {
  if (actual.length < expected.length) return false;
  // For each expected element, find a matching actual element (order-independent)
  const used = new Set<number>();
  for (const expItem of expected) {
    let found = false;
    for (let i = 0; i < actual.length; i++) {
      if (used.has(i)) continue;
      if (deepEqual(actual[i], expItem)) {
        used.add(i);
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

/**
 * Compare two strings with normalization:
 * - If both look like JSON, parse and deep-compare (handles `[100,200]` vs `[100, 200]`)
 * - Otherwise, remove all whitespace and compare (handles `便携榨汁杯300ml` vs `便携榨汁杯 300ml`)
 */
function normalizedStringEqual(a: string, b: string): boolean {
  if (a === b) return true;

  // Try JSON normalization first (handles array/object string formatting differences)
  const aJson = tryParseJson(a);
  const bJson = tryParseJson(b);
  if (aJson !== undefined && bJson !== undefined) {
    return deepEqual(aJson, bJson);
  }

  // Fall back to whitespace-insensitive comparison for plain strings
  // (handles Chinese text with/without spaces, e.g. "便携榨汁杯300ml" vs "便携榨汁杯 300ml")
  return a.replace(/\s+/g, '') === b.replace(/\s+/g, '');
}

/** Try to parse a string as JSON; return undefined if not JSON. */
function tryParseJson(s: string): unknown {
  const trimmed = s.trim();
  if (!(trimmed.startsWith('[') || trimmed.startsWith('{'))) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

// ─── Utility ────────────────────────────────────────────────────────────────

/** Get a summary of all validation errors by category */
export function summarizeErrors(results: ValidationResult[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const result of results) {
    for (const error of result.errors) {
      summary[error.category] = (summary[error.category] || 0) + 1;
    }
    if (!result.toolExists) {
      summary['TOOL_NOT_FOUND'] = (summary['TOOL_NOT_FOUND'] || 0) + 1;
    }
  }
  return summary;
}
