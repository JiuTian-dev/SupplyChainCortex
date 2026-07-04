import type { ProviderAdapter, StreamOpts, ToolStreamOpts, TokenChunk, ToolCallChunk, Classification } from '../adapter';
import type { ChatMessage } from '@/lib/services/ai-providers.service';
import type { MCPTool, MCPToolParameter } from '@/lib/mcp/tools';
import type { ToolCall } from '../fsm-types';
import { TOOL_DISPLAY_NAMES } from '../fsm-types';

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';

export class DeepSeekAdapter implements ProviderAdapter {
  readonly providerId = 'deepseek';
  readonly defaultModel = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

  private model: string;

  constructor(model?: string) {
    this.model = model || this.defaultModel;
  }

  // ─── Message Normalization ───────────────────────────────────────────

  normalizeMessages(messages: ChatMessage[]): unknown[] {
    return messages.map(m => {
      const normalized: Record<string, unknown> = { role: m.role, content: m.content || '' };
      if (m.name) normalized.name = m.name;
      if (m.tool_call_id) normalized.tool_call_id = m.tool_call_id;
      return normalized;
    });
  }

  // ─── Tool Normalization (strict mode) ────────────────────────────────

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

  // ─── Streaming (text only) ───────────────────────────────────────────

  async *streamText(
    messages: ChatMessage[],
    opts: StreamOpts,
  ): AsyncGenerator<TokenChunk> {
    const apiKey = this.resolveApiKey(opts.apiKey);
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
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
      yield { type: 'error', error: `DeepSeek API error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) { yield { type: 'error', error: 'No response body' }; return; }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      try {
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
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) yield { type: 'token', content: delta.content };
          } catch { /* skip */ }
        }
      } catch (err) {
        yield { type: 'error', error: `Stream read error: ${(err as Error).message}` };
        return;
      }
    }
    yield { type: 'done' };
  }

  // ─── Streaming (with tool calling) ───────────────────────────────────

  async *streamWithTools(
    messages: ChatMessage[],
    opts: ToolStreamOpts,
  ): AsyncGenerator<ToolCallChunk> {
    const apiKey = this.resolveApiKey(opts.apiKey);
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: this.normalizeMessages(messages),
        tools: this.normalizeTools(opts.tools),
        tool_choice: 'required',
        thinking: { type: 'disabled' },
        max_tokens: opts.maxTokens || 4000,
        temperature: opts.temperature ?? 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      yield { type: 'error', error: `DeepSeek API error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) { yield { type: 'error', error: 'No response body' }; return; }

    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedContent = '';
    const accumulatedToolCalls: Array<{ index: number; id: string; function: { name: string; arguments: string } }> = [];

    while (true) {
      try {
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
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              accumulatedContent += delta.content;
              yield { type: 'token', content: delta.content };
            }
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
      } catch (err) {
        yield { type: 'error', error: `Stream read error: ${(err as Error).message}` };
        return;
      }
    }

    for (const tc of accumulatedToolCalls) {
      if (tc.function.name) {
        yield { type: 'tool_call', toolCall: { name: tc.function.name, arguments: tc.function.arguments } };
      }
    }

    // Text fallback for ~11% leakage
    if (accumulatedToolCalls.length === 0) {
      const textCalls = this.parseToolCalls(accumulatedContent, []);
      for (const tc of textCalls) {
        yield { type: 'tool_call', toolCall: { name: tc.name, arguments: JSON.stringify(tc.params) } };
      }
    }

    yield { type: 'done' };
  }

  // ─── Non-streaming Tool Call ─────────────────────────────────────────

  async callWithTools(
    messages: ChatMessage[],
    tools: MCPTool[],
    opts?: StreamOpts,
  ): Promise<{ toolCalls: ToolCall[]; content: string }> {
    const apiKey = this.resolveApiKey(opts?.apiKey);
    if (!apiKey) return { toolCalls: [], content: '' };

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: this.normalizeMessages(messages),
        tools: this.normalizeTools(tools),
        tool_choice: opts?.toolChoice || 'required',
        thinking: { type: 'disabled' },
        max_tokens: 2000,
        temperature: 0.3,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`DeepSeek API error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { tool_calls?: unknown[]; content?: string } }> };
    const msg = data.choices?.[0]?.message;
    const content = msg?.content || '';
    const rawCalls = (msg?.tool_calls as unknown[]) || [];
    const toolCalls = rawCalls.length > 0
      ? this.parseToolCalls(content, rawCalls)
      : this.parseToolCalls(content, []);

    return { toolCalls, content };
  }

  // ─── Classification ──────────────────────────────────────────────────

  async classify(
    query: string,
    systemPrompt: string,
    opts?: StreamOpts,
  ): Promise<Classification> {
    const apiKey = this.resolveApiKey(opts?.apiKey);
    if (!apiKey) return this.keywordClassify(query);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query },
    ];

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
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

    if (!response.ok) return this.keywordClassify(query);

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content || '';
    try {
      const parsed = JSON.parse(raw);
      return {
        intent: parsed.intent || 'supply_chain_knowledge',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        reason: parsed.reason || 'LLM classified',
      };
    } catch {
      return this.keywordClassify(query);
    }
  }

  private keywordClassify(query: string): Classification {
    const q = query.toLowerCase();
    if (['你好', 'hi', 'hello', '谢谢', '再见', 'bye'].some(w => q.includes(w.toLowerCase()))) {
      return { intent: 'chat_greeting', confidence: 0.6, reason: 'keyword fallback' };
    }
    if (['推荐', '建议', '哪个', '比较好', '你觉得'].some(w => q.includes(w))) {
      return { intent: 'opinion_recommendation', confidence: 0.6, reason: 'keyword fallback' };
    }
    if (['新闻', '最新', '趋势', '走势', '最近', '预测'].some(w => q.includes(w))) {
      return { intent: 'news_event', confidence: 0.6, reason: 'keyword fallback' };
    }
    if (['什么是', '是什么', '为什么', '定义', '含义', '解释', '如何'].some(w => q.includes(w))) {
      return { intent: 'general_knowledge', confidence: 0.5, reason: 'keyword fallback' };
    }
    if (['库存', '成本', '供应商', '关税', '汇率', '铜价'].some(w => q.includes(w))) {
      return { intent: 'supply_chain_data', confidence: 0.6, reason: 'keyword fallback' };
    }
    return { intent: 'supply_chain_knowledge', confidence: 0.5, reason: 'default fallback' };
  }

  // ─── Tool Call Parsing ───────────────────────────────────────────────

  parseToolCalls(rawContent: string, structuredToolCalls: unknown[]): ToolCall[] {
    const calls: ToolCall[] = [];
    for (const raw of structuredToolCalls) {
      const tc = raw as { function?: { name?: string; arguments?: string } };
      if (tc?.function?.name) {
        try {
          const params = JSON.parse(tc.function.arguments || '{}');
          calls.push({
            name: tc.function.name,
            params,
            displayName: TOOL_DISPLAY_NAMES[tc.function.name] || tc.function.name,
          });
        } catch { /* skip */ }
      }
    }
    if (calls.length === 0 && rawContent) {
      return this.parseToolCallsFromText(rawContent);
    }
    return calls;
  }

  /** Exposed for testing */
  parseToolCallsFromRaw(rawContent: string, structured: unknown[]): ToolCall[] {
    return this.parseToolCalls(rawContent, structured);
  }

  private parseToolCallsFromText(text: string): ToolCall[] {
    const results: ToolCall[] = [];
    const regex = /<tool>\s*([\w_]+)\s*<\/tool>\s*<params>\s*(\{[\s\S]*?\})\s*<\/params>/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      try {
        const params = JSON.parse(match[2]);
        results.push({
          name: match[1],
          params,
          displayName: TOOL_DISPLAY_NAMES[match[1]] || match[1],
        });
      } catch { /* skip */ }
    }
    return results;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  resolveApiKey(explicitKey?: string): string | undefined {
    return explicitKey || process.env.DEEPSEEK_API_KEY;
  }

  resolveModel(explicitModel?: string): string {
    return explicitModel || this.model;
  }
}
