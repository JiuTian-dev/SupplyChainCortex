/**
 * Global Filter Store — Power-BI-style cross-tab filtering.
 *
 * All dashboard tabs consume this store. When the user selects filters
 * in the FilterBar, every chart on every tab responds automatically.
 *
 * Persisted to localStorage and URL search params for shareable state.
 */

'use client';

import { create } from 'zustand';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface FilterState {
  /** Selected SKUs — empty array = all products */
  selectedSkus: string[];
  /** Selected warehouses — empty = all */
  selectedWarehouses: string[];
  /** Selected product categories — empty = all */
  selectedCategories: string[];
  /** Date range */
  dateRange: { from: string; to: string };
  /** Risk levels to show */
  riskLevels: string[];
  /** Search query for filtering SKU list */
  skuSearch: string;

  // Actions
  setSelectedSkus: (skus: string[]) => void;
  toggleSku: (sku: string) => void;
  selectAllSkus: (allSkus: string[]) => void;
  deselectAllSkus: () => void;
  setSelectedWarehouses: (warehouses: string[]) => void;
  setDateRange: (range: { from: string; to: string }) => void;
  setRiskLevels: (levels: string[]) => void;
  setSkuSearch: (q: string) => void;
  setSelectedCategories: (cats: string[]) => void;
  resetFilters: () => void;

  // Derived helpers
  hasActiveFilters: () => boolean;
  getFilterParams: () => Record<string, string>;
}

// ─── Defaults ────────────────────────────────────────────────────────────────────

const today = new Date();
const oneYearAgo = new Date(today);
oneYearAgo.setFullYear(today.getFullYear() - 1);

const toDateStr = (d: Date) => d.toISOString().split('T')[0];

const DEFAULT_STATE = {
  selectedSkus: [] as string[],
  selectedWarehouses: [] as string[],
  selectedCategories: [] as string[],
  dateRange: {
    from: toDateStr(oneYearAgo),
    to: toDateStr(today),
  },
  riskLevels: [] as string[],
  skuSearch: '',
};

// ─── Store ───────────────────────────────────────────────────────────────────────

export const useFilterStore = create<FilterState>((set, get) => ({
  ...DEFAULT_STATE,

  setSelectedSkus: (skus) => set({ selectedSkus: skus }),
  toggleSku: (sku) => set((s) => ({
    selectedSkus: s.selectedSkus.includes(sku)
      ? s.selectedSkus.filter((k) => k !== sku)
      : [...s.selectedSkus, sku],
  })),
  selectAllSkus: (allSkus) => set({ selectedSkus: allSkus }),
  deselectAllSkus: () => set({ selectedSkus: [] }),
  setSelectedWarehouses: (warehouses) => set({ selectedWarehouses: warehouses }),
  setDateRange: (range) => set({ dateRange: range }),
  setRiskLevels: (levels) => set({ riskLevels: levels }),
  setSkuSearch: (q) => set({ skuSearch: q }),
  setSelectedCategories: (cats) => set({ selectedCategories: cats }),
  resetFilters: () => set(DEFAULT_STATE),

  hasActiveFilters: () => {
    const s = get();
    return s.selectedSkus.length > 0 ||
      s.selectedWarehouses.length > 0 ||
      s.selectedCategories.length > 0 ||
      s.riskLevels.length > 0 ||
      s.dateRange.from !== DEFAULT_STATE.dateRange.from ||
      s.dateRange.to !== DEFAULT_STATE.dateRange.to;
  },

  getFilterParams: () => {
    const s = get();
    const params: Record<string, string> = {};
    if (s.selectedSkus.length > 0) params.skus = s.selectedSkus.join(',');
    if (s.selectedWarehouses.length > 0) params.warehouses = s.selectedWarehouses.join(',');
    if (s.selectedCategories.length > 0) params.categories = s.selectedCategories.join(',');
    if (s.riskLevels.length > 0) params.riskLevels = s.riskLevels.join(',');
    if (s.dateRange.from) params.dateFrom = s.dateRange.from;
    if (s.dateRange.to) params.dateTo = s.dateRange.to;
    return params;
  },
}));
