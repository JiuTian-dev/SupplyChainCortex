import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Mock fetch ───────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── Mock useCascadeRiskSummary hook ──────────────────────────────────────────
vi.mock('@/hooks/use-cascade-risk', () => ({
  useCascadeRiskSummary: vi.fn(() => ({
    isLoading: false,
    affectedNodes: 0,
    totalNodes: 39,
    totalMonthlyLoss: 0,
    maxDepth: 0,
    sourceNodes: [],
    propagation: [],
  })),
}));

// ─── Mock dashboard config store ──────────────────────────────────────────────
const mockConfig = {
  currency: 'CNY',
  currencyRate: 1,
  riskThresholds: { medium: 40, high: 70 },
  unit: 'piece',
  timeHorizon: '30d',
  panels: [],
  layout: [],
};
vi.mock('@/stores/dashboard-config-store', () => ({
  useDashboardConfigStore: vi.fn((selector: (_s: { config: typeof mockConfig }) => unknown) =>
    selector ? selector({ config: mockConfig }) : { config: mockConfig }
  ),
}));

// ─── Mock metrics formatter ───────────────────────────────────────────────────
vi.mock('@/lib/dashboard/metrics', () => ({
  createMetricsFormatter: () => ({
    config: mockConfig,
    formatCurrency: (n: number) => `¥${n.toLocaleString()}`,
    convertCurrency: (n: number) => n,
    formatRiskLevel: (_s: number) => ({ label: '中', color: '#f59e0b', level: 'medium' }),
    getRiskColor: () => '#f59e0b',
  }),
}));

// ─── Mock sonner toast ────────────────────────────────────────────────────────
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { DecisionCenter } from './DecisionCenter';

// ─── Test data ────────────────────────────────────────────────────────────────
const mockDecisionGraphResponse = {
  success: true,
  decisions: [
    {
      nodeId: 'dec-1',
      question: '立即补货冰箱A',
      outcome: {
        urgency: 'immediate',
        action: '建议立即向华东电子下达 500 件补货订单',
        reasoning: '库存仅剩 5 天用量，且供应商交货期 14 天',
        confidence: 0.92,
        impact: { timeline: '2周内', estimatedSaving: 50000 },
      },
      matchedCondition: 'low_stock',
      riskContext: { sourceNode: '冰箱A' },
    },
    {
      nodeId: 'dec-2',
      question: '调整物流路线',
      outcome: {
        urgency: 'this_week',
        action: '将深圳→洛杉矶货运切换为上海→洛杉矶',
        reasoning: '深圳港口拥堵，上海港效率更高',
        confidence: 0.78,
        impact: { timeline: '1周内', estimatedSaving: 12000 },
      },
      matchedCondition: 'logistics_delay',
      riskContext: { sourceNode: '物流' },
    },
    {
      nodeId: 'dec-3',
      question: '评估新供应商',
      outcome: {
        urgency: 'this_month',
        action: '评估华南塑料作为备选供应商',
        reasoning: '当前供应商集中度高，需分散风险',
        confidence: 0.65,
        impact: { timeline: '1个月内', estimatedSaving: 8000 },
      },
      matchedCondition: 'supplier_concentration',
      riskContext: { sourceNode: '供应商' },
    },
  ],
};

const mockCascadeRiskResponse = {
  passport: { auditId: 'audit-1234567890abcdef', confidence: 0.85 },
  propagation: [],
  summary: { topAffectedProducts: [], affectedNodes: 0 },
};

const mockAgentMemoryResponse = {
  shared: {
    cascadeRisk: { affectedNodes: 5 },
    sandbox: { resilienceScore: 78 },
  },
};

const mockFeedbackStatsResponse = {
  stats: { total: 10, accepted: 7, rejected: 3, acceptanceRate: 0.7 },
};

function setupFetch(
  decisions = mockDecisionGraphResponse,
  cascade = mockCascadeRiskResponse,
  memory = mockAgentMemoryResponse,
  feedback = mockFeedbackStatsResponse
) {
  mockFetch.mockImplementation((url: string, options?: { method?: string }) => {
    if (url.includes('/api/cascade-risk')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(cascade),
      });
    }
    if (url.includes('/api/decision-graph')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(decisions),
      });
    }
    if (url.includes('/api/agent-memory')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(memory),
      });
    }
    if (url.includes('/api/engine-feedback')) {
      if (options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(feedback),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  });
}

describe('DecisionCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFetch();
  });

  it('renders header title and description', () => {
    render(<DecisionCenter />);
    expect(screen.getByText('决策执行中心')).toBeInTheDocument();
    expect(screen.getByText('基于级联风险分析生成的可执行决策建议')).toBeInTheDocument();
  });

  it('renders refresh button', () => {
    render(<DecisionCenter />);
    expect(screen.getByText('刷新')).toBeInTheDocument();
  });

  it('renders domain select with default value', () => {
    render(<DecisionCenter />);
    // Default domain is 'cross_domain' showing '综合决策'
    expect(screen.getByText('综合决策')).toBeInTheDocument();
  });

  it('renders loading state initially and then decisions', async () => {
    render(<DecisionCenter />);
    // Initially shows loading state
    expect(screen.getByText('正在加载决策建议...')).toBeInTheDocument();
    // Wait for decisions to load
    await waitFor(() => {
      expect(screen.getByText('立即补货冰箱A')).toBeInTheDocument();
    });
  });

  it('renders decision cards with titles after loading', async () => {
    render(<DecisionCenter />);
    await waitFor(() => {
      expect(screen.getByText('立即补货冰箱A')).toBeInTheDocument();
    });
    expect(screen.getByText('调整物流路线')).toBeInTheDocument();
    expect(screen.getByText('评估新供应商')).toBeInTheDocument();
  });

  it('renders priority section headers with counts', async () => {
    render(<DecisionCenter />);
    await waitFor(() => {
      // "立即执行" appears in section header and card description, use getAllByText
      expect(screen.getAllByText(/立即执行/).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/本周内/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/本月内/).length).toBeGreaterThan(0);
  });

  it('renders confidence badges for decisions', async () => {
    render(<DecisionCenter />);
    await waitFor(() => {
      // 0.92 >= 0.9 → 高置信; 0.78 >= 0.7 → 中置信; 0.65 → 低置信
      expect(screen.getAllByText('高置信').length).toBeGreaterThan(0);
      expect(screen.getAllByText('中置信').length).toBeGreaterThan(0);
      expect(screen.getAllByText('低置信').length).toBeGreaterThan(0);
    });
  });

  it('renders reasoning chain section for each decision', async () => {
    render(<DecisionCenter />);
    await waitFor(() => {
      expect(screen.getAllByText('推理链').length).toBe(3);
    });
  });

  it('renders accept and reject buttons for each decision', async () => {
    render(<DecisionCenter />);
    await waitFor(() => {
      expect(screen.getByText('立即补货冰箱A')).toBeInTheDocument();
    });
    const acceptButtons = screen.getAllByText('采纳');
    const rejectButtons = screen.getAllByText('忽略');
    expect(acceptButtons.length).toBe(3);
    expect(rejectButtons.length).toBe(3);
  });

  it('renders feedback stats when total > 0', async () => {
    render(<DecisionCenter />);
    await waitFor(() => {
      expect(screen.getByText(/决策闭环/)).toBeInTheDocument();
    });
    expect(screen.getByText(/累计 10 条/)).toBeInTheDocument();
    expect(screen.getByText(/采纳率 70%/)).toBeInTheDocument();
  });

  it('renders agent context ribbon when agent data available', async () => {
    render(<DecisionCenter />);
    await waitFor(() => {
      expect(screen.getByText(/级联风险/)).toBeInTheDocument();
    });
    expect(screen.getByText(/5 节点受影响/)).toBeInTheDocument();
    expect(screen.getByText(/沙箱/)).toBeInTheDocument();
    expect(screen.getByText(/韧性 78分/)).toBeInTheDocument();
  });

  it('calls fetch with correct endpoints on mount', async () => {
    render(<DecisionCenter />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/cascade-risk'),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/decision-graph'),
      );
      expect(mockFetch).toHaveBeenCalledWith('/api/agent-memory');
      expect(mockFetch).toHaveBeenCalledWith('/api/engine-feedback');
    });
  });

  it('shows accepted badge after clicking accept button', async () => {
    const user = userEvent.setup();
    render(<DecisionCenter />);
    await waitFor(() => {
      expect(screen.getByText('立即补货冰箱A')).toBeInTheDocument();
    });
    const acceptButtons = screen.getAllByText('采纳');
    await user.click(acceptButtons[0]);
    await waitFor(() => {
      expect(screen.getAllByText('已采纳').length).toBeGreaterThan(0);
    });
  });

  it('renders empty state when no decisions available', async () => {
    setupFetch(
      { success: true, decisions: [] },
      { passport: undefined, propagation: [], summary: { topAffectedProducts: [], affectedNodes: 0 } } as any,
      {} as any,
      { stats: null } as any
    );
    render(<DecisionCenter />);
    await waitFor(() => {
      expect(screen.getByText('正在加载决策建议...')).toBeInTheDocument();
    });
    // Should not render priority sections
    expect(screen.queryByText(/立即执行/)).not.toBeInTheDocument();
  });
});
