/**
 * Causal Estimator — DML + PSM Tests
 *
 * Covers:
 * - Method selection (PSM vs DML) with configurable thresholds
 * - DML cross-fitting with adaptive folds, stratified sampling,
 *   variance estimation, and consistency checks
 * - Environment variable configuration (DML_MIN_SAMPLE_SIZE, DML_CROSS_FIT_FOLDS)
 * - PSM fallback and Causal Forest heterogeneous effects
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  selectMethod,
  estimatePSM,
  estimateDML,
  estimateCausalForest,
  estimateCausalEffect,
  getDMLConfig,
  selectAdaptiveFolds,
  stratifiedSplit,
  computeCrossFitVariance,
  checkCrossFitConsistency,
  type CausalSample,
} from './causal-estimator';
import type { InterventionType } from './cascade-risk.types';

// ─── Test Data ─────────────────────────────────────────────────────────────

function generateSamples(n: number, intervention: InterventionType, trueATE: number): CausalSample[] {
  const samples: CausalSample[] = [];
  for (let i = 0; i < n; i++) {
    const riskLevel = 0.3 + Math.random() * 0.5;
    const affected = Math.floor(5 + Math.random() * 20);
    const treated = i < n / 2;
    const baseOutcome = treated ? trueATE + (Math.random() - 0.5) * 0.1 : (Math.random() - 0.5) * 0.05;
    samples.push({
      features: [riskLevel, affected],
      treated,
      outcome: Math.max(0, Math.min(1, baseOutcome)),
      intervention,
    });
  }
  return samples;
}

/** Generate samples with a deterministic seed-like pattern for stable tests. */
function generateDeterministicSamples(
  n: number,
  intervention: InterventionType,
  trueATE: number,
): CausalSample[] {
  const samples: CausalSample[] = [];
  for (let i = 0; i < n; i++) {
    const riskLevel = 0.3 + (i / n) * 0.5;
    const affected = 5 + (i % 20);
    const treated = i < n / 2;
    // Period-30 noise (LCM of 3, 5, 10) ensures each fold receives an integer
    // number of periods → identical noise distribution → consistent fold estimates
    const noise = Math.sin((i * 2 * Math.PI) / 30) * 0.005;
    const baseOutcome = treated ? trueATE + noise : Math.abs(noise);
    samples.push({
      features: [riskLevel, affected],
      treated,
      outcome: Math.max(0, Math.min(1, baseOutcome)),
      intervention,
    });
  }
  return samples;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('CausalEstimator', () => {
  // Track env vars to restore after each test
  const envKeys = ['DML_MIN_SAMPLE_SIZE', 'DML_CROSS_FIT_FOLDS'];
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) savedEnv[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  // ─── getDMLConfig ──────────────────────────────────────────────────────

  describe('getDMLConfig', () => {
    it('should return default config when no env vars set', () => {
      delete process.env.DML_MIN_SAMPLE_SIZE;
      delete process.env.DML_CROSS_FIT_FOLDS;
      const config = getDMLConfig();
      expect(config.minSampleSize).toBe(50);
      expect(config.crossFitFolds).toBe(5);
      expect(config.crossFitFoldsMax).toBe(10);
    });

    it('should respect DML_MIN_SAMPLE_SIZE env var', () => {
      process.env.DML_MIN_SAMPLE_SIZE = '30';
      expect(getDMLConfig().minSampleSize).toBe(30);
      delete process.env.DML_MIN_SAMPLE_SIZE;
      expect(getDMLConfig().minSampleSize).toBe(50);
    });

    it('should respect DML_CROSS_FIT_FOLDS env var', () => {
      process.env.DML_CROSS_FIT_FOLDS = '7';
      expect(getDMLConfig().crossFitFolds).toBe(7);
      delete process.env.DML_CROSS_FIT_FOLDS;
      expect(getDMLConfig().crossFitFolds).toBe(5);
    });

    it('should fall back to default for invalid env values', () => {
      process.env.DML_MIN_SAMPLE_SIZE = 'not-a-number';
      expect(getDMLConfig().minSampleSize).toBe(50);
      process.env.DML_MIN_SAMPLE_SIZE = '0';
      expect(getDMLConfig().minSampleSize).toBe(50);
      process.env.DML_MIN_SAMPLE_SIZE = '-5';
      expect(getDMLConfig().minSampleSize).toBe(50);
    });
  });

  // ─── selectAdaptiveFolds ───────────────────────────────────────────────

  describe('selectAdaptiveFolds', () => {
    it('should return 3 folds for small samples (n < 100)', () => {
      delete process.env.DML_CROSS_FIT_FOLDS;
      expect(selectAdaptiveFolds(50)).toBe(3);
      expect(selectAdaptiveFolds(99)).toBe(3);
    });

    it('should return configured default for medium samples (100–500)', () => {
      delete process.env.DML_CROSS_FIT_FOLDS;
      expect(selectAdaptiveFolds(100)).toBe(5);
      expect(selectAdaptiveFolds(300)).toBe(5);
      expect(selectAdaptiveFolds(500)).toBe(5);
    });

    it('should return 10 folds for large samples (n > 500)', () => {
      delete process.env.DML_CROSS_FIT_FOLDS;
      expect(selectAdaptiveFolds(501)).toBe(10);
      expect(selectAdaptiveFolds(1000)).toBe(10);
    });

    it('should respect DML_CROSS_FIT_FOLDS for medium samples', () => {
      process.env.DML_CROSS_FIT_FOLDS = '4';
      expect(selectAdaptiveFolds(200)).toBe(4);
    });

    it('should cap at crossFitFoldsMax (10)', () => {
      process.env.DML_CROSS_FIT_FOLDS = '20';
      // For medium samples, min(20, 10) = 10
      expect(selectAdaptiveFolds(200)).toBe(10);
    });
  });

  // ─── stratifiedSplit ───────────────────────────────────────────────────

  describe('stratifiedSplit', () => {
    it('should produce exactly K folds', () => {
      const samples = generateDeterministicSamples(60, 'reroute', 0.25);
      const folds = stratifiedSplit(samples, 5);
      expect(folds).toHaveLength(5);
      const totalSize = folds.reduce((s, f) => s + f.length, 0);
      expect(totalSize).toBe(60);
    });

    it('should include both treated and control in every fold', () => {
      const samples = generateDeterministicSamples(100, 'reroute', 0.25);
      const folds = stratifiedSplit(samples, 5);
      for (const fold of folds) {
        const treated = fold.filter(s => s.treated).length;
        const control = fold.filter(s => !s.treated).length;
        expect(treated).toBeGreaterThan(0);
        expect(control).toBeGreaterThan(0);
      }
    });

    it('should be deterministic (same input → same output)', () => {
      const samples = generateDeterministicSamples(50, 'safety_stock', 0.35);
      const folds1 = stratifiedSplit(samples, 5);
      const folds2 = stratifiedSplit(samples, 5);
      expect(folds1).toEqual(folds2);
    });

    it('should balance treated/control proportionally across folds', () => {
      const samples = generateDeterministicSamples(100, 'reroute', 0.25);
      const folds = stratifiedSplit(samples, 5);
      const overallTreatedRatio = samples.filter(s => s.treated).length / samples.length;
      for (const fold of folds) {
        const foldTreatedRatio = fold.filter(s => s.treated).length / fold.length;
        // Each fold's treated ratio should be close to overall (±0.15)
        expect(Math.abs(foldTreatedRatio - overallTreatedRatio)).toBeLessThan(0.15);
      }
    });
  });

  // ─── computeCrossFitVariance ───────────────────────────────────────────

  describe('computeCrossFitVariance', () => {
    it('should return 0 for fewer than 2 fold estimates', () => {
      expect(computeCrossFitVariance([], 0.3, 100)).toBe(0);
      expect(computeCrossFitVariance([0.3], 0.3, 100)).toBe(0);
    });

    it('should return non-negative variance for multiple estimates', () => {
      const estimates = [0.25, 0.30, 0.35, 0.28, 0.32];
      const variance = computeCrossFitVariance(estimates, 0.30, 100);
      expect(variance).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 variance when all fold estimates are identical', () => {
      const estimates = [0.30, 0.30, 0.30, 0.30, 0.30];
      const variance = computeCrossFitVariance(estimates, 0.30, 100);
      expect(variance).toBe(0);
    });

    it('should scale variance inversely with sample size', () => {
      const estimates = [0.20, 0.30, 0.40];
      const varN100 = computeCrossFitVariance(estimates, 0.30, 100);
      const varN200 = computeCrossFitVariance(estimates, 0.30, 200);
      expect(varN200).toBeLessThan(varN100);
    });
  });

  // ─── checkCrossFitConsistency ──────────────────────────────────────────

  describe('checkCrossFitConsistency', () => {
    it('should mark consistent estimates as consistent', () => {
      const estimates = [0.28, 0.30, 0.29, 0.31, 0.30];
      const result = checkCrossFitConsistency(estimates);
      expect(result.isConsistent).toBe(true);
      expect(result.stdDev).toBeGreaterThanOrEqual(0);
      expect(result.cv).toBeLessThan(0.5);
    });

    it('should mark inconsistent estimates as inconsistent', () => {
      const estimates = [0.10, 0.50, 0.05, 0.80, 0.15];
      const result = checkCrossFitConsistency(estimates);
      expect(result.isConsistent).toBe(false);
      expect(result.cv).toBeGreaterThanOrEqual(0.5);
    });

    it('should return consistent=true for fewer than 2 estimates', () => {
      expect(checkCrossFitConsistency([]).isConsistent).toBe(true);
      expect(checkCrossFitConsistency([0.3]).isConsistent).toBe(true);
    });

    it('should compute correct coefficient of variation', () => {
      const estimates = [0.20, 0.30, 0.40];
      const result = checkCrossFitConsistency(estimates);
      const mean = 0.30;
      const expectedStd = Math.sqrt(((0.20 - mean) ** 2 + (0.30 - mean) ** 2 + (0.40 - mean) ** 2) / 2);
      expect(result.stdDev).toBeCloseTo(expectedStd, 5);
      expect(result.cv).toBeCloseTo(expectedStd / mean, 5);
    });
  });

  // ─── selectMethod ──────────────────────────────────────────────────────

  describe('selectMethod', () => {
    it('should select PSM for small samples', () => {
      delete process.env.DML_MIN_SAMPLE_SIZE;
      expect(selectMethod(5)).toBe('psm');
      expect(selectMethod(10)).toBe('psm');
      expect(selectMethod(49)).toBe('psm');
    });

    it('should select DML for larger samples', () => {
      delete process.env.DML_MIN_SAMPLE_SIZE;
      expect(selectMethod(50)).toBe('dml');
      expect(selectMethod(100)).toBe('dml');
    });

    it('should respect configured DML_MIN_SAMPLE_SIZE', () => {
      process.env.DML_MIN_SAMPLE_SIZE = '30';
      expect(selectMethod(29)).toBe('psm');
      expect(selectMethod(30)).toBe('dml');
    });
  });

  // ─── estimatePSM ───────────────────────────────────────────────────────

  describe('estimatePSM', () => {
    it('should return prior for insufficient samples', () => {
      const samples = generateSamples(3, 'reroute', 0.25);
      const result = estimatePSM(samples, 'reroute', 0.5);
      expect(result.ate).toBeGreaterThan(0);
      expect(result.sampleSize).toBe(3);
      expect(result.pValue).toBe(1.0);
    });

    it('should estimate ATE from matched samples', () => {
      const samples = generateSamples(20, 'safety_stock', 0.35);
      const result = estimatePSM(samples, 'safety_stock', 0.5);
      expect(result.ate).toBeGreaterThan(0);
      expect(result.ate).toBeLessThan(1);
      expect(result.confidenceInterval).toHaveLength(2);
      expect(result.confidenceInterval[0]).toBeLessThanOrEqual(result.confidenceInterval[1]);
    });

    it('should return prior for unmatched intervention type', () => {
      const samples = generateSamples(10, 'reroute', 0.25);
      const result = estimatePSM(samples, 'combined', 0.5);
      expect(result.ate).toBeGreaterThan(0);
      expect(result.explanation).toContain('先验');
    });
  });

  // ─── estimateDML ───────────────────────────────────────────────────────

  describe('estimateDML', () => {
    it('should return prior for insufficient treated samples', () => {
      const samples = generateSamples(8, 'reroute', 0.25);
      const result = estimateDML(samples, 'reroute');
      expect(result.ate).toBeGreaterThan(0);
      expect(result.explanation).toContain('DML');
    });

    it('should estimate ATE with cross-fitting', () => {
      const samples = generateSamples(30, 'safety_stock', 0.35);
      const result = estimateDML(samples, 'safety_stock');
      expect(result.ate).toBeGreaterThan(0);
      expect(result.ate).toBeLessThan(1);
      expect(result.confidenceInterval).toHaveLength(2);
      expect(result.sampleSize).toBe(30);
      expect(result.explanation).toContain('DML');
    });

    it('should produce reasonable ATE for large samples', () => {
      const samples = generateSamples(100, 'supplier_switch', 0.30);
      const result = estimateDML(samples, 'supplier_switch');
      // ATE should be in a reasonable range (true ATE = 0.30)
      expect(result.ate).toBeGreaterThanOrEqual(0.05);
      expect(result.ate).toBeLessThan(0.85);
    });

    it('should use 3 folds for small samples (n < 100)', () => {
      const samples = generateDeterministicSamples(60, 'reroute', 0.25);
      const result = estimateDML(samples, 'reroute');
      expect(result.explanation).toContain('3 折');
    });

    it('should use 5 folds for medium samples (100–500)', () => {
      const samples = generateDeterministicSamples(200, 'reroute', 0.25);
      const result = estimateDML(samples, 'reroute');
      expect(result.explanation).toContain('5 折');
    });

    it('should use 10 folds for large samples (n > 500)', () => {
      const samples = generateDeterministicSamples(600, 'reroute', 0.25);
      const result = estimateDML(samples, 'reroute');
      expect(result.explanation).toContain('10 折');
    });

    it('should include cross-fit variance in explanation when reliable', () => {
      const samples = generateDeterministicSamples(200, 'safety_stock', 0.35);
      const result = estimateDML(samples, 'safety_stock');
      // Reliable estimates use "基于" prefix and include σ² in the explanation
      if (result.explanation.includes('基于')) {
        expect(result.explanation).toContain('σ²=');
      }
    });

    it('should produce deterministic results for same input', () => {
      const samples = generateDeterministicSamples(100, 'reroute', 0.25);
      const result1 = estimateDML(samples, 'reroute');
      const result2 = estimateDML(samples, 'reroute');
      // ATE should be identical (seeded shuffle → deterministic folds)
      expect(result1.ate).toBe(result2.ate);
    });
  });

  // ─── estimateCausalForest ──────────────────────────────────────────────

  describe('estimateCausalForest', () => {
    it('should return heterogeneous effects', () => {
      const samples = generateSamples(30, 'reroute', 0.25);
      const result = estimateCausalForest(samples, 'reroute');
      expect(result.heterogeneousEffects).toHaveLength(2);
      expect(result.heterogeneousEffects[0].subgroup).toContain('高风险');
      expect(result.heterogeneousEffects[1].subgroup).toContain('低风险');
      expect(result.heterogeneousEffects[0].ate).toBeGreaterThan(0);
    });
  });

  // ─── estimateCausalEffect (unified) ────────────────────────────────────

  describe('estimateCausalEffect (unified)', () => {
    it('should use PSM for small samples', () => {
      delete process.env.DML_MIN_SAMPLE_SIZE;
      const samples = generateSamples(10, 'reroute', 0.25);
      const result = estimateCausalEffect(samples, 'reroute', 0.5);
      expect(result.explanation).toContain('PSM');
    });

    it('should use DML for larger samples', () => {
      delete process.env.DML_MIN_SAMPLE_SIZE;
      const samples = generateSamples(60, 'reroute', 0.25);
      const result = estimateCausalEffect(samples, 'reroute', 0.5);
      expect(result.explanation).toContain('DML');
    });

    it('should always return a valid CausalEstimate', () => {
      const samples = generateSamples(50, 'combined', 0.55);
      const result = estimateCausalEffect(samples, 'combined', 0.7);
      expect(result.ate).toBeGreaterThan(0);
      expect(result.ate).toBeLessThan(1);
      expect(result.confidenceInterval[0]).toBeLessThanOrEqual(result.confidenceInterval[1]);
      expect(result.sampleSize).toBe(50);
      expect(result.propensityScore).toBeGreaterThanOrEqual(0);
      expect(result.propensityScore).toBeLessThanOrEqual(1);
      expect(result.pValue).toBeGreaterThanOrEqual(0);
      expect(result.pValue).toBeLessThanOrEqual(1);
    });
  });
});
