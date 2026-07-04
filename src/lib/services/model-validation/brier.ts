/**
 * Model Validation — Brier Score Calibration (probabilistic binary forecasts)
 *
 * Implements the Brier Score (Brier 1950), the Murphy (1973) three-component
 * decomposition (REL − RES + UNC), the Brier Skill Score relative to
 * climatology, and the calibration (reliability) curve.
 *
 * @reference Brier (1950); Murphy (1973); Wilks (2011) §8.4–8.5.
 */
import type { BrierResult, CalibrationPoint } from './types';
import { clamp01, isEvent, round } from './shared';

/**
 * Compute the raw Brier Score for probabilistic binary forecasts.
 *
 *   BS = (1/N) Σ (f_i − o_i)²
 *
 * where f_i ∈ [0, 1] is the forecast probability and o_i ∈ {0, 1} is the
 * observed outcome.
 *
 * @param forecasts  Forecast probabilities in [0, 1].
 * @param outcomes   Observed binary outcomes (0 or 1).
 * @returns Raw Brier Score ∈ [0, 1].
 *
 * @reference Brier (1950).
 */
function computeRawBrierScore(forecasts: number[], outcomes: number[]): number {
  const n = forecasts.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const f = clamp01(forecasts[i]);
    // Outcome is treated as binary: any truthy/non-zero value counts as an event (1).
    // This follows the meteorological convention where o_i ∈ {0, 1} but allows
    // callers to pass boolean-like values (e.g. true/false, 0/1, 0/non-zero).
    const o = isEvent(outcomes[i]) ? 1 : 0;
    const d = f - o;
    sum += d * d;
  }
  return sum / n;
}

/**
 * Compute the full Brier Score assessment for probabilistic binary forecasts.
 *
 * Returns the raw Brier Score plus the Murphy (1973) three-component
 * decomposition (reliability, resolution, uncertainty), the Brier Skill
 * Score relative to climatology, and the calibration (reliability) curve.
 *
 *   BS = (1/N) Σ (f_i − o_i)²     (Brier 1950)
 *   BS = REL − RES + UNC          (Murphy 1973)
 *   BSS = 1 − BS / BS_clim        (Wilks 2011, Eq. 8.43)
 *
 * @param forecasts  Forecast probabilities in [0, 1].
 * @param outcomes   Observed binary outcomes (0 or 1).
 * @param numBins    Number of bins for the calibration curve (default 10).
 * @returns Full {@link BrierResult} assessment.
 *
 * @reference Brier (1950); Murphy (1973); Wilks (2011) §8.4–8.5.
 */
export function brierScore(
  forecasts: number[],
  outcomes: number[],
  numBins: number = 10,
): BrierResult {
  if (forecasts.length !== outcomes.length) {
    throw new Error(
      `brierScore: length mismatch (f=${forecasts.length}, o=${outcomes.length})`,
    );
  }
  const n = forecasts.length;
  if (n === 0) {
    throw new Error('brierScore: empty input arrays');
  }

  const bs = computeRawBrierScore(forecasts, outcomes);
  const decomp = decomposeBrierScore(forecasts, outcomes, numBins);
  const curve = calibrationCurve(forecasts, outcomes, numBins);

  // Brier Skill Score relative to the climatological forecast (constant f = ō).
  // For the climatology forecast, BS_clim = (1/N) Σ(ō − o_i)² = ō(1−ō) = UNC.
  // Reference: Wilks (2011) Eq. 8.43.
  const baseRate = outcomes.reduce((s, o) => s + (isEvent(o) ? 1 : 0), 0) / n;
  const bsClimatology = baseRate * (1 - baseRate);
  const skillScore = bsClimatology > 0 ? 1 - bs / bsClimatology : 0;

  return {
    brierScore: round(bs, 6),
    reliability: decomp.reliability,
    resolution: decomp.resolution,
    uncertainty: decomp.uncertainty,
    skillScore: round(skillScore, 6),
    calibrationCurve: curve,
    isCalibrated: decomp.reliability < 0.05,
    n,
  };
}

/**
 * Compute the calibration (reliability) curve by binning forecasts into
 * `numBins` equal-width intervals over [0, 1].
 *
 * Empty bins are *omitted* from the result (a bin with zero forecasts
 * contributes nothing to the reliability diagram).
 *
 * @param forecasts  Forecast probabilities in [0, 1].
 * @param outcomes   Observed binary outcomes (0 or 1).
 * @param numBins    Number of equal-width bins (default 10).
 * @returns Calibration points, one per non-empty bin, sorted by binCenter.
 *
 * @reference Wilks (2011) §8.5 — reliability diagrams typically use 10 bins.
 */
export function calibrationCurve(
  forecasts: number[],
  outcomes: number[],
  numBins: number = 10,
): CalibrationPoint[] {
  if (forecasts.length !== outcomes.length) {
    throw new Error(
      `calibrationCurve: length mismatch (f=${forecasts.length}, o=${outcomes.length})`,
    );
  }
  if (!Number.isInteger(numBins) || numBins < 1) {
    throw new Error(`calibrationCurve: numBins must be a positive integer, got ${numBins}`);
  }
  const n = forecasts.length;
  if (n === 0) return [];

  const binWidth = 1 / numBins;
  // Per-bin accumulators
  const binCounts = new Array<number>(numBins).fill(0);
  const binObserved = new Array<number>(numBins).fill(0); // sum of outcomes
  const binForecast = new Array<number>(numBins).fill(0); // sum of forecasts

  for (let i = 0; i < n; i++) {
    const f = clamp01(forecasts[i]);
    const o = isEvent(outcomes[i]) ? 1 : 0;
    // Place forecast into the appropriate bin; clamp f=1 into the last bin.
    let idx = Math.floor(f / binWidth);
    if (idx >= numBins) idx = numBins - 1;
    if (idx < 0) idx = 0;
    binCounts[idx]++;
    binObserved[idx] += o;
    binForecast[idx] += f;
  }

  const points: CalibrationPoint[] = [];
  for (let i = 0; i < numBins; i++) {
    if (binCounts[i] === 0) continue;
    points.push({
      binCenter: round((i + 0.5) * binWidth, 6),
      observedFrequency: round(binObserved[i] / binCounts[i], 6),
      forecastProbability: round(binForecast[i] / binCounts[i], 6),
      count: binCounts[i],
    });
  }
  return points;
}

/**
 * Murphy (1973) three-component decomposition of the Brier Score.
 *
 *   BS = REL − RES + UNC
 *
 *   REL  = (1/N) Σ_b n_b (f̄_b − ō_b)²
 *   RES  = (1/N) Σ_b n_b (ō_b − ō)²
 *   UNC  = ō (1 − ō)
 *
 * where the sum is over bins b, n_b is the bin count, f̄_b is the mean
 * forecast probability in bin b, ō_b is the observed frequency in bin b,
 * and ō is the overall base rate.
 *
 * @param forecasts  Forecast probabilities in [0, 1].
 * @param outcomes   Observed binary outcomes (0 or 1).
 * @param numBins    Number of bins for the decomposition (default 10).
 * @returns `{ reliability, resolution, uncertainty }` plus the raw Brier
 *          Score for cross-checking (BS ≈ REL − RES + UNC).
 *
 * @reference Murphy (1973); Wilks (2011) §8.4.3.
 */
export function decomposeBrierScore(
  forecasts: number[],
  outcomes: number[],
  numBins: number = 10,
): {
  brierScore: number;
  reliability: number;
  resolution: number;
  uncertainty: number;
} {
  if (forecasts.length !== outcomes.length) {
    throw new Error(
      `decomposeBrierScore: length mismatch (f=${forecasts.length}, o=${outcomes.length})`,
    );
  }
  const n = forecasts.length;
  if (n === 0) {
    throw new Error('decomposeBrierScore: empty input arrays');
  }

  // Overall base rate ō = (1/N) Σ o_i
  const baseRate = outcomes.reduce((s, o) => s + (isEvent(o) ? 1 : 0), 0) / n;
  const uncertainty = baseRate * (1 - baseRate); // ∈ [0, 0.25]

  // Bin the forecasts and accumulate per-bin statistics
  const curve = calibrationCurve(forecasts, outcomes, numBins);
  let reliability = 0;
  let resolution = 0;
  for (const pt of curve) {
    const nb = pt.count;
    const fBar = pt.forecastProbability;
    const oBar = pt.observedFrequency;
    reliability += (nb / n) * (fBar - oBar) ** 2;
    resolution += (nb / n) * (oBar - baseRate) ** 2;
  }

  const bs = computeRawBrierScore(forecasts, outcomes);
  return {
    brierScore: round(bs, 6),
    reliability: round(reliability, 6),
    resolution: round(resolution, 6),
    uncertainty: round(uncertainty, 6),
  };
}
