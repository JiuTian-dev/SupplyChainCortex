/**
 * GET /api/export - Enhanced data export API
 * Modules: inventory, cost, logistics, sales, all, report
 * Formats: csv, json
 * Report types: inventory_report, cost_report, sales_report, logistics_report, supplier_report
 *
 * Thin handler: validation → service calls → response formatting
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, apiError } from '@/lib/api-utils';
import { withExportRateLimit } from '@/lib/api-protection';
import { optionalRequirePermission } from '@/lib/auth-helpers';
import {
  exportInventoryData,
  exportCostData,
  exportLogisticsData,
  exportSalesData,
  exportSupplierData,
  convertToCsv,
  EXPORT_MODULES,
  EXPORT_FORMATS,
  REPORT_TYPES,
  MODULE_NAMES,
  type ExportModule,
  type ReportType,
} from '@/lib/services/export.service';

// ─── Response Helpers (HTTP-layer only) ────────────────────────────────────────

function exportAsJson(
  data: Record<string, unknown[]>,
  exportModule: string
): NextResponse {
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `supply-chain-${exportModule}-${timestamp}.json`;

  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}

function exportAsCsv(
  data: Record<string, unknown[]>,
  exportModule: string
): NextResponse {
  const timestamp = new Date().toISOString().split('T')[0];

  // If single module, export as one CSV
  if (exportModule !== 'all') {
    const moduleData = data[exportModule];
    if (!moduleData || moduleData.length === 0) {
      return apiError(`模块 ${exportModule} 无数据可导出`, 404, 'NO_DATA');
    }
    const csv = convertToCsv(moduleData as Record<string, unknown>[]);
    const filename = `supply-chain-${exportModule}-${timestamp}.csv`;
    const bom = '\uFEFF';

    return new NextResponse(bom + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  }

  // For "all" module, combine into a single CSV with section headers
  const sections: string[] = [];

  for (const [key, records] of Object.entries(data)) {
    if (records.length === 0) continue;
    sections.push(`=== ${MODULE_NAMES[key] || key} ===`);
    sections.push(convertToCsv(records as Record<string, unknown>[]));
    sections.push(''); // Empty line separator
  }

  const csv = sections.join('\n');
  const filename = `supply-chain-all-${timestamp}.csv`;
  const bom = '\uFEFF';

  return new NextResponse(bom + csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}

// ─── Report Export (returns NextResponse with file download) ───────────────────

async function handleReportExport(
  reportType: string | undefined,
  format: string,
  startDate?: string,
  endDate?: string
): Promise<NextResponse> {
  if (!reportType) {
    return apiError(
      '报告导出需要 type 参数，支持: ' + REPORT_TYPES.join(', '),
      400,
      'MISSING_TYPE'
    );
  }

  let reportData: Record<string, unknown>[];

  switch (reportType as ReportType) {
    case 'inventory_report': {
      reportData = await exportInventoryData(startDate, endDate);
      break;
    }
    case 'cost_report': {
      reportData = await exportCostData(startDate, endDate);
      break;
    }
    case 'sales_report': {
      reportData = await exportSalesData(startDate, endDate);
      break;
    }
    case 'logistics_report': {
      reportData = await exportLogisticsData(startDate, endDate);
      break;
    }
    case 'supplier_report': {
      reportData = await exportSupplierData();
      break;
    }
    default:
      return apiError(
        `不支持的报告类型: ${reportType}`,
        400,
        'INVALID_REPORT_TYPE'
      );
  }

  const timestamp = new Date().toISOString().split('T')[0];

  if (format === 'json') {
    const filename = `report-${reportType}-${timestamp}.json`;
    return new NextResponse(
      JSON.stringify(
        { reportType, generatedAt: new Date().toISOString(), data: reportData },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        },
      }
    );
  }

  // CSV export
  const csv = convertToCsv(reportData);
  const filename = `report-${reportType}-${timestamp}.csv`;
  const bom = '\uFEFF';

  return new NextResponse(bom + csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

export const GET = withExportRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequirePermission('report:export');
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'csv';
  const exportModule = searchParams.get('module') || 'all';
  const startDate =
    searchParams.get('from') || searchParams.get('startDate') || undefined;
  const endDate =
    searchParams.get('to') || searchParams.get('endDate') || undefined;
  const reportType = searchParams.get('type') || undefined;

  // Validate format
  if (!EXPORT_FORMATS.includes(format as typeof EXPORT_FORMATS[number])) {
    return apiError('不支持的导出格式，请使用 csv 或 json', 400, 'INVALID_FORMAT');
  }

  // Handle report export
  if (exportModule === 'report') {
    return await handleReportExport(reportType, format, startDate, endDate);
  }

  // Validate module
  if (!EXPORT_MODULES.includes(exportModule as ExportModule)) {
    return apiError(
      `不支持的模块: ${exportModule}，可选: ${EXPORT_MODULES.join(', ')}`,
      400,
      'INVALID_MODULE'
    );
  }

  // Validate date format if provided
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (startDate && !dateRegex.test(startDate)) {
    return apiError('from 格式无效，需要 YYYY-MM-DD', 400, 'INVALID_DATE');
  }
  if (endDate && !dateRegex.test(endDate)) {
    return apiError('to 格式无效，需要 YYYY-MM-DD', 400, 'INVALID_DATE');
  }

  // Collect data based on module
  const data: Record<string, unknown[]> = {};

  if (exportModule === 'all' || exportModule === 'inventory') {
    data.inventory = await exportInventoryData(startDate, endDate);
  }
  if (exportModule === 'all' || exportModule === 'cost') {
    data.cost = await exportCostData(startDate, endDate);
  }
  if (exportModule === 'all' || exportModule === 'logistics') {
    data.logistics = await exportLogisticsData(startDate, endDate);
  }
  if (exportModule === 'all' || exportModule === 'sales') {
    data.sales = await exportSalesData(startDate, endDate);
  }

  // Format response
  if (format === 'json') {
    return exportAsJson(data, exportModule);
  }

  return exportAsCsv(data, exportModule);
}));
