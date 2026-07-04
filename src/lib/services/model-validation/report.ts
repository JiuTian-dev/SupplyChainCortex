/**
 * Model Validation — Comprehensive Validation Report
 *
 * Combines holdout metrics and Brier Score assessment into a Markdown
 * report for inclusion in risk reports.
 */
import type { ValidationReportInput, ValidationReport } from './types';
import { holdoutValidation } from './holdout';
import { brierScore } from './brier';

/**
 * Generate a comprehensive Markdown validation report.
 *
 * - If `predictions` + `actuals` are provided, computes holdout metrics.
 * - If `forecasts` + `outcomes` are provided, computes the Brier assessment.
 * - Both may be provided simultaneously for a hybrid model.
 *
 * @example
 *   const report = generateValidationReport({
 *     predictions: [60, 70, 80],
 *     actuals: [58, 72, 79],
 *     forecasts: [0.6, 0.7, 0.8],
 *     outcomes: [1, 1, 0],
 *     modelName: 'cascade-risk-v2.9.3',
 *   });
 */
export function generateValidationReport(input: ValidationReportInput): ValidationReport {
  const {
    predictions, actuals, forecasts, outcomes,
    numBins = 10, modelName = 'cascade-risk',
  } = input;

  const hasHoldout = Array.isArray(predictions) && Array.isArray(actuals)
    && predictions.length > 0 && predictions.length === actuals.length;
  const hasBrier = Array.isArray(forecasts) && Array.isArray(outcomes)
    && forecasts.length > 0 && forecasts.length === outcomes.length;

  if (!hasHoldout && !hasBrier) {
    throw new Error(
      'generateValidationReport: must provide either (predictions + actuals) or (forecasts + outcomes)',
    );
  }

  const holdout = hasHoldout ? holdoutValidation(predictions!, actuals!) : undefined;
  const brier = hasBrier ? brierScore(forecasts!, outcomes!, numBins) : undefined;

  const lines: string[] = [];
  lines.push(`# Model Validation Report — ${modelName}`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  if (holdout) {
    lines.push('## A. Holdout Set Validation (Continuous Predictions)');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| N | ${holdout.n} |`);
    lines.push(`| MSE | ${holdout.mse} |`);
    lines.push(`| RMSE | ${holdout.rmse} |`);
    lines.push(`| MAE | ${holdout.mae} |`);
    lines.push(`| MAPE (%) | ${holdout.mape} |`);
    lines.push(`| R² | ${holdout.rSquared} |`);
    lines.push(`| Pearson r | ${holdout.correlation} |`);
    lines.push(`| Bias (pred − actual) | ${holdout.bias} |`);
    lines.push(`| Reliable (RMSE < 0.2·σ) | ${holdout.isReliable ? '✅ yes' : '❌ no'} |`);
    lines.push('');
  }

  if (brier) {
    lines.push('## B. Brier Score Calibration (Probabilistic Forecasts)');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| N | ${brier.n} |`);
    lines.push(`| Brier Score | ${brier.brierScore} |`);
    lines.push(`| Reliability (REL) | ${brier.reliability} |`);
    lines.push(`| Resolution (RES) | ${brier.resolution} |`);
    lines.push(`| Uncertainty (UNC) | ${brier.uncertainty} |`);
    lines.push(`| Skill Score (vs climatology) | ${brier.skillScore} |`);
    lines.push(`| Calibrated (REL < 0.05) | ${brier.isCalibrated ? '✅ yes' : '❌ no'} |`);
    lines.push('');
    lines.push('### Calibration Curve (Reliability Diagram)');
    lines.push('');
    lines.push('| Bin center | Forecast prob | Observed freq | Count |');
    lines.push('|---:|---:|---:|---:|');
    for (const pt of brier.calibrationCurve) {
      lines.push(
        `| ${pt.binCenter} | ${pt.forecastProbability} | ${pt.observedFrequency} | ${pt.count} |`,
      );
    }
    lines.push('');
    lines.push('_References: Brier (1950); Murphy (1973); Wilks (2011) §8.4–8.5._');
    lines.push('');
  }

  const passed = (!holdout || holdout.isReliable) && (!brier || brier.isCalibrated);
  lines.push('## Verdict');
  lines.push('');
  lines.push(passed ? '✅ **PASS** — model meets reliability and calibration thresholds.' : '❌ **FAIL** — see metrics above.');
  lines.push('');

  return {
    markdown: lines.join('\n'),
    holdout,
    brier,
    passed,
  };
}
