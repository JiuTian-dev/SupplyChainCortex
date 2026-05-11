/**
 * Suppliers Service - Business logic for supplier operations
 * Extracted from API routes for reusability and testability
 */

import { db } from '@/lib/db';
import { serverCache } from '@/lib/cache';

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Valid supplier statuses */
export const SUPPLIER_STATUSES = ['active', 'suspended', 'inactive'] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

/** Valid supplier categories */
export const SUPPLIER_CATEGORIES = [
  '塑料/五金件',
  '电子元器件',
  '成品代工',
  '包装材料',
  '物流运输',
  '清关服务',
] as const;

/** Supplier list filters */
export interface SupplierListFilters {
  region?: string;
  category?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

/** Paginated result */
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/** Supplier with parsed rating details */
export interface SupplierWithDetails {
  id: string;
  code: string;
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  region: string;
  category: string;
  leadTime: number;
  rating: number;
  ratingDetails: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Supplier creation data */
export interface CreateSupplierData {
  code: string;
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  region: string;
  category: string;
  leadTime?: number;
  rating?: number;
}

/** Supplier rating data with sub-scores */
export interface SupplierRatingData {
  id: string;
  rating?: number;
  deliveryScore?: number;
  qualityScore?: number;
  priceScore?: number;
  communicationScore?: number;
  comments?: string;
  status?: SupplierStatus;
  name?: string;
  contact?: string;
  email?: string;
  phone?: string;
  region?: string;
  category?: string;
  leadTime?: number;
}

/** Supplier performance metrics */
export interface SupplierPerformanceMetrics {
  onTimeDeliveryRate: number | null;
  qualityScore: number;
  leadTimeConsistency: number;
  costCompetitiveness: number;
  fulfillmentRate: number | null;
}

/** Supplier risk flag */
export interface SupplierRiskFlag {
  type: string;
  description: string;
  severity: string;
}

/** Supplier performance item */
export interface SupplierPerformanceItem {
  code: string;
  name: string;
  region: string;
  category: string;
  leadTime: number;
  rating: number;
  ratingDetails: unknown;
  metrics: SupplierPerformanceMetrics;
  healthIndex: number;
  riskFlags: SupplierRiskFlag[];
  shipmentDataAvailable: boolean;
  orderDataAvailable: boolean;
}

/** Supplier performance result */
export interface SupplierPerformanceResult {
  suppliers: SupplierPerformanceItem[];
  overallHealth: {
    avgHealthIndex: number;
    totalSuppliers: number;
    activeSuppliers: number;
  };
  riskSummary: {
    highRiskCount: number;
    mediumRiskCount: number;
    singleSourceCategories: string[];
    geographicConcentration: string[];
  };
  categoryDistribution: Record<string, number>;
  regionDistribution: Record<string, number>;
  generatedAt: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Paginate an array of items */
export function paginate<T>(items: T[], page: number, pageSize: number): PaginatedResult<T> {
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const data = items.slice(start, start + pageSize);
  return { data, pagination: { page, pageSize, total, totalPages } };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dynamic Supplier Scoring — live data replaces static seed ratings
// ═══════════════════════════════════════════════════════════════════════════════

interface DynamicScore {
  deliveryScore: number;  // 0-100 based on actual delays
  qualityScore: number;   // 0-100 based on defects + CPSC recalls
  priceScore: number;     // 0-100 based on cost trends
  riskScore: number;      // 0-100 based on region (port congestion, weather)
  overall: number;        // 0-5 weighted average
  breakdown: string;
}

export async function computeDynamicSupplierScore(supplierId: string): Promise<DynamicScore | null> {
  const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) return null;

  // ── Delivery Score (0-100): based on actual shipment delays ──────────────
  const shipments = await db.shipmentItem.findMany({
    where: {
      status: 'delivered',
      updatedAt: { gte: new Date(Date.now() - 90 * 86400000) },
    },
    take: 200,
  });

  const regionShipments = shipments.filter(s => {
    // Match supplier region to shipment origin
    const sOrigin = (s as any).origin || '';
    const sRegion = supplier.region;
    return sOrigin.includes(sRegion) || sRegion.includes(sOrigin.slice(0, 2));
  });

  const totalDeliveries = regionShipments.length || 1;
  const delayedDeliveries = regionShipments.filter(s => s.delayDays > 0).length;
  const avgDelayDays = regionShipments.length > 0
    ? regionShipments.reduce((s, sh) => s + sh.delayDays, 0) / regionShipments.length
    : supplier.leadTime * 0.3;

  const deliveryScore = Math.max(0, Math.min(100,
    100 - (delayedDeliveries / totalDeliveries) * 50 - avgDelayDays * 5
  ));

  // ── Quality Score (0-100): based on defects + recalls ───────────────────
  const [defects, cpscRecalls] = await Promise.all([
    db.defectRecord.count({ where: { createdAt: { gte: new Date(Date.now() - 90 * 86400000) } } }),
    db.regulationChange.count({
      where: {
        source: 'CCPIT/CPSC',
        createdAt: { gte: new Date(Date.now() - 90 * 86400000) },
      },
    }),
  ]);

  const qualityScore = Math.max(0, Math.min(100,
    100 - defects * 3 - cpscRecalls * 8
  ));

  // ── Price Score (0-100): based on cost trends vs benchmark ──────────────
  const costRecords = await db.costRecord.findMany({
    where: { updatedAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    take: 100,
  });
  const avgMargin = costRecords.length > 0
    ? costRecords.reduce((s, c) => s + c.grossMargin, 0) / costRecords.length
    : 48;
  const priceScore = Math.max(0, Math.min(100, avgMargin * 2)); // 50% margin → 100

  // ── Risk Score (0-100): based on region + port congestion ───────────────
  let regionRisk = 50; // baseline
  try {
    const { getPortCongestion } = await import('@/lib/sources/port-congestion');
    const congestion = await getPortCongestion();
    const supplierRegion = supplier.region;
    const regionPorts = congestion.ports.filter(p =>
      supplierRegion.includes(p.country) || p.country.includes(supplierRegion)
    );
    if (regionPorts.length > 0) {
      const worstLevel = Math.max(...regionPorts.map(p =>
        p.congestionLevel === 'severe' ? 100 : p.congestionLevel === 'high' ? 75 : p.congestionLevel === 'moderate' ? 50 : 25
      ));
      regionRisk = worstLevel;
    }
  } catch { /* use baseline */ }

  const riskScore = Math.max(0, Math.min(100, 100 - regionRisk));

  // ── Overall (0-5) ───────────────────────────────────────────────────────
  const overall = Math.round(
    (deliveryScore * 0.35 + qualityScore * 0.25 + priceScore * 0.20 + riskScore * 0.20) / 20 * 10
  ) / 10;

  const breakdown = `交付${deliveryScore.toFixed(0)} | 质量${qualityScore.toFixed(0)} | 价格${priceScore.toFixed(0)} | 区域${riskScore.toFixed(0)}`;

  return { deliveryScore, qualityScore, priceScore, riskScore, overall, breakdown };
}

export async function refreshAllSupplierScores(): Promise<number> {
  const suppliers = await db.supplier.findMany({ where: { status: 'active' } });
  let updated = 0;

  for (const supplier of suppliers) {
    try {
      const scores = await computeDynamicSupplierScore(supplier.id);
      if (!scores) continue;

      await db.supplier.update({
        where: { id: supplier.id },
        data: {
          rating: scores.overall,
          ratingDetails: {
            deliveryScore: scores.deliveryScore,
            qualityScore: scores.qualityScore,
            priceScore: scores.priceScore,
            riskScore: scores.riskScore,
            breakdown: scores.breakdown,
            computedAt: new Date().toISOString(),
            computedBy: 'dynamic-scoring-engine',
          },
        },
      });
      updated++;
    } catch { continue; }
  }
  return updated;
}

// ═══════════════════════════════════════════════════════════════════════════════

/** Parse ratingDetails (handles both Json object and string types) */
export function parseRatingDetails(ratingDetails: unknown): unknown {
  if (!ratingDetails) return null;
  if (typeof ratingDetails === 'object') return ratingDetails;
  if (typeof ratingDetails === 'string') {
    try {
      return JSON.parse(ratingDetails);
    } catch {
      return null;
    }
  }
  return null;
}

/** Format supplier with parsed ratingDetails */
export function formatSupplierWithDetails(supplier: {
  id: string;
  code: string;
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  region: string;
  category: string;
  leadTime: number;
  rating: number;
  ratingDetails: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): SupplierWithDetails {
  return {
    ...supplier,
    ratingDetails: parseRatingDetails(supplier.ratingDetails),
  };
}

// ─── Core Business Logic ───────────────────────────────────────────────────────

/** Get filtered/paginated suppliers list */
export async function getSuppliersList(filters: SupplierListFilters = {}): Promise<PaginatedResult<SupplierWithDetails>> {
  const { region, category, status, page = 1, pageSize = 20 } = filters;

  const where: Record<string, unknown> = {};
  if (region) where.region = region;
  if (category) where.category = category;
  if (status) where.status = status;

  const allSuppliers = await db.supplier.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  const paginated = paginate(allSuppliers, page, pageSize);
  const suppliersWithDetails = paginated.data.map(s => formatSupplierWithDetails(s));

  return {
    data: suppliersWithDetails,
    pagination: paginated.pagination,
  };
}

/** Get a single supplier by code */
export async function getSupplierByCode(code: string): Promise<{
  supplier: SupplierWithDetails;
  orderHistory: Awaited<ReturnType<typeof db.reorderOrder.findMany>>;
} | null> {
  const supplier = await db.supplier.findUnique({
    where: { code },
  });

  if (!supplier) return null;

  // Get related reorder orders as order history
  const orderHistory = await db.reorderOrder.findMany({
    where: { sku: { startsWith: supplier.category.substring(0, 2) } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return {
    supplier: formatSupplierWithDetails(supplier),
    orderHistory,
  };
}

/** Rate a supplier with sub-scores */
export async function rateSupplier(ratingData: SupplierRatingData): Promise<SupplierWithDetails> {
  const { id, deliveryScore, qualityScore, priceScore, communicationScore, comments, ...otherFields } = ratingData;

  const existing = await db.supplier.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('未找到该供应商');
  }

  // Validate sub-scores (0-10 range)
  const subScoreFields = { deliveryScore, qualityScore, priceScore, communicationScore };
  for (const [fieldName, fieldValue] of Object.entries(subScoreFields)) {
    if (fieldValue !== undefined) {
      const val = Number(fieldValue);
      if (isNaN(val) || val < 0 || val > 10) {
        throw new Error(`${fieldName} 必须为 0-10 之间的数值`);
      }
    }
  }

  // Build update data from allowed fields
  const allowedFields = ['name', 'contact', 'email', 'phone', 'region', 'category', 'leadTime', 'rating', 'status'];
  const updateData: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if ((otherFields as Record<string, unknown>)[field] !== undefined) {
      updateData[field] = (otherFields as Record<string, unknown>)[field];
    }
  }

  // Validate status if provided
  if (updateData.status && !SUPPLIER_STATUSES.includes(updateData.status as SupplierStatus)) {
    throw new Error(`无效的 status 值，允许: ${SUPPLIER_STATUSES.join(', ')}`);
  }

  // Validate rating if provided
  if (updateData.rating !== undefined) {
    const ratingVal = Number(updateData.rating);
    if (isNaN(ratingVal) || ratingVal < 0 || ratingVal > 5) {
      throw new Error('rating 必须为 0-5 之间的数值');
    }
  }

  // Handle sub-scores: store as JSON in ratingDetails field
  if (deliveryScore !== undefined || qualityScore !== undefined ||
      priceScore !== undefined || communicationScore !== undefined ||
      comments !== undefined) {
    // Merge with existing ratingDetails or create new
    let existingDetails: Record<string, unknown> = {};
    try {
      if (existing.ratingDetails) {
        if (typeof existing.ratingDetails === 'string') {
          existingDetails = JSON.parse(existing.ratingDetails);
        } else if (typeof existing.ratingDetails === 'object') {
          existingDetails = existing.ratingDetails as Record<string, unknown>;
        }
      }
    } catch {
      // ignore parse errors, start fresh
    }

    const ratingDetailsObj: Record<string, unknown> = { ...existingDetails };
    if (deliveryScore !== undefined) ratingDetailsObj.deliveryScore = Number(deliveryScore);
    if (qualityScore !== undefined) ratingDetailsObj.qualityScore = Number(qualityScore);
    if (priceScore !== undefined) ratingDetailsObj.priceScore = Number(priceScore);
    if (communicationScore !== undefined) ratingDetailsObj.communicationScore = Number(communicationScore);
    if (comments !== undefined) ratingDetailsObj.comments = String(comments);
    ratingDetailsObj.ratedAt = new Date().toISOString();

    updateData.ratingDetails = ratingDetailsObj;
  }

  const supplier = await db.supplier.update({
    where: { id },
    data: updateData,
  });

  // Invalidate suppliers cache after rating
  serverCache.invalidate('suppliers');

  return formatSupplierWithDetails(supplier);
}

/** Get performance analytics for all active suppliers */
export async function getSupplierPerformance(): Promise<SupplierPerformanceResult> {
  const [suppliers, shipments, costRecords, reorderOrders, inventory] = await Promise.all([
    db.supplier.findMany({ where: { status: 'active' } }),
    db.shipmentItem.findMany(),
    db.costRecord.findMany(),
    db.reorderOrder.findMany(),
    db.inventory.findMany(),
  ]);

  // Compute per-supplier metrics
  const supplierMetrics: SupplierPerformanceItem[] = suppliers.map(supplier => {
    // On-time delivery rate: based on shipments related to supplier's category region
    const relatedShipments = shipments.filter(s => {
      if (supplier.category === '物流运输') return s.carrier.includes('顺达') || s.carrier.includes('物流');
      if (supplier.category === '清关服务') return s.status === 'customs';
      if (supplier.region === '华南') return s.origin.includes('深圳') || s.origin.includes('东莞') || s.origin.includes('佛山');
      if (supplier.region === '华东') return s.origin.includes('上海') || s.origin.includes('义乌') || s.origin.includes('宁波');
      return false;
    });

    const onTimeDeliveries = relatedShipments.filter(s => s.delayDays === 0).length;
    const totalDeliveries = relatedShipments.length;
    const onTimeRate = totalDeliveries > 0
      ? Math.round((onTimeDeliveries / totalDeliveries) * 100)
      : null;

    // Quality score: based on supplier rating (0-5 scale, convert to 0-100)
    const qualityScore = Math.round(supplier.rating * 20);

    // Lead time consistency: based on shipment delay variance
    const delays = relatedShipments.map(s => s.delayDays);
    const avgDelay = delays.length > 0
      ? delays.reduce((a, b) => a + b, 0) / delays.length
      : 0;
    const delayVariance = delays.length > 1
      ? delays.reduce((sum, d) => sum + Math.pow(d - avgDelay, 2), 0) / delays.length
      : 0;
    const leadTimeConsistency = delayVariance < 1 ? 95 : delayVariance < 4 ? 80 : delayVariance < 9 ? 65 : 50;

    // Cost competitiveness: based on avg landed cost vs overall avg for similar categories
    const relatedCosts = costRecords.filter(c => {
      if (supplier.category === '塑料/五金件' || supplier.category === '电子元器件') return true;
      return false;
    });
    const avgLandedCost = relatedCosts.length > 0
      ? relatedCosts.reduce((sum, c) => sum + c.totalLanded, 0) / relatedCosts.length
      : 0;
    const overallAvgCost = costRecords.length > 0
      ? costRecords.reduce((sum, c) => sum + c.totalLanded, 0) / costRecords.length
      : 0;
    const costCompetitiveness = overallAvgCost > 0
      ? Math.round(Math.min(100, (overallAvgCost / Math.max(avgLandedCost, 0.01)) * 80))
      : 70;

    // Reorder fulfillment rate
    const relatedOrders = reorderOrders.filter(o => {
      if (supplier.category === '成品代工') return o.priority === '常规' || o.priority === '紧急';
      return o.sku.startsWith(supplier.category.substring(0, 2));
    });
    const fulfilledOrders = relatedOrders.filter(o => o.status === 'delivered' || o.status === 'shipped').length;
    const fulfillmentRate = relatedOrders.length > 0
      ? Math.round((fulfilledOrders / relatedOrders.length) * 100)
      : null;

    // Risk flags
    const riskFlags: SupplierRiskFlag[] = [];

    // Single source risk
    const sameCategorySuppliers = suppliers.filter(s => s.category === supplier.category);
    if (sameCategorySuppliers.length === 1) {
      riskFlags.push({
        type: '单一来源',
        description: `${supplier.category} 品类仅有此一家供应商，存在供应中断风险`,
        severity: 'high',
      });
    } else if (sameCategorySuppliers.length === 2) {
      riskFlags.push({
        type: '来源集中',
        description: `${supplier.category} 品类仅有 ${sameCategorySuppliers.length} 家供应商`,
        severity: 'medium',
      });
    }

    // Geographic concentration
    const sameRegionSuppliers = suppliers.filter(s => s.region === supplier.region);
    if (sameRegionSuppliers.length === suppliers.length) {
      riskFlags.push({
        type: '地理集中',
        description: `所有供应商集中在${supplier.region}地区，存在区域性风险`,
        severity: 'high',
      });
    }

    // High lead time risk
    if (supplier.leadTime > 20) {
      riskFlags.push({
        type: '交期过长',
        description: `平均交货期 ${supplier.leadTime} 天，超过 20 天阈值`,
        severity: 'medium',
      });
    }

    // Low rating risk
    if (supplier.rating < 3.5) {
      riskFlags.push({
        type: '评分偏低',
        description: `供应商评分 ${supplier.rating}/5，低于 3.5 阈值`,
        severity: 'medium',
      });
    }

    // Overall health index: weighted average
    const metrics: number[] = [];
    const weights: number[] = [];

    if (onTimeRate !== null) { metrics.push(onTimeRate); weights.push(0.3); }
    metrics.push(qualityScore); weights.push(0.25);
    metrics.push(leadTimeConsistency); weights.push(0.2);
    metrics.push(costCompetitiveness); weights.push(0.15);
    if (fulfillmentRate !== null) { metrics.push(fulfillmentRate); weights.push(0.1); }

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const healthIndex = Math.round(
      metrics.reduce((sum, m, i) => sum + m * (weights[i] / totalWeight), 0)
    );

    return {
      code: supplier.code,
      name: supplier.name,
      region: supplier.region,
      category: supplier.category,
      leadTime: supplier.leadTime,
      rating: supplier.rating,
      ratingDetails: parseRatingDetails(supplier.ratingDetails),
      metrics: {
        onTimeDeliveryRate: onTimeRate,
        qualityScore,
        leadTimeConsistency,
        costCompetitiveness,
        fulfillmentRate,
      },
      healthIndex,
      riskFlags,
      shipmentDataAvailable: relatedShipments.length > 0,
      orderDataAvailable: relatedOrders.length > 0,
    };
  });

  // Overall supplier health
  const avgHealthIndex = supplierMetrics.length > 0
    ? Math.round(supplierMetrics.reduce((sum, s) => sum + s.healthIndex, 0) / supplierMetrics.length)
    : 0;

  // Aggregate risk analysis
  const allRiskFlags = supplierMetrics.flatMap(s => s.riskFlags);
  const riskSummary = {
    highRiskCount: allRiskFlags.filter(r => r.severity === 'high').length,
    mediumRiskCount: allRiskFlags.filter(r => r.severity === 'medium').length,
    singleSourceCategories: [...new Set(allRiskFlags.filter(r => r.type === '单一来源').map(r => r.description))],
    geographicConcentration: [...new Set(allRiskFlags.filter(r => r.type === '地理集中').map(r => r.description))],
  };

  // Category distribution
  const categoryDistribution: Record<string, number> = {};
  suppliers.forEach(s => {
    categoryDistribution[s.category] = (categoryDistribution[s.category] || 0) + 1;
  });

  // Region distribution
  const regionDistribution: Record<string, number> = {};
  suppliers.forEach(s => {
    regionDistribution[s.region] = (regionDistribution[s.region] || 0) + 1;
  });

  // Sort by health index ascending (worst first for attention)
  const sortedMetrics = [...supplierMetrics].sort((a, b) => a.healthIndex - b.healthIndex);

  return {
    suppliers: sortedMetrics,
    overallHealth: {
      avgHealthIndex,
      totalSuppliers: suppliers.length,
      activeSuppliers: suppliers.filter(s => s.status === 'active').length,
    },
    riskSummary,
    categoryDistribution,
    regionDistribution,
    generatedAt: new Date().toISOString(),
  };
}

/** Create a new supplier */
export async function createSupplier(data: CreateSupplierData): Promise<{
  id: string;
  code: string;
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  region: string;
  category: string;
  leadTime: number;
  rating: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}> {
  // Check if code already exists
  const existing = await db.supplier.findUnique({ where: { code: data.code } });
  if (existing) {
    throw new Error(`供应商编码已存在: ${data.code}`);
  }

  const supplier = await db.supplier.create({
    data: {
      code: data.code,
      name: data.name,
      contact: data.contact || null,
      email: data.email || null,
      phone: data.phone || null,
      region: data.region,
      category: data.category,
      leadTime: data.leadTime ?? 14,
      rating: data.rating ?? 0,
      status: 'active',
    },
  });

  // Invalidate suppliers cache after creation
  serverCache.invalidate('suppliers');

  return supplier;
}
