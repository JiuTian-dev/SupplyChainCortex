/**
 * Adapter Factory — instantiates the correct ProviderAdapter.
 * Separate from adapter.ts to break circular dependency:
 *   adapter.ts defines ProviderAdapter (imported by adapters/)
 *   adapter-factory.ts imports from adapters/ and adapter.ts
 *   No cycle.
 */

import type { ProviderAdapter } from './adapter';
import { DeepSeekAdapter } from './adapters/deepseek.adapter';
import { OpenAIAdapter } from './adapters/openai.adapter';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { FailoverAdapter } from './adapters/failover.adapter';
import { HybridAdapter } from './adapters/hybrid.adapter';
import { getGlobalCostTracker } from './cost-tracker';

export type ProviderId = 'deepseek' | 'openai' | 'anthropic' | 'failover' | 'hybrid';

/** Adapter selection mode: 'single' (default) or 'hybrid' (complexity-routed). */
export type AdapterMode = 'single' | 'hybrid';

/** Whether multi-provider failover is enabled (AI_FAILOVER_ENABLED=true or AI_FAILOVER_ORDER set). */
export function isFailoverEnabled(): boolean {
  return process.env.AI_FAILOVER_ENABLED === 'true' || !!process.env.AI_FAILOVER_ORDER;
}

/** Whether hybrid provider routing is enabled (HYBRID_PROVIDER_ENABLED=true). */
export function isHybridEnabled(): boolean {
  return process.env.HYBRID_PROVIDER_ENABLED === 'true' ||
    process.env.ADAPTER_MODE === 'hybrid';
}

/** Get the configured adapter mode from env (default: 'single' for backward compat). */
export function getAdapterMode(): AdapterMode {
  return isHybridEnabled() ? 'hybrid' : 'single';
}

export function getAdapter(providerId: ProviderId, model?: string): ProviderAdapter {
  switch (providerId) {
    case 'deepseek': return new DeepSeekAdapter(model);
    case 'openai': return new OpenAIAdapter(model);
    case 'anthropic': return new AnthropicAdapter(model);
    case 'failover': return new FailoverAdapter();
    case 'hybrid': return createHybridAdapter();
    default: throw new Error(`Unknown provider: ${providerId}`);
  }
}

/**
 * Create a HybridAdapter with the global cost tracker attached.
 * Cost tracking is opt-in: the tracker records but does not block calls.
 */
export function createHybridAdapter(): HybridAdapter {
  const adapter = new HybridAdapter({ enabled: true });
  // Attach global cost tracker for observability (non-blocking)
  adapter.attachCostTracker(getGlobalCostTracker());
  return adapter;
}

/**
 * Get the default adapter.
 *
 * Priority (highest first):
 *   1. HYBRID_PROVIDER_ENABLED=true  → HybridAdapter (complexity-routed)
 *   2. AI_FAILOVER_ENABLED=true      → FailoverAdapter (health-aware chain)
 *   3. default                        → DeepSeekAdapter (single provider)
 *
 * Hybrid sits ABOVE failover in the routing hierarchy: it picks the best
 * provider per-request based on complexity, while failover just tries
 * them in sequence. They are NOT mutually exclusive — when hybrid is
 * enabled, failover is used internally as the fallback mechanism.
 */
export function getDefaultAdapter(model?: string): ProviderAdapter {
  if (isHybridEnabled()) {
    return createHybridAdapter();
  }
  if (isFailoverEnabled()) {
    return new FailoverAdapter();
  }
  return getAdapter('deepseek', model);
}

