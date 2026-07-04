/**
 * OpenTelemetry Tracing — Tests
 */

import { describe, it, expect } from 'vitest';
import {
  SEMCONV,
  startLLMSpan,
  startToolSpan,
  startOrchestrationSpan,
  startRetrievalSpan,
  endSpan,
  endSpanWithError,
  getCurrentTraceId,
  getCurrentSpanId,
} from './otel-tracing';

describe('OTel Tracing', () => {
  describe('SEMCONV constants', () => {
    it('should have GenAI semantic convention keys', () => {
      expect(SEMCONV.GEN_AI_INFERENCE).toBe('gen_ai.client.inference');
      expect(SEMCONV.GEN_AI_TOOL).toBe('gen_ai.client.tool');
      expect(SEMCONV.GEN_AI_RETRIEVALS).toBe('gen_ai.client.retrievals');
      expect(SEMCONV.AGENT_ORCHESTRATION).toBe('agent.orchestration');
    });

    it('should have attribute key constants', () => {
      expect(SEMCONV.PROVIDER).toBe('gen_ai.provider.name');
      expect(SEMCONV.REQUEST_MODEL).toBe('gen_ai.request.model');
      expect(SEMCONV.CONVERSATION_ID).toBe('gen_ai.conversation.id');
      expect(SEMCONV.TOOL_NAME).toBe('gen_ai.tool.name');
      expect(SEMCONV.INTENT).toBe('agent.intent');
      expect(SEMCONV.FSM_STATE).toBe('agent.fsm.state');
    });
  });

  describe('span creation', () => {
    it('should create LLM inference span without throwing', () => {
      const span = startLLMSpan({
        provider: 'deepseek',
        operation: 'chat',
        requestModel: 'deepseek-v4-flash',
        inputTokens: 100,
        outputTokens: 50,
        conversationId: 'conv-123',
      });
      expect(span).toBeDefined();
      endSpan(span);
    });

    it('should create tool execution span without throwing', () => {
      const span = startToolSpan({
        toolName: 'query_inventory',
        toolCallId: 'tc-1',
        conversationId: 'conv-123',
      });
      expect(span).toBeDefined();
      endSpan(span);
    });

    it('should create orchestration span without throwing', () => {
      const span = startOrchestrationSpan({
        intent: 'inventory-health-check',
        fsmState: 'classify',
        confidence: 0.95,
        tier: 1,
        conversationId: 'conv-123',
      });
      expect(span).toBeDefined();
      endSpan(span);
    });

    it('should create retrieval span without throwing', () => {
      const span = startRetrievalSpan({
        query: '库存健康检查',
        source: 'graph-rag',
        resultCount: 5,
        conversationId: 'conv-123',
      });
      expect(span).toBeDefined();
      endSpan(span);
    });

    it('should create spans with minimal attributes', () => {
      const span = startLLMSpan({
        provider: 'openai',
        operation: 'chat',
        requestModel: 'gpt-4o',
      });
      expect(span).toBeDefined();
      endSpan(span);
    });
  });

  describe('span lifecycle', () => {
    it('should end span with error without throwing', () => {
      const span = startToolSpan({ toolName: 'failing_tool' });
      expect(() => endSpanWithError(span, new Error('tool failed'))).not.toThrow();
    });

    it('should end span with string error', () => {
      const span = startToolSpan({ toolName: 'failing_tool' });
      expect(() => endSpanWithError(span, 'something went wrong')).not.toThrow();
    });
  });

  describe('trace ID bridge', () => {
    it('should return undefined when no active span', () => {
      expect(getCurrentTraceId()).toBeUndefined();
      expect(getCurrentSpanId()).toBeUndefined();
    });
  });
});
