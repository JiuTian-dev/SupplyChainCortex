/**
 * @deprecated This monolithic UI store is being phased out.
 *
 * For new code, use the domain-specific stores:
 *   - useDashboardUIStore  from '@/stores/useDashboardUIStore'
 *   - useInventoryUIStore  from '@/stores/useInventoryUIStore'
 *   - useSupplierUIStore   from '@/stores/useSupplierUIStore'
 *
 * Existing components should be migrated incrementally.
 * Each domain store mirrors the relevant field names & setters for a drop-in migration.
 */

import { create } from 'zustand';

// ==================== UI Store (legacy — will be removed once all consumers migrate) ====================

interface SimulationParams {
  exchangeRateChange: number;
  freightChange: number;
}

interface NewSupplier {
  code: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  region: string;
  category: string;
  leadTime: number;
  rating: number;
}

interface UIState {
  activeTab: string;
  tabTransitioning: boolean;
  searchQuery: string;
  inventoryFilter: string;
  selectedProduct: string;
  simulationParams: SimulationParams;
  simulationResult: unknown | null;
  selectedInventorySku: string;
  inventoryDetail: unknown | null;
  salesForecastSku: string;
  salesForecast: unknown | null;
  isRefreshing: boolean;
  refreshCountdown: number;
  lastSyncTime: Date;
  globalSearchOpen: boolean;
  globalSearchQuery: string;
  reorderQty: number;
  reorderWarehouse: string;
  reorderPriority: string;
  notificationOpen: boolean;
  readNotifications: Set<string>;
  compareOpen: boolean;
  compareProducts: string[];
  showScrollTop: boolean;
  highlightElement: string;
  alertRulesOpen: boolean;
  drillDownCategory: string | null;
  showQuickActions: boolean;
  supplierFilter: string;
  supplierRegionFilter: string;
  expandedSupplier: string | null;
  addSupplierOpen: boolean;
  newSupplier: NewSupplier;
  selectedSupplier: unknown | null;
  supplierDetailOpen: boolean;
  supplierSearchQuery: string;
  supplierStatusFilter: string;
  editSupplierOpen: boolean;
  editingSupplier: unknown | null;
  reorderStatusFilter: string;
  notesOpen: boolean;
  newNoteContent: string;
  newNoteSku: string;
  newNotePriority: string;
  budgetDialogOpen: boolean;
  budgetData: unknown | null;
  timelineDialogOpen: boolean;
  timelineData: unknown | null;
  selectedScenario: string;
  scrollProgress: number;
  badgePop: boolean;
  dateRange: string;
}

interface UIActions {
  setActiveTab: (tab: string) => void;
  setTabTransitioning: (val: boolean) => void;
  setSearchQuery: (q: string) => void;
  setInventoryFilter: (f: string) => void;
  setSelectedProduct: (p: string) => void;
  setSimulationParams: (params: SimulationParams) => void;
  setSimulationResult: (result: unknown | null) => void;
  setSelectedInventorySku: (sku: string) => void;
  setInventoryDetail: (detail: unknown | null) => void;
  setSalesForecastSku: (sku: string) => void;
  setSalesForecast: (forecast: unknown | null) => void;
  setIsRefreshing: (val: boolean) => void;
  setRefreshCountdown: (val: number) => void;
  setLastSyncTime: (time: Date) => void;
  decrementCountdown: () => void;
  setGlobalSearchOpen: (open: boolean) => void;
  setGlobalSearchQuery: (q: string) => void;
  setReorderQty: (qty: number) => void;
  setReorderWarehouse: (warehouse: string) => void;
  setReorderPriority: (priority: string) => void;
  setNotificationOpen: (open: boolean) => void;
  addReadNotification: (id: string) => void;
  setReadNotifications: (ids: Set<string>) => void;
  setCompareOpen: (open: boolean) => void;
  setCompareProducts: (products: string[]) => void;
  toggleCompareProduct: (sku: string) => void;
  setShowScrollTop: (show: boolean) => void;
  setHighlightElement: (el: string) => void;
  setAlertRulesOpen: (open: boolean) => void;
  setDrillDownCategory: (category: string | null) => void;
  setShowQuickActions: (show: boolean) => void;
  setSupplierFilter: (f: string) => void;
  setSupplierRegionFilter: (f: string) => void;
  setExpandedSupplier: (id: string | null) => void;
  setAddSupplierOpen: (open: boolean) => void;
  setNewSupplier: (supplier: NewSupplier) => void;
  updateNewSupplierField: <K extends keyof NewSupplier>(key: K, value: NewSupplier[K]) => void;
  setSelectedSupplier: (supplier: unknown | null) => void;
  setSupplierDetailOpen: (open: boolean) => void;
  setSupplierSearchQuery: (q: string) => void;
  setSupplierStatusFilter: (f: string) => void;
  setEditSupplierOpen: (open: boolean) => void;
  setEditingSupplier: (supplier: unknown | null) => void;
  setReorderStatusFilter: (f: string) => void;
  setNotesOpen: (open: boolean) => void;
  setNewNoteContent: (content: string) => void;
  setNewNoteSku: (sku: string) => void;
  setNewNotePriority: (priority: string) => void;
  setBudgetDialogOpen: (open: boolean) => void;
  setBudgetData: (data: unknown | null) => void;
  setTimelineDialogOpen: (open: boolean) => void;
  setTimelineData: (data: unknown | null) => void;
  setSelectedScenario: (scenario: string) => void;
  setScrollProgress: (progress: number) => void;
  setBadgePop: (pop: boolean) => void;
  setDateRange: (range: string) => void;
}

export const useUIStore = create<UIState & UIActions>((set) => ({
  activeTab: 'dashboard',
  tabTransitioning: false,
  searchQuery: '',
  inventoryFilter: 'all',
  selectedProduct: '',
  simulationParams: { exchangeRateChange: 0, freightChange: 0 },
  simulationResult: null,
  selectedInventorySku: '',
  inventoryDetail: null,
  salesForecastSku: '',
  salesForecast: null,
  isRefreshing: false,
  refreshCountdown: 60,
  lastSyncTime: new Date(),
  globalSearchOpen: false,
  globalSearchQuery: '',
  reorderQty: 0,
  reorderWarehouse: '深圳仓',
  reorderPriority: '常规',
  notificationOpen: false,
  readNotifications: new Set<string>(),
  compareOpen: false,
  compareProducts: [],
  showScrollTop: false,
  highlightElement: '',
  alertRulesOpen: false,
  drillDownCategory: null,
  showQuickActions: false,
  supplierFilter: 'all',
  supplierRegionFilter: 'all',
  expandedSupplier: null,
  addSupplierOpen: false,
  newSupplier: { code: '', name: '', contact: '', email: '', phone: '', region: '', category: '', leadTime: 14, rating: 0 },
  selectedSupplier: null,
  supplierDetailOpen: false,
  supplierSearchQuery: '',
  supplierStatusFilter: 'all',
  editSupplierOpen: false,
  editingSupplier: null,
  reorderStatusFilter: 'all',
  notesOpen: false,
  newNoteContent: '',
  newNoteSku: '',
  newNotePriority: 'normal',
  budgetDialogOpen: false,
  budgetData: null,
  timelineDialogOpen: false,
  timelineData: null,
  selectedScenario: '',
  scrollProgress: 0,
  badgePop: false,
  dateRange: '30',

  setActiveTab: (tab) => set({ activeTab: tab }),
  setTabTransitioning: (val) => set({ tabTransitioning: val }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setInventoryFilter: (f) => set({ inventoryFilter: f }),
  setSelectedProduct: (p) => set({ selectedProduct: p }),
  setSimulationParams: (params) => set({ simulationParams: params }),
  setSimulationResult: (result) => set({ simulationResult: result }),
  setSelectedInventorySku: (sku) => set({ selectedInventorySku: sku }),
  setInventoryDetail: (detail) => set({ inventoryDetail: detail }),
  setSalesForecastSku: (sku) => set({ salesForecastSku: sku }),
  setSalesForecast: (forecast) => set({ salesForecast: forecast }),
  setIsRefreshing: (val) => set({ isRefreshing: val }),
  setRefreshCountdown: (val) => set({ refreshCountdown: val }),
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
  decrementCountdown: () => set((state) => ({ refreshCountdown: Math.max(0, state.refreshCountdown - 1) })),
  setGlobalSearchOpen: (open) => set({ globalSearchOpen: open }),
  setGlobalSearchQuery: (q) => set({ globalSearchQuery: q }),
  setReorderQty: (qty) => set({ reorderQty: qty }),
  setReorderWarehouse: (warehouse) => set({ reorderWarehouse: warehouse }),
  setReorderPriority: (priority) => set({ reorderPriority: priority }),
  setNotificationOpen: (open) => set({ notificationOpen: open }),
  addReadNotification: (id) => set((state) => { const next = new Set(state.readNotifications); next.add(id); return { readNotifications: next }; }),
  setReadNotifications: (ids) => set({ readNotifications: ids }),
  setCompareOpen: (open) => set({ compareOpen: open }),
  setCompareProducts: (products) => set({ compareProducts: products }),
  toggleCompareProduct: (sku) => set((state) => ({ compareProducts: state.compareProducts.includes(sku) ? state.compareProducts.filter((p) => p !== sku) : [...state.compareProducts, sku] })),
  setShowScrollTop: (show) => set({ showScrollTop: show }),
  setHighlightElement: (el) => set({ highlightElement: el }),
  setAlertRulesOpen: (open) => set({ alertRulesOpen: open }),
  setDrillDownCategory: (category) => set({ drillDownCategory: category }),
  setShowQuickActions: (show) => set({ showQuickActions: show }),
  setSupplierFilter: (f) => set({ supplierFilter: f }),
  setSupplierRegionFilter: (f) => set({ supplierRegionFilter: f }),
  setExpandedSupplier: (id) => set({ expandedSupplier: id }),
  setAddSupplierOpen: (open) => set({ addSupplierOpen: open }),
  setNewSupplier: (supplier) => set({ newSupplier: supplier }),
  updateNewSupplierField: (key, value) => set((state) => ({ newSupplier: { ...state.newSupplier, [key]: value } })),
  setSelectedSupplier: (supplier) => set({ selectedSupplier: supplier }),
  setSupplierDetailOpen: (open) => set({ supplierDetailOpen: open }),
  setSupplierSearchQuery: (q) => set({ supplierSearchQuery: q }),
  setSupplierStatusFilter: (f) => set({ supplierStatusFilter: f }),
  setEditSupplierOpen: (open) => set({ editSupplierOpen: open }),
  setEditingSupplier: (supplier) => set({ editingSupplier: supplier }),
  setReorderStatusFilter: (f) => set({ reorderStatusFilter: f }),
  setNotesOpen: (open) => set({ notesOpen: open }),
  setNewNoteContent: (content) => set({ newNoteContent: content }),
  setNewNoteSku: (sku) => set({ newNoteSku: sku }),
  setNewNotePriority: (priority) => set({ newNotePriority: priority }),
  setBudgetDialogOpen: (open) => set({ budgetDialogOpen: open }),
  setBudgetData: (data) => set({ budgetData: data }),
  setTimelineDialogOpen: (open) => set({ timelineDialogOpen: open }),
  setTimelineData: (data) => set({ timelineData: data }),
  setSelectedScenario: (scenario) => set({ selectedScenario: scenario }),
  setScrollProgress: (progress) => set({ scrollProgress: progress }),
  setBadgePop: (pop) => set({ badgePop: pop }),
  setDateRange: (range) => set({ dateRange: range }),
}));
