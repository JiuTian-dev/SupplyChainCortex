/**
 * Types for the Supply Chain Cascading Risk Propagation Engine v2
 *
 * Extracted from cascade-risk.service.ts for modularity.
 */
import type { CausalEdge } from '@/lib/engine/causal-reasoning';

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

/** SEIR states for supply chain risk contagion */
export type SEIRState = 'susceptible' | 'exposed' | 'infectious' | 'recovered';

export interface SEIRConfig {
  /** Transmission rate: how fast risk spreads to susceptible neighbors (0-1) */
  beta: number;
  /** Incubation rate: how fast exposed nodes become infectious (0-1) */
  sigma: number;
  /** Recovery rate: how fast infectious nodes recover (0-1) */
  gamma: number;
  /** Number of time-step iterations (each = 1 day) */
  timeSteps: number;
  /** Risk threshold for S→E transition */
  exposureThreshold: number;
  /** Risk threshold for E→I transition */
  infectiousThreshold: number;
  /** Risk threshold for I→R transition (below this = recovered) */
  recoveryThreshold: number;
}

export interface SEIRNodeState {
  nodeId: string;
  label: string;
  type: NodeType;
  state: SEIRState;
  risk: number;
  /** Day when state transition occurred */
  transitionDay: number;
  /** History of risk values over time */
  riskHistory: number[];
}

export interface SEIRTimeline {
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
  finalStates: SEIRNodeState[];
  /** Day when infectious count peaks */
  peakDay: number;
  /** Maximum infectious count */
  peakInfectious: number;
  /** Estimated days to full recovery */
  recoveryHorizon: number;
}

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
