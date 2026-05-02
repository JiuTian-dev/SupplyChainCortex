import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { withErrorHandler, apiError } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { CACHE_TAGS, CACHE_TTL } from '@/lib/cache';
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
} from '@/lib/queries/reports.queries';

// ─── Next.js unstable_cache wrappers for heavy reports ────────────────────────
// Reports are read-heavy aggregations that benefit from persistent caching.

const cachedExecutiveDashboard = unstable_cache(
  getExecutiveDashboard,
  ['reports', 'executive-dashboard'],
  { revalidate: CACHE_TTL.LONG, tags: [CACHE_TAGS.REPORTS, CACHE_TAGS.DASHBOARD] }
);

const cachedPerformanceDashboard = unstable_cache(
  getPerformanceDashboard,
  ['reports', 'performance-dashboard'],
  { revalidate: CACHE_TTL.LONG, tags: [CACHE_TAGS.REPORTS] }
);

const cachedFullReport = unstable_cache(
  getFullReport,
  ['reports', 'full-report'],
  { revalidate: CACHE_TTL.VERY_LONG, tags: [CACHE_TAGS.REPORTS] }
);

const cachedInventorySummary = unstable_cache(
  getInventorySummary,
  ['reports', 'inventory-summary'],
  { revalidate: CACHE_TTL.LONG, tags: [CACHE_TAGS.REPORTS, CACHE_TAGS.INVENTORY] }
);

const cachedCostSummary = unstable_cache(
  getCostSummary,
  ['reports', 'cost-summary'],
  { revalidate: CACHE_TTL.LONG, tags: [CACHE_TAGS.REPORTS, CACHE_TAGS.COST] }
);

const cachedSupplierSummary = unstable_cache(
  getSupplierSummary,
  ['reports', 'supplier-summary'],
  { revalidate: CACHE_TTL.VERY_LONG, tags: [CACHE_TAGS.REPORTS, CACHE_TAGS.SUPPLIERS] }
);

// GET /api/reports - Report generation API
// Actions: inventory-report, cost-report, sales-report, supplier-report, full-report,
//          inventory_summary, cost_analysis, cost_summary, supplier_summary,
//          executive_dashboard, performance_dashboard
// Type param: inventory_report, cost_report, sales_report, logistics_report, supplier_report

const SUPPORTED_ACTIONS = [
  'inventory-report', 'cost-report', 'sales-report', 'supplier-report', 'full-report',
  'inventory_summary', 'cost_analysis', 'cost_summary', 'supplier_summary',
  'executive_dashboard', 'performance_dashboard',
  'inventory_report', 'cost_report', 'sales_report', 'logistics_report', 'supplier_report',
];

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || '';
  const type = searchParams.get('type') || '';

  // Support `type` parameter as an alternative to `action` for new report types
  const effectiveAction = type || action || 'full-report';

  let result: unknown;

  switch (effectiveAction) {
    // Legacy report actions (in-memory cache via service layer is sufficient)
    case 'inventory-report':
      result = await getInventoryReport();
      break;
    case 'cost-report':
      result = await getCostReport();
      break;
    case 'sales-report':
      result = await getSalesReport();
      break;
    case 'supplier-report':
      result = await getSupplierReport();
      break;
    case 'full-report':
      result = await cachedFullReport();
      break;

    // Enhanced report actions (heavy aggregations get unstable_cache)
    case 'inventory_summary':
      result = await cachedInventorySummary();
      break;
    case 'cost_analysis':
      result = await getCostAnalysis();
      break;
    case 'cost_summary':
      result = await cachedCostSummary();
      break;
    case 'supplier_summary':
      result = await cachedSupplierSummary();
      break;
    case 'executive_dashboard':
      result = await cachedExecutiveDashboard();
      break;
    case 'performance_dashboard':
      result = await cachedPerformanceDashboard();
      break;

    // Type-param report actions
    case 'inventory_report':
      result = await getInventoryReportEnhanced();
      break;
    case 'cost_report':
      result = await getCostReportEnhanced();
      break;
    case 'sales_report':
      result = await getSalesReportEnhanced();
      break;
    case 'logistics_report':
      result = await getLogisticsReport();
      break;
    case 'supplier_report':
      result = await getSupplierReportEnhanced();
      break;

    default:
      return apiError(
        `未知操作，支持: ${SUPPORTED_ACTIONS.join(', ')}`,
        400,
        'INVALID_ACTION'
      );
  }

  return NextResponse.json(result);
}));
