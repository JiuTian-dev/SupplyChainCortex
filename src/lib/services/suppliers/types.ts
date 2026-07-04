/**
 * Suppliers Service - Type definitions and constants
 * Extracted from suppliers.service.ts for modularity.
 */

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

// ═══════════════════════════════════════════════════════════════════════════════
// Dynamic Supplier Scoring — live data replaces static seed ratings
// ═══════════════════════════════════════════════════════════════════════════════

/** Internal: dynamic score breakdown (not re-exported from barrel) */
export interface DynamicScore {
  deliveryScore: number;  // 0-100 based on actual delays
  qualityScore: number;   // 0-100 based on defects + CPSC recalls
  priceScore: number;     // 0-100 based on cost trends
  riskScore: number;      // 0-100 based on region (port congestion, weather)
  overall: number;        // 0-5 weighted average
  breakdown: string;
}
