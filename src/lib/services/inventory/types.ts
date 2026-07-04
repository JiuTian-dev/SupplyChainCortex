/**
 * Inventory Service - Type definitions and pure helper functions
 */

export type StockStatus = 'healthy' | 'warning' | 'critical' | 'overstock';

export interface InventoryOverview {
  totalItems: number;
  totalQuantity: number;
  byStatus: Record<StockStatus, number>;
  lowStockAlerts: number;
  avgTurnoverDays: number;
  avgTurnoverRate: number;
}

export interface InventoryForecastItem {
  sku: string;
  productName: string;
  category?: string;
  currentStock: number;
  safetyStock: number;
  reorderPoint: number;
  dailyVelocity: number;
  forecastDays: number;
  projectedStock: number;
  daysUntilReorder: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface StockoutRiskItem {
  sku: string;
  productName: string;
  category?: string;
  currentStock: number;
  inTransit: number;
  availableStock: number;
  safetyStock: number;
  stockStatus: string;
  belowSafetyStock: boolean;
  dailyVelocity: number;
  risks: Array<{
    period: number;
    projectedConsumption: number;
    remainingStock: number;
    riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  }>;
  overallRisk: 'safe' | 'low' | 'medium' | 'high' | 'critical';
}

/** Inventory list filters */
export interface InventoryListFilters {
  warehouse?: string;
  category?: string;
  skus?: string[];  // comma-separated SKU list for multi-select filtering
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/** Compute stock status based on quantity vs safety stock ratios */
export function computeStockStatus(quantity: number, safetyStock: number): StockStatus {
  if (quantity <= safetyStock * 0.5) return 'critical';
  if (quantity <= safetyStock) return 'warning';
  if (quantity >= safetyStock * 3) return 'overstock';
  return 'healthy';
}

/** Compute safety stock using Z-score method */
export function computeSafetyStock(
  salesRecords: { quantity: number }[],
  serviceLevel = 0.95,
  leadTimeDays = 14
): number {
  if (salesRecords.length === 0) return 0;

  const dailyQuantities = salesRecords.map(r => r.quantity);
  const mean = dailyQuantities.reduce((a, b) => a + b, 0) / dailyQuantities.length;
  const variance = dailyQuantities.reduce((sum, q) => sum + Math.pow(q - mean, 2), 0) / dailyQuantities.length;
  const stdDev = Math.sqrt(variance);

  const zScores: Record<number, number> = { 0.9: 1.28, 0.95: 1.65, 0.98: 2.05, 0.99: 2.33 };
  const z = zScores[serviceLevel] || 1.65;

  return Math.round(z * stdDev * Math.sqrt(leadTimeDays));
}
