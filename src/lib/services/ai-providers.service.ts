/**
 * Universal AI Provider Service — supports DeepSeek, OpenAI, Anthropic, local Ollama.
 * All use OpenAI-compatible chat completions API format.
 * Anthropic is translated on-the-fly (messages format differs from OpenAI).
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AIModel {
  id: string;
  name: string;
  description: string;
  maxTokens: number;
  supportsStreaming: boolean;
  icon: string;
}

export interface AIProvider {
  id: string;
  name: string;
  baseURL: string;
  models: AIModel[];
  defaultModel: string;
  /** Key name for env-var fallback, e.g. DEEPSEEK_API_KEY */
  envKeyName: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ChatCompletionParams {
  provider: string;
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
}

// ─── Provider Registry ─────────────────────────────────────────────────────────

export const AI_PROVIDERS: Record<string, AIProvider> = {
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    envKeyName: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V4 Pro', description: '旗舰模型，1M上下文', maxTokens: 8192, supportsStreaming: true, icon: '🚀' },
      { id: 'deepseek-chat-flash', name: 'DeepSeek V4 Flash', description: '极速推理，成本优化', maxTokens: 8192, supportsStreaming: true, icon: '⚡' },
    ],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    envKeyName: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: '多模态旗舰模型', maxTokens: 4096, supportsStreaming: true, icon: '🧠' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: '轻量高效模型', maxTokens: 4096, supportsStreaming: true, icon: '💡' },
    ],
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    baseURL: 'https://api.anthropic.com/v1',
    envKeyName: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: '平衡性能与成本', maxTokens: 4096, supportsStreaming: true, icon: '🎯' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', description: '最快响应速度', maxTokens: 4096, supportsStreaming: true, icon: '💨' },
    ],
  },
  local: {
    id: 'local',
    name: '本地模型 (Ollama)',
    baseURL: 'http://localhost:11434/v1',
    envKeyName: 'LOCAL_API_KEY',
    defaultModel: 'gemma4:e4b',
    models: [
      { id: 'gemma4:e4b', name: 'Gemma 4 e4b', description: 'Google 轻量开源模型', maxTokens: 4096, supportsStreaming: true, icon: '🦎' },
      { id: 'qwen2.5:7b', name: 'Qwen 2.5 7B', description: '阿里通义千问开源模型', maxTokens: 4096, supportsStreaming: true, icon: '🐉' },
      { id: 'llama3.2:3b', name: 'Llama 3.2 3B', description: 'Meta 轻量开源模型', maxTokens: 4096, supportsStreaming: true, icon: '🦙' },
      { id: 'deepseek-r1:8b', name: 'DeepSeek R1 8B', description: '推理增强开源模型', maxTokens: 4096, supportsStreaming: true, icon: '🔍' },
    ],
  },
};

// ─── Anthropic Translation Layer ───────────────────────────────────────────────
// Anthropic uses the Messages API (not /chat/completions), so we translate
// between the OpenAI-compatible format used internally and Anthropic's format.

const ANTHROPIC_API_PATH = '/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';

function isAnthropicProvider(providerId: string): boolean {
  return providerId === 'anthropic';
}

function buildAnthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_API_VERSION,
    // Required for browser-side CORS requests to Anthropic
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

/**
 * OpenAI-format messages have `system` as a message role.
 * Anthropic requires it as a top-level `system` string and does not
 * allow `role: "system"` inside the `messages` array.
 */
function separateSystemMessage(
  messages: ChatMessage[],
): { system: string | undefined; nonSystemMessages: Array<{ role: string; content: string }> } {
  const systemMsg = messages.find(m => m.role === 'system');
  return {
    system: systemMsg?.content,
    nonSystemMessages: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
  };
}

/** Translate an Anthropic non-streaming response to OpenAI-compatible shape. */
function fromAnthropicResponse(
  data: Record<string, unknown>,
  requestedModel: string,
): Record<string, unknown> {
  const contentBlocks = (data.content as Array<Record<string, unknown>>) ?? [];
  const textBlock = contentBlocks.find(c => c.type === 'text');
  const usage = (data.usage as Record<string, number>) ?? {};

  return {
    id: data.id,
    object: 'chat.completion',
    model: data.model ?? requestedModel,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: (textBlock?.text as string) ?? '',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: usage.input_tokens ?? 0,
      completion_tokens: usage.output_tokens ?? 0,
    },
  };
}

/**
 * Parse Anthropic Messages API SSE stream and emit typed events
 * in the same shape as the OpenAI-compatible stream parser.
 */
async function* handleAnthropicStream(
  response: Response,
  requestedModel: string,
): AsyncGenerator<
  | { type: 'token'; content: string }
  | { type: 'tool_call'; toolCall: { name: string; arguments: string } }
  | { type: 'done'; usage?: { promptTokens: number; completionTokens: number } }
  | { type: 'error'; error: string },
  void,
  unknown
> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let inputTokens = 0;
  let doneYielded = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const raw = trimmed.slice(6);

        try {
          const event = JSON.parse(raw) as Record<string, unknown>;

          switch (event.type) {
            case 'message_start': {
              const msg = (event.message as Record<string, unknown>) ?? {};
              inputTokens = ((msg.usage as Record<string, number>)?.input_tokens) ?? 0;
              break;
            }

            case 'content_block_delta': {
              const delta = (event.delta as Record<string, unknown>) ?? {};
              if (delta.type === 'text_delta' && delta.text) {
                yield { type: 'token', content: delta.text as string };
              }
              break;
            }

            case 'message_delta': {
              const outputTokens = ((event.usage as Record<string, number>)?.output_tokens) ?? 0;
              yield {
                type: 'done',
                usage: {
                  promptTokens: inputTokens,
                  completionTokens: outputTokens,
                },
              };
              doneYielded = true;
              break;
            }

            // Events we can safely ignore in the text-only path:
            case 'message_stop':
            case 'ping':
            case 'content_block_start':
            case 'content_block_stop':
              break;
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }

    // Guard: if the stream ended without message_delta, still emit done
    if (!doneYielded) {
      yield { type: 'done' };
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve API key: frontend input > env var > empty (will error) */
export function resolveApiKey(providerId: string, frontendKey?: string): string {
  if (frontendKey) return frontendKey;
  const provider = AI_PROVIDERS[providerId];
  if (!provider) return '';
  const envKey = process.env[provider.envKeyName];
  return envKey || '';
}

export function getProvider(providerId: string): AIProvider | undefined {
  return AI_PROVIDERS[providerId];
}

export function getProviderModels(providerId: string): AIModel[] {
  return AI_PROVIDERS[providerId]?.models ?? [];
}

export function getDefaultModel(providerId: string): string {
  return AI_PROVIDERS[providerId]?.defaultModel ?? '';
}

// ─── API Call (non-streaming) ──────────────────────────────────────────────────

export async function chatCompletion(params: ChatCompletionParams): Promise<{
  content: string;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}> {
  const { provider: providerId, model, messages, apiKey, maxTokens, temperature, tools } = params;
  const provider = AI_PROVIDERS[providerId];
  if (!provider) throw new Error(`未知的 AI 提供商: ${providerId}`);

  const key = resolveApiKey(providerId, apiKey);
  if (!key) throw new Error(`请设置 ${provider.name} 的 API Key（在聊天面板设置中配置或设置环境变量 ${provider.envKeyName}）`);

  // ── Anthropic Messages API (non-streaming) ──
  if (isAnthropicProvider(providerId)) {
    const { system, nonSystemMessages } = separateSystemMessage(messages);

    const anthropicBody: Record<string, unknown> = {
      model,
      messages: nonSystemMessages,
      max_tokens: maxTokens ?? 4096,
      stream: false,
    };
    if (system) anthropicBody.system = system;
    if (temperature !== undefined) anthropicBody.temperature = temperature;
    if (tools?.length) anthropicBody.tools = tools;

    const response = await fetch(`${provider.baseURL}${ANTHROPIC_API_PATH}`, {
      method: 'POST',
      headers: { ...buildAnthropicHeaders(key) },
      body: JSON.stringify(anthropicBody),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`${provider.name} API 错误 (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const openaiCompatible = fromAnthropicResponse(data, model);
    const choice = (openaiCompatible.choices as Array<Record<string, unknown>>)?.[0];
    const msg = choice?.message as Record<string, unknown> | undefined;

    return {
      content: (msg?.content as string) || '',
      model: (openaiCompatible.model as string) || model,
      usage: openaiCompatible.usage as { promptTokens: number; completionTokens: number } | undefined,
    };
  }

  // ── OpenAI-compatible API (DeepSeek, OpenAI, Ollama) ──
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens ?? 4096,
    temperature: temperature ?? 0.7,
    stream: false,
  };

  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const response = await fetch(`${provider.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`${provider.name} API 错误 (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const choice = (data.choices as Array<Record<string, unknown>>)?.[0];
  const msg = choice?.message as Record<string, unknown> | undefined;

  return {
    content: (msg?.content as string) || '',
    toolCalls: (msg?.tool_calls as Array<{ function: { name: string; arguments: string } }>)?.map(tc => ({
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>,
    })),
    model: (data.model as string) || model,
    usage: data.usage as { promptTokens: number; completionTokens: number } | undefined,
  };
}

// ─── Streaming API Call ────────────────────────────────────────────────────────

export async function* chatCompletionStream(params: ChatCompletionParams): AsyncGenerator<{
  type: 'token' | 'tool_call' | 'tool_result' | 'done' | 'error';
  content?: string;
  toolCall?: { name: string; arguments: string };
  usage?: { promptTokens: number; completionTokens: number };
  error?: string;
}> {
  const { provider: providerId, model, messages, apiKey, maxTokens, temperature, tools } = params;
  const provider = AI_PROVIDERS[providerId];
  if (!provider) {
    yield { type: 'error', error: `未知的 AI 提供商: ${providerId}` };
    return;
  }

  const key = resolveApiKey(providerId, apiKey);
  if (!key) {
    yield { type: 'error', error: `请设置 ${provider.name} 的 API Key（在聊天面板设置中配置或设置环境变量 ${provider.envKeyName}）` };
    return;
  }

  // ── Anthropic Messages API streaming ──
  if (isAnthropicProvider(providerId)) {
    const { system, nonSystemMessages } = separateSystemMessage(messages);

    const anthropicBody: Record<string, unknown> = {
      model,
      messages: nonSystemMessages,
      max_tokens: maxTokens ?? 4096,
      stream: true,
    };
    if (system) anthropicBody.system = system;
    if (temperature !== undefined) anthropicBody.temperature = temperature;
    if (tools?.length) anthropicBody.tools = tools;

    let response: Response;
    try {
      response = await fetch(`${provider.baseURL}${ANTHROPIC_API_PATH}`, {
        method: 'POST',
        headers: { ...buildAnthropicHeaders(key) },
        body: JSON.stringify(anthropicBody),
      });
    } catch (err) {
      yield { type: 'error', error: `无法连接到 ${provider.name}: ${(err as Error).message}` };
      return;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      yield { type: 'error', error: `${provider.name} API 错误 (${response.status}): ${errorText}` };
      return;
    }

    if (!response.body) {
      yield { type: 'error', error: '响应体为空' };
      return;
    }

    yield* handleAnthropicStream(response, model);
    return;
  }

  // ── OpenAI-compatible API streaming (DeepSeek, OpenAI, Ollama) ──
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens ?? 4096,
    temperature: temperature ?? 0.7,
    stream: true,
  };

  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  let response: Response;
  try {
    response = await fetch(`${provider.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    yield { type: 'error', error: `无法连接到 ${provider.name}: ${(err as Error).message}` };
    return;
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    yield { type: 'error', error: `${provider.name} API 错误 (${response.status}): ${errorText}` };
    return;
  }

  if (!response.body) {
    yield { type: 'error', error: '响应体为空' };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const accumulatedToolCalls: Map<number, { name: string; arguments: string }> = new Map();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          const choice = (parsed.choices as Array<Record<string, unknown>>)?.[0];
          if (!choice) continue;

          const delta = choice.delta as Record<string, unknown> | undefined;
          const finishReason = choice.finish_reason as string | undefined;

          // Tool calls in delta
          if (delta?.tool_calls) {
            for (const tc of (delta.tool_calls as Array<Record<string, unknown>>)) {
              const idx = tc.index as number;
              const fn = tc.function as Record<string, string> | undefined;
              if (!accumulatedToolCalls.has(idx)) {
                accumulatedToolCalls.set(idx, { name: fn?.name || '', arguments: fn?.arguments || '' });
                if (fn?.name) {
                  yield { type: 'tool_call', toolCall: { name: fn.name, arguments: '' } };
                }
              } else if (fn?.arguments) {
                const existing = accumulatedToolCalls.get(idx)!;
                existing.arguments += fn.arguments;
              }
            }
          }

          // Text content
          if (delta?.content) {
            yield { type: 'token', content: delta.content as string };
          }

          // Finish
          if (finishReason) {
            yield {
              type: 'done',
              usage: parsed.usage as { promptTokens: number; completionTokens: number } | undefined,
            };
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }

    // Drain remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
        try {
          const parsed = JSON.parse(trimmed.slice(6));
          const delta = (parsed.choices as Array<Record<string, unknown>>)?.[0]?.delta as Record<string, unknown> | undefined;
          if (delta?.content) {
            yield { type: 'token', content: delta.content as string };
          }
        } catch { /* ignore */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
