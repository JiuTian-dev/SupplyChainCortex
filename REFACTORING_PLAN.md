# Supply Chain Dashboard — Refactoring Plan

## Executive Summary

The main `page.tsx` (5660 lines) contains all application logic in a single file: 50+ `useState` hooks, 15+ `useEffect` hooks, 6 tab panel render functions, 9 dialog components, 5 standalone sub-components, and a monolithic header/footer. This plan decomposes it into a clean architecture using **Zustand** for global state, **React Query** for server state, **custom hooks** for side effects, and **feature-based component folders**.

**Goal:** Reduce `page.tsx` from ~5660 lines to ~80–120 lines (a minimal layout shell) while preserving identical visual appearance and functionality.

---

## 1. Target File Structure

```
src/
├── app/
│   ├── layout.tsx                          # (unchanged) add QueryClientProvider here
│   ├── globals.css                         # (unchanged)
│   └── page.tsx                            # ~80-120 line layout shell
│
├── components/
│   ├── ui/                                 # (unchanged) shadcn/ui primitives
│   │
│   ├── layout/
│   │   ├── Header.tsx                      # App header bar (~150 lines)
│   │   ├── Footer.tsx                      # App footer (~50 lines)
│   │   ├── ScrollProgress.tsx              # Top scroll indicator (~10 lines)
│   │   ├── QuickActions.tsx                # Floating quick actions toolbar (~60 lines)
│   │   └── ScrollToTop.tsx                 # Scroll-to-top button (~20 lines)
│   │
│   ├── shared/
│   │   ├── MetricCard.tsx                  # Animated metric card (~86 lines, extracted from L5030-5115)
│   │   ├── DashboardSkeleton.tsx           # Loading skeleton (~302 lines, extracted from L5117-5419)
│   │   ├── CostBreakdownChart.tsx          # Cost pie chart (~46 lines, extracted from L5421-5466)
│   │   ├── ShipmentCard.tsx                # Shipment detail card (~76 lines, extracted from L5468-5543)
│   │   ├── LogisticsRiskCard.tsx           # Logistics risk widget (~48 lines, extracted from L5546-5593)
│   │   ├── SalesAnomalyCard.tsx            # Sales anomaly widget (~64 lines, extracted from L5596-5659)
│   │   └── StatusBadge.tsx                 # Shared status badge helper (new)
│   │
│   └── dialogs/
│       ├── GlobalSearchDialog.tsx           # Global search (~170 lines, extracted from L4247-4420)
│       ├── NotificationCenter.tsx           # Notification panel (~170 lines, extracted from L3944-4020 + L4058-4240)
│       ├── AlertRulesDialog.tsx             # Alert rule management (~90 lines, extracted from L4487-4566)
│       ├── NotesDialog.tsx                  # Collaboration notes (~95 lines, extracted from L4568-4659)
│       ├── ProductCompareDialog.tsx         # Product comparison (~165 lines, extracted from L4661-4823)
│       ├── AddSupplierDialog.tsx            # Add supplier form (~100 lines, extracted from L4825-4924)
│       ├── SupplierDetailDialog.tsx         # Supplier detail view (~100 lines, extracted from L4926-5025)
│       ├── BudgetDialog.tsx                 # Budget breakdown (extracted from inventory tab)
│       └── TimelineDialog.tsx               # Procurement timeline (extracted from inventory tab)
│
├── features/
│   ├── dashboard/
│   │   ├── DashboardTab.tsx                # Dashboard tab panel (~650 lines, extracted from L1005-1658)
│   │   ├── HealthScoreRadar.tsx            # Radar chart sub-component
│   │   ├── RiskMonitorCard.tsx             # Risk monitoring card (L1199-1658)
│   │   └── ScoreTrendChart.tsx             # Score trend line chart
│   │
│   ├── inventory/
│   │   ├── InventoryTab.tsx                # Inventory tab panel (~847 lines, extracted from L1661-2507)
│   │   ├── InventoryTable.tsx              # Inventory data table
│   │   ├── InventoryDetailDialog.tsx       # SKU detail dialog (L2358-2507)
│   │   ├── WarehouseCapacityMap.tsx        # Warehouse heatmap
│   │   ├── InventoryAgingChart.tsx         # Aging stacked bar
│   │   └── ReorderPanel.tsx               # Reorder management section
│   │
│   ├── cost/
│   │   ├── CostTab.tsx                     # Cost tab panel (~288 lines, extracted from L2511-2798)
│   │   ├── CostSimulation.tsx              # Simulation slider + results
│   │   └── CostVarianceChart.tsx           # Variance bar chart
│   │
│   ├── logistics/
│   │   ├── LogisticsTab.tsx                # Logistics tab panel (~343 lines, extracted from L2801-3143)
│   │   ├── ShippingRouteMap.tsx            # SVG world map with routes
│   │   └── ShipmentTimeline.tsx            # Shipment event timeline
│   │
│   ├── sales/
│   │   ├── SalesTab.tsx                    # Sales tab panel (~356 lines, extracted from L3146-3501)
│   │   ├── SalesHeatmap.tsx                # Calendar heatmap
│   │   ├── SalesForecastChart.tsx          # Forecast line chart
│   │   └── DrillDownPanel.tsx              # Category drill-down
│   │
│   ├── supplier/
│   │   ├── SupplierTab.tsx                 # Supplier tab panel (~399 lines, extracted from L3504-3902)
│   │   ├── SupplierTable.tsx               # Supplier data table
│   │   └── SupplierPerformanceChart.tsx    # Performance radar
│   │
│   └── risk/
│       ├── RiskPanel.tsx                   # Risk monitoring section (embedded in dashboard)
│       ├── ScenarioSimulator.tsx           # Scenario selection + simulation
│       └── ProcurementPanel.tsx            # Procurement plan section
│
├── hooks/
│   ├── use-mobile.ts                       # (existing)
│   ├── use-toast.ts                        # (existing)
│   ├── useWebSocket.ts                     # WebSocket connection + event handlers
│   ├── useAutoRefresh.ts                   # Auto-refresh countdown logic
│   ├── useScrollProgress.ts                # Scroll progress tracking
│   └── useNotifications.ts                 # Notification state + actions
│
├── stores/
│   ├── ui-store.ts                         # UI state (activeTab, dialogs, scroll, theme)
│   ├── dashboard-store.ts                  # Dashboard domain state
│   ├── inventory-store.ts                  # Inventory domain state
│   ├── cost-store.ts                       # Cost domain state
│   ├── logistics-store.ts                  # Logistics domain state
│   ├── sales-store.ts                      # Sales domain state
│   ├── supplier-store.ts                   # Supplier domain state
│   ├── notification-store.ts               # Notification state + backend notifications
│   └── connector-store.ts                  # MCP connector + WebSocket status
│
├── queries/                                # React Query hooks
│   ├── use-dashboard-query.ts              # Dashboard data fetching
│   ├── use-inventory-query.ts              # Inventory data fetching
│   ├── use-cost-query.ts                   # Cost data fetching
│   ├── use-logistics-query.ts              # Logistics data fetching
│   ├── use-sales-query.ts                  # Sales data fetching
│   ├── use-supplier-query.ts               # Supplier data fetching
│   ├── use-risk-query.ts                   # Risk data fetching
│   ├── use-procurement-query.ts            # Procurement data fetching
│   ├── use-reorder-query.ts                # Reorder data fetching
│   ├── use-notes-query.ts                  # Notes data fetching
│   ├── use-alert-rules-query.ts            # Alert rules data fetching
│   ├── use-stats-query.ts                  # Stats data fetching
│   └── use-warehouse-query.ts              # Warehouse data fetching
│
├── lib/
│   ├── types.ts                            # (existing) Type definitions
│   ├── constants.ts                        # (existing) Constants
│   ├── mock-data.ts                        # (existing) Mock data
│   ├── utils.ts                            # (existing) Utility functions
│   ├── db.ts                               # (existing) Database client
│   └── api.ts                              # NEW: Centralized API client functions
│
└── providers/
    └── QueryProvider.tsx                    # React Query provider wrapper
```

---

## 2. Component Extraction Strategy

### 2.1 Line-Range Mapping (Current `page.tsx`)

| Section | Lines | Est. Lines | Target File |
|---|---|---|---|
| Imports | 1–41 | 41 | Distributed to each consumer |
| State declarations | 43–128 | 86 | Zustand stores |
| `runSimulation` callback | 136–144 | 9 | `useCostQuery` or cost-store action |
| `refreshAll` callback | 147–307 | 161 | `useAutoRefresh` hook + React Query invalidation |
| Initial data load useEffect | 310–341 | 32 | React Query `useQuery` (automatic) |
| Auto-refresh countdown | 343–356 | 14 | `useAutoRefresh` hook |
| WebSocket useEffect | 359–551 | 193 | `useWebSocket` hook |
| Events/alert-rules/notifications useEffects | 553–641 | 89 | React Query `useQuery` |
| Extended chart data useEffect | 644–735 | 92 | React Query `useQuery` |
| Supplier performance useEffect | 738–745 | 8 | `useSupplierQuery` |
| Stockout risk useEffect | 748–753 | 6 | `useInventoryQuery` |
| Risk/procurement/scenario useEffects | 756–806 | 51 | React Query `useQuery` |
| Scroll/drill-down useEffects | 809–837 | 29 | `useScrollProgress` + store actions |
| `viewInventoryDetail` / `viewSalesForecast` | 840–869 | 30 | React Query `useMutation` |
| `filteredInventory` / `notifications` memos | 871–947 | 77 | Computed in stores or components |
| `handleNotificationClick` | 960–1002 | 43 | `useNotifications` hook |
| `renderDashboard()` | 1005–1658 | **654** | `features/dashboard/DashboardTab.tsx` |
| `renderInventory()` | 1661–2507 | **847** | `features/inventory/InventoryTab.tsx` + sub-components |
| `renderCost()` | 2511–2798 | **288** | `features/cost/CostTab.tsx` |
| `renderLogistics()` | 2801–3143 | **343** | `features/logistics/LogisticsTab.tsx` |
| `renderSales()` | 3146–3501 | **356** | `features/sales/SalesTab.tsx` |
| `renderSupplier()` | 3504–3902 | **399** | `features/supplier/SupplierTab.tsx` |
| Main return JSX (header + tabs + dialogs) | 3905–5025 | **1121** | Layout components + dialog components |
| `MetricCard` | 5030–5115 | 86 | `components/shared/MetricCard.tsx` |
| `DashboardSkeleton` | 5117–5419 | 303 | `components/shared/DashboardSkeleton.tsx` |
| `CostBreakdownChart` | 5421–5466 | 46 | `components/shared/CostBreakdownChart.tsx` |
| `ShipmentCard` | 5468–5543 | 76 | `components/shared/ShipmentCard.tsx` |
| `LogisticsRiskCard` | 5546–5593 | 48 | `components/shared/LogisticsRiskCard.tsx` |
| `SalesAnomalyCard` | 5596–5659 | 64 | `components/shared/SalesAnomalyCard.tsx` |

### 2.2 Extraction Rules

1. **Each `renderX()` function becomes a `<XTab />` component** in its feature folder
2. **Each `<Dialog>` block becomes a standalone dialog component** in `components/dialogs/`
3. **Standalone function components** (MetricCard, DashboardSkeleton, etc.) move to `components/shared/`
4. **Props drilling is minimized** — components read from Zustand stores and React Query instead
5. **Only callback handlers and event wiring** pass through props when absolutely necessary

---

## 3. State Management Strategy (Zustand Store Design)

### 3.1 Store Architecture

We split state into **domain stores** (each Zustand store manages one business domain) and **UI stores** (manage presentation state).

#### `stores/ui-store.ts` — UI State

```typescript
import { create } from 'zustand';

interface UIState {
  // Tab & navigation
  activeTab: string;
  setActiveTab: (tab: string) => void;
  tabTransitioning: boolean;
  setTabTransitioning: (v: boolean) => void;
  highlightElement: string;
  setHighlightElement: (el: string) => void;

  // Hydration
  mounted: boolean;
  setMounted: (v: boolean) => void;

  // Refresh
  isRefreshing: boolean;
  setIsRefreshing: (v: boolean) => void;
  refreshCountdown: number;
  setRefreshCountdown: (v: number) => void;
  lastSyncTime: Date;
  setLastSyncTime: (d: Date) => void;

  // Scroll
  showScrollTop: boolean;
  setShowScrollTop: (v: boolean) => void;
  showQuickActions: boolean;
  setShowQuickActions: (v: boolean) => void;
  scrollProgress: number;
  setScrollProgress: (v: number) => void;

  // Dialog states
  globalSearchOpen: boolean;
  setGlobalSearchOpen: (v: boolean) => void;
  alertRulesOpen: boolean;
  setAlertRulesOpen: (v: boolean) => void;
  notesOpen: boolean;
  setNotesOpen: (v: boolean) => void;
  compareOpen: boolean;
  setCompareOpen: (v: boolean) => void;
  budgetDialogOpen: boolean;
  setBudgetDialogOpen: (v: boolean) => void;
  timelineDialogOpen: boolean;
  setTimelineDialogOpen: (v: boolean) => void;
  addSupplierOpen: boolean;
  setAddSupplierOpen: (v: boolean) => void;
  supplierDetailOpen: boolean;
  setSupplierDetailOpen: (v: boolean) => void;
  editSupplierOpen: boolean;
  setEditSupplierOpen: (v: boolean) => void;

  // Badge animation
  badgePop: boolean;
  setBadgePop: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab, tabTransitioning: true }),
  tabTransitioning: false,
  setTabTransitioning: (v) => set({ tabTransitioning: v }),
  highlightElement: '',
  setHighlightElement: (el) => set({ highlightElement: el }),
  mounted: false,
  setMounted: (v) => set({ mounted: v }),
  isRefreshing: false,
  setIsRefreshing: (v) => set({ isRefreshing: v }),
  refreshCountdown: 60,
  setRefreshCountdown: (v) => set({ refreshCountdown: v }),
  lastSyncTime: new Date(),
  setLastSyncTime: (d) => set({ lastSyncTime: d }),
  showScrollTop: false,
  setShowScrollTop: (v) => set({ showScrollTop: v }),
  showQuickActions: false,
  setShowQuickActions: (v) => set({ showQuickActions: v }),
  scrollProgress: 0,
  setScrollProgress: (v) => set({ scrollProgress: v }),
  globalSearchOpen: false,
  setGlobalSearchOpen: (v) => set({ globalSearchOpen: v }),
  alertRulesOpen: false,
  setAlertRulesOpen: (v) => set({ alertRulesOpen: v }),
  notesOpen: false,
  setNotesOpen: (v) => set({ notesOpen: v }),
  compareOpen: false,
  setCompareOpen: (v) => set({ compareOpen: v }),
  budgetDialogOpen: false,
  setBudgetDialogOpen: (v) => set({ budgetDialogOpen: v }),
  timelineDialogOpen: false,
  setTimelineDialogOpen: (v) => set({ timelineDialogOpen: v }),
  addSupplierOpen: false,
  setAddSupplierOpen: (v) => set({ addSupplierOpen: v }),
  supplierDetailOpen: false,
  setSupplierDetailOpen: (v) => set({ supplierDetailOpen: v }),
  editSupplierOpen: false,
  setEditSupplierOpen: (v) => set({ editSupplierOpen: v }),
  badgePop: false,
  setBadgePop: (v) => set({ badgePop: v }),
}));
```

#### `stores/notification-store.ts` — Notification Domain State

```typescript
import { create } from 'zustand';
import type { BackendNotification } from '@/lib/types';

interface NotificationState {
  backendNotifications: BackendNotification[];
  setBackendNotifications: (n: BackendNotification[]) => void;
  addNotification: (n: BackendNotification) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  readNotifications: Set<string>;
  setReadNotifications: (s: Set<string>) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  backendNotifications: [],
  setBackendNotifications: (n) => set({ backendNotifications: n }),
  addNotification: (n) =>
    set((state) => ({ backendNotifications: [n, ...state.backendNotifications] })),
  markAsRead: (id) =>
    set((state) => ({
      backendNotifications: state.backendNotifications.map((bn) =>
        bn.id === id ? { ...bn, isRead: true } : bn
      ),
    })),
  markAllAsRead: () =>
    set((state) => ({
      backendNotifications: state.backendNotifications.map((bn) => ({
        ...bn,
        isRead: true,
      })),
    })),
  readNotifications: new Set<string>(),
  setReadNotifications: (s) => set({ readNotifications: s }),
}));
```

#### `stores/connector-store.ts` — MCP Connector & WebSocket Status

```typescript
import { create } from 'zustand';
import type { ConnectorStatus } from '@/lib/types';
import { MCP_CONNECTORS } from '@/lib/constants';

interface ConnectorState {
  wsConnected: boolean;
  setWsConnected: (v: boolean) => void;
  connectorData: ConnectorStatus[];
  setConnectorData: (data: ConnectorStatus[]) => void;
  supplyChainEvents: any[];  // type appropriately
  setSupplyChainEvents: (events: any[]) => void;
}

export const useConnectorStore = create<ConnectorState>((set) => ({
  wsConnected: false,
  setWsConnected: (v) => set({ wsConnected: v }),
  connectorData: MCP_CONNECTORS,
  setConnectorData: (data) => set({ connectorData: data }),
  supplyChainEvents: [],
  setSupplyChainEvents: (events) => set({ supplyChainEvents: events }),
}));
```

#### `stores/inventory-store.ts` — Inventory Domain State (local-only state)

```typescript
import { create } from 'zustand';

interface InventoryState {
  inventoryFilter: string;
  setInventoryFilter: (f: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedInventorySku: string;
  setSelectedInventorySku: (sku: string) => void;
  inventoryDetail: any; // type appropriately
  setInventoryDetail: (d: any) => void;
}

export const useInventoryStore = create<InventoryState>((set) => ({
  inventoryFilter: 'all',
  setInventoryFilter: (f) => set({ inventoryFilter: f }),
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  selectedInventorySku: '',
  setSelectedInventorySku: (sku) => set({ selectedInventorySku: sku }),
  inventoryDetail: null,
  setInventoryDetail: (d) => set({ inventoryDetail: d }),
}));
```

#### `stores/cost-store.ts` — Cost Domain State

```typescript
import { create } from 'zustand';

interface CostState {
  selectedProduct: string;
  setSelectedProduct: (sku: string) => void;
  simulationParams: { exchangeRateChange: number; freightChange: number };
  setSimulationParams: (p: { exchangeRateChange: number; freightChange: number }) => void;
  simulationResult: any;
  setSimulationResult: (r: any) => void;
}

export const useCostStore = create<CostState>((set) => ({
  selectedProduct: '',
  setSelectedProduct: (sku) => set({ selectedProduct: sku }),
  simulationParams: { exchangeRateChange: 0, freightChange: 0 },
  setSimulationParams: (p) => set({ simulationParams: p }),
  simulationResult: null,
  setSimulationResult: (r) => set({ simulationResult: r }),
}));
```

#### `stores/sales-store.ts` — Sales Domain State

```typescript
import { create } from 'zustand';

interface SalesState {
  salesForecastSku: string;
  setSalesForecastSku: (sku: string) => void;
  salesForecast: any;
  setSalesForecast: (f: any) => void;
  drillDownCategory: string | null;
  setDrillDownCategory: (c: string | null) => void;
  drillDownProducts: Record<string, { name: string; revenue: number; qty: number; margin: number }[]>;
  setDrillDownProducts: (p: Record<string, { name: string; revenue: number; qty: number; margin: number }[]>) => void;
  compareProducts: string[];
  setCompareProducts: (p: string[]) => void;
}

export const useSalesStore = create<SalesState>((set) => ({
  salesForecastSku: '',
  setSalesForecastSku: (sku) => set({ salesForecastSku: sku }),
  salesForecast: null,
  setSalesForecast: (f) => set({ salesForecast: f }),
  drillDownCategory: null,
  setDrillDownCategory: (c) => set({ drillDownCategory: c }),
  drillDownProducts: {},
  setDrillDownProducts: (p) => set({ drillDownProducts: p }),
  compareProducts: [],
  setCompareProducts: (p) => set({ compareProducts: p }),
}));
```

#### `stores/supplier-store.ts` — Supplier Domain State

```typescript
import { create } from 'zustand';

interface SupplierState {
  supplierFilter: string;
  setSupplierFilter: (f: string) => void;
  supplierRegionFilter: string;
  setSupplierRegionFilter: (f: string) => void;
  expandedSupplier: string | null;
  setExpandedSupplier: (s: string | null) => void;
  selectedSupplier: any;
  setSelectedSupplier: (s: any) => void;
  supplierSearchQuery: string;
  setSupplierSearchQuery: (q: string) => void;
  supplierStatusFilter: string;
  setSupplierStatusFilter: (f: string) => void;
  editingSupplier: any;
  setEditingSupplier: (s: any) => void;
  newSupplier: any;
  setNewSupplier: (s: any) => void;
  reorderStatusFilter: string;
  setReorderStatusFilter: (f: string) => void;
  reorderQty: number;
  setReorderQty: (q: number) => void;
  reorderWarehouse: string;
  setReorderWarehouse: (w: string) => void;
  reorderPriority: string;
  setReorderPriority: (p: string) => void;
  supplierPerfExpanded: boolean;
  setSupplierPerfExpanded: (v: boolean) => void;
}

export const useSupplierStore = create<SupplierState>((set) => ({
  // ... all fields with setters
}));
```

#### `stores/dashboard-store.ts` — Dashboard Domain State

```typescript
import { create } from 'zustand';

interface DashboardState {
  dateRange: string;
  setDateRange: (r: string) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  dateRange: '30',
  setDateRange: (r) => set({ dateRange: r }),
}));
```

### 3.2 Server State → React Query

All data currently held in `useState` that comes from API calls should move to React Query. This replaces:
- `dashboardData`, `inventoryData`, `costData`, `logisticsData`, `salesData`
- `supplierData`, `reorderData`, `riskData`, `procurementData`
- `budgetData`, `timelineData`
- `alertRules`, `notesData`
- `connectorData` (partially — live updates still via WebSocket)
- `scoreTrendData`, `inventoryAgingData`, `costVarianceData`, `salesHeatmapData`
- `supplierPerformance`, `stockoutRiskItems`

**Example React Query hook:**

```typescript
// queries/use-dashboard-query.ts
import { useQuery } from '@tanstack/react-query';

export function useDashboardQuery(days: string = '30') {
  return useQuery({
    queryKey: ['dashboard', days],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?days=${days}`);
      return res.json();
    },
    refetchInterval: 60000, // auto-refetch every 60s
    staleTime: 30000,
  });
}
```

---

## 4. Custom Hooks Extraction Plan

### 4.1 `hooks/useWebSocket.ts`

**Absorbs:** Lines 359–551 (WebSocket useEffect)

```typescript
export function useWebSocket() {
  const { addNotification } = useNotificationStore();
  const { setWsConnected } = useConnectorStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = io('/?XTransformPort=3003', {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => setWsConnected(true));
    socket.on('connected', () => setWsConnected(true));
    socket.on('dashboard-update', (data) => {
      queryClient.setQueryData(['dashboard'], (old: any) => ({
        ...old,
        metrics: { ...old?.metrics, ...data.metrics },
      }));
      toast.info('仪表盘数据已更新', { ... });
    });
    socket.on('notification', (notif) => { addNotification(mapNotif(notif)); toast[...](...); });
    socket.on('inventory-alert', (alert) => { addNotification(mapAlert(alert)); toast[...](...); });
    socket.on('shipment-update', (update) => {
      queryClient.setQueryData(['logistics'], (old: any) => updateShipment(old, update));
      if (isImportant(update)) addNotification(mapShipment(update));
    });
    socket.on('data-update', () => queryClient.invalidateQueries());
    socket.on('disconnect', () => setWsConnected(false));
    socket.on('connect_error', () => setWsConnected(false));

    return () => socket.disconnect();
  }, []);
}
```

**Key design decisions:**
- WebSocket events directly invalidate/update React Query cache
- New notifications pushed to `notificationStore`
- No direct `setState` calls — everything flows through stores/query cache

### 4.2 `hooks/useAutoRefresh.ts`

**Absorbs:** Lines 343–356 (countdown timer) + refresh trigger

```typescript
export function useAutoRefresh() {
  const { isRefreshing, setIsRefreshing, refreshCountdown, setRefreshCountdown, setLastSyncTime } = useUIStore();
  const queryClient = useQueryClient();

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    await queryClient.invalidateQueries({ queryKey: ['inventory'] });
    await queryClient.invalidateQueries({ queryKey: ['cost'] });
    await queryClient.invalidateQueries({ queryKey: ['logistics'] });
    await queryClient.invalidateQueries({ queryKey: ['sales'] });
    await queryClient.invalidateQueries({ queryKey: ['supplier'] });
    await queryClient.invalidateQueries({ queryKey: ['reorder'] });
    await queryClient.invalidateQueries({ queryKey: ['notes'] });
    await queryClient.invalidateQueries({ queryKey: ['stats'] });
    await queryClient.invalidateQueries({ queryKey: ['warehouse'] });
    setIsRefreshing(false);
    setLastSyncTime(new Date());
    setRefreshCountdown(60);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) { refreshAll(); return 60; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  return { refreshAll, isRefreshing, refreshCountdown };
}
```

### 4.3 `hooks/useScrollProgress.ts`

**Absorbs:** Lines 809–818 + 950–957

```typescript
export function useScrollProgress() {
  const { setScrollProgress, setShowScrollTop, setShowQuickActions } = useUIStore();

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0);
      setShowScrollTop(scrollTop > 400);
      setShowQuickActions(scrollTop > 200);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
}
```

### 4.4 `hooks/useNotifications.ts`

**Absorbs:** Lines 889–1002 (notification computation, badge animation, click handler)

```typescript
export function useNotifications() {
  const { backendNotifications, readNotifications, markAsRead, markAllAsRead } = useNotificationStore();
  const { setActiveTab, setHighlightElement, setGlobalSearchOpen: _, ...ui } = useUIStore();
  const prevUnreadRef = useRef(0);

  // Compute notifications list (backend-first, fallback to generated)
  const notifications = useMemo(() => { ... }, [backendNotifications, ...]);

  const unreadCount = useMemo(() => { ... }, [backendNotifications, readNotifications, notifications]);

  // Badge pop animation
  useEffect(() => { ... }, [unreadCount]);

  // Click handler
  const handleNotificationClick = useCallback((n, e?) => { ... }, []);

  return { notifications, unreadCount, handleNotificationClick, markAllAsRead };
}
```

---

## 5. React Query Setup

### 5.1 `providers/QueryProvider.tsx`

```typescript
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

### 5.2 Wire into `layout.tsx`

Wrap `{children}` with `<QueryProvider>`.

### 5.3 Query Key Strategy

```typescript
// All query keys for the app
export const queryKeys = {
  dashboard: (days?: string) => ['dashboard', days] as const,
  inventory: (action?: string) => ['inventory', action] as const,
  cost: (action?: string) => ['cost', action] as const,
  logistics: (action?: string) => ['logistics', action] as const,
  sales: (action?: string) => ['sales', action] as const,
  supplier: () => ['supplier'] as const,
  reorder: () => ['reorder'] as const,
  risk: (action?: string) => ['risk', action] as const,
  procurement: (action?: string) => ['procurement', action] as const,
  notes: () => ['notes'] as const,
  alertRules: () => ['alertRules'] as const,
  stats: (period?: string) => ['stats', period] as const,
  warehouse: (action?: string) => ['warehouse', action] as const,
  events: () => ['events'] as const,
};
```

### 5.4 Centralized API Client (`lib/api.ts`)

```typescript
// Type-safe API client to eliminate scattered fetch() calls
export const api = {
  dashboard: {
    get: (days?: string) => fetch(`/api/dashboard${days ? `?days=${days}` : ''}`).then(r => r.json()),
  },
  inventory: {
    list: () => fetch('/api/inventory?action=list').then(r => r.json()),
    health: (sku: string) => fetch(`/api/inventory?action=health&sku=${sku}`).then(r => r.json()),
    safetyStock: (sku: string, level = 0.95) => fetch(`/api/inventory?action=safety_stock&sku=${sku}&serviceLevel=${level}`).then(r => r.json()),
    reorder: (sku: string) => fetch(`/api/inventory?action=reorder&sku=${sku}`).then(r => r.json()),
    stockoutRisk: () => fetch('/api/inventory?action=stockout-risk').then(r => r.json()),
  },
  cost: {
    list: () => fetch('/api/cost?action=list').then(r => r.json()),
    simulate: (exchangeRateChange: number, freightChange: number) =>
      fetch(`/api/cost?action=simulate&exchangeRateChange=${exchangeRateChange}&freightChange=${freightChange}`).then(r => r.json()),
    trend: (months?: number) => fetch(`/api/cost?action=trend&months=${months || 1}`).then(r => r.json()),
  },
  logistics: { list: () => fetch('/api/logistics?action=list').then(r => r.json()), risk: () => fetch('/api/logistics?action=risk').then(r => r.json()) },
  sales: {
    overview: (days = 30) => fetch(`/api/sales?action=overview&days=${days}`).then(r => r.json()),
    forecast: (sku: string, horizon = 14) => fetch(`/api/sales?action=forecast&sku=${sku}&horizon=${horizon}`).then(r => r.json()),
    anomaly: () => fetch('/api/sales?action=anomaly').then(r => r.json()),
  },
  suppliers: { list: () => fetch('/api/suppliers').then(r => r.json()), create: (data: any) => fetch('/api/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()), update: (id: string, data: any) => fetch(`/api/suppliers?id=${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()) },
  reorder: { list: () => fetch('/api/reorder').then(r => r.json()), create: (data: any) => fetch('/api/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()) },
  risk: { dashboard: () => fetch('/api/risk?action=dashboard').then(r => r.json()), simulation: (scenario: string) => fetch(`/api/risk?action=simulation&scenario=${scenario}`).then(r => r.json()) },
  procurement: { plan: () => fetch('/api/procurement?action=plan').then(r => r.json()), budget: () => fetch('/api/procurement?action=budget').then(r => r.json()), timeline: () => fetch('/api/procurement?action=timeline').then(r => r.json()) },
  notes: { list: (limit = 50) => fetch(`/api/notes?limit=${limit}`).then(r => r.json()), create: (data: any) => fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()), resolve: (id: string) => fetch(`/api/notes?id=${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isResolved: true }) }).then(r => r.json()) },
  alertRules: { list: () => fetch('/api/alert-rules').then(r => r.json()), update: (data: any) => fetch('/api/alert-rules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()) },
  notifications: { list: () => fetch('/api/notifications').then(r => r.json()), markRead: (id: string) => fetch('/api/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notificationId: id }) }).then(r => r.json()), markAllRead: () => fetch('/api/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markAllRead: true }) }).then(r => r.json()) },
  stats: { get: (period = '30d') => fetch(`/api/stats?period=${period}`).then(r => r.json()) },
  warehouse: { capacity: () => fetch('/api/warehouse?action=capacity').then(r => r.json()), aging: () => fetch('/api/warehouse?action=aging').then(r => r.json()) },
  events: { list: (limit = 10) => fetch(`/api/events?limit=${limit}`).then(r => r.json()) },
  analytics: { supplierPerformance: () => fetch('/api/analytics?action=supplier-performance').then(r => r.json()) },
  products: { byCategory: (category: string) => fetch(`/api/products?category=${encodeURIComponent(category)}`).then(r => r.json()) },
} as const;
```

---

## 6. Target `page.tsx` (Final State)

After all extractions, `page.tsx` should look approximately like this:

```tsx
'use client';

import { useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUIStore } from '@/stores/ui-store';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useScrollProgress } from '@/hooks/useScrollProgress';

import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ScrollProgress } from '@/components/layout/ScrollProgress';
import { QuickActions } from '@/components/layout/QuickActions';
import { ScrollToTop } from '@/components/layout/ScrollToTop';

import { DashboardTab } from '@/features/dashboard/DashboardTab';
import { InventoryTab } from '@/features/inventory/InventoryTab';
import { CostTab } from '@/features/cost/CostTab';
import { LogisticsTab } from '@/features/logistics/LogisticsTab';
import { SalesTab } from '@/features/sales/SalesTab';
import { SupplierTab } from '@/features/supplier/SupplierTab';

import { GlobalSearchDialog } from '@/components/dialogs/GlobalSearchDialog';
import { AlertRulesDialog } from '@/components/dialogs/AlertRulesDialog';
import { NotesDialog } from '@/components/dialogs/NotesDialog';
import { ProductCompareDialog } from '@/components/dialogs/ProductCompareDialog';

export default function HomePage() {
  const { mounted, setMounted, activeTab, setActiveTab, tabTransitioning, setTabTransitioning,
          globalSearchOpen, alertRulesOpen, notesOpen, compareOpen } = useUIStore();

  // Hydration safety
  useEffect(() => {
    const timeout = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(timeout);
  }, []);

  // Initialize side effects
  useWebSocket();
  useAutoRefresh();
  useScrollProgress();

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setTimeout(() => setTabTransitioning(false), 300);
  };

  const tabTransitionOverlay = (
    tabTransitioning && (
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div className="h-5 w-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <ScrollProgress />
      <Header />
      <main className="flex-1 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 w-full">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-4">
            <TabsTrigger value="dashboard">仪表盘</TabsTrigger>
            <TabsTrigger value="inventory">库存优化</TabsTrigger>
            <TabsTrigger value="cost">成本监控</TabsTrigger>
            <TabsTrigger value="logistics">物流追踪</TabsTrigger>
            <TabsTrigger value="sales">销售分析</TabsTrigger>
            <TabsTrigger value="supplier">供应商</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="relative">{tabTransitionOverlay}<DashboardTab /></TabsContent>
          <TabsContent value="inventory" className="relative">{tabTransitionOverlay}<InventoryTab /></TabsContent>
          <TabsContent value="cost" className="relative">{tabTransitionOverlay}<CostTab /></TabsContent>
          <TabsContent value="logistics" className="relative">{tabTransitionOverlay}<LogisticsTab /></TabsContent>
          <TabsContent value="sales" className="relative">{tabTransitionOverlay}<SalesTab /></TabsContent>
          <TabsContent value="supplier" className="relative">{tabTransitionOverlay}<SupplierTab /></TabsContent>
        </Tabs>
      </main>
      <Footer />

      {/* Global Dialogs */}
      <GlobalSearchDialog />
      <AlertRulesDialog />
      <NotesDialog />
      <ProductCompareDialog />

      {/* Floating UI */}
      <QuickActions />
      <ScrollToTop />
    </div>
  );
}
```

**Estimated line count: ~80–100 lines**

---

## 7. Execution Order (Phased Approach)

### Phase 0: Preparation (no breaking changes)
1. **Install dependencies** — Already done (zustand, @tanstack/react-query present in package.json)
2. **Create `providers/QueryProvider.tsx`** — Wrap app in `layout.tsx`
3. **Create `lib/api.ts`** — Centralized API client (no UI changes, just a utility)
4. **Create `stores/` directory** — Write all Zustand stores but don't wire them yet
5. **Git commit:** `"chore: scaffold stores, api client, and query provider"`

### Phase 1: Extract standalone components (lowest risk)
1. **Extract `MetricCard`** → `components/shared/MetricCard.tsx`
2. **Extract `DashboardSkeleton`** → `components/shared/DashboardSkeleton.tsx`
3. **Extract `CostBreakdownChart`** → `components/shared/CostBreakdownChart.tsx`
4. **Extract `ShipmentCard`** → `components/shared/ShipmentCard.tsx`
5. **Extract `LogisticsRiskCard`** → `components/shared/LogisticsRiskCard.tsx`
6. **Extract `SalesAnomalyCard`** → `components/shared/SalesAnomalyCard.tsx`
7. Import them back into `page.tsx` — verify everything renders
8. **Git commit:** `"refactor: extract shared sub-components"`

### Phase 2: Extract custom hooks
1. **Create `hooks/useScrollProgress.ts`** — Move scroll tracking logic
2. **Create `hooks/useNotifications.ts`** — Move notification computation + badge animation
3. **Create `hooks/useAutoRefresh.ts`** — Move countdown + refresh logic (still using `useState` for now)
4. **Create `hooks/useWebSocket.ts`** — Move WebSocket connection (still using `useState` for now)
5. Wire these hooks into `page.tsx`, replacing inline `useEffect` blocks
6. **Git commit:** `"refactor: extract custom hooks for side effects"`

### Phase 3: Wire Zustand stores (gradual migration)
1. **Wire `useUIStore`** — Replace all dialog `useState`, `activeTab`, `mounted`, scroll states
2. **Wire `useNotificationStore`** — Replace `backendNotifications`, `readNotifications`, notification actions
3. **Wire `useConnectorStore`** — Replace `wsConnected`, `connectorData`, `supplyChainEvents`
4. **Wire domain stores** — `inventoryStore`, `costStore`, `salesStore`, `supplierStore`, `dashboardStore`
5. Remove the replaced `useState` declarations from `page.tsx`
6. **Git commit after each store:** `"refactor: wire [store-name] Zustand store"`

### Phase 4: Wire React Query (replace manual data fetching)
1. **Create `queries/use-dashboard-query.ts`** — Replace `dashboardData` useState + fetch useEffect
2. **Create `queries/use-inventory-query.ts`** — Replace `inventoryData` useState + fetch useEffect
3. **Create `queries/use-cost-query.ts`** — Replace `costData` useState + fetch useEffect
4. **Create `queries/use-logistics-query.ts`** — Replace `logisticsData` useState + fetch useEffect
5. **Create `queries/use-sales-query.ts`** — Replace `salesData` useState + fetch useEffect
6. **Create `queries/use-supplier-query.ts`** — Replace `supplierData` useState + fetch useEffect
7. **Create remaining query hooks** — reorder, risk, procurement, notes, alert-rules, stats, warehouse, events
8. **Update `useAutoRefresh`** to use `queryClient.invalidateQueries()` instead of manual `fetch`
9. **Update `useWebSocket`** to use `queryClient.setQueryData()` / `invalidateQueries()`
10. **Remove all remaining data-fetching `useEffect` hooks and data `useState` from `page.tsx`**
11. **Git commit:** `"refactor: replace manual fetching with React Query"`

### Phase 5: Extract tab panel components
1. **Extract `DashboardTab`** → `features/dashboard/DashboardTab.tsx`
   - Move `renderDashboard()` JSX
   - Replace `dashboardData` with `useDashboardQuery()`
   - Replace local state reads with Zustand store reads
   - Extract sub-components: `HealthScoreRadar`, `RiskMonitorCard`, `ScoreTrendChart`
2. **Extract `InventoryTab`** → `features/inventory/InventoryTab.tsx`
   - Move `renderInventory()` JSX
   - Extract dialogs: `InventoryDetailDialog`, `BudgetDialog`, `TimelineDialog`
   - Extract sub-components: `InventoryTable`, `WarehouseCapacityMap`, `InventoryAgingChart`, `ReorderPanel`
3. **Extract `CostTab`** → `features/cost/CostTab.tsx`
   - Extract `CostSimulation`, `CostVarianceChart`
4. **Extract `LogisticsTab`** → `features/logistics/LogisticsTab.tsx`
   - Extract `ShippingRouteMap`, `ShipmentTimeline`
5. **Extract `SalesTab`** → `features/sales/SalesTab.tsx`
   - Extract `SalesHeatmap`, `SalesForecastChart`, `DrillDownPanel`
6. **Extract `SupplierTab`** → `features/supplier/SupplierTab.tsx`
   - Extract `SupplierTable`, `SupplierPerformanceChart`
   - Extract dialogs: `AddSupplierDialog`, `SupplierDetailDialog`
7. **Git commit after each tab:** `"refactor: extract [tab] component"`

### Phase 6: Extract layout components and remaining dialogs
1. **Extract `Header`** → `components/layout/Header.tsx`
   - Move all header JSX including notification panel, search button, status badges, export dropdown
2. **Extract `Footer`** → `components/layout/Footer.tsx`
3. **Extract `ScrollProgress`** → `components/layout/ScrollProgress.tsx`
4. **Extract `QuickActions`** → `components/layout/QuickActions.tsx`
5. **Extract `ScrollToTop`** → `components/layout/ScrollToTop.tsx`
6. **Extract `GlobalSearchDialog`** → `components/dialogs/GlobalSearchDialog.tsx`
7. **Extract `AlertRulesDialog`** → `components/dialogs/AlertRulesDialog.tsx`
8. **Extract `NotesDialog`** → `components/dialogs/NotesDialog.tsx`
9. **Extract `ProductCompareDialog`** → `components/dialogs/ProductCompareDialog.tsx`
10. **Git commit:** `"refactor: extract layout and dialog components"`

### Phase 7: Final cleanup
1. Remove all dead code from `page.tsx`
2. Verify `page.tsx` is ~80–120 lines
3. Remove unused imports
4. Add proper TypeScript types to all `any` types in stores and queries
5. Add error boundaries around tab panels
6. **Git commit:** `"refactor: final cleanup and type safety"`

---

## 8. How to Ensure No Breaking Changes

### 8.1 Incremental Verification Strategy

After **every** extraction step:

1. **Visual comparison:** Run `npm run dev` and manually verify:
   - All 6 tabs render correctly
   - All dialogs open/close correctly
   - All charts display data
   - Dark mode toggle works
   - Notification badge updates
   - WebSocket status indicator works

2. **Functional verification:**
   - Click every tab and verify data loads
   - Open each dialog and verify content
   - Trigger a search, verify results
   - Click a notification, verify navigation to correct tab
   - Test cost simulation sliders
   - Test supplier add/edit flow
   - Test reorder creation
   - Test CSV export dropdown
   - Test scroll-to-top button
   - Test auto-refresh countdown

3. **Console check:** Verify no new console errors or warnings

### 8.2 Safe Migration Techniques

- **Never extract and modify in the same commit** — Extract first (move code), then refactor (change patterns)
- **Keep old code commented out** temporarily during extraction if needed, remove in cleanup phase
- **Use barrel exports** (`index.ts`) so import paths remain stable
- **Zustand stores are initialized with same defaults** as current `useState` values
- **React Query `staleTime`** matches current refresh behavior (60s auto-refresh)
- **WebSocket events update React Query cache** the same way `useState` setters did — the UI sees the same data shape

### 8.3 Rollback Strategy

Each phase is a **separate git commit**. If a phase breaks functionality:
1. `git revert HEAD` to undo the last commit
2. Fix the issue
3. Re-commit

### 8.4 Type Safety Checklist

After Phase 7, verify:
- [ ] No `any` types in store interfaces (replace with proper types from `types.ts`)
- [ ] All React Query hooks have typed return values
- [ ] All component props have TypeScript interfaces
- [ ] `api.ts` client has typed request/response shapes

### 8.5 Performance Considerations

- **React Query** replaces manual fetch + useState, giving us automatic caching, deduplication, and background refetching
- **Zustand** selectors prevent unnecessary re-renders: use `useStore(s => s.specificField)` not `useStore()`
- **React.memo** on extracted tab components since they only re-render when their tab is active or their data changes
- **Lazy loading** consideration: Wrap tab content in `React.lazy()` + `Suspense` for code splitting (optional enhancement, not part of core refactoring)

---

## 9. Estimated Effort

| Phase | Description | Files Created/Modified | Est. Hours |
|---|---|---|---|
| 0 | Preparation (scaffold) | ~15 new files | 2h |
| 1 | Extract shared components | 6 new + 1 modified | 1.5h |
| 2 | Extract custom hooks | 4 new + 1 modified | 3h |
| 3 | Wire Zustand stores | 9 new + 1 modified | 4h |
| 4 | Wire React Query | 14 new + 1 modified | 5h |
| 5 | Extract tab panels | 20+ new + 1 modified | 8h |
| 6 | Extract layout + dialogs | 14 new + 1 modified | 4h |
| 7 | Final cleanup | 1 modified + type fixes | 2h |
| **Total** | | **~80 files** | **~29.5h** |

---

## 10. Risk Mitigation Matrix

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| State migration breaks UI | Medium | High | Incremental store wiring + visual verification after each |
| React Query cache shape differs from useState | Medium | Medium | Keep same response shapes; add transform in queryFn if needed |
| WebSocket updates stop working | Low | High | useWebSocket uses queryClient.setQueryData to match old behavior |
| Circular imports between stores | Low | Medium | Keep stores domain-isolated; cross-store reads via selectors only |
| Tab components too large still | Medium | Low | Further decompose within feature folders in Phase 5 |
| Dialog props drilling becomes messy | Medium | Medium | Dialogs read their own state from stores, minimal props needed |
| Performance regression | Low | Medium | Zustand selectors + React Query caching should improve performance |

---

## Appendix A: Complete State → Store Mapping

| Current useState | Store | Notes |
|---|---|---|
| `mounted` | `ui-store` | Hydration flag |
| `activeTab` | `ui-store` | Current tab |
| `dashboardData` | **React Query** | `useDashboardQuery()` |
| `inventoryData` | **React Query** | `useInventoryQuery()` |
| `costData` | **React Query** | `useCostQuery()` |
| `logisticsData` | **React Query** | `useLogisticsQuery()` |
| `salesData` | **React Query** | `useSalesQuery()` |
| `searchQuery` | `inventory-store` | Filter state |
| `inventoryFilter` | `inventory-store` | Filter state |
| `selectedProduct` | `cost-store` | Selection state |
| `simulationParams` | `cost-store` | Simulation state |
| `simulationResult` | **React Query** (mutation) | `useCostSimulation()` |
| `selectedInventorySku` | `inventory-store` | Selection state |
| `inventoryDetail` | **React Query** (lazy) | `useInventoryDetail(sku)` |
| `salesForecastSku` | `sales-store` | Selection state |
| `salesForecast` | **React Query** (lazy) | `useSalesForecast(sku)` |
| `isRefreshing` | `ui-store` | Refresh state |
| `refreshCountdown` | `ui-store` | Timer state |
| `lastSyncTime` | `ui-store` | Timestamp |
| `globalSearchOpen` | `ui-store` | Dialog state |
| `globalSearchQuery` | Local component | Only used inside dialog |
| `reorderQty` | `supplier-store` | Form state |
| `reorderWarehouse` | `supplier-store` | Form state |
| `reorderPriority` | `supplier-store` | Form state |
| `notificationOpen` | `ui-store` | Panel state |
| `readNotifications` | `notification-store` | Read tracking |
| `compareOpen` | `ui-store` | Dialog state |
| `compareProducts` | `sales-store` | Selection state |
| `showScrollTop` | `ui-store` | Scroll state |
| `highlightElement` | `ui-store` | Highlight state |
| `alertRules` | **React Query** | `useAlertRulesQuery()` |
| `alertRulesOpen` | `ui-store` | Dialog state |
| `drillDownCategory` | `sales-store` | Selection state |
| `tabTransitioning` | `ui-store` | Animation state |
| `showQuickActions` | `ui-store` | Scroll state |
| `supplyChainEvents` | `connector-store` | WS data |
| `backendNotifications` | `notification-store` | Notification data |
| `supplierData` | **React Query** | `useSupplierQuery()` |
| `supplierFilter` | `supplier-store` | Filter state |
| `supplierRegionFilter` | `supplier-store` | Filter state |
| `expandedSupplier` | `supplier-store` | UI state |
| `addSupplierOpen` | `ui-store` | Dialog state |
| `newSupplier` | `supplier-store` | Form state |
| `selectedSupplier` | `supplier-store` | Selection state |
| `supplierDetailOpen` | `ui-store` | Dialog state |
| `supplierSearchQuery` | `supplier-store` | Filter state |
| `supplierStatusFilter` | `supplier-store` | Filter state |
| `editSupplierOpen` | `ui-store` | Dialog state |
| `editingSupplier` | `supplier-store` | Form state |
| `reorderData` | **React Query** | `useReorderQuery()` |
| `reorderStatusFilter` | `supplier-store` | Filter state |
| `wsConnected` | `connector-store` | Connection state |
| `connectorData` | `connector-store` | MCP data |
| `warehouseCapacityData` | **React Query** | `useWarehouseQuery()` |
| `notesData` | **React Query** | `useNotesQuery()` |
| `unresolvedNotesCount` | Derived from `notesData` | Computed |
| `notesOpen` | `ui-store` | Dialog state |
| `newNoteContent` | Local component | Only used in NotesDialog |
| `newNoteSku` | Local component | Only used in NotesDialog |
| `newNotePriority` | Local component | Only used in NotesDialog |
| `scoreTrendData` | **React Query** | `useStatsQuery('90d')` |
| `inventoryAgingData` | **React Query** | `useWarehouseAgingQuery()` |
| `costVarianceData` | **React Query** | `useCostTrendQuery()` |
| `salesHeatmapData` | **React Query** | `useStatsQuery('30d')` + transform |
| `drillDownProducts` | `sales-store` | Selection state |
| `supplierPerformance` | **React Query** | `useSupplierPerformanceQuery()` |
| `supplierPerfExpanded` | `supplier-store` | UI state |
| `dateRange` | `dashboard-store` | Filter state |
| `stockoutRiskItems` | **React Query** | `useStockoutRiskQuery()` |
| `scrollProgress` | `ui-store` | Scroll state |
| `badgePop` | `ui-store` | Animation state |
| `riskData` | **React Query** | `useRiskQuery()` |
| `simulationData` | **React Query** (conditional) | `useRiskSimulationQuery(scenario)` |
| `selectedScenario` | Local to RiskPanel | Only used in risk feature |
| `procurementData` | **React Query** | `useProcurementQuery()` |
| `budgetData` | **React Query** (lazy) | `useBudgetQuery()` |
| `budgetDialogOpen` | `ui-store` | Dialog state |
| `timelineData` | **React Query** (lazy) | `useTimelineQuery()` |
| `timelineDialogOpen` | `ui-store` | Dialog state |

**Summary:** 50+ `useState` → **9 Zustand stores** (27 state fields) + **14+ React Query hooks** (20 data fields) + **5 local component states** (form fields scoped to single components)

---

## Appendix B: Import Optimization

After refactoring, the massive import block (lines 1–41) will be distributed:

| Import | Target Consumer |
|---|---|
| `socket.io-client` | `hooks/useWebSocket.ts` only |
| `next-themes` | `components/layout/Header.tsx` only |
| `lucide-react` icons | Distributed per component (tree-shakeable) |
| `recharts` | Feature tab components + shared chart components |
| `sonner` | `hooks/useWebSocket.ts` + specific action handlers |
| shadcn/ui components | Distributed per component |
| `@/lib/types` | Stores, queries, components as needed |
| `@/lib/constants` | Components as needed |
| `@/lib/utils` | Dialog components, export handlers |
| `@/lib/mock-data` | Only if needed for fallback |

This dramatically reduces the bundle size of each individual component module.
