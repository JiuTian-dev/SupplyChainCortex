/**
 * OpenTelemetry Tracing — GenAI Semantic Conventions for LLM Agent observability.
 *
 * Aligns with:
 * - OpenTelemetry GenAI Semantic Conventions v1.37+
 * - EU AI Act Article 12 (automatic event recording)
 *
 * Span types:
 * - gen_ai.client.inference  — LLM API calls
 * - gen_ai.client.tool       — MCP tool executions
 * - agent.orchestration      — FSM state transitions
 * - gen_ai.client.retrievals — RAG / knowledge retrieval
 */

import { trace, context, SpanStatusCode, SpanKind, type Span, type Tracer } from '@opentelemetry/api';

// ─── Tracer Provider (lazy init) ───────────────────────────────────────────

let _tracer: Tracer | null = null;

function getTracer(): Tracer {
  if (!_tracer) {
    _tracer = trace.getTracer('supply-chain-cortex', '2.9.3');
  }
  return _tracer;
}

// ─── Semantic Convention Constants ─────────────────────────────────────────

export const SEMCONV = {
  /** LLM inference call */
  GEN_AI_INFERENCE: 'gen_ai.client.inference',
  /** Tool execution */
  GEN_AI_TOOL: 'gen_ai.client.tool',
  /** RAG retrieval */
  GEN_AI_RETRIEVALS: 'gen_ai.client.retrievals',
  /** Agent orchestration (FSM) */
  AGENT_ORCHESTRATION: 'agent.orchestration',

  // Attribute keys
  PROVIDER: 'gen_ai.provider.name',
  OPERATION: 'gen_ai.operation.name',
  REQUEST_MODEL: 'gen_ai.request.model',
  RESPONSE_MODEL: 'gen_ai.response.model',
  INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  CONVERSATION_ID: 'gen_ai.conversation.id',
  TOOL_NAME: 'gen_ai.tool.name',
  TOOL_CALL_ID: 'gen_ai.tool.call.id',
  INTENT: 'agent.intent',
  FSM_STATE: 'agent.fsm.state',
  CONFIDENCE: 'agent.confidence',
  TIER: 'agent.tier',
} as const;

// ─── Span Helpers ──────────────────────────────────────────────────────────

export interface LLMInferenceAttrs {
  provider: string;
  operation: string;
  requestModel: string;
  responseModel?: string;
  inputTokens?: number;
  outputTokens?: number;
  conversationId?: string;
}

/** Start a span for an LLM inference call */
export function startLLMSpan(attrs: LLMInferenceAttrs): Span {
  const span = getTracer().startSpan(SEMCONV.GEN_AI_INFERENCE, {
    kind: SpanKind.CLIENT,
    attributes: {
      [SEMCONV.PROVIDER]: attrs.provider,
      [SEMCONV.OPERATION]: attrs.operation,
      [SEMCONV.REQUEST_MODEL]: attrs.requestModel,
      ...(attrs.responseModel && { [SEMCONV.RESPONSE_MODEL]: attrs.responseModel }),
      ...(attrs.inputTokens != null && { [SEMCONV.INPUT_TOKENS]: attrs.inputTokens }),
      ...(attrs.outputTokens != null && { [SEMCONV.OUTPUT_TOKENS]: attrs.outputTokens }),
      ...(attrs.conversationId && { [SEMCONV.CONVERSATION_ID]: attrs.conversationId }),
    },
  });
  return span;
}

export interface ToolExecutionAttrs {
  toolName: string;
  toolCallId?: string;
  conversationId?: string;
}

/** Start a span for a tool execution */
export function startToolSpan(attrs: ToolExecutionAttrs): Span {
  const span = getTracer().startSpan(SEMCONV.GEN_AI_TOOL, {
    kind: SpanKind.INTERNAL,
    attributes: {
      [SEMCONV.TOOL_NAME]: attrs.toolName,
      ...(attrs.toolCallId && { [SEMCONV.TOOL_CALL_ID]: attrs.toolCallId }),
      ...(attrs.conversationId && { [SEMCONV.CONVERSATION_ID]: attrs.conversationId }),
    },
  });
  return span;
}

export interface OrchestrationAttrs {
  intent: string;
  fsmState: string;
  confidence?: number;
  tier?: number;
  conversationId?: string;
}

/** Start a span for FSM orchestration */
export function startOrchestrationSpan(attrs: OrchestrationAttrs): Span {
  const span = getTracer().startSpan(SEMCONV.AGENT_ORCHESTRATION, {
    kind: SpanKind.INTERNAL,
    attributes: {
      [SEMCONV.INTENT]: attrs.intent,
      [SEMCONV.FSM_STATE]: attrs.fsmState,
      ...(attrs.confidence != null && { [SEMCONV.CONFIDENCE]: attrs.confidence }),
      ...(attrs.tier != null && { [SEMCONV.TIER]: attrs.tier }),
      ...(attrs.conversationId && { [SEMCONV.CONVERSATION_ID]: attrs.conversationId }),
    },
  });
  return span;
}

export interface RetrievalAttrs {
  query: string;
  source: string;
  resultCount?: number;
  conversationId?: string;
}

/** Start a span for RAG retrieval */
export function startRetrievalSpan(attrs: RetrievalAttrs): Span {
  const span = getTracer().startSpan(SEMCONV.GEN_AI_RETRIEVALS, {
    kind: SpanKind.CLIENT,
    attributes: {
      'gen_ai.retrieval.query': attrs.query.slice(0, 200),
      'gen_ai.retrieval.source': attrs.source,
      ...(attrs.resultCount != null && { 'gen_ai.retrieval.result_count': attrs.resultCount }),
      ...(attrs.conversationId && { [SEMCONV.CONVERSATION_ID]: attrs.conversationId }),
    },
  });
  return span;
}

// ─── Span Lifecycle ────────────────────────────────────────────────────────

/** End a span with success */
export function endSpan(span: Span): void {
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/** End a span with error */
export function endSpanWithError(span: Span, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message });
  span.end();
}

/** Run an async function within a span context */
export async function withSpan<T>(span: Span, fn: () => Promise<T>): Promise<T> {
  return context.with(trace.setSpan(context.active(), span), fn);
}

// ─── Trace ID Bridge ───────────────────────────────────────────────────────

/** Get the current OTel trace ID (for linking with auditId) */
export function getCurrentTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  return span?.spanContext()?.traceId;
}

/** Get the current OTel span ID */
export function getCurrentSpanId(): string | undefined {
  const span = trace.getActiveSpan();
  return span?.spanContext()?.spanId;
}
