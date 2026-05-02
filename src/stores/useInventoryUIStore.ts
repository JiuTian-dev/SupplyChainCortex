import { create } from 'zustand';

// ==================== Inventory UI Store ====================
// Extracted from ui-store.ts — inventory/SKU/stock related state

interface InventoryUIState {
  inventoryFilter: string;
  selectedProduct: string;
  selectedInventorySku: string;
  inventoryDetail: unknown | null;
  reorderQty: number;
  reorderWarehouse: string;
  reorderPriority: string;
  reorderStatusFilter: string;
  drillDownCategory: string | null;
  highlightElement: string;
}

interface InventoryUIActions {
  setInventoryFilter: (f: string) => void;
  setSelectedProduct: (p: string) => void;
  setSelectedInventorySku: (sku: string) => void;
  setInventoryDetail: (detail: unknown | null) => void;
  setReorderQty: (qty: number) => void;
  setReorderWarehouse: (warehouse: string) => void;
  setReorderPriority: (priority: string) => void;
  setReorderStatusFilter: (f: string) => void;
  setDrillDownCategory: (category: string | null) => void;
  setHighlightElement: (el: string) => void;
}

export const useInventoryUIStore = create<InventoryUIState & InventoryUIActions>((set) => ({
  inventoryFilter: 'all',
  selectedProduct: '',
  selectedInventorySku: '',
  inventoryDetail: null,
  reorderQty: 0,
  reorderWarehouse: '深圳仓',
  reorderPriority: '常规',
  reorderStatusFilter: 'all',
  drillDownCategory: null,
  highlightElement: '',

  setInventoryFilter: (f) => set({ inventoryFilter: f }),
  setSelectedProduct: (p) => set({ selectedProduct: p }),
  setSelectedInventorySku: (sku) => set({ selectedInventorySku: sku }),
  setInventoryDetail: (detail) => set({ inventoryDetail: detail }),
  setReorderQty: (qty) => set({ reorderQty: qty }),
  setReorderWarehouse: (warehouse) => set({ reorderWarehouse: warehouse }),
  setReorderPriority: (priority) => set({ reorderPriority: priority }),
  setReorderStatusFilter: (f) => set({ reorderStatusFilter: f }),
  setDrillDownCategory: (category) => set({ drillDownCategory: category }),
  setHighlightElement: (el) => set({ highlightElement: el }),
}));
