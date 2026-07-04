/**
 * Prompt Engineering Optimizer — barrel re-export.
 *
 * Implementation split into submodules:
 * - description.ts   — optimizeToolDescription
 * - schema.ts        — optimizeToolSchema + OptimizedMCPTool types
 * - system-prompt.ts — buildOptimizedSystemPrompt
 * - few-shot.ts      — generateFewShotExamples + FewShotExample type
 * - shared.ts        — optimizeTools, isPromptOptimizationEnabled
 */

export type { OptimizedMCPToolParameter, OptimizedMCPTool } from './schema';
export { optimizeToolDescription } from './description';
export { optimizeToolSchema } from './schema';
export { buildOptimizedSystemPrompt } from './system-prompt';
export type { FewShotExample } from './few-shot';
export { generateFewShotExamples } from './few-shot';
export { optimizeTools, isPromptOptimizationEnabled } from './shared';
