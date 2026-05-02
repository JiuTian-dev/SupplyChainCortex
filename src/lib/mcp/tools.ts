/**
 * MCP Tools Registry — Maps service layer functions to LLM-callable tools.
 *
 * Each tool has:
 * - name: Unique identifier for the tool
 * - description: Natural language description for LLM understanding
 * - parameters: JSON Schema for input validation
 * - handler: Function that executes the tool by calling the service/query layer
 *
 * Tool definitions are split by domain:
 * - tools-crud.ts      — inventory, cost, sales, logistics, suppliers, dashboard, risk
 * - tools-operations.ts — reorder, shipment status, adjust inventory, update cost, notes, alerts
 * - tools-intelligence.ts — analytics, exchange rates, weather, cascade risk, decision graph, workflow, tariff, sandbox
 */

import { crudTools } from './tools-crud';
import { operationsTools } from './tools-operations';
import { intelligenceTools } from './tools-intelligence';

// ─── Tool Definition Types ──────────────────────────────────────────────────────

export interface MCPToolParameter {
  type: string;
  description: string;
  enum?: string[];
}

export interface MCPTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, MCPToolParameter>;
    required?: string[];
  };
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

// ─── Merged Tool Registry ───────────────────────────────────────────────────────

const tools: MCPTool[] = [
  ...crudTools,
  ...operationsTools,
  ...intelligenceTools,
];

// ─── Registry Operations ────────────────────────────────────────────────────────

/** Get all registered tools (schemas only, no handlers) */
export function getToolSchemas(): Omit<MCPTool, 'handler'>[] {
  return tools.map(({ handler: _, ...schema }) => schema);
}

/** Get a tool by name */
export function getTool(name: string): MCPTool | undefined {
  return tools.find(t => t.name === name);
}

/** Execute a tool by name with given parameters */
export async function executeTool(name: string, params: Record<string, unknown>): Promise<unknown> {
  const tool = getTool(name);
  if (!tool) {
    throw new Error(`未找到工具: ${name}。可用工具: ${tools.map(t => t.name).join(', ')}`);
  }
  return await tool.handler(params);
}

/** Get all tool names */
export function getToolNames(): string[] {
  return tools.map(t => t.name);
}

/** Check if a tool exists */
export function hasTool(name: string): boolean {
  return tools.some(t => t.name === name);
}
