/**
 * Batch Optimization Helpers — combines schema + description optimization,
 * and environment-variable gating.
 */

import type { MCPTool } from '@/lib/mcp/tools';
import { optimizeToolSchema } from './schema';
import type { OptimizedMCPTool } from './schema';
import { optimizeToolDescription } from './description';

/**
 * Optimize a list of tools (both description and schema).
 * Returns new optimized tool objects; originals are never mutated.
 */
export function optimizeTools(
  tools: Array<Omit<MCPTool, 'handler'>>,
): OptimizedMCPTool[] {
  return tools.map(tool => {
    const optimized = optimizeToolSchema(tool);
    optimized.description = optimizeToolDescription(tool);
    return optimized;
  });
}

/**
 * Check if prompt optimization is enabled via environment variable.
 * Default: enabled (ENABLE_PROMPT_OPTIMIZATION not set or set to "true").
 */
export function isPromptOptimizationEnabled(): boolean {
  const flag = process.env.ENABLE_PROMPT_OPTIMIZATION;
  // Default: enabled. Only disabled if explicitly set to "false".
  return flag !== 'false' && flag !== '0';
}
