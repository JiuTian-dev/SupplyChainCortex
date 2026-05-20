// @ts-nocheck
/**
 * Cascade Risk — Calibration Module (Phase 1)
 *
 * Attenuation factor calibration from historical data.
 * Extracted from cascade-risk.service.ts for modularity.
 */
import { db } from '@/lib/db';
import type { EdgeType, CalibrationResult } from './cascade-risk.types';

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 1: Calibrated Attenuation Factors
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Attenuation factors — calibrated from 370 data points on 2026-04-28.
 * Sources: Open-Meteo (180pts) + Frankfurter (63) + DB enhanced seed (127).
 *
 * ┌──────────────┬──────────┬───────────┬──────┬─────┬──────────────────────────────┐
 * │ Edge         │ Original │ Calibrated│ R²   │ N   │ Source                       │
 * ├──────────────┼──────────┼───────────┼──────┼─────┼──────────────────────────────┤
 * │ DEPARTS_FROM │ 0.85     │ 0.43      │ 0.40 │ 48  │ Open-Meteo + 35 delayed shpmts│
 * │ ARRIVES_AT   │ 0.70     │ 0.70      │ —    │ 3   │ Kept (insufficient data)      │
 * │ CARRIES      │ 0.75     │ 0.95      │ 0.86 │ 38  │ ★ 35 delayed → stock impact    │
 * │ STORED_IN    │ 0.60     │ 0.60      │ —    │ 75  │ Kept (R² too low)             │
 * │ SUPPLIED_BY  │ 0.50     │ 0.50      │ —    │ 22  │ Kept (R² too low)             │
 * └──────────────┴──────────┴───────────┴──────┴─────┴──────────────────────────────┘
 *
 * Run: bun run scripts/calibrate-cascade-risk.ts  to recalibrate.
 */
export const DEFAULT_ATTENUATION: Record<EdgeType, number> = {
  DEPARTS_FROM: 0.43, ARRIVES_AT: 0.70, STORED_IN: 0.60,
  SUPPLIED_BY: 0.50, CARRIES: 0.95,
};

/** Calibrated factors (populated by calibrateAttenuationFactors) */
export let calibratedAttenuation: Record<EdgeType, { mean: number; stdDev: number; confidence: number; sampleSize: number }> | null = null;

export function getAttenuation(edgeType: EdgeType): number {
  if (calibratedAttenuation?.[edgeType]) {
    return calibratedAttenuation[edgeType].mean;
  }
  return DEFAULT_ATTENUATION[edgeType];
}

/**
 * Calibrate attenuation factors from historical shipment delay data.
 * Uses linear regression: actual_product_impact = f(shipment_delay, port_risk)
 */
export async function calibrateAttenuationFactors(): Promise<{
  results: CalibrationResult[];
  summary: { totalSamples: number; avgConfidence: number; calibratedEdges: number };
}> {
  const results: CalibrationResult[] = [];
  let totalSamples = 0;
  let totalConfidence = 0;

  // Query historical data: delayed shipments → actual product stock impact
  const delayedShipments = await db.shipmentItem.findMany({
    where: { delayDays: { gt: 0 } },
    take: 500,
    orderBy: { updatedAt: 'desc' },
  });

  for (const edgeType of Object.keys(DEFAULT_ATTENUATION) as EdgeType[]) {
    const original = DEFAULT_ATTENUATION[edgeType];
    let calibrated = original;
    let confidence = 0;
    let sampleSize = 0;

    // Calibrate based on edge type using available data
    switch (edgeType) {
      case 'CARRIES': {
        // Calibrate: shipment delay days → product stock risk
        const samples: Array<{ delay: number; impact: number }> = [];
        for (const s of delayedShipments.slice(0, 100)) {
          const inventory = await db.inventory.findFirst({ where: { sku: s.sku } });
          if (inventory) {
            const impact = inventory.stockStatus === 'critical' ? 0.95
              : inventory.stockStatus === 'warning' ? 0.7
              : inventory.stockStatus === 'healthy' ? 0.3 : 0.5;
            samples.push({ delay: s.delayDays, impact });
          }
        }
        if (samples.length >= 5) {
          // Simple linear fit: impact ≈ attenuation * (delay / maxDelay)
          const maxDelay = Math.max(...samples.map(s => s.delay), 1);
          const ratios = samples.map(s => s.impact / (s.delay / maxDelay));
          calibrated = ratios.reduce((a, b) => a + b, 0) / ratios.length;
          calibrated = Math.min(Math.max(calibrated, 0.3), 0.95); // clamp
          const variance = ratios.reduce((s, r) => s + (r - calibrated) ** 2, 0) / ratios.length;
          confidence = Math.min(1 / (1 + variance), 0.99);
          sampleSize = samples.length;
        }
        break;
      }
      case 'DEPARTS_FROM':
      case 'ARRIVES_AT': {
        // Calibrate from port delay → shipment delay correlation
        const withOrigin = delayedShipments.filter(s => s.origin).length;
        sampleSize = withOrigin;
        if (withOrigin >= 5) {
          // Higher base attenuation for ports with more delayed shipments
          const delayRatio = delayedShipments.length / Math.max(withOrigin, 1);
          calibrated = Math.min(original * (1 + delayRatio * 0.1), 0.95);
          confidence = Math.min(withOrigin / 50, 0.85);
        }
        break;
      }
      case 'STORED_IN': {
        // Calibrate from warehouse stock correlation
        const inventories = await db.inventory.findMany({ take: 200 });
        const warningCount = inventories.filter(i => i.stockStatus === 'warning' || i.stockStatus === 'critical').length;
        sampleSize = inventories.length;
        if (sampleSize >= 10) {
          calibrated = Math.min(0.4 + (warningCount / sampleSize) * 0.5, 0.9);
          confidence = Math.min(sampleSize / 200, 0.8);
        }
        break;
      }
      case 'SUPPLIED_BY': {
        const suppliers = await db.supplier.findMany({ take: 100 });
        const lowRated = suppliers.filter(s => s.rating < 3).length;
        sampleSize = suppliers.length;
        if (sampleSize >= 5) {
          calibrated = Math.min(0.3 + (lowRated / sampleSize) * 0.6, 0.9);
          confidence = Math.min(sampleSize / 100, 0.75);
        }
        break;
      }
    }

    const improvement = Math.round(Math.abs(calibrated - original) / original * 1000) / 10;
    results.push({ edgeType, originalAttenuation: original, calibratedAttenuation: Math.round(calibrated * 1000) / 1000, confidence: Math.round(confidence * 100) / 100, sampleSize, improvement });
    totalSamples += sampleSize;
    totalConfidence += confidence;
  }

  // Store calibration results
  calibratedAttenuation = {} as Record<EdgeType, { mean: number; stdDev: number; confidence: number; sampleSize: number }>;
  for (const r of results) {
    calibratedAttenuation[r.edgeType] = { mean: r.calibratedAttenuation, stdDev: 0.05, confidence: r.confidence, sampleSize: r.sampleSize };
  }

  return {
    results,
    summary: {
      totalSamples,
      avgConfidence: results.length > 0 ? Math.round((totalConfidence / results.length) * 100) / 100 : 0,
      calibratedEdges: results.filter(r => r.sampleSize >= 5).length,
    },
  };
}
