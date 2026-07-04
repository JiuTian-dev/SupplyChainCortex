/**
 * Model Validation — Shared Internal Helpers
 *
 * Numeric utilities used across holdout validation and Brier Score
 * calibration sub-modules. Not part of the public API.
 */

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Treat a positive numeric outcome as an event (1); zero, negative, NaN, or
 * non-finite values are treated as non-events (0). This follows the
 * meteorological convention for binary event verification where o_i ∈ {0, 1}
 * but allows callers to pass signed numeric values (e.g. +1/−1 encoding).
 */
export function isEvent(o: number): boolean {
  return Number.isFinite(o) && o > 0;
}

export function round(x: number, digits: number): number {
  if (!Number.isFinite(x)) return 0;
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
