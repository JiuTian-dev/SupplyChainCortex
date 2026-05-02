/**
 * Reports Types — shared type definitions for all report query modules.
 * Extracted from services/reports.service.ts.
 */

// ─── Base Reports ───────────────────────────────────────────────────────────────

export interface InventoryReportResult {
  title: string;
  generatedAt: string;
  summary: {
    totalSKUs: number;
    totalStock: number;
    totalValue: number;
    criticalCount: number;
    warningCount: number;
    overstockCount: number;
    avgTurnoverDays: number;
    healthRate: number;
  };
  byCategory: Array<{ category: string; quantity: number; value: number; items: number }>;
  items: Array<{
    sku: string; productName: string; category: string; warehouse: string;
    quantity: number; safetyStock: number; stockStatus: string;
    turnoverDays: number; unitCost: number; totalValue: number;
  }>;
}

export interface CostReportResult {
  title: string;
  generatedAt: string;
  summary: {
    totalProducts: number; avgGrossMargin: number; avgLandedCost: number;
    lowMarginCount: number;
    costBreakdown: { rawMaterial: number; labor: number; logistics: number; tariff: number; platformFee: number };
  };
  byCategory: Array<{ category: string; avgMargin: number; avgLanded: number; items: number }>;
  items: Array<{
    sku: string; productName: string; totalLanded: number; grossMargin: number;
    exchangeRate: number;
    breakdown: { rawMaterial: number; labor: number; logistics: number; tariff: number; platformFee: number };
  }>;
}

export interface SalesReportResult {
  title: string; generatedAt: string;
  summary: { totalRevenue: number; totalQuantity: number; totalOrders: number; avgOrderValue: number };
  byPlatform: Array<{ platform: string; revenue: number; quantity: number; orders: number }>;
  byCategory: Array<{ category: string; revenue: number; quantity: number }>;
}

export interface SupplierReportResult {
  title: string; generatedAt: string;
  summary: { totalSuppliers: number; activeSuppliers: number; avgRating: number; avgLeadTime: number };
  byRegion: Array<{ region: string; count: number; avgRating: number; avgLeadTime: number }>;
  suppliers: Array<{ code: string; name: string; region: string; category: string; leadTime: number; rating: number; status: string }>;
}

export interface FullReportResult {
  title: string; generatedAt: string;
  overview: {
    totalProducts: number; totalRevenue: number; totalStock: number; totalStockValue: number;
    avgGrossMargin: number; criticalItems: number; delayedShipments: number; activeSuppliers: number;
  };
  inventory: { totalSKUs: number; healthy: number; warning: number; critical: number; overstock: number };
  cost: { avgMargin: number; lowMarginCount: number };
  logistics: { totalShipments: number; inTransit: number; delayed: number; delivered: number };
  sales: { totalRevenue: number; totalQuantity: number; platforms: string[] };
  suppliers: { total: number; active: number; avgRating: number };
}

// ─── Summary Reports ────────────────────────────────────────────────────────────

export interface InventorySummaryResult {
  title: string; generatedAt: string;
  summary: { totalProducts: number; totalStockValue: number; stockStatusDistribution: { healthy: number; warning: number; critical: number; overstock: number } };
  warehouseUtilization: Array<{ warehouse: string; totalItems: number; totalQuantity: number; totalValue: number; criticalCount: number; warningCount: number; healthRate: number }>;
  topOverstockItems: Array<{ sku: string; productName: string; category: string; quantity: number; safetyStock: number; ratio: number; warehouse: string }>;
  topCriticalItems: Array<{ sku: string; productName: string; category: string; quantity: number; safetyStock: number; reorderPoint: number; deficit: number; warehouse: string }>;
  reorderRecommendations: { count: number; pendingOrders: number };
  avgTurnoverDays: number;
  abcClassDistribution: Record<string, number>;
  agingSummary: { fresh: number; week: number; month: number; stale: number };
  salesVelocityTop: Array<{ sku: string; productName: string; totalQuantity: number; dailyAvg: number }>;
}

export interface CostAnalysisResult {
  title: string; generatedAt: string;
  costBreakdownByCategory: Array<{ category: string; count: number; avgRawMaterial: number; avgLabor: number; avgLogistics: number; avgTariff: number; avgPlatformFee: number; avgTotalLanded: number; avgMargin: number }>;
  marginDistribution: { excellent: number; good: number; moderate: number; low: number; danger: number };
  topHighestCostProducts: Array<{ sku: string; productName: string; category: string; totalLanded: number; sellingPrice: number; grossMargin: number }>;
  topLowestMarginProducts: Array<{ sku: string; productName: string; category: string; grossMargin: number; totalLanded: number; sellingPrice: number }>;
  exchangeRateImpact: { currentAvgRate: number; hypotheticalRate: number; estimatedImpactPercent: number; estimatedCostSaving: number; note: string };
  tariffExposureByOrigin: Array<{ origin: string; count: number; avgTariff: number; avgTariffPercent: number; totalTariffExposure: number }>;
}

export interface CostSummaryResult {
  title: string; generatedAt: string;
  summary: { avgLandedCost: number; avgMargin: number; costTrendDirection: string; totalProducts: number; productsBelowSafetyMargin: number };
  productsBelowSafetyMargin: Array<{ sku: string; productName: string; category: string; grossMargin: number; totalLanded: number; sellingPrice: number; deficit: number }>;
  costBreakdownByCategory: Array<{ category: string; count: number; avgLandedCost: number; avgMargin: number; avgRawMaterial: number; avgLabor: number; avgLogistics: number; avgTariff: number; avgPlatformFee: number }>;
  fxExposureAnalysis: { currentAvgRate: number; rateStdDev: number; totalFxExposedCost: number; fxExposedPercent: number; sensitivityAnalysis: { rateUp1Percent: number; rateDown1Percent: number; rateUp5Percent: number; rateDown5Percent: number }; rateDistribution: { below7: number; range7to72: number; range72to75: number; above75: number } };
}

export interface SupplierSummaryResult {
  title: string; generatedAt: string;
  summary: { totalSuppliers: number; activeCount: number; avgRating: number; onTimeDeliveryRate: number };
  riskDistribution: { high: number; medium: number; low: number };
  topPerformers: Array<{ code: string; name: string; region: string; category: string; rating: number; leadTime: number; onTimeRate: number; riskScore: number; riskLevel: string }>;
  worstPerformers: Array<{ code: string; name: string; region: string; category: string; rating: number; leadTime: number; onTimeRate: number; riskScore: number; riskLevel: string }>;
  categoryDistribution: Record<string, number>;
  regionDistribution: Record<string, number>;
}

// ─── Executive Dashboard ────────────────────────────────────────────────────────

export interface ExecutiveDashboardResult {
  title: string; generatedAt: string;
  supplyChainHealth: { overallScore: number; grade: string; gradeLabel: string; subScores: { inventory: { score: number; weight: string; label: string }; cost: { score: number; weight: string; label: string }; logistics: { score: number; weight: string; label: string }; sales: { score: number; weight: string; label: string }; risk: { score: number; weight: string; label: string } } };
  keyMetrics: { revenue: { total: number; recent30d: number; growthRate: number }; cost: { avgLandedCost: number; avgMargin: number; lowMarginProducts: number }; inventory: { totalProducts: number; totalSKUs: number; totalStockValue: number; criticalItems: number; warningItems: number; overstockItems: number }; logistics: { totalShipments: number; onTimeDeliveryRate: number; delayedShipments: number; inTransit: number } };
  criticalAlerts: { count: number; criticalCount: number; warningCount: number; items: Array<{ category: string; severity: string; message: string; action: string }> };
  actionItems: { total: number; highPriority: number; items: Array<{ priority: string; title: string; description: string; category: string }> };
  recentEvents: Array<{ type: string; title: string; severity: string; createdAt: string }>;
}

export interface PerformanceDashboardResult {
  title: string; generatedAt: string;
  kpiSummary: { revenue: number; avgMargin: number; avgTurnoverDays: number; avgTurnoverRate: number; onTimeDeliveryRate: number; totalSKUs: number; criticalItems: number; activeSuppliers: number; delayedShipments: number };
  monthOverMonth: Array<{ month: string; revenue: number; quantity: number; orders: number; revenueMoM: number | null; quantityMoM: number | null }>;
  trendIndicators: { revenueTrend: string; marginTrend: string; inventoryTrend: string; deliveryTrend: string };
  inventoryHealth: { healthy: number; warning: number; critical: number; overstock: number; healthRate: number };
  shipmentSummary: { total: number; pending: number; inTransit: number; customs: number; delivered: number; delayed: number };
}

// ─── Enhanced Reports ───────────────────────────────────────────────────────────

export interface InventoryReportEnhancedResult {
  title: string; generatedAt: string;
  stockDistribution: { totalItems: number; totalValue: number; byStatus: { healthy: number; warning: number; critical: number; overstock: number } };
  turnoverAnalysis: { avgTurnoverRate: number; avgTurnoverDays: number; bestPerformers: Array<{ sku: string; productName: string; turnoverRate: number; turnoverDays: number }>; worstPerformers: Array<{ sku: string; productName: string; turnoverRate: number; turnoverDays: number }> };
  warehouseUtilization: Array<{ warehouse: string; totalItems: number; totalQuantity: number; totalValue: number; healthRate: number }>;
  reorderRecommendations: { count: number; items: Array<{ sku: string; productName: string; quantity: number; safetyStock: number; reorderPoint: number; deficit: number; warehouse: string; stockStatus: string }> };
  abcAnalysis: Array<{ class: string; count: number; totalValue: number; avgMargin: number }>;
}

export interface CostReportEnhancedResult {
  title: string; generatedAt: string;
  costBreakdown: { totalLandedCost: number; avgMargin: number; productCount: number };
  costComposition: { rawMaterial: number; labor: number; logistics: number; tariff: number; platformFee: number };
  marginDistribution: { high: number; medium: number; low: number };
  costTrendIndicators: { trend: string; recentAvgMargin: number; overallAvgMargin: number; delta: number };
  topHighestCostItems: Array<{ sku: string; productName: string; totalLanded: number; category: string; grossMargin: number }>;
  topHighestMarginItems: Array<{ sku: string; productName: string; grossMargin: number; totalLanded: number; sellingPrice: number }>;
}

export interface SalesReportEnhancedResult {
  title: string; generatedAt: string;
  revenueSummary: { totalRevenue: number; avgDailyRevenue: number; totalQuantity: number; totalOrders: number; growthRate: number };
  platformBreakdown: Array<{ platform: string; revenue: number; quantity: number; orders: number; avgOrderValue: number }>;
  topPerformingProducts: { byRevenue: Array<{ sku: string; productName: string; revenue: number; quantity: number; category: string }>; byQuantity: Array<{ sku: string; productName: string; revenue: number; quantity: number; category: string }> };
  salesTrend: Array<{ date: string; revenue: number; quantity: number; orders: number }>;
  categoryAnalysis: Array<{ category: string; revenue: number; quantity: number; products: number }>;
}

export interface LogisticsReportResult {
  title: string; generatedAt: string;
  shipmentStatusDistribution: Record<string, number>;
  onTimeDeliveryRate: number; averageDelayDays: number;
  carrierPerformance: Array<{ carrier: string; totalShipments: number; onTimeRate: number; avgDelayDays: number; delivered: number }>;
  riskLevelDistribution: Record<string, number>;
  totalShipments: number;
}

export interface SupplierReportEnhancedResult {
  title: string; generatedAt: string;
  ratingDistribution: { excellent: number; good: number; average: number; poor: number };
  leadTimeAnalysis: { avgLeadTime: number; minLeadTime: number; maxLeadTime: number; shortTerm: number; mediumTerm: number; longTerm: number };
  categoryCoverage: Array<{ category: string; supplierCount: number; suppliers: Array<{ code: string; name: string; rating: number }> }>;
  regionalDistribution: Array<{ region: string; count: number; avgRating: number; avgLeadTime: number; productCategories: string[] }>;
  totalSuppliers: number; activeSuppliers: number;
}
