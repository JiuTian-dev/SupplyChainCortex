// ==================== React Query Hooks for Supply Chain Data ====================
// Each hook wraps a useQuery call for a specific API endpoint with proper query keys.
// staleTime is differentiated by data freshness requirements:
//   - Dashboard/real-time: 15s (rapidly changing)
//   - Inventory/sales: 60s (normal)
//   - Stats/analytics/reports: 300s (stable)
//   - Product catalog/suppliers: 300s (rarely changing)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchDashboard,
  fetchInventory,
  fetchCost,
  fetchLogistics,
  fetchSales,
  fetchReorder,
  fetchSuppliers,
  fetchStats,
  fetchWarehouse,
  fetchNotes,
  fetchEvents,
  fetchAlertRules,
  fetchNotifications,
  fetchRisk,
  fetchProcurement,
  fetchAnalytics,
  fetchReports,
  fetchSupplyChainScore,
  fetchWarehouseZones,
  fetchWarehouseTrend,
  fetchReorderRecommendations,
  searchProducts,
  fetchProductDetail,
  fetchInventoryCapitalAnalysis,
  fetchRiskMatrix,
  fetchInventoryAlertTimeline,
  fetchSalesForecast,
  fetchCostOptimization,
  fetchSupplyChainWeather,
} from '@/lib/api-client';

// Mutation API functions (not query-related)
import {
  createNote as createNoteApi,
  resolveNote as resolveNoteApi,
  deleteNote as deleteNoteApi,
  createProduct as createProductApi,
  createSupplier as createSupplierApi,
  updateSupplier as updateSupplierApi,
} from '@/lib/api-client';

// ─── Stale time constants (aligned with server-side CACHE_TTL) ────────────────
const STALE_SHORT = 15_000;     // 15s - rapidly changing data (dashboard metrics, alerts)
const STALE_MEDIUM = 60_000;    // 60s - normal data (inventory list, sales overview)
const STALE_LONG = 300_000;     // 5min - stable data (stats, analytics, reports, suppliers)

/** Dashboard metrics and overview */
export function useDashboard(days?: string) {
  return useQuery({
    queryKey: ['dashboard', days],
    queryFn: () => fetchDashboard(days),
    staleTime: STALE_SHORT,
  });
}

/** Inventory data with action and optional params */
export function useInventory(action: string, params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['inventory', action, params],
    queryFn: () => fetchInventory(action, params),
    enabled: !!action,
    staleTime: STALE_MEDIUM,
  });
}

/** Cost data with action and optional params */
export function useCost(action: string, params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['cost', action, params],
    queryFn: () => fetchCost(action, params),
    enabled: !!action,
    staleTime: STALE_MEDIUM,
  });
}

/** Logistics data with action and optional params */
export function useLogistics(action: string, params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['logistics', action, params],
    queryFn: () => fetchLogistics(action, params),
    enabled: !!action,
    staleTime: STALE_MEDIUM,
  });
}

/** Sales data with action and optional params */
export function useSales(action: string, params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['sales', action, params],
    queryFn: () => fetchSales(action, params),
    enabled: !!action,
    staleTime: STALE_MEDIUM,
  });
}

/** Reorder orders */
export function useReorder() {
  return useQuery({
    queryKey: ['reorder'],
    queryFn: fetchReorder,
    staleTime: STALE_MEDIUM,
  });
}

/** Suppliers list */
export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: fetchSuppliers,
    staleTime: STALE_LONG,
  });
}

/** Stats for a given period */
export function useStats(period: string) {
  return useQuery({
    queryKey: ['stats', period],
    queryFn: () => fetchStats(period),
    enabled: !!period,
    staleTime: STALE_LONG,
  });
}

/** Warehouse data with action */
export function useWarehouse(action: string) {
  return useQuery({
    queryKey: ['warehouse', action],
    queryFn: () => fetchWarehouse(action),
    enabled: !!action,
    staleTime: STALE_MEDIUM,
  });
}

/** Supply chain notes */
export function useNotes(limit: number) {
  return useQuery({
    queryKey: ['notes', limit],
    queryFn: () => fetchNotes(limit),
    staleTime: STALE_MEDIUM,
  });
}

/** Supply chain events */
export function useEvents(limit: number) {
  return useQuery({
    queryKey: ['events', limit],
    queryFn: () => fetchEvents(limit),
    staleTime: STALE_SHORT,
  });
}

/** Alert rules */
export function useAlertRules() {
  return useQuery({
    queryKey: ['alert-rules'],
    queryFn: fetchAlertRules,
    staleTime: STALE_LONG,
  });
}

/** Backend notifications */
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    staleTime: STALE_SHORT,
  });
}

/** Risk dashboard / simulation */
export function useRisk(action: string, params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['risk', action, params],
    queryFn: () => fetchRisk(action, params),
    enabled: !!action,
    staleTime: STALE_LONG,
  });
}

/** Procurement data */
export function useProcurement(action: string, params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['procurement', action, params],
    queryFn: () => fetchProcurement(action, params),
    enabled: !!action,
    staleTime: STALE_MEDIUM,
  });
}

/** Supply chain health score */
export function useSupplyChainScore(detailed = false) {
  return useQuery({
    queryKey: ['supply-chain-score', detailed],
    queryFn: () => fetchSupplyChainScore(detailed),
    staleTime: STALE_MEDIUM,
  });
}

/** Analytics data */
export function useAnalytics(action: string, params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['analytics', action, params],
    queryFn: () => fetchAnalytics(action, params),
    enabled: !!action,
    staleTime: STALE_LONG,
  });
}

/** Reports data */
export function useReports(action: string) {
  return useQuery({
    queryKey: ['reports', action],
    queryFn: () => fetchReports(action),
    enabled: !!action,
    staleTime: STALE_LONG,
  });
}

/** Warehouse zones with utilization */
export function useWarehouseZones() {
  return useQuery({
    queryKey: ['warehouse', 'zones'],
    queryFn: () => fetchWarehouseZones(),
    staleTime: STALE_MEDIUM,
  });
}

/** Warehouse utilization trend (7-day) */
export function useWarehouseTrend() {
  return useQuery({
    queryKey: ['warehouse', 'utilization_trend'],
    queryFn: () => fetchWarehouseTrend(),
    staleTime: STALE_MEDIUM,
  });
}

/** Reorder recommendations with sales velocity analysis */
export function useReorderRecommendations() {
  return useQuery({
    queryKey: ['inventory', 'reorder_recommendations'],
    queryFn: () => fetchReorderRecommendations(),
    staleTime: STALE_MEDIUM,
  });
}

/** Search products by keyword */
export function useProductSearch(q: string) {
  return useQuery({
    queryKey: ['products', 'search', q],
    queryFn: () => searchProducts(q),
    enabled: q.length >= 2,
    staleTime: STALE_LONG,
  });
}

/** Fetch single product detail by id or sku */
export function useProductDetail(idOrSku: string | null, by: 'id' | 'sku' = 'sku') {
  return useQuery({
    queryKey: ['products', 'detail', idOrSku],
    queryFn: () => fetchProductDetail(idOrSku!, by),
    enabled: !!idOrSku,
    staleTime: STALE_LONG,
  });
}

/** Inventory capital occupation analysis */
export function useInventoryCapitalAnalysis() {
  return useQuery({
    queryKey: ['inventory', 'capital_analysis'],
    queryFn: fetchInventoryCapitalAnalysis,
    staleTime: STALE_MEDIUM,
  });
}

/** Risk matrix heatmap data */
export function useRiskMatrix() {
  return useQuery({
    queryKey: ['risk', 'matrix'],
    queryFn: fetchRiskMatrix,
    staleTime: STALE_LONG,
  });
}

/** Sales forecast (overall, 14-day projection) */
export function useSalesForecast() {
  return useQuery({
    queryKey: ['sales', 'forecast-overall'],
    queryFn: fetchSalesForecast,
    staleTime: STALE_LONG,
  });
}

/** Inventory alert timeline events */
export function useInventoryAlertTimeline(params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['inventory', 'alert_timeline', params],
    queryFn: () => fetchInventoryAlertTimeline(params),
    refetchInterval: 60000, // Auto-refresh every 60 seconds
    staleTime: STALE_SHORT,
  });
}

/** Cost optimization suggestions with impact analysis */
export function useCostOptimization() {
  return useQuery({
    queryKey: ['cost', 'optimization'],
    queryFn: fetchCostOptimization,
    staleTime: STALE_LONG,
  });
}

/** Supply chain weather widget data */
export function useSupplyChainWeather() {
  return useQuery({
    queryKey: ['supply-chain-score', 'weather'],
    queryFn: fetchSupplyChainWeather,
    staleTime: STALE_SHORT,
  });
}

// ==================== Mutation Hooks ====================

/** Create a new supply chain note */
export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { sku?: string; author: string; content: string; category: string; priority: string }) =>
      createNoteApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

/** Resolve a supply chain note */
export function useResolveNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resolveNoteApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

/** Delete a supply chain note */
export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteNoteApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}

/** Create a new product (for CSV import) */
export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createProductApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/** Create a new supplier */
export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createSupplierApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}

/** Update a supplier (general fields) */
export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => updateSupplierApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}

/** Rate a supplier (submit overall rating + sub-scores + comments) */
export function useRateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      id: string;
      rating: number;
      deliveryScore?: number;
      qualityScore?: number;
      priceScore?: number;
      communicationScore?: number;
      comments?: string;
    }) => updateSupplierApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

