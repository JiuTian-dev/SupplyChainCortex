import { create } from 'zustand';

// ==================== Dashboard UI Store ====================
// Extracted from ui-store.ts — dashboard-level UI state

interface SimulationParams {
  exchangeRateChange: number;
  freightChange: number;
}

interface DashboardUIState {
  activeTab: string;
  tabTransitioning: boolean;
  searchQuery: string;
  simulationParams: SimulationParams;
  simulationResult: unknown | null;
  salesForecastSku: string;
  salesForecast: unknown | null;
  isRefreshing: boolean;
  refreshCountdown: number;
  lastSyncTime: Date;
  globalSearchOpen: boolean;
  globalSearchQuery: string;
  notificationOpen: boolean;
  readNotifications: Set<string>;
  compareOpen: boolean;
  compareProducts: string[];
  showScrollTop: boolean;
  alertRulesOpen: boolean;
  showQuickActions: boolean;
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

interface DashboardUIActions {
  setActiveTab: (tab: string) => void;
  setTabTransitioning: (val: boolean) => void;
  setSearchQuery: (q: string) => void;
  setSimulationParams: (params: SimulationParams) => void;
  setSimulationResult: (result: unknown | null) => void;
  setSalesForecastSku: (sku: string) => void;
  setSalesForecast: (forecast: unknown | null) => void;
  setIsRefreshing: (val: boolean) => void;
  setRefreshCountdown: (val: number) => void;
  setLastSyncTime: (time: Date) => void;
  decrementCountdown: () => void;
  setGlobalSearchOpen: (open: boolean) => void;
  setGlobalSearchQuery: (q: string) => void;
  setNotificationOpen: (open: boolean) => void;
  addReadNotification: (id: string) => void;
  setReadNotifications: (ids: Set<string>) => void;
  setCompareOpen: (open: boolean) => void;
  setCompareProducts: (products: string[]) => void;
  toggleCompareProduct: (sku: string) => void;
  setShowScrollTop: (show: boolean) => void;
  setAlertRulesOpen: (open: boolean) => void;
  setShowQuickActions: (show: boolean) => void;
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

export const useDashboardUIStore = create<DashboardUIState & DashboardUIActions>((set) => ({
  activeTab: 'dashboard',
  tabTransitioning: false,
  searchQuery: '',
  simulationParams: { exchangeRateChange: 0, freightChange: 0 },
  simulationResult: null,
  salesForecastSku: '',
  salesForecast: null,
  isRefreshing: false,
  refreshCountdown: 60,
  lastSyncTime: new Date(),
  globalSearchOpen: false,
  globalSearchQuery: '',
  notificationOpen: false,
  readNotifications: new Set<string>(),
  compareOpen: false,
  compareProducts: [],
  showScrollTop: false,
  alertRulesOpen: false,
  showQuickActions: false,
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
  setSimulationParams: (params) => set({ simulationParams: params }),
  setSimulationResult: (result) => set({ simulationResult: result }),
  setSalesForecastSku: (sku) => set({ salesForecastSku: sku }),
  setSalesForecast: (forecast) => set({ salesForecast: forecast }),
  setIsRefreshing: (val) => set({ isRefreshing: val }),
  setRefreshCountdown: (val) => set({ refreshCountdown: val }),
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
  decrementCountdown: () => set((state) => ({ refreshCountdown: Math.max(0, state.refreshCountdown - 1) })),
  setGlobalSearchOpen: (open) => set({ globalSearchOpen: open }),
  setGlobalSearchQuery: (q) => set({ globalSearchQuery: q }),
  setNotificationOpen: (open) => set({ notificationOpen: open }),
  addReadNotification: (id) => set((state) => { const next = new Set(state.readNotifications); next.add(id); return { readNotifications: next }; }),
  setReadNotifications: (ids) => set({ readNotifications: ids }),
  setCompareOpen: (open) => set({ compareOpen: open }),
  setCompareProducts: (products) => set({ compareProducts: products }),
  toggleCompareProduct: (sku) => set((state) => ({ compareProducts: state.compareProducts.includes(sku) ? state.compareProducts.filter((p) => p !== sku) : [...state.compareProducts, sku] })),
  setShowScrollTop: (show) => set({ showScrollTop: show }),
  setAlertRulesOpen: (open) => set({ alertRulesOpen: open }),
  setShowQuickActions: (show) => set({ showQuickActions: show }),
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
