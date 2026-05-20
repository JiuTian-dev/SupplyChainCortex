'use client';

import { useState, useCallback, useMemo } from 'react';
import { useSkuFilter } from '@/hooks/useSkuFilter';
import {
  CheckCircle2, AlertTriangle, XCircle, Layers,
  Zap, Eye, Search, Filter, SlidersHorizontal,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell,
  ComposedChart, ReferenceLine,
} from 'recharts';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ProductFilter } from '@/components/shared/ProductFilter';
import { FilterChips } from '@/components/shared/FilterChips';
import { BatchActionsToolbar } from '@/components/shared/BatchActionsToolbar';
import { useBatchSelection } from '@/hooks/use-batch-selection';
import { Checkbox } from '@/components/ui/checkbox';
import { exportToCSV as exportBatchToCSV } from '@/lib/services/batch-export.service';

import {
  useInventory,
  useWarehouse,
  useProcurement,
  useWarehouseZones,
  useWarehouseTrend,
} from '@/hooks/use-supply-chain-data';
import dynamic from 'next/dynamic';

import { TransferDialog } from '@/components/inventory/WarehouseZonesPanel';
import { ReorderRecommendationPanel } from '@/components/inventory/ReorderRecommendationPanel';
import { InventoryCapitalPanel } from '@/components/inventory/InventoryCapitalPanel';
const StockAdjustmentDialog = dynamic(
  () => import('@/components/inventory/StockAdjustmentDialog').then((m) => ({ default: m.StockAdjustmentDialog })),
  { ssr: false }
);
import { InventoryAlertTimeline } from '@/components/inventory/InventoryAlertTimeline';
import { InventoryDataTable } from '@/components/inventory/InventoryDataTable';
import { ExportMenu } from '@/components/shared/ExportMenu';
import { useDashboardUIStore } from '@/stores/useDashboardUIStore';
import { useInventoryUIStore } from '@/stores/useInventoryUIStore';
import { STATUS_COLORS, STATUS_LABELS, AGING_COLORS, CHART_COLORS } from '@/lib/constants';
import type { Inventory } from '@prisma/client';
import { MetricCard } from '@/components/shared/MetricCard';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';

import { CHART_TOOLTIP_STYLE } from './InventoryTab.helpers';
import { InventorySlowMovingAlert } from './InventorySlowMovingAlert';
import { InventoryWarehouseCapacity } from './InventoryWarehouseCapacity';
import { InventoryDetailDialog } from './InventoryDetailDialog';
import { InventoryProcurementSection } from './InventoryProcurementSection';

// ==================== Main InventoryTab Component ====================

export function InventoryTab() {
  const queryClient = useQueryClient();

  // Stock adjustment dialog state
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [adjustmentDefaultSku, setAdjustmentDefaultSku] = useState<string | undefined>(undefined);

  // Stock transfer dialog state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);

  // Zustand stores for UI state
  const {
    searchQuery, setSearchQuery,
    budgetDialogOpen, setBudgetDialogOpen,
    budgetData, setBudgetData,
    timelineDialogOpen, setTimelineDialogOpen,
    timelineData, setTimelineData,
  } = useDashboardUIStore();

  const {
    inventoryFilter, setInventoryFilter,
    selectedInventorySku, setSelectedInventorySku,
    inventoryDetail, setInventoryDetail,
    reorderQty, setReorderQty,
    reorderWarehouse, setReorderWarehouse,
    reorderPriority, setReorderPriority,
  } = useInventoryUIStore();

  // Local filter state with URL persistence
  const { selectedSkus, updateSkus, filterParams } = useSkuFilter();
  const [skuLabels, setSkuLabels] = useState<Record<string, string>>({});
  const { data: inventoryData, isLoading: inventoryLoading } = useInventory('list', filterParams);
  const { data: agingResponse } = useWarehouse('aging');
  const { data: warehouseCapacityData } = useWarehouse('capacity');
  const { data: procurementData } = useProcurement('plan');
  const { data: zonesData } = useWarehouseZones();
  const { data: trendData } = useWarehouseTrend();

  // Derived warehouse zone and trend data (from WarehouseZonesPanel merge)
  const zoneSummary = useMemo(() => (zonesData as any)?.summary ?? null, [zonesData]);
  const trend = useMemo(() => (trendData as any)?.trend ?? [], [trendData]);
  const trendSummary = useMemo(() => (trendData as any)?.summary ?? null, [trendData]);
  const warehouseNames = useMemo(() => ((zonesData as any)?.zones ?? []).map((wh: any) => wh.warehouse as string), [zonesData]);
  const inventoryForTransfer = useMemo(() => ((zonesData as any)?.zones ?? []).flatMap((wh: any) =>
    wh.zones.map((zone: any) => ({
      sku: `${wh.warehouse}-${zone.type}`,
      productName: `${wh.warehouse} ${zone.name}`,
      warehouse: wh.warehouse,
      quantity: zone.used,
    }))
  ), [zonesData]);

  // Derived data from React Query responses
  const inventory = useMemo(() => (inventoryData as any)?.data?.inventory ?? [], [inventoryData]);
  const inventoryAgingData = useMemo(() => {
    const rawAging = (agingResponse as any)?.agingAnalysis || (agingResponse as any)?.data?.agingAnalysis;
    if (rawAging && Array.isArray(rawAging) && rawAging.length > 0) {
      const agingAnalysis = rawAging;
      const productAging: Record<string, { name: string; '0-30天': number; '31-60天': number; '61-90天': number; '90+天': number }> = {};
      agingAnalysis.forEach((item: { productName: string; quantity: number; ageBracket: string }) => {
        if (!productAging[item.productName]) {
          productAging[item.productName] = { name: item.productName, '0-30天': 0, '31-60天': 0, '61-90天': 0, '90+天': 0 };
        }
        if (item.ageBracket in productAging[item.productName]) {
          (productAging[item.productName] as unknown as Record<string, number>)[item.ageBracket] += item.quantity;
        }
      });
      const arr = Object.values(productAging);
      return arr;
    }
    return [];
  }, [agingResponse]);

  // Slow-moving products (turnover > 90 days)
  const slowMoving = useMemo(() => inventory.filter((i: Inventory) => i.turnoverDays > 90), [inventory]);

  // Filtered inventory for search/filter
  const filteredInventory = useMemo(() => {
    if (!inventory.length) return [];
    let items = inventory as Inventory[];
    if (inventoryFilter !== 'all') {
      items = items.filter(i => i.stockStatus === inventoryFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i =>
        i.sku.toLowerCase().includes(q) ||
        i.productName.toLowerCase().includes(q) ||
        i.warehouse.toLowerCase().includes(q)
      );
    }
    return items;
  }, [inventory, inventoryFilter, searchQuery]);

  // Batch selection for the inventory detail table
  const batchSelection = useBatchSelection(
    filteredInventory,
    (item: Inventory) => item.sku,
  );

  // View inventory detail (health + safety stock + reorder suggestion)
  const viewInventoryDetail = useCallback(async (sku: string) => {
    setSelectedInventorySku(sku);
    try {
      const [healthRes, safetyRes, reorderRes] = await Promise.all([
        fetch(`/api/inventory?action=health&sku=${sku}`),
        fetch(`/api/inventory?action=safety_stock&sku=${sku}&serviceLevel=0.95`),
        fetch(`/api/inventory?action=reorder&sku=${sku}`),
      ]);
      const [health, safety, reorder] = await Promise.all([
        healthRes.json(),
        safetyRes.json(),
        reorderRes.json(),
      ]);
      setInventoryDetail({ health, safety, reorder });
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error('获取库存详情失败:', err);
    }
  }, [setSelectedInventorySku, setInventoryDetail]);

  // Fetch procurement budget
  const fetchBudget = useCallback(async () => {
    try {
      const res = await fetch('/api/procurement?action=budget');
      const data = await res.json();
      if ((data as any).totalBudget !== undefined) {
        setBudgetData(data);
        setBudgetDialogOpen(true);
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error('获取预算数据失败:', err);
    }
  }, [setBudgetData, setBudgetDialogOpen]);

  // Fetch procurement timeline
  const fetchTimeline = useCallback(async () => {
    try {
      const res = await fetch('/api/procurement?action=timeline');
      const data = await res.json();
      if ((data as any).timeline) {
        setTimelineData(data);
        setTimelineDialogOpen(true);
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error('获取时间线数据失败:', err);
    }
  }, [setTimelineData, setTimelineDialogOpen]);

  // Submit reorder
  const handleSubmitReorder = useCallback(async () => {
    try {
      const res = await fetch('/api/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: selectedInventorySku,
          productName: (inventoryDetail as any)?.health?.productName || selectedInventorySku,
          quantity: reorderQty || (inventoryDetail as any)?.reorder?.recommendedOrder || 0,
          warehouse: reorderWarehouse,
          priority: reorderPriority,
        }),
      });
      const data = await res.json();
      if ((data as any).success) {
        toast.success('补货订单已提交', {
          description: `订单ID: ${(data as any).order.id?.slice(0, 8)}... | ${selectedInventorySku} x${reorderQty || (inventoryDetail as any)?.reorder?.recommendedOrder} → ${reorderWarehouse} (${reorderPriority})`,
        });
        // Invalidate reorder queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['reorder'] });
      } else {
        toast.error('补货下单失败', { description: (data as any).error || '未知错误' });
      }
    } catch {
      toast.error('补货下单失败', { description: '网络错误' });
    }
  }, [selectedInventorySku, inventoryDetail, reorderQty, reorderWarehouse, reorderPriority, queryClient]);

  // ─── Batch operations ───────────────────────────────────────────────────────

  const handleBatchReorder = useCallback(async () => {
    const skuList = Array.from(batchSelection.selectedIds);
    if (skuList.length === 0) return;
    if (!window.confirm(`确认对 ${skuList.length} 个 SKU 执行批量补货操作？`)) return;

    let successCount = 0;
    let failCount = 0;

    for (const sku of skuList) {
      try {
        const res = await fetch('/api/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku, quantity: 0, priority: 'normal' }),
        });
        const data = await res.json();
        if ((data as any).success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    if (failCount === 0) {
      toast.success('批量补货完成', {
        description: `全部 ${successCount} 个 SKU 补货订单已提交`,
      });
    } else {
      toast.warning('批量补货部分完成', {
        description: `${successCount} 个成功，${failCount} 个失败`,
      });
    }
    queryClient.invalidateQueries({ queryKey: ['reorder'] });
    batchSelection.clearSelection();
  }, [batchSelection, queryClient]);

  const handleBatchExport = useCallback(() => {
    const selected = filteredInventory.filter((inv) =>
      batchSelection.selectedIds.has(inv.sku),
    );
    if (selected.length === 0) return;

    const mapped = selected.map((inv: Inventory) => ({
      SKU: inv.sku,
      产品名称: inv.productName,
      仓库: inv.warehouse,
      当前库存: inv.quantity,
      安全库存: inv.safetyStock,
      在途: inv.inTransit,
      周转天数: inv.turnoverDays,
      状态: STATUS_LABELS[inv.stockStatus],
    }));

    exportBatchToCSV(mapped, '库存数据_已选');
  }, [filteredInventory, batchSelection.selectedIds]);

  // Loading state
  if (inventoryLoading && !inventoryData) return <DashboardSkeleton />;
  if (!inventoryData) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-30 flex items-center gap-2 flex-wrap py-2 bg-background/95 backdrop-blur border-b -mx-2 px-2">
        <ProductFilter selected={selectedSkus} onChange={updateSkus} onLabelsLoad={setSkuLabels} />
        <FilterChips selected={selectedSkus} labels={skuLabels} onRemove={(sku) => updateSkus(selectedSkus.filter(s => s !== sku))} onClearAll={() => updateSkus([])} />
      </div>
      {/* 库存水位概览 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard title="健康库存" value={inventory.filter((i: Inventory) => i.stockStatus === 'healthy').length} icon={<CheckCircle2 className="h-4 w-4" />} color="text-green-600 dark:text-green-400" bgColor="bg-green-50 dark:bg-green-950/20" />
        <MetricCard title="预警库存" value={inventory.filter((i: Inventory) => i.stockStatus === 'warning').length} icon={<AlertTriangle className="h-4 w-4" />} color="text-yellow-600 dark:text-yellow-400" bgColor="bg-yellow-50 dark:bg-yellow-950/20" />
        <div className="glow-border-rose rounded-xl">
          <MetricCard title="紧急补货" value={inventory.filter((i: Inventory) => i.stockStatus === 'critical').length} icon={<XCircle className="h-4 w-4" />} color="text-red-600 dark:text-red-400" bgColor="bg-red-50 dark:bg-red-950/20" />
        </div>
        <div className="glow-border-emerald rounded-xl">
          <MetricCard title="库存积压" value={inventory.filter((i: Inventory) => i.stockStatus === 'overstock').length} icon={<Layers className="h-4 w-4" />} color="text-violet-600 dark:text-violet-400" bgColor="bg-violet-50 dark:bg-violet-950/20" />
        </div>
      </div>

      <div>
        {/* 周转天数分布 */}
        <Card className="card-dashboard chart-container">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">产品周转天数</CardTitle>
            <CardDescription>周转天数越短代表库存效率越高 | 红色虚线 = 90天滞销线</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={inventory.slice(0, 8).map((i: Inventory) => ({
                name: i.productName.length > 6 ? i.productName.slice(0, 6) + '...' : i.productName,
                sku: i.sku,
                turnoverDays: i.turnoverDays,
                safetyStock: i.safetyStock,
              }))} layout="vertical"
                onClick={(e: { activePayload?: Array<{ payload?: { sku?: string } }> }) => {
                  if (e?.activePayload?.[0]?.payload?.sku) {
                    const sku = e.activePayload[0].payload.sku;
                    updateSkus(selectedSkus.includes(sku) ? selectedSkus.filter(s => s !== sku) : [...selectedSkus, sku]);
                  }
                }}
                style={{ cursor: 'pointer' }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <ReferenceLine x={90} stroke="#ef4444" strokeDasharray="5 5" label={{ value: '滞销线', position: 'top', fill: '#ef4444', fontSize: 10 }} />
                <Bar dataKey="turnoverDays" radius={[0, 4, 4, 0]} className="chart-draw-in">
                  {inventory.slice(0, 8).map((i: Inventory, index: number) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[i.stockStatus]} style={{ '--bar-index': index } as React.CSSProperties} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <InventorySlowMovingAlert slowMoving={slowMoving} />

      {/* 库存库龄分布 */}
      <Card className="card-dashboard chart-container border-l-[4px] border-l-emerald-400">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Layers className="h-4 w-4 text-emerald-500" />
            库存库龄分布
          </CardTitle>
          <CardDescription>按产品统计各库龄段库存数量 | 颜色越红代表库龄越长</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300} minHeight={200}>
            <BarChart data={inventoryAgingData} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}`} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Legend />
              <Bar dataKey="0-30天" stackId="aging" fill={AGING_COLORS['0-30天']} name="0-30天 (新鲜)" radius={[0, 0, 0, 0]} animationDuration={800} animationEasing="ease-out" />
              <Bar dataKey="31-60天" stackId="aging" fill={AGING_COLORS['31-60天']} name="31-60天 (正常)" animationDuration={800} animationEasing="ease-out" />
              <Bar dataKey="61-90天" stackId="aging" fill={AGING_COLORS['61-90天']} name="61-90天 (缓慢)" animationDuration={800} animationEasing="ease-out" />
              <Bar dataKey="90+天" stackId="aging" fill={AGING_COLORS['90+天']} name="90+天 (滞销)" radius={[4, 4, 0, 0]} animationDuration={800} animationEasing="ease-out" />
            </BarChart>
          </ResponsiveContainer>
          {/* 图例说明 */}
          <div className="flex items-center justify-center gap-4 mt-2 flex-wrap">
            {Object.entries(AGING_COLORS).map(([label, color]) => (
              <div key={label} className="flex items-center gap-1.5 text-xs">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
          {/* 库存周转建议 */}
          <div className="mt-4 p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/20">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <Zap className="h-3.5 w-3.5" />
              库存周转建议
            </h4>
            <div className="mt-2 space-y-1.5">
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className="text-red-500 shrink-0">●</span>
                榨汁机库存超过 90 天达 180 件，建议促销清仓或捆绑销售
              </p>
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className="text-yellow-500 shrink-0">●</span>
                咖啡机 90+天库存 130 件且 61-90天 110 件，积压风险高，建议限时折扣
              </p>
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className="text-green-500 shrink-0">●</span>
                电吹风 0-30天库存 410 件充足，建议维持当前补货节奏
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <InventoryWarehouseCapacity
        warehouseCapacityData={warehouseCapacityData}
        zoneSummary={zoneSummary}
        trend={trend}
        trendSummary={trendSummary}
        onTransferClick={() => setTransferDialogOpen(true)}
      />

      {/* 库存数据表 */}
      <InventoryDataTable
        onAdjustStock={(sku) => { setAdjustmentDefaultSku(sku); setAdjustmentDialogOpen(true); }}
        onViewDetail={viewInventoryDetail}
        onAddNote={(sku) => { toast.info('添加备注', { description: `SKU: ${sku} — 请在顶部备注中心添加` }); }}
      />

      {/* 库存预警时间线 */}
      <InventoryAlertTimeline />

      {/* 智能补货推荐 */}
      <ReorderRecommendationPanel />

      {/* 库存资金占用分析 */}
      <InventoryCapitalPanel />

      <InventoryProcurementSection
        procurementData={procurementData}
        budgetDialogOpen={budgetDialogOpen}
        onBudgetDialogOpenChange={setBudgetDialogOpen}
        budgetData={budgetData}
        timelineDialogOpen={timelineDialogOpen}
        onTimelineDialogOpenChange={setTimelineDialogOpen}
        timelineData={timelineData}
        onFetchBudget={fetchBudget}
        onFetchTimeline={fetchTimeline}
      />

      {/* Stock Transfer Dialog */}
      <TransferDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        warehouses={warehouseNames}
        inventory={inventoryForTransfer}
      />


      {/* 搜索和筛选 + 库存明细 */}
      <Card className="card-dashboard">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-base font-semibold">库存明细</CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <ExportMenu
                data={filteredInventory.map((inv: Inventory) => ({
                  sku: inv.sku,
                  productName: inv.productName,
                  warehouse: inv.warehouse,
                  quantity: inv.quantity,
                  safetyStock: inv.safetyStock,
                  inTransit: inv.inTransit,
                  turnoverDays: inv.turnoverDays,
                  status: STATUS_LABELS[inv.stockStatus],
                }))}
                columns={[
                  { key: 'sku', label: 'SKU' },
                  { key: 'productName', label: '产品名称' },
                  { key: 'warehouse', label: '仓库' },
                  { key: 'quantity', label: '当前库存' },
                  { key: 'safetyStock', label: '安全库存' },
                  { key: 'inTransit', label: '在途' },
                  { key: 'turnoverDays', label: '周转天数' },
                  { key: 'status', label: '状态' },
                ]}
                filename="库存数据"
                variant="outline"
                size="sm"
                label=""
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1 border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                onClick={() => { setAdjustmentDefaultSku(undefined); setAdjustmentDialogOpen(true); }}
              >
                <SlidersHorizontal className="h-3 w-3" />库存调整
              </Button>
              <div className="relative flex-1 sm:w-60">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="搜索 SKU/产品名/仓库..."
                  className="pl-8 h-8 text-sm focus:ring-1 focus:ring-orange-300 focus:border-orange-400 transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={inventoryFilter} onValueChange={setInventoryFilter}>
                <SelectTrigger className="w-28 h-8 text-sm focus:ring-1 focus:ring-orange-300">
                  <Filter className="h-3.5 w-3.5 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="healthy">健康</SelectItem>
                  <SelectItem value="warning">预警</SelectItem>
                  <SelectItem value="critical">紧急</SelectItem>
                  <SelectItem value="overstock">积压</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 px-2">
                    <Checkbox
                      checked={
                        batchSelection.isAllSelected
                          ? true
                          : batchSelection.isIndeterminate
                            ? 'indeterminate'
                            : false
                      }
                      onCheckedChange={() => batchSelection.toggleAll()}
                      aria-label="全选"
                    />
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">SKU</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">产品名称</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">仓库</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">当前库存</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">安全库存</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden md:table-cell">在途</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden md:table-cell">周转天数</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">状态</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="data-grid-stripe">
                {filteredInventory.map((inv: Inventory, idx: number) => (
                  <TableRow key={inv.id} className={`data-grid-row cursor-pointer hover:bg-orange-50/50 dark:hover:bg-orange-950/20 group relative border-l-[3px] transition-colors duration-200 ${
                    inv.stockStatus === 'critical' ? 'border-l-red-500 bg-red-50/30 dark:bg-red-950/10' :
                    inv.stockStatus === 'warning' ? 'border-l-amber-500 bg-amber-50/30 dark:bg-amber-950/10' :
                    inv.stockStatus === 'overstock' ? 'border-l-purple-500 bg-purple-50/30 dark:bg-purple-950/10' :
                    'border-l-emerald-400'
                  }`} onClick={() => viewInventoryDetail(inv.sku)}>
                    <TableCell className="w-10 px-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={batchSelection.selectedIds.has(inv.sku)}
                        onCheckedChange={() => batchSelection.toggleItem(inv.sku)}
                        aria-label={`选择 ${inv.sku}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{inv.sku}</TableCell>
                    <TableCell className="font-medium">{inv.productName}</TableCell>
                    <TableCell className="hidden sm:table-cell">{inv.warehouse}</TableCell>
                    <TableCell className="text-right">
                      <span className={inv.quantity < inv.safetyStock ? 'text-red-600 font-semibold' : ''}>{inv.quantity.toLocaleString()}</span>
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell">{inv.safetyStock.toLocaleString()}</TableCell>
                    <TableCell className="text-right hidden md:table-cell">
                      {inv.inTransit > 0 ? <span className="text-blue-600">{inv.inTransit}</span> : <span className="text-muted-foreground">0</span>}
                    </TableCell>
                    <TableCell className="text-right hidden md:table-cell">
                      <span className={inv.turnoverDays > 90 ? 'text-amber-600' : ''}>{inv.turnoverDays}</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        style={{ backgroundColor: STATUS_COLORS[inv.stockStatus] + '20', color: STATUS_COLORS[inv.stockStatus], borderColor: STATUS_COLORS[inv.stockStatus] + '40' }}
                        className={`text-xs tag-chip ${inv.stockStatus === 'critical' ? 'badge-pulse' : ''}`}
                      >
                        {STATUS_LABELS[inv.stockStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); viewInventoryDetail(inv.sku); }}>
                        <Eye className="h-3 w-3 mr-1" />详情
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {filteredInventory.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">未找到匹配的库存记录</p>
            </div>
          )}
        </CardContent>
      </Card>

      <InventoryDetailDialog
        open={!!selectedInventorySku}
        onOpenChange={(open) => { if (!open) setSelectedInventorySku(''); }}
        sku={selectedInventorySku}
        detail={inventoryDetail}
        reorderQty={reorderQty}
        onReorderQtyChange={setReorderQty}
        reorderWarehouse={reorderWarehouse}
        onReorderWarehouseChange={setReorderWarehouse}
        reorderPriority={reorderPriority}
        onReorderPriorityChange={setReorderPriority}
        onSubmitReorder={handleSubmitReorder}
      />

      {/* Stock Adjustment Dialog */}
      <StockAdjustmentDialog
        open={adjustmentDialogOpen}
        onOpenChange={setAdjustmentDialogOpen}
        defaultSku={adjustmentDefaultSku}
        inventory={inventory}
      />

      {/* Batch Actions Toolbar */}
      <BatchActionsToolbar
        selectedCount={batchSelection.selectedCount}
        onBatchReorder={handleBatchReorder}
        onBatchExport={handleBatchExport}
        onClearSelection={batchSelection.clearSelection}
      />
    </div>
  );
}
