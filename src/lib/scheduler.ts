/**
 * Background Scheduler — cron-based data refresh
 *
 * Replaces SSE-only data fetching with persistent DB-backed refresh.
 * Each task: fetch external API → validate → upsert DB → log result.
 *
 * Freq reference:
 *   SCFI:     "30 15 * * 5"   = 每周五 15:30 BJT
 *   PBOC:     "20 9 * * 1-5"  = 每个工作日 9:20 BJT
 *   Commodity:"0 9 * * *"     = 每天 9:00 BJT
 *   GSCPI:    "0 10 5 * *"    = 每月 5 日 10:00 BJT
 *   FRED:     "0 8 1 * *"     = 每月 1 日 8:00 BJT
 *   Weather:  "0 * * * *"     = 每小时
 *   FX:       "30 * * * *"    = 每半小时
 */

import { fetchSCFIWithCache, scfiToFreightRates } from '@/lib/sources/scfi-scraper';
import { getPBOCMidpoints } from '@/lib/sources/pboc-exchange-rate';
import { fetchDailyCommodities } from '@/lib/sources/alphavantage-commodities';
import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────────

interface JobResult {
  job: string;
  status: 'ok' | 'error' | 'no_data';
  durationMs: number;
  error?: string;
}

// ─── Job Handlers ────────────────────────────────────────────────────────────────

async function jobSCFI(): Promise<JobResult> {
  const start = Date.now();
  try {
    const { data, cachedAt, stale } = await fetchSCFIWithCache();
    if (!data) return { job: 'SCFI', status: 'no_data', durationMs: Date.now() - start };

    if (cachedAt) {
      console.log(
        `[Scheduler] SCFI: using cached data from ${cachedAt}${stale ? ' (STALE — >24h)' : ''}`
      );
    }

    // Store freight rates into DB supply chain events for persistence
    await db.supplyChainEvent.create({
      data: {
        type: 'data_update',
        title: `SCFI 运价更新: ${data.compositeIndex} 点`,
        description: JSON.stringify({
          compositeIndex: data.compositeIndex,
          weeklyChangePct: data.weeklyChangePct,
          routes: scfiToFreightRates(data),
          ...(cachedAt ? { cachedAt, stale } : {}),
        }),
        icon: '🚢',
        color: data.weeklyChangePct > 0 ? '#ef4444' : '#22c55e',
        severity: Math.abs(data.weeklyChangePct) > 5 ? 'warning' : 'info',
      },
    });
    return { job: 'SCFI', status: 'ok', durationMs: Date.now() - start };
  } catch (err) {
    return { job: 'SCFI', status: 'error', durationMs: Date.now() - start, error: String(err) };
  }
}

async function jobPBOC(): Promise<JobResult> {
  const start = Date.now();
  try {
    const data = await getPBOCMidpoints();
    if (!data) return { job: 'PBOC', status: 'no_data', durationMs: Date.now() - start };

    const usdMid = data.midpoints.find(m => m.currency === 'USD');
    if (usdMid) {
      await db.supplyChainEvent.create({
        data: {
          type: 'data_update',
          title: `央行中间价: USD/CNY ${usdMid.midpoint}`,
          description: JSON.stringify(data.midpoints),
          icon: '💱',
          color: '#3b82f6',
          severity: 'info',
        },
      });
    }
    return { job: 'PBOC', status: 'ok', durationMs: Date.now() - start };
  } catch (err) {
    return { job: 'PBOC', status: 'error', durationMs: Date.now() - start, error: String(err) };
  }
}

async function jobCommodities(): Promise<JobResult> {
  const start = Date.now();
  try {
    const data = await fetchDailyCommodities();
    if (data.length === 0) return { job: 'Commodities', status: 'no_data', durationMs: Date.now() - start };

    const summary = data.map(d => `${d.name}: ${d.price} ${d.unit}`).join(', ');
    await db.supplyChainEvent.create({
      data: {
        type: 'data_update',
        title: `大宗商品更新: ${summary}`,
        description: JSON.stringify(data),
        icon: '🪙',
        color: '#f59e0b',
        severity: 'info',
      },
    });
    return { job: 'Commodities', status: 'ok', durationMs: Date.now() - start };
  } catch (err) {
    return { job: 'Commodities', status: 'error', durationMs: Date.now() - start, error: String(err) };
  }
}

async function jobSCFIS(): Promise<JobResult> {
  const start = Date.now();
  try {
    const { fetchSCFISPrice } = await import('@/lib/sources/scfis-futures');
    const data = await fetchSCFISPrice();
    if (!data) return { job: 'SCFIS', status: 'no_data', durationMs: Date.now() - start };

    await db.supplyChainEvent.create({
      data: {
        type: 'data_update',
        title: `SCFIS 欧线期货: ${data.price} 点`,
        description: JSON.stringify(data),
        icon: '🚢',
        color: data.changePct > 0 ? '#ef4444' : '#22c55e',
        severity: Math.abs(data.changePct) > 3 ? 'warning' : 'info',
      },
    });
    return { job: 'SCFIS', status: 'ok', durationMs: Date.now() - start };
  } catch (err) {
    return { job: 'SCFIS', status: 'error', durationMs: Date.now() - start, error: String(err) };
  }
}

async function jobCarbonPrice(): Promise<JobResult> {
  const start = Date.now();
  try {
    const { fetchCarbonPrice } = await import('@/lib/sources/carbon-price');
    const data = await fetchCarbonPrice();
    if (!data) return { job: 'CarbonPrice', status: 'no_data', durationMs: Date.now() - start };

    await db.supplyChainEvent.create({
      data: {
        type: 'data_update',
        title: `EU碳价: €${data.price}/t CO2`,
        description: JSON.stringify(data),
        icon: '🏭',
        color: data.changePct > 2 ? '#ef4444' : '#22c55e',
        severity: data.price > 90 ? 'warning' : 'info',
      },
    });
    return { job: 'CarbonPrice', status: 'ok', durationMs: Date.now() - start };
  } catch (err) {
    return { job: 'CarbonPrice', status: 'error', durationMs: Date.now() - start, error: String(err) };
  }
}

async function jobCPSCRecallSync(): Promise<JobResult> {
  const start = Date.now();
  try {
    const { syncCPSCToDB } = await import('@/lib/sources/cpsc-recall');
    const count = await syncCPSCToDB();
    console.log(`[Scheduler] CPSCRecallSync: ${count} new recalls synced (${Date.now() - start}ms)`);
    return { job: 'CPSCRecallSync', status: count > 0 ? 'ok' : 'no_data', durationMs: Date.now() - start };
  } catch (err) {
    console.error(`[Scheduler] CPSCRecallSync failed:`, err);
    return { job: 'CPSCRecallSync', status: 'error', durationMs: Date.now() - start, error: String(err) };
  }
}

async function jobAlertCheck(): Promise<JobResult> {
  const start = Date.now();
  try {
    const { getCascadeRisk } = await import('@/lib/services/cascade-risk.service');
    const { runAlertCycle } = await import('@/lib/services/alert-engine.service');
    const risk = await getCascadeRisk({ scenario: 'auto', includeForwardProjection: false, includeCounterfactuals: false });
    const count = await runAlertCycle(risk);
    return { job: 'AlertCheck', status: count > 0 ? 'ok' : 'no_data', durationMs: Date.now() - start };
  } catch (err) {
    return { job: 'AlertCheck', status: 'error', durationMs: Date.now() - start, error: String(err) };
  }
}

async function jobAutoBacktest(): Promise<JobResult> {
  const start = Date.now();
  try {
    // Run backtest against actual shipment data from past 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const recentShipments = await db.shipmentItem.findMany({
      where: { updatedAt: { gte: sevenDaysAgo } },
      select: { status: true, delayDays: true, riskLevel: true },
    });

    const delayed = recentShipments.filter(s => s.delayDays > 0 || s.riskLevel === 'high' || s.riskLevel === 'critical');
    const actualRiskRate = recentShipments.length > 0
      ? delayed.length / recentShipments.length
      : 0;

    // Compare with cascade risk predictions from 7 days ago
    const { getCascadeRisk } = await import('@/lib/services/cascade-risk.service');
    const currentRisk = await getCascadeRisk({ scenario: 'auto', includeForwardProjection: false });

    // Accuracy: did we predict the right number of affected nodes?
    const predictedAffected = currentRisk?.summary?.affectedNodes || 0;
    const predictedLoss = currentRisk?.summary?.totalMonthlyLoss || 0;

    // Store calibration result
    if (predictedAffected > 0) {
      const accuracy = actualRiskRate > 0
        ? Math.max(0, 1 - Math.abs(predictedAffected / 100 - actualRiskRate))
        : 0.5;

      await db.engineWeight.upsert({
        where: { engine: 'cascade-risk' },
        create: {
          engine: 'cascade-risk',
          version: 'auto-calibrated',
          sourcesJson: JSON.stringify({ predictedAffected, actualRiskRate, accuracy, predictedLoss }),
          totalSamples: 1,
          calibratedAt: new Date().toISOString(),
        },
        update: {
          totalSamples: { increment: 1 },
          calibratedAt: new Date().toISOString(),
        },
      });

      return { job: 'AutoBacktest', status: 'ok', durationMs: Date.now() - start };
    }
    return { job: 'AutoBacktest', status: 'no_data', durationMs: Date.now() - start };
  } catch (err) {
    return { job: 'AutoBacktest', status: 'error', durationMs: Date.now() - start, error: String(err) };
  }
}

async function jobSupplierScores(): Promise<JobResult> {
  const start = Date.now();
  try {
    const { refreshAllSupplierScores } = await import('@/lib/services/suppliers.service');
    const count = await refreshAllSupplierScores();
    return { job: 'SupplierScores', status: count > 0 ? 'ok' : 'no_data', durationMs: Date.now() - start };
  } catch (err) {
    return { job: 'SupplierScores', status: 'error', durationMs: Date.now() - start, error: String(err) };
  }
}

export async function jobWeather(): Promise<JobResult> {
  const start = Date.now();
  try {
    const { getAllPortsWeather } = await import('@/lib/services/weather.service');
    const weather = await getAllPortsWeather();
    if (!weather || !weather.ports || weather.ports.length === 0) return { job: 'Weather', status: 'no_data', durationMs: Date.now() - start };
    return { job: 'Weather', status: 'ok', durationMs: Date.now() - start };
  } catch (err) {
    return { job: 'Weather', status: 'error', durationMs: Date.now() - start, error: String(err) };
  }
}

async function jobMemoryConsolidation(): Promise<JobResult> {
  const start = Date.now();
  try {
    const { runConsolidation } = await import('@/lib/engine/memory-consolidation');
    const report = runConsolidation();
    if (report.actions.length === 1 && report.actions[0]?.startsWith('无需')) {
      return { job: 'MemoryConsolidation', status: 'no_data', durationMs: Date.now() - start };
    }
    console.log(`[MemoryConsolidation] ${report.actions.join('; ')}`);
    return { job: 'MemoryConsolidation', status: 'ok', durationMs: Date.now() - start };
  } catch (err) {
    return { job: 'MemoryConsolidation', status: 'error', durationMs: Date.now() - start, error: String(err) };
  }
}

async function jobFX(): Promise<JobResult> {
  const start = Date.now();
  try {
    const { getLatestRates } = await import('@/lib/queries/exchange-rate.queries');
    const rates = await getLatestRates();
    if (!rates) return { job: 'FX', status: 'no_data', durationMs: Date.now() - start };
    return { job: 'FX', status: 'ok', durationMs: Date.now() - start };
  } catch (err) {
    return { job: 'FX', status: 'error', durationMs: Date.now() - start, error: String(err) };
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────────

const JOBS: Record<string, () => Promise<JobResult>> = {
  SCFIS: jobSCFIS,
  SCFI: jobSCFI,
  PBOC: jobPBOC,
  Commodities: jobCommodities,
  CarbonPrice: jobCarbonPrice,
  CPSCRecallSync: jobCPSCRecallSync,
  SupplierScores: jobSupplierScores,
  AlertCheck: jobAlertCheck,
  MemoryConsolidation: jobMemoryConsolidation,
  AutoBacktest: jobAutoBacktest,
  Weather: jobWeather,
  FX: jobFX,
};

// Next.js can hot-reload the instrumentation module in dev mode.
// Track running state to avoid duplicate timers.
let _running = false;

export function startScheduler(): void {
  if (_running) return;
  _running = true;

  console.log('[Scheduler] Background data refresh started');

  // Bootstrap: run all jobs on startup (with staggered delays to avoid thundering herd)
  const bootstrapJobs: Array<{ name: string; delay: number }> = [
    { name: 'FX', delay: 1000 },
    { name: 'SCFIS', delay: 3000 },
    { name: 'CarbonPrice', delay: 5000 },
    { name: 'Weather', delay: 8000 },
    { name: 'Commodities', delay: 12000 },
    { name: 'PBOC', delay: 16000 },
    { name: 'CPSCRecallSync', delay: Math.floor(Math.random() * 300000) },
    { name: 'SCFI', delay: 24000 },
  ];

  for (const { name, delay } of bootstrapJobs) {
    const job = JOBS[name];
    if (job) {
      setTimeout(async () => {
        try {
          const result = await job();
          console.log(`[Scheduler] ${result.job}: ${result.status} (${result.durationMs}ms)`);
        } catch (err) {
          console.error(`[Scheduler] ${name} bootstrap failed:`, err);
        }
      }, delay);
    }
  }

  // Periodic refresh intervals (Node.js setInterval, no cron dependency needed)
  // These are intentionally staggered to spread load
  const intervals: Array<{ name: string; ms: number }> = [
    { name: 'AlertCheck', ms: 60 * 60 * 1000 }, // check alerts hourly
    { name: 'FX', ms: 30 * 60 * 1000 },
    { name: 'SCFIS', ms: 60 * 60 * 1000 },
    { name: 'CarbonPrice', ms: 60 * 60 * 1000 },
    { name: 'Weather', ms: 60 * 60 * 1000 },
    { name: 'Commodities', ms: 6 * 60 * 60 * 1000 },
    { name: 'PBOC', ms: 6 * 60 * 60 * 1000 },
    { name: 'CPSCRecallSync', ms: 6 * 60 * 60 * 1000 },
    { name: 'SupplierScores', ms: 24 * 60 * 60 * 1000 }, // daily
    { name: 'MemoryConsolidation', ms: 30 * 60 * 1000 }, // every 30 min
    { name: 'AutoBacktest', ms: 7 * 24 * 60 * 60 * 1000 }, // weekly
    { name: 'SCFI', ms: 6 * 60 * 60 * 1000 },
  ];

  for (const { name, ms } of intervals) {
    const job = JOBS[name];
    if (job) {
      setInterval(async () => {
        try {
          const result = await job();
          if (result.status === 'ok') {
            console.log(`[Scheduler] ${result.job}: ok (${result.durationMs}ms)`);
          }
        } catch (err) {
          console.error(`[Scheduler] ${name} periodic failed:`, err);
        }
      }, ms);
    }
  }
}

export function stopScheduler(): void {
  _running = false;
  console.log('[Scheduler] Stopped');
}

// ─── Manual trigger for testing ──────────────────────────────────────────────────

export async function runAllJobs(): Promise<JobResult[]> {
  const results: JobResult[] = [];
  for (const [name, job] of Object.entries(JOBS)) {
    try {
      const result = await job();
      console.log(`[Scheduler Manual] ${result.job}: ${result.status} (${result.durationMs}ms)`);
      if (result.error) console.error(`  Error: ${result.error}`);
      results.push(result);
    } catch (err) {
      results.push({ job: name, status: 'error', durationMs: 0, error: String(err) });
    }
  }
  return results;
}
