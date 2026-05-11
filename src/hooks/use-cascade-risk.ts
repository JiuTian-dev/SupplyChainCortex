/**
 * Shared Cascade Risk Hook — single source of truth.
 *
 * Eliminates duplicate /api/cascade-risk calls from MonitorStrip,
 * CascadeRiskPanel, and DecisionCenter (was 3 requests → now 1).
 *
 * Uses React Query with 30s stale time + window focus refetch.
 */

import { useQuery } from '@tanstack/react-query';

interface CascadeRiskQueryResult {
  data: any;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const CASCADE_RISK_KEY = ['cascade-risk', 'auto'] as const;
const STALE_MS = 30_000;

let abortController: AbortController | null = null;

export function useCascadeRisk(scenario = 'auto'): CascadeRiskQueryResult {
  return useQuery({
    queryKey: [...CASCADE_RISK_KEY, scenario],
    queryFn: async ({ signal }) => {
      // Cancel previous in-flight request
      if (abortController) abortController.abort();
      abortController = new AbortController();
      const combinedSignal = signal
        ? combineSignals(signal, abortController.signal)
        : abortController.signal;

      const res = await fetch(`/api/cascade-risk?scenario=${scenario}`, {
        signal: combinedSignal,
      });
      if (!res.ok) throw new Error(`Cascade risk HTTP ${res.status}`);
      return res.json();
    },
    staleTime: STALE_MS,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000, // refresh every minute
    retry: 2,
  });
}

function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) { controller.abort(); break; }
    s.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

// ─── Shared cascade-risk summary (lightweight, for MonitorStrip/KPIs) ─────

export function useCascadeRiskSummary() {
  const { data, isLoading } = useCascadeRisk();

  return {
    isLoading,
    affectedNodes: data?.summary?.affectedNodes || 0,
    totalNodes: data?.summary?.totalNodes || 39,
    totalMonthlyLoss: data?.summary?.totalMonthlyLoss || 0,
    maxDepth: (data as any)?.maxDepth || 0,
    sourceNodes: (data as any)?.sourceNodes || [],
    propagation: data?.propagation || [],
    counterfactuals: data?.counterfactuals || [],
    portRisks: extractPortRisks((data as any)?.sourceNodes || []),
    full: data,
  };
}

function extractPortRisks(sourceNodes: any[]) {
  const portNodes = sourceNodes.filter((n: any) => n.category === 'weather');
  return {
    total: 12,
    high: portNodes.filter((n: any) => n.riskScore >= 70).length,
    medium: portNodes.filter((n: any) => n.riskScore >= 40 && n.riskScore < 70).length,
    normal: 12 - portNodes.length,
    hotSpots: portNodes
      .filter((n: any) => n.riskScore >= 40)
      .map((n: any) => n.cause?.split(':')[1]?.trim() || n.label)
      .slice(0, 2),
  };
}
