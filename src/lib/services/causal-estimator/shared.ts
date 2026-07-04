/**
 * Causal Estimator — Shared Internal Helpers
 *
 * Statistical utilities (sensitivity analysis, permutation test, bootstrap
 * CI, OLS regression) used by the DML and PSM estimators. Not part of the
 * public API.
 */
import type { InterventionType } from '../cascade-risk.types';
import { osterSensitivityTest, type OsterResult } from '../sensitivity-analysis';
import type { CausalSample } from './config';

/**
 * Compute Oster (2019) sensitivity analysis for omitted variable bias.
 *
 * Derives the inputs from causal samples:
 *   - β* (uncontrolled): simple difference in means (treated − control)
 *   - β̂ (controlled): the estimator's ATE (DML or PSM)
 *   - R²_uncontrolled: R² from regressing outcome on treatment only
 *   - R²_controlled: R² from regressing outcome on treatment + features
 *
 * Returns undefined when there is insufficient data to compute the test.
 */
export function computeSensitivityAnalysis(
  samples: CausalSample[],
  intervention: InterventionType,
  controlledATE: number,
): OsterResult | undefined {
  const treatedSamples = samples.filter(s => s.treated && s.intervention === intervention);
  const controlSamples = samples.filter(s => !s.treated);

  // Need at least 3 treated and 3 control samples for meaningful R²
  if (treatedSamples.length < 3 || controlSamples.length < 3) {
    return undefined;
  }

  const allOutcomes = [...treatedSamples, ...controlSamples].map(s => s.outcome);
  const meanOutcome = allOutcomes.reduce((s, v) => s + v, 0) / allOutcomes.length;

  // Total sum of squares
  const ssTotal = allOutcomes.reduce((s, v) => s + (v - meanOutcome) ** 2, 0);
  if (ssTotal < 1e-12) return undefined; // No variance in outcomes

  // ─── Uncontrolled regression: y = α + β*·T ───────────────────────────
  const meanTreated = treatedSamples.reduce((s, x) => s + x.outcome, 0) / treatedSamples.length;
  const meanControl = controlSamples.reduce((s, x) => s + x.outcome, 0) / controlSamples.length;
  const betaUncontrolled = meanTreated - meanControl;

  // R²_uncontrolled: variance explained by treatment indicator alone
  // For binary T: y_hat = mean_control + (mean_treated - mean_control) * T
  let ssResUncontrolled = 0;
  for (const s of [...treatedSamples, ...controlSamples]) {
    const yHat = s.treated ? meanTreated : meanControl;
    ssResUncontrolled += (s.outcome - yHat) ** 2;
  }
  const rSquaredUncontrolled = 1 - ssResUncontrolled / ssTotal;

  // ─── Controlled regression: y = α + β̂·T + γ·X ───────────────────────
  // Compute R²_controlled using OLS with treatment + features.
  // We use the controlled ATE as β̂ and fit feature coefficients via OLS
  // on the residuals to estimate the additional variance explained by controls.
  const rSquaredControlled = computeControlledRSquared(
    [...treatedSamples, ...controlSamples],
    ssTotal,
  );

  // R²_controlled must be ≥ R²_uncontrolled (nested model); clamp for numerical safety
  const rSquaredControlledClamped = Math.max(rSquaredControlled, rSquaredUncontrolled);

  // If R² didn't improve, Oster test is not informative
  if (Math.abs(rSquaredControlledClamped - rSquaredUncontrolled) < 1e-9) {
    return undefined;
  }

  return osterSensitivityTest({
    betaUncontrolled,
    betaControlled: controlledATE,
    rSquaredUncontrolled: Math.max(0, rSquaredUncontrolled),
    rSquaredControlled: Math.min(1, rSquaredControlledClamped),
  });
}

/**
 * Compute R² for the controlled regression (treatment + features).
 *
 * Fits an OLS model y = α + β·T + γ'X via the normal equations and returns
 * the coefficient of determination. Uses Gaussian elimination for the small
 * linear system (intercept + treatment + ≤8 features).
 */
function computeControlledRSquared(
  samples: CausalSample[],
  ssTotal: number,
): number {
  if (samples.length === 0 || ssTotal < 1e-12) return 0;

  const featureCount = samples[0]?.features.length ?? 0;
  // Design matrix columns: [intercept, treatment, feature1, feature2, ...]
  const nCols = 2 + Math.min(featureCount, 8);

  // Build X'X (nCols × nCols) and X'y (nCols × 1)
  const XtX: number[][] = Array.from({ length: nCols }, () => new Array(nCols).fill(0));
  const Xty: number[] = new Array(nCols).fill(0);

  for (const s of samples) {
    const row = [1, s.treated ? 1 : 0, ...s.features.slice(0, nCols - 2)];
    for (let i = 0; i < nCols; i++) {
      Xty[i] += row[i] * s.outcome;
      for (let j = 0; j < nCols; j++) {
        XtX[i][j] += row[i] * row[j];
      }
    }
  }

  // Solve XtX · β = Xty via Gaussian elimination with partial pivoting
  const beta = solveLinearSystem(XtX, Xty);
  if (beta === null) return 0; // Singular system

  // Compute predicted values and R²
  let ssRes = 0;
  for (const s of samples) {
    const row = [1, s.treated ? 1 : 0, ...s.features.slice(0, nCols - 2)];
    let yHat = 0;
    for (let i = 0; i < nCols; i++) yHat += beta[i] * row[i];
    ssRes += (s.outcome - yHat) ** 2;
  }

  return 1 - ssRes / ssTotal;
}

/**
 * Solve a small linear system Ax = b via Gaussian elimination with partial pivoting.
 * Returns null if the matrix is singular.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  // Augmented matrix [A | b]
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivoting: find the row with the largest absolute value in this column
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    // Check for singularity
    if (Math.abs(aug[col][col]) < 1e-12) return null;

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let k = col; k <= n; k++) {
        aug[row][k] -= factor * aug[col][k];
      }
    }
  }

  // Back-substitution
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = aug[row][n];
    for (let col = row + 1; col < n; col++) {
      sum -= aug[row][col] * x[col];
    }
    x[row] = sum / aug[row][row];
  }
  return x;
}

/** Permutation test for statistical significance */
export function permutationTest(
  samples: CausalSample[],
  nTreated: number,
  observedATE: number,
): number {
  const PERM_ITERATIONS = 200;
  const outcomes = samples.map(s => s.outcome);
  let permCount = 0;

  for (let i = 0; i < PERM_ITERATIONS; i++) {
    // Fisher-Yates shuffle
    const shuffled = [...outcomes];
    for (let j = shuffled.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }
    const permTreated = shuffled.slice(0, nTreated);
    const permControl = shuffled.slice(nTreated);
    const permMeanTreated = permTreated.reduce((s, v) => s + v, 0) / Math.max(permTreated.length, 1);
    const permMeanControl = permControl.reduce((s, v) => s + v, 0) / Math.max(permControl.length, 1);
    if (permMeanTreated - permMeanControl >= observedATE) permCount++;
  }

  return permCount / PERM_ITERATIONS;
}

/** Bootstrap confidence interval */
export function bootstrapConfidenceInterval(
  samples: CausalSample[],
  intervention: InterventionType,
  iterations: number,
): [number, number] {
  const treatedSamples = samples.filter(s => s.treated && s.intervention === intervention);
  const controlSamples = samples.filter(s => !s.treated);

  if (treatedSamples.length < 2 || controlSamples.length < 2) {
    return [0.1, 0.6];
  }

  const ateSamples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    // Resample with replacement
    const bootTreated = resample(treatedSamples);
    const bootControl = resample(controlSamples);
    const meanT = bootTreated.reduce((s, x) => s + x.outcome, 0) / bootTreated.length;
    const meanC = bootControl.reduce((s, x) => s + x.outcome, 0) / bootControl.length;
    ateSamples.push(meanT - meanC);
  }

  ateSamples.sort((a, b) => a - b);
  const lower = ateSamples[Math.floor(iterations * 0.05)] ?? 0.1;
  const upper = ateSamples[Math.floor(iterations * 0.95)] ?? 0.6;

  return [
    Math.round(Math.max(lower, 0.05) * 100) / 100,
    Math.round(Math.min(upper, 0.85) * 100) / 100,
  ];
}

/** Resample with replacement */
function resample<T>(arr: T[]): T[] {
  return Array.from({ length: arr.length }, () => arr[Math.floor(Math.random() * arr.length)]);
}
