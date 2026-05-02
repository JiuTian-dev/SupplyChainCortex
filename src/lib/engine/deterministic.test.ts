/**
 * Unit tests for deterministic simulation engine.
 */

import { describe, it, expect } from 'vitest';
import {
  DeterministicRandom,
  SlidingWindow,
  SimulationContext,
  seedFromString,
  seedFromDate,
} from './deterministic';

// ─── DeterministicRandom ────────────────────────────────────────────────────────

describe('DeterministicRandom', () => {
  it('produces same sequence for same seed', () => {
    const a = new DeterministicRandom(42);
    const b = new DeterministicRandom(42);

    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());

    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new DeterministicRandom(42);
    const b = new DeterministicRandom(99);

    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());

    expect(seqA).not.toEqual(seqB);
  });

  it('next() returns values in [0, 1)', () => {
    const rng = new DeterministicRandom(123);
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt returns values in range', () => {
    const rng = new DeterministicRandom(77);
    for (let i = 0; i < 50; i++) {
      const v = rng.nextInt(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('chance returns boolean matching probability', () => {
    const rng = new DeterministicRandom(1);
    let trueCount = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (rng.chance(0.3)) trueCount++;
    }
    // Should be roughly 300 (± reasonable margin)
    expect(trueCount).toBeGreaterThan(250);
    expect(trueCount).toBeLessThan(350);
  });

  it('reset returns to original state', () => {
    const rng = new DeterministicRandom(42);
    const first = Array.from({ length: 5 }, () => rng.next());
    rng.reset();
    const second = Array.from({ length: 5 }, () => rng.next());
    expect(first).toEqual(second);
  });

  it('clone produces independent copy', () => {
    const rng = new DeterministicRandom(42);
    rng.next(); rng.next(); // consume 2
    const clone = rng.clone();

    // Both should produce same next values
    expect(rng.next()).toBe(clone.next());
  });

  it('pick selects from array', () => {
    const rng = new DeterministicRandom(5);
    const arr = ['a', 'b', 'c', 'd'];
    const picks = Array.from({ length: 20 }, () => rng.pick(arr));
    for (const p of picks) {
      expect(arr).toContain(p);
    }
  });
});

// ─── seedFromString / seedFromDate ──────────────────────────────────────────────

describe('seedFromString', () => {
  it('returns same seed for same string', () => {
    expect(seedFromString('auto')).toBe(seedFromString('auto'));
  });

  it('returns different seeds for different strings', () => {
    expect(seedFromString('auto')).not.toBe(seedFromString('weather_disruption'));
  });
});

describe('seedFromDate', () => {
  it('returns consistent seed for same date', () => {
    const d = new Date('2026-05-02');
    expect(seedFromDate(d)).toBe(seedFromDate(new Date('2026-05-02')));
  });
});

// ─── SlidingWindow ──────────────────────────────────────────────────────────────

describe('SlidingWindow', () => {
  it('records first round always', () => {
    const window = new SlidingWindow<{ a: number }>(10);
    const snap = window.record(0, { a: 100 });
    expect(snap).not.toBeNull();
    expect(snap!.round).toBe(0);
    expect(window.size).toBe(1);
  });

  it('records inflection points only (≥ 5% change)', () => {
    const window = new SlidingWindow<{ price: number }>(10);
    window.record(0, { price: 100 });
    const snap1 = window.record(1, { price: 101 }); // 1% — not recorded
    const snap2 = window.record(2, { price: 107 }); // 7% — recorded
    expect(snap1).toBeNull();
    expect(snap2).not.toBeNull();
    expect(snap2!.inflectionPoints).toContain('price');
  });

  it('caps at maxSize', () => {
    const window = new SlidingWindow<{ x: number }>(3);
    for (let i = 0; i < 10; i++) {
      window.record(i, { x: i * 10 });
    }
    expect(window.size).toBeLessThanOrEqual(3);
  });

  it('reset clears all snapshots', () => {
    const window = new SlidingWindow<{ x: number }>(10);
    window.record(0, { x: 0 });
    window.record(1, { x: 10 });
    window.reset();
    expect(window.size).toBe(0);
    expect(window.getLast()).toBeNull();
  });
});

// ─── SimulationContext ──────────────────────────────────────────────────────────

describe('SimulationContext', () => {
  it('creates reproducible runs with same seed', () => {
    const ctx1 = new SimulationContext({ seed: 100, maxRounds: 10, initialState: {} }, { value: 50 });
    const ctx2 = new SimulationContext({ seed: 100, maxRounds: 10, initialState: {} }, { value: 50 });

    const vals1: number[] = [];
    const vals2: number[] = [];
    for (let i = 0; i < 5; i++) {
      vals1.push(ctx1.rng.next());
      vals2.push(ctx2.rng.next());
    }
    expect(vals1).toEqual(vals2);
  });

  it('tick records inflection points', () => {
    const ctx = new SimulationContext({ seed: 42, maxRounds: 20, initialState: {} }, { price: 100 });
    ctx.tick({ price: 100 });  // round 1, 0% change — skipped
    ctx.tick({ price: 110 });  // round 2, 10% change — recorded
    expect(ctx.window.size).toBe(1); // just the inflection
  });

  it('summarize returns correct metadata', () => {
    const ctx = new SimulationContext({ seed: 'test', maxRounds: 50, initialState: {} }, { x: 0 });
    for (let i = 0; i < 10; i++) {
      ctx.tick({ x: i * 20 });
    }
    const summary = ctx.summarize();
    expect(summary.rounds).toBe(10);
    expect(summary.seed).toBeGreaterThan(0);
  });
});
