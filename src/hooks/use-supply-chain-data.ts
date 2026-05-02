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
  fetchSalesSeasonalIndex,
  fetchInventoryCapitalAnalysis,
  fetchRiskMatrix,
  fetchInventoryAlertTimeline,
  fetchSalesForecast,
  fetchSalesForecastForSku,
  fetchCostOptimization,
  fetchSupplyChainWeather,
  fetchSupplyChainScoreHistory,
  fetchPerformanceMetrics,
  fetchQuality,
  fetchCompliance,
} from '@/lib/api-client';

// Mutation API functions (not query-related)
import {
  createNote as createNoteApi,
  resolveNote as resolveNoteApi,
  deleteNote as deleteNoteApi,
  createProduct as createProductApi,
  createSupplier as createSupplierApi,
  updateSupplier as updateSupplierApi,
  createReturnRecord as createReturnRecordApi,
  createDefectRecord as createDefectRecordApi,
  createWarrantyCost as createWarrantyCostApi,
  updateReturnRecord as updateReturnRecordApi,
  updateDefectRecord as updateDefectRecordApi,
  updateWarrantyCost as updateWarrantyCostApi,
  createComplianceCert as createComplianceCertApi,
  createRegulationChange as createRegulationChangeApi,
  updateComplianceCert as updateComplianceCertApi,
  updateRegulationChange as updateRegulationChangeApi,
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

/** Sales seasonal index (ratio-to-moving-average method) */
export function useSalesSeasonalIndex(params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['sales', 'seasonal_index', params],
    queryFn: () => fetchSalesSeasonalIndex(params),
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

/** Sales forecast for a specific SKU with alpha parameter */
export function useSalesForecastForSku(sku: string | null, horizon = 14, alpha = 0.3) {
  return useQuery({
    queryKey: ['sales', 'forecast-sku', sku, horizon, alpha],
    queryFn: () => fetchSalesForecastForSku(sku!, horizon, alpha),
    enabled: !!sku,
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

/** Supply chain score history (30-day trend) */
export function useSupplyChainScoreHistory() {
  return useQuery({
    queryKey: ['supply-chain-score', 'history'],
    queryFn: fetchSupplyChainScoreHistory,
    staleTime: STALE_MEDIUM,
  });
}

/** Performance monitoring metrics (API response times, cache stats, system health) */
export function usePerformanceMetrics() {
  return useQuery({
    queryKey: ['performance'],
    queryFn: fetchPerformanceMetrics,
    staleTime: STALE_SHORT,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
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

// ==================== Quality Data Hooks ====================

/** Quality data with action and optional params */
export function useQuality(action: string, params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['quality', action, params],
    queryFn: () => fetchQuality(action, params),
    enabled: !!action,
    staleTime: STALE_MEDIUM,
  });
}

/** Quality overview dashboard */
export function useQualityOverview() {
  return useQuery({
    queryKey: ['quality', 'overview'],
    queryFn: () => fetchQuality('overview'),
    staleTime: STALE_MEDIUM,
  });
}

/** Return records with Pareto analysis */
export function useReturnRecords(params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['quality', 'returns', params],
    queryFn: () => fetchQuality('returns', params),
    staleTime: STALE_MEDIUM,
  });
}

/** Defect records with statistics */
export function useDefectRecords(params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['quality', 'defects', params],
    queryFn: () => fetchQuality('defects', params),
    staleTime: STALE_MEDIUM,
  });
}

/** Warranty cost records with totals */
export function useWarrantyCosts(params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['quality', 'warranty', params],
    queryFn: () => fetchQuality('warranty', params),
    staleTime: STALE_MEDIUM,
  });
}

// ==================== Compliance Data Hooks ====================

/** Compliance data with action and optional params */
export function useCompliance(action: string, params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['compliance', action, params],
    queryFn: () => fetchCompliance(action, params),
    enabled: !!action,
    staleTime: STALE_MEDIUM,
  });
}

/** Compliance overview dashboard */
export function useComplianceOverview() {
  return useQuery({
    queryKey: ['compliance', 'overview'],
    queryFn: () => fetchCompliance('overview'),
    staleTime: STALE_MEDIUM,
  });
}

/** Compliance certificates list */
export function useComplianceCerts(params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['compliance', 'certs', params],
    queryFn: () => fetchCompliance('certs', params),
    staleTime: STALE_MEDIUM,
  });
}

/** Regulation changes list */
export function useRegulationChanges(params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['compliance', 'regulations', params],
    queryFn: () => fetchCompliance('regulations', params),
    staleTime: STALE_MEDIUM,
  });
}

/** Expiring certificates within N days */
export function useExpiringCerts(days = 90) {
  return useQuery({
    queryKey: ['compliance', 'expiring', days],
    queryFn: () => fetchCompliance('expiring', { days }),
    staleTime: STALE_SHORT,
  });
}

// ==================== Quality Mutation Hooks ====================

/** Create a return record */
export function useCreateReturnRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createReturnRecordApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quality'] });
    },
  });
}

/** Create a defect record */
export function useCreateDefectRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createDefectRecordApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quality'] });
    },
  });
}

/** Create a warranty cost record */
export function useCreateWarrantyCost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createWarrantyCostApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quality'] });
    },
  });
}

/** Update a return record status */
export function useUpdateReturnRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; status: string }) => updateReturnRecordApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quality'] });
    },
  });
}

/** Update a defect record */
export function useUpdateDefectRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; status?: string; rootCause?: string; correctiveAction?: string }) => updateDefectRecordApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quality'] });
    },
  });
}

/** Update a warranty cost record */
export function useUpdateWarrantyCost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; status?: string; resolvedDate?: string }) => updateWarrantyCostApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quality'] });
    },
  });
}

// ==================== Compliance Mutation Hooks ====================

/** Create a compliance certificate */
export function useCreateComplianceCert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createComplianceCertApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance'] });
    },
  });
}

/** Create a regulation change */
export function useCreateRegulationChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createRegulationChangeApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance'] });
    },
  });
}

/** Update a compliance certificate */
export function useUpdateComplianceCert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => updateComplianceCertApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance'] });
    },
  });
}

/** Update a regulation change */
export function useUpdateRegulationChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; status?: string; reviewedBy?: string; actionRequired?: string }) => updateRegulationChangeApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance'] });
    },
  });
}
