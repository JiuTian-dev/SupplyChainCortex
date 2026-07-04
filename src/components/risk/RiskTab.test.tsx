import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ─── Mock risk data ───────────────────────────────────────────────────────────
const mockRiskData = {
  overallRisk: 45,
  riskLevel: 'medium',
  dimensions: [
    { name: '供应风险', score: 35, key: 'supply' },
    { name: '物流风险', score: 55, key: 'logistics' },
    { name: '需求风险', score: 25, key: 'demand' },
    { name: '财务风险', score: 70, key: 'financial' },
  ],
  topRisks: [
    { severity: 'critical', description: '关键供应商交货延迟', dimension: 'supply' },
    { severity: 'high', description: '运费上涨影响毛利', dimension: 'logistics' },
    { severity: 'medium', description: '汇率波动风险', dimension: 'financial' },
  ],
};

const mockSimulationData = {
  scenario: 'supply_disruption',
  scenarioName: '供应中断',
  description: '模拟主要供应商中断 30 天的影响',
  impacts: [
    { dimension: '供应风险', currentScore: 35, simulatedScore: 75, change: 40 },
    { dimension: '物流风险', currentScore: 55, simulatedScore: 65, change: 10 },
  ],
  recommendations: ['增加备选供应商', '提高安全库存水平'],
};

// ─── Mock useRisk hook ────────────────────────────────────────────────────────
const mockUseRisk = vi.fn((action: string) => {
  if (action === 'dashboard') {
    return { data: { data: mockRiskData }, isLoading: false };
  }
  if (action === 'simulation') {
    return { data: { data: mockSimulationData }, isLoading: false };
  }
  return { data: undefined, isLoading: false };
});

vi.mock('@/hooks/use-supply-chain-data', () => ({
  useRisk: (...args: unknown[]) => (mockUseRisk as any)(...args),
}));

// ─── Mock dashboard UI store ──────────────────────────────────────────────────
const mockStore = {
  selectedScenario: '',
  setSelectedScenario: vi.fn(),
};

vi.mock('@/stores/useDashboardUIStore', () => ({
  useDashboardUIStore: vi.fn((selector) => selector ? selector(mockStore) : mockStore),
}));

// ─── Mock shared components ───────────────────────────────────────────────────
vi.mock('@/components/shared/MetricCard', () => ({
  MetricCard: ({ title, value, subtitle, trend }: { title: string; value: number | string; subtitle?: string; trend?: string }) => (
    <div data-testid={`metric-${title}`}>
      {title}: {String(value)} {subtitle || ''} {trend || ''}
    </div>
  ),
}));

vi.mock('@/components/shared/Skeleton', () => ({
  DashboardSkeleton: () => <div data-testid="dashboard-skeleton">Loading...</div>,
}));

// ─── Mock risk sub-components ─────────────────────────────────────────────────
vi.mock('@/components/risk/RiskMatrixHeatmap', () => ({
  RiskMatrixHeatmap: () => <div data-testid="risk-matrix-heatmap">RiskMatrix</div>,
}));

vi.mock('@/components/risk/WeatherRiskWidget', () => ({
  WeatherRiskWidget: () => <div data-testid="weather-risk-widget">WeatherRisk</div>,
}));

vi.mock('@/components/risk/DecisionPanel', () => ({
  DecisionPanel: () => <div data-testid="decision-panel">DecisionPanel</div>,
}));

import { RiskTab } from './RiskTab';

describe('RiskTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.selectedScenario = '';
    mockUseRisk.mockImplementation((action: string) => {
      if (action === 'dashboard') return { data: { data: mockRiskData }, isLoading: false };
      if (action === 'simulation') return { data: { data: mockSimulationData }, isLoading: false };
      return { data: undefined, isLoading: false };
    });
  });

  it('renders loading skeleton when data is loading', () => {
    mockUseRisk.mockReturnValue({ data: undefined, isLoading: true });
    render(<RiskTab />);
    expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument();
  });

  it('renders empty state when no risk data', () => {
    mockUseRisk.mockReturnValue({ data: undefined, isLoading: false });
    render(<RiskTab />);
    expect(screen.getByText('暂无风险数据')).toBeInTheDocument();
  });

  it('renders risk overview metric cards', () => {
    render(<RiskTab />);
    expect(screen.getByTestId('metric-整体风险评分')).toHaveTextContent('整体风险评分');
    expect(screen.getByTestId('metric-风险维度')).toBeInTheDocument();
    expect(screen.getByTestId('metric-高风险项')).toBeInTheDocument();
    expect(screen.getByTestId('metric-模拟场景')).toBeInTheDocument();
  });

  it('renders risk monitoring title and risk level badge', () => {
    render(<RiskTab />);
    expect(screen.getByText('供应链风险监控')).toBeInTheDocument();
    expect(screen.getByText('中风险')).toBeInTheDocument();
  });

  it('renders risk dimension cards with scores', () => {
    render(<RiskTab />);
    expect(screen.getByText('供应风险')).toBeInTheDocument();
    expect(screen.getByText('物流风险')).toBeInTheDocument();
    expect(screen.getByText('需求风险')).toBeInTheDocument();
    expect(screen.getByText('财务风险')).toBeInTheDocument();
  });

  it('renders top risks section with severity badges', () => {
    render(<RiskTab />);
    expect(screen.getByText('主要风险')).toBeInTheDocument();
    expect(screen.getByText('关键供应商交货延迟')).toBeInTheDocument();
    expect(screen.getByText('运费上涨影响毛利')).toBeInTheDocument();
    expect(screen.getByText('汇率波动风险')).toBeInTheDocument();
    // Severity badges: "严重" for critical, "高" for high (also appears as dimension level)
    expect(screen.getByText('严重')).toBeInTheDocument();
    expect(screen.getAllByText('高').length).toBeGreaterThan(0);
  });

  it('renders scenario simulation selector', () => {
    render(<RiskTab />);
    expect(screen.getByText('场景模拟：')).toBeInTheDocument();
    expect(screen.getByText('选择模拟场景...')).toBeInTheDocument();
  });

  it('renders risk matrix heatmap section', () => {
    render(<RiskTab />);
    expect(screen.getByText('风险矩阵')).toBeInTheDocument();
    expect(screen.getByTestId('risk-matrix-heatmap')).toBeInTheDocument();
  });

  it('renders weather risk widget and decision panel', () => {
    render(<RiskTab />);
    expect(screen.getByTestId('weather-risk-widget')).toBeInTheDocument();
    expect(screen.getByTestId('decision-panel')).toBeInTheDocument();
  });

  it('renders risk score gauge with overall risk value', () => {
    render(<RiskTab />);
    // The overall risk score (45) is rendered in the SVG gauge
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('风险评分')).toBeInTheDocument();
  });
});
