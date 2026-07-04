/**
 * Warehouse Service barrel — aggregates all warehouse service modules.
 * Re-export order matches the original warehouse.service.ts export order.
 */

// Types
export type {
  WarehouseCapacityZone,
  WarehouseCapacityResult,
  TransferData,
  TransferResult,
} from './types';

// Query functions (first group)
export {
  getWarehouseCapacity,
  getWarehouseAging,
  getWarehouseZones,
  getWarehouseTrend,
} from './queries';

// Operations
export { transferStock } from './operations';

// Query functions (second group)
export {
  getWarehouseOverview,
  getWarehouseStats,
  getTransferSuggestions,
} from './queries';
