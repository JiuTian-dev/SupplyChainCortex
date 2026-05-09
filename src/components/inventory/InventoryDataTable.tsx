'use client';

/* eslint-disable react-hooks/incompatible-library */

import { useState, useMemo, useCallback, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
  type Row,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowUpDown, ArrowUp, ArrowDown, Download, ChevronDown, ChevronRight,
  Rows3, LayoutList, SlidersHorizontal, Eye, StickyNote, MoreHorizontal,
  Search, X, Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useInventory } from '@/hooks/use-supply-chain-data';
import type { InventoryRecord } from '@/lib/types';

// ==================== Constants ====================
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  healthy: { label: '健康', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  warning: { label: '预警', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  critical: { label: '紧急', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  overstock: { label: '积压', cls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300' },
};

const ROW_HEIGHT = 44;
const EXPANDED_ROW_HEIGHT = 76;

// ==================== CSV Export ====================
function exportCSV(items: InventoryRecord[]) {
  const headers = ['SKU', '产品名称', '仓库', '数量', '安全库存', '周转率', '状态', '补货点', '在途', '周转天数'];
  const rows = items.map(i => [i.sku, i.productName, i.warehouse, i.quantity, i.safetyStock, i.turnoverRate, STATUS_BADGE[i.stockStatus]?.label ?? i.stockStatus, i.reorderPoint, i.inTransit, i.turnoverDays]);
  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `库存数据_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ==================== Sort Icon Component ====================
function SortIcon({ column }: { column: { getIsSorted: () => false | 'asc' | 'desc' } }) {
  const sorted = column.getIsSorted();
  if (!sorted) return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground/40" />;
  return sorted === 'asc'
    ? <ArrowUp className="h-3 w-3 ml-1 text-orange-500" />
    : <ArrowDown className="h-3 w-3 ml-1 text-orange-500" />;
}

// ==================== Component Props ====================
interface InventoryDataTableProps {
  /** Callback to open stock adjustment dialog with pre-filled SKU */
  onAdjustStock?: (sku: string) => void;
  /** Callback to view product detail */
  onViewDetail?: (sku: string) => void;
  /** Callback to add a note for a SKU */
  onAddNote?: (sku: string) => void;
}

// ==================== Main Component ====================
export function InventoryDataTable({ onAdjustStock, onViewDetail, onAddNote }: InventoryDataTableProps) {
  const { data: inventoryData } = useInventory('list');
  const inventory = useMemo(() => (inventoryData as any)?.inventory ?? [] as InventoryRecord[], [inventoryData]);

  // UI state
  const [virtualMode, setVirtualMode] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'sku', desc: false }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Derive unique warehouses for filter
  const warehouses = useMemo(() => {
    const set = new Set(inventory.map((i: InventoryRecord) => i.warehouse));
    return Array.from(set).sort() as string[];
  }, [inventory]);

  // TanStack Table column definitions
  const columns = useMemo<ColumnDef<InventoryRecord, unknown>[]>(() => [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="全选"
          className="translate-y-[2px]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          onClick={(e) => e.stopPropagation()}
          aria-label="选择行"
          className="translate-y-[2px]"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      id: 'expand',
      header: () => null,
      cell: ({ row }) => {
        const isExpanded = expandedId === row.original.id;
        return (
          <button
            onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : row.original.id); }}
            className="p-0.5 rounded hover:bg-muted/50 transition-colors"
          >
            {isExpanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        );
      },
      enableSorting: false,
      size: 32,
    },
    {
      accessorKey: 'sku',
      header: ({ column }) => (
        <button className="flex items-center gap-0.5" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          SKU <SortIcon column={column} />
        </button>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.sku}</span>
      ),
      size: 90,
    },
    {
      accessorKey: 'productName',
      header: ({ column }) => (
        <button className="flex items-center gap-0.5" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          产品名称 <SortIcon column={column} />
        </button>
      ),
      cell: ({ row }) => (
        <span className="font-medium text-xs sm:text-sm">{row.original.productName}</span>
      ),
      size: 140,
    },
    {
      accessorKey: 'warehouse',
      header: ({ column }) => (
        <button className="flex items-center gap-0.5" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          仓库 <SortIcon column={column} />
        </button>
      ),
      cell: ({ row }) => (
        <span className="text-xs">{row.original.warehouse}</span>
      ),
      size: 90,
    },
    {
      accessorKey: 'quantity',
      header: ({ column }) => (
        <button className="flex items-center gap-0.5 ml-auto" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          数量 <SortIcon column={column} />
        </button>
      ),
      cell: ({ row }) => (
        <span className="text-right text-xs tabular-nums block">{row.original.quantity.toLocaleString()}</span>
      ),
      size: 70,
    },
    {
      accessorKey: 'safetyStock',
      header: ({ column }) => (
        <button className="flex items-center gap-0.5 ml-auto" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          安全库存 <SortIcon column={column} />
        </button>
      ),
      cell: ({ row }) => (
        <span className="text-right text-xs tabular-nums block">{row.original.safetyStock.toLocaleString()}</span>
      ),
      size: 80,
    },
    {
      accessorKey: 'turnoverRate',
      header: ({ column }) => (
        <button className="flex items-center gap-0.5 ml-auto" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          周转率 <SortIcon column={column} />
        </button>
      ),
      cell: ({ row }) => (
        <span className="text-right text-xs tabular-nums block">{row.original.turnoverRate.toFixed(1)}</span>
      ),
      size: 70,
    },
    {
      accessorKey: 'stockStatus',
      header: ({ column }) => (
        <button className="flex items-center gap-0.5" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          状态 <SortIcon column={column} />
        </button>
      ),
      cell: ({ row }) => {
        const st = STATUS_BADGE[row.original.stockStatus] || { label: row.original.stockStatus, cls: '' };
        return <Badge className={`text-[10px] ${st.cls}`}>{st.label}</Badge>;
      },
      size: 75,
      filterFn: (row, _columnId, filterValue) => {
        if (!filterValue || filterValue === 'all') return true;
        return row.original.stockStatus === filterValue;
      },
    },
    {
      id: 'actions',
      header: () => null,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAdjustStock?.(row.original.sku); }}>
              <SlidersHorizontal className="h-3.5 w-3.5 mr-2" />
              调整库存
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewDetail?.(row.original.sku); }}>
              <Eye className="h-3.5 w-3.5 mr-2" />
              查看详情
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAddNote?.(row.original.sku); }}>
              <StickyNote className="h-3.5 w-3.5 mr-2" />
              添加备注
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableSorting: false,
      size: 40,
    },
  ], [expandedId, onAdjustStock, onViewDetail, onAddNote]);

  // Custom filter function for global search (SKU + productName)
  const globalFilterFn = useCallback((row: any, _columnId: string, filterValue: string) => {
    const q = filterValue.toLowerCase();
    const item = row.original as InventoryRecord;
    return item.sku.toLowerCase().includes(q) || item.productName.toLowerCase().includes(q);
  }, []);

  // TanStack Table instance
  const table = useReactTable({
    data: inventory,
    columns,
    state: {
      sorting,
      rowSelection,
      globalFilter: globalSearch,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalSearch,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
    enableGlobalFilter: true,
    enableRowSelection: true,
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  // Apply warehouse + status filters manually on top of TanStack's filtering
  const tableRows = table.getRowModel().rows;
  const filteredRows = useMemo(() => {
    let rows = tableRows;
    if (warehouseFilter !== 'all') {
      rows = rows.filter(r => r.original.warehouse === warehouseFilter);
    }
    if (statusFilter !== 'all') {
      rows = rows.filter(r => r.original.stockStatus === statusFilter);
    }
    return rows;
  }, [tableRows, warehouseFilter, statusFilter]);

  // Build flat virtual rows (item + optional expanded detail)
  type VirtualItemRow = { type: 'item'; row: Row<InventoryRecord>; idx: number };
  type VirtualDetailRow = { type: 'detail'; item: InventoryRecord; idx: number };
  type VirtualRow = VirtualItemRow | VirtualDetailRow;

  const virtualRows = useMemo(() => {
    const rows: VirtualRow[] = [];
    filteredRows.forEach((row, idx) => {
      rows.push({ type: 'item', row, idx });
      if (expandedId === row.original.id) {
        rows.push({ type: 'detail', item: row.original, idx });
      }
    });
    return rows;
  }, [filteredRows, expandedId]);

  // Selected count
  const selectedCount = Object.keys(rowSelection).length;

  // ==================== Virtual Scrolling ====================
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => virtualRows[index]?.type === 'detail' ? EXPANDED_ROW_HEIGHT : ROW_HEIGHT,
    overscan: 8,
  });

  // Paged data for non-virtual mode
  const pagination = table.getState().pagination;
  const pagedRows = useMemo(() => {
    const { pageIndex, pageSize: pz } = pagination;
    const start = pageIndex * pz;
    return filteredRows.slice(start, start + pz);
  }, [filteredRows, pagination]);

  // Total filtered count
  const totalFiltered = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pagination.pageSize));

  // Reset page when filters change
  const handleGlobalSearchChange = (val: string) => {
    setGlobalSearch(val);
    table.setPageIndex(0);
  };

  const handleWarehouseChange = (val: string) => {
    setWarehouseFilter(val);
    table.setPageIndex(0);
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    table.setPageIndex(0);
  };

  // Clear all filters
  const clearFilters = () => {
    setGlobalSearch('');
    setWarehouseFilter('all');
    setStatusFilter('all');
    table.setPageIndex(0);
  };

  const hasActiveFilters = globalSearch || warehouseFilter !== 'all' || statusFilter !== 'all';

  // Bulk deselect
  const handleBulkDeselect = () => {
    setRowSelection({});
  };

  return (
    <Card
      className="card-dashboard"
      style={{ '--delay': '300ms' } as React.CSSProperties}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-semibold">库存数据表</CardTitle>
          <div className="flex items-center gap-2">
            {selectedCount > 0 && (
              <Badge variant="secondary" className="text-xs gap-1">
                已选 {selectedCount} 项
                <button onClick={handleBulkDeselect} className="ml-0.5 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => exportCSV(filteredRows.map(r => r.original))}
            >
              <Download className="h-3 w-3" /> 导出当前视图
            </Button>
            <Button
              variant={virtualMode ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setVirtualMode(!virtualMode)}
              title={virtualMode ? '切换到分页模式' : '切换到虚拟滚动模式'}
            >
              {virtualMode ? <LayoutList className="h-3 w-3" /> : <Rows3 className="h-3 w-3" />}
              {virtualMode ? '虚拟滚动' : '分页'}
            </Button>
          </div>
        </div>

        {/* ==================== Filter Bar ==================== */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索 SKU 或产品名称..."
              className="h-8 text-xs pl-7 pr-7"
              value={globalSearch}
              onChange={(e) => handleGlobalSearchChange(e.target.value)}
            />
            {globalSearch && (
              <button
                onClick={() => handleGlobalSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Warehouse filter */}
          <Select value={warehouseFilter} onValueChange={handleWarehouseChange}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue placeholder="仓库" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部仓库</SelectItem>
              {warehouses.map((wh) => (
                <SelectItem key={wh} value={wh}>{wh}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="healthy">🟢 健康</SelectItem>
              <SelectItem value="warning">🟡 预警</SelectItem>
              <SelectItem value="critical">🔴 紧急</SelectItem>
              <SelectItem value="overstock">🔵 积压</SelectItem>
            </SelectContent>
          </Select>

          {/* Clear filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={clearFilters}
            >
              <Trash2 className="h-3 w-3" />
              清除筛选
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* ==================== Bulk Actions Bar ==================== */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
            <span className="text-xs font-medium text-orange-700 dark:text-orange-300">
              已选择 {selectedCount} 项
            </span>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 border-orange-300 dark:border-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900/30"
              onClick={() => {
                const skus = Object.keys(rowSelection)
                  .map(id => inventory.find((i: InventoryRecord) => i.id === id)?.sku)
                  .filter(Boolean);
                if (skus.length > 0) onAdjustStock?.(skus[0] as string);
              }}
            >
              <SlidersHorizontal className="h-3 w-3" /> 批量调整
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleBulkDeselect}
            >
              <X className="h-3 w-3" /> 取消选择
            </Button>
          </div>
        )}

        {virtualMode ? (
          // ==================== Virtual Scroll Mode ====================
          <div className="overflow-x-auto custom-scrollbar">
            {/* Fixed header */}
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="hover:bg-transparent">
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                        className={`text-[10px] uppercase tracking-wider text-muted-foreground select-none ${
                          header.id === 'sku' ? 'sticky left-0 bg-background z-10' : ''
                        } ${header.column.getCanSort() ? 'cursor-pointer' : ''}`}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
            </Table>

            {/* Virtual scroll container */}
            <div
              ref={parentRef}
              className="overflow-y-auto overflow-x-auto custom-scrollbar"
              style={{ maxHeight: 480 }}
            >
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const row = virtualRows[virtualItem.index];
                  if (!row) return null;

                  // Expanded detail row
                  if (row.type === 'detail') {
                    return (
                      <div
                        key={`${row.item.id}-detail`}
                        className="bg-muted/10 dark:bg-muted/5 border-b"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualItem.size}px`,
                          transform: `translateY(${virtualItem.start}px)`,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <div className="p-3 w-full">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div><span className="text-muted-foreground">周转天数:</span> <span className="font-medium">{row.item.turnoverDays}天</span></div>
                            <div><span className="text-muted-foreground">补货点:</span> <span className="font-medium">{row.item.reorderPoint}</span></div>
                            <div><span className="text-muted-foreground">在途数量:</span> <span className="font-medium">{row.item.inTransit}</span></div>
                            <div><span className="text-muted-foreground">最近同步:</span> <span className="font-medium">{row.item.lastSyncAt ? new Date(row.item.lastSyncAt).toLocaleString('zh-CN') : '-'}</span></div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Item row
                  const tableRow = row.row;
                  const isSelected = tableRow.getIsSelected();
                  const isExpanded = expandedId === tableRow.original.id;
                  const item = tableRow.original;
                  const idx = row.idx;

                  return (
                    <div
                      key={item.id}
                      className={`table-row-interactive cursor-pointer border-b transition-colors ${
                        isSelected ? 'bg-orange-50/60 dark:bg-orange-950/30' : idx % 2 !== 0 ? 'bg-muted/20' : ''
                      }`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      {/* Checkbox */}
                      <div className="w-10 px-2 py-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(val) => tableRow.toggleSelected(!!val)}
                        />
                      </div>
                      {/* Expand */}
                      <div className="w-8 px-1 py-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className="p-0.5 rounded hover:bg-muted/50"
                        >
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        </button>
                      </div>
                      {/* SKU (sticky) */}
                      <div className={`font-mono text-xs px-2 py-1.5 min-w-[80px] shrink-0 sticky left-0 z-10 ${
                        idx % 2 !== 0 ? (isSelected ? 'bg-orange-50/60 dark:bg-orange-950/30' : 'bg-muted/20 dark:bg-muted/20') : (isSelected ? 'bg-orange-50/60 dark:bg-orange-950/30' : 'bg-background dark:bg-background')
                      }`}>
                        {item.sku}
                      </div>
                      {/* Product Name */}
                      <div className="font-medium text-xs sm:text-sm px-2 py-1.5 min-w-[120px]">{item.productName}</div>
                      {/* Warehouse */}
                      <div className="text-xs px-2 py-1.5 min-w-[80px]">{item.warehouse}</div>
                      {/* Quantity */}
                      <div className="text-right text-xs tabular-nums px-2 py-1.5 min-w-[60px]">{item.quantity.toLocaleString()}</div>
                      {/* Safety Stock */}
                      <div className="text-right text-xs tabular-nums px-2 py-1.5 min-w-[70px]">{item.safetyStock.toLocaleString()}</div>
                      {/* Turnover Rate */}
                      <div className="text-right text-xs tabular-nums px-2 py-1.5 min-w-[60px]">{item.turnoverRate.toFixed(1)}</div>
                      {/* Status */}
                      <div className="px-2 py-1.5 min-w-[70px]">
                        <Badge className={`text-[10px] ${STATUS_BADGE[item.stockStatus]?.cls || ''}`}>
                          {STATUS_BADGE[item.stockStatus]?.label || item.stockStatus}
                        </Badge>
                      </div>
                      {/* Actions */}
                      <div className="px-1 py-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem onClick={() => onAdjustStock?.(item.sku)}>
                              <SlidersHorizontal className="h-3.5 w-3.5 mr-2" />
                              调整库存
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onViewDetail?.(item.sku)}>
                              <Eye className="h-3.5 w-3.5 mr-2" />
                              查看详情
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onAddNote?.(item.sku)}>
                              <StickyNote className="h-3.5 w-3.5 mr-2" />
                              添加备注
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Virtual scroll info */}
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
              <span>虚拟滚动 · 共 {totalFiltered} 条 · 仅渲染可见行</span>
              <span>滚动查看更多 ↓</span>
            </div>
          </div>
        ) : (
          // ==================== Paginated Mode ====================
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="hover:bg-transparent">
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                        className={`text-[10px] uppercase tracking-wider text-muted-foreground select-none ${
                          header.id === 'sku' ? 'sticky left-0 bg-background z-10' : ''
                        } ${header.column.getCanSort() ? 'cursor-pointer' : ''}`}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {pagedRows.map((tableRow, idx) => {
                  const item = tableRow.original;
                  const isExpanded = expandedId === item.id;
                  const isSelected = tableRow.getIsSelected();
                  return (
                    <>
                      <TableRow
                        key={item.id}
                        className={`table-row-interactive cursor-pointer ${
                          isSelected ? 'bg-orange-50/60 dark:bg-orange-950/30' : idx % 2 !== 0 ? 'bg-muted/20' : ''
                        }`}
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      >
                        {tableRow.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            className={`text-xs px-2 py-1.5 ${
                              cell.column.id === 'sku' ? 'sticky left-0 bg-background z-10 font-mono' : ''
                            } ${cell.column.id === 'quantity' || cell.column.id === 'safetyStock' || cell.column.id === 'turnoverRate' ? 'text-right tabular-nums' : ''}`}
                            onClick={(e) => {
                              if (cell.column.id === 'select' || cell.column.id === 'actions' || cell.column.id === 'expand') {
                                e.stopPropagation();
                              }
                            }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${item.id}-detail`} className="bg-muted/10 dark:bg-muted/5">
                          <TableCell colSpan={tableRow.getVisibleCells().length} className="p-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              <div><span className="text-muted-foreground">周转天数:</span> <span className="font-medium">{item.turnoverDays}天</span></div>
                              <div><span className="text-muted-foreground">补货点:</span> <span className="font-medium">{item.reorderPoint}</span></div>
                              <div><span className="text-muted-foreground">在途数量:</span> <span className="font-medium">{item.inTransit}</span></div>
                              <div><span className="text-muted-foreground">最近同步:</span> <span className="font-medium">{item.lastSyncAt ? new Date(item.lastSyncAt).toLocaleString('zh-CN') : '-'}</span></div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
                {pagedRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                      无匹配数据
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* ==================== Pagination (non-virtual mode) ==================== */}
        {!virtualMode && (
          <div className="flex items-center justify-between mt-3 flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">每页</span>
              <Select
                value={String(table.getState().pagination.pageSize)}
                onValueChange={(v) => { table.setPageSize(Number(v)); table.setPageIndex(0); }}
              >
                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[10, 20, 50].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">共 {totalFiltered} 条</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!table.getCanPreviousPage()} onClick={() => table.setPageIndex(0)}>首页</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>上一页</Button>
              <span className="px-2 text-muted-foreground">{table.getState().pagination.pageIndex + 1} / {totalPages}</span>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>下一页</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!table.getCanNextPage()} onClick={() => table.setPageIndex(totalPages - 1)}>末页</Button>
            </div>
          </div>
        )}

        {/* Virtual mode pagination info */}
        {virtualMode && totalFiltered > 0 && (
          <div className="flex items-center justify-center mt-1 text-xs text-muted-foreground">
            共 {totalFiltered} 条库存记录
            {hasActiveFilters && ' (已筛选)'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
