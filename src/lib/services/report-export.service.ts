/**
 * Report Export Service — client-side export utilities for the supply chain dashboard.
 *
 * Provides CSV (via papaparse), Excel-compatible HTML, and print-based PDF export,
 * plus a comprehensive dashboard summary report generator.
 */

import Papa from 'papaparse';
import {
  fetchDashboard,
  fetchInventory,
  fetchCost,
  fetchLogistics,
  fetchSales,
  fetchSuppliers,
  fetchRisk,
  fetchPerformanceMetrics,
} from '@/lib/api-client';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ExportColumn {
  key: string;
  label: string;
}

export interface ExportSheet {
  name: string;
  rows: Record<string, unknown>[];
  columns?: ExportColumn[];
}

export interface DashboardReportData {
  kpiSummary: Record<string, unknown>[];
  inventoryHealth: Record<string, unknown>[];
  costAnalysis: Record<string, unknown>[];
  logisticsStatus: Record<string, unknown>[];
  salesTrends: Record<string, unknown>[];
  supplierPerformance: Record<string, unknown>[];
  riskAlerts: Record<string, unknown>[];
}

// ─── CSV Export ────────────────────────────────────────────────────────────────

/**
 * Export rows as CSV using papaparse and trigger a browser download.
 * Handles empty data, special characters, and large datasets.
 */
export function exportToCSV(
  rows: Record<string, unknown>[],
  columns: ExportColumn[],
  filename: string,
): void {
  if (!rows.length) {
    console.warn('[exportToCSV] No data to export — skipping.');
    return;
  }

  // Map rows to only include requested columns, in order
  const mapped = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (const col of columns) {
      obj[col.label] = row[col.key] ?? '';
    }
    return obj;
  });

  const csv = Papa.unparse(mapped, {
    quotes: true,       // quote all fields for safety
    delimiter: ',',
    newline: '\n',
  });

  triggerDownload(csv, filename, 'text/csv;charset=utf-8;', 'csv');
}

// ─── PDF Export (print-based) ─────────────────────────────────────────────────

/**
 * Export a DOM element's content as PDF via the browser's print dialog.
 * Clones the element, applies A4 print styles, and opens print.
 * Falls back to a CSV export if the element is not found.
 */
export function exportToPDF(
  elementId: string,
  filename: string,
  data?: Record<string, unknown>[],
  columns?: ExportColumn[],
): void {
  const sourceEl = document.getElementById(elementId);
  if (!sourceEl) {
    console.warn(`[exportToPDF] Element #${elementId} not found.`);
    if (data && columns) {
      exportToCSV(data, columns, filename);
    }
    return;
  }

  const clone = sourceEl.cloneNode(true) as HTMLElement;
  // Remove interactive elements from clone
  clone.querySelectorAll('button, input, select, textarea, [role="button"]')
    .forEach((el) => el.remove());

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    console.warn('[exportToPDF] Popup blocked — falling back to CSV.');
    if (data && columns) {
      exportToCSV(data, columns, filename);
    }
    return;
  }

  const styles = Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules || [])
          .map((rule) => rule.cssText)
          .join('\n');
      } catch {
        return '';
      }
    })
    .join('\n');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${filename}</title>
        <style>
          ${styles}
          @page {
            size: A4;
            margin: 15mm 20mm;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print, .no-print * { display: none !important; }
          }
          body { font-family: system-ui, sans-serif; padding: 20px; }
          table { border-collapse: collapse; width: 100%; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background-color: #f5f5f5; font-weight: 600; }
          h1 { font-size: 18px; margin-bottom: 12px; }
          h2 { font-size: 14px; margin-top: 20px; margin-bottom: 8px; }
        </style>
      </head>
      <body>
        <h1>${filename}</h1>
        <div id="print-content">${clone.outerHTML}</div>
        <script>
          window.onload = function() { window.print(); window.close(); };
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

// ─── Excel-compatible Export ───────────────────────────────────────────────────

/**
 * Export data as an Excel-compatible HTML file (.xls).
 * Each key in `sheets` becomes a titled section with an HTML table.
 * Supports basic formatting: borders, header background color, column alignment.
 */
export function exportToExcel(
  sheets: Record<string, { rows: Record<string, unknown>[]; columns?: ExportColumn[] }>,
  filename: string,
): void {
  const sheetNames = Object.keys(sheets);
  if (!sheetNames.length) {
    console.warn('[exportToExcel] No sheets provided — skipping.');
    return;
  }

  const sections = sheetNames
    .map((name) => {
      const { rows, columns } = sheets[name];
      if (!rows.length) return '';

      const cols =
        columns ??
        (rows.length > 0
          ? Object.keys(rows[0]).map((k) => ({ key: k, label: k } as ExportColumn))
          : []);

      const headerRow = cols.map((c) => escapeHtml(String(c.label))).join('</th><th>');
      const dataRows = rows
        .map((row) => {
          const cells = cols
            .map((c) => {
              const val = row[c.key];
              const str = val === null || val === undefined ? '' : String(val);
              return `<td>${escapeHtml(str)}</td>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');

      return `
        <h2 style="font-size:14px;margin:16px 0 8px;">${escapeHtml(name)}</h2>
        <table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:11px;font-family:system-ui,sans-serif;margin-bottom:16px;">
          <thead>
            <tr style="background-color:#f0f0f0;font-weight:600;">
              <th>${headerRow}</th>
            </tr>
          </thead>
          <tbody>
            ${dataRows}
          </tbody>
        </table>
      `;
    })
    .filter(Boolean)
    .join('\n');

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(filename)}</title>
    <style>
      table { border-collapse: collapse; }
      th, td { border: 1px solid #ccc; padding: 4px 6px; }
      th { background-color: #f0f0f0; }
    </style>
  </head>
  <body>
    <h1 style="font-size:18px;margin-bottom:12px;">${escapeHtml(filename)}</h1>
    ${sections}
  </body>
</html>`;

  triggerDownload(html, filename, 'application/vnd.ms-excel', 'xls');
}

// ─── Dashboard Summary Report ──────────────────────────────────────────────────

/**
 * Fetches all dashboard data via existing API client functions and generates
 * a comprehensive report with sections for KPI summary, inventory health,
 * cost analysis, logistics status, sales trends, supplier performance, and
 * risk alerts. Outputs as an Excel-compatible (.xls) file.
 */
export async function exportDashboardReport(): Promise<void> {
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `供应链仪表盘报告_${timestamp}`;

  try {
    const [
      dashboardRes,
      inventoryRes,
      costRes,
      logisticsRes,
      salesRes,
      suppliersRes,
      riskRes,
      perfRes,
    ] = await Promise.allSettled([
      fetchDashboard('30'),
      fetchInventory('list', { page: '1', pageSize: '500' }),
      fetchCost('list', { page: '1', pageSize: '500' }),
      fetchLogistics('list', { page: '1', pageSize: '500' }),
      fetchSales('list', { page: '1', pageSize: '500' }),
      fetchSuppliers(),
      fetchRisk('list', { page: '1', pageSize: '500' }),
      fetchPerformanceMetrics(),
    ]);

    const sheets: Record<string, { rows: Record<string, unknown>[]; columns?: ExportColumn[] }> = {};

    // ── KPI Summary ──────────────────────────────────────────────────────────
    const kpiRows = extractRows(dashboardRes, 'kpi', 'metrics');
    sheets['KPI摘要'] = {
      rows: kpiRows.length > 0 ? kpiRows : [{ 指标: '暂无数据', 值: '-' }],
      columns: kpiRows.length > 0 ? undefined : undefined,
    };

    // ── Inventory Health ─────────────────────────────────────────────────────
    const inventoryRows = extractRows(inventoryRes, 'inventory', 'data');
    const usedInventoryRows = inventoryRows.length > 0 ? inventoryRows : [];
    sheets['库存健康'] = {
      rows: usedInventoryRows.length > 0
        ? usedInventoryRows.map((r: Record<string, unknown>) => ({
            SKU: r.sku ?? '',
            产品名称: r.productName ?? '',
            仓库: r.warehouse ?? '',
            当前数量: r.quantity ?? 0,
            安全库存: r.safetyStock ?? 0,
            在途数量: r.inTransit ?? 0,
            周转天数: r.turnoverDays ?? 0,
            库存状态: r.stockStatus ?? '',
          }))
        : [{ 提示: '暂无库存数据' }],
    };

    // ── Cost Analysis ────────────────────────────────────────────────────────
    const costRows = extractRows(costRes, 'costs', 'data');
    sheets['成本分析'] = {
      rows: costRows.length > 0
        ? costRows.map((r: Record<string, unknown>) => ({
            SKU: r.sku ?? '',
            产品名称: r.productName ?? '',
            原材料: r.rawMaterial ?? 0,
            人工: r.labor ?? 0,
            物流: r.logistics ?? 0,
            关税: r.tariff ?? 0,
            总到岸成本: r.totalLanded ?? 0,
            毛利率: r.grossMargin ?? 0,
          }))
        : [{ 提示: '暂无成本数据' }],
    };

    // ── Logistics Status ─────────────────────────────────────────────────────
    const logisticsRows = extractRows(logisticsRes, 'shipments', 'data');
    sheets['物流状态'] = {
      rows: logisticsRows.length > 0
        ? logisticsRows.map((r: Record<string, unknown>) => ({
            追踪号: r.trackingNumber ?? '',
            SKU: r.sku ?? '',
            承运商: r.carrier ?? '',
            状态: r.status ?? '',
            预计到达: r.eta ?? '',
            延误天数: r.delayDays ?? 0,
          }))
        : [{ 提示: '暂无物流数据' }],
    };

    // ── Sales Trends ─────────────────────────────────────────────────────────
    const salesRows = extractRows(salesRes, 'sales', 'data');
    sheets['销售趋势'] = {
      rows: salesRows.length > 0
        ? salesRows.map((r: Record<string, unknown>) => ({
            SKU: r.sku ?? '',
            产品名称: r.productName ?? '',
            日期: r.date ?? '',
            数量: r.quantity ?? 0,
            收入: r.revenue ?? 0,
            平台: r.platform ?? '',
          }))
        : [{ 提示: '暂无销售数据' }],
    };

    // ── Supplier Performance ──────────────────────────────────────────────────
    const supplierRows = extractRows(suppliersRes, 'suppliers', 'data');
    sheets['供应商绩效'] = {
      rows: supplierRows.length > 0
        ? supplierRows.map((r: Record<string, unknown>) => ({
            编码: r.code ?? '',
            名称: r.name ?? '',
            区域: r.region ?? '',
            品类: r.category ?? '',
            交货天数: r.leadTime ?? 0,
            评分: r.rating ?? 0,
            状态: r.status ?? '',
          }))
        : [{ 提示: '暂无供应商数据' }],
    };

    // ── Risk Alerts ──────────────────────────────────────────────────────────
    const riskRows = extractRows(riskRes, 'risks', 'data');
    sheets['风险预警'] = {
      rows: riskRows.length > 0
        ? riskRows.map((r: Record<string, unknown>) => ({
            SKU: r.sku ?? '',
            风险类型: r.riskType ?? '',
            风险等级: r.riskLevel ?? '',
            描述: r.description ?? '',
            状态: r.status ?? '',
            创建时间: r.createdAt ?? '',
          }))
        : [{ 提示: '暂无风险数据' }],
    };

    // ── Performance Metrics ──────────────────────────────────────────────────
    const perfRows = extractRows(perfRes, undefined, undefined);
    if (perfRows.length > 0) {
      sheets['绩效指标'] = { rows: perfRows };
    }

    exportToExcel(sheets, filename);
  } catch (err) {
    console.error('[exportDashboardReport] Failed to generate report:', err);
    // Fallback: try to export whatever we can
    throw err;
  }
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Safely extract rows from a Promise.allSettled result.
 * Tries common response shapes: { data: { key: [...] } }, { key: [...] }, or direct array.
 */
function extractRows(
  settled: PromiseSettledResult<unknown>,
  ...priorityKeys: (string | undefined)[]
): Record<string, unknown>[] {
  if (settled.status === 'rejected') return [];

  const data = settled.value as Record<string, unknown>;

  // Try priority keys first (nested paths)
  for (const key of priorityKeys) {
    if (!key) continue;
    const val = data?.[key];
    if (Array.isArray(val)) return val;
    // Check nested: data.data.key
    const nested = (data as Record<string, unknown>)?.['data'] as Record<string, unknown> | undefined;
    if (nested) {
      const nestedVal = nested[key];
      if (Array.isArray(nestedVal)) return nestedVal;
    }
  }

  // Try common root-level keys
  for (const key of ['data', 'result', 'records', 'items', 'list', 'rows']) {
    const val = data?.[key];
    if (Array.isArray(val)) return val;
  }

  // If the data itself is an array
  if (Array.isArray(data)) return data;

  // Convert object to single-row representation
  if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data).filter((k) => !Array.isArray(data[k]));
    if (keys.length > 0 && keys.length < 20) {
      const row: Record<string, unknown> = {};
      for (const k of keys) {
        const v = data[k];
        row[k] = typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
      }
      return [row];
    }
  }

  return [];
}

/**
 * Trigger a browser download for a file with the given content.
 */
function triggerDownload(
  content: string,
  baseFilename: string,
  mimeType: string,
  extension: string,
): void {
  const BOM = '﻿';
  const blob = new Blob([BOM + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${baseFilename}_${new Date().toISOString().slice(0, 10)}.${extension}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Escape HTML special characters for safe embedding.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
