/**
 * Tests for the Model Validation module (holdout + Brier Score).
 *
 * Reference values for Brier Score tests are derived analytically from
 * Brier (1950) and Murphy (1973); see model-validation.ts for citations.
 */
import { describe, it, expect } from 'vitest';
import {
  holdoutValidation,
  timeSeriesSplit,
  crossValidation,
  brierScore,
  calibrationCurve,
  decomposeBrierScore,
  generateValidationReport,
} from './model-validation';

// ─── Brier Score: core formula ─────────────────────────────────────────────

describe('brierScore', () => {
  it('returns brierScore=0 for a perfect probabilistic forecast', () => {
    // f_i = o_i for all i → Σ(f−o)² = 0
    expect(brierScore([0, 0, 1, 1], [0, 0, 1, 1]).brierScore).toBe(0);
    expect(brierScore([0.0, 1.0], [0, 1]).brierScore).toBe(0);
  });

  it('returns brierScore=1 for the worst possible forecast (confident and wrong)', () => {
    // f=1 when o=0, f=0 when o=1 → (1−0)² + (0−1)² = 2; /2 = 1
    expect(brierScore([1, 0], [0, 1]).brierScore).toBe(1);
    expect(brierScore([1, 1, 0, 0], [0, 0, 1, 1]).brierScore).toBe(1);
  });

  it('returns brierScore=0.25 for constant 0.5 forecasts against balanced outcomes', () => {
    // (0.5−0)² + (0.5−1)² = 0.25 + 0.25 = 0.5; /2 = 0.25
    expect(brierScore([0.5, 0.5], [0, 1]).brierScore).toBeCloseTo(0.25, 6);
  });

  it('returns brierScore=0 for all-zero forecasts against all-zero outcomes', () => {
    expect(brierScore([0, 0, 0], [0, 0, 0]).brierScore).toBe(0);
  });

  it('computes the textbook example: [0.8, 0.4, 0.1] vs [1, 0, 0]', () => {
    // (0.8−1)² + (0.4−0)² + (0.1−0)² = 0.04 + 0.16 + 0.01 = 0.21; /3 = 0.07
    expect(brierScore([0.8, 0.4, 0.1], [1, 0, 0]).brierScore).toBeCloseTo(0.07, 6);
  });

  it('throws on length mismatch', () => {
    expect(() => brierScore([0.5, 0.5], [0])).toThrow(/length mismatch/);
  });

  it('throws on empty input', () => {
    expect(() => brierScore([], [])).toThrow(/empty/);
  });

  it('clamps out-of-range forecasts to [0, 1] without throwing', () => {
    // 1.5 → 1.0, −0.2 → 0.0; (1−1)² + (0−0)² = 0
    expect(brierScore([1.5, -0.2], [1, 0]).brierScore).toBe(0);
  });

  it('populates the calibration curve with the requested number of bins', () => {
    const forecasts = Array.from({ length: 50 }, (_, i) => i / 50);
    const outcomes = forecasts.map(f => (f >= 0.5 ? 1 : 0));
    const result = brierScore(forecasts, outcomes, 10);
    expect(result.calibrationCurve.length).toBeGreaterThan(0);
    expect(result.calibrationCurve.length).toBeLessThanOrEqual(10);
  });

  it('flags isCalibrated=true when REL < 0.05', () => {
    // Perfectly calibrated: forecasts are exactly 0, 0.5, or 1, and observed
    // frequencies match. With 4 samples per bin and outcomes aligned, REL = 0.
    //   Bin 0 [0.0, 0.1): f=0.0 ×4, outcomes all 0 → f̄=0, ō=0 → REL=0
    //   Bin 5 [0.5, 0.6): f=0.5 ×4, outcomes 0,0,1,1 → f̄=0.5, ō=0.5 → REL=0
    //   Bin 9 [0.9, 1.0]: f=1.0 ×4, outcomes all 1 → f̄=1, ō=1 → REL=0
    const forecasts = [0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 1, 1, 1, 1];
    const outcomes = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
    const result = brierScore(forecasts, outcomes);
    expect(result.isCalibrated).toBe(true);
    expect(result.reliability).toBeLessThan(0.05);
  });

  it('flags isCalibrated=false for severely miscalibrated forecasts', () => {
    // Forecast 0.9 but event never happens, 0.1 but event always happens
    const result = brierScore(
      [0.9, 0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.1],
      [0, 0, 0, 0, 1, 1, 1, 1],
    );
    expect(result.isCalibrated).toBe(false);
    expect(result.reliability).toBeGreaterThan(0.05);
  });

  it('returns skillScore=1 for perfect forecasts', () => {
    const result = brierScore([0, 0, 1, 1], [0, 0, 1, 1]);
    expect(result.brierScore).toBe(0);
    expect(result.skillScore).toBe(1);
  });

  it('returns skillScore≈0 for climatological forecasts', () => {
    // f = base_rate for all samples → BS = BS_clim → BSS = 0
    const result = brierScore([0.5, 0.5, 0.5, 0.5], [0, 0, 1, 1]);
    expect(result.skillScore).toBeCloseTo(0, 6);
  });

  it('returns negative skillScore for forecasts worse than climatology', () => {
    // Confidently wrong: f=1 when o=0, f=0 when o=1
    const result = brierScore([1, 1, 0, 0], [0, 0, 1, 1]);
    expect(result.skillScore).toBeLessThan(0);
  });
});

// ─── Calibration Curve ─────────────────────────────────────────────────────

describe('calibrationCurve', () => {
  it('returns 10 bins by default for well-spread forecasts', () => {
    const forecasts = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
    const outcomes = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
    const curve = calibrationCurve(forecasts, outcomes);
    expect(curve.length).toBe(10);
    // First bin center = 0.05, last = 0.95
    expect(curve[0].binCenter).toBeCloseTo(0.05, 6);
    expect(curve[9].binCenter).toBeCloseTo(0.95, 6);
  });

  it('omits empty bins from the result', () => {
    // All forecasts in [0.4, 0.6) → only bins 4 and 5 populated
    const curve = calibrationCurve([0.42, 0.58, 0.45], [0, 1, 0], 10);
    expect(curve.length).toBe(2);
    expect(curve.every(p => p.count > 0)).toBe(true);
  });

  it('places f=1.0 into the last bin (edge case)', () => {
    const curve = calibrationCurve([1.0, 0.0], [1, 0], 10);
    expect(curve.length).toBe(2);
    const lastBin = curve[curve.length - 1];
    expect(lastBin.binCenter).toBeCloseTo(0.95, 6);
    expect(lastBin.count).toBe(1);
  });

  it('returns [] for empty input', () => {
    expect(calibrationCurve([], [])).toEqual([]);
  });

  it('computes observed frequency correctly within each bin', () => {
    // 4 forecasts in bin [0.5, 0.6), 2 events → observedFrequency = 0.5
    const curve = calibrationCurve([0.5, 0.55, 0.58, 0.59], [1, 0, 1, 0], 10);
    expect(curve.length).toBe(1);
    expect(curve[0].observedFrequency).toBeCloseTo(0.5, 6);
    expect(curve[0].forecastProbability).toBeCloseTo(0.555, 3);
    expect(curve[0].count).toBe(4);
  });

  it('throws on invalid numBins', () => {
    expect(() => calibrationCurve([0.5], [1], 0)).toThrow(/numBins/);
    expect(() => calibrationCurve([0.5], [1], 1.5)).toThrow(/numBins/);
  });

  it('supports a custom number of bins', () => {
    const forecasts = [0.1, 0.3, 0.5, 0.7, 0.9];
    const outcomes = [0, 0, 1, 1, 1];
    const curve5 = calibrationCurve(forecasts, outcomes, 5);
    expect(curve5.length).toBeLessThanOrEqual(5);
    // Bin centers for 5 bins: 0.1, 0.3, 0.5, 0.7, 0.9
    expect(curve5[0].binCenter).toBeCloseTo(0.1, 6);
  });
});

// ─── Brier Score Decomposition (Murphy 1973) ──────────────────────────────

describe('decomposeBrierScore', () => {
  it('satisfies the Murphy identity BS = REL − RES + UNC', () => {
    const f = [0.1, 0.3, 0.5, 0.7, 0.9, 0.2, 0.8, 0.4, 0.6, 0.95];
    const o = [0, 0, 1, 1, 1, 0, 1, 0, 1, 1];
    const d = decomposeBrierScore(f, o, 10);
    // BS ≈ REL − RES + UNC (within rounding tolerance; components are rounded
    // to 6 decimals so allow a small absolute tolerance).
    expect(d.reliability - d.resolution + d.uncertainty).toBeCloseTo(d.brierScore, 2);
  });

  it('computes UNC = base_rate × (1 − base_rate)', () => {
    // 4 events out of 8 → base rate 0.5 → UNC = 0.25
    const d = decomposeBrierScore(
      [0.2, 0.4, 0.6, 0.8, 0.1, 0.3, 0.5, 0.7],
      [0, 0, 1, 1, 0, 0, 1, 1],
      10,
    );
    expect(d.uncertainty).toBeCloseTo(0.25, 6);
  });

  it('returns REL ≈ 0 for perfectly calibrated forecasts', () => {
    // Forecasts are exactly 0, 0.5, or 1, and observed frequencies match.
    //   Bin 0: f=0.0 ×4, outcomes all 0 → f̄=0, ō=0 → REL contribution = 0
    //   Bin 5: f=0.5 ×4, outcomes 0,0,1,1 → f̄=0.5, ō=0.5 → REL contribution = 0
    //   Bin 9: f=1.0 ×4, outcomes all 1 → f̄=1, ō=1 → REL contribution = 0
    const forecasts = [0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 1, 1, 1, 1];
    const outcomes = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
    const d = decomposeBrierScore(forecasts, outcomes, 10);
    expect(d.reliability).toBeCloseTo(0, 6);
  });

  it('returns RES = 0 when all forecasts are identical (no resolution)', () => {
    // All forecasts = 0.5 → all in one bin → ō_b = base_rate → RES = 0
    const d = decomposeBrierScore([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1], 10);
    expect(d.resolution).toBeCloseTo(0, 6);
  });

  it('throws on empty input', () => {
    expect(() => decomposeBrierScore([], [])).toThrow(/empty/);
  });

  it('throws on length mismatch', () => {
    expect(() => decomposeBrierScore([0.5, 0.5], [0])).toThrow(/length mismatch/);
  });
});

// ─── Holdout Validation ────────────────────────────────────────────────────

describe('holdoutValidation', () => {
  it('returns MSE=0, R²=1, correlation=1 for perfect predictions', () => {
    const r = holdoutValidation([10, 20, 30, 40, 50], [10, 20, 30, 40, 50]);
    expect(r.mse).toBe(0);
    expect(r.rmse).toBe(0);
    expect(r.mae).toBe(0);
    expect(r.mape).toBe(0);
    expect(r.rSquared).toBe(1);
    expect(r.correlation).toBe(1);
    expect(r.bias).toBe(0);
    expect(r.isReliable).toBe(true);
  });

  it('computes MSE, RMSE, MAE for known deviations', () => {
    // pred=[60,70,80], actual=[58,72,79]
    // errors: 2, -2, 1 → MSE=(4+4+1)/3=3, RMSE=√3, MAE=(2+2+1)/3=5/3
    const r = holdoutValidation([60, 70, 80], [58, 72, 79]);
    expect(r.mse).toBeCloseTo(3, 6);
    expect(r.rmse).toBeCloseTo(Math.sqrt(3), 6);
    expect(r.mae).toBeCloseTo(5 / 3, 6);
  });

  it('computes bias = mean(pred) − mean(actual)', () => {
    const r = holdoutValidation([60, 70, 80], [50, 60, 70]);
    expect(r.bias).toBeCloseTo(10, 6);
  });

  it('computes MAPE skipping zero-valued actuals', () => {
    // actuals = [0, 100], preds = [50, 110]
    // MAPE only counts the non-zero actual: |110−100|/100 × 100 = 10%
    const r = holdoutValidation([50, 110], [0, 100]);
    expect(r.mape).toBeCloseTo(10, 6);
  });

  it('flags isReliable=false when RMSE exceeds 0.2 × std(actuals)', () => {
    // actuals have std ≈ 1.0 (small), predictions are wildly off
    const r = holdoutValidation([100, 100, 100, 100], [1, 2, 3, 4]);
    expect(r.isReliable).toBe(false);
  });

  it('flags isReliable=true when RMSE is small relative to std(actuals)', () => {
    // Wide-spread actuals, tiny errors
    const preds = [10, 20, 30, 40, 50];
    const actuals = [10.1, 20.1, 30.1, 40.1, 50.1];
    const r = holdoutValidation(preds, actuals);
    expect(r.isReliable).toBe(true);
  });

  it('computes negative R² when predictions are worse than the mean', () => {
    // Predicting the mean would do better than constant wrong predictions
    const r = holdoutValidation([100, 100, 100], [10, 20, 30]);
    expect(r.rSquared).toBeLessThan(0);
  });

  it('throws on length mismatch', () => {
    expect(() => holdoutValidation([1, 2, 3], [1, 2])).toThrow(/length mismatch/);
  });

  it('throws on empty input', () => {
    expect(() => holdoutValidation([], [])).toThrow(/empty/);
  });

  it('handles constant actuals (zero variance) without NaN', () => {
    const r = holdoutValidation([5, 5, 5], [5, 5, 5]);
    expect(Number.isFinite(r.correlation)).toBe(true);
    expect(Number.isFinite(r.rSquared)).toBe(true);
  });

  it('computes Pearson correlation correctly for positively correlated data', () => {
    const r = holdoutValidation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(r.correlation).toBeCloseTo(1, 6); // perfect positive correlation
  });
});

// ─── Time-Series Split ─────────────────────────────────────────────────────

describe('timeSeriesSplit', () => {
  it('preserves temporal order (no shuffling)', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const { train, test } = timeSeriesSplit(data, 0.7);
    expect(train).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(test).toEqual([8, 9, 10]);
  });

  it('respects the train ratio', () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    const { train, test } = timeSeriesSplit(data, 0.8);
    expect(train.length).toBe(80);
    expect(test.length).toBe(20);
    // Train contains the first 80, test the last 20
    expect(train[0]).toBe(0);
    expect(train[train.length - 1]).toBe(79);
    expect(test[0]).toBe(80);
    expect(test[test.length - 1]).toBe(99);
  });

  it('throws on invalid trainRatio', () => {
    expect(() => timeSeriesSplit([1, 2, 3], 0)).toThrow(/trainRatio/);
    expect(() => timeSeriesSplit([1, 2, 3], 1)).toThrow(/trainRatio/);
    expect(() => timeSeriesSplit([1, 2, 3], 1.5)).toThrow(/trainRatio/);
  });

  it('throws when fewer than 2 samples', () => {
    expect(() => timeSeriesSplit([1], 0.7)).toThrow(/≥2/);
    expect(() => timeSeriesSplit([], 0.7)).toThrow(/≥2/);
  });

  it('handles objects (generic type) preserving identity', () => {
    const data = [{ t: 1 }, { t: 2 }, { t: 3 }, { t: 4 }];
    const { train, test } = timeSeriesSplit(data, 0.5);
    expect(train).toEqual([{ t: 1 }, { t: 2 }]);
    expect(test).toEqual([{ t: 3 }, { t: 4 }]);
  });
});

// ─── K-Fold Cross Validation ───────────────────────────────────────────────

describe('crossValidation', () => {
  it('returns exactly k folds', () => {
    const data = Array.from({ length: 20 }, (_, i) => i);
    const folds = crossValidation(data, 5);
    expect(folds.length).toBe(5);
  });

  it('places each sample in the test set exactly once', () => {
    const data = Array.from({ length: 20 }, (_, i) => i);
    const folds = crossValidation(data, 5);
    const testCounts = new Map<number, number>();
    for (const fold of folds) {
      for (const x of fold.test) {
        testCounts.set(x, (testCounts.get(x) ?? 0) + 1);
      }
    }
    for (const x of data) {
      expect(testCounts.get(x)).toBe(1);
    }
  });

  it('ensures train ∪ test = full dataset for every fold', () => {
    const data = Array.from({ length: 12 }, (_, i) => i);
    const folds = crossValidation(data, 4);
    for (const fold of folds) {
      const combined = [...fold.train, ...fold.test].sort((a, b) => a - b);
      expect(combined).toEqual(data);
    }
  });

  it('absorbs remainder into the last fold', () => {
    // 10 samples, 3 folds → folds of size 3, 3, 4
    const data = Array.from({ length: 10 }, (_, i) => i);
    const folds = crossValidation(data, 3);
    expect(folds[0].test.length).toBe(3);
    expect(folds[1].test.length).toBe(3);
    expect(folds[2].test.length).toBe(4);
  });

  it('throws on invalid k', () => {
    expect(() => crossValidation([1, 2, 3], 1)).toThrow(/k must be/);
    expect(() => crossValidation([1, 2, 3], 2.5)).toThrow(/k must be/);
  });

  it('throws when data length < k', () => {
    expect(() => crossValidation([1, 2], 5)).toThrow(/need ≥k/);
  });
});

// ─── Extreme Values & Edge Cases ───────────────────────────────────────────

describe('extreme values', () => {
  it('handles very large arrays without stack overflow', () => {
    const n = 10000;
    const preds = new Array(n).fill(50);
    const actuals = new Array(n).fill(50);
    const r = holdoutValidation(preds, actuals);
    expect(r.mse).toBe(0);
    expect(r.n).toBe(n);
  });

  it('handles large-magnitude risk scores', () => {
    const r = holdoutValidation([1_000_000, 2_000_000], [1_000_001, 1_999_999]);
    expect(r.mae).toBeCloseTo(1, 6);
    expect(Number.isFinite(r.mse)).toBe(true);
  });

  it('handles single-sample Brier Score', () => {
    expect(brierScore([0.5], [0]).brierScore).toBeCloseTo(0.25, 6);
    expect(brierScore([1], [1]).brierScore).toBe(0);
  });

  it('handles all-events vs no-events outcomes for Brier', () => {
    // All events happen, forecast = 0.5 → BS = 0.25
    expect(brierScore([0.5, 0.5, 0.5], [1, 1, 1]).brierScore).toBeCloseTo(0.25, 6);
    // No events happen, forecast = 0.5 → BS = 0.25
    expect(brierScore([0.5, 0.5, 0.5], [0, 0, 0]).brierScore).toBeCloseTo(0.25, 6);
  });

  it('treats non-binary outcomes as binary (1 = event, else 0)', () => {
    // Outcomes 2 and -1 should be coerced to 1 and 0
    expect(brierScore([1, 0], [2, -1]).brierScore).toBe(0);
  });
});

// ─── Validation Report Generation ──────────────────────────────────────────

describe('generateValidationReport', () => {
  it('generates a Markdown report with holdout section when given predictions', () => {
    const report = generateValidationReport({
      predictions: [60, 70, 80],
      actuals: [58, 72, 79],
      modelName: 'test-model',
    });
    expect(report.markdown).toContain('Holdout Set Validation');
    expect(report.markdown).toContain('RMSE');
    expect(report.markdown).toContain('test-model');
    expect(report.holdout).toBeDefined();
    expect(report.brier).toBeUndefined();
  });

  it('generates a Markdown report with Brier section when given forecasts', () => {
    const report = generateValidationReport({
      forecasts: [0.1, 0.4, 0.6, 0.9],
      outcomes: [0, 0, 1, 1],
    });
    expect(report.markdown).toContain('Brier Score Calibration');
    expect(report.markdown).toContain('Reliability');
    expect(report.markdown).toContain('Calibration Curve');
    expect(report.brier).toBeDefined();
    expect(report.holdout).toBeUndefined();
  });

  it('includes both sections when both inputs are provided', () => {
    const report = generateValidationReport({
      predictions: [60, 70, 80, 90],
      actuals: [58, 72, 79, 88],
      forecasts: [0.1, 0.4, 0.6, 0.9],
      outcomes: [0, 0, 1, 1],
    });
    expect(report.markdown).toContain('Holdout Set Validation');
    expect(report.markdown).toContain('Brier Score Calibration');
    expect(report.holdout).toBeDefined();
    expect(report.brier).toBeDefined();
  });

  it('sets passed=true when both holdout is reliable and brier is calibrated', () => {
    const report = generateValidationReport({
      predictions: [10, 20, 30],
      actuals: [10, 20, 30],
      forecasts: [0, 0, 1],
      outcomes: [0, 0, 1],
    });
    expect(report.passed).toBe(true);
  });

  it('sets passed=false when holdout is unreliable', () => {
    const report = generateValidationReport({
      predictions: [100, 100, 100],
      actuals: [1, 2, 3],
    });
    expect(report.passed).toBe(false);
  });

  it('throws when neither holdout nor brier inputs are provided', () => {
    expect(() => generateValidationReport({})).toThrow(/must provide/);
  });

  it('throws when only one of predictions/actuals is provided', () => {
    expect(() => generateValidationReport({ predictions: [1, 2] })).toThrow(/must provide/);
    expect(() => generateValidationReport({ actuals: [1, 2] })).toThrow(/must provide/);
  });
});
