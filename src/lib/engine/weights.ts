/**
 * Calibrated Confidence Weights — Bayesian posterior for source reliability.
 *
 * Each engine source (weather, fx, db:inventory, db:shipments, db:suppliers)
 * starts with equal weight. As user feedback accumulates, weights are updated
 * based on the posterior probability that a source contributed to a good decision.
 *
 * Persistence: DB table + in-memory cache for fast reads.
 * Auto-calibrated by A1 pipeline on each /api/engine-calibrate?action=apply call.
 */

import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface SourceWeight {
  source: string;
  weight: number;       // 0-1, normalized so sum = 1 across all sources
  alpha: number;        // Bayesian alpha (accepted + prior)
  beta: number;         // Bayesian beta (rejected + prior)
  sampleSize: number;   // total feedback samples for this source
  lastUpdated: string;
}

export interface CalibratedWeights {
  version: string;
  engine: string;
  sources: SourceWeight[];
  totalSamples: number;
  calibratedAt: string;
}

// ─── Default Weights ─────────────────────────────────────────────────────────────

const DEFAULT_SOURCES = [
  'weather:open-meteo',
  'fx:frankfurter',
  'db:inventory',
  'db:shipments',
  'db:suppliers',
];

function defaultWeights(engine: string): CalibratedWeights {
  return {
    version: '1.0.0',
    engine,
    sources: DEFAULT_SOURCES.map(s => ({
      source: s,
      weight: 1 / DEFAULT_SOURCES.length,
      alpha: 1,  // Prior: 1 pseudo-count
      beta: 1,   // Prior: 1 pseudo-count
      sampleSize: 0,
      lastUpdated: new Date().toISOString(),
    })),
    totalSamples: 0,
    calibratedAt: new Date().toISOString(),
  };
}

// ─── In-Memory Store ─────────────────────────────────────────────────────────────

const weightCache = new Map<string, CalibratedWeights>();

export function getCalibratedWeights(engine: string): CalibratedWeights {
  if (!weightCache.has(engine)) {
    weightCache.set(engine, defaultWeights(engine));
  }
  return weightCache.get(engine)!;
}

export function getSourceWeights(engine: string): Record<string, number> {
  const weights = getCalibratedWeights(engine);
  const map: Record<string, number> = {};
  for (const s of weights.sources) {
    map[s.source] = s.weight;
  }
  return map;
}

// ─── Bayesian Update ─────────────────────────────────────────────────────────────

export interface CalibrationInput {
  engine: string;
  source: string;
  accepted: boolean;
}

/**
 * Update weights using Bayesian posterior.
 * alpha += accepted ? 1 : 0
 * beta  += accepted ? 0 : 1
 * weight = alpha / (alpha + beta)  [posterior mean of Beta distribution]
 */
export function updateWeights(inputs: CalibrationInput[]): CalibratedWeights | null {
  if (inputs.length === 0) return null;

  const engine = inputs[0].engine;
  const weights = getCalibratedWeights(engine);

  // Group by source
  const bySource = new Map<string, { accepted: number; rejected: number }>();
  for (const inp of inputs) {
    const s = bySource.get(inp.source) || { accepted: 0, rejected: 0 };
    if (inp.accepted) s.accepted++; else s.rejected++;
    bySource.set(inp.source, s);
  }

  // Update each source
  for (const src of weights.sources) {
    const updates = bySource.get(src.source);
    if (!updates) continue;

    src.alpha += updates.accepted;
    src.beta += updates.rejected;
    src.sampleSize += updates.accepted + updates.rejected;
    src.lastUpdated = new Date().toISOString();
  }

  // Renormalize weights
  const totalAlpha = weights.sources.reduce((s, sw) => s + sw.alpha, 0);
  const totalBeta = weights.sources.reduce((s, sw) => s + sw.beta, 0);

  for (const src of weights.sources) {
    src.weight = totalAlpha + totalBeta > 0
      ? Math.round(src.alpha / (src.alpha + src.beta) * 10000) / 10000
      : 1 / weights.sources.length;
  }

  // Normalize to sum = 1
  const totalWeight = weights.sources.reduce((s, sw) => s + sw.weight, 0);
  if (totalWeight > 0) {
    for (const src of weights.sources) {
      src.weight = Math.round(src.weight / totalWeight * 10000) / 10000;
    }
  }

  weights.totalSamples += inputs.length;
  weights.version = `${weights.totalSamples}.${Date.now().toString(36)}`;
  weights.calibratedAt = new Date().toISOString();

  // Persist to DB
  persistWeights(weights).catch(() => {});

  return weights;
}

// ─── Persistence ─────────────────────────────────────────────────────────────────

async function persistWeights(weights: CalibratedWeights): Promise<void> {
  await db.engineWeight.upsert({
    where: { engine: weights.engine },
    create: {
      engine: weights.engine,
      version: weights.version,
      sourcesJson: JSON.stringify(weights.sources),
      totalSamples: weights.totalSamples,
      calibratedAt: weights.calibratedAt,
    },
    update: {
      version: weights.version,
      sourcesJson: JSON.stringify(weights.sources),
      totalSamples: weights.totalSamples,
      calibratedAt: weights.calibratedAt,
    },
  });
}

export async function loadWeightsFromDB(engine: string): Promise<CalibratedWeights | null> {
  try {
    const row = await db.engineWeight.findUnique({ where: { engine } });
    if (!row) return null;

    const sources = JSON.parse(row.sourcesJson) as SourceWeight[];
    const weights: CalibratedWeights = {
      version: row.version,
      engine: row.engine,
      sources,
      totalSamples: row.totalSamples,
      calibratedAt: row.calibratedAt,
    };
    weightCache.set(engine, weights);
    return weights;
  } catch {
    return null;
  }
}

// ─── Export for computeConfidence integration ────────────────────────────────────

/**
 * Build a confidence weight map compatible with computeConfidence().
 * Status 'ok' is assumed for all sources (the weight itself encodes reliability).
 */
export function buildConfidenceWeights(engine: string): Record<string, [number, 'ok' | 'degraded' | 'unavailable']> {
  const weights = getSourceWeights(engine);
  const result: Record<string, [number, 'ok' | 'degraded' | 'unavailable']> = {};
  for (const [source, weight] of Object.entries(weights)) {
    result[source] = [weight, 'ok'];
  }
  return result;
}
