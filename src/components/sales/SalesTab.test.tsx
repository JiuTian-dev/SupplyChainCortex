import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ─── Test data ────────────────────────────────────────────────────────────────
const mockSalesData = {
  productSummaries: [
    { sku: 'SKU-001', productName: '冰箱A', category: '厨房电器', totalQuantity: 500, totalRevenue: 150000, avgDailySales: 17, momGrowth: 12, yoyGrowth: 25, topPlatform: '京东' },
    { sku: 'SKU-002', productName: '洗衣机B', category: '清洁电器', totalQuantity: 300, totalRevenue: 90000, avgDailySales: 10, momGrowth: -5, yoyGrowth: 15, topPlatform: '天猫' },
    { sku: 'SKU-003', productName: '空调C', category: '厨房电器', totalQuantity: 200, totalRevenue: 80000, avgDailySales: 7, momGrowth: 8, yoyGrowth: 20, topPlatform: '京东' },
  ],
  platformDistribution: [
    { platform: '京东', revenue: 150000 },
    { platform: '天猫', revenue: 90000 },
    { platform: '拼多多', revenue: 80000 },
  ],
};

// ─── Mock hooks ───────────────────────────────────────────────────────────────
const mockUseSales = vi.fn((action: string) => {
  if (action === 'overview') return { data: { data: mockSalesData }, isLoading: false };
  if (action === 'daily') return { data: { data: { daily: [] } }, isLoading: false };
  if (action === 'anomaly') return { data: { data: { anomalies: [] } }, isLoading: false };
  return { data: undefined, isLoading: false };
});

vi.mock('@/hooks/use-supply-chain-data', () => ({
  useSales: (...args: unknown[]) => (mockUseSales as any)(...args),
  useStats: vi.fn(() => ({ data: null, isLoading: false })),
}));

// ─── Mock dashboard UI store ──────────────────────────────────────────────────
const mockDashboardState = {
  dateRange: '30d',
  setCompareProducts: vi.fn(),
  setCompareOpen: vi.fn(),
};

vi.mock('@/stores/useDashboardUIStore', () => ({
  useDashboardUIStore: Object.assign(
    vi.fn((selector: (_s: typeof mockDashboardState) => unknown) => selector ? selector(mockDashboardState) : mockDashboardState),
    { getState: () => mockDashboardState }
  ),
}));

// ─── Mock shared components ───────────────────────────────────────────────────
vi.mock('@/components/shared/MetricCard', () => ({
  MetricCard: ({ title, value }: { title: string; value: string | number }) => (
    <div data-testid={`metric-${title}`}>{title}: {String(value)}</div>
  ),
}));

vi.mock('@/components/shared/Skeleton', () => ({
  DashboardSkeleton: () => <div data-testid="dashboard-skeleton">Loading...</div>,
}));

vi.mock('@/components/shared/LazyLoader', () => ({
  LazyLoader: () => <div data-testid="lazy-loader">Loading...</div>,
}));

// ─── Mock dynamic imports ─────────────────────────────────────────────────────
vi.mock('@/components/sales/SalesPlatformAnalytics', () => ({
  SalesPlatformAnalytics: () => <div data-testid="sales-platform-analytics">PlatformAnalytics</div>,
}));

vi.mock('@/components/sales/SalesForecastEnhanced', () => ({
  SalesForecastEnhanced: () => <div data-testid="sales-forecast-enhanced">ForecastEnhanced</div>,
}));

// ─── Mock @tanstack/react-virtual ─────────────────────────────────────────────
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(() => ({
    getVirtualItems: () => mockSalesData.productSummaries.map((_, i) => ({
      index: i, start: i * 45, size: 45, key: `virtual-${i}`, lane: 0,
    })),
    getTotalSize: () => mockSalesData.productSummaries.length * 45,
    measure: vi.fn(),
  })),
}));

// ─── Mock recharts ResponsiveContainer ────────────────────────────────────────
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

// ─── Mock exportToCSV ─────────────────────────────────────────────────────────
vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils');
  return {
    ...actual,
    exportToCSV: vi.fn(),
  };
});

import { SalesTab } from './SalesTab';

describe('SalesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock implementation after clearAllMocks
    mockUseSales.mockImplementation((action: string) => {
      if (action === 'overview') return { data: { data: mockSalesData }, isLoading: false };
      if (action === 'daily') return { data: { data: { daily: [] } }, isLoading: false };
      if (action === 'anomaly') return { data: { data: { anomalies: [] } }, isLoading: false };
      return { data: undefined, isLoading: false };
    });
  });

  it('renders loading skeleton when data is loading', () => {
    mockUseSales.mockReturnValue({ data: undefined, isLoading: true });
    render(<SalesTab />);
    expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument();
  });

  it('renders sales overview metric cards', () => {
    render(<SalesTab />);
    expect(screen.getByTestId('metric-总销量(30天)')).toHaveTextContent('总销量(30天)');
    expect(screen.getByTestId('metric-总收入(30天)')).toBeInTheDocument();
    expect(screen.getByTestId('metric-平均日销')).toBeInTheDocument();
    expect(screen.getByTestId('metric-同比增长')).toBeInTheDocument();
  });

  it('renders platform sales distribution chart title', () => {
    render(<SalesTab />);
    expect(screen.getByText('平台销售分布')).toBeInTheDocument();
  });

  it('renders product sales ranking chart title', () => {
    render(<SalesTab />);
    expect(screen.getByText('产品销售额排名 (Top 8)')).toBeInTheDocument();
  });

  it('renders sales calendar heatmap title', () => {
    render(<SalesTab />);
    expect(screen.getByText('销售日历热力图')).toBeInTheDocument();
    expect(screen.getByText('近 4 周每日销售强度分布')).toBeInTheDocument();
  });

  it('renders product sales detail table with title', () => {
    render(<SalesTab />);
    expect(screen.getByText('产品销售明细')).toBeInTheDocument();
  });

  it('renders product sales detail table with SKU and product names', () => {
    render(<SalesTab />);
    expect(screen.getByText('SKU-001')).toBeInTheDocument();
    expect(screen.getByText('冰箱A')).toBeInTheDocument();
    expect(screen.getByText('SKU-002')).toBeInTheDocument();
    expect(screen.getByText('洗衣机B')).toBeInTheDocument();
    expect(screen.getByText('SKU-003')).toBeInTheDocument();
    expect(screen.getByText('空调C')).toBeInTheDocument();
  });

  it('renders export CSV and product compare buttons', () => {
    render(<SalesTab />);
    expect(screen.getByText('导出 CSV')).toBeInTheDocument();
    expect(screen.getByText('产品对比')).toBeInTheDocument();
  });

  it('renders virtual scroll toggle button', () => {
    render(<SalesTab />);
    expect(screen.getByText('虚拟滚动')).toBeInTheDocument();
  });

  it('renders sales anomaly detection section', () => {
    render(<SalesTab />);
    // When no anomalies, shows "未检测到销售异常"
    expect(screen.getByText('未检测到销售异常')).toBeInTheDocument();
  });

  it('renders dynamic child components (platform analytics, forecast)', () => {
    render(<SalesTab />);
    expect(screen.getByTestId('sales-platform-analytics')).toBeInTheDocument();
    expect(screen.getByTestId('sales-forecast-enhanced')).toBeInTheDocument();
  });
});
