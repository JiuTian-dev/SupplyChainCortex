import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CostRecord } from '@prisma/client';

// ─── Test data ────────────────────────────────────────────────────────────────
const mockCosts: CostRecord[] = [
  {
    id: 'c1', tenantId: 'default', productId: 'p1', sku: 'SKU-001',
    productName: '冰箱A', rawMaterial: 100, labor: 50, logistics: 30,
    tariff: 20, platformFee: 10, exchangeRate: 7.25, destination: 'US',
    totalLanded: 210, sellingPrice: 350, grossMargin: 40,
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
  },
  {
    id: 'c2', tenantId: 'default', productId: 'p2', sku: 'SKU-002',
    productName: '洗衣机B', rawMaterial: 80, labor: 40, logistics: 25,
    tariff: 15, platformFee: 8, exchangeRate: 7.25, destination: 'US',
    totalLanded: 168, sellingPrice: 300, grossMargin: 44,
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
  },
  {
    id: 'c3', tenantId: 'default', productId: 'p3', sku: 'SKU-003',
    productName: '空调C', rawMaterial: 120, labor: 60, logistics: 35,
    tariff: 25, platformFee: 12, exchangeRate: 7.25, destination: 'US',
    totalLanded: 252, sellingPrice: 400, grossMargin: 37,
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
  },
];

// ─── Mock hooks ───────────────────────────────────────────────────────────────
const mockUseCost = vi.fn((action: string) => ({
  data: action === 'list'
    ? { data: { costs: mockCosts } }
    : { trends: [] },
  isLoading: false,
}));

vi.mock('@/hooks/use-supply-chain-data', () => ({
  useCost: (...args: unknown[]) => (mockUseCost as any)(...args),
}));

vi.mock('@/hooks/useSkuFilter', () => ({
  useSkuFilter: vi.fn(() => ({
    selectedSkus: [],
    updateSkus: vi.fn(),
    filterParams: {},
  })),
}));

vi.mock('@/hooks/use-exchange-rate', () => ({
  useExchangeRate: vi.fn(() => ({
    rate: { rate: 7.25 },
    liveRate: null,
    source: 'static',
    isLoading: false,
  })),
}));

// ─── Mock stores ──────────────────────────────────────────────────────────────
vi.mock('@/stores/useInventoryUIStore', () => ({
  useInventoryUIStore: vi.fn((selector) => {
    const state = {
      selectedProduct: '',
      setSelectedProduct: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/stores/dashboard-config-store', () => ({
  useDashboardConfigStore: vi.fn((selector) => {
    const state = {
      config: { currency: 'CNY', currencyRate: 7.25, riskThresholds: {}, timeHorizon: '30d', panels: [], layout: [] },
      setConfig: vi.fn(),
      setCurrency: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

// ─── Mock shared components ───────────────────────────────────────────────────
vi.mock('@/components/shared/ProductFilter', () => ({
  ProductFilter: () => <div data-testid="product-filter">ProductFilter</div>,
}));

vi.mock('@/components/shared/FilterChips', () => ({
  FilterChips: () => <div data-testid="filter-chips">FilterChips</div>,
}));

vi.mock('@/components/shared/ExportMenu', () => ({
  ExportMenu: ({ label }: { label: string }) => (
    <button data-testid="export-menu">{label || '导出'}</button>
  ),
}));

vi.mock('@/components/shared/Skeleton', () => ({
  DashboardSkeleton: () => <div data-testid="dashboard-skeleton">Loading...</div>,
}));

vi.mock('@/components/shared/LazyLoader', () => ({
  LazyLoader: ({ type }: { type: string }) => <div data-testid={`lazy-${type}`}>Loading...</div>,
}));

// ─── Mock dynamic imports ─────────────────────────────────────────────────────
vi.mock('@/components/cost/CostImpactHeatmap', () => ({
  CostImpactHeatmap: () => <div data-testid="cost-impact-heatmap">Heatmap</div>,
}));

vi.mock('@/components/cost/CostSimulatorEnhanced', () => ({
  CostSimulatorEnhanced: () => <div data-testid="cost-simulator">Simulator</div>,
}));

vi.mock('@/components/cost/ExchangeRateMatrix', () => ({
  ExchangeRateMatrix: () => <div data-testid="exchange-rate-matrix">ExchangeRate</div>,
}));

vi.mock('@/components/cost/CostOptimizationPanel', () => ({
  CostOptimizationPanel: () => <div data-testid="cost-optimization">Optimization</div>,
}));

// ─── Mock CostTab.helpers ─────────────────────────────────────────────────────
vi.mock('./CostTab.helpers', () => ({
  CHART_TOOLTIP_STYLE: {},
  CostBreakdownChart: ({ sku }: { sku: string }) => <div data-testid="cost-breakdown-chart">Chart for {sku}</div>,
  CommodityBanner: () => <div data-testid="commodity-banner">Commodity</div>,
  FreightBanner: () => <div data-testid="freight-banner">Freight</div>,
}));

// ─── Mock recharts ResponsiveContainer ────────────────────────────────────────
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 400, height: 200 }}>{children}</div>
    ),
  };
});

// ─── Mock fetch for commodity/freight ─────────────────────────────────────────
const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
vi.stubGlobal('fetch', mockFetch);

import { CostTab } from './CostTab';

describe('CostTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  it('renders loading skeleton when data is loading', () => {
    mockUseCost.mockReturnValue({ data: undefined as any, isLoading: true });
    render(<CostTab />);
    expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument();
    // Restore default mock
    mockUseCost.mockImplementation((action: string) => ({
      data: action === 'list'
        ? { data: { costs: mockCosts } }
        : { trends: [] },
      isLoading: false,
    }));
  });

  it('renders KPI summary bar with average landed cost, gross margin, and warnings', async () => {
    render(<CostTab />);
    // 平均到岸成本 = (210+168+252)/3 = 210.00
    expect(screen.getByText('平均到岸成本')).toBeInTheDocument();
    expect(screen.getByText('¥210.00')).toBeInTheDocument();
    // 平均毛利率 = (40+44+37)/3 = 40.3%
    expect(screen.getByText('平均毛利率')).toBeInTheDocument();
    expect(screen.getByText('40.3%')).toBeInTheDocument();
    // 成本预警 = all 3 have grossMargin < 48
    expect(screen.getByText('成本预警')).toBeInTheDocument();
  });

  it('renders quick navigation links', () => {
    render(<CostTab />);
    expect(screen.getByText('成本追踪')).toBeInTheDocument();
    expect(screen.getByText('利润模拟')).toBeInTheDocument();
    // "成本明细" appears in both the quick-nav link and the card title
    expect(screen.getAllByText('成本明细').length).toBeGreaterThan(0);
  });

  it('renders cost detail table with SKU and product names', () => {
    render(<CostTab />);
    // "成本明细" appears in both the quick-nav link and the card title
    expect(screen.getAllByText('成本明细').length).toBeGreaterThan(0);
    expect(screen.getByText('SKU-001')).toBeInTheDocument();
    expect(screen.getByText('冰箱A')).toBeInTheDocument();
    expect(screen.getByText('SKU-002')).toBeInTheDocument();
    expect(screen.getByText('洗衣机B')).toBeInTheDocument();
    expect(screen.getByText('SKU-003')).toBeInTheDocument();
    expect(screen.getByText('空调C')).toBeInTheDocument();
  });

  it('renders cost detail table with total landed cost values', () => {
    render(<CostTab />);
    expect(screen.getByText('$210.00')).toBeInTheDocument();
    expect(screen.getByText('$168.00')).toBeInTheDocument();
    expect(screen.getByText('$252.00')).toBeInTheDocument();
  });

  it('renders gross margin values in the cost detail table', () => {
    render(<CostTab />);
    // 40%, 44%, 37% are the gross margins for the 3 products
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('44%')).toBeInTheDocument();
    expect(screen.getByText('37%')).toBeInTheDocument();
  });

  it('renders cost structure analysis section with product selector placeholder', () => {
    render(<CostTab />);
    expect(screen.getByText('成本结构分析')).toBeInTheDocument();
    expect(screen.getByText('选择产品查看成本结构')).toBeInTheDocument();
  });

  it('renders cost tracking section with title', () => {
    render(<CostTab />);
    expect(screen.getByText('成本变动追踪')).toBeInTheDocument();
  });

  it('renders dynamic child components (heatmap, simulator, exchange rate matrix)', () => {
    render(<CostTab />);
    expect(screen.getByTestId('cost-impact-heatmap')).toBeInTheDocument();
    expect(screen.getByTestId('cost-simulator')).toBeInTheDocument();
    expect(screen.getByTestId('exchange-rate-matrix')).toBeInTheDocument();
  });

  it('renders product filter and filter chips in sticky header', () => {
    render(<CostTab />);
    expect(screen.getByTestId('product-filter')).toBeInTheDocument();
    expect(screen.getByTestId('filter-chips')).toBeInTheDocument();
  });

  it('renders external factor sensitivity matrix title (collapsed by default)', () => {
    render(<CostTab />);
    // The title is always visible in the CollapsibleTrigger
    expect(screen.getByText('外部因素敏感度矩阵')).toBeInTheDocument();
  });

  it('renders cost optimization suggestions section', () => {
    render(<CostTab />);
    expect(screen.getByText(/成本优化建议/)).toBeInTheDocument();
  });
});
