/**
 * Complexity Assessor — evaluates task complexity for hybrid provider routing.
 *
 * Supply-chain-specific heuristics (not generic NLP). Assesses:
 * - Message length (token-proxy via character count)
 * - Available tool count
 * - Numeric computation keywords (计算/预测/优化/估算/模拟)
 * - Multi-step reasoning keywords (然后/接着/如果...那么/首先/之后)
 * - Cross-domain queries (库存+成本+物流 etc.)
 *
 * Output: one of `simple | medium | complex | tool-intensive` + reason.
 */

import type { ChatMessage } from '@/lib/services/ai-providers.service';
import type { MCPTool } from '@/lib/mcp/tools';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ComplexityLevel = 'simple' | 'medium' | 'complex' | 'tool-intensive';

export interface ComplexityContext {
  messages: ChatMessage[];
  availableTools: MCPTool[];
  /** Optional explicit query override (e.g. from FSMContext.query). */
  query?: string;
}

export interface ComplexityFactors {
  messageLength: number;
  toolCount: number;
  hasNumericKeywords: boolean;
  hasMultiStepKeywords: boolean;
  hasCrossDomainQuery: boolean;
  matchedDomains: string[];
  matchedNumericKeywords: string[];
  matchedMultiStepKeywords: string[];
}

export interface ComplexityAssessment {
  level: ComplexityLevel;
  reason: string;
  factors: ComplexityFactors;
}

// ─── Keyword Lexicons (supply-chain scoped) ────────────────────────────────────

const NUMERIC_KEYWORDS = [
  '计算', '预测', '优化', '估算', '模拟', '蒙特卡洛', '回归',
  '求解', '拟合', '推算', '量化', '建模', '仿真',
] as const;

const MULTI_STEP_KEYWORDS = [
  '然后', '接着', '之后', '首先', '其次', '最后',
  '如果', '那么', '假设', '否则', '与此同时', '随后',
  '第一步', '第二步', '第三步',
] as const;

/** Supply-chain domain keywords for cross-domain detection. */
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  inventory: ['库存', '存货', '在库', '备货', '安全库存', '再订货', 'EOQ', '补货'],
  cost: ['成本', '费用', '价格', '价差', '定价', '盈亏', '总成本', '采购价'],
  logistics: ['物流', '运输', '货运', '港口', '航运', '运费', 'SCFIS', '拥堵', ' shipment'],
  supplier: ['供应商', '供货商', '供应商评分', '卡脖子', '依赖度', '供应商图谱'],
  tariff: ['关税', '税率', '贸易战', '特朗普', '加征', '豁免'],
  finance: ['汇率', '碳价', '大宗商品', '铜价', '金融指数', '套利'],
  sales: ['销售', '销量', '营收', '需求', '预测', '季节', '报童'],
  risk: ['风险', '级联', '中断', '预警', '召回', '合规', 'chokepoint'],
} as const;

// ─── Thresholds ─────────────────────────────────────────────────────────────────

const MEDIUM_LENGTH_THRESHOLD = 500;
const COMPLEX_LENGTH_THRESHOLD = 1500;
const TOOL_INTENSIVE_THRESHOLD = 3;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function extractText(messages: ChatMessage[], query?: string): string {
  const parts: string[] = [];
  if (query) parts.push(query);
  for (const m of messages) {
    if (m.content) parts.push(m.content);
  }
  return parts.join('\n');
}

function findKeywords(text: string, keywords: readonly string[]): string[] {
  const matched: string[] = [];
  for (const kw of keywords) {
    if (text.includes(kw)) matched.push(kw);
  }
  return matched;
}

function detectDomains(text: string): { domains: string[]; matched: string[] } {
  const domains: string[] = [];
  const matched: string[] = [];
  for (const [domain, kws] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const kw of kws) {
      if (text.includes(kw)) {
        if (!domains.includes(domain)) domains.push(domain);
        matched.push(kw);
        break; // one match per domain is enough
      }
    }
  }
  return { domains, matched };
}

// ─── Main Assessment Function ──────────────────────────────────────────────────

export function assessComplexity(context: ComplexityContext): ComplexityAssessment {
  const text = extractText(context.messages, context.query);
  const messageLength = text.length;
  const toolCount = context.availableTools.length;

  const matchedNumericKeywords = findKeywords(text, NUMERIC_KEYWORDS);
  const matchedMultiStepKeywords = findKeywords(text, MULTI_STEP_KEYWORDS);
  const { domains: matchedDomains } = detectDomains(text);

  const hasNumericKeywords = matchedNumericKeywords.length > 0;
  const hasMultiStepKeywords = matchedMultiStepKeywords.length > 0;
  // Cross-domain = 2+ distinct supply-chain domains mentioned
  const hasCrossDomainQuery = matchedDomains.length >= 2;

  const factors: ComplexityFactors = {
    messageLength,
    toolCount,
    hasNumericKeywords,
    hasMultiStepKeywords,
    hasCrossDomainQuery,
    matchedDomains,
    matchedNumericKeywords,
    matchedMultiStepKeywords,
  };

  // ─── Priority-ordered classification ──────────────────────────────────────
  // 1. tool-intensive: many tools available → needs precise param filling
  if (toolCount > TOOL_INTENSIVE_THRESHOLD) {
    return {
      level: 'tool-intensive',
      reason: `工具密集型: ${toolCount} 个可用工具超过阈值 ${TOOL_INTENSIVE_THRESHOLD}`,
      factors,
    };
  }

  // 2. complex: long context, multi-step reasoning, or cross-domain orchestration
  if (
    messageLength > COMPLEX_LENGTH_THRESHOLD ||
    hasMultiStepKeywords ||
    hasCrossDomainQuery
  ) {
    const reasons: string[] = [];
    if (messageLength > COMPLEX_LENGTH_THRESHOLD) {
      reasons.push(`消息长度 ${messageLength} > ${COMPLEX_LENGTH_THRESHOLD}`);
    }
    if (hasMultiStepKeywords) {
      reasons.push(`多步推理关键词 [${matchedMultiStepKeywords.join(', ')}]`);
    }
    if (hasCrossDomainQuery) {
      reasons.push(`跨域查询 [${matchedDomains.join('+')}]`);
    }
    return {
      level: 'complex',
      reason: `复杂任务: ${reasons.join('; ')}`,
      factors,
    };
  }

  // 3. medium: moderate length or numeric computation
  if (messageLength > MEDIUM_LENGTH_THRESHOLD || hasNumericKeywords) {
    const reasons: string[] = [];
    if (messageLength > MEDIUM_LENGTH_THRESHOLD) {
      reasons.push(`消息长度 ${messageLength} > ${MEDIUM_LENGTH_THRESHOLD}`);
    }
    if (hasNumericKeywords) {
      reasons.push(`数值计算关键词 [${matchedNumericKeywords.join(', ')}]`);
    }
    return {
      level: 'medium',
      reason: `中等任务: ${reasons.join('; ')}`,
      factors,
    };
  }

  // 4. simple: short query, few tools, no special keywords
  return {
    level: 'simple',
    reason: `简单任务: 短查询 (${messageLength} 字符), ${toolCount} 个工具, 无特殊关键词`,
    factors,
  };
}

// ─── Utility: compare complexity levels ────────────────────────────────────────

const LEVEL_RANK: Record<ComplexityLevel, number> = {
  simple: 0,
  medium: 1,
  complex: 2,
  'tool-intensive': 3,
};

export function isMoreComplex(a: ComplexityLevel, b: ComplexityLevel): boolean {
  return LEVEL_RANK[a] > LEVEL_RANK[b];
}

export function complexityRank(level: ComplexityLevel): number {
  return LEVEL_RANK[level];
}
