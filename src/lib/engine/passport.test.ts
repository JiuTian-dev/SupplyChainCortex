/**
 * Unit tests for DecisionPassport factory.
 */

import { describe, it, expect } from 'vitest';
import {
  createPassport,
  provenanceEntry,
  degradedProvenance,
  unavailableProvenance,
  computeConfidence,
  serializeForFrontend,
} from './passport';

describe('createPassport', () => {
  it('generates a valid passport with all required fields', () => {
    const passport = createPassport({
      engine: 'cascade-risk',
      input: { scenario: 'auto' },
      confidence: 0.85,
      alternatives: [
        { action: 'Switch supplier', expectedImpact: 'Save ¥5,000/mo', confidence: 0.8, tradeoffs: ['Transition time'] },
      ],
      provenance: [
        provenanceEntry('weather:open-meteo', 120),
        provenanceEntry('fx:frankfurter', 80),
      ],
      trace: {
        totalDurationMs: 250,
        steps: [{ name: 'propagation', durationMs: 200, status: 'ok' }],
      },
      warnings: [],
    });

    expect(passport.auditId).toMatch(/^audit-cascade-risk-/);
    expect(passport.engine).toBe('cascade-risk');
    expect(passport.confidence).toBe(0.85);
    expect(passport.ruleVersion).toBeTruthy();
    expect(passport.dataProvenance).toHaveLength(2);
    expect(passport.trace.totalDurationMs).toBe(250);
  });

  it('clamps confidence to [0, 1]', () => {
    const high = createPassport({
      engine: 'tariff', input: {}, confidence: 1.5,
      alternatives: [], provenance: [], trace: { totalDurationMs: 0, steps: [] },
    });
    expect(high.confidence).toBe(1);

    const low = createPassport({
      engine: 'tariff', input: {}, confidence: -0.5,
      alternatives: [], provenance: [], trace: { totalDurationMs: 0, steps: [] },
    });
    expect(low.confidence).toBe(0);
  });

  it('sorts alternatives by confidence descending', () => {
    const passport = createPassport({
      engine: 'decision-graph',
      input: {},
      confidence: 0.7,
      alternatives: [
        { action: 'B', expectedImpact: '', confidence: 0.5, tradeoffs: [] },
        { action: 'A', expectedImpact: '', confidence: 0.9, tradeoffs: [] },
        { action: 'C', expectedImpact: '', confidence: 0.3, tradeoffs: [] },
      ],
      provenance: [],
      trace: { totalDurationMs: 0, steps: [] },
    });
    expect(passport.alternatives[0].action).toBe('A');
    expect(passport.alternatives[2].action).toBe('C');
  });
});

describe('provenanceEntry', () => {
  it('creates an ok entry', () => {
    const entry = provenanceEntry('db:inventory', 45);
    expect(entry.source).toBe('db:inventory');
    expect(entry.latencyMs).toBe(45);
    expect(entry.status).toBe('ok');
  });
});

describe('degradedProvenance', () => {
  it('creates a degraded entry', () => {
    const entry = degradedProvenance('weather:open-meteo', 8000);
    expect(entry.status).toBe('degraded');
  });
});

describe('unavailableProvenance', () => {
  it('creates an unavailable entry', () => {
    const entry = unavailableProvenance('fx:frankfurter');
    expect(entry.status).toBe('unavailable');
    expect(entry.latencyMs).toBe(0);
  });
});

describe('computeConfidence', () => {
  it('returns 1 when all sources are ok', () => {
    const confidence = computeConfidence({
      'weather': [0.3, 'ok'],
      'fx': [0.3, 'ok'],
      'db': [0.4, 'ok'],
    });
    expect(confidence).toBe(1);
  });

  it('returns lower score when sources are degraded', () => {
    const confidence = computeConfidence({
      'weather': [0.5, 'degraded'],
      'db': [0.5, 'ok'],
    });
    expect(confidence).toBe(0.85);
  });

  it('returns significantly lower when critical source is unavailable', () => {
    const confidence = computeConfidence({
      'weather': [0.5, 'unavailable'],
      'db': [0.5, 'ok'],
    });
    expect(confidence).toBe(0.65);
  });

  it('returns 0.5 for empty weights', () => {
    expect(computeConfidence({})).toBe(0.5);
  });
});

describe('serializeForFrontend', () => {
  it('strips internal trace fields and adds UI labels', () => {
    const passport = createPassport({
      engine: 'cascade-risk',
      input: {},
      confidence: 0.92,
      alternatives: [
        { action: 'Alt 1', expectedImpact: 'Save ¥10,000', confidence: 0.9, tradeoffs: [] },
      ],
      provenance: [provenanceEntry('weather', 100)],
      trace: { totalDurationMs: 300, steps: [] },
    });

    const serialized = serializeForFrontend(passport);
    expect(serialized.auditId).toBeTruthy();
    expect(serialized.confidenceLabel).toBe('高');
    expect(serialized.dataProvenance).toHaveLength(1);
    expect(serialized.alternatives).toHaveLength(1);
    expect((serialized as any).trace).toBeUndefined();
  });
});
