import { describe, it, expect } from 'vitest';
import { buildClassificationPrompt, parseClassificationResponse } from './router';
import type { Classification } from './adapter';

describe('buildClassificationPrompt', () => {
  it('generates a prompt containing all intents', () => {
    const prompt = buildClassificationPrompt();
    expect(prompt).toContain('supply_chain_data');
    expect(prompt).toContain('supply_chain_knowledge');
    expect(prompt).toContain('news_event');
    expect(prompt).toContain('general_knowledge');
    expect(prompt).toContain('opinion_recommendation');
    expect(prompt).toContain('chat_greeting');
  });

  it('prompt asks for JSON output', () => {
    const prompt = buildClassificationPrompt();
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('intent');
    expect(prompt).toContain('confidence');
  });
});

describe('parseClassificationResponse', () => {
  it('parses valid JSON classification', () => {
    const raw = '{"intent":"supply_chain_data","confidence":0.9,"reason":"user asked about inventory"}';
    const result = parseClassificationResponse(raw);
    expect(result.intent).toBe('supply_chain_data');
    expect(result.confidence).toBe(0.9);
    expect(result.reason).toBe('user asked about inventory');
  });

  it('falls back to default on invalid JSON', () => {
    const result = parseClassificationResponse('not json');
    expect(result.intent).toBe('supply_chain_knowledge');
    expect(result.confidence).toBe(0.5);
    expect(result.reason).toContain('parse failed');
  });

  it('falls back when intent is not a valid value', () => {
    const raw = '{"intent":"invalid_intent","confidence":0.8,"reason":"test"}';
    const result = parseClassificationResponse(raw);
    expect(result.intent).toBe('supply_chain_knowledge');
  });

  it('clamps confidence to 0-1 range', () => {
    const over = parseClassificationResponse('{"intent":"supply_chain_data","confidence":1.5,"reason":"test"}');
    const under = parseClassificationResponse('{"intent":"supply_chain_data","confidence":-0.5,"reason":"test"}');
    expect(over.confidence).toBe(1);
    expect(under.confidence).toBe(0);
  });

  it('handles missing confidence field gracefully', () => {
    const raw = '{"intent":"chat_greeting","reason":"friendly hello"}';
    const result = parseClassificationResponse(raw);
    expect(result.intent).toBe('chat_greeting');
    expect(result.confidence).toBe(0.5);
  });
});
