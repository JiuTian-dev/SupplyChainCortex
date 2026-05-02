/**
 * Decision Passport — auditable decision provenance structure.
 *
 * Every engine decision output MUST carry a DecisionPassport that records:
 * - Confidence level and rule version at time of decision
 * - Data provenance chain (which upstream services provided input)
 * - Alternative options that were considered
 * - Audit metadata for compliance/archival
 *
 * This is the foundation for auditability (Dimension 2) and
 * downstream Bayesian calibration (Dimension 4).
 */

import { getConfigVersion } from './cache';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface DataProvenanceEntry {
  source: string;           // e.g. 'weather:open-meteo', 'fx:frankfurter', 'db:inventory'
  timestamp: string;        // ISO timestamp when data was fetched
  latencyMs: number;        // fetch duration
  status: 'ok' | 'degraded' | 'stale' | 'unavailable';
  version?: string;         // data version/hash if available
}

export interface AlternativeOption {
  action: string;           // alternative action description
  expectedImpact: string;   // quantified expected impact (e.g. "save ¥12,000/mo")
  confidence: number;       // 0-1 confidence in this alternative
  tradeoffs: string[];      // list of downsides/risks
}

export interface DecisionPassport {
  /** Unique audit identifier, stable across replays */
  auditId: string;
  /** ISO timestamp of decision generation */
  generatedAt: string;
  /** Engine that produced the decision */
  engine: 'cascade-risk' | 'decision-graph' | 'tariff' | 'workflow' | 'cost';
  /** Input parameters that triggered the decision */
  input: Record<string, unknown>;
  /** Overall confidence score (0-1), weighted across data sources */
  confidence: number;
  /** Config version hash at time of execution */
  ruleVersion: string;
  /** Data provenance chain — upstream sources used as input */
  dataProvenance: DataProvenanceEntry[];
  /** Alternative options considered, ranked by expected impact */
  alternatives: AlternativeOption[];
  /** Execution trace for replay/debugging */
  trace: {
    totalDurationMs: number;
    steps: Array<{ name: string; durationMs: number; status: string }>;
  };
  /** Warnings and degradation notes for human review */
  warnings: string[];
}

// ─── Passport Builder ────────────────────────────────────────────────────────────

let passportCounter = 0;

export interface PassportInput {
  engine: DecisionPassport['engine'];
  input: Record<string, unknown>;
  confidence: number;
  alternatives: AlternativeOption[];
  provenance: DataProvenanceEntry[];
  trace: DecisionPassport['trace'];
  warnings?: string[];
}

export function createPassport(p: PassportInput): DecisionPassport {
  return {
    auditId: `audit-${p.engine}-${Date.now()}-${++passportCounter}`,
    generatedAt: new Date().toISOString(),
    engine: p.engine,
    input: p.input,
    confidence: Math.min(1, Math.max(0, p.confidence)),
    ruleVersion: getConfigVersion(),
    dataProvenance: p.provenance,
    alternatives: p.alternatives.sort((a, b) => b.confidence - a.confidence),
    trace: p.trace,
    warnings: p.warnings ?? [],
  };
}

// ─── Provenance Helpers ──────────────────────────────────────────────────────────

export function provenanceEntry(
  source: string,
  latencyMs: number,
  status: DataProvenanceEntry['status'] = 'ok',
): DataProvenanceEntry {
  return {
    source,
    timestamp: new Date().toISOString(),
    latencyMs,
    status,
  };
}

export function degradedProvenance(source: string, latencyMs: number): DataProvenanceEntry {
  return provenanceEntry(source, latencyMs, 'degraded');
}

export function unavailableProvenance(source: string): DataProvenanceEntry {
  return { source, timestamp: new Date().toISOString(), latencyMs: 0, status: 'unavailable' };
}

// ─── Confidence Scoring ──────────────────────────────────────────────────────────

/**
 * Compute confidence based on data source availability.
 * Each data source contributes a weight; missing/degraded sources reduce confidence.
 *
 * @param weights - Map of source name → [weight, status]
 * @returns confidence 0-1
 */
export function computeConfidence(
  weights: Record<string, [number, 'ok' | 'degraded' | 'unavailable']>,
): number {
  let totalWeight = 0;
  let weightedScore = 0;

  for (const [, [weight, status]] of Object.entries(weights)) {
    totalWeight += weight;
    const statusMultiplier = status === 'ok' ? 1 : status === 'degraded' ? 0.7 : 0.3;
    weightedScore += weight * statusMultiplier;
  }

  return totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 100) / 100 : 0.5;
}

// ─── Serialization ───────────────────────────────────────────────────────────────

/**
 * Serialize a passport for frontend rendering.
 * Strips internal trace details, keeps everything needed for UI display.
 */
export function serializeForFrontend(passport: DecisionPassport): Record<string, unknown> {
  return {
    auditId: passport.auditId,
    generatedAt: passport.generatedAt,
    engine: passport.engine,
    confidence: passport.confidence,
    confidenceLabel: passport.confidence >= 0.9 ? '高' : passport.confidence >= 0.7 ? '中' : '低',
    ruleVersion: passport.ruleVersion,
    dataProvenance: passport.dataProvenance.map(p => ({
      source: p.source,
      status: p.status,
      latencyMs: p.latencyMs,
    })),
    alternatives: passport.alternatives.slice(0, 3).map(a => ({
      action: a.action,
      expectedImpact: a.expectedImpact,
      confidence: a.confidence,
    })),
    warnings: passport.warnings,
  };
}
