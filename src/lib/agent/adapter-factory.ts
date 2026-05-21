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

export type ProviderId = 'deepseek' | 'openai' | 'anthropic';

export function getAdapter(providerId: ProviderId, model?: string): ProviderAdapter {
  switch (providerId) {
    case 'deepseek': return new DeepSeekAdapter(model);
    case 'openai': return new OpenAIAdapter(model);
    case 'anthropic': return new AnthropicAdapter(model);
    default: throw new Error(`Unknown provider: ${providerId}`);
  }
}
