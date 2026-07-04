/**
 * Hybrid Adapter — complexity-aware provider routing.
 *
 * Sits ABOVE the FailoverAdapter in the routing hierarchy. Instead of
 * trying every provider in sequence, it first assesses task complexity
 * then routes to the most cost-effective provider that can handle it:
 *
 *   simple         → DeepSeek  (cheapest, fine for single-tool queries)
 *   medium         → DeepSeek  → on failure retry → GPT-4o (upgrade)
 *   complex        → Claude    (best for multi-step orchestration)
 *   tool-intensive → GPT-4o    (precise param filling, >3 tools)
 *
 * Fallback chain (universal): DeepSeek → GPT-4o → Claude.
 * DeepSeek gets 1 retry before upgrade (74.3% reliability).
 *
 * Cost tracking: each call is recorded with provider, tokens, cost, complexity.
 *
 * Env:
 *   HYBRID_PROVIDER_ENABLED=true  (default: false — keeps backward compat)
 *   HYBRID_DEEPSEEK_RETRY=true   (default: true — retry DeepSeek once before upgrade)
 */

import type {
  ProviderAdapter,
  StreamOpts,
  ToolStreamOpts,
  TokenChunk,
  ToolCallChunk,
  Classification,
} from '../adapter';
import type { ChatMessage } from '@/lib/services/ai-providers.service';
import type { MCPTool } from '@/lib/mcp/tools';
import type { ToolCall } from '../fsm-types';
import { DeepSeekAdapter } from './deepseek.adapter';
import { OpenAIAdapter } from './openai.adapter';
import { AnthropicAdapter } from './anthropic.adapter';
import {
  assessComplexity,
  type ComplexityLevel,
  type ComplexityAssessment,
} from '../complexity-assessor';
import {
  CostTracker,
  calculateCost,
  estimateTokens,
} from '../cost-tracker';

// ─── Routing Policy ────────────────────────────────────────────────────────────

interface RoutingDecision {
  provider: ProviderAdapter;
  providerId: string;
  complexity: ComplexityLevel;
  reason: string;
  /** Ordered fallback chain (excluding the primary, which is already chosen). */
  fallback: ProviderAdapter[];
}

// ─── Hybrid Adapter ────────────────────────────────────────────────────────────

export interface HybridAdapterOptions {
  /** Inject custom DeepSeek adapter (for testing). */
  deepseek?: ProviderAdapter;
  /** Inject custom OpenAI adapter (for testing). */
  openai?: ProviderAdapter;
  /** Inject custom Anthropic adapter (for testing). */
  anthropic?: ProviderAdapter;
  /** Inject custom cost tracker (for testing). */
  costTracker?: CostTracker;
  /** Force enable (overrides env var). */
  enabled?: boolean;
  /** Whether to retry DeepSeek once before upgrading (default: true). */
  retryDeepseek?: boolean;
}

export class HybridAdapter implements ProviderAdapter {
  readonly providerId = 'hybrid';
  readonly defaultModel = 'auto';

  private deepseek: ProviderAdapter;
  private openai: ProviderAdapter;
  private anthropic: ProviderAdapter;
  private costTracker: CostTracker | null;
  private enabled: boolean;
  private retryDeepseek: boolean;

  /** Last routing decision — exposed for inspection/testing. */
  lastRouting: {
    providerId: string;
    complexity: ComplexityLevel;
    reason: string;
    assessment: ComplexityAssessment;
  } | null = null;

  constructor(opts?: HybridAdapterOptions) {
    // Use injected adapters or create default instances.
    // Direct imports (not via factory) to avoid circular dependency:
    //   adapter-factory → hybrid.adapter → (concrete adapters only)
    this.deepseek = opts?.deepseek ?? new DeepSeekAdapter();
    this.openai = opts?.openai ?? new OpenAIAdapter();
    this.anthropic = opts?.anthropic ?? new AnthropicAdapter();
    this.costTracker = opts?.costTracker ?? null;
    this.enabled = opts?.enabled ??
      (process.env.HYBRID_PROVIDER_ENABLED === 'true' ||
        process.env.ADAPTER_MODE === 'hybrid');
    this.retryDeepseek = opts?.retryDeepseek ?? process.env.HYBRID_DEEPSEEK_RETRY !== 'false';
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  getCostTracker(): CostTracker | null {
    return this.costTracker;
  }

  /** Attach a cost tracker after construction. */
  attachCostTracker(tracker: CostTracker): void {
    this.costTracker = tracker;
  }

  // ─── Complexity Assessment + Routing ──────────────────────────────────────

  /**
   * Assess complexity and decide which provider to use.
   * Exposed for testing and inspection.
   */
  assessAndRoute(
    messages: ChatMessage[],
    availableTools: MCPTool[] = [],
  ): RoutingDecision {
    const assessment = assessComplexity({ messages, availableTools });
    const level = assessment.level;

    let primary: ProviderAdapter;
    let primaryId: string;
    let fallback: ProviderAdapter[];

    switch (level) {
      case 'simple':
        // DeepSeek only, light fallback to GPT-4o
        primary = this.deepseek;
        primaryId = 'deepseek';
        fallback = [this.openai];
        break;

      case 'medium':
        // DeepSeek first, upgrade to GPT-4o → Claude on failure
        primary = this.deepseek;
        primaryId = 'deepseek';
        fallback = [this.openai, this.anthropic];
        break;

      case 'complex':
        // Claude directly — it's the top of the chain
        primary = this.anthropic;
        primaryId = 'anthropic';
        fallback = [];
        break;

      case 'tool-intensive':
        // GPT-4o for precise param filling, Claude as fallback
        primary = this.openai;
        primaryId = 'openai';
        fallback = [this.anthropic];
        break;

      default:
        primary = this.deepseek;
        primaryId = 'deepseek';
        fallback = [this.openai, this.anthropic];
    }

    this.lastRouting = {
      providerId: primaryId,
      complexity: level,
      reason: assessment.reason,
      assessment,
    };

    return {
      provider: primary,
      providerId: primaryId,
      complexity: level,
      reason: assessment.reason,
      fallback,
    };
  }

  // ─── Cost Tracking Helper ─────────────────────────────────────────────────

  private trackCall(
    providerId: string,
    inputText: string,
    outputText: string,
    complexity: ComplexityLevel,
    success: boolean,
    latencyMs?: number,
  ): void {
    if (!this.costTracker) return;
    const inputTokens = estimateTokens(inputText);
    const outputTokens = estimateTokens(outputText);
    const cost = calculateCost(providerId, inputTokens, outputTokens);
    this.costTracker.record({
      provider: providerId,
      inputTokens,
      outputTokens,
      cost,
      complexity,
      success,
      latencyMs,
    });
  }

  // ─── ProviderAdapter Interface ────────────────────────────────────────────

  normalizeMessages(messages: ChatMessage[]): unknown[] {
    // Delegate to DeepSeek (OpenAI-compatible format) — universal baseline
    return this.deepseek.normalizeMessages(messages);
  }

  normalizeTools(tools: MCPTool[]): unknown[] {
    return this.deepseek.normalizeTools(tools);
  }

  async *streamText(
    messages: ChatMessage[],
    opts: StreamOpts,
  ): AsyncGenerator<TokenChunk> {
    const decision = this.assessAndRoute(messages, []);
    const chain = [decision.provider, ...decision.fallback];
    const inputText = messages.map(m => m.content || '').join('\n');
    let outputText = '';
    const startTime = Date.now();

    for (let i = 0; i < chain.length; i++) {
      const adapter = chain[i];
      const providerId = adapter.providerId;
      let hadError = false;

      // DeepSeek retry logic: retry once before moving to fallback
      const maxAttempts = providerId === 'deepseek' && this.retryDeepseek ? 2 : 1;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        hadError = false;
        try {
          for await (const chunk of adapter.streamText(messages, opts)) {
            if (chunk.type === 'error') {
              hadError = true;
              break;
            }
            if (chunk.type === 'token' && chunk.content) {
              outputText += chunk.content;
            }
            yield chunk;
            if (chunk.type === 'done') {
              this.trackCall(
                providerId, inputText, outputText, decision.complexity, true,
                Date.now() - startTime,
              );
              return;
            }
          }
          // If we got here without error or done, treat as success
          if (!hadError) {
            this.trackCall(
              providerId, inputText, outputText, decision.complexity, true,
              Date.now() - startTime,
            );
            return;
          }
        } catch (err) {
          hadError = true;
          console.warn(
            `[HybridAdapter] ${providerId} streamText failed (attempt ${attempt + 1}): ${(err as Error).message}`,
          );
        }
      }

      if (hadError && i < chain.length - 1) {
        console.warn(`[HybridAdapter] Upgrading from ${providerId} to ${chain[i + 1].providerId}`);
      }
    }

    this.trackCall(
      decision.providerId, inputText, outputText, decision.complexity, false,
      Date.now() - startTime,
    );
    yield { type: 'error', error: 'All providers exhausted in hybrid streamText' };
  }

  async *streamWithTools(
    messages: ChatMessage[],
    opts: ToolStreamOpts,
  ): AsyncGenerator<ToolCallChunk> {
    const decision = this.assessAndRoute(messages, opts.tools);
    const chain = [decision.provider, ...decision.fallback];
    const inputText = messages.map(m => m.content || '').join('\n');
    let outputText = '';
    const startTime = Date.now();

    for (let i = 0; i < chain.length; i++) {
      const adapter = chain[i];
      const providerId = adapter.providerId;
      let hadError = false;
      const maxAttempts = providerId === 'deepseek' && this.retryDeepseek ? 2 : 1;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        hadError = false;
        try {
          for await (const chunk of adapter.streamWithTools(messages, opts)) {
            if (chunk.type === 'error') {
              hadError = true;
              break;
            }
            if (chunk.type === 'token' && chunk.content) {
              outputText += chunk.content;
            }
            yield chunk;
            if (chunk.type === 'done') {
              this.trackCall(
                providerId, inputText, outputText, decision.complexity, true,
                Date.now() - startTime,
              );
              return;
            }
          }
          if (!hadError) {
            this.trackCall(
              providerId, inputText, outputText, decision.complexity, true,
              Date.now() - startTime,
            );
            return;
          }
        } catch (err) {
          hadError = true;
          console.warn(
            `[HybridAdapter] ${providerId} streamWithTools failed (attempt ${attempt + 1}): ${(err as Error).message}`,
          );
        }
      }

      if (hadError && i < chain.length - 1) {
        console.warn(`[HybridAdapter] Upgrading from ${providerId} to ${chain[i + 1].providerId}`);
      }
    }

    this.trackCall(
      decision.providerId, inputText, outputText, decision.complexity, false,
      Date.now() - startTime,
    );
    yield { type: 'error', error: 'All providers exhausted in hybrid streamWithTools' };
  }

  async callWithTools(
    messages: ChatMessage[],
    tools: MCPTool[],
    opts?: StreamOpts,
  ): Promise<{ toolCalls: ToolCall[]; content: string }> {
    const decision = this.assessAndRoute(messages, tools);
    const chain = [decision.provider, ...decision.fallback];
    const inputText = messages.map(m => m.content || '').join('\n');
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let i = 0; i < chain.length; i++) {
      const adapter = chain[i];
      const providerId = adapter.providerId;
      const maxAttempts = providerId === 'deepseek' && this.retryDeepseek ? 2 : 1;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const result = await adapter.callWithTools(messages, tools, opts);
          this.trackCall(
            providerId, inputText, result.content, decision.complexity, true,
            Date.now() - startTime,
          );
          return result;
        } catch (err) {
          lastError = err as Error;
          console.warn(
            `[HybridAdapter] ${providerId} callWithTools failed (attempt ${attempt + 1}/${maxAttempts}): ${(err as Error).message}`,
          );
          if (attempt < maxAttempts - 1) continue;
        }
      }

      // Track this provider's failure before moving to fallback
      this.trackCall(
        providerId, inputText, '', decision.complexity, false,
        Date.now() - startTime,
      );

      if (i < chain.length - 1) {
        console.warn(`[HybridAdapter] Upgrading from ${providerId} to ${chain[i + 1].providerId}`);
      }
    }

    throw new Error(`All providers exhausted in hybrid callWithTools${lastError ? `: ${lastError.message}` : ''}`);
  }

  async classify(
    query: string,
    systemPrompt: string,
    opts?: StreamOpts,
  ): Promise<Classification> {
    // Classification is lightweight — always use DeepSeek (cheapest)
    // with fallback to OpenAI if DeepSeek unavailable.
    const inputText = `${systemPrompt}\n${query}`;
    const startTime = Date.now();

    try {
      const result = await this.deepseek.classify(query, systemPrompt, opts);
      this.trackCall('deepseek', inputText, '', 'simple', true, Date.now() - startTime);
      return result;
    } catch (err) {
      console.warn(`[HybridAdapter] DeepSeek classify failed: ${(err as Error).message}, falling back to OpenAI`);
    }

    try {
      const result = await this.openai.classify(query, systemPrompt, opts);
      this.trackCall('openai', inputText, '', 'simple', true, Date.now() - startTime);
      return result;
    } catch (err) {
      this.trackCall('deepseek', inputText, '', 'simple', false, Date.now() - startTime);
      throw new Error(`Hybrid classify failed: ${(err as Error).message}`);
    }
  }

  parseToolCalls(rawContent: string, structuredToolCalls: unknown[]): ToolCall[] {
    // Delegate to DeepSeek's parser (handles text fallback for leakage)
    return this.deepseek.parseToolCalls(rawContent, structuredToolCalls);
  }

  resolveApiKey(explicitKey?: string): string | undefined {
    return (
      explicitKey ||
      process.env.DEEPSEEK_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY
    );
  }

  resolveModel(): string {
    return this.lastRouting?.providerId || 'auto';
  }
}
