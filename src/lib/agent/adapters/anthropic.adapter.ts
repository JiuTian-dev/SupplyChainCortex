import type { ProviderAdapter, StreamOpts, ToolStreamOpts, TokenChunk, ToolCallChunk, Classification } from '../adapter';
import type { ChatMessage } from '@/lib/services/ai-providers.service';
import type { MCPTool } from '@/lib/mcp/tools';
import type { ToolCall } from '../fsm-types';
import { TOOL_DISPLAY_NAMES } from '../fsm-types';

export class AnthropicAdapter implements ProviderAdapter {
  readonly providerId = 'anthropic';
  readonly defaultModel = 'claude-sonnet-4-6';

  private model: string;

  constructor(model?: string) {
    this.model = model || this.defaultModel;
  }

  private normalizeAnthropicMessages(messages: ChatMessage[]): {
    system?: string;
    messages: Array<{ role: string; content: unknown[] }>;
  } {
    const systemMessages = messages.filter(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const result: { system?: string; messages: Array<{ role: string; content: unknown[] }> } = {
      messages: [],
    };

    if (systemMessages.length > 0) {
      result.system = systemMessages.map(m => m.content).join('\n\n');
    }

    for (const m of conversationMessages) {
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      result.messages.push({
        role,
        content: [{ type: 'text', text: m.content || '' }],
      });
    }

    return result;
  }

  normalizeMessages(messages: ChatMessage[]): unknown[] {
    return this.normalizeAnthropicMessages(messages) as unknown as unknown[];
  }

  normalizeTools(tools: MCPTool[]): unknown[] {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object' as const,
        properties: Object.fromEntries(
          Object.entries(t.parameters.properties).map(([key, param]) => [
            key,
            { type: param.type, description: param.description },
          ]),
        ),
        required: t.parameters.required || [],
      },
    }));
  }

  async *streamText(
    messages: ChatMessage[],
    opts: StreamOpts,
  ): AsyncGenerator<TokenChunk> {
    const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const normalized = this.normalizeAnthropicMessages(messages);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        system: normalized.system,
        messages: normalized.messages,
        max_tokens: opts.maxTokens || 4000,
        stream: true,
      }),
    });

    if (!response.ok) {
      yield { type: 'error', error: `Anthropic API error: ${response.status}` };
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
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield { type: 'token', content: parsed.delta.text };
          }
          if (parsed.type === 'message_stop') {
            yield { type: 'done' };
            return;
          }
        } catch { /* skip */ }
      }
    }
    yield { type: 'done' };
  }

  async *streamWithTools(
    messages: ChatMessage[],
    opts: ToolStreamOpts,
  ): AsyncGenerator<ToolCallChunk> {
    const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const normalized = this.normalizeAnthropicMessages(messages);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        system: normalized.system,
        messages: normalized.messages,
        tools: this.normalizeTools(opts.tools),
        max_tokens: opts.maxTokens || 4000,
        stream: true,
      }),
    });

    if (!response.ok) {
      yield { type: 'error', error: `Anthropic API error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) { yield { type: 'error', error: 'No response body' }; return; }

    const decoder = new TextDecoder();
    let buffer = '';
    const toolUses: Array<{ id: string; name: string; input: string }> = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield { type: 'token', content: parsed.delta.text };
          }
          if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
            toolUses.push({ id: parsed.content_block.id, name: parsed.content_block.name, input: '' });
          }
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
            const last = toolUses[toolUses.length - 1];
            if (last) last.input += parsed.delta.partial_json;
          }
          if (parsed.type === 'message_stop') break;
        } catch { /* skip */ }
      }
    }

    for (const tu of toolUses) {
      yield { type: 'tool_call', toolCall: { name: tu.name, arguments: tu.input } };
    }
    yield { type: 'done' };
  }

  async callWithTools(
    messages: ChatMessage[],
    tools: MCPTool[],
    opts?: StreamOpts,
  ): Promise<{ toolCalls: ToolCall[]; content: string }> {
    const apiKey = opts?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { toolCalls: [], content: '' };

    const normalized = this.normalizeMessages(messages) as unknown as {
      system?: string;
      messages: Array<{ role: string; content: unknown[] }>;
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        system: normalized.system,
        messages: normalized.messages,
        tools: this.normalizeTools(tools),
        max_tokens: 2000,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json() as {
      content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
      stop_reason?: string;
    };

    const textBlock = (data.content || []).find(c => c.type === 'text');
    const toolBlocks = (data.content || []).filter(c => c.type === 'tool_use');

    const content = textBlock?.text || '';

    return {
      toolCalls: toolBlocks.map(tu => ({
        name: tu.name || '',
        params: (tu.input || {}) as Record<string, unknown>,
        displayName: TOOL_DISPLAY_NAMES[tu.name || ''] || tu.name || '',
      })),
      content,
    };
  }

  async classify(query: string, systemPrompt: string, opts?: StreamOpts): Promise<Classification> {
    const apiKey = opts?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { intent: 'supply_chain_knowledge', confidence: 0.4, reason: 'no API key' };

    const normalized = this.normalizeAnthropicMessages([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query },
    ]);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        system: normalized.system,
        messages: normalized.messages,
        max_tokens: 200,
      }),
    });

    if (!response.ok) return { intent: 'supply_chain_knowledge', confidence: 0.4, reason: 'API error' };

    const data = await response.json() as { content?: Array<{ text?: string }> };
    const raw = data.content?.[0]?.text || '';
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          intent: parsed.intent || 'supply_chain_knowledge',
          confidence: parsed.confidence || 0.7,
          reason: parsed.reason || 'Anthropic classified',
        };
      }
    } catch { /* fall through */ }
    return { intent: 'supply_chain_knowledge', confidence: 0.5, reason: 'parse error' };
  }

  parseToolCalls(_rawContent: string, structured: unknown[]): ToolCall[] {
    const calls: ToolCall[] = [];
    for (const raw of structured) {
      const tu = raw as { name?: string; input?: string | Record<string, unknown> };
      if (tu?.name) {
        try {
          const params = typeof tu.input === 'string' ? JSON.parse(tu.input) : (tu.input || {});
          calls.push({
            name: tu.name,
            params,
            displayName: TOOL_DISPLAY_NAMES[tu.name] || tu.name,
          });
        } catch { /* skip */ }
      }
    }
    return calls;
  }

  resolveApiKey(explicitKey?: string): string | undefined {
    return explicitKey || process.env.ANTHROPIC_API_KEY;
  }

  resolveModel(explicitModel?: string): string {
    return explicitModel || this.model;
  }
}
