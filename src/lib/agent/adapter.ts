/**
 * Provider Adapter — model-agnostic I/O normalization layer.
 *
 * Each adapter handles:
 * - Message format conversion (internal ChatMessage ↔ provider-specific)
 * - Tool schema normalization (MCP tools → provider tool definitions)
 * - Streaming completion (with and without tools)
 * - Lightweight classification (for semantic routing)
 * - Tool call parsing (including text-fallback for DeepSeek leakage)
 */

import type { ChatMessage } from '@/lib/services/ai-providers.service';
import type { MCPTool } from '@/lib/mcp/tools';
import type { ToolCall, Intent } from './fsm-types';

// ─── Stream Chunk Types ──────────────────────────────────────────────────

export interface TokenChunk {
  type: 'token' | 'done' | 'error';
  content?: string;
  error?: string;
}

export interface ToolCallChunk {
  type: 'token' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolCall?: { name: string; arguments: string };
  error?: string;
}

// ─── Classification Result ───────────────────────────────────────────────

export interface Classification {
  intent: Intent;
  confidence: number;
  reason: string;
}

// ─── Stream Options ──────────────────────────────────────────────────────

export interface StreamOpts {
  maxTokens?: number;
  temperature?: number;
  apiKey?: string;
}

export interface ToolStreamOpts extends StreamOpts {
  tools: MCPTool[];
}

// ─── Provider Adapter Interface ──────────────────────────────────────────

export interface ProviderAdapter {
  readonly providerId: string;
  readonly defaultModel: string;

  /** Normalize internal ChatMessage[] to provider-specific message format. */
  normalizeMessages(messages: ChatMessage[]): unknown[];

  /** Convert MCP tool definitions to provider-specific format. */
  normalizeTools(tools: MCPTool[]): unknown[];

  /** Stream text-only completion (no tool calling). Used by SYNTHESIZE state. */
  streamText(
    messages: ChatMessage[],
    opts: StreamOpts,
  ): AsyncGenerator<TokenChunk>;

  /** Stream completion with tool calling enabled. Used by PLAN state. */
  streamWithTools(
    messages: ChatMessage[],
    opts: ToolStreamOpts,
  ): AsyncGenerator<ToolCallChunk>;

  /** Non-streaming tool call — returns tool calls + optional text content. Used by PLAN state. */
  callWithTools(
    messages: ChatMessage[],
    tools: MCPTool[],
    opts?: StreamOpts,
  ): Promise<{ toolCalls: ToolCall[]; content: string }>;

  /** Lightweight non-streaming classification. Used by CLASSIFY state. */
  classify(
    query: string,
    systemPrompt: string,
    opts?: StreamOpts,
  ): Promise<Classification>;

  /** Parse raw LLM response for tool calls. Primary: tool_calls field. Fallback: text regex. */
  parseToolCalls(rawContent: string, structuredToolCalls: unknown[]): ToolCall[];

  /** Get API key from env or explicit parameter */
  resolveApiKey(explicitKey?: string): string | undefined;

  /** Model ID to use for this request */
  resolveModel(explicitModel?: string): string;
}
