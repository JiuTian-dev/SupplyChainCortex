/**
 * Tool Description Quality Scorer — evaluates MCP tool descriptions for LLM reliability.
 *
 * Scores each tool's description on a 0-100 scale across four dimensions:
 * 1. Clarity (清晰度, 0-25): Is the description clear and actionable?
 * 2. Completeness (完整性, 0-25): Does it cover all use cases and required params?
 * 3. Unambiguity (无歧义性, 0-25): Can the LLM distinguish it from similar tools?
 * 4. Example sufficiency (示例充分性, 0-25): Are there concrete examples and constraints?
 *
 * Tools scoring below 70 are flagged for optimization.
 */

import type { MCPTool } from '@/lib/mcp/tools';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DimensionScore {
  /** Dimension name */
  dimension: 'clarity' | 'completeness' | 'unambiguity' | 'example_sufficiency';
  /** Score 0-25 */
  score: number;
  /** Max score for this dimension */
  max: number;
  /** Specific issues found (empty if perfect) */
  issues: string[];
  /** Suggestions for improvement */
  suggestions: string[];
}

export interface ToolScore {
  /** Tool name */
  toolName: string;
  /** Total score 0-100 */
  totalScore: number;
  /** Per-dimension breakdown */
  dimensions: DimensionScore[];
  /** Whether this tool needs optimization (< 70) */
  needsOptimization: boolean;
  /** Overall assessment */
  summary: string;
}

export interface ScoreReport {
  /** All tool scores */
  tools: ToolScore[];
  /** Tools scoring below 70 (need optimization) */
  lowScoringTools: ToolScore[];
  /** Average score across all tools */
  averageScore: number;
  /** Score distribution */
  distribution: {
    excellent: number; // 90-100
    good: number;      // 70-89
    needsWork: number; // 50-69
    poor: number;      // 0-49
  };
}

// ─── Scoring Constants ────────────────────────────────────────────────────────

const THRESHOLD_NEEDS_OPTIMIZATION = 70;
const MAX_PER_DIMENSION = 25;

// ─── Dimension Scorers ────────────────────────────────────────────────────────

/**
 * Score clarity: Is the description clear, concise, and actionable?
 */
function scoreClarity(tool: Omit<MCPTool, 'handler'>): DimensionScore {
  const desc = tool.description;
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = MAX_PER_DIMENSION;

  // Check minimum length
  if (desc.length < 20) {
    score -= 10;
    issues.push('描述过短（少于20字符），LLM 难以理解工具用途');
    suggestions.push('扩展描述，说明工具的核心功能和适用场景');
  }

  // Check if description starts with a clear action verb (Chinese)
  const actionVerbs = ['查询', '获取', '创建', '更新', '调整', '计算', '生成', '模拟', '追踪', '分析'];
  const startsWithAction = actionVerbs.some(v => desc.startsWith(v));
  if (!startsWithAction) {
    score -= 5;
    issues.push('描述未以动作动词开头（查询/获取/创建/计算等）');
    suggestions.push('以动作动词开头，明确工具的操作类型');
  }

  // Check for overly long descriptions (> 500 chars may dilute focus)
  if (desc.length > 500) {
    score -= 3;
    issues.push('描述过长（超过500字符），可能分散LLM注意力');
    suggestions.push('精简描述，将细节移至参数说明');
  }

  // Check for vague terms
  const vagueTerms = ['等等', '诸如此类', '相关', '一些', '各种'];
  const hasVague = vagueTerms.some(t => desc.includes(t));
  if (hasVague) {
    score -= 4;
    issues.push('描述包含模糊词汇（等等/相关/一些），降低确定性');
    suggestions.push('用具体的枚举值或示例替代模糊词汇');
  }

  // Bonus: mentions return value
  if (desc.includes('返回') || desc.includes('输出')) {
    score = Math.min(MAX_PER_DIMENSION, score + 2);
  }

  score = Math.max(0, Math.min(MAX_PER_DIMENSION, score));

  return {
    dimension: 'clarity',
    score,
    max: MAX_PER_DIMENSION,
    issues,
    suggestions,
  };
}

/**
 * Score completeness: Does it cover all use cases and required parameters?
 */
function scoreCompleteness(tool: Omit<MCPTool, 'handler'>): DimensionScore {
  const desc = tool.description;
  const params = tool.parameters.properties;
  const required = tool.parameters.required || [];
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = MAX_PER_DIMENSION;

  // Check if description mentions the primary action/mode parameter
  const hasActionParam = 'action' in params;
  if (hasActionParam) {
    const actionEnum = params.action.enum;
    if (actionEnum && actionEnum.length > 0) {
      // Check if description mentions all enum values
      const missingActions = actionEnum.filter(a => !desc.includes(a));
      if (missingActions.length > 2) {
        score -= 6;
        issues.push(`描述未提及多个 action 值: ${missingActions.join(', ')}`);
        suggestions.push('在描述中列出所有 action 枚举值及其用途');
      }
    }
  }

  // Check if required parameters are mentioned in description
  for (const reqParam of required) {
    // Check if the param name or its description hints appear in the tool description
    const paramDesc = params[reqParam]?.description || '';
    const paramMentioned = desc.includes(reqParam) ||
      (paramDesc && desc.includes(paramDesc.split(',')[0]));
    if (!paramMentioned && required.length > 2) {
      // Only flag if there are multiple required params and none mentioned
      score -= 2;
      issues.push(`必填参数 ${reqParam} 未在描述中提及`);
      suggestions.push(`在描述中说明必填参数: ${reqParam}`);
      break; // Only flag once
    }
  }

  // Check if description explains what data the tool returns
  if (!desc.includes('返回') && !desc.includes('输出') && !desc.includes('获取')) {
    score -= 4;
    issues.push('描述未说明工具返回什么数据');
    suggestions.push('添加"返回..."说明工具的输出');
  }

  // Check for empty parameters (no params at all)
  const paramCount = Object.keys(params).length;
  if (paramCount === 0 && !desc.includes('无需参数')) {
    score -= 3;
    issues.push('工具无参数但描述未说明"无需参数"');
    suggestions.push('明确说明"此工具无需参数"');
  }

  score = Math.max(0, Math.min(MAX_PER_DIMENSION, score));

  return {
    dimension: 'completeness',
    score,
    max: MAX_PER_DIMENSION,
    issues,
    suggestions,
  };
}

/**
 * Score unambiguity: Can the LLM distinguish this tool from similar ones?
 */
function scoreUnambiguity(tool: Omit<MCPTool, 'handler'>): DimensionScore {
  const desc = tool.description;
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = MAX_PER_DIMENSION;

  // Check for disambiguation: does the description mention what NOT to use?
  const hasDisambiguation = desc.includes('不要') || desc.includes('而非') ||
    desc.includes('而不是') || desc.includes('请使用');
  if (hasDisambiguation) {
    score = Math.min(MAX_PER_DIMENSION, score + 3);
  }

  // Check for query_ prefix tools (potential confusion between query and create/update)
  if (tool.name.startsWith('query_')) {
    const hasCreateCounterpart = desc.includes('create_') || desc.includes('update_');
    if (!hasCreateCounterpart) {
      // Check if there's a corresponding create/update tool that could be confused
      const baseName = tool.name.replace('query_', '');
      const possibleConflicts = ['inventory', 'cost', 'supplier', 'shipment'];
      if (possibleConflicts.some(c => baseName.includes(c))) {
        score -= 5;
        issues.push('查询工具未说明与对应创建/更新工具的区别');
        suggestions.push(`添加"如需创建/更新请使用 create_${baseName}/update_${baseName}"`);
      }
    }
  }

  // Check for ambiguous scope
  const ambiguousPhrases = ['相关信息', '各种数据', '综合信息'];
  const hasAmbiguous = ambiguousPhrases.some(p => desc.includes(p));
  if (hasAmbiguous) {
    score -= 4;
    issues.push('描述包含模糊范围词（相关信息/各种数据）');
    suggestions.push('明确列出具体包含哪些数据');
  }

  // Check if tool name is descriptive enough
  const nameParts = tool.name.split('_');
  if (nameParts.length < 2) {
    score -= 3;
    issues.push('工具名单词过少，难以区分用途');
    suggestions.push('工具名应包含动词+名词（如 query_inventory）');
  }

  score = Math.max(0, Math.min(MAX_PER_DIMENSION, score));

  return {
    dimension: 'unambiguity',
    score,
    max: MAX_PER_DIMENSION,
    issues,
    suggestions,
  };
}

/**
 * Score example sufficiency: Are there concrete examples and parameter constraints?
 */
function scoreExampleSufficiency(tool: Omit<MCPTool, 'handler'>): DimensionScore {
  const desc = tool.description;
  const params = tool.parameters.properties;
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = MAX_PER_DIMENSION;

  // Check if description contains example values (e.g., "如: KA-RC4001")
  const hasExampleInDesc = /如[:：]\s*\S/.test(desc) || desc.includes('例如');
  if (hasExampleInDesc) {
    score = Math.min(MAX_PER_DIMENSION, score + 3);
  } else {
    score -= 5;
    issues.push('描述中缺少示例值');
    suggestions.push('添加示例值，如"如: KA-RC4001"');
  }

  // Check if parameter descriptions have examples
  let paramsWithExamples = 0;
  let totalParams = 0;
  for (const [, param] of Object.entries(params)) {
    totalParams++;
    if (param.description && /如[:：]\s*\S/.test(param.description)) {
      paramsWithExamples++;
    }
  }

  if (totalParams > 0) {
    const exampleRatio = paramsWithExamples / totalParams;
    if (exampleRatio < 0.3) {
      score -= 6;
      issues.push(`仅 ${paramsWithExamples}/${totalParams} 个参数有示例值`);
      suggestions.push('为每个参数添加"如: xxx"格式的示例值');
    } else if (exampleRatio < 0.6) {
      score -= 3;
      issues.push(`部分参数缺少示例值（${paramsWithExamples}/${totalParams}）`);
      suggestions.push('为更多参数添加示例值');
    }
  }

  // Check for usage scenario
  const hasScenario = desc.includes('场景') || desc.includes('用于') || desc.includes('当');
  if (!hasScenario) {
    score -= 4;
    issues.push('描述未说明使用场景');
    suggestions.push('添加"使用场景：..."说明何时使用此工具');
  }

  // Check for parameter constraints (range, format)
  let hasConstraints = false;
  for (const [, param] of Object.entries(params)) {
    if (param.description && (
      param.description.includes('必须') ||
      param.description.includes('格式') ||
      param.description.includes('范围') ||
      /\d+-\d+/.test(param.description)
    )) {
      hasConstraints = true;
      break;
    }
  }
  if (!hasConstraints && totalParams > 0) {
    score -= 3;
    issues.push('参数描述中缺少约束说明（格式/范围/必填）');
    suggestions.push('为参数添加格式、范围或必填约束说明');
  }

  score = Math.max(0, Math.min(MAX_PER_DIMENSION, score));

  return {
    dimension: 'example_sufficiency',
    score,
    max: MAX_PER_DIMENSION,
    issues,
    suggestions,
  };
}

// ─── Main Scoring Functions ───────────────────────────────────────────────────

/**
 * Score a single tool's description quality.
 */
export function scoreTool(tool: Omit<MCPTool, 'handler'>): ToolScore {
  const dimensions: DimensionScore[] = [
    scoreClarity(tool),
    scoreCompleteness(tool),
    scoreUnambiguity(tool),
    scoreExampleSufficiency(tool),
  ];

  const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0);
  const needsOptimization = totalScore < THRESHOLD_NEEDS_OPTIMIZATION;

  const allIssues = dimensions.flatMap(d => d.issues);
  const summary = allIssues.length === 0
    ? `优质描述（${totalScore}/100），无需优化`
    : `得分 ${totalScore}/100，存在 ${allIssues.length} 个问题需改进`;

  return {
    toolName: tool.name,
    totalScore,
    dimensions,
    needsOptimization,
    summary,
  };
}

/**
 * Score multiple tools and generate a report.
 */
export function scoreTools(tools: Array<Omit<MCPTool, 'handler'>>): ScoreReport {
  const scored = tools.map(scoreTool);

  const lowScoringTools = scored
    .filter(t => t.needsOptimization)
    .sort((a, b) => a.totalScore - b.totalScore);

  const averageScore = scored.length > 0
    ? Math.round(scored.reduce((sum, t) => sum + t.totalScore, 0) / scored.length)
    : 0;

  const distribution = {
    excellent: scored.filter(t => t.totalScore >= 90).length,
    good: scored.filter(t => t.totalScore >= 70 && t.totalScore < 90).length,
    needsWork: scored.filter(t => t.totalScore >= 50 && t.totalScore < 70).length,
    poor: scored.filter(t => t.totalScore < 50).length,
  };

  return {
    tools: scored,
    lowScoringTools,
    averageScore,
    distribution,
  };
}

/**
 * Get a human-readable optimization priority list.
 * Returns the top N tools that most need optimization, with specific suggestions.
 */
export function getOptimizationPriority(
  tools: Array<Omit<MCPTool, 'handler'>>,
  topN: number = 10,
): Array<{ toolName: string; score: number; topSuggestions: string[] }> {
  const report = scoreTools(tools);
  return report.lowScoringTools
    .slice(0, topN)
    .map(t => ({
      toolName: t.toolName,
      score: t.totalScore,
      topSuggestions: t.dimensions
        .flatMap(d => d.suggestions)
        .slice(0, 3),
    }));
}
