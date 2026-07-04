/**
 * Causal Estimator — Propensity Score Matching (PSM)
 *
 * Uses logistic-like propensity estimation and risk-band matching.
 * Serves as the fallback estimator for small samples (n < DML_MIN_SAMPLE_SIZE).
 */
import type { InterventionType, CausalEstimate } from '../cascade-risk.types';
import type { CausalSample } from './config';
import { computeSensitivityAnalysis, permutationTest } from './shared';

/**
 * Propensity Score Matching — existing algorithm, refactored for modularity.
 * Uses logistic-like propensity estimation and risk-band matching.
 */
export function estimatePSM(
  samples: CausalSample[],
  intervention: InterventionType,
  currentRiskLevel: number,
): CausalEstimate {
  const treatedSamples = samples.filter(s => s.treated && s.intervention === intervention);
  const controlSamples = samples.filter(s => !s.treated);
  const sampleSize = treatedSamples.length + controlSamples.length;

  const priors: Record<InterventionType, number> = {
    reroute: 0.25, safety_stock: 0.35, supplier_switch: 0.30, combined: 0.55,
  };

  if (sampleSize < 5 || treatedSamples.length === 0) {
    const priorATE = priors[intervention];
    return {
      intervention,
      ate: priorATE,
      confidenceInterval: [priorATE * 0.6, priorATE * 1.3],
      sampleSize,
      propensityScore: 0,
      pValue: 1.0,
      explanation: sampleSize < 5
        ? `样本不足 (${sampleSize}条)，使用领域先验估计`
        : `该干预类型无历史匹配 (${sampleSize}条通用样本)，使用领域先验`,
    };
  }

  // Propensity score
  const totalTreated = samples.filter(s => s.treated).length;
  const propensityScore = totalTreated / Math.max(samples.length, 1);

  // Risk-band matching
  const riskBand = currentRiskLevel * 0.3;
  const matchedTreated = treatedSamples.filter(
    s => Math.abs(s.features[0] - currentRiskLevel) <= riskBand || treatedSamples.length < 3,
  );
  const matchedControl = controlSamples.filter(
    s => Math.abs(s.features[0] - currentRiskLevel) <= riskBand || controlSamples.length < 3,
  );

  const meanTreated = (matchedTreated.length > 0 ? matchedTreated : treatedSamples)
    .reduce((s, x) => s + x.outcome, 0) / Math.max(matchedTreated.length || treatedSamples.length, 1);
  const meanControl = matchedControl.length > 0
    ? matchedControl.reduce((s, x) => s + x.outcome, 0) / matchedControl.length
    : 0;

  const rawATE = meanTreated - meanControl;
  const ate = Number.isFinite(rawATE) ? Math.min(Math.max(rawATE, 0.05), 0.85) : priors[intervention];

  // Confidence interval from empirical quantiles
  const improvements = (matchedTreated.length > 0 ? matchedTreated : treatedSamples).map(s => s.outcome);
  const sorted = [...improvements].sort((a, b) => a - b);
  const ci_lower = sorted[Math.floor(sorted.length * 0.1)] ?? ate * 0.5;
  const ci_upper = sorted[Math.floor(sorted.length * 0.9)] ?? ate * 1.5;

  // Permutation test
  const pValue = permutationTest(samples, treatedSamples.length, ate);

  // Oster (2019) sensitivity analysis for omitted variable bias
  const sensitivityAnalysis = computeSensitivityAnalysis(samples, intervention, ate);

  const reliable = sampleSize >= 10 && pValue < 0.1;
  const sensitivityWarning = sensitivityAnalysis && !sensitivityAnalysis.isRobust
    ? ` [⚠ 敏感性: δ=${sensitivityAnalysis.delta.toFixed(2)}, ${sensitivityAnalysis.recommendation}]`
    : '';
  return {
    intervention,
    ate,
    confidenceInterval: [Math.round(ci_lower * 100) / 100, Math.round(ci_upper * 100) / 100],
    sampleSize,
    propensityScore: Math.round(propensityScore * 100) / 100,
    pValue: Math.round(pValue * 1000) / 1000,
    explanation: reliable
      ? `PSM: 基于 ${sampleSize} 条历史样本 (p=${pValue.toFixed(3)})${sensitivityWarning}`
      : `PSM: 样本有限 (${sampleSize}条)，估计值仅供参考${sensitivityWarning}`,
    sensitivityAnalysis,
  };
}
