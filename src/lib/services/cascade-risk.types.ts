// @ts-nocheck
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
  id?: string; type?: NodeType; label?: string;
  riskScore?: number; initialRisk?: number; propagatedRisk?: number;
  metadata?: Record<string, unknown>;
}

export interface CascadeEdge {
  id?: string; source?: string; target?: string;
  type?: EdgeType; attenuation?: number; riskTransfer?: number; from?: string; to?: string; metadata?: Record<string, unknown>;
}

export interface PropagationStep {
  nodeId?: string; type?: NodeType; label?: string;
  path?: string[]; incomingRisk?: number;
  attenuation?: number; propagatedRisk?: number;
  depth?: number;
  metadata?: Record<string, unknown>;
  riskScore?: number;
  initialRisk?: number;
  explanation?: string;
  from?: string;
  /** Estimated monthly dollar loss for this node */
  monetaryImpact?: number;
  /** How the monetary impact was computed */
  impactBreakdown?: string;
}

export interface DayProjection {
  day?: number; date?: string;
  riskScore?: number; affectedNodes?: number;
  newRisks?: string[];
  risk?: number;
  affectedShipments?: number;
  cumulativeRevenueImpact?: number;
  portRisks?: Array<{ port?: string; riskLevel?: number; weather?: string; risk?: number }>;
  inventoryDepletionRisk?: Array<{ sku?: string; productName?: string; depletionDays?: number; riskScore?: number; riskLevel?: string; daysUntilDepletion?: number }>;
}

export interface CounterfactualResult {
  scenario?: string;
  question?: string; originalOutcome?: string;
  alternativeOutcome?: string; riskDelta?: number;
  recommendation?: string;
  originalImpact: { affectedProducts?: number; totalRisk?: number };
  alternativeImpact: { affectedProducts?: number; totalRisk?: number };
  improvement?: number;
}

export interface CalibrationResult {
  edgeType?: EdgeType;
  originalAttenuation?: number;
  calibratedAttenuation?: number;
  confidence?: number;
  sampleSize?: number;
  improvement?: number;
}

export interface BacktestResult {
  date?: string; actualRisk?: number;
  predictedRisk?: number; error?: number;
  withinBounds?: boolean;
  scenario?: string;
  predicted: { affectedNodes?: number; avgRisk?: number | null };
  actual: { affectedNodes?: number; avgRisk?: number | null };
  accuracy?: number | null;
}

export interface SensitivityResult {
  parameter?: string; baseValue?: number;
  perturbations?: Array<{ value?: number; change?: string; outputChange?: number; outputStdDev?: number }>;
  isStable?: boolean;
}

export interface CascadeReport {
  id?: string; timestamp?: string;
  overallRisk?: number;
  summary: { totalNodes?: number; affectedNodes?: number; maxRisk?: number; avgRisk?: number; avgPropagatedRisk?: number; topAffectedProducts?: string[]; totalMonthlyLoss?: number };
  topRisks?: Array<{ nodeId?: string; type?: NodeType; label?: string; riskScore?: number }>;
  propagation?: PropagationStep[];
  propagationPaths?: PropagationStep[];
  projections?: DayProjection[];
  counterfactuals?: CounterfactualResult[];
  calibration?: CalibrationResult[];
  affectedNodes?: number;
  maxDepth?: number;
  scenario?: string;
  /** Direction A: causal chain explanations for each propagation edge */
  causalEdges?: CausalEdge[];
  /** Direction A: natural language causal summary */
  causalSummary?: string;
}

export interface PropagationRule {
  edgeTypes?: EdgeType[];
  attenuationMultiplier?: number;
  condition?: { field?: string; operator?: string; value?: string }; edgeType?: EdgeType; overrideAttenuation?: number;
}
