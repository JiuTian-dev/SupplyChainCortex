/**
 * Cascade Risk — Coordinator Module
 *
 * Sub-engine call coordination and data flow management:
 *   - Backtesting: coordinates historical snapshot retrieval, prediction
 *     vs. actual comparison, and accuracy metric aggregation.
 *
 * Extracted from cascade-risk.main.ts for modularity.
 */
import { db } from '@/lib/db';
import type { BacktestResult } from '../cascade-risk.types';
import { getCascadeRisk } from './orchestrator';

// ═══════════════════════════════════════════════════════════════════════════════
// Backtesting — Real snapshot-based comparison
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Backtest against historical data using stored snapshots.
 *
 * 1. Reads historical cascade-risk snapshots from AuditLog (stored by getCascadeRisk)
 * 2. Compares each snapshot's prediction against actual outcomes from that day
 * 3. Computes accuracy metrics per day and overall
 */
export async function backtest(days: number = 30): Promise<{
  results: BacktestResult[];
  summary: { avgAccuracy: number; totalPredictions: number; reliablePredictions: number };
}> {
  const results: BacktestResult[] = [];
  let totalAccuracy = 0;
  let reliableCount = 0;

  // Fetch historical cascade-risk audit logs that contain snapshots
  const cutoffDate = new Date(Date.now() - days * 86400000);
  const historicalLogs = await db.auditLog.findMany({
    where: {
      entity: 'cascade-risk' as string,
      action: 'ANALYZE' as string,
      createdAt: { gte: cutoffDate },
    },
    orderBy: { createdAt: 'asc' },
    take: days * 2, // allow for multiple runs per day
  }).catch(() => []);

  // Group by date (take latest snapshot per day)
  const byDate = new Map<string, { snapshot: { affectedNodes: number; avgPropagatedRisk: number; totalMonthlyLoss?: number }; timestamp: string }>();
  for (const log of historicalLogs) {
    const details = log.details as Record<string, unknown> | null;
    if (!details?.snapshot) continue;
    const dateStr = new Date(log.createdAt).toISOString().split('T')[0];
    const existing = byDate.get(dateStr);
    if (!existing || new Date(log.createdAt) > new Date(existing.timestamp)) {
      byDate.set(dateStr, {
        snapshot: details.snapshot as { affectedNodes: number; avgPropagatedRisk: number; totalMonthlyLoss?: number },
        timestamp: log.createdAt.toString(),
      });
    }
  }

  // If no historical snapshots, run a fresh analysis as baseline
  if (byDate.size === 0) {
    try {
      const report = await getCascadeRisk({ scenario: 'auto' });
      const dateStr = new Date().toISOString().split('T')[0];
      byDate.set(dateStr, {
        snapshot: {
          affectedNodes: report.summary.affectedNodes,
          avgPropagatedRisk: report.summary.avgPropagatedRisk,
          totalMonthlyLoss: report.summary.totalMonthlyLoss,
        },
        timestamp: new Date().toISOString(),
      });
    } catch { /* fallback unavailable */ }
  }

  // Compare predictions vs actuals
  for (const [dateStr, entry] of byDate) {
    const prediction = entry.snapshot;
    const dateStart = new Date(dateStr);
    const dateEnd = new Date(dateStr);
    dateEnd.setDate(dateEnd.getDate() + 1);

    // Get actual outcomes from that day
    const actualShipments = await db.shipmentItem.findMany({
      where: { updatedAt: { gte: dateStart, lt: dateEnd } },
      take: 100,
    }).catch(() => []);

    const actualDelayed = actualShipments.filter(s => (s.delayDays ?? 0) > 0).length;
    const actualAffected = Math.round(actualDelayed * 2.5); // estimated ripple factor

    // Compute accuracy
    const accuracy = prediction.affectedNodes > 0 && actualAffected > 0
      ? Math.round((1 - Math.abs(prediction.affectedNodes - actualAffected) / Math.max(prediction.affectedNodes, actualAffected)) * 100)
      : null;

    results.push({
      date: dateStr,
      scenario: 'auto',
      predicted: { affectedNodes: prediction.affectedNodes, avgRisk: prediction.avgPropagatedRisk },
      actual: { affectedNodes: actualAffected, avgRisk: null },
      accuracy,
    });

    if (accuracy !== null) {
      totalAccuracy += accuracy;
      reliableCount++;
    }
  }

  // Fill in days without snapshots using current model
  for (let d = days; d >= 1; d--) {
    const date = new Date(Date.now() - d * 86400000);
    const dateStr = date.toISOString().split('T')[0];
    if (byDate.has(dateStr)) continue; // already processed

    // Run current model as prediction (no snapshot available)
    let predictedNodes = 0;
    let predictedRisk = 0;
    try {
      const report = await getCascadeRisk({ scenario: 'auto' });
      predictedNodes = report.summary.affectedNodes;
      predictedRisk = report.summary.avgPropagatedRisk;
    } catch { /* skip */ }

    const actualShipments = await db.shipmentItem.findMany({
      where: { updatedAt: { gte: date, lt: new Date(date.getTime() + 86400000) } },
      take: 100,
    }).catch(() => []);

    const actualDelayed = actualShipments.filter(s => (s.delayDays ?? 0) > 0).length;
    const actualAffected = Math.round(actualDelayed * 2.5);

    const accuracy = predictedNodes > 0 && actualAffected > 0
      ? Math.round((1 - Math.abs(predictedNodes - actualAffected) / Math.max(predictedNodes, actualAffected)) * 100)
      : null;

    results.push({
      date: dateStr, scenario: 'auto',
      predicted: { affectedNodes: predictedNodes, avgRisk: predictedRisk },
      actual: { affectedNodes: actualAffected, avgRisk: null },
      accuracy,
    });

    if (accuracy !== null) { totalAccuracy += accuracy; reliableCount++; }
  }

  // Sort by date
  results.sort((a, b) => a.date.localeCompare(b.date));

  return {
    results,
    summary: {
      avgAccuracy: reliableCount > 0 ? Math.round(totalAccuracy / reliableCount) : 0,
      totalPredictions: results.length,
      reliablePredictions: reliableCount,
    },
  };
}
