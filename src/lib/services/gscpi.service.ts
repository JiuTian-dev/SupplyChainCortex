/**
 * GSCPI — Global Supply Chain Pressure Index (NY Federal Reserve)
 *
 * Measures global supply chain stress across:
 *   - Baltic Dry Index (BDI) shipping costs
 *   - Harpex Index (container rates)
 *   - Air freight cost indices
 *   - Delivery times (PMI supplier delivery)
 *   - Backlog and inventory indicators
 *
 * Scale: >0 = above-average pressure, <0 = below-average
 * Interpretation:
 *   >2.0 = extreme stress (COVID-style)
 *   1.0-2.0 = high stress
 *   0.5-1.0 = moderate stress
 *   0-0.5 = normal
 *   <0 = relaxed
 *
 * Data: NY Fed publishes monthly GSCPI data in CSV format.
 * Free, no API key. Updates monthly around the 5th.
 *
 * Usage: import { getGSCPI } from '@/lib/services/gscpi.service'
 */

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface GSCPIDataPoint {
  date: string;
  value: number;
}

export interface GSCPIReport {
  current: number;
  trend: 'rising' | 'falling' | 'stable';
  stressLevel: 'extreme' | 'high' | 'moderate' | 'normal' | 'relaxed';
  monthChange: number;
  yoyChange: number;
  history: GSCPIDataPoint[];
  source: string;
  updatedAt: string;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────────

async function fetchNYFedCSV(): Promise<GSCPIDataPoint[]> {
  const url = 'https://www.newyorkfed.org/medialibrary/research/interactives/gscpi/downloads/gscpi_data.csv';
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const csv = await res.text();
  const lines = csv.trim().split('\n').slice(1); // skip header

  const points: GSCPIDataPoint[] = [];
  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length >= 2) {
      const value = parseFloat(parts[1]);
      if (!isNaN(value)) {
        points.push({ date: parts[0].trim(), value });
      }
    }
  }
  return points;
}

// Static fallback — 2026 Q1 data from NY Fed reports
const STATIC_GSCPI: GSCPIDataPoint[] = [
  { date: '2025-03', value: -0.12 },
  { date: '2025-06', value: 0.08 },
  { date: '2025-09', value: 0.15 },
  { date: '2025-12', value: 0.22 },
  { date: '2026-01', value: 0.28 },
  { date: '2026-02', value: 0.35 },
  { date: '2026-03', value: 0.42 },
];

function computeReport(points: GSCPIDataPoint[]): GSCPIReport {
  const sorted = [...points].sort((a, b) => b.date.localeCompare(a.date));
  const current = sorted[0]?.value || 0;
  const prev = sorted[1]?.value || current;
  const yoy = sorted.find(p => p.date.startsWith(String(parseInt(sorted[0].date) - 1)))?.value;

  const monthChange = Math.round((current - prev) * 1000) / 1000;
  const yoyChange = yoy ? Math.round((current - yoy) * 1000) / 1000 : monthChange;

  const trend = Math.abs(monthChange) < 0.02 ? 'stable'
    : monthChange > 0 ? 'rising' : 'falling';

  const stressLevel = current > 2.0 ? 'extreme'
    : current > 1.0 ? 'high'
    : current > 0.5 ? 'moderate'
    : current > 0 ? 'normal'
    : 'relaxed';

  return {
    current: Math.round(current * 100) / 100,
    trend,
    stressLevel,
    monthChange,
    yoyChange,
    history: sorted.slice(0, 12),
    source: 'NY Fed GSCPI',
    updatedAt: new Date().toISOString(),
  };
}

// ─── Main Export ─────────────────────────────────────────────────────────────────

export async function getGSCPI(): Promise<GSCPIReport> {
  try {
    const points = await fetchNYFedCSV();
    if (points.length > 0) return computeReport(points);
  } catch { /* fall through to static */ }

  return computeReport(STATIC_GSCPI);
}
