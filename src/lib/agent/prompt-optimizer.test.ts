/**
 * Tests for Prompt Engineering Optimizer.
 *
 * Verifies:
 * - optimizeToolDescription: augments without destroying original info, idempotent
 * - optimizeToolSchema: adds examples, clarifies enums, emphasizes required, valid JSON Schema
 * - buildOptimizedSystemPrompt: contains tool selection guidance, param rules, error hints, examples
 * - generateFewShotExamples: returns valid examples for each intent
 * - Integration: optimizeTools batch, env-var control
 *
 * Also tests tool-description-score.ts scoring logic.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  optimizeToolDescription,
  optimizeToolSchema,
  buildOptimizedSystemPrompt,
  generateFewShotExamples,
  optimizeTools,
  isPromptOptimizationEnabled,
} from './prompt-optimizer';
import {
  scoreTool,
  scoreTools,
  getOptimizationPriority,
} from './tool-description-score';
import type { MCPTool } from '@/lib/mcp/tools';

// ─── Test Fixtures ────────────────────────────────────────────────────────────

/** A well-described tool (high quality baseline) */
const goodTool: Omit<MCPTool, 'handler'> = {
  name: 'query_inventory',
  description: '查询库存状态、库存水平、安全库存、库存分布。可以查看整体库存概览、按仓库筛选、查看库存详情、获取预测和缺货风险分析。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '查询类型: overview(概览), list(列表), forecast(预测), risk(缺货风险), detail(单品详情), slow_moving(滞销品), reorder(补货建议)',
        enum: ['overview', 'list', 'forecast', 'risk', 'detail', 'slow_moving', 'reorder'],
      },
      warehouse: {
        type: 'string',
        description: '仓库名称筛选，如: 深圳仓, 义乌仓',
      },
      sku: {
        type: 'string',
        description: '产品SKU，用于详情查询，如: KA-RC4001',
      },
    },
    required: ['action'],
  },
};

/** A poorly-described tool (low quality, needs optimization) */
const poorTool: Omit<MCPTool, 'handler'> = {
  name: 'get_data',
  description: '获取相关数据',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: '数据类型',
      },
    },
    required: ['type'],
  },
};

/** A tool with enum but no enum descriptions */
const enumTool: Omit<MCPTool, 'handler'> = {
  name: 'query_logistics',
  description: '查询物流货运状态、跟踪信息、物流统计和风险。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '查询类型: list(货运列表), stats(统计), track(单号追踪), risks(物流风险)',
        enum: ['list', 'stats', 'track', 'risks'],
      },
      status: {
        type: 'string',
        description: '状态筛选',
        enum: ['pending', 'in_transit', 'customs', 'delivered', 'delayed', 'exception'],
      },
      severity: {
        type: 'string',
        description: '严重级别',
        enum: ['warning', 'critical'],
      },
    },
    required: ['action'],
  },
};

/** A tool with no parameters */
const noParamTool: Omit<MCPTool, 'handler'> = {
  name: 'query_commodities',
  description: '查询大宗商品日度价格：铜、铝、螺纹钢、PP聚丙烯等。数据来源: Alpha Vantage + SHFE/DCE期货交易所。',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
};

// ─── optimizeToolDescription Tests ────────────────────────────────────────────

describe('optimizeToolDescription', () => {
  it('preserves the original description text', () => {
    const optimized = optimizeToolDescription(goodTool);
    expect(optimized).toContain('查询库存状态');
    expect(optimized).toContain('库存水平');
    expect(optimized).toContain('安全库存');
  });

  it('adds usage scenario section', () => {
    const optimized = optimizeToolDescription(goodTool);
    expect(optimized).toContain('【使用场景】');
    expect(optimized).toContain('库存');
  });

  it('adds anti-example section for tools with common confusions', () => {
    const optimized = optimizeToolDescription(goodTool);
    expect(optimized).toContain('【不要用于】');
    expect(optimized).toContain('create_reorder');
  });

  it('adds parameter hints section', () => {
    const optimized = optimizeToolDescription(goodTool);
    expect(optimized).toContain('【参数要点】');
    expect(optimized).toContain('action');
  });

  it('is idempotent — calling twice produces the same result', () => {
    const once = optimizeToolDescription(goodTool);
    const twice = optimizeToolDescription({ name: goodTool.name, description: once });
    expect(twice).toBe(once);
  });

  it('does not modify the original tool object', () => {
    const originalDesc = goodTool.description;
    optimizeToolDescription(goodTool);
    expect(goodTool.description).toBe(originalDesc);
  });
});

// ─── optimizeToolSchema Tests ─────────────────────────────────────────────────

describe('optimizeToolSchema', () => {
  it('returns a new object (does not mutate original)', () => {
    const original = JSON.parse(JSON.stringify(goodTool));
    optimizeToolSchema(goodTool);
    expect(goodTool).toEqual(original);
  });

  it('adds example field to parameters', () => {
    const optimized = optimizeToolSchema(goodTool);
    expect(optimized.parameters.properties.warehouse.example).toBeDefined();
    expect(optimized.parameters.properties.sku.example).toBe('KA-RC4001');
  });

  it('adds enumDescriptions for known enum parameters', () => {
    const optimized = optimizeToolSchema(enumTool);
    expect(optimized.parameters.properties.action.enumDescriptions).toBeDefined();
    // query_logistics.action has list/stats/track/risks (not overview)
    expect(optimized.parameters.properties.action.enumDescriptions?.list).toBeDefined();
  });

  it('adds enumDescriptions for status enum', () => {
    const optimized = optimizeToolSchema(enumTool);
    expect(optimized.parameters.properties.status.enumDescriptions).toBeDefined();
    expect(optimized.parameters.properties.status.enumDescriptions?.in_transit).toBe('运输中');
  });

  it('marks required fields with 【必填】 prefix in description', () => {
    const optimized = optimizeToolSchema(goodTool);
    expect(optimized.parameters.properties.action.description).toContain('【必填】');
  });

  it('does not mark optional fields with 【必填】', () => {
    const optimized = optimizeToolSchema(goodTool);
    expect(optimized.parameters.properties.warehouse.description).not.toContain('【必填】');
  });

  it('sets __optimized marker for idempotency', () => {
    const optimized = optimizeToolSchema(goodTool);
    expect(optimized.__optimized).toBe(true);
  });

  it('is idempotent — second call does not double-optimize', () => {
    const once = optimizeToolSchema(goodTool);
    const twice = optimizeToolSchema(once);
    // The __optimized marker prevents re-processing
    expect(twice.__optimized).toBe(true);
    // Required field should not be double-prefixed
    expect(twice.parameters.properties.action.description).not.toContain('【必填】【必填】');
  });

  it('produces valid JSON Schema (type, properties, required all present)', () => {
    const optimized = optimizeToolSchema(goodTool);
    expect(optimized.parameters.type).toBe('object');
    expect(optimized.parameters.properties).toBeDefined();
    expect(Array.isArray(optimized.parameters.required)).toBe(true);
  });

  it('handles tools with no parameters', () => {
    const optimized = optimizeToolSchema(noParamTool);
    expect(optimized.parameters.properties).toEqual({});
    expect(optimized.parameters.required).toEqual([]);
  });

  it('uses first enum value as example when no specific example exists', () => {
    const optimized = optimizeToolSchema(enumTool);
    // severity has no entry in PARAMETER_EXAMPLES, so first enum value is used
    expect(optimized.parameters.properties.severity.example).toBe('warning');
  });
});

// ─── buildOptimizedSystemPrompt Tests ─────────────────────────────────────────

describe('buildOptimizedSystemPrompt', () => {
  it('contains tool selection guidance section', () => {
    const prompt = buildOptimizedSystemPrompt([goodTool], 'supply_chain_data');
    expect(prompt).toContain('工具选择指导');
    expect(prompt).toContain('supply_chain_data');
  });

  it('contains parameter filling standards', () => {
    const prompt = buildOptimizedSystemPrompt([goodTool], 'supply_chain_data');
    expect(prompt).toContain('参数填写规范');
    expect(prompt).toContain('SKU');
    expect(prompt).toContain('深圳仓');
  });

  it('contains common error hints', () => {
    const prompt = buildOptimizedSystemPrompt([goodTool], 'supply_chain_data');
    expect(prompt).toContain('常见错误提示');
    expect(prompt).toContain('不要编造');
  });

  it('contains few-shot examples', () => {
    const prompt = buildOptimizedSystemPrompt([goodTool], 'supply_chain_data');
    expect(prompt).toContain('正确调用示例');
    expect(prompt).toContain('KA-RC4001');
  });

  it('returns empty string for chat_greeting intent (no tools needed)', () => {
    const prompt = buildOptimizedSystemPrompt([], 'chat_greeting');
    expect(prompt).toBe('');
  });

  it('includes intent-specific routing rules', () => {
    const prompt = buildOptimizedSystemPrompt([goodTool], 'supply_chain_data');
    expect(prompt).toContain('query_inventory');
    expect(prompt).toContain('query_cost');
  });

  it('includes relevant tool names from the provided tools list', () => {
    const prompt = buildOptimizedSystemPrompt([goodTool, enumTool], 'supply_chain_data');
    // query_inventory is in primaryTools for supply_chain_data
    expect(prompt).toContain('query_inventory');
  });
});

// ─── generateFewShotExamples Tests ────────────────────────────────────────────

describe('generateFewShotExamples', () => {
  it('returns examples for supply_chain_data intent', () => {
    const examples = generateFewShotExamples('supply_chain_data');
    expect(examples.length).toBeGreaterThan(0);
    expect(examples.length).toBeGreaterThanOrEqual(5);
  });

  it('returns examples for supply_chain_knowledge intent', () => {
    const examples = generateFewShotExamples('supply_chain_knowledge');
    expect(examples.length).toBeGreaterThan(0);
    expect(examples[0].toolName).toBe('calculate_eoq');
  });

  it('returns empty array for chat_greeting intent', () => {
    const examples = generateFewShotExamples('chat_greeting');
    expect(examples).toEqual([]);
  });

  it('each example has userInput, toolName, params, and reasoning', () => {
    const examples = generateFewShotExamples('supply_chain_data');
    for (const ex of examples) {
      expect(ex.userInput).toBeTruthy();
      expect(ex.toolName).toBeTruthy();
      expect(ex.params).toBeDefined();
      expect(typeof ex.params).toBe('object');
      expect(ex.reasoning).toBeTruthy();
    }
  });

  it('examples contain real SKU format (KA-XXXX)', () => {
    const examples = generateFewShotExamples('supply_chain_data');
    const hasSkuExample = examples.some(ex =>
      JSON.stringify(ex.params).includes('KA-')
    );
    expect(hasSkuExample).toBe(true);
  });

  it('examples for news_event include web_search or market tools', () => {
    const examples = generateFewShotExamples('news_event');
    expect(examples.length).toBeGreaterThan(0);
    const toolNames = examples.map(e => e.toolName);
    expect(toolNames).toContain('query_exchange_rates');
  });
});

// ─── Batch Optimization Tests ─────────────────────────────────────────────────

describe('optimizeTools (batch)', () => {
  it('optimizes all tools in a list', () => {
    const tools = [goodTool, enumTool, noParamTool];
    const optimized = optimizeTools(tools);
    expect(optimized).toHaveLength(3);
    expect(optimized.every(t => t.__optimized === true)).toBe(true);
  });

  it('preserves tool names', () => {
    const tools = [goodTool, enumTool];
    const optimized = optimizeTools(tools);
    expect(optimized[0].name).toBe('query_inventory');
    expect(optimized[1].name).toBe('query_logistics');
  });

  it('optimizes descriptions with usage scenarios', () => {
    const optimized = optimizeTools([goodTool]);
    expect(optimized[0].description).toContain('【使用场景】');
  });
});

// ─── Environment Variable Control Tests ───────────────────────────────────────

describe('isPromptOptimizationEnabled', () => {
  const originalEnv = process.env.ENABLE_PROMPT_OPTIMIZATION;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ENABLE_PROMPT_OPTIMIZATION;
    } else {
      process.env.ENABLE_PROMPT_OPTIMIZATION = originalEnv;
    }
  });

  it('returns true by default (env var not set)', () => {
    delete process.env.ENABLE_PROMPT_OPTIMIZATION;
    expect(isPromptOptimizationEnabled()).toBe(true);
  });

  it('returns true when set to "true"', () => {
    process.env.ENABLE_PROMPT_OPTIMIZATION = 'true';
    expect(isPromptOptimizationEnabled()).toBe(true);
  });

  it('returns false when set to "false"', () => {
    process.env.ENABLE_PROMPT_OPTIMIZATION = 'false';
    expect(isPromptOptimizationEnabled()).toBe(false);
  });

  it('returns false when set to "0"', () => {
    process.env.ENABLE_PROMPT_OPTIMIZATION = '0';
    expect(isPromptOptimizationEnabled()).toBe(false);
  });
});

// ─── Tool Description Score Tests ─────────────────────────────────────────────

describe('scoreTool', () => {
  it('scores a well-described tool above 70', () => {
    const score = scoreTool(goodTool);
    expect(score.totalScore).toBeGreaterThanOrEqual(70);
    expect(score.needsOptimization).toBe(false);
  });

  it('scores a poorly-described tool below 70', () => {
    const score = scoreTool(poorTool);
    expect(score.totalScore).toBeLessThan(70);
    expect(score.needsOptimization).toBe(true);
  });

  it('returns 4 dimension scores', () => {
    const score = scoreTool(goodTool);
    expect(score.dimensions).toHaveLength(4);
    const dims = score.dimensions.map(d => d.dimension);
    expect(dims).toContain('clarity');
    expect(dims).toContain('completeness');
    expect(dims).toContain('unambiguity');
    expect(dims).toContain('example_sufficiency');
  });

  it('total score equals sum of dimension scores', () => {
    const score = scoreTool(goodTool);
    const sum = score.dimensions.reduce((s, d) => s + d.score, 0);
    expect(score.totalScore).toBe(sum);
  });

  it('provides issues and suggestions for low-scoring tools', () => {
    const score = scoreTool(poorTool);
    const allIssues = score.dimensions.flatMap(d => d.issues);
    expect(allIssues.length).toBeGreaterThan(0);
  });
});

describe('scoreTools (batch)', () => {
  it('generates a report with all tools scored', () => {
    const report = scoreTools([goodTool, poorTool, enumTool]);
    expect(report.tools).toHaveLength(3);
    expect(report.averageScore).toBeGreaterThan(0);
    expect(report.averageScore).toBeLessThanOrEqual(100);
  });

  it('identifies low-scoring tools correctly', () => {
    const report = scoreTools([goodTool, poorTool]);
    expect(report.lowScoringTools.length).toBeGreaterThanOrEqual(1);
    expect(report.lowScoringTools.some(t => t.toolName === 'get_data')).toBe(true);
  });

  it('calculates distribution correctly', () => {
    const report = scoreTools([goodTool, poorTool]);
    const total = report.distribution.excellent +
      report.distribution.good +
      report.distribution.needsWork +
      report.distribution.poor;
    expect(total).toBe(2);
  });
});

describe('getOptimizationPriority', () => {
  it('returns tools sorted by score (lowest first)', () => {
    const priority = getOptimizationPriority([goodTool, poorTool, enumTool], 10);
    expect(priority.length).toBeGreaterThan(0);
    // Lowest scoring tool should be first
    expect(priority[0].score).toBeLessThanOrEqual(priority[priority.length - 1].score);
  });

  it('provides suggestions for each tool', () => {
    const priority = getOptimizationPriority([poorTool], 10);
    expect(priority.length).toBeGreaterThan(0);
    expect(priority[0].topSuggestions.length).toBeGreaterThan(0);
  });
});
