'use client';

import { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  CheckCircle2, AlertTriangle, XCircle, Layers, Warehouse,
  Zap, Eye, Search, Download, Filter, RefreshCw, Activity,
  Shield, Boxes, ShoppingCart, Clock, DollarSign, SlidersHorizontal,
  TrendingUp, TrendingDown, Minus, ArrowRightLeft,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart as RechartsPieChart, Pie, Cell,
  ComposedChart, ReferenceLine,
  AreaChart, Area,
} from 'recharts';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ProductFilter } from '@/components/shared/ProductFilter';
import { FilterChips } from '@/components/shared/FilterChips';
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
import { useDashboardUIStore } from '@/stores/useDashboardUIStore';
import { useInventoryUIStore } from '@/stores/useInventoryUIStore';
import { STATUS_COLORS, STATUS_LABELS, AGING_COLORS, CHART_COLORS } from '@/lib/constants';
import { exportToCSV } from '@/lib/utils';
import type { Inventory } from '@prisma/client';
import { MetricCard } from '@/components/shared/MetricCard';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';

// ==================== Tooltip style shared across charts ====================
const CHART_TOOLTIP_STYLE = {
  borderRadius: '10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  border: '1px solid #e5e7eb',
  fontSize: '12px',
  backgroundColor: 'var(--tooltip-bg, #fff)',
};

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedSkus, setSelectedSkus] = useState<string[]>(() => {
    const fromUrl = searchParams.get('skus');
    return fromUrl ? fromUrl.split(',').filter(Boolean) : [];
  });
  const [skuLabels, setSkuLabels] = useState<Record<string, string>>({});

  // Sync selected SKUs to URL
  const updateSkus = useCallback((skus: string[]) => {
    setSelectedSkus(skus);
    const params = new URLSearchParams(searchParams.toString());
    if (skus.length > 0) params.set('skus', skus.join(','));
    else params.delete('skus');
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);
  const filterParams = useMemo(() => {
    const p: Record<string, string | number> = {};
    if (selectedSkus.length > 0) p.skus = selectedSkus.join(',');
    return p;
  }, [selectedSkus]);
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
    if ((agingResponse as any)?.data?.agingAnalysis && (agingResponse as any).data.agingAnalysis.length > 0) {
      const agingAnalysis = (agingResponse as any).data.agingAnalysis;
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

  // Loading state
  if (inventoryLoading && !inventoryData) return <DashboardSkeleton />;
  if (!inventoryData) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* ABC 分类 */}
        <Card className="card-dashboard chart-container">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">ABC 分类分布</CardTitle>
            <CardDescription>基于销售额贡献的产品分级</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <RechartsPieChart className="pie-slice-in">
                <Pie data={[
                  { class: 'A (核心)', count: 3, color: '#f97316' },
                  { class: 'B (重要)', count: 4, color: '#06b6d4' },
                  { class: 'C (一般)', count: 5, color: '#8b5cf6' },
                ]} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="count" nameKey="class" animationBegin={200}>
                  {[0, 1, 2].map(i => <Cell key={i} fill={['#f97316', '#06b6d4', '#8b5cf6'][i]} style={{ '--slice-index': i } as React.CSSProperties} />)}
                </Pie>
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              </RechartsPieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {[{ cls: 'A (核心)', desc: '占 80% 销售额', cnt: 3, color: '#f97316' }, { cls: 'B (重要)', desc: '占 15% 销售额', cnt: 4, color: '#06b6d4' }, { cls: 'C (一般)', desc: '占 5% 销售额', cnt: 5, color: '#8b5cf6' }].map(item => (
                <div key={item.cls} className="flex items-center justify-between text-sm p-1.5 rounded hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <div>
                      <span className="font-medium">{item.cls}</span>
                      <span className="text-xs text-muted-foreground ml-2">{item.desc}</span>
                    </div>
                  </div>
                  <span className="font-semibold">{item.cnt} 项</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 周转天数分布 */}
        <Card className="sm:col-span-2 lg:col-span-2 card-dashboard chart-container">
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

      {/* 滞销产品预警 */}
      {slowMoving.length > 0 && (
        <Card className="card-dashboard border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              滞销产品预警（周转 {'>'} 90 天）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {slowMoving.map((inv: Inventory) => (
                <div key={inv.id} className="bg-card rounded-lg p-3 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{inv.productName}</span>
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">{inv.turnoverDays}天</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">库存 {inv.quantity} | 安全库存 {inv.safetyStock}</p>
                  <p className="text-xs text-amber-600 mt-1">
                    {inv.turnoverDays > 180 ? '⚠ 建议清仓促销' : inv.turnoverDays > 120 ? '⚡ 建议减少采购' : '📊 关注趋势'}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* 仓库容量热力图 */}
      <Card className="card-dashboard border-l-[4px] border-l-violet-400">
        <CardHeader className="pb-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Warehouse className="h-4 w-4 text-violet-500" />
              仓库容量热力图
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-normal">
                {warehouseCapacityData ? ((warehouseCapacityData as any)?.capacity || []).length : '-'} 个仓库
              </Badge>
              {zoneSummary && (
                <>
                  {zoneSummary.criticalZones > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {zoneSummary.criticalZones} 满仓
                    </Badge>
                  )}
                  {zoneSummary.warningZones > 0 && (
                    <Badge variant="secondary" className="text-xs text-yellow-700 dark:text-yellow-400">
                      {zoneSummary.warningZones} 拥挤
                    </Badge>
                  )}
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1 border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                onClick={() => setTransferDialogOpen(true)}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                库存调拨
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {(() => {
            // Use API data if available, otherwise fallback to constant
            if (warehouseCapacityData) {
              const whCapacity = (warehouseCapacityData as any)?.capacity;
              if (!whCapacity) return null;
              const allZones = whCapacity.flatMap((wh: any) => wh.zones);
              const totalCap = whCapacity.reduce((s: number, wh: any) => s + wh.totalCapacity, 0);
              const totalUsed = whCapacity.reduce((s: number, wh: any) => s + wh.totalUsed, 0);
              const zoneColors: Record<string, string> = { fast: '#f97316', normal: '#22c55e', bulk: '#06b6d4' };
              const allRecommendations = whCapacity.flatMap((wh: any) => wh.recommendations || []);
              return (
                <>
                  {/* 总利用率 */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium">总利用率</span>
                      <span className="text-sm text-muted-foreground">
                        {totalUsed.toLocaleString()} / {totalCap.toLocaleString()} ({((totalUsed / totalCap) * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <Progress value={(totalUsed / totalCap) * 100} className="h-2 transition-all duration-500" />
                  </div>
                  {/* 仓库分布 */}
                  <div className="space-y-3 mb-5">
                    {whCapacity.map((wh: any) => {
                      const whPercent = (wh.totalUsed / wh.totalCapacity) * 100;
                      return (
                        <div key={wh.warehouse}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">{wh.warehouse}</span>
                            <span className="text-xs text-muted-foreground">{wh.totalUsed.toLocaleString()} / {wh.totalCapacity.toLocaleString()} ({whPercent.toFixed(1)}%)</span>
                          </div>
                          <Progress value={whPercent} className="h-1.5 transition-all duration-500" />
                        </div>
                      );
                    })}
                  </div>
                  {/* 区域卡片网格 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {allZones.map((zone: any, idx: number) => {
                      const zonePercent = zone.utilization;
                      const badgeColor = zonePercent > 90 ? 'destructive' : zonePercent > 70 ? 'secondary' : 'default';
                      const badgeTextColor = zonePercent > 90 ? 'text-red-600 dark:text-red-400' : zonePercent > 70 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400';
                      const zoneColor = zoneColors[zone.type] || CHART_COLORS[idx % CHART_COLORS.length];
                      return (
                        <div key={`${zone.warehouse}-${zone.name}`} className="rounded-lg border p-3 hover:shadow-md hover:scale-[1.02] transition-all duration-200" style={{ borderLeftWidth: '3px', borderLeftColor: zoneColor }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold">{zone.name}</span>
                            <Badge variant={badgeColor as 'default' | 'secondary' | 'destructive'} className={`text-[10px] pulse-soft ${badgeTextColor}`}>
                              {zonePercent.toFixed(0)}%
                            </Badge>
                          </div>
                          <Badge variant="outline" className="text-[10px] mb-2">{zone.type === 'fast' ? '高频拣选' : zone.type === 'normal' ? '常规存储' : '大件仓储'}</Badge>
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                              <span>{zone.used.toLocaleString()} / {zone.capacity.toLocaleString()}</span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full progress-fill-bar" style={{ width: `${zonePercent}%`, backgroundColor: zoneColor, transition: 'width 1s ease-out' }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* 容量建议 */}
                  {allRecommendations.length > 0 && (
                    <div className="mt-4 p-3 rounded-lg border bg-violet-50 dark:bg-violet-950/20">
                      <h4 className="text-sm font-semibold flex items-center gap-2 text-violet-700 dark:text-violet-400">
                        <Zap className="h-3.5 w-3.5" />
                        容量建议
                      </h4>
                      <div className="mt-2 space-y-1.5">
                        {allRecommendations.map((rec: string, rIdx: number) => (
                          <p key={rIdx} className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <span className="text-yellow-500 shrink-0">●</span>
                            {rec}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* 7天利用率趋势 */}
                  {trend.length > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold flex items-center gap-2 text-violet-700 dark:text-violet-400">
                          {(() => {
                            const TrendIcon = trendSummary?.trendDirection === 'increasing' ? TrendingUp
                              : trendSummary?.trendDirection === 'decreasing' ? TrendingDown : Minus;
                            return <TrendIcon className="h-4 w-4" />;
                          })()}
                          7天利用率趋势
                        </h4>
                        {trendSummary && (
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>当前: <b>{trendSummary.currentOverallUtilization}%</b></span>
                            <span>峰值: {trendSummary.peakUtilization}%</span>
                            <span>趋势:
                              <span className={
                                trendSummary.trendDirection === 'increasing' ? 'text-red-500 ml-1' :
                                trendSummary.trendDirection === 'decreasing' ? 'text-green-500 ml-1' : 'ml-1'
                              }>
                                {trendSummary.trendDirection === 'increasing' ? '↑ 上升' :
                                 trendSummary.trendDirection === 'decreasing' ? '↓ 下降' : '→ 稳定'}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                      <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={trend.map((d: any) => ({
                          date: d.date.slice(5),
                          utilization: d.overallUtilization,
                        }))}>
                          <defs>
                            <linearGradient id="utilGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number) => [`${value}%`, '利用率']} />
                          <Area
                            type="monotone"
                            dataKey="utilization"
                            stroke="#8b5cf6"
                            strokeWidth={2}
                            fill="url(#utilGradient)"
                            animationDuration={800}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              );
            }
            // Fallback to constant data
            return (
              <>
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium">总利用率</span>
                    <span className="text-sm text-muted-foreground">
                      {0} / {1} ({((0 / 1) * 100).toFixed(1)}%)
                    </span>
                  </div>
                  <Progress value={75} className="h-2 transition-all duration-500" />
                </div>
                <div className="space-y-3 mb-5">
                  {([] as Array<{ name: string; used: number; capacity: number }>).map((wh) => {
                    const whPercent = (wh.used / wh.capacity) * 100;
                    return (
                      <div key={wh.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">{wh.name}</span>
                          <span className="text-xs text-muted-foreground">{wh.used.toLocaleString()} / {wh.capacity.toLocaleString()} ({whPercent.toFixed(1)}%)</span>
                        </div>
                        <Progress value={whPercent} className="h-1.5 transition-all duration-500" />
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {([] as Array<{ name: string; used: number; capacity: number; color: string; category: string }>).map((zone) => {
                    const zonePercent = (zone.used / zone.capacity) * 100;
                    const badgeColor = zonePercent > 90 ? 'destructive' : zonePercent > 70 ? 'secondary' : 'default';
                    const badgeTextColor = zonePercent > 90 ? 'text-red-600 dark:text-red-400' : zonePercent > 70 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400';
                    return (
                      <div key={zone.name} className="rounded-lg border p-3 hover:shadow-md hover:scale-[1.02] transition-all duration-200" style={{ borderLeftWidth: '3px', borderLeftColor: zone.color }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold">{zone.name}</span>
                          <Badge variant={badgeColor as 'default' | 'secondary' | 'destructive'} className={`text-[10px] pulse-soft ${badgeTextColor}`}>
                            {zonePercent.toFixed(0)}%
                          </Badge>
                        </div>
                        <Badge variant="outline" className="text-[10px] mb-2">{zone.category}</Badge>
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>{zone.used.toLocaleString()} / {zone.capacity.toLocaleString()}</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full progress-fill-bar" style={{ width: `${zonePercent}%`, backgroundColor: zone.color, transition: 'width 1s ease-out' }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 p-3 rounded-lg border bg-violet-50 dark:bg-violet-950/20">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-violet-700 dark:text-violet-400">
                    <Zap className="h-3.5 w-3.5" />
                    容量建议
                  </h4>
                  <div className="mt-2 space-y-1.5">
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="text-yellow-500 shrink-0">●</span>
                      深圳仓 A 区利用率 84%，建议调拨部分库存至义乌仓
                    </p>
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="text-green-500 shrink-0">●</span>
                      义乌仓 E 区退货区利用率仅 35%，可临时调整为暂存区
                    </p>
                  </div>
                </div>
                {/* 7天利用率趋势 */}
                {trend.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2 text-violet-700 dark:text-violet-400">
                        {(() => {
                          const TrendIcon = trendSummary?.trendDirection === 'increasing' ? TrendingUp
                            : trendSummary?.trendDirection === 'decreasing' ? TrendingDown : Minus;
                          return <TrendIcon className="h-4 w-4" />;
                        })()}
                        7天利用率趋势
                      </h4>
                      {trendSummary && (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>当前: <b>{trendSummary.currentOverallUtilization}%</b></span>
                          <span>峰值: {trendSummary.peakUtilization}%</span>
                          <span>趋势:
                            <span className={
                              trendSummary.trendDirection === 'increasing' ? 'text-red-500 ml-1' :
                              trendSummary.trendDirection === 'decreasing' ? 'text-green-500 ml-1' : 'ml-1'
                            }>
                              {trendSummary.trendDirection === 'increasing' ? '↑ 上升' :
                               trendSummary.trendDirection === 'decreasing' ? '↓ 下降' : '→ 稳定'}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={trend.map((d: any) => ({
                        date: d.date.slice(5),
                        utilization: d.overallUtilization,
                      }))}>
                        <defs>
                          <linearGradient id="utilGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number) => [`${value}%`, '利用率']} />
                        <Area
                          type="monotone"
                          dataKey="utilization"
                          stroke="#8b5cf6"
                          strokeWidth={2}
                          fill="url(#utilGradient)"
                          animationDuration={800}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            );
          })()}
        </CardContent>
      </Card>

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

      {/* 采购计划 */}
      {procurementData && (procurementData as any)?.data?.items && (procurementData as any).data.items.length > 0 && (
        <Card className="card-dashboard border-l-[4px] border-l-amber-400">
          <CardHeader className="pb-2 bg-amber-50 dark:bg-amber-950/20">
            <CardTitle className="text-base font-semibold flex items-center gap-2" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <ShoppingCart className="h-4 w-4 text-amber-500" />
              采购计划
              <Badge variant="outline" className="ml-auto text-xs font-normal">{(procurementData as any).data.summary.totalItems} 项</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg border p-3 text-center bg-amber-50 dark:bg-amber-950/15">
                <p className="text-xs text-muted-foreground">总计划项</p>
                <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{(procurementData as any).data.summary.totalItems}</p>
              </div>
              <div className="rounded-lg border p-3 text-center bg-red-50 dark:bg-red-950/15">
                <p className="text-xs text-muted-foreground">紧急采购</p>
                <p className="text-lg font-bold text-red-700 dark:text-red-400">{(procurementData as any).data.summary.urgentItems}</p>
              </div>
              <div className="rounded-lg border p-3 text-center bg-emerald-50 dark:bg-emerald-950/15">
                <p className="text-xs text-muted-foreground">预计预算</p>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">¥{(procurementData as any).data.summary.totalBudget.toLocaleString()}</p>
              </div>
            </div>

            {/* Procurement Table */}
            <div className="max-h-72 overflow-y-auto overflow-x-auto custom-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">产品名</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">SKU</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">当前库存</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">安全库存</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">建议数量</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">优先级</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">预计成本</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="data-grid-stripe">
                  {(procurementData as any).data.items.map((item: { sku: string; productName: string; currentStock: number; safetyStock: number; suggestedQty: number; priority: string; estimatedCost: number }, idx: number) => {
                    const prioColors: Record<string, string> = {
                      critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                      high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
                      medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                      low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                    };
                    const prioLabels: Record<string, string> = { critical: '紧急', high: '高', medium: '中', low: '低' };
                    return (
                      <TableRow key={item.sku} className={`cursor-pointer hover:bg-amber-50/50 dark:hover:bg-amber-950/20 border-l-[3px] border-l-transparent hover:border-l-amber-400 transition-colors duration-200 ${idx % 2 === 0 ? '' : 'bg-muted/20'}`}>
                        <TableCell className="font-medium text-xs">{item.productName}</TableCell>
                        <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                        <TableCell className="text-right text-xs">
                          <span className={item.currentStock < item.safetyStock ? 'text-red-600 font-semibold' : ''}>{item.currentStock.toLocaleString()}</span>
                        </TableCell>
                        <TableCell className="text-right text-xs">{item.safetyStock.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-xs font-semibold">{item.suggestedQty.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${prioColors[item.priority] || prioColors.low}`}>
                            {prioLabels[item.priority] || item.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs">¥{item.estimatedCost.toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 mt-4">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 hover:bg-amber-50 dark:hover:bg-amber-950/20" onClick={fetchBudget}>
                <DollarSign className="h-3.5 w-3.5" />查看预算
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 hover:bg-amber-50 dark:hover:bg-amber-950/20" onClick={fetchTimeline}>
                <Clock className="h-3.5 w-3.5" />采购时间线
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stock Transfer Dialog */}
      <TransferDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        warehouses={warehouseNames}
        inventory={inventoryForTransfer}
      />

      {/* Budget Dialog */}
      <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
        <DialogContent className="max-w-lg backdrop-blur-sm border shadow-2xl dialog-scale-in">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-amber-500" />
              采购预算详情
            </DialogTitle>
            <DialogDescription>预算分解与优化建议</DialogDescription>
          </DialogHeader>
          {!!budgetData && (
            <div className="space-y-4">
              {/* Total Budget */}
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">总预算金额</span>
                  <span className="text-xl font-bold text-amber-700 dark:text-amber-400">¥{(budgetData as any).totalBudget.toLocaleString()}</span>
                </div>
                {(budgetData as any).bulkDiscount > 0 && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">批量折扣</span>
                    <span className="text-sm text-green-600 font-semibold">-¥{(budgetData as any).bulkDiscount.toLocaleString()}</span>
                  </div>
                )}
                {(budgetData as any).bulkDiscount > 0 && (
                  <div className="flex items-center justify-between mt-1 pt-1 border-t">
                    <span className="text-xs font-semibold">净预算</span>
                    <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">¥{(budgetData as any).netBudget.toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* By Category */}
              {(budgetData as any).byCategory && (budgetData as any).byCategory.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">按品类分解</h4>
                  <div className="space-y-2">
                    {(budgetData as any).byCategory.map((cat: { category: string; amount: number; items: number }) => {
                      const pct = (budgetData as any).totalBudget > 0 ? (cat.amount / (budgetData as any).totalBudget) * 100 : 0;
                      return (
                        <div key={cat.category}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span>{cat.category} ({cat.items} 项)</span>
                            <span className="font-semibold">¥{cat.amount.toLocaleString()}</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-amber-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* By Priority */}
              {(budgetData as any).byPriority && (budgetData as any).byPriority.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">按优先级分解</h4>
                  <div className="space-y-2">
                    {(budgetData as any).byPriority.map((p: { priority: string; amount: number; items: number }) => {
                      const prioColors: Record<string, string> = { '紧急': '#ef4444', '高': '#f97316', '中': '#f59e0b', '低': '#22c55e' };
                      const pct = (budgetData as any).totalBudget > 0 ? (p.amount / (budgetData as any).totalBudget) * 100 : 0;
                      return (
                        <div key={p.priority}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span>{p.priority}优先级 ({p.items} 项)</span>
                            <span className="font-semibold">¥{p.amount.toLocaleString()}</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: prioColors[p.priority] || '#f59e0b' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Timeline Dialog */}
      <Dialog open={timelineDialogOpen} onOpenChange={setTimelineDialogOpen}>
        <DialogContent className="max-w-lg backdrop-blur-sm border shadow-2xl dialog-scale-in">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              采购时间线
            </DialogTitle>
            <DialogDescription>采购订单排期与预计到货</DialogDescription>
          </DialogHeader>
          {!!timelineData && (
            <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
              {(timelineData as any).timeline.map((item: { sku: string; productName: string; orderDate: string; expectedDelivery: string; leadTime: number; quantity: number; status: string; priority: string }, idx: number) => {
                const statusColors: Record<string, string> = { ordering: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', planned: 'bg-muted text-muted-foreground' };
                return (
                  <div key={item.sku} className="flex items-start gap-3 p-2.5 rounded-lg border hover:bg-muted/30 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-xs font-bold text-amber-700 dark:text-amber-400 shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{item.productName}</span>
                        <Badge className={`text-[10px] ${statusColors[item.status] || statusColors.planned}`}>{item.status === 'ordering' ? '采购中' : '计划中'}</Badge>
                        <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{item.priority}</Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span>下单: {item.orderDate}</span>
                        <span>到货: {item.expectedDelivery}</span>
                        <span>交期: {item.leadTime}天</span>
                        <span>数量: {item.quantity}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 搜索和筛选 + 库存明细 */}
      <Card className="card-dashboard">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-base font-semibold">库存明细</CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => exportToCSV(
                filteredInventory.map((inv: Inventory) => ({
                  sku: inv.sku, productName: inv.productName, warehouse: inv.warehouse,
                  quantity: inv.quantity, safetyStock: inv.safetyStock, inTransit: inv.inTransit,
                  turnoverDays: inv.turnoverDays, status: STATUS_LABELS[inv.stockStatus],
                })),
                '库存数据',
                [
                  { key: 'sku', label: 'SKU' }, { key: 'productName', label: '产品名称' },
                  { key: 'warehouse', label: '仓库' }, { key: 'quantity', label: '当前库存' },
                  { key: 'safetyStock', label: '安全库存' }, { key: 'inTransit', label: '在途' },
                  { key: 'turnoverDays', label: '周转天数' }, { key: 'status', label: '状态' },
                ]
              )}>
                <Download className="h-3 w-3" />导出 CSV
              </Button>
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
                  <TableRow key={inv.id} className={`data-grid-row cursor-pointer hover:bg-orange-50/50 dark:hover:bg-orange-950/20 group relative border-l-[3px] border-l-transparent hover:border-l-orange-400 transition-colors duration-200`} onClick={() => viewInventoryDetail(inv.sku)}>
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

      {/* 库存详情弹窗 */}
      <Dialog open={!!selectedInventorySku} onOpenChange={(open) => { if (!open) setSelectedInventorySku(''); }}>
        <DialogContent className="max-w-lg backdrop-blur-sm border shadow-2xl dialog-scale-in">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-orange-500" />
              库存详情 - {selectedInventorySku}
            </DialogTitle>
            <DialogDescription>库存健康度、安全库存与补货建议</DialogDescription>
          </DialogHeader>
          {inventoryDetail ? (
            <div className="space-y-4">
              {/* 健康度 */}
              <div className="p-3 rounded-lg border bg-muted/30">
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-orange-500" />库存健康度
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">当前库存:</span> <span className="font-medium">{(inventoryDetail as any).health.quantity}</span></div>
                  <div><span className="text-muted-foreground">安全库存:</span> <span className="font-medium">{(inventoryDetail as any).health.safetyStock}</span></div>
                  <div><span className="text-muted-foreground">周转率:</span> <span className="font-medium">{(inventoryDetail as any).health.turnoverRate}</span></div>
                  <div><span className="text-muted-foreground">周转天数:</span> <span className="font-medium">{(inventoryDetail as any).health.turnoverDays}</span></div>
                  <div><span className="text-muted-foreground">ABC 分类:</span> <Badge variant="outline">{(inventoryDetail as any).health.abcClass}</Badge></div>
                  <div><span className="text-muted-foreground">FSN 分类:</span> <Badge variant="outline">{(inventoryDetail as any).health.fsnClass}</Badge></div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">库存水位:</span>
                  <div className="flex-1">
                    <Progress value={Math.min(100, ((inventoryDetail as any).health.quantity / (inventoryDetail as any).health.reorderPoint) * 100)} className="h-2 transition-all duration-500" />
                  </div>
                  <Badge
                    style={{ backgroundColor: STATUS_COLORS[(inventoryDetail as any).health.stockStatus] + '20', color: STATUS_COLORS[(inventoryDetail as any).health.stockStatus] }}
                  >
                    {STATUS_LABELS[(inventoryDetail as any).health.stockStatus]}
                  </Badge>
                </div>
              </div>
              {/* 安全库存 */}
              <div className="p-3 rounded-lg border bg-muted/30">
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-cyan-500" />安全库存计算
                </h4>
                <div className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">服务水平:</span> <span className="font-medium">{((inventoryDetail as any).safety.serviceLevel * 100).toFixed(0)}%</span></div>
                  <div><span className="text-muted-foreground">安全库存:</span> <span className="font-medium text-lg">{(inventoryDetail as any).safety.safetyStock}</span></div>
                  <div className="text-xs text-muted-foreground mt-1 font-mono bg-muted/50 p-2 rounded">{(inventoryDetail as any).safety.formula}</div>
                </div>
              </div>
              {/* 补货建议 */}
              {(inventoryDetail as any).reorder && (
                <div className="p-3 rounded-lg border bg-muted/30">
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-violet-500" />补货建议
                  </h4>
                  <div className="text-sm space-y-1">
                    <div><span className="text-muted-foreground">当前库存:</span> <span className="font-medium">{(inventoryDetail as any).reorder.currentStock}</span></div>
                    <div><span className="text-muted-foreground">在途库存:</span> <span className="font-medium">{(inventoryDetail as any).reorder.inTransit}</span></div>
                    <div><span className="text-muted-foreground">建议补货:</span> <span className="font-bold text-lg text-violet-600">{(inventoryDetail as any).reorder.recommendedOrder}</span></div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-muted-foreground">紧急程度:</span>
                      <Badge variant={(inventoryDetail as any).reorder.urgency === 'urgent' ? 'destructive' : (inventoryDetail as any).reorder.urgency === 'normal' ? 'default' : 'secondary'}>
                        {(inventoryDetail as any).reorder.urgency === 'urgent' ? '紧急' : (inventoryDetail as any).reorder.urgency === 'normal' ? '常规' : '低优先'}
                      </Badge>
                    </div>
                  </div>
                  <Separator className="my-3" />
                  {/* 补货操作表单 */}
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-orange-500" />补货操作
                  </h4>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">订单数量</label>
                      <Input
                        type="number"
                        min={1}
                        value={reorderQty || (inventoryDetail as any).reorder.recommendedOrder || 0}
                        onChange={(e) => setReorderQty(Number(e.target.value))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">目标仓库</label>
                      <Select value={reorderWarehouse} onValueChange={setReorderWarehouse}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="深圳仓">深圳仓</SelectItem>
                          <SelectItem value="义乌仓">义乌仓</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">优先级</label>
                      <Select value={reorderPriority} onValueChange={setReorderPriority}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="常规">常规</SelectItem>
                          <SelectItem value="紧急">紧急</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                      onClick={handleSubmitReorder}
                    >
                      <Zap className="h-4 w-4 mr-1" />
                      确认下单
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Stock Adjustment Dialog */}
      <StockAdjustmentDialog
        open={adjustmentDialogOpen}
        onOpenChange={setAdjustmentDialogOpen}
        defaultSku={adjustmentDefaultSku}
        inventory={inventory}
      />
    </div>
  );
}
