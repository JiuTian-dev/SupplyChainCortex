'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Globe, CheckCircle2, Clock, Target, Star, Plus,
  Building2, Search, Pencil, Phone, Mail,
  Filter, LayoutList, Rows3, ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { VirtualTableList } from '@/components/shared/VirtualList';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  useSuppliers, useReorder, useAnalytics, useWarehouse,
} from '@/hooks/use-supply-chain-data';
import { useSupplierUIStore } from '@/stores/useSupplierUIStore';
import { SUPPLIER_CATEGORIES, SUPPLIER_REGIONS, CHART_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { Supplier } from '@prisma/client';
import { MetricCard } from '@/components/shared/MetricCard';
import { DashboardSkeleton } from '@/components/shared/Skeleton';
import { ExportMenu } from '@/components/shared/ExportMenu';
import { BatchActionsToolbar } from '@/components/shared/BatchActionsToolbar';
import { useBatchSelection } from '@/hooks/use-batch-selection';
import { Checkbox } from '@/components/ui/checkbox';
import { exportToCSV as exportBatchToCSV } from '@/lib/services/batch-export.service';
import { SupplierRatingDialog } from './SupplierRatingDialog';
import { SupplierComparisonPanel } from './SupplierComparisonPanel';
import dynamic from 'next/dynamic';
import { LazyLoader } from '@/components/shared/LazyLoader';
import { SupplierAnalyticsPanel } from './SupplierAnalyticsPanel';
import { CHART_TOOLTIP_STYLE, StarRating, SupplierForm } from './SupplierTab.helpers';
import { SupplierPerformancePanel } from './SupplierPerformancePanel';
import { SupplierReorderOrders } from './SupplierReorderOrders';
import { SupplierDetailDialog } from './SupplierDetailDialog';

const SupplierGeoMap = dynamic(
  () => import('./SupplierGeoMap').then((m) => ({ default: m.SupplierGeoMap })),
  { loading: () => <LazyLoader type="chart" className="h-[300px]" />, ssr: false }
);


// ==================== Main SupplierTab Component ====================

export function SupplierTab() {
  const queryClient = useQueryClient();

  // Zustand store for supplier UI state
  const {
    supplierFilter, setSupplierFilter,
    supplierRegionFilter, setSupplierRegionFilter,
    expandedSupplier, setExpandedSupplier,
    addSupplierOpen, setAddSupplierOpen,
    newSupplier, setNewSupplier,
    selectedSupplier, setSelectedSupplier,
    supplierDetailOpen, setSupplierDetailOpen,
    supplierSearchQuery, setSupplierSearchQuery,
    supplierStatusFilter, setSupplierStatusFilter,
    editSupplierOpen, setEditSupplierOpen,
    editingSupplier, setEditingSupplier,
  } = useSupplierUIStore();

  // React Query hooks for data fetching
  const { data: supplierData, isLoading: supplierLoading } = useSuppliers() as { data: Record<string, any> | undefined; isLoading: boolean };
  const { data: performanceData } = useAnalytics('supplier-performance');
  const { data: reorderData } = useReorder();
  const { data: warehouseCapacityData } = useWarehouse('capacity');

  // Local state
  const [supplierVirtualMode, setSupplierVirtualMode] = useState(true);
  const [supplierDetailTab, setSupplierDetailTab] = useState('details');
  const [ratingDialogOpen, setRatingDialogOpen] = useState(false);
  const [ratingSupplier, setRatingSupplier] = useState<Supplier | null>(null);

  // Derived data from React Query responses
  const suppliers = useMemo<Supplier[]>(() => {
    if (!supplierData) return [];
    return ((supplierData as any)?.data ?? supplierData as Record<string, unknown>)?.suppliers as Supplier[] || [];
  }, [supplierData]);

  const supplierPerformance = useMemo(() => {
    if (!performanceData) return null;
    const payload = (performanceData as any)?.data ?? performanceData;
    return (payload as Record<string, unknown>)?.suppliers ? payload as Record<string, unknown> : null;
  }, [performanceData]);

  const reorderOrders = useMemo(() => {
    if (!reorderData) return [];
    return ((reorderData as any)?.data ?? reorderData as Record<string, unknown>)?.orders as Record<string, unknown>[] || [];
  }, [reorderData]);

  // Filtered suppliers (region + category + status + search)
  const filteredSuppliers = useMemo(() => {
    let result = suppliers;
    if (supplierRegionFilter !== 'all') {
      result = result.filter((s) => s.region === supplierRegionFilter);
    }
    if (supplierFilter !== 'all') {
      result = result.filter((s) => s.category === supplierFilter);
    }
    if (supplierStatusFilter !== 'all') {
      result = result.filter((s) => s.status === supplierStatusFilter);
    }
    if (supplierSearchQuery) {
      const q = supplierSearchQuery.toLowerCase();
      result = result.filter((s) =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.region.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        (s.contact && s.contact.toLowerCase().includes(q))
      );
    }
    return result;
  }, [suppliers, supplierRegionFilter, supplierFilter, supplierStatusFilter, supplierSearchQuery]);

  // Batch selection for the supplier tables
  const batchSelection = useBatchSelection(
    filteredSuppliers,
    (item: Supplier) => item.id,
  );

  // Unique regions and categories from data
  const regions = useMemo(() => [...new Set(suppliers.map((s) => s.region))], [suppliers]);
  const categories = useMemo(() => [...new Set(suppliers.map((s) => s.category))], [suppliers]);

  // Supplier form field change handler
  const handleNewSupplierChange = useCallback((field: string, value: string | number) => {
    setNewSupplier({ ...newSupplier, [field]: value } as typeof newSupplier);
  }, [newSupplier, setNewSupplier]);

  const handleEditSupplierChange = useCallback((field: string, value: string | number) => {
    if (!editingSupplier) return;
    setEditingSupplier({ ...editingSupplier, [field]: value });
  }, [editingSupplier, setEditingSupplier]);

  // Add supplier submit
  const handleAddSupplier = useCallback(async () => {
    if (!newSupplier.code || !newSupplier.name || !newSupplier.region || !newSupplier.category) {
      toast.error('请填写必填字段', { description: '编码、名称、地区、品类为必填' });
      return;
    }
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSupplier),
      });
      const data = await res.json();
      if ((data as Record<string, unknown>).success) {
        toast.success('供应商已添加', { description: `${newSupplier.name} (${newSupplier.code})` });
        setAddSupplierOpen(false);
        setNewSupplier({ code: '', name: '', contact: '', email: '', phone: '', region: '', category: '', leadTime: 14, rating: 0 });
        queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      } else {
        toast.error('添加失败', { description: (data as Record<string, unknown>).error as string || '未知错误' });
      }
    } catch {
      toast.error('网络错误');
    }
  }, [newSupplier, setAddSupplierOpen, setNewSupplier, queryClient]);

  // Edit supplier submit
  const handleEditSupplier = useCallback(async () => {
    if (!editingSupplier) return;
    try {
      const res = await fetch('/api/suppliers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingSupplier),
      });
      const data = await res.json();
      if ((data as Record<string, unknown>).success) {
        toast.success('供应商已更新', { description: (editingSupplier as Record<string, unknown>).name as string });
        setEditSupplierOpen(false);
        setEditingSupplier(null);
        queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      } else {
        toast.error('更新失败', { description: (data as Record<string, unknown>).error as string || '未知错误' });
      }
    } catch {
      toast.error('网络错误');
    }
  }, [editingSupplier, setEditSupplierOpen, setEditingSupplier, queryClient]);

  // Toggle supplier status (active/suspended)
  const handleToggleStatus = useCallback(async (supplier: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/suppliers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: supplier.id, status: supplier.status === 'active' ? 'suspended' : 'active' }),
      });
      const data = await res.json();
      if ((data as Record<string, unknown>).success) {
        toast.success(supplier.status === 'active' ? '供应商已暂停' : '供应商已恢复', { description: supplier.name as string });
        setSupplierDetailOpen(false);
        queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      }
    } catch {
      toast.error('操作失败');
    }
  }, [setSupplierDetailOpen, queryClient]);

  // Reorder status update
  const handleReorderStatusUpdate = useCallback(async (orderId: string, newStatus: string, sku: string, quantity: number) => {
    try {
      const res = await fetch('/api/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, status: newStatus }),
      });
      const data = await res.json();
      if ((data as Record<string, unknown>).success) {
        const statusLabels: Record<string, string> = { approved: '已审批', shipped: '已发货', delivered: '已送达' };
        toast.success(`订单${statusLabels[newStatus] || '已更新'}`, { description: `${sku} x${quantity}` });
        queryClient.invalidateQueries({ queryKey: ['reorder'] });
      } else {
        toast.error('操作失败', { description: (data as Record<string, unknown>).error as string });
      }
    } catch {
      toast.error('网络错误');
    }
  }, [queryClient]);

  // Open edit dialog with pre-filled data
  const openEditDialog = useCallback((supplier: Record<string, unknown>) => {
    setEditingSupplier({
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
      contact: supplier.contact || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      region: supplier.region,
      category: supplier.category,
      leadTime: supplier.leadTime,
      rating: supplier.rating,
    });
    setEditSupplierOpen(true);
  }, [setEditingSupplier, setEditSupplierOpen]);

  // ─── Batch operations ───────────────────────────────────────────────────────

  const handleBatchExportSuppliers = useCallback(() => {
    const selected = filteredSuppliers.filter((s) =>
      batchSelection.selectedIds.has(s.id),
    );
    if (selected.length === 0) return;

    const mapped = selected.map((s: Supplier) => ({
      编码: s.code,
      名称: s.name,
      地区: s.region,
      品类: s.category,
      交货天数: s.leadTime,
      评分: s.rating,
      状态: s.status === 'active' ? '活跃' : s.status === 'suspended' ? '暂停' : '停用',
      联系人: s.contact || '',
      邮箱: s.email || '',
      电话: s.phone || '',
    }));

    exportBatchToCSV(mapped, '供应商数据_已选');
  }, [filteredSuppliers, batchSelection.selectedIds]);

  // Loading state
  if (supplierLoading && !supplierData) return <DashboardSkeleton />;
  if (!supplierData) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      {/* ==================== 供应商概览 ==================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard title="供应商总数" value={String(suppliers.length)} icon={<Globe className="h-4 w-4" />} subtitle="合作伙伴" color="text-orange-600 dark:text-orange-400" bgColor="bg-orange-50 dark:bg-orange-950/20" />
        <MetricCard title="活跃供应商" value={String(suppliers.filter((s) => s.status === 'active').length)} icon={<CheckCircle2 className="h-4 w-4" />} subtitle="正常合作" color="text-emerald-600 dark:text-emerald-400" bgColor="bg-emerald-50 dark:bg-emerald-950/20" />
        <MetricCard title="平均交货期" value={`${suppliers.length > 0 ? Math.round(suppliers.reduce((a: number, s) => a + s.leadTime, 0) / suppliers.length) : 0}天`} icon={<Clock className="h-4 w-4" />} subtitle="从下单到收货" color="text-cyan-600 dark:text-cyan-400" bgColor="bg-cyan-50 dark:bg-cyan-950/20" />
        <MetricCard title="平均评分" value={suppliers.length > 0 ? (suppliers.reduce((a: number, s) => a + s.rating, 0) / suppliers.length).toFixed(1) : '0'} icon={<Target className="h-4 w-4" />} subtitle="5 分制" color="text-violet-600 dark:text-violet-400" bgColor="bg-violet-50 dark:bg-violet-950/20" />
      </div>

      <SupplierPerformancePanel
        supplierPerformance={supplierPerformance as Record<string, unknown> | null}
        suppliers={suppliers}
      />

      {/* ==================== 供应商对比 ==================== */}
      <SupplierComparisonPanel
        suppliers={suppliers}
        supplierPerformance={supplierPerformance}
      />

      {/* ==================== 供应商地理分布 ==================== */}
      <SupplierGeoMap />

      {/* ==================== 供应商分析面板 ==================== */}
      <SupplierAnalyticsPanel
        suppliers={suppliers}
      />

      {/* ==================== 筛选 + 操作 ==================== */}
      <Card className="card-dashboard">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Globe className="h-4 w-4 text-orange-500" />
            供应商列表
            <Badge variant="outline" className="text-xs font-normal">{filteredSuppliers.length} 家</Badge>
            <ExportMenu
              data={filteredSuppliers.map((s) => ({
                code: s.code,
                name: s.name,
                region: s.region,
                category: s.category,
                leadTime: s.leadTime,
                rating: s.rating,
                status: s.status === 'active' ? '活跃' : s.status === 'suspended' ? '暂停' : '停用',
                contact: s.contact || '',
                email: s.email || '',
                phone: s.phone || '',
              }))}
              columns={[
                { key: 'code', label: '编码' },
                { key: 'name', label: '名称' },
                { key: 'region', label: '地区' },
                { key: 'category', label: '品类' },
                { key: 'leadTime', label: '交货天数' },
                { key: 'rating', label: '评分' },
                { key: 'status', label: '状态' },
                { key: 'contact', label: '联系人' },
                { key: 'email', label: '邮箱' },
                { key: 'phone', label: '电话' },
              ]}
              filename="供应商数据"
              variant="outline"
              size="sm"
              label=""
            />
            <Button
              variant={supplierVirtualMode ? 'default' : 'outline'}
              size="sm"
              className="ml-auto h-7 text-xs gap-1"
              onClick={() => setSupplierVirtualMode(!supplierVirtualMode)}
              title={supplierVirtualMode ? '切换到普通模式' : '切换到虚拟滚动模式'}
            >
              {supplierVirtualMode ? <LayoutList className="h-3 w-3" /> : <Rows3 className="h-3 w-3" />}
              {supplierVirtualMode ? '虚拟滚动' : '普通'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filter bar */}
          <div className="flex flex-wrap gap-3 mb-4">
            <Select value={supplierRegionFilter} onValueChange={setSupplierRegionFilter}>
              <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue placeholder="地区筛选" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部地区</SelectItem>
                {regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue placeholder="品类筛选" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部品类</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={supplierStatusFilter} onValueChange={setSupplierStatusFilter}>
              <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue placeholder="状态筛选" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">活跃</SelectItem>
                <SelectItem value="suspended">暂停</SelectItem>
                <SelectItem value="inactive">停用</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="搜索供应商编码/名称/地区..."
                value={supplierSearchQuery}
                onChange={(e) => setSupplierSearchQuery(e.target.value)}
                className="h-9 text-sm pl-8"
              />
            </div>
            <Button
              className="ml-auto bg-orange-500 text-white text-sm h-9"
              onClick={() => setAddSupplierOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />添加供应商
            </Button>
          </div>

          {/* ==================== 供应商概览卡片 ==================== */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {filteredSuppliers.slice(0, 6).map((s) => (
              <Card
                key={s.id}
                className="hover:shadow-lg hover:-translate-y-1 hover:border-orange-300 dark:hover:border-orange-700 transition-all duration-300 cursor-pointer"
                onClick={() => {
                  setSelectedSupplier(s);
                  setSupplierDetailOpen(true);
                  setSupplierDetailTab('details');
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{s.name}</span>
                        <Badge variant="outline" className="text-[9px] shrink-0">{s.region}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{s.code}</p>
                    </div>
                    <Badge className={cn('text-[10px] shrink-0', s.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : s.status === 'suspended' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-950/30 dark:text-gray-300')}>
                      {s.status === 'active' ? '活跃' : s.status === 'suspended' ? '暂停' : '停用'}
                    </Badge>
                  </div>
                  <div className="space-y-1.5">
                    <StarRating rating={s.rating} size="sm" />
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>交货期 {s.leadTime}天</span>
                    </div>
                    {s.contact && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        <span className="truncate">{s.contact}</span>
                      </div>
                    )}
                    {s.email && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{s.email}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 flex-1" onClick={(e) => { e.stopPropagation(); openEditDialog(s as unknown as Record<string, unknown>); }}>
                      <Pencil className="h-2.5 w-2.5" />编辑
                    </Button>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 flex-1" onClick={(e) => { e.stopPropagation(); setSelectedSupplier(s); setSupplierDetailOpen(true); setSupplierDetailTab('details'); }}>
                      <ExternalLink className="h-2.5 w-2.5" />详情
                    </Button>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 flex-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 dark:hover:bg-amber-950/30 border-amber-200 dark:border-amber-800" onClick={(e) => { e.stopPropagation(); setRatingSupplier(s); setRatingDialogOpen(true); }}>
                      <Star className="h-2.5 w-2.5 text-amber-500" />评分
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {filteredSuppliers.length > 6 && (
            <p className="text-xs text-muted-foreground text-center mb-4">
              显示前 6 家供应商卡片，共 {filteredSuppliers.length} 家，详见下方表格
            </p>
          )}

          {/* ==================== 供应商表格 ==================== */}
          {supplierVirtualMode ? (
            <>
              {/* Virtual scroll header */}
              <div className="rounded-t-lg border border-b-0 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
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
                      <TableHead className="text-xs uppercase tracking-wider">编码</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">名称</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">地区</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">品类</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">交货期</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">评分</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">状态</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                </Table>
              </div>
              {/* Virtual scroll body */}
              <VirtualTableList
                items={filteredSuppliers}
                renderRow={(s: Supplier) => (
                  <div
                    className="flex items-center border-b hover:bg-muted/30 hover:border-l-orange-400 transition-all cursor-pointer px-4 py-2 border-l-[3px] border-l-transparent"
                    onClick={() => {
                      setSelectedSupplier(s);
                      setSupplierDetailOpen(true);
                      setSupplierDetailTab('details');
                    }}
                  >
                    <div className="w-10 shrink-0 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={batchSelection.selectedIds.has(s.id)}
                        onCheckedChange={() => batchSelection.toggleItem(s.id)}
                        aria-label={`选择 ${s.code}`}
                      />
                    </div>
                    <span className="font-mono text-xs w-20 shrink-0">{s.code}</span>
                    <span className="font-medium text-sm w-28 shrink-0 truncate">{s.name}</span>
                    <span className="w-20 shrink-0"><Badge variant="outline" className="text-[10px]">{s.region}</Badge></span>
                    <span className="text-xs text-muted-foreground w-24 shrink-0 truncate">{s.category}</span>
                    <span className="text-sm w-16 shrink-0">{s.leadTime}天</span>
                    <span className="w-24 shrink-0"><StarRating rating={s.rating} size="sm" /></span>
                    <span className="w-16 shrink-0">
                      <Badge className={cn('text-[10px]', s.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : s.status === 'suspended' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-950/30 dark:text-gray-300')}>
                        {s.status === 'active' ? '活跃' : s.status === 'suspended' ? '暂停' : '停用'}
                      </Badge>
                    </span>
                    <span className="flex gap-1 ml-auto shrink-0">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); openEditDialog(s as unknown as Record<string, unknown>); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20" onClick={(e) => { e.stopPropagation(); setRatingSupplier(s); setRatingDialogOpen(true); }}>
                        <Star className="h-3 w-3" />
                      </Button>
                    </span>
                  </div>
                )}
                estimateSize={45}
                maxHeight={480}
                overscan={6}
                emptyMessage="没有匹配的供应商"
                className="border rounded-b-lg"
              />
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground px-1">
                <span>虚拟滚动 · 共 {filteredSuppliers.length} 家</span>
                <span>滚动查看更多 ↓</span>
              </div>
            </>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
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
                    <TableHead className="text-xs uppercase tracking-wider">编码</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">名称</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">地区</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">品类</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">交货期</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">评分</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">状态</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSuppliers.map((s) => (
                    <TableRow
                      key={s.id}
                      className="hover:bg-muted/30 border-l-[3px] hover:border-l-orange-400 transition-all cursor-pointer"
                      onClick={() => {
                        setSelectedSupplier(s);
                        setSupplierDetailOpen(true);
                        setSupplierDetailTab('details');
                      }}
                    >
                      <TableCell className="w-10 px-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={batchSelection.selectedIds.has(s.id)}
                          onCheckedChange={() => batchSelection.toggleItem(s.id)}
                          aria-label={`选择 ${s.code}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.code}</TableCell>
                      <TableCell className="font-medium text-sm">{s.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{s.region}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.category}</TableCell>
                      <TableCell className="text-sm">{s.leadTime}天</TableCell>
                      <TableCell><StarRating rating={s.rating} size="sm" /></TableCell>
                      <TableCell>
                        <Badge className={cn('text-[10px]', s.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : s.status === 'suspended' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-950/30 dark:text-gray-300')}>
                          {s.status === 'active' ? '活跃' : s.status === 'suspended' ? '暂停' : '停用'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); openEditDialog(s as unknown as Record<string, unknown>); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20" onClick={(e) => { e.stopPropagation(); setRatingSupplier(s); setRatingDialogOpen(true); }}>
                            <Star className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {filteredSuppliers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Filter className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">没有匹配的供应商</p>
              <p className="text-xs mt-1">尝试调整筛选条件</p>
            </div>
          )}
        </CardContent>
      </Card>

      <SupplierReorderOrders
        reorderOrders={reorderOrders}
        onReorderStatusUpdate={handleReorderStatusUpdate}
      />


      {/* ==================== Add Supplier Dialog ==================== */}
      <Dialog open={addSupplierOpen} onOpenChange={setAddSupplierOpen}>
        <DialogContent className="max-w-lg backdrop-blur-sm border shadow-2xl dialog-scale-in">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-amber-500" />
              添加供应商
            </DialogTitle>
            <DialogDescription>填写供应商基本信息以添加到系统</DialogDescription>
          </DialogHeader>
          <SupplierForm form={newSupplier} onChange={handleNewSupplierChange} />
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => {
              setAddSupplierOpen(false);
              setNewSupplier({ code: '', name: '', contact: '', email: '', phone: '', region: '', category: '', leadTime: 14, rating: 0 });
            }}>取消</Button>
            <Button className="flex-1 bg-amber-500 text-white" onClick={handleAddSupplier}>确认添加</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== Edit Supplier Dialog ==================== */}
      <Dialog open={editSupplierOpen} onOpenChange={setEditSupplierOpen}>
        <DialogContent className="max-w-lg backdrop-blur-sm border shadow-2xl dialog-scale-in">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-amber-500" />
              编辑供应商
            </DialogTitle>
            <DialogDescription>修改供应商信息</DialogDescription>
          </DialogHeader>
          {!!editingSupplier && (
            <>
              <SupplierForm
                form={{
                  code: (editingSupplier as Record<string, unknown>).code as string,
                  name: (editingSupplier as Record<string, unknown>).name as string,
                  contact: (editingSupplier as Record<string, unknown>).contact as string || '',
                  email: (editingSupplier as Record<string, unknown>).email as string || '',
                  phone: (editingSupplier as Record<string, unknown>).phone as string || '',
                  region: (editingSupplier as Record<string, unknown>).region as string,
                  category: (editingSupplier as Record<string, unknown>).category as string,
                  leadTime: (editingSupplier as Record<string, unknown>).leadTime as number,
                  rating: (editingSupplier as Record<string, unknown>).rating as number,
                }}
                onChange={handleEditSupplierChange}
              />
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setEditSupplierOpen(false); setEditingSupplier(null); }}>取消</Button>
                <Button className="flex-1 bg-amber-500 text-white" onClick={handleEditSupplier}>保存修改</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <SupplierDetailDialog
        open={supplierDetailOpen}
        onOpenChange={setSupplierDetailOpen}
        selectedSupplier={selectedSupplier as Record<string, unknown> | null}
        detailTab={supplierDetailTab}
        onDetailTabChange={setSupplierDetailTab}
        supplierPerformance={supplierPerformance as Record<string, unknown> | null}
        reorderOrders={reorderOrders}
        onToggleStatus={(supplier) => handleToggleStatus(supplier)}
        onEditClick={(supplier) => openEditDialog(supplier)}
      />

      {/* ==================== Supplier Rating Dialog ==================== */}
      <SupplierRatingDialog
        open={ratingDialogOpen}
        onOpenChange={setRatingDialogOpen}
        supplier={ratingSupplier}
      />

      {/* Batch Actions Toolbar */}
      <BatchActionsToolbar
        selectedCount={batchSelection.selectedCount}
        onBatchExport={handleBatchExportSuppliers}
        onClearSelection={batchSelection.clearSelection}
      />
    </div>
  );
}
