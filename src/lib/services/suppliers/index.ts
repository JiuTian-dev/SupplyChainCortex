/**
 * Suppliers Service barrel — aggregates all suppliers service modules.
 * Re-export order matches the original suppliers.service.ts export order.
 */

// Types & constants
export { SUPPLIER_STATUSES, SUPPLIER_CATEGORIES } from './types';
export type {
  SupplierStatus,
  SupplierListFilters,
  PaginatedResult,
  SupplierWithDetails,
  CreateSupplierData,
  SupplierRatingData,
  SupplierPerformanceMetrics,
  SupplierRiskFlag,
  SupplierPerformanceItem,
  SupplierPerformanceResult,
} from './types';

// Functions (order matches original file)
export { paginate } from './queries';
export { computeDynamicSupplierScore, refreshAllSupplierScores } from './analytics';
export { parseRatingDetails } from './shared';
export { formatSupplierWithDetails, getSuppliersList, getSupplierByCode, rateSupplier } from './queries';
export { getSupplierPerformance } from './analytics';
export { createSupplier } from './queries';
