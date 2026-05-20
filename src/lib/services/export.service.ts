/**
 * Export Service - Business logic for data export operations
 * Extracted from API routes for reusability and testability
 *
 * Data queries return plain arrays of records.
 * CSV/JSON formatting and file download headers remain in the route handler.
 */

import { db } from '@/lib/db';

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Valid export modules */
export const EXPORT_MODULES = ['inventory', 'cost', 'logistics', 'sales', 'all'] as const;
export type ExportModule = (typeof EXPORT_MODULES)[number];

/** Valid report types */
export const REPORT_TYPES = [
  'inventory_report',
  'cost_report',
  'sales_report',
  'logistics_report',
  'supplier_report',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** Valid export formats */
export const EXPORT_FORMATS = ['csv', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Module display names for section headers */
export const MODULE_NAMES: Record<string, string> = {
  inventory: '库存数据',
  cost: '成本数据',
  logistics: '物流数据',
  sales: '销售数据',
};

// ─── CSV Utilities ─────────────────────────────────────────────────────────────

/** Escape a single CSV field (handles commas, quotes, newlines) */
export function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/** Convert an array of records to a CSV string */
export function convertToCsv(records: Record<string, unknown>[]): string {
  if (records.length === 0) return '';

  const headers = Object.keys(records[0]);
  const lines: string[] = [];

  // Header row
  lines.push(headers.map(escapeCsvField).join(','));

  // Data rows
  for (const record of records) {
    const row = headers.map((h) => escapeCsvField(String(record[h] ?? '')));
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

// ─── Data Query Functions ──────────────────────────────────────────────────────

/** Export inventory data with computed fields */
export async function exportInventoryData(
  startDate?: string,
  endDate?: string
): Promise<Record<string, unknown>[]> {
  const where: Record<string, unknown> = {};
  if (startDate || endDate) {
    const dateFilter: Record<string, string> = {};
    if (startDate) dateFilter.gte = startDate;
    if (endDate) dateFilter.lte = endDate;
    where.lastSyncAt = dateFilter;
  }

  const records = await db.inventory.findMany({
    where,
    include: { product: true },
  });

  const salesRecords = await db.salesRecord.findMany();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return records.map((r) => {
    // Compute stock status label
    const stockStatusLabel =
      r.stockStatus === 'healthy' ? '健康' :
      r.stockStatus === 'warning' ? '预警' :
      r.stockStatus === 'critical' ? '紧急' :
      r.stockStatus === 'overstock' ? '过剩' : r.stockStatus;

    // Compute days of supply based on recent sales velocity
    const recentSales = salesRecords.filter(
      (s) => s.sku === r.sku && s.date >= thirtyDaysAgo
    );
    const dailyVelocity =
      recentSales.length > 0
        ? recentSales.reduce((sum, s) => sum + s.quantity, 0) / 30
        : 0;
    const daysOfSupply =
      dailyVelocity > 0 ? Math.round(r.quantity / dailyVelocity) : 999;

    return {
      SKU: r.sku,
      产品名称: r.productName,
      仓库: r.warehouse,
      当前数量: r.quantity,
      安全库存: r.safetyStock,
      补货点: r.reorderPoint,
      在途数量: r.inTransit,
      周转率: r.turnoverRate,
      周转天数: r.turnoverDays,
      库存状态: r.stockStatus,
      库存状态标签: stockStatusLabel,
      供货天数: daysOfSupply < 999 ? daysOfSupply : 'N/A',
      ABC分类: r.product?.abcClass || '',
      FSN分类: r.product?.fsnClass || '',
      品类: r.product?.category || '',
      子品类: r.product?.subCategory || '',
      最后同步: r.lastSyncAt.toISOString(),
    };
  });
}

/** Export cost data with computed margin and composition percentages */
export async function exportCostData(
  _startDate?: string,
  _endDate?: string
): Promise<Record<string, unknown>[]> {
  const records = await db.costRecord.findMany({
    include: { product: true },
  });

  return records.map((r) => {
    const totalLanded = r.totalLanded;
    // Compute margin calculation details
    const marginAmount = r.sellingPrice - totalLanded;
    const marginPercent =
      r.sellingPrice > 0
        ? Math.round((marginAmount / r.sellingPrice) * 100 * 10) / 10
        : 0;
    // Cost composition percentages
    const rawMaterialPct =
      totalLanded > 0
        ? Math.round((r.rawMaterial / totalLanded) * 1000) / 10
        : 0;
    const laborPct =
      totalLanded > 0
        ? Math.round((r.labor / totalLanded) * 1000) / 10
        : 0;
    const logisticsPct =
      totalLanded > 0
        ? Math.round((r.logistics / totalLanded) * 1000) / 10
        : 0;
    const tariffPct =
      totalLanded > 0
        ? Math.round((r.tariff / totalLanded) * 1000) / 10
        : 0;
    const platformFeePct =
      totalLanded > 0
        ? Math.round((r.platformFee / totalLanded) * 1000) / 10
        : 0;

    return {
      SKU: r.sku,
      产品名称: r.productName,
      原材料: r.rawMaterial,
      原材料占比: rawMaterialPct + '%',
      人工: r.labor,
      人工占比: laborPct + '%',
      物流: r.logistics,
      物流占比: logisticsPct + '%',
      关税: r.tariff,
      关税占比: tariffPct + '%',
      平台费: r.platformFee,
      平台费占比: platformFeePct + '%',
      汇率: r.exchangeRate,
      目的地: r.destination,
      总到岸成本: Math.round(totalLanded * 100) / 100,
      售价: r.sellingPrice,
      毛利额: Math.round(marginAmount * 100) / 100,
      毛利率: r.grossMargin + '%',
      毛利率计算: marginPercent + '%',
      品类: r.product?.category || '',
    };
  });
}

/** Export logistics data with status and risk labels */
export async function exportLogisticsData(
  startDate?: string,
  endDate?: string
): Promise<Record<string, unknown>[]> {
  const where: Record<string, unknown> = {};
  if (startDate || endDate) {
    const dateFilter: Record<string, string> = {};
    if (startDate) dateFilter.gte = startDate;
    if (endDate) dateFilter.lte = endDate;
    where.createdAt = dateFilter;
  }

  const records = await db.shipmentItem.findMany({ where });

  return records.map((r) => ({
    追踪号: r.trackingNumber,
    SKU: r.sku,
    产品名称: r.productName,
    始发地: r.origin,
    目的地: r.destination,
    承运商: r.carrier,
    状态: r.status,
    状态标签:
      r.status === 'pending' ? '待发货' :
      r.status === 'in_transit' ? '运输中' :
      r.status === 'customs' ? '清关中' :
      r.status === 'delivered' ? '已送达' :
      r.status === 'delayed' ? '延误' :
      r.status === 'exception' ? '异常' : r.status,
    预计到达: r.eta || '',
    实际到达: r.actualDelivery || '',
    延误天数: r.delayDays,
    风险等级: r.riskLevel,
    风险等级标签:
      r.riskLevel === 'low' ? '低' :
      r.riskLevel === 'medium' ? '中' :
      r.riskLevel === 'high' ? '高' :
      r.riskLevel === 'critical' ? '严重' : r.riskLevel,
    创建时间: r.createdAt.toISOString(),
  }));
}

/** Export sales data with computed unit price */
export async function exportSalesData(
  startDate?: string,
  endDate?: string
): Promise<Record<string, unknown>[]> {
  const where: Record<string, unknown> = {};
  if (startDate || endDate) {
    const dateFilter: Record<string, Date | string> = {};
    if (startDate) dateFilter.gte = startDate;
    if (endDate) dateFilter.lte = endDate;
    where.date = dateFilter;
  }

  const records = await db.salesRecord.findMany({
    where,
    include: { product: true },
  });

  return records.map((r) => ({
    SKU: r.sku,
    产品名称: r.productName,
    日期: r.date,
    数量: r.quantity,
    收入: Math.round(r.revenue * 100) / 100,
    平台: r.platform,
    品类: r.product?.category || '',
    子品类: r.product?.subCategory || '',
    ABC分类: r.product?.abcClass || '',
    单价:
      r.quantity > 0
        ? Math.round((r.revenue / r.quantity) * 100) / 100
        : 0,
  }));
}

/** Export supplier report data */
export async function exportSupplierData(): Promise<Record<string, unknown>[]> {
  const suppliers = await db.supplier.findMany();
  return suppliers.map((s) => ({
    代码: s.code,
    名称: s.name,
    区域: s.region,
    品类: s.category,
    交货天数: s.leadTime,
    评分: s.rating,
    状态: s.status,
    状态标签:
      s.status === 'active'
        ? '活跃'
        : s.status === 'suspended'
          ? '暂停'
          : '不活跃',
    联系人: s.contact || '',
    邮箱: s.email || '',
    电话: s.phone || '',
  }));
}
