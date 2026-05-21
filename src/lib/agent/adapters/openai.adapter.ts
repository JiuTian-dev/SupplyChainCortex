import type { ProviderAdapter, StreamOpts, ToolStreamOpts, TokenChunk, ToolCallChunk, Classification } from '../adapter';
import type { ChatMessage } from '@/lib/services/ai-providers.service';
import type { MCPTool } from '@/lib/mcp/tools';
import type { ToolCall } from '../fsm-types';
import { TOOL_DISPLAY_NAMES } from '../fsm-types';

export class OpenAIAdapter implements ProviderAdapter {
  readonly providerId = 'openai';
  readonly defaultModel = 'gpt-4o';

  private model: string;

  constructor(model?: string) {
    this.model = model || this.defaultModel;
  }

  normalizeMessages(messages: ChatMessage[]): unknown[] {
    return messages.map(m => ({
      role: m.role,
      content: m.content || '',
      ...(m.name ? { name: m.name } : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    }));
  }

  normalizeTools(tools: MCPTool[]): unknown[] {
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  async *streamText(
    messages: ChatMessage[],
    opts: StreamOpts,
  ): AsyncGenerator<TokenChunk> {
    const apiKey = opts.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: this.normalizeMessages(messages),
        max_tokens: opts.maxTokens || 4000,
        temperature: opts.temperature ?? 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      yield { type: 'error', error: `OpenAI API error: ${response.status}` };
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
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') { yield { type: 'done' }; return; }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield { type: 'token', content };
        } catch { /* skip */ }
      }
    }
    yield { type: 'done' };
  }

  async *streamWithTools(
    messages: ChatMessage[],
    opts: ToolStreamOpts,
  ): AsyncGenerator<ToolCallChunk> {
    const apiKey = opts.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: this.normalizeMessages(messages),
        tools: this.normalizeTools(opts.tools),
        tool_choice: 'auto',
        max_tokens: opts.maxTokens || 4000,
        temperature: opts.temperature ?? 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      yield { type: 'error', error: `OpenAI API error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) { yield { type: 'error', error: 'No response body' }; return; }

    const decoder = new TextDecoder();
    let buffer = '';
    const accumulatedToolCalls: Array<{ index: number; id: string; function: { name: string; arguments: string } }> = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) yield { type: 'token', content: delta.content };
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? accumulatedToolCalls.length;
              if (!accumulatedToolCalls[index]) {
                accumulatedToolCalls[index] = { index, id: tc.id || `call_${index}`, function: { name: '', arguments: '' } };
              }
              if (tc.function?.name) accumulatedToolCalls[index].function.name += tc.function.name;
              if (tc.function?.arguments) accumulatedToolCalls[index].function.arguments += tc.function.arguments;
            }
          }
        } catch { /* skip */ }
      }
    }

    for (const tc of accumulatedToolCalls) {
      if (tc.function.name) {
        yield { type: 'tool_call', toolCall: { name: tc.function.name, arguments: tc.function.arguments } };
      }
    }
    yield { type: 'done' };
  }

  async callWithTools(
    messages: ChatMessage[],
    tools: MCPTool[],
    opts?: StreamOpts,
  ): Promise<{ toolCalls: ToolCall[]; content: string }> {
    const apiKey = opts?.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) return { toolCalls: [], content: '' };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: this.normalizeMessages(messages),
        tools: this.normalizeTools(tools),
        tool_choice: 'auto',
        max_tokens: 2000,
        temperature: 0.3,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenAI API error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { tool_calls?: unknown[]; content?: string } }> };
    const msg = data.choices?.[0]?.message;
    const content = msg?.content || '';
    const rawCalls = (msg?.tool_calls as unknown[]) || [];

    return {
      toolCalls: this.parseToolCalls(content, rawCalls),
      content,
    };
  }

  async classify(query: string, systemPrompt: string, opts?: StreamOpts): Promise<Classification> {
    const apiKey = opts?.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) return { intent: 'supply_chain_knowledge', confidence: 0.4, reason: 'no API key' };

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query },
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: this.normalizeMessages(messages),
        max_tokens: 100,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) return { intent: 'supply_chain_knowledge', confidence: 0.4, reason: 'API error' };

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    try {
      const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
      return {
        intent: parsed.intent || 'supply_chain_knowledge',
        confidence: parsed.confidence || 0.7,
        reason: parsed.reason || 'OpenAI classified',
      };
    } catch {
      return { intent: 'supply_chain_knowledge', confidence: 0.5, reason: 'parse error' };
    }
  }

  parseToolCalls(_rawContent: string, structured: unknown[]): ToolCall[] {
    const calls: ToolCall[] = [];
    for (const raw of structured) {
      const tc = raw as { function?: { name?: string; arguments?: string } };
      if (tc?.function?.name) {
        try {
          calls.push({
            name: tc.function.name,
            params: JSON.parse(tc.function.arguments || '{}'),
            displayName: TOOL_DISPLAY_NAMES[tc.function.name] || tc.function.name,
          });
        } catch { /* skip */ }
      }
    }
    return calls;
  }

  resolveApiKey(explicitKey?: string): string | undefined {
    return explicitKey || process.env.OPENAI_API_KEY;
  }

  resolveModel(explicitModel?: string): string {
    return explicitModel || this.model;
  }
}
