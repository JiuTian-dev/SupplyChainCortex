/**
 * Model Validation — Holdout Set Validation (continuous predictions)
 *
 * @reference Hyndman & Athanasopoulos (2018), §5.8 (Time-series
 *            cross-validation); Kohavi (1995).
 */
import type { HoldoutResult } from './types';
import { mean, round } from './shared';

/**
 * Compute holdout-set validation metrics for continuous predictions.
 *
 * @param predictions  Model-predicted values (e.g. risk scores 0–100).
 * @param actuals       Observed outcomes on the same scale.
 * @throws {Error} if input lengths mismatch or empty.
 *
 * @example
 *   holdoutValidation([60, 70, 80], [58, 72, 79])
 *   // → { mse: 3, rmse: 1.732, mae: 1.333, mape: 1.78, rSquared: 0.997, ... }
 */
export function holdoutValidation(
  predictions: number[],
  actuals: number[],
): HoldoutResult {
  if (predictions.length !== actuals.length) {
    throw new Error(
      `holdoutValidation: length mismatch (pred=${predictions.length}, actual=${actuals.length})`,
    );
  }
  const n = predictions.length;
  if (n === 0) {
    throw new Error('holdoutValidation: empty input arrays');
  }

  const predMean = mean(predictions);
  const actualMean = mean(actuals);

  let sumSqErr = 0;
  let sumAbsErr = 0;
  let sumAbsPctErr = 0;
  let sumPredSq = 0;
  let sumActualSq = 0;
  let sumProd = 0;
  let ssActual = 0; // Σ(actual − actualMean)²
  let ssRes = 0;    // Σ(actual − pred)²
  let pctCount = 0;

  const EPS = 1e-9;
  for (let i = 0; i < n; i++) {
    const p = predictions[i];
    const a = actuals[i];
    const err = p - a;
    const absErr = Math.abs(err);
    sumSqErr += err * err;
    sumAbsErr += absErr;
    // MAPE: skip samples where actual ≈ 0 to avoid blow-up
    if (Math.abs(a) > EPS) {
      sumAbsPctErr += (absErr / Math.abs(a)) * 100;
      pctCount++;
    }
    sumPredSq += p * p;
    sumActualSq += a * a;
    sumProd += p * a;
    ssRes += err * err;
    ssActual += (a - actualMean) ** 2;
  }

  const mse = sumSqErr / n;
  const rmse = Math.sqrt(mse);
  const mae = sumAbsErr / n;
  const mape = pctCount > 0 ? sumAbsPctErr / pctCount : 0;
  const bias = predMean - actualMean;

  // Pearson correlation: cov(p,a) / (σ_p σ_a)
  const cov = (sumProd / n) - predMean * actualMean;
  const varPred = sumPredSq / n - predMean * predMean;
  const varActual = sumActualSq / n - actualMean * actualMean;
  const denom = Math.sqrt(Math.max(varPred, 0) * Math.max(varActual, 0));
  const correlation = denom > EPS ? cov / denom : 0;

  // R² = 1 − SS_res / SS_tot (with SS_tot measured from actual mean)
  const rSquared = ssActual > EPS ? 1 - ssRes / ssActual : 0;

  // Reliability rule: RMSE should be < 20% of the actuals' std dev
  const actualStd = Math.sqrt(Math.max(varActual, 0));
  const isReliable = actualStd > EPS ? rmse < 0.2 * actualStd : rmse < EPS;

  return {
    mse: round(mse, 6),
    rmse: round(rmse, 6),
    mae: round(mae, 6),
    mape: round(mape, 6),
    rSquared: round(rSquared, 6),
    correlation: round(correlation, 6),
    bias: round(bias, 6),
    isReliable,
    n,
  };
}

/**
 * Time-series aware split: keeps chronological order intact (no shuffling).
 *
 * @param data        Time-ordered observations (oldest first).
 * @param trainRatio  Fraction in (0, 1) reserved for training (default 0.7).
 * @returns `{ train, test }` slices preserving original ordering.
 *
 * @reference Hyndman & Athanasopoulos (2018), §5.8 — evaluating forecast
 *            accuracy with time-series cross-validation requires preserving
 *            temporal order to avoid look-ahead bias.
 */
export function timeSeriesSplit<T>(
  data: readonly T[],
  trainRatio: number = 0.7,
): { train: T[]; test: T[] } {
  if (!Number.isFinite(trainRatio) || trainRatio <= 0 || trainRatio >= 1) {
    throw new Error(`timeSeriesSplit: trainRatio must be in (0, 1), got ${trainRatio}`);
  }
  if (data.length < 2) {
    throw new Error(`timeSeriesSplit: need ≥2 samples, got ${data.length}`);
  }
  const splitIdx = Math.max(1, Math.floor(data.length * trainRatio));
  return {
    train: data.slice(0, splitIdx),
    test: data.slice(splitIdx),
  };
}

/**
 * K-fold cross-validation. For time-series data prefer {@link timeSeriesSplit}
 * or a rolling-origin scheme; this implementation uses *contiguous* folds
 * (not shuffled) so it can be applied to either setting when the caller
 * pre-sorts the input chronologically.
 *
 * @param data  Input array.
 * @param k     Number of folds (≥2).
 * @returns Array of `{ train, test }` pairs, length === k.
 *
 * @reference Kohavi (1995) — k-fold CV reduces variance vs. single holdout.
 */
export function crossValidation<T>(
  data: readonly T[],
  k: number = 5,
): Array<{ train: T[]; test: T[] }> {
  if (!Number.isInteger(k) || k < 2) {
    throw new Error(`crossValidation: k must be an integer ≥2, got ${k}`);
  }
  if (data.length < k) {
    throw new Error(`crossValidation: need ≥k=${k} samples, got ${data.length}`);
  }

  const foldSize = Math.floor(data.length / k);
  const folds: Array<{ train: T[]; test: T[] }> = [];
  for (let i = 0; i < k; i++) {
    const start = i * foldSize;
    const end = i === k - 1 ? data.length : start + foldSize; // last fold absorbs remainder
    const test = data.slice(start, end);
    const train = [...data.slice(0, start), ...data.slice(end)];
    folds.push({ train, test });
  }
  return folds;
}
