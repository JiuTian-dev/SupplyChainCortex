/**
 * Prompt Engineering Optimizer — barrel re-export.
 *
 * Implementation split into ./prompt-optimizer/ submodules:
 * - description.ts   — optimizeToolDescription (工具描述增强)
 * - schema.ts        — optimizeToolSchema (JSON Schema 优化) + types
 * - system-prompt.ts — buildOptimizedSystemPrompt (意图感知 system prompt)
 * - few-shot.ts      — generateFewShotExamples (5 大场景示例)
 * - shared.ts        — optimizeTools, isPromptOptimizationEnabled (批量/开关)
 *
 * Public import path unchanged: `@/lib/agent/prompt-optimizer`
 */

export * from './prompt-optimizer/index';
