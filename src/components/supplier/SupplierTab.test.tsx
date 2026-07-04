import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Supplier } from '@prisma/client';

// ─── Test data ────────────────────────────────────────────────────────────────
const mockSuppliers: Supplier[] = [
  {
    id: 's1', tenantId: 'default', code: 'SUP-001', name: '华东电子',
    contact: '张三', email: 'zhangsan@example.com', phone: '13800000001',
    region: '华东', category: '电子元件', leadTime: 14, rating: 4.5,
    ratingDetails: null, status: 'active',
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
  },
  {
    id: 's2', tenantId: 'default', code: 'SUP-002', name: '华南塑料',
    contact: '李四', email: 'lisi@example.com', phone: '13800000002',
    region: '华南', category: '原材料', leadTime: 21, rating: 3.8,
    ratingDetails: null, status: 'suspended',
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
  },
  {
    id: 's3', tenantId: 'default', code: 'SUP-003', name: '华北机械',
    contact: '王五', email: 'wangwu@example.com', phone: '13800000003',
    region: '华北', category: '机械部件', leadTime: 30, rating: 4.2,
    ratingDetails: null, status: 'active',
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
  },
];

// ─── Mock supply chain data hooks ─────────────────────────────────────────────
vi.mock('@/hooks/use-supply-chain-data', () => ({
  useSuppliers: vi.fn(() => ({ data: { suppliers: mockSuppliers }, isLoading: false })),
  useReorder: vi.fn(() => ({ data: { orders: [] } })),
  useAnalytics: vi.fn(() => ({ data: null })),
  useWarehouse: vi.fn(() => ({ data: null })),
}));

// ─── Mock supplier graph hooks ────────────────────────────────────────────────
vi.mock('@/hooks/use-supplier-graph', () => ({
  useSupplierNetwork: vi.fn(() => ({ data: null, isLoading: false })),
  useChokepoints: vi.fn(() => ({ data: null, isLoading: false })),
}));

// ─── Mock batch selection hook ────────────────────────────────────────────────
vi.mock('@/hooks/use-batch-selection', () => ({
  useBatchSelection: vi.fn(() => ({
    selectedIds: new Set<string>(),
    toggleAll: vi.fn(),
    toggle: vi.fn(),
    isAllSelected: false,
    isIndeterminate: false,
    clear: vi.fn(),
  })),
}));

// ─── Mock supplier UI store ───────────────────────────────────────────────────
const mockStore = {
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
  setSupplierFilter: vi.fn(),
  setSupplierRegionFilter: vi.fn(),
  setExpandedSupplier: vi.fn(),
  setAddSupplierOpen: vi.fn(),
  setNewSupplier: vi.fn(),
  setSelectedSupplier: vi.fn(),
  setSupplierDetailOpen: vi.fn(),
  setSupplierSearchQuery: vi.fn(),
  setSupplierStatusFilter: vi.fn(),
  setEditSupplierOpen: vi.fn(),
  setEditingSupplier: vi.fn(),
};

vi.mock('@/stores/useSupplierUIStore', () => ({
  useSupplierUIStore: vi.fn(() => mockStore),
}));

// ─── Mock shared components ───────────────────────────────────────────────────
vi.mock('@/components/shared/MetricCard', () => ({
  MetricCard: ({ title, value }: { title: string; value: string }) => (
    <div data-testid={`metric-${title}`}>{title}: {value}</div>
  ),
}));

vi.mock('@/components/shared/Skeleton', () => ({
  DashboardSkeleton: () => <div data-testid="dashboard-skeleton">Loading...</div>,
}));

vi.mock('@/components/shared/ExportMenu', () => ({
  ExportMenu: ({ label }: { label: string }) => (
    <button data-testid="export-menu">{label || '导出'}</button>
  ),
}));

vi.mock('@/components/shared/BatchActionsToolbar', () => ({
  BatchActionsToolbar: () => <div data-testid="batch-actions-toolbar">BatchActions</div>,
}));

vi.mock('@/components/shared/LazyLoader', () => ({
  LazyLoader: () => <div data-testid="lazy-loader">Loading...</div>,
}));

vi.mock('@/components/shared/VirtualList', () => ({
  VirtualTableList: () => <div data-testid="virtual-table-list">VirtualTable</div>,
}));

// ─── Mock supplier sub-components ─────────────────────────────────────────────
vi.mock('./SupplierPerformancePanel', () => ({
  SupplierPerformancePanel: () => <div data-testid="supplier-performance">Performance</div>,
}));

vi.mock('./SupplierComparisonPanel', () => ({
  SupplierComparisonPanel: () => <div data-testid="supplier-comparison">Comparison</div>,
}));

vi.mock('./SupplierAnalyticsPanel', () => ({
  SupplierAnalyticsPanel: () => <div data-testid="supplier-analytics">Analytics</div>,
}));

vi.mock('./SupplierNetworkGraph', () => ({
  SupplierNetworkGraph: () => <div data-testid="supplier-network-graph">NetworkGraph</div>,
}));

vi.mock('./SupplierChokepointAlerts', () => ({
  SupplierChokepointAlerts: () => <div data-testid="supplier-chokepoint-alerts">Chokepoints</div>,
}));

vi.mock('./SupplierDetailDialog', () => ({
  SupplierDetailDialog: () => <div data-testid="supplier-detail-dialog">DetailDialog</div>,
}));

vi.mock('./SupplierRatingDialog', () => ({
  SupplierRatingDialog: () => <div data-testid="supplier-rating-dialog">RatingDialog</div>,
}));

vi.mock('./SupplierReorderOrders', () => ({
  SupplierReorderOrders: () => <div data-testid="supplier-reorder-orders">ReorderOrders</div>,
}));

vi.mock('./SupplierGeoMap', () => ({
  SupplierGeoMap: () => <div data-testid="supplier-geo-map">GeoMap</div>,
}));

// ─── Mock SupplierTab.helpers ─────────────────────────────────────────────────
vi.mock('./SupplierTab.helpers', () => ({
  CHART_TOOLTIP_STYLE: {},
  StarRating: ({ rating }: { rating: number }) => (
    <div data-testid={`star-rating-${rating}`}>★{rating}</div>
  ),
  SupplierForm: () => <div data-testid="supplier-form">Form</div>,
}));

// ─── Mock batch export service ────────────────────────────────────────────────
vi.mock('@/lib/services/batch-export.service', () => ({
  exportToCSV: vi.fn(),
}));

// ─── Mock sonner toast ────────────────────────────────────────────────────────
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ─── Mock react-query ─────────────────────────────────────────────────────────
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

import { SupplierTab } from './SupplierTab';

describe('SupplierTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store to default
    mockStore.supplierSearchQuery = '';
    mockStore.supplierFilter = 'all';
    mockStore.supplierRegionFilter = 'all';
    mockStore.supplierStatusFilter = 'all';
  });

  it('renders supplier overview metric cards', () => {
    render(<SupplierTab />);
    expect(screen.getByTestId('metric-供应商总数')).toHaveTextContent('供应商总数: 3');
    expect(screen.getByTestId('metric-活跃供应商')).toHaveTextContent('活跃供应商: 2');
    expect(screen.getByTestId('metric-平均交货期')).toBeInTheDocument();
    expect(screen.getByTestId('metric-平均评分')).toBeInTheDocument();
  });

  it('renders supplier list card with title and count badge', () => {
    render(<SupplierTab />);
    expect(screen.getByText('供应商列表')).toBeInTheDocument();
    expect(screen.getByText('3 家')).toBeInTheDocument();
  });

  it('renders supplier cards with names and codes', () => {
    render(<SupplierTab />);
    expect(screen.getByText('华东电子')).toBeInTheDocument();
    expect(screen.getByText('SUP-001')).toBeInTheDocument();
    expect(screen.getByText('华南塑料')).toBeInTheDocument();
    expect(screen.getByText('SUP-002')).toBeInTheDocument();
    expect(screen.getByText('华北机械')).toBeInTheDocument();
    expect(screen.getByText('SUP-003')).toBeInTheDocument();
  });

  it('renders supplier status badges', () => {
    render(<SupplierTab />);
    // 2 active + 1 suspended
    expect(screen.getAllByText('活跃').length).toBeGreaterThan(0);
    expect(screen.getByText('暂停')).toBeInTheDocument();
  });

  it('renders filter controls (region, category, status, search)', () => {
    render(<SupplierTab />);
    expect(screen.getByText('全部地区')).toBeInTheDocument();
    expect(screen.getByText('全部品类')).toBeInTheDocument();
    expect(screen.getByText('全部状态')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索供应商编码/名称/地区...')).toBeInTheDocument();
  });

  it('renders add supplier button', () => {
    render(<SupplierTab />);
    expect(screen.getByText('添加供应商')).toBeInTheDocument();
  });

  it('filters suppliers by search query', async () => {
    const user = userEvent.setup();
    render(<SupplierTab />);
    const searchInput = screen.getByPlaceholderText('搜索供应商编码/名称/地区...');
    await user.type(searchInput, '华东');
    // userEvent.type types character by character: '华' then '东'
    expect(mockStore.setSupplierSearchQuery).toHaveBeenCalledWith('华');
    expect(mockStore.setSupplierSearchQuery).toHaveBeenCalledWith('东');
    expect(mockStore.setSupplierSearchQuery).toHaveBeenCalledTimes(2);
  });

  it('renders virtual/pagination toggle button', () => {
    render(<SupplierTab />);
    expect(screen.getByTitle('切换到普通模式')).toBeInTheDocument();
  });

  it('renders sub-components (performance, comparison, analytics, geo map)', () => {
    render(<SupplierTab />);
    expect(screen.getByTestId('supplier-performance')).toBeInTheDocument();
    expect(screen.getByTestId('supplier-comparison')).toBeInTheDocument();
    expect(screen.getByTestId('supplier-analytics')).toBeInTheDocument();
    expect(screen.getByTestId('supplier-geo-map')).toBeInTheDocument();
  });

  it('renders graph intelligence panels (network graph, chokepoint alerts)', () => {
    render(<SupplierTab />);
    expect(screen.getByTestId('supplier-network-graph')).toBeInTheDocument();
    expect(screen.getByTestId('supplier-chokepoint-alerts')).toBeInTheDocument();
  });

  it('renders supplier lead time info in cards', () => {
    render(<SupplierTab />);
    expect(screen.getByText('交货期 14天')).toBeInTheDocument();
    expect(screen.getByText('交货期 21天')).toBeInTheDocument();
    expect(screen.getByText('交货期 30天')).toBeInTheDocument();
  });
});
