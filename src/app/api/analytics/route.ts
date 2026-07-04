import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { withErrorHandler, apiError } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { CACHE_TAGS, CACHE_TTL } from "@/lib/cache";
import {
  getSupplierPerformanceAnalytics,
  getSupplierPerformanceAnalyticsEnhanced,
  getCostOptimizationAnalytics,
  getInventoryForecastAnalytics,
  getSupplyChainRiskAnalytics,
  getSalesForecastAnalytics,
  getInventoryOptimizationAnalytics,
  getCostTrendsAnalytics,
  getInventoryTurnoverAnalytics,
  getKPIAnalytics,
  getTimeSeriesAnalytics,
  getComparisonAnalytics,
  getAnomaliesAnalytics,
} from "@/lib/queries/analytics.queries";
import {
  getInventoryReport,
  getCostReport,
  getSalesReport,
  getSupplierReport,
  getFullReport,
  getInventorySummary,
  getCostAnalysis,
  getCostSummary,
  getSupplierSummary,
  getExecutiveDashboard,
  getPerformanceDashboard,
  getInventoryReportEnhanced,
  getCostReportEnhanced,
  getSalesReportEnhanced,
  getLogisticsReport,
  getSupplierReportEnhanced,
} from "@/lib/queries/reports.queries";

// ─── Next.js unstable_cache wrappers for heavy analytics ──────────────────────
// These provide persistent/deduplicated caching on top of the in-memory cache.

const cachedSupplierPerformance = unstable_cache(
  getSupplierPerformanceAnalytics,
  ["analytics", "supplier-performance"],
  { revalidate: CACHE_TTL.VERY_LONG, tags: [CACHE_TAGS.ANALYTICS, CACHE_TAGS.SUPPLIERS] }
);

const cachedSupplierPerformanceEnhanced = unstable_cache(
  (months: number) => getSupplierPerformanceAnalyticsEnhanced(months),
  ["analytics", "supplier-performance-enhanced"],
  { revalidate: CACHE_TTL.VERY_LONG, tags: [CACHE_TAGS.ANALYTICS, CACHE_TAGS.SUPPLIERS] }
);

const cachedCostOptimization = unstable_cache(
  getCostOptimizationAnalytics,
  ["analytics", "cost-optimization"],
  { revalidate: CACHE_TTL.VERY_LONG, tags: [CACHE_TAGS.ANALYTICS, CACHE_TAGS.COST] }
);

const cachedSupplyChainRisk = unstable_cache(
  getSupplyChainRiskAnalytics,
  ["analytics", "supply-chain-risk"],
  { revalidate: CACHE_TTL.VERY_LONG, tags: [CACHE_TAGS.ANALYTICS, CACHE_TAGS.RISK] }
);

const cachedInventoryTurnover = unstable_cache(
  getInventoryTurnoverAnalytics,
  ["analytics", "inventory-turnover"],
  { revalidate: CACHE_TTL.VERY_LONG, tags: [CACHE_TAGS.ANALYTICS, CACHE_TAGS.INVENTORY] }
);

const cachedKPI = unstable_cache(
  getKPIAnalytics,
  ["analytics", "kpi"],
  { revalidate: CACHE_TTL.LONG, tags: [CACHE_TAGS.ANALYTICS] }
);

const cachedComparison = unstable_cache(
  getComparisonAnalytics,
  ["analytics", "comparison"],
  { revalidate: CACHE_TTL.VERY_LONG, tags: [CACHE_TAGS.ANALYTICS] }
);

const cachedAnomalies = unstable_cache(
  getAnomaliesAnalytics,
  ["analytics", "anomalies"],
  { revalidate: CACHE_TTL.LONG, tags: [CACHE_TAGS.ANALYTICS, CACHE_TAGS.INVENTORY, CACHE_TAGS.COST] }
);

// ─── unstable_cache wrappers for reports (merged from /api/reports) ──────────

const cachedFullReport = unstable_cache(
  getFullReport,
  ["analytics", "full-report"],
  { revalidate: CACHE_TTL.VERY_LONG, tags: [CACHE_TAGS.ANALYTICS, CACHE_TAGS.REPORTS] }
);

const cachedInventorySummary = unstable_cache(
  getInventorySummary,
  ["analytics", "inventory-summary"],
  { revalidate: CACHE_TTL.LONG, tags: [CACHE_TAGS.ANALYTICS, CACHE_TAGS.INVENTORY, CACHE_TAGS.REPORTS] }
);

const cachedCostSummary = unstable_cache(
  getCostSummary,
  ["analytics", "cost-summary"],
  { revalidate: CACHE_TTL.LONG, tags: [CACHE_TAGS.ANALYTICS, CACHE_TAGS.COST, CACHE_TAGS.REPORTS] }
);

const cachedSupplierSummary = unstable_cache(
  getSupplierSummary,
  ["analytics", "supplier-summary"],
  { revalidate: CACHE_TTL.VERY_LONG, tags: [CACHE_TAGS.ANALYTICS, CACHE_TAGS.SUPPLIERS, CACHE_TAGS.REPORTS] }
);

const cachedExecutiveDashboard = unstable_cache(
  getExecutiveDashboard,
  ["analytics", "executive-dashboard"],
  { revalidate: CACHE_TTL.LONG, tags: [CACHE_TAGS.ANALYTICS, CACHE_TAGS.DASHBOARD, CACHE_TAGS.REPORTS] }
);

const cachedPerformanceDashboard = unstable_cache(
  getPerformanceDashboard,
  ["analytics", "performance-dashboard"],
  { revalidate: CACHE_TTL.LONG, tags: [CACHE_TAGS.ANALYTICS, CACHE_TAGS.REPORTS] }
);

// GET /api/analytics - Unified analytics & reports API
// Actions: supplier-performance, cost-optimization, inventory-forecast, supply-chain-risk,
//          sales_forecast, inventory_optimization, supplier_performance, cost_trends, inventory_turnover,
//          kpi, time_series, comparison, anomalies,
//          inventory-report, cost-report, sales-report, supplier-report, full-report,
//          inventory_summary, cost_analysis, cost_summary, supplier_summary,
//          executive_dashboard, performance_dashboard,
//          inventory_report, cost_report, sales_report, logistics_report, supplier_report
// Also accepts `type` param as an alternative to `action` for report actions.
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "supplier-performance";
  const type = searchParams.get("type") || "";

  // Support `type` parameter as an alternative to `action` (legacy reports pattern)
  const effectiveAction = type || action;

  switch (effectiveAction) {
    // ── Analytics actions ──────────────────────────────────────────────
    case "supplier-performance": {
      const data = await cachedSupplierPerformance();
      return NextResponse.json(data);
    }
    case "supplier_performance": {
      const months = parseInt(searchParams.get("months") || "6");
      const data = await cachedSupplierPerformanceEnhanced(months);
      return NextResponse.json(data);
    }
    case "cost-optimization": {
      const data = await cachedCostOptimization();
      return NextResponse.json(data);
    }
    case "inventory-forecast": {
      const forecastDays = parseInt(searchParams.get("days") || "14");
      const alpha = parseFloat(searchParams.get("alpha") || "0.3");
      const beta = parseFloat(searchParams.get("beta") || "0.1");
      const data = await getInventoryForecastAnalytics(forecastDays, alpha, beta);
      return NextResponse.json(data);
    }
    case "supply-chain-risk": {
      const data = await cachedSupplyChainRisk();
      return NextResponse.json(data);
    }
    case "sales_forecast": {
      const forecastDays = parseInt(searchParams.get("days") || "30");
      const data = await getSalesForecastAnalytics(forecastDays);
      return NextResponse.json(data);
    }
    case "inventory_optimization": {
      const data = await getInventoryOptimizationAnalytics();
      return NextResponse.json(data);
    }
    case "cost_trends": {
      const months = parseInt(searchParams.get("months") || "6");
      const data = await getCostTrendsAnalytics(months);
      return NextResponse.json(data);
    }
    case "inventory_turnover": {
      const data = await cachedInventoryTurnover();
      return NextResponse.json(data);
    }
    case "kpi": {
      const data = await cachedKPI();
      return NextResponse.json(data);
    }
    case "time_series": {
      const metric = searchParams.get("metric") || undefined;
      const days = searchParams.get("days") ? parseInt(searchParams.get("days")!) : undefined;
      const data = await getTimeSeriesAnalytics({ metric, days });
      return NextResponse.json(data);
    }
    case "comparison": {
      const data = await cachedComparison();
      return NextResponse.json(data);
    }
    case "anomalies": {
      const data = await cachedAnomalies();
      return NextResponse.json(data);
    }

    // ── Report actions (legacy ─ hyphen-separated) ─────────────────────
    case "inventory-report": {
      const data = await getInventoryReport();
      return NextResponse.json(data);
    }
    case "cost-report": {
      const data = await getCostReport();
      return NextResponse.json(data);
    }
    case "sales-report": {
      const data = await getSalesReport();
      return NextResponse.json(data);
    }
    case "supplier-report": {
      const data = await getSupplierReport();
      return NextResponse.json(data);
    }
    case "full-report": {
      const data = await cachedFullReport();
      return NextResponse.json(data);
    }

    // ── Report actions (enhanced ─ underscore-separated) ───────────────
    case "inventory_summary": {
      const data = await cachedInventorySummary();
      return NextResponse.json(data);
    }
    case "cost_analysis": {
      const data = await getCostAnalysis();
      return NextResponse.json(data);
    }
    case "cost_summary": {
      const data = await cachedCostSummary();
      return NextResponse.json(data);
    }
    case "supplier_summary": {
      const data = await cachedSupplierSummary();
      return NextResponse.json(data);
    }
    case "executive_dashboard": {
      const data = await cachedExecutiveDashboard();
      return NextResponse.json(data);
    }
    case "performance_dashboard": {
      const data = await cachedPerformanceDashboard();
      return NextResponse.json(data);
    }

    // ── Report actions (type-param / enhanced variants) ────────────────
    case "inventory_report": {
      const data = await getInventoryReportEnhanced();
      return NextResponse.json(data);
    }
    case "cost_report": {
      const data = await getCostReportEnhanced();
      return NextResponse.json(data);
    }
    case "sales_report": {
      const data = await getSalesReportEnhanced();
      return NextResponse.json(data);
    }
    case "logistics_report": {
      const data = await getLogisticsReport();
      return NextResponse.json(data);
    }
    case "supplier_report": {
      const data = await getSupplierReportEnhanced();
      return NextResponse.json(data);
    }

    default:
      return apiError(`未知操作: ${effectiveAction}`, 400, "UNKNOWN_ACTION");
  }
}));
