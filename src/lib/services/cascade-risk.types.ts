/**
 * Types for the Supply Chain Cascading Risk Propagation Engine v2
 *
 * Extracted from cascade-risk.service.ts for modularity.
 */
import type { CausalEdge } from '@/lib/engine/causal-reasoning';
import type { OsterResult } from './sensitivity-analysis';

export type NodeType = 'PORT' | 'SHIPMENT' | 'WAREHOUSE' | 'PRODUCT' | 'SUPPLIER';
export type EdgeType = 'DEPARTS_FROM' | 'ARRIVES_AT' | 'STORED_IN' | 'SUPPLIED_BY' | 'CARRIES';
export type FusionStrategy = 'weighted_sum' | 'max_impact' | 'threshold_lower';

export interface CascadeNode {
  id: string;
  type: NodeType;
  label: string;
  riskScore: number;
  initialRisk: number;
  propagatedRisk?: number;
  metadata: Record<string, unknown>;
}

export interface CascadeEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  attenuation: number;
  riskTransfer?: number;
  metadata: Record<string, unknown>;
}

export interface PropagationStep {
  nodeId: string;
  type: NodeType;
  label: string;
  path: string[];
  incomingRisk?: number;
  attenuation?: number;
  propagatedRisk: number;
  depth: number;
  metadata: Record<string, unknown>;
  riskScore: number;
  initialRisk: number;
  explanation: string;
  /** Estimated monthly dollar loss for this node */
  monetaryImpact?: number;
  /** How the monetary impact was computed */
  impactBreakdown?: string;
}

export interface DayProjection {
  day: number;
  date: string;
  riskScore?: number;
  affectedNodes?: number;
  newRisks?: string[];
  affectedShipments: number;
  cumulativeRevenueImpact: number;
  portRisks: Array<{ port: string; risk: number; weather: string }>;
  inventoryDepletionRisk: Array<{
    sku: string;
    productName: string;
    daysUntilDepletion: number;
    riskLevel: string;
  }>;
}

export interface CounterfactualResult {
  scenario: string;
  originalImpact: { affectedProducts: number; totalRisk: number };
  alternativeImpact: { affectedProducts: number; totalRisk: number };
  improvement: number;
  recommendation: string;
}

export interface CalibrationResult {
  edgeType: EdgeType;
  originalAttenuation: number;
  calibratedAttenuation: number;
  confidence: number;
  sampleSize: number;
  improvement: number;
  stdDev: number;
}

export interface BacktestResult {
  date: string;
  scenario: string;
  predicted: { affectedNodes: number; avgRisk: number };
  actual: { affectedNodes: number; avgRisk: number | null };
  accuracy: number | null;
}

/**
 * Model validation report attached to {@link CascadeReport}.
 *
 * Combines holdout-set metrics (for continuous risk-score predictions) with
 * Brier Score calibration assessment (for probabilistic event forecasts).
 *
 * @reference Brier (1950); Murphy (1973); Wilks (2011) §8.4–8.5;
 *           Hyndman & Athanasopoulos (2018) §5.8.
 */
export interface CascadeValidationReport {
  /** Markdown-formatted human-readable report. */
  markdown: string;
  /** Holdout metrics (continuous predictions vs actuals). */
  holdout?: {
    mse: number;
    rmse: number;
    mae: number;
    mape: number;
    rSquared: number;
    correlation: number;
    bias: number;
    isReliable: boolean;
    n: number;
  };
  /** Brier Score assessment (probabilistic forecasts vs binary outcomes). */
  brier?: {
    brierScore: number;
    reliability: number;
    resolution: number;
    uncertainty: number;
    skillScore: number;
    isCalibrated: boolean;
    n: number;
  };
  /** Overall pass/fail verdict. */
  passed: boolean;
}

export interface SensitivityResult {
  parameter: string;
  baseValue: number;
  perturbations: Array<{
    value: number;
    change: string;
    outputChange: number;
    outputStdDev: number;
  }>;
  isStable: boolean;
}

export interface CascadeReport {
  id?: string;
  timestamp?: string;
  overallRisk?: number;
  maxDepth?: number;
  triggeredBy: { source: string; description: string; timestamp: string };
  sourceNodes: Array<{ id: string; label: string; riskScore: number; cause: string }>;
  propagation: PropagationStep[];
  forwardProjection?: DayProjection[];
  causalEdges?: CausalEdge[];
  causalSummary?: string;
  counterfactuals?: CounterfactualResult[];
  /** SEIR epidemic contagion timeline (NEW) */
  seirTimeline?: SEIRTimeline;
  /** Data-driven causal ML counterfactuals (NEW) */
  causalCounterfactuals?: CausalCounterfactualResult[];
  /**
   * Model validation report (holdout + Brier Score).
   * Populated when historical data is available for backtesting.
   * @reference Brier (1950); Murphy (1973); Hyndman & Athanasopoulos (2018).
   */
  validation?: CascadeValidationReport;
  passport?: unknown;
  summary: {
    totalNodes: number;
    affectedNodes: number;
    maxDepth: number;
    maxRisk?: number;
    avgPropagatedRisk: number;
    criticalPaths: Array<{ path: string[]; totalRisk: number; description: string }>;
    topAffectedProducts: Array<{
      sku: string;
      productName: string;
      impactScore: number;
      propagationPath: string;
      explanation?: string;
      estimatedDelay: number;
      estimatedRevenueImpact: number;
      preventiveAction?: string;
    }>;
    totalMonthlyLoss: number;
    /** SEIR summary: peak infectious day and recovery horizon */
    seirSummary?: {
      peakDay: number;
      peakInfectious: number;
      recoveryHorizon: number;
      finalSusceptible: number;
      finalRecovered: number;
    };
  };
}

export interface PropagationRule {
  edgeType: EdgeType;
  overrideAttenuation?: number;
  condition?: { field: string; operator: string; value: string };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Monte Carlo & Snapshot Types (NEW)
// ═══════════════════════════════════════════════════════════════════════════════

export interface MonteCarloConfig {
  iterations: number;
  attenuationStdDev?: number;
  seed?: number;
}

export interface MonteCarloResult {
  nodeId: string;
  label: string;
  type: NodeType;
  meanRisk: number;
  stdDev: number;
  p5: number;
  p50: number;
  p95: number;
  iterations: number;
}

export interface RiskSnapshot {
  timestamp: string;
  scenario: string;
  report: CascadeReport;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEIR Hybrid Model Types
// ═══════════════════════════════════════════════════════════════════════════════

/** SEIRS states for supply chain risk contagion (R→S cycle for chronic vulnerability) */
export type SEIRSState = 'susceptible' | 'exposed' | 'infectious' | 'recovered';

/** @deprecated Use SEIRSState instead */
export type SEIRState = SEIRSState;

export interface SEIRSConfig {
  /** Transmission rate: how fast risk spreads to susceptible neighbors (0-1) */
  beta: number;
  /** Incubation rate: how fast exposed nodes become infectious (0-1) */
  sigma: number;
  /** Recovery rate: how fast infectious nodes recover (0-1) */
  gamma: number;
  /** Waning immunity rate: how fast recovered nodes become susceptible again (0-1) */
  /** This is the key SEIRS extension: R→S cycle models chronic supply chain vulnerability */
  xi: number;
  /** Number of time-step iterations (each = 1 day) */
  timeSteps: number;
  /** Risk threshold for S→E transition */
  exposureThreshold: number;
  /** Risk threshold for E→I transition */
  infectiousThreshold: number;
  /** Risk threshold for I→R transition (below this = recovered) */
  recoveryThreshold: number;
  /** Risk threshold for R→S transition (above this = susceptible again) */
  resusceptibilityThreshold: number;
}

export interface SEIRSConfigLegacy {
  beta: number;
  sigma: number;
  gamma: number;
  timeSteps: number;
  exposureThreshold: number;
  infectiousThreshold: number;
  recoveryThreshold: number;
}

/** @deprecated Use SEIRSConfig instead */
export type SEIRConfig = SEIRSConfigLegacy;

export interface SEIRSNodeState {
  nodeId: string;
  label: string;
  type: NodeType;
  state: SEIRSState;
  risk: number;
  /** Day when state transition occurred */
  transitionDay: number;
  /** History of risk values over time */
  riskHistory: number[];
  /** Number of times this node has cycled through R→S */
  reinfectionCount: number;
}

/** @deprecated Use SEIRSNodeState instead */
export type SEIRNodeState = Omit<SEIRSNodeState, 'reinfectionCount'>;

export interface SEIRSTimeline {
  /** Per-day snapshot of all node states */
  days: Array<{
    day: number;
    date: string;
    susceptible: number;
    exposed: number;
    infectious: number;
    recovered: number;
    peakRisk: number;
  }>;
  /** Final node states */
  finalStates: SEIRSNodeState[];
  /** Day when infectious count peaks */
  peakDay: number;
  /** Maximum infectious count */
  peakInfectious: number;
  /** Estimated days to full recovery */
  recoveryHorizon: number;
  /** Basic reproduction number R₀ — if > 1, epidemic spreads */
  R0: number;
  /** Effective reproduction number Rₜ at end of simulation */
  Rt: number;
  /** Whether the system exhibits chronic vulnerability (R→S cycling) */
  isChronic: boolean;
  /** Number of nodes that cycled through R→S at least once */
  reinfectionCount: number;
}

/** @deprecated Use SEIRSTimeline instead */
export type SEIRTimeline = SEIRSTimeline;

// ═══════════════════════════════════════════════════════════════════════════════
// Causal ML Counterfactual Types
// ═══════════════════════════════════════════════════════════════════════════════

export type InterventionType = 'reroute' | 'safety_stock' | 'supplier_switch' | 'combined';

export interface CausalEstimate {
  /** The intervention being evaluated */
  intervention: InterventionType;
  /** Average Treatment Effect: how much risk is reduced */
  ate: number;
  /** Confidence interval [lower, upper] */
  confidenceInterval: [number, number];
  /** Number of historical samples used */
  sampleSize: number;
  /** Propensity score: probability this intervention was applied historically */
  propensityScore: number;
  /** Statistical significance (p-value from permutation test) */
  pValue: number;
  /** Human-readable explanation */
  explanation: string;
  /**
   * Oster (2019) coefficient stability test — omitted variable bias sensitivity.
   * Present when enough data is available to compute controlled vs uncontrolled estimates.
   * If `isRobust` is false, the ATE may be sensitive to unobserved confounders.
   */
  sensitivityAnalysis?: OsterResult;
}

export interface CausalCounterfactualResult {
  scenario: string;
  intervention: InterventionType;
  /** Data-driven risk reduction (replaces hardcoded) */
  estimatedReduction: number;
  /** Confidence interval for the estimate */
  confidenceInterval: [number, number];
  /** Causal estimate details */
  causalEstimate: CausalEstimate;
  originalImpact: { affectedProducts: number; totalRisk: number };
  alternativeImpact: { affectedProducts: number; totalRisk: number };
  improvement: number;
  recommendation: string;
  /** Whether the estimate is reliable (sufficient data) */
  isReliable: boolean;
}
