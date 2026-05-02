// ==================== API Client ====================
// Centralized API client that wraps all fetch calls used in the supply chain dashboard.

import type { AlertRule } from '@/lib/types';

/** Helper to build query strings from params */
function buildQuery(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
}

/** Generic fetch wrapper that returns parsed JSON */
async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText} for ${path}`);
  }
  return res.json() as Promise<T>;
}

// ==================== GET Endpoints ====================

export function fetchDashboard(days?: string) {
  const q = days ? `?days=${days}` : '';
  return apiFetch(`/api/dashboard${q}`);
}

export function fetchInventory(action: string, params?: Record<string, string | number>) {
  return apiFetch(`/api/inventory${buildQuery({ action, ...params })}`);
}

export function fetchCost(action: string, params?: Record<string, string | number>) {
  return apiFetch(`/api/cost${buildQuery({ action, ...params })}`);
}

export function fetchLogistics(action: string, params?: Record<string, string | number>) {
  return apiFetch(`/api/logistics${buildQuery({ action, ...params })}`);
}

export function fetchSales(action: string, params?: Record<string, string | number>) {
  return apiFetch(`/api/sales${buildQuery({ action, ...params })}`);
}

export function fetchReorder() {
  return apiFetch('/api/reorder');
}

export function fetchSuppliers() {
  return apiFetch('/api/suppliers');
}

export function fetchStats(period: string) {
  return apiFetch(`/api/stats?period=${encodeURIComponent(period)}`);
}

export function fetchWarehouse(action: string) {
  return apiFetch(`/api/warehouse?action=${encodeURIComponent(action)}`);
}

export function fetchNotes(limit: number) {
  return apiFetch(`/api/notes?limit=${limit}`);
}

export function fetchEvents(limit: number) {
  return apiFetch(`/api/events?limit=${limit}`);
}

export function fetchAlertRules() {
  return apiFetch('/api/alert-rules');
}

export function fetchNotifications() {
  return apiFetch('/api/notifications');
}

export function fetchRisk(action: string, params?: Record<string, string | number>) {
  return apiFetch(`/api/risk${buildQuery({ action, ...params })}`);
}

export function fetchProcurement(action: string, params?: Record<string, string | number>) {
  return apiFetch(`/api/procurement${buildQuery({ action, ...params })}`);
}

export function fetchProducts(params?: Record<string, string | number>) {
  return apiFetch(`/api/products${buildQuery(params)}`);
}

export function fetchAnalytics(action: string, params?: Record<string, string | number>) {
  return apiFetch(`/api/analytics${buildQuery({ action, ...params })}`);
}

export function fetchReports(action: string) {
  return apiFetch(`/api/reports?action=${encodeURIComponent(action)}`);
}

export function fetchSupplyChainScore(detailed = false) {
  return apiFetch(`/api/supply-chain-score${detailed ? '?detailed=true' : ''}`);
}

export function fetchReorderRecommendations() {
  return apiFetch('/api/inventory?action=reorder_recommendations');
}

export function fetchWarehouseZones() {
  return apiFetch('/api/warehouse?action=zones');
}

export function fetchWarehouseTrend() {
  return apiFetch('/api/warehouse?action=utilization_trend');
}

export function searchProducts(q: string) {
  return apiFetch(`/api/products?action=search&q=${encodeURIComponent(q)}`);
}

export function fetchProductDetail(idOrSku: string, by: 'id' | 'sku' = 'sku') {
  return apiFetch(`/api/products?action=detail&${by}=${encodeURIComponent(idOrSku)}`);
}

export function fetchSalesSeasonalIndex(params?: Record<string, string | number>) {
  return apiFetch(`/api/sales${buildQuery({ action: 'seasonal_index', ...params })}`);
}

export function fetchInventoryCapitalAnalysis() {
  return apiFetch('/api/inventory?action=capital_analysis');
}

export function fetchRiskMatrix() {
  return apiFetch('/api/risk?action=matrix');
}

export function fetchSalesForecast() {
  return apiFetch('/api/sales?action=forecast&horizon=14');
}

export function fetchSalesForecastForSku(sku: string, horizon = 14, alpha = 0.3) {
  return apiFetch(`/api/sales?action=forecast&sku=${encodeURIComponent(sku)}&horizon=${horizon}&alpha=${alpha}`);
}

export function fetchInventoryAlertTimeline(params?: Record<string, string | number>) {
  return apiFetch(`/api/inventory${buildQuery({ action: 'alert_timeline', ...params })}`);
}

export function fetchCostOptimization() {
  return apiFetch('/api/cost?action=optimization');
}

export function fetchSupplyChainWeather() {
  return apiFetch('/api/supply-chain-score?action=weather');
}

export function fetchPerformanceMetrics() {
  return apiFetch('/api/performance');
}

export function fetchSupplyChainScoreHistory() {
  return apiFetch('/api/supply-chain-score?action=history');
}

// ==================== POST / PUT Endpoints ====================

export function createReorder(data: Record<string, unknown>) {
  return apiFetch('/api/reorder', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function createSupplier(data: Record<string, unknown>) {
  return apiFetch('/api/suppliers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateSupplier(data: Record<string, unknown>) {
  return apiFetch('/api/suppliers', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function updateAlertRules(rules: AlertRule[]) {
  return apiFetch('/api/alert-rules', {
    method: 'PUT',
    body: JSON.stringify({ rules }),
  });
}

export function markEventsRead(ids?: string[], markAll?: boolean) {
  return apiFetch('/api/events', {
    method: 'PUT',
    body: JSON.stringify({ eventIds: ids, markAll }),
  });
}

export function createEvent(data: Record<string, unknown>) {
  return apiFetch('/api/events', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function createNote(data: Record<string, unknown>) {
  return apiFetch('/api/notes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function resolveNote(id: string) {
  return apiFetch('/api/notes', {
    method: 'PUT',
    body: JSON.stringify({ id, isResolved: true }),
  });
}

export function deleteNote(id: string) {
  return apiFetch(`/api/notes?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function createProduct(data: Record<string, unknown>) {
  return apiFetch('/api/products', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function markNotificationRead(notificationId: string) {
  return apiFetch('/api/notifications', {
    method: 'PUT',
    body: JSON.stringify({ notificationId }),
  });
}

export function stockAdjustment(data: { sku: string; quantity: number; reason: string; warehouse?: string }) {
  return apiFetch('/api/inventory?action=adjustment', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function stockTransfer(data: { sku: string; fromZone: string; toZone: string; quantity: number; reason?: string }) {
  return apiFetch('/api/warehouse?action=transfer', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateShipmentStatus(data: { trackingNumber: string; status: string; eta?: string; progress?: number; notes?: string }) {
  return apiFetch('/api/logistics', {
    method: 'POST',
    body: JSON.stringify({ action: 'update_status', ...data }),
  });
}

// ==================== Quality & Compliance Endpoints ====================

export function fetchQuality(action: string, params?: Record<string, string | number>) {
  return apiFetch(`/api/quality${buildQuery({ action, ...params })}`);
}

export function fetchCompliance(action: string, params?: Record<string, string | number>) {
  return apiFetch(`/api/compliance${buildQuery({ action, ...params })}`);
}

export function createReturnRecord(data: Record<string, unknown>) {
  return apiFetch('/api/quality?action=create_return', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function createDefectRecord(data: Record<string, unknown>) {
  return apiFetch('/api/quality?action=create_defect', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function createWarrantyCost(data: Record<string, unknown>) {
  return apiFetch('/api/quality?action=create_warranty', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateReturnRecord(data: { id: string; status: string }) {
  return apiFetch('/api/quality?action=update_return', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function updateDefectRecord(data: { id: string; status?: string; rootCause?: string; correctiveAction?: string }) {
  return apiFetch('/api/quality?action=update_defect', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function updateWarrantyCost(data: { id: string; status?: string; resolvedDate?: string }) {
  return apiFetch('/api/quality?action=update_warranty', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function createComplianceCert(data: Record<string, unknown>) {
  return apiFetch('/api/compliance?action=create_cert', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function createRegulationChange(data: Record<string, unknown>) {
  return apiFetch('/api/compliance?action=create_regulation', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateComplianceCert(data: Record<string, unknown>) {
  return apiFetch('/api/compliance?action=update_cert', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function updateRegulationChange(data: { id: string; status?: string; reviewedBy?: string; actionRequired?: string }) {
  return apiFetch('/api/compliance?action=update_regulation', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
