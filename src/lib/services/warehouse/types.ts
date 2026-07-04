/**
 * Warehouse Service - Type definitions and constants
 * Extracted from warehouse.service.ts for modularity.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WarehouseCapacityZone {
  zoneId: string;
  name: string;
  warehouse: string;
  type: 'fast' | 'normal' | 'bulk';
  capacity: number;
  used: number;
  utilization: number;
  productCount: number;
  status: 'critical' | 'warning' | 'healthy';
}

export interface WarehouseCapacityResult {
  capacity: Array<{
    warehouse: string;
    totalCapacity: number;
    totalUsed: number;
    overallUtilization: number;
    zones: WarehouseCapacityZone[];
    recommendations: string[];
  }>;
  timestamp: string;
}

export interface TransferData {
  fromZone: string;
  toZone: string;
  sku: string;
  quantity: number;
}

export interface TransferResult {
  success: boolean;
  transfer: {
    sku: string;
    productName: string;
    fromZone: string;
    toZone: string;
    quantity: number;
    fromBefore: number;
    fromAfter: number;
    toBefore: number;
    toAfter: number;
    type: 'full' | 'partial' | 'in-transit';
  };
  timestamp: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────
// Internal constants shared across query/operation modules (not re-exported from barrel).

export const MAX_TAKE = 5000;
export const DEFAULT_TREND_DAYS = 7;
