/**
 * FailoverAdapter — Multi-provider resilience with health-aware fallback.
 *
 * Chains through providers in priority order. When a provider fails
 * (API error, timeout, rate limit), the next provider is tried.
 * Success and failure counts are tracked to dynamically promote
 * healthier providers.
 *
 * Provider chain (configurable via env):
 *   1. DeepSeek  (PRIMARY_AI_PROVIDER or DEEPSEEK_API_KEY)
 *   2. OpenAI    (OPENAI_API_KEY)
 *   3. Anthropic (ANTHROPIC_API_KEY)
 *   4. Ollama    (OLLAMA_BASE_URL — local fallback)
 *
 * Env:
 *   AI_FAILOVER_ORDER=deepseek,openai,anthropic,ollama (comma-separated)
 *   AI_FAILOVER_MAX_RETRIES=2 (per-request retries, default 0 = try each once)
 */

import type { ProviderAdapter } from '../adapter';
import type { StreamOpts, ToolStreamOpts, TokenChunk, ToolCallChunk, Classification } from '../adapter';
import type { ChatMessage } from '@/lib/services/ai-providers.service';
import type { MCPTool } from '@/lib/mcp/tools';
import type { ToolCall } from '../fsm-types';
import { getAdapter, type ProviderId } from '../adapter-factory';

// ─── Configuration ───────────────────────────────────────────────────────────────

const DEFAULT_FAILOVER_ORDER: ProviderId[] = ['deepseek', 'openai', 'anthropic'];

function parseFailoverOrder(): ProviderId[] {
  const env = process.env.AI_FAILOVER_ORDER;
  if (!env) return DEFAULT_FAILOVER_ORDER;
  const parts = env.split(',').map(s => s.trim()).filter(Boolean) as ProviderId[];
  const valid: ProviderId[] = [];
  for (const p of parts) {
    if (p === 'deepseek' || p === 'openai' || p === 'anthropic') {
      valid.push(p);
    }
  }
  return valid.length > 0 ? valid : DEFAULT_FAILOVER_ORDER;
}

const MAX_RETRIES = Math.max(0, Number(process.env.AI_FAILOVER_MAX_RETRIES) || 0);

// ─── Health tracking ────────────────────────────────────────────────────────────

interface ProviderHealth {
  successCount: number;
  failureCount: number;
  lastFailure: number;
  consecutiveFailures: number;
}

const healthMap = new Map<string, ProviderHealth>();

function trackSuccess(providerId: string) {
  const h = healthMap.get(providerId) || { successCount: 0, failureCount: 0, lastFailure: 0, consecutiveFailures: 0 };
  h.successCount++;
  h.consecutiveFailures = 0;
  healthMap.set(providerId, h);
}

function trackFailure(providerId: string) {
  const h = healthMap.get(providerId) || { successCount: 0, failureCount: 0, lastFailure: 0, consecutiveFailures: 0 };
  h.failureCount++;
  h.consecutiveFailures++;
  h.lastFailure = Date.now();
  healthMap.set(providerId, h);
}

function isProviderAvailable(providerId: string): boolean {
  const h = healthMap.get(providerId);
  if (!h) return true; // never tried
  if (h.consecutiveFailures >= 5) {
    // Cooldown: if last failure was < 30s ago, skip
    if (Date.now() - h.lastFailure < 30_000) return false;
  }
  return true;
}

// ─── Ollama (local) adapter — lightweight, no external deps ─────────────────────

function hasOllama(): boolean {
  return !!process.env.OLLAMA_BASE_URL;
}

/** Minimal Ollama adapter for the failover chain. */
function createOllamaAdapter(): ProviderAdapter {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

  return {
    providerId: 'ollama',
    defaultModel: model,

    normalizeMessages(messages: ChatMessage[]): unknown[] {
      return messages.map(m => ({ role: m.role, content: m.content || '' }));
    },

    normalizeTools(tools: MCPTool[]): unknown[] {
      // Ollama doesn't support native tool calling — fall through
      return tools.map(t => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    },

    async *streamText(messages: ChatMessage[], opts: StreamOpts): AsyncGenerator<TokenChunk> {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          stream: true,
          options: { temperature: opts.temperature ?? 0.7 },
        }),
      });

      if (!response.ok) {
        yield { type: 'error', error: `Ollama error: ${response.status}` };
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) { yield { type: 'error', error: 'No response body' }; return; }

      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              yield { type: 'token', content: json.message.content };
            }
            if (json.done) { yield { type: 'done' }; return; }
          } catch { /* skip */ }
        }
      }
      yield { type: 'done' };
    },

    async *streamWithTools(messages: ChatMessage[], opts: ToolStreamOpts): AsyncGenerator<ToolCallChunk> {
      // Ollama: no native tool calling → yield error to trigger next provider
      yield { type: 'error', error: 'Ollama does not support tool calling' };
    },

    async callWithTools(messages: ChatMessage[], tools: MCPTool[], opts?: StreamOpts): Promise<{ toolCalls: ToolCall[]; content: string }> {
      throw new Error('Ollama does not support tool calling');
    },

    async classify(query: string, systemPrompt: string, opts?: StreamOpts): Promise<Classification> {
      // Fallback: keyword classification
      const q = query.toLowerCase();
      if (['库存', '成本', '供应商', '关税'].some(w => q.includes(w))) {
        return { intent: 'supply_chain_data', confidence: 0.6, reason: 'ollama-keyword' };
      }
      return { intent: 'supply_chain_knowledge', confidence: 0.5, reason: 'ollama-keyword' };
    },

    parseToolCalls(rawContent: string, structured: unknown[]): ToolCall[] {
      return [];
    },

    resolveApiKey(): string | undefined { return undefined; },
    resolveModel(): string { return model; },
  };
}

// ─── Failover Adapter ────────────────────────────────────────────────────────────

export class FailoverAdapter implements ProviderAdapter {
  readonly providerId = 'failover';
  readonly defaultModel = 'auto';

  private providers: { id: string; adapter: ProviderAdapter }[];
  private lastUsedProvider: string | null = null;

  constructor(customOrder?: string[]) {
    const order = customOrder || parseFailoverOrder();
    this.providers = [];

    for (const id of order) {
      try {
        if (id === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
          this.providers.push({ id: 'deepseek', adapter: getAdapter('deepseek') });
        } else if (id === 'openai' && process.env.OPENAI_API_KEY) {
          this.providers.push({ id: 'openai', adapter: getAdapter('openai') });
        } else if (id === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
          this.providers.push({ id: 'anthropic', adapter: getAdapter('anthropic') });
        } else if (id === 'ollama' && hasOllama()) {
          this.providers.push({ id: 'ollama', adapter: createOllamaAdapter() });
        } else {
          // Check for dynamic ollama (added at end)
          if ((id as string) === 'ollama' && hasOllama()) {
            this.providers.push({ id: 'ollama', adapter: createOllamaAdapter() });
          }
        }
      } catch {
        // Adapter init failure → skip this provider
      }
    }

    // Always add Ollama at the end if available
    if (hasOllama() && !this.providers.some(p => p.id === 'ollama')) {
      this.providers.push({ id: 'ollama', adapter: createOllamaAdapter() });
    }

    // Ensure we have at least one provider
    if (this.providers.length === 0) {
      console.warn('[FailoverAdapter] No AI providers configured! Responses will be degraded.');
    }

    console.log(
      `[FailoverAdapter] Provider chain: ${this.providers.map(p => p.id).join(' → ') || '(none)'}`,
    );
  }

  get availableProviders(): string[] {
    return this.providers.map(p => p.id);
  }

  get lastProvider(): string | null {
    return this.lastUsedProvider;
  }

  getHealth(): Record<string, ProviderHealth> {
    const result: Record<string, ProviderHealth> = {};
    for (const [id, h] of healthMap.entries()) {
      result[id] = { ...h };
    }
    return result;
  }

  // ─── Delegated interface methods ──────────────────────────────────────────

  normalizeMessages(messages: ChatMessage[]): unknown[] {
    return this.providers[0]?.adapter.normalizeMessages(messages) || messages;
  }

  normalizeTools(tools: MCPTool[]): unknown[] {
    return this.providers[0]?.adapter.normalizeTools(tools) || [];
  }

  // ─── Failover-aware streaming ─────────────────────────────────────────────

  async *streamText(
    messages: ChatMessage[],
    opts: StreamOpts,
  ): AsyncGenerator<TokenChunk> {
    for (const { id, adapter } of this.providers) {
      if (!isProviderAvailable(id)) continue;

      this.lastUsedProvider = id;
      let gotTokens = false;
      let hadError = false;

      try {
        for await (const chunk of adapter.streamText(messages, opts)) {
          if (chunk.type === 'token' && chunk.content) gotTokens = true;
          if (chunk.type === 'error') hadError = true;
          yield chunk;
          if (chunk.type === 'done') {
            trackSuccess(id);
            return;
          }
        }
      } catch (err) {
        hadError = true;
        console.warn(`[FailoverAdapter] ${id} streamText failed: ${(err as Error).message}, trying next...`);
      }

      if (hadError) {
        trackFailure(id);
      } else if (!gotTokens) {
        trackFailure(id);
        console.warn(`[FailoverAdapter] ${id} produced no tokens, failing over...`);
      } else {
        // Partial tokens received but no done signal
        trackSuccess(id);
        return;
      }
    }

    trackFailure('all-providers');
    yield { type: 'error', error: 'All AI providers exhausted' };
  }

  async *streamWithTools(
    messages: ChatMessage[],
    opts: ToolStreamOpts,
  ): AsyncGenerator<ToolCallChunk> {
    for (const { id, adapter } of this.providers) {
      if (!isProviderAvailable(id)) continue;

      this.lastUsedProvider = id;
      let hadError = false;

      try {
        for await (const chunk of adapter.streamWithTools(messages, opts)) {
          if (chunk.type === 'error') hadError = true;
          yield chunk;
          if (chunk.type === 'done') {
            trackSuccess(id);
            return;
          }
        }
      } catch (err) {
        hadError = true;
        console.warn(`[FailoverAdapter] ${id} streamWithTools failed: ${(err as Error).message}, trying next...`);
      }

      if (hadError) {
        trackFailure(id);
      }
    }

    trackFailure('all-providers');
    yield { type: 'error', error: 'All AI providers exhausted for tool calling' };
  }

  // ─── Non-streaming tool call (also failover) ──────────────────────────────

  async callWithTools(
    messages: ChatMessage[],
    tools: MCPTool[],
    opts?: StreamOpts,
  ): Promise<{ toolCalls: ToolCall[]; content: string }> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      for (const { id, adapter } of this.providers) {
        if (!isProviderAvailable(id)) continue;

        this.lastUsedProvider = id;
        try {
          const result = await adapter.callWithTools(messages, tools, opts);
          trackSuccess(id);
          return result;
        } catch (err) {
          console.warn(
            `[FailoverAdapter] ${id} callWithTools failed: ${(err as Error).message}${id !== this.providers[this.providers.length - 1].id ? ', trying next...' : ''}`,
          );
          trackFailure(id);
        }
      }
    }

    throw new Error('All AI providers exhausted for callWithTools');
  }

  // ─── Classification ──────────────────────────────────────────────────────

  async classify(
    query: string,
    systemPrompt: string,
    opts?: StreamOpts,
  ): Promise<Classification> {
    for (const { id, adapter } of this.providers) {
      if (!isProviderAvailable(id)) continue;

      this.lastUsedProvider = id;
      try {
        const result = await adapter.classify(query, systemPrompt, opts);
        trackSuccess(id);
        return result;
      } catch (err) {
        console.warn(`[FailoverAdapter] ${id} classify failed: ${(err as Error).message}`);
        trackFailure(id);
      }
    }

    // Ultimate fallback — keyword classification
    const q = query.toLowerCase();
    if (['库存', '成本', '供应商', '关税'].some(w => q.includes(w))) {
      return { intent: 'supply_chain_data', confidence: 0.4, reason: 'ultimate-fallback' };
    }
    return { intent: 'supply_chain_knowledge', confidence: 0.3, reason: 'ultimate-fallback' };
  }

  parseToolCalls(rawContent: string, structured: unknown[]): ToolCall[] {
    // Delegate to first available provider
    for (const { adapter } of this.providers) {
      try {
        const calls = adapter.parseToolCalls(rawContent, structured);
        return calls;
      } catch { /* continue */ }
    }
    return [];
  }

  resolveApiKey(explicitKey?: string): string | undefined {
    return explicitKey || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY;
  }

  resolveModel(): string {
    return this.providers[0]?.adapter.defaultModel || 'auto';
  }
}
