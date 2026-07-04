/**
 * Sensitivity Analysis — Oster (2019) Coefficient Stability Test
 *
 * Tests cover:
 *   - Oster (2019) paper example values
 *   - δ=1 boundary case
 *   - R²_max default (1.3 × R²_controlled)
 *   - Robustness assessment thresholds
 *   - Identified set computation
 *   - Extreme values (β=0, R²=1, β*=β̂, R²_long=R²_short, R²_max=R²_long)
 *   - Negative coefficients
 *   - Bias ratio computation
 *   - Custom δ and R²_max parameters
 */

import { describe, it, expect } from 'vitest';
import {
  osterSensitivityTest,
  computeIdentifiedSet,
  computeDelta,
  computeBetaMax,
  assessRobustness,
  type OsterParams,
} from './sensitivity-analysis';

// ─── Reference values (hand-computed) ──────────────────────────────────────
//
// Example: β*=0.5, β̂=0.3, R²_short=0.1, R²_long=0.3, R²_max=1.3×0.3=0.39
//   k = (R²_max − R²_long) / (R²_long − R²_short) = 0.09 / 0.2 = 0.45
//   β_max(δ=1) = β̂ − (β* − β̂) × k = 0.3 − 0.2 × 0.45 = 0.3 − 0.09 = 0.21
//   δ(to zero) = β̂ × (R²_long − R²_short) / [(β* − β̂) × (R²_max − R²_long)]
//              = 0.3 × 0.2 / (0.2 × 0.09) = 0.06 / 0.018 ≈ 3.3333
//   biasRatio = |β̂ − β*| / |β_max − β̂| = 0.2 / 0.09 ≈ 2.2222
//   identifiedSet = [0.21, 0.3]
// ───────────────────────────────────────────────────────────────────────────

describe('Oster (2019) Coefficient Stability Test', () => {
  // ─── osterSensitivityTest: main function ────────────────────────────────

  describe('osterSensitivityTest', () => {
    it('should detect robust result when δ > 1 (Oster-style example)', () => {
      const result = osterSensitivityTest({
        betaUncontrolled: 0.5,
        betaControlled: 0.3,
        rSquaredUncontrolled: 0.1,
        rSquaredControlled: 0.3,
      });

      expect(result.delta).toBeCloseTo(3.3333, 3);
      expect(result.betaMax).toBeCloseTo(0.21, 4);
      expect(result.isRobust).toBe(true);
      expect(result.recommendation).toBe('robust');
      expect(result.identifiedSet[0]).toBeCloseTo(0.21, 4);
      expect(result.identifiedSet[1]).toBeCloseTo(0.3, 4);
      expect(result.biasRatio).toBeCloseTo(2.2222, 3);
    });

    it('should detect sensitive result when δ < 0.5', () => {
      // β*=0.5, β̂=0.45, R²_short=0.01, R²_long=0.3, R²_max=0.39
      // δ = 0.45 × 0.29 / (0.05 × 0.09) = 0.1305 / 0.0045 = 29 → robust
      // Need a case where δ is small: large coefficient movement, small R² gain
      // β*=0.5, β̂=0.1, R²_short=0.25, R²_long=0.26, R²_max=0.338
      // δ = 0.1 × 0.01 / (0.4 × 0.078) = 0.001 / 0.0312 ≈ 0.032 → sensitive
      const result = osterSensitivityTest({
        betaUncontrolled: 0.5,
        betaControlled: 0.1,
        rSquaredUncontrolled: 0.25,
        rSquaredControlled: 0.26,
      });

      expect(Math.abs(result.delta)).toBeLessThan(0.5);
      expect(result.recommendation).toBe('sensitive');
      expect(result.isRobust).toBe(false);
    });

    it('should detect marginal result when 0.5 ≤ δ ≤ 1', () => {
      // Construct a case where δ ≈ 0.75
      // δ = β̂ × (R²_long − R²_short) / [(β* − β̂) × (R²_max − R²_long)]
      // 0.75 = 0.3 × 0.1 / (0.1 × x) → x = 0.03 / 0.075 = 0.4
      // R²_max − R²_long = 0.4 → R²_max = 0.5, R²_long = 0.1
      // But R²_max default = 1.3 × 0.1 = 0.13, so we need to set R²_max explicitly
      const result = osterSensitivityTest({
        betaUncontrolled: 0.4,
        betaControlled: 0.3,
        rSquaredUncontrolled: 0.0,
        rSquaredControlled: 0.1,
        rSquaredMax: 0.5,
      });

      // δ = 0.3 × 0.1 / (0.1 × 0.4) = 0.03 / 0.04 = 0.75
      expect(result.delta).toBeCloseTo(0.75, 4);
      expect(result.recommendation).toBe('marginal');
      expect(result.isRobust).toBe(false);
    });

    it('should use default R²_max = 1.3 × R²_controlled when not provided', () => {
      const withDefault = osterSensitivityTest({
        betaUncontrolled: 0.5,
        betaControlled: 0.3,
        rSquaredUncontrolled: 0.1,
        rSquaredControlled: 0.3,
      });

      const explicit = osterSensitivityTest({
        betaUncontrolled: 0.5,
        betaControlled: 0.3,
        rSquaredUncontrolled: 0.1,
        rSquaredControlled: 0.3,
        rSquaredMax: 1.3 * 0.3,
      });

      expect(withDefault.delta).toBeCloseTo(explicit.delta, 10);
      expect(withDefault.betaMax).toBeCloseTo(explicit.betaMax, 10);
      expect(withDefault.identifiedSet).toEqual(explicit.identifiedSet);
    });

    it('should use default δ=1 for β_max computation when not provided', () => {
      const result = osterSensitivityTest({
        betaUncontrolled: 0.5,
        betaControlled: 0.3,
        rSquaredUncontrolled: 0.1,
        rSquaredControlled: 0.3,
      });

      // With δ=1: β_max = 0.3 − (0.5−0.3) × (0.39−0.3)/(0.3−0.1) = 0.3 − 0.09 = 0.21
      expect(result.betaMax).toBeCloseTo(0.21, 4);
    });

    it('should respect custom δ for β_max computation', () => {
      const result = osterSensitivityTest({
        betaUncontrolled: 0.5,
        betaControlled: 0.3,
        rSquaredUncontrolled: 0.1,
        rSquaredControlled: 0.3,
        delta: 2,
      });

      // β_max(δ=2) = 0.3 − 2 × (0.5−0.3) × (0.39−0.3)/(0.3−0.1)
      //            = 0.3 − 2 × 0.2 × 0.45 = 0.3 − 0.18 = 0.12
      expect(result.betaMax).toBeCloseTo(0.12, 4);
      // δ (to zero) is independent of the δ assumption for β_max
      expect(result.delta).toBeCloseTo(3.3333, 3);
    });
  });

  // ─── computeDelta ───────────────────────────────────────────────────────

  describe('computeDelta', () => {
    it('should compute δ correctly for the Oster-style example', () => {
      const delta = computeDelta(0.5, 0.3, 0.1, 0.3, 0.39);
      expect(delta).toBeCloseTo(3.3333, 3);
    });

    it('should return 0 when β̂ is already zero', () => {
      const delta = computeDelta(0.5, 0, 0.1, 0.3, 0.39);
      expect(delta).toBe(0);
    });

    it('should return Infinity when β* = β̂ (coefficient did not move)', () => {
      const delta = computeDelta(0.3, 0.3, 0.1, 0.3, 0.39);
      expect(delta).toBe(Infinity);
    });

    it('should return Infinity when R²_max = R²_controlled (no room for unobservables)', () => {
      const delta = computeDelta(0.5, 0.3, 0.1, 0.3, 0.3);
      expect(delta).toBe(Infinity);
    });

    it('should return 0 when R²_controlled = R²_uncontrolled (controls add nothing)', () => {
      const delta = computeDelta(0.5, 0.3, 0.2, 0.2, 0.39);
      expect(delta).toBe(0);
    });

    it('should handle negative coefficients', () => {
      // β* = −0.5, β̂ = −0.3 (controls reduce magnitude, same sign)
      // δ = (−0.3) × (0.3−0.1) / [(−0.5 − (−0.3)) × (0.39−0.3)]
      //   = (−0.3) × 0.2 / [(−0.2) × 0.09] = −0.06 / −0.018 ≈ 3.3333
      const delta = computeDelta(-0.5, -0.3, 0.1, 0.3, 0.39);
      expect(delta).toBeCloseTo(3.3333, 3);
    });
  });

  // ─── computeBetaMax ─────────────────────────────────────────────────────

  describe('computeBetaMax', () => {
    it('should compute β_max correctly under δ=1', () => {
      const betaMax = computeBetaMax(0.5, 0.3, 0.39, 0.3, 0.1);
      expect(betaMax).toBeCloseTo(0.21, 4);
    });

    it('should return β̂ when R²_controlled = R²_uncontrolled', () => {
      const betaMax = computeBetaMax(0.5, 0.3, 0.39, 0.2, 0.2);
      expect(betaMax).toBeCloseTo(0.3, 6);
    });

    it('should return β̂ when R²_max = R²_controlled', () => {
      const betaMax = computeBetaMax(0.5, 0.3, 0.3, 0.3, 0.1);
      expect(betaMax).toBeCloseTo(0.3, 6);
    });
  });

  // ─── computeIdentifiedSet ───────────────────────────────────────────────

  describe('computeIdentifiedSet', () => {
    it('should return sorted [min, max] identified set', () => {
      // β̂=0.3, β_max=0.21 → set = [0.21, 0.3]
      const set = computeIdentifiedSet(0.5, 0.3, 0.39, 0.3, 0.1);
      expect(set).toHaveLength(2);
      expect(set[0]).toBeLessThanOrEqual(set[1]);
      expect(set[0]).toBeCloseTo(0.21, 4);
      expect(set[1]).toBeCloseTo(0.3, 4);
    });

    it('should handle case where β_max > β̂ (controls increased coefficient)', () => {
      // β*=0.1, β̂=0.3 (controls increased the coefficient — suppression effect)
      // β_max = 0.3 − (0.1−0.3) × (0.39−0.3)/(0.3−0.1)
      //       = 0.3 − (−0.2) × 0.45 = 0.3 + 0.09 = 0.39
      const set = computeIdentifiedSet(0.1, 0.3, 0.39, 0.3, 0.1);
      expect(set[0]).toBeCloseTo(0.3, 4);
      expect(set[1]).toBeCloseTo(0.39, 4);
    });

    it('should always return set with lower ≤ upper', () => {
      // Test with various parameter combinations
      const cases: Array<[number, number, number, number, number]> = [
        [0.5, 0.3, 0.1, 0.3, 0.39],
        [0.3, 0.5, 0.1, 0.3, 0.39],
        [-0.5, -0.3, 0.1, 0.3, 0.39],
        [0.1, 0.3, 0.1, 0.3, 0.39],
      ];
      for (const [bStar, bHat, rShort, rLong, rMax] of cases) {
        const set = computeIdentifiedSet(bStar, bHat, rMax, rLong, rShort);
        expect(set[0]).toBeLessThanOrEqual(set[1]);
      }
    });
  });

  // ─── assessRobustness ───────────────────────────────────────────────────

  describe('assessRobustness', () => {
    it('should classify δ > 1 as robust', () => {
      expect(assessRobustness(1.5)).toBe('robust');
      expect(assessRobustness(3.33)).toBe('robust');
      expect(assessRobustness(Infinity)).toBe('robust');
    });

    it('should classify 0.5 ≤ |δ| ≤ 1 as marginal', () => {
      expect(assessRobustness(0.5)).toBe('marginal');
      expect(assessRobustness(0.75)).toBe('marginal');
      expect(assessRobustness(1.0)).toBe('marginal');
    });

    it('should classify |δ| < 0.5 as sensitive', () => {
      expect(assessRobustness(0.49)).toBe('sensitive');
      expect(assessRobustness(0.1)).toBe('sensitive');
      expect(assessRobustness(0)).toBe('sensitive');
    });

    it('should use absolute value for negative δ', () => {
      expect(assessRobustness(-2)).toBe('robust');
      expect(assessRobustness(-0.75)).toBe('marginal');
      expect(assessRobustness(-0.3)).toBe('sensitive');
    });
  });

  // ─── Edge cases and extreme values ──────────────────────────────────────

  describe('edge cases', () => {
    it('should handle R²_controlled = 1 (perfect fit, R²_max capped)', () => {
      // R²_long = 1.0, R²_max = 1.3 × 1.0 = 1.3 (but R² cannot exceed 1)
      // With R²_max = 1.3 > 1, the formula still works mathematically
      const result = osterSensitivityTest({
        betaUncontrolled: 0.5,
        betaControlled: 0.3,
        rSquaredUncontrolled: 0.8,
        rSquaredControlled: 1.0,
        rSquaredMax: 1.0, // cap at 1.0 since R² cannot exceed 1
      });

      // R²_max = R²_controlled → no room for unobservables → δ = Infinity
      expect(result.delta).toBe(Infinity);
      expect(result.isRobust).toBe(true);
      expect(result.recommendation).toBe('robust');
    });

    it('should handle β̂ = 0 (controlled estimate already zero)', () => {
      const result = osterSensitivityTest({
        betaUncontrolled: 0.5,
        betaControlled: 0,
        rSquaredUncontrolled: 0.1,
        rSquaredControlled: 0.3,
      });

      expect(result.delta).toBe(0);
      expect(result.isRobust).toBe(false);
      expect(result.recommendation).toBe('sensitive');
    });

    it('should handle β* = β̂ (coefficient did not move with controls)', () => {
      const result = osterSensitivityTest({
        betaUncontrolled: 0.3,
        betaControlled: 0.3,
        rSquaredUncontrolled: 0.1,
        rSquaredControlled: 0.3,
      });

      // δ = Infinity (robust by definition, but controls had no effect on β)
      expect(result.delta).toBe(Infinity);
      expect(result.isRobust).toBe(true);
      // β_max = β̂ (no movement to adjust)
      expect(result.betaMax).toBeCloseTo(0.3, 6);
      // biasRatio = 0 / 0 → Infinity (no bias to explain)
      expect(result.biasRatio).toBe(Infinity);
    });

    it('should handle all-zero inputs gracefully', () => {
      const result = osterSensitivityTest({
        betaUncontrolled: 0,
        betaControlled: 0,
        rSquaredUncontrolled: 0,
        rSquaredControlled: 0,
      });

      // β̂ = 0 → δ = 0
      expect(result.delta).toBe(0);
      expect(result.isRobust).toBe(false);
    });

    it('should compute correct biasRatio for the Oster example', () => {
      const result = osterSensitivityTest({
        betaUncontrolled: 0.5,
        betaControlled: 0.3,
        rSquaredUncontrolled: 0.1,
        rSquaredControlled: 0.3,
      });

      // biasRatio = |0.3 − 0.5| / |0.21 − 0.3| = 0.2 / 0.09 ≈ 2.2222
      expect(result.biasRatio).toBeCloseTo(2.2222, 3);
    });

    it('should produce identified set that always contains β̂', () => {
      const params: OsterParams = {
        betaUncontrolled: 0.5,
        betaControlled: 0.3,
        rSquaredUncontrolled: 0.1,
        rSquaredControlled: 0.3,
      };
      const result = osterSensitivityTest(params);

      // β̂ = 0.3 should be one of the endpoints
      expect(
        Math.abs(result.identifiedSet[0] - 0.3) < 1e-6 ||
        Math.abs(result.identifiedSet[1] - 0.3) < 1e-6,
      ).toBe(true);
    });

    it('should handle large R²_max (very conservative assumption)', () => {
      // R²_max = 1.0 (maximum possible R²)
      const result = osterSensitivityTest({
        betaUncontrolled: 0.5,
        betaControlled: 0.3,
        rSquaredUncontrolled: 0.1,
        rSquaredControlled: 0.3,
        rSquaredMax: 1.0,
      });

      // δ = 0.3 × 0.2 / (0.2 × 0.7) = 0.06 / 0.14 ≈ 0.4286 → sensitive
      expect(result.delta).toBeCloseTo(0.4286, 3);
      expect(result.recommendation).toBe('sensitive');
    });
  });

  // ─── Oster (2019) paper-style scenarios ─────────────────────────────────

  describe('Oster (2019) paper scenarios', () => {
    it('should classify a highly robust estimate (δ >> 1)', () => {
      // Scenario: small coefficient movement, large R² gain from controls
      // β*=0.30, β̂=0.28, R²_short=0.05, R²_long=0.50, R²_max=0.65
      // δ = 0.28 × 0.45 / (0.02 × 0.15) = 0.126 / 0.003 = 42
      const result = osterSensitivityTest({
        betaUncontrolled: 0.30,
        betaControlled: 0.28,
        rSquaredUncontrolled: 0.05,
        rSquaredControlled: 0.50,
        rSquaredMax: 0.65,
      });

      expect(result.delta).toBeGreaterThan(10);
      expect(result.isRobust).toBe(true);
      expect(result.recommendation).toBe('robust');
    });

    it('should classify a fragile estimate (δ << 1)', () => {
      // Scenario: large coefficient movement, small R² gain
      // β*=0.50, β̂=0.10, R²_short=0.20, R²_long=0.22, R²_max=0.286
      // δ = 0.10 × 0.02 / (0.40 × 0.066) = 0.002 / 0.0264 ≈ 0.0758
      const result = osterSensitivityTest({
        betaUncontrolled: 0.50,
        betaControlled: 0.10,
        rSquaredUncontrolled: 0.20,
        rSquaredControlled: 0.22,
      });

      expect(result.delta).toBeLessThan(0.5);
      expect(result.isRobust).toBe(false);
      expect(result.recommendation).toBe('sensitive');
    });

    it('should verify identified set excludes zero for robust estimates', () => {
      // For a robust estimate, zero should NOT be in the identified set
      const result = osterSensitivityTest({
        betaUncontrolled: 0.5,
        betaControlled: 0.3,
        rSquaredUncontrolled: 0.1,
        rSquaredControlled: 0.3,
      });

      const [lower, upper] = result.identifiedSet;
      // Zero should be outside [lower, upper]
      const zeroOutside = lower > 0 || upper < 0;
      expect(zeroOutside).toBe(true);
    });

    it('should verify identified set includes zero for sensitive estimates', () => {
      // For a sensitive estimate, zero may be in or near the identified set
      const result = osterSensitivityTest({
        betaUncontrolled: 0.5,
        betaControlled: 0.1,
        rSquaredUncontrolled: 0.25,
        rSquaredControlled: 0.26,
      });

      // β_max = 0.1 − (0.5−0.1) × (0.338−0.26)/(0.26−0.25)
      //       = 0.1 − 0.4 × 7.8 = 0.1 − 3.12 = −3.02
      // identified set = [−3.02, 0.1] → includes zero
      const [lower, upper] = result.identifiedSet;
      const zeroInside = lower <= 0 && upper >= 0;
      expect(zeroInside).toBe(true);
    });
  });
});
