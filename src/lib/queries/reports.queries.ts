/**
 * Reports Barrel — re-exports all report query functions and types.
 * Replace for the former services/reports.service.ts.
 */

export { getInventoryReport, getInventorySummary, getInventoryReportEnhanced } from './reports-inventory.queries';
export { getCostReport, getCostAnalysis, getCostSummary, getCostReportEnhanced } from './reports-cost.queries';
export { getSalesReport, getSalesReportEnhanced } from './reports-sales.queries';
export { getSupplierReport, getSupplierSummary, getSupplierReportEnhanced } from './reports-supplier.queries';
export { getFullReport, getExecutiveDashboard, getPerformanceDashboard, getLogisticsReport } from './reports-executive.queries';

export type {
  InventoryReportResult, CostReportResult, SalesReportResult, SupplierReportResult, FullReportResult,
  InventorySummaryResult, CostAnalysisResult, CostSummaryResult, SupplierSummaryResult,
  ExecutiveDashboardResult, PerformanceDashboardResult,
  InventoryReportEnhancedResult, CostReportEnhancedResult, SalesReportEnhancedResult,
  LogisticsReportResult, SupplierReportEnhancedResult,
} from './reports-types';
