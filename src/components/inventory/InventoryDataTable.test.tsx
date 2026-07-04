import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Inventory } from '@prisma/client';

// ─── Mock useInventory hook ───────────────────────────────────────────────────
const mockInventoryData: Inventory[] = [
  {
    id: 'inv-1', tenantId: 'default', productId: 'p-1', sku: 'SKU-001',
    productName: '冰箱A', warehouse: '北京仓', quantity: 100, safetyStock: 50,
    reorderPoint: 60, inTransit: 10, turnoverRate: 2.5, turnoverDays: 30,
    stockStatus: 'healthy', lastSyncAt: new Date('2026-01-01'), createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
  },
  {
    id: 'inv-2', tenantId: 'default', productId: 'p-2', sku: 'SKU-002',
    productName: '洗衣机B', warehouse: '上海仓', quantity: 20, safetyStock: 30,
    reorderPoint: 35, inTransit: 5, turnoverRate: 1.2, turnoverDays: 45,
    stockStatus: 'critical', lastSyncAt: new Date('2026-01-01'), createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
  },
  {
    id: 'inv-3', tenantId: 'default', productId: 'p-3', sku: 'SKU-003',
    productName: '空调C', warehouse: '北京仓', quantity: 80, safetyStock: 40,
    reorderPoint: 50, inTransit: 0, turnoverRate: 1.8, turnoverDays: 35,
    stockStatus: 'warning', lastSyncAt: new Date('2026-01-01'), createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
  },
];

vi.mock('@/hooks/use-supply-chain-data', () => ({
  useInventory: vi.fn(() => ({ data: { inventory: mockInventoryData }, isLoading: false })),
}));

// ─── Mock @tanstack/react-virtual to render all rows (happy-dom has no layout) ─
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(() => ({
    getVirtualItems: () => mockInventoryData.map((_, i) => ({
      index: i, start: i * 44, size: 44, key: `virtual-${i}`, lane: 0,
    })),
    getTotalSize: () => mockInventoryData.length * 44,
    measure: vi.fn(),
  })),
}));

import { InventoryDataTable } from './InventoryDataTable';

describe('InventoryDataTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the table title and header columns', () => {
    render(<InventoryDataTable />);
    expect(screen.getByText('库存数据表')).toBeInTheDocument();
    expect(screen.getByText('SKU')).toBeInTheDocument();
    expect(screen.getByText('产品名称')).toBeInTheDocument();
    expect(screen.getByText('仓库')).toBeInTheDocument();
    expect(screen.getByText('数量')).toBeInTheDocument();
    expect(screen.getByText('安全库存')).toBeInTheDocument();
    expect(screen.getByText('周转率')).toBeInTheDocument();
    expect(screen.getByText('状态')).toBeInTheDocument();
  });

  it('renders inventory rows with SKU and product name', () => {
    render(<InventoryDataTable />);
    expect(screen.getByText('SKU-001')).toBeInTheDocument();
    expect(screen.getByText('冰箱A')).toBeInTheDocument();
    expect(screen.getByText('SKU-002')).toBeInTheDocument();
    expect(screen.getByText('洗衣机B')).toBeInTheDocument();
    expect(screen.getByText('SKU-003')).toBeInTheDocument();
    expect(screen.getByText('空调C')).toBeInTheDocument();
  });

  it('renders status badges with correct labels', () => {
    render(<InventoryDataTable />);
    expect(screen.getByText('健康')).toBeInTheDocument();
    expect(screen.getByText('紧急')).toBeInTheDocument();
    expect(screen.getByText('预警')).toBeInTheDocument();
  });

  it('filters rows by global search on SKU', async () => {
    const user = userEvent.setup();
    render(<InventoryDataTable />);
    const searchInput = screen.getByPlaceholderText('搜索 SKU 或产品名称...');
    await user.type(searchInput, 'SKU-001');
    // SKU-001 should be visible, SKU-002 and SKU-003 should not
    expect(screen.getByText('SKU-001')).toBeInTheDocument();
    expect(screen.queryByText('SKU-002')).not.toBeInTheDocument();
    expect(screen.queryByText('SKU-003')).not.toBeInTheDocument();
  });

  it('filters rows by global search on product name', async () => {
    const user = userEvent.setup();
    render(<InventoryDataTable />);
    const searchInput = screen.getByPlaceholderText('搜索 SKU 或产品名称...');
    await user.type(searchInput, '洗衣机');
    expect(screen.getByText('SKU-002')).toBeInTheDocument();
    expect(screen.queryByText('SKU-001')).not.toBeInTheDocument();
  });

  it('shows clear-filters button when search is active and clears on click', async () => {
    const user = userEvent.setup();
    render(<InventoryDataTable />);
    const searchInput = screen.getByPlaceholderText('搜索 SKU 或产品名称...');
    await user.type(searchInput, 'SKU-001');
    expect(screen.getByText('清除筛选')).toBeInTheDocument();
    await user.click(screen.getByText('清除筛选'));
    // After clearing, all rows should be visible again
    expect(screen.getByText('SKU-001')).toBeInTheDocument();
    expect(screen.getByText('SKU-002')).toBeInTheDocument();
  });

  it('toggles to pagination mode and shows pagination controls', async () => {
    const user = userEvent.setup();
    render(<InventoryDataTable />);
    // In virtual mode, pagination controls are hidden
    expect(screen.queryByText('首页')).not.toBeInTheDocument();
    // Click the toggle button (titled "切换到分页模式")
    const toggleBtn = screen.getByTitle('切换到分页模式');
    await user.click(toggleBtn);
    // Now pagination controls should appear
    expect(screen.getByText('首页')).toBeInTheDocument();
    expect(screen.getByText('上一页')).toBeInTheDocument();
    expect(screen.getByText('下一页')).toBeInTheDocument();
    expect(screen.getByText('末页')).toBeInTheDocument();
  });

  it('renders export CSV button', () => {
    render(<InventoryDataTable />);
    expect(screen.getByText('导出当前视图')).toBeInTheDocument();
  });

  it('renders the search input with placeholder', () => {
    render(<InventoryDataTable />);
    expect(screen.getByPlaceholderText('搜索 SKU 或产品名称...')).toBeInTheDocument();
  });

  it('renders virtual scroll info text in virtual mode', () => {
    render(<InventoryDataTable />);
    expect(screen.getByText(/虚拟滚动 · 共/)).toBeInTheDocument();
    expect(screen.getByText(/仅渲染可见行/)).toBeInTheDocument();
    expect(screen.getByText(/3 条库存记录/)).toBeInTheDocument();
  });

  it('renders warehouse filter with all-warehouses default option', () => {
    render(<InventoryDataTable />);
    // The SelectTrigger shows the current value "全部仓库"
    expect(screen.getByText('全部仓库')).toBeInTheDocument();
    // The status filter also has a default
    expect(screen.getByText('全部状态')).toBeInTheDocument();
  });
});
