/**
 * React Query Hooks — Supplier Graph Intelligence
 *
 * Provides type-safe data fetching hooks for the Supplier API-backed
 * graph analytics endpoints.  All hooks use 5-min staleTime (graph
 * data changes slowly) and disable automatic refetch on window focus
 * for server-rendered stability.
 */

import { useQuery } from '@tanstack/react-query';
import { supplierApi } from '@/lib/services/supplier-api.client';
import type {
  NetworkData,
  ImpactResult,
  ChokepointResponse,
  GeoRiskResult,
  TierStructure,
} from '@/lib/services/supplier-api.types';

const GRAPH_STALE_TIME = 5 * 60 * 1000; // 5 minutes

// ─── Shared fetch helpers ──────────────────────────────────────────────────────

async function fetchNetwork(ticker: string, depth = 2, component?: string): Promise<NetworkData> {
  if (!ticker) return supplierApi.EMPTY.network();
  try {
    return await supplierApi.getNetwork(ticker, depth, component);
  } catch {
    return supplierApi.EMPTY.network();
  }
}

async function fetchImpact(supplier: string, depth = 3): Promise<ImpactResult> {
  if (!supplier) return supplierApi.EMPTY.impact();
  try {
    return await supplierApi.getImpact(supplier, depth);
  } catch {
    return supplierApi.EMPTY.impact();
  }
}

async function fetchChokepoints(page = 1, pageSize = 20): Promise<ChokepointResponse> {
  try {
    return await supplierApi.getChokepoints(page, pageSize);
  } catch {
    return supplierApi.EMPTY.chokepoints();
  }
}

async function fetchGeoRisk(ticker: string): Promise<GeoRiskResult> {
  if (!ticker) return supplierApi.EMPTY.geoRisk('');
  try {
    return await supplierApi.getGeoRisk(ticker);
  } catch {
    return supplierApi.EMPTY.geoRisk(ticker);
  }
}

async function fetchTiers(ticker: string): Promise<TierStructure> {
  if (!ticker) return supplierApi.EMPTY.tiers('');
  try {
    return await supplierApi.getTiers(ticker);
  } catch {
    return supplierApi.EMPTY.tiers(ticker);
  }
}

// ─── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Supplier network graph — nodes + edges for visualization.
 * Disabled when ticker is empty.
 */
export function useSupplierNetwork(ticker: string, depth = 2, component?: string) {
  return useQuery({
    queryKey: ['supplier-graph', 'network', ticker, depth, component],
    queryFn: () => fetchNetwork(ticker, depth, component),
    staleTime: GRAPH_STALE_TIME,
    enabled: !!ticker,
  });
}

/**
 * Supplier impact analysis — who is affected when a supplier fails.
 */
export function useSupplierImpact(supplier: string, depth = 3) {
  return useQuery({
    queryKey: ['supplier-graph', 'impact', supplier, depth],
    queryFn: () => fetchImpact(supplier, depth),
    staleTime: GRAPH_STALE_TIME,
    enabled: !!supplier,
  });
}

/**
 * Chokepoint detection — suppliers shared by multiple companies.
 */
export function useChokepoints(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['supplier-graph', 'chokepoints', page, pageSize],
    queryFn: () => fetchChokepoints(page, pageSize),
    staleTime: GRAPH_STALE_TIME,
  });
}

/**
 * Geographic risk — supplier concentration by manufacturing hub.
 */
export function useGeoRisk(ticker: string) {
  return useQuery({
    queryKey: ['supplier-graph', 'geo-risk', ticker],
    queryFn: () => fetchGeoRisk(ticker),
    staleTime: GRAPH_STALE_TIME,
    enabled: !!ticker,
  });
}

/**
 * Supplier tier structure — T1/T2/T3 counts and relationships.
 */
export function useSupplierTiers(ticker: string) {
  return useQuery({
    queryKey: ['supplier-graph', 'tiers', ticker],
    queryFn: () => fetchTiers(ticker),
    staleTime: GRAPH_STALE_TIME,
    enabled: !!ticker,
  });
}
