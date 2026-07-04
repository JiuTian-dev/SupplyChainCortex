import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Mock fetch ───────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── Mock TraceDetail sub-components ──────────────────────────────────────────
vi.mock('./CausalGraph', () => ({
  CausalGraph: ({ steps }: { steps: unknown[] }) => (
    <div data-testid="causal-graph">CausalGraph ({steps.length} steps)</div>
  ),
}));

vi.mock('./ReplayPanel', () => ({
  ReplayPanel: ({ node }: { node: unknown }) => (
    <div data-testid="replay-panel">ReplayPanel</div>
  ),
}));

vi.mock('./ComplianceReport', () => ({
  ComplianceReport: ({ trace }: { trace: unknown }) => (
    <div data-testid="compliance-report">ComplianceReport</div>
  ),
}));

import { AuditTab } from './AuditTab';
import { TraceList } from './TraceList';

// ─── Test data ────────────────────────────────────────────────────────────────
const mockTraces = [
  {
    id: 'trace-1', auditId: 'audit-1', userQuery: '查询库存状态',
    intent: 'supply_chain_data', confidence: 0.95, durationMs: 1500,
    toolsUsed: ['query_inventory'], claimsCount: 3,
    createdAt: '2026-06-18T10:00:00Z',
  },
  {
    id: 'trace-2', auditId: 'audit-2', userQuery: '分析成本趋势',
    intent: 'supply_chain_knowledge', confidence: 0.82, durationMs: 2300,
    toolsUsed: ['query_cost', 'query_analytics'], claimsCount: 5,
    createdAt: '2026-06-18T11:00:00Z',
  },
];

const mockTraceDetail = {
  id: 'trace-1', auditId: 'audit-1', userQuery: '查询库存状态',
  intent: 'supply_chain_data', confidence: 0.95, durationMs: 1500,
  toolsUsed: ['query_inventory'], claimsCount: 3,
  createdAt: '2026-06-18T10:00:00Z',
  steps: [
    {
      id: 'step-1', stepIndex: 0, state: 'classify', confidence: 0.95,
      findings: '用户意图: 查询库存', nextState: 'plan',
      toolCalls: [{ toolName: 'query_inventory', params: {}, result: {}, success: true, latencyMs: 100 }],
      claims: [{ claimIndex: 0, text: '库存正常', source: 'inventory_db', confidence: 'high' }],
    },
  ],
};

function setupFetch(traces = mockTraces, detail = mockTraceDetail) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/audit/traces?')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { traces } }),
      });
    }
    if (url.match(/\/api\/audit\/traces\/[^?]+$/)) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: detail }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true, data: {} }),
    });
  });
}

describe('AuditTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFetch();
  });

  it('renders empty state message when no trace is selected', () => {
    render(<AuditTab />);
    expect(screen.getByText('选择左侧的决策记录查看详情')).toBeInTheDocument();
    expect(screen.getByText('包含因果链路图、工具调用追溯与合规报告')).toBeInTheDocument();
  });

  it('renders TraceList header with title', () => {
    render(<AuditTab />);
    expect(screen.getByText('决策历史')).toBeInTheDocument();
  });

  it('renders intent filter dropdown with all options', () => {
    render(<AuditTab />);
    expect(screen.getByText('全部意图')).toBeInTheDocument();
    expect(screen.getByText('供应链数据')).toBeInTheDocument();
    expect(screen.getByText('专业知识')).toBeInTheDocument();
    expect(screen.getByText('新闻事件')).toBeInTheDocument();
  });

  it('fetches and displays traces from API', async () => {
    render(<AuditTab />);
    expect(await screen.findByText('查询库存状态')).toBeInTheDocument();
    expect(screen.getByText('分析成本趋势')).toBeInTheDocument();
    expect(screen.getByText('2 条')).toBeInTheDocument();
  });

  it('shows empty state when no traces exist', async () => {
    setupFetch([]);
    render(<AuditTab />);
    expect(await screen.findByText('暂无决策记录')).toBeInTheDocument();
  });

  it('displays trace metadata (duration, tools count, claims count)', async () => {
    render(<AuditTab />);
    expect(await screen.findByText('查询库存状态')).toBeInTheDocument();
    expect(screen.getByText(/1\.5s/)).toBeInTheDocument();
    expect(screen.getByText(/1 tools/)).toBeInTheDocument();
    expect(screen.getByText(/3 claims/)).toBeInTheDocument();
  });

  it('renders trace detail when a trace is clicked', async () => {
    const user = userEvent.setup();
    render(<AuditTab />);
    const traceItem = await screen.findByText('查询库存状态');
    await user.click(traceItem);
    // TraceDetail should fetch and render the detail
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/audit/traces/trace-1');
    });
    // The detail should show the user query as a heading
    expect(await screen.findByText('因果链路图')).toBeInTheDocument();
  });

  it('renders causal graph and compliance report in trace detail', async () => {
    const user = userEvent.setup();
    render(<AuditTab />);
    const traceItem = await screen.findByText('查询库存状态');
    await user.click(traceItem);
    expect(await screen.findByTestId('causal-graph')).toBeInTheDocument();
    expect(screen.getByTestId('compliance-report')).toBeInTheDocument();
  });

  it('renders decision steps section in trace detail', async () => {
    const user = userEvent.setup();
    render(<AuditTab />);
    const traceItem = await screen.findByText('查询库存状态');
    await user.click(traceItem);
    expect(await screen.findByText('决策步骤')).toBeInTheDocument();
    expect(screen.getByText('分类')).toBeInTheDocument();
  });
});

describe('TraceList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFetch();
  });

  it('renders refresh button', () => {
    render(<TraceList selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('fetches traces on mount', async () => {
    render(<TraceList selectedId={null} onSelect={vi.fn()} />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/audit/traces'));
    });
  });
});
