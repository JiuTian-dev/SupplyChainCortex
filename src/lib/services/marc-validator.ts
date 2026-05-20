/**
 * MARC Protocol Post-Processing Validator
 *
 * Checks LLM output for compliance with:
 *  1. Source tags ([T0-LLM]/[T1-MCP]/[T2-KB]/[T3-Search])
 *  2. Confidence labels ([高]/[中]/[低])
 *  3. Source+confidence pairing rule
 *
 * Automatically appends missing annotations when possible.
 */

interface MarcValidation {
  passed: boolean;
  hasSourceTags: boolean;
  hasConfidence: boolean;
  sourceTagCount: number;
  confidenceTagCount: number;
  missingSourceDataPoints: string[];
  missingConfidenceDataPoints: string[];
  warnings: string[];
}

/** Detect if text contains MARC source tags */
function hasSourceTags(text: string): boolean {
  return /\[T\d-(?:MCP|KB|Search|LLM)\]/i.test(text);
}

/** Detect if text contains confidence labels */
function hasConfidenceLabels(text: string): boolean {
  return /\[高\]|\[中\]|\[低\]/.test(text);
}

/** Count source tag occurrences */
function countSourceTags(text: string): number {
  return (text.match(/\[T\d-(?:MCP|KB|Search|LLM)\]/gi) || []).length;
}

/** Count confidence label occurrences */
function countConfidenceLabels(text: string): number {
  return (text.match(/\[高\]|\[中\]|\[低\]/g) || []).length;
}

/** Detect numeric data points (numbers, percentages, currency amounts) */
function hasNumericData(text: string): boolean {
  return /\d+/.test(text) &&
    // Exclude purely enumerative numbers (list items)
    !/^(?:\d+[.、)])/.test(text.replace(/[\s\S]*/, ''));
}

/** Detect data tables (pipe-separated or grid format) */
function hasDataTable(text: string): boolean {
  return /\|.+\|/.test(text) && text.includes('---');
}

/**
 * Check if a source tag is missing its paired confidence label.
 * Returns source tags that appear within 80 chars but aren't followed by confidence.
 */
function findUnpairedSourceTags(text: string): string[] {
  const unpaired: string[] = [];
  const sourceRegex = /\[T\d-(?:MCP|KB|Search|LLM)\]/gi;
  let match;
  while ((match = sourceRegex.exec(text)) !== null) {
    const after = text.substring(match.index, match.index + 80);
    if (!/\[高\]|\[中\]|\[低\]/.test(after)) {
      unpaired.push(match[0]);
    }
  }
  return unpaired;
}

/**
 * Validate LLM output against MARC protocol.
 */
export function validateMARC(text: string): MarcValidation {
  const result: MarcValidation = {
    passed: false,
    hasSourceTags: hasSourceTags(text),
    hasConfidence: hasConfidenceLabels(text),
    sourceTagCount: countSourceTags(text),
    confidenceTagCount: countConfidenceLabels(text),
    missingSourceDataPoints: [],
    missingConfidenceDataPoints: [],
    warnings: [],
  };

  const hasNumbers = hasNumericData(text);

  // Rule 1: Numeric content MUST have source tags
  if (hasNumbers && !result.hasSourceTags) {
    result.warnings.push('Numeric data present without source tags');
  }

  // Rule 2: Consecutive paragraphs without source tags
  const paragraphs = text.split(/\n\n+/);
  let parasWithoutSource = 0;
  for (const para of paragraphs) {
    if (para.trim().length > 50 && !hasSourceTags(para)) {
      parasWithoutSource++;
      if (parasWithoutSource >= 2) {
        result.warnings.push(`${parasWithoutSource} consecutive paragraphs without source tags`);
        break;
      }
    } else {
      parasWithoutSource = 0;
    }
  }

  // Rule 3: Data tables must have source+confidence
  if (hasDataTable(text) && !result.hasSourceTags) {
    result.warnings.push('Data table present without source tags');
  }

  // Rule 4: Source+confidence pairing
  const unpaired = findUnpairedSourceTags(text);
  if (unpaired.length > 0) {
    result.missingConfidenceDataPoints = unpaired;
    result.warnings.push(`${unpaired.length} source tag(s) without paired confidence label`);
  }

  // Rule 5: Confidence without source (suspicious)
  if (!result.hasSourceTags && result.hasConfidence) {
    result.warnings.push('Confidence labels present without source tags');
  }

  result.passed = result.warnings.length === 0;
  if (!result.hasSourceTags) result.passed = false;
  if (!result.hasConfidence && hasNumbers) result.passed = false;

  return result;
}

/**
 * Auto-fix missing MARC annotations where possible.
 * - If data appears to come from tool execution (context contains tool results),
 *   prepend a MARC compliance footer.
 * - Does NOT fabricate source tags — only adds warnings where data is unlabeled.
 */
export function annotateMARC(text: string, validation: MarcValidation): string {
  if (validation.passed) return text;

  let fixed = text;
  const fixes: string[] = [];

  if (!validation.hasSourceTags && hasNumericData(text)) {
    fixes.push('⚠️ 响应缺少来源标注，数据可信度无法确认');
  }

  if (validation.warnings.length > 0) {
    const summary = validation.warnings.slice(0, 3).join('；');
    if (summary) {
      fixes.push(`[MARC审计: ${summary}]`);
    }
  }

  if (fixes.length > 0) {
    fixed = text.trimEnd() + '\n\n---\n' + fixes.join('\n');
  }

  return fixed;
}

/**
 * Full pipeline: validate + optionally fix.
 */
export function enforceMARC(text: string): { text: string; report: MarcValidation } {
  const report = validateMARC(text);
  if (!report.passed) {
    return { text: annotateMARC(text, report), report };
  }
  return { text, report };
}
