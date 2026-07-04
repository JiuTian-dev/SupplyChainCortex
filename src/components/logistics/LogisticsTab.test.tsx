import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Test data ────────────────────────────────────────────────────────────────
const mockShipments = [
  {
    id: 'sh1', tenantId: 'default', trackingNumber: 'TRK-001',
    sku: 'SKU-001', productName: '冰箱A',
    origin: '深圳', destination: 'Los Angeles',
    carrier: 'DHL', status: 'in_transit',
    eta: new Date('2026-07-01'), delayDays: 0,
    riskLevel: 'low', events: [
      { description: '已发货', location: '深圳', eventTime: '2026-06-15T08:00:00Z' },
      { description: '到达中转港', location: '洛杉矶港', eventTime: '2026-06-17T12:00:00Z' },
    ],
    createdAt: new Date('2026-06-15'), updatedAt: new Date('2026-06-17'),
  },
  {
    id: 'sh2', tenantId: 'default', trackingNumber: 'TRK-002',
    sku: 'SKU-002', productName: '洗衣机B',
    origin: '上海', destination: 'London',
    carrier: 'FedEx', status: 'delayed',
    eta: new Date('2026-06-25'), delayDays: 3,
    riskLevel: 'high', events: [
      { description: '已发货', location: '上海', eventTime: '2026-06-10T08:00:00Z' },
      { description: '海关查验中', location: '伦敦', eventTime: '2026-06-18T10:00:00Z' },
    ],
    createdAt: new Date('2026-06-10'), updatedAt: new Date('2026-06-18'),
  },
  {
    id: 'sh3', tenantId: 'default', trackingNumber: 'TRK-003',
    sku: 'SKU-003', productName: '空调C',
    origin: '佛山', destination: 'Tokyo',
    carrier: 'UPS', status: 'delivered',
    eta: new Date('2026-06-10'), delayDays: 0,
    riskLevel: 'low', events: [
      { description: '已签收', location: '东京', eventTime: '2026-06-09T15:00:00Z' },
    ],
    createdAt: new Date('2026-05-20'), updatedAt: new Date('2026-06-09'),
  },
];

const mockRiskData = {
  risks: [
    { type: '港口拥堵', severity: 'high', affectedRoutes: ['深圳→洛杉矶'] },
    { type: '海关延误', severity: 'medium', affectedRoutes: ['上海→伦敦'] },
  ],
};

// ─── Mock useLogistics hook ───────────────────────────────────────────────────
const mockUseLogistics = vi.fn((action: string) => {
  if (action === 'list') return { data: { data: { shipments: mockShipments } }, isLoading: false };
  if (action === 'risk') return { data: { data: mockRiskData }, isLoading: false };
  return { data: undefined, isLoading: false };
});

vi.mock('@/hooks/use-supply-chain-data', () => ({
  useLogistics: (...args: unknown[]) => (mockUseLogistics as any)(...args),
}));

// ─── Mock useSkuFilter hook ───────────────────────────────────────────────────
const mockUpdateSkus = vi.fn();
vi.mock('@/hooks/useSkuFilter', () => ({
  useSkuFilter: () => ({
    selectedSkus: [],
    updateSkus: mockUpdateSkus,
    filterParams: {},
  }),
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

vi.mock('@/components/shared/VirtualList', () => ({
  VirtualList: ({ items, renderItem, emptyMessage }: {
    items: unknown[]; renderItem: (_item: unknown, _index: number) => React.ReactNode; emptyMessage?: string;
  }) => {
    if (!items || items.length === 0) {
      return <div data-testid="virtual-list-empty">{emptyMessage || '暂无数据'}</div>;
    }
    return (
      <div data-testid="virtual-list">
        {items.map((item, idx) => (
          <div key={idx} data-testid={`virtual-item-${idx}`}>{renderItem(item, idx)}</div>
        ))}
      </div>
    );
  },
}));

vi.mock('@/components/shared/ProductFilter', () => ({
  ProductFilter: ({ onChange }: { onChange: (_skus: string[]) => void }) => (
    <div data-testid="product-filter">
      <button onClick={() => onChange(['SKU-001'])}>Filter</button>
    </div>
  ),
}));

vi.mock('@/components/shared/FilterChips', () => ({
  FilterChips: ({ selected }: { selected: string[] }) => (
    <div data-testid="filter-chips">Chips: {selected.length}</div>
  ),
}));

// ─── Mock logistics sub-components ────────────────────────────────────────────
vi.mock('./ShipmentRouteMap', () => ({
  ShipmentRouteMap: () => <div data-testid="shipment-route-map">RouteMap</div>,
}));

vi.mock('./ShipmentStatusUpdateDialog', () => ({
  ShipmentStatusUpdateDialog: ({ open, shipment }: {
    open: boolean; shipment: { trackingNumber?: string } | null;
  }) => (
    <div data-testid="shipment-status-dialog" data-open={String(open)}>
      Dialog: {shipment?.trackingNumber || 'none'}
    </div>
  ),
}));

// ─── Mock exportToCSV ─────────────────────────────────────────────────────────
vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils');
  return {
    ...actual,
    exportToCSV: vi.fn(),
  };
});

import { LogisticsTab } from './LogisticsTab';

describe('LogisticsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLogistics.mockImplementation((action: string) => {
      if (action === 'list') return { data: { data: { shipments: mockShipments } }, isLoading: false };
      if (action === 'risk') return { data: { data: mockRiskData }, isLoading: false };
      return { data: undefined, isLoading: false };
    });
  });

  it('renders loading skeleton when data is loading', () => {
    mockUseLogistics.mockReturnValue({ data: undefined, isLoading: true });
    render(<LogisticsTab />);
    expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument();
  });

  it('renders logistics route map card with title', () => {
    render(<LogisticsTab />);
    expect(screen.getByText('物流路线图')).toBeInTheDocument();
    expect(screen.getByText('全球货运路线可视化')).toBeInTheDocument();
    expect(screen.getByTestId('shipment-route-map')).toBeInTheDocument();
  });

  it('renders overview metric cards with correct counts', () => {
    render(<LogisticsTab />);
    expect(screen.getByTestId('metric-总货运数')).toHaveTextContent('总货运数: 3');
    expect(screen.getByTestId('metric-运输中')).toHaveTextContent('运输中: 1');
    expect(screen.getByTestId('metric-延误/异常')).toHaveTextContent('延误/异常: 1');
    expect(screen.getByTestId('metric-已送达')).toHaveTextContent('已送达: 1');
  });

  it('renders shipment tracking list with title and count badge', () => {
    render(<LogisticsTab />);
    expect(screen.getByText('货运追踪')).toBeInTheDocument();
    expect(screen.getByText('3 批次')).toBeInTheDocument();
  });

  it('renders shipment cards with tracking numbers and product names', () => {
    render(<LogisticsTab />);
    // Tracking numbers appear in both shipment card and arrival prediction section
    expect(screen.getAllByText('TRK-001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TRK-002').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TRK-003').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/冰箱A/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/洗衣机B/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/空调C/).length).toBeGreaterThan(0);
  });

  it('renders shipment status badges', () => {
    render(<LogisticsTab />);
    expect(screen.getAllByText('运输中').length).toBeGreaterThan(0);
    expect(screen.getAllByText('延误').length).toBeGreaterThan(0);
    expect(screen.getAllByText('已送达').length).toBeGreaterThan(0);
  });

  it('renders delay badge for delayed shipments', () => {
    render(<LogisticsTab />);
    expect(screen.getByText('延误 3 天')).toBeInTheDocument();
  });

  it('renders route info for shipments', () => {
    render(<LogisticsTab />);
    // Route info appears in shipment card, risk card, and arrival prediction section
    expect(screen.getAllByText(/深圳/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Los Angeles/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/上海/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/London/).length).toBeGreaterThan(0);
  });

  it('renders carrier info for shipments', () => {
    render(<LogisticsTab />);
    expect(screen.getByText('DHL')).toBeInTheDocument();
    expect(screen.getByText('FedEx')).toBeInTheDocument();
    expect(screen.getByText('UPS')).toBeInTheDocument();
  });

  it('renders update status button for each shipment', () => {
    render(<LogisticsTab />);
    const updateButtons = screen.getAllByText('更新状态');
    expect(updateButtons.length).toBe(3);
  });

  it('opens status update dialog when clicking update status button', async () => {
    const user = userEvent.setup();
    render(<LogisticsTab />);
    const updateButtons = screen.getAllByText('更新状态');
    await user.click(updateButtons[0]);
    const dialog = screen.getByTestId('shipment-status-dialog');
    expect(dialog).toHaveAttribute('data-open', 'true');
    expect(dialog).toHaveTextContent('TRK-001');
  });

  it('renders logistics risk card with risk warnings', () => {
    render(<LogisticsTab />);
    expect(screen.getByText('物流风险预警')).toBeInTheDocument();
    expect(screen.getByText('港口拥堵')).toBeInTheDocument();
    expect(screen.getByText('海关延误')).toBeInTheDocument();
  });

  it('renders high risk count badge when high/critical risks exist', () => {
    render(<LogisticsTab />);
    expect(screen.getByText('1 项高危')).toBeInTheDocument();
  });

  it('renders export CSV button', () => {
    render(<LogisticsTab />);
    expect(screen.getByText('导出 CSV')).toBeInTheDocument();
  });

  it('renders arrival prediction analysis section', () => {
    render(<LogisticsTab />);
    expect(screen.getByText('到货预测分析')).toBeInTheDocument();
    expect(screen.getByText('AI 预测')).toBeInTheDocument();
  });

  it('renders prediction summary stats', () => {
    render(<LogisticsTab />);
    expect(screen.getByText('预计3日内到货')).toBeInTheDocument();
    expect(screen.getByText('延误风险')).toBeInTheDocument();
    expect(screen.getByText('平均置信度')).toBeInTheDocument();
  });

  it('renders product filter and filter chips', () => {
    render(<LogisticsTab />);
    expect(screen.getByTestId('product-filter')).toBeInTheDocument();
    expect(screen.getByTestId('filter-chips')).toBeInTheDocument();
  });
});
