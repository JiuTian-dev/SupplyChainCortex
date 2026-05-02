/**
 * Decision Quality Anomaly Detection (A3).
 *
 * Monitors engine acceptance rates over time. When calibrated acceptance
 * drops >2σ below the rolling mean, triggers an alert and recommends
 * rollback to the last known good weights.
 *
 * Detection method: Z-score on rolling window (last N calibration points).
 */

import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface QualityPoint {
  timestamp: string;
  acceptanceRate: number;
  sampleSize: number;
  engine: string;
}

export interface AnomalyAlert {
  engine: string;
  detectedAt: string;
  currentRate: number;
  rollingMean: number;
  rollingStdDev: number;
  zScore: number;
  severity: 'normal' | 'warning' | 'critical';
  recommendation: string;
  rollbackAvailable: boolean;
}

export interface QualityReport {
  generatedAt: string;
  engines: Array<{
    engine: string;
    history: QualityPoint[];
    currentAlert: AnomalyAlert | null;
    trend: 'improving' | 'stable' | 'declining';
  }>;
}

// ─── Detection ───────────────────────────────────────────────────────────────────

export async function detectAnomalies(): Promise<QualityReport> {
  const feedback = await db.feedbackLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  // Build time-series per engine: group by day
  const byEngine = new Map<string, Map<string, { accepted: number; total: number }>>();

  for (const fb of feedback) {
    const day = fb.actedAt.slice(0, 10); // YYYY-MM-DD
    const engineMap = byEngine.get(fb.engine) || new Map();
    const dayStats = engineMap.get(day) || { accepted: 0, total: 0 };
    dayStats.total++;
    if (fb.action === 'accepted') dayStats.accepted++;
    engineMap.set(day, dayStats);
    byEngine.set(fb.engine, engineMap);
  }

  const engines: QualityReport['engines'] = [];

  for (const [engine, dayMap] of byEngine) {
    const history: QualityPoint[] = [];
    const sortedDays = [...dayMap.keys()].sort();

    for (const day of sortedDays) {
      const stats = dayMap.get(day)!;
      history.push({
        timestamp: day,
        acceptanceRate: stats.total > 0 ? Math.round(stats.accepted / stats.total * 100) / 100 : 0,
        sampleSize: stats.total,
        engine,
      });
    }

    // Compute rolling stats on last 7 days
    const recent = history.slice(-7);
    const rates = recent.map(p => p.acceptanceRate);
    const mean = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    const variance = rates.length > 1
      ? rates.reduce((s, r) => s + (r - mean) ** 2, 0) / rates.length
      : 0;
    const stdDev = Math.sqrt(variance);

    const currentRate = history.length > 0 ? history[history.length - 1].acceptanceRate : 0;
    const zScore = stdDev > 0 ? (currentRate - mean) / stdDev : 0;

    const severity: AnomalyAlert['severity'] =
      zScore < -2 ? 'critical' : zScore < -1 ? 'warning' : 'normal';

    const rollbackAvailable = true; // Always available since we persist weights

    const alert: AnomalyAlert | null = severity !== 'normal' ? {
      engine,
      detectedAt: new Date().toISOString(),
      currentRate,
      rollingMean: Math.round(mean * 100) / 100,
      rollingStdDev: Math.round(stdDev * 100) / 100,
      zScore: Math.round(zScore * 100) / 100,
      severity,
      recommendation: severity === 'critical'
        ? `采纳率 ${Math.round(currentRate * 100)}% 显著低于均值 ${Math.round(mean * 100)}% (z=${zScore.toFixed(1)})。建议立即回滚权重并检查推理质量。`
        : `采纳率略有下降。监控趋势，若持续恶化则回滚。`,
      rollbackAvailable,
    } : null;

    const trend: 'improving' | 'stable' | 'declining' =
      recent.length >= 3
        ? (recent[recent.length - 1].acceptanceRate > recent[0].acceptanceRate + 0.05 ? 'improving'
        : recent[recent.length - 1].acceptanceRate < recent[0].acceptanceRate - 0.05 ? 'declining'
        : 'stable')
        : 'stable';

    engines.push({ engine, history, currentAlert: alert, trend });
  }

  return { generatedAt: new Date().toISOString(), engines };
}
