'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  Globe, CheckCircle2, Clock, Target, Star, Plus,
  Building2, XCircle, ExternalLink, ShoppingCart,
  Warehouse, ChevronRight, Search, Pencil, Phone, Mail,
  PackageCheck, Ship, Filter, LayoutList, Rows3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import { VirtualTableList } from '@/components/shared/VirtualList';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  useSuppliers, useReorder, useAnalytics, useWarehouse,
} from '@/hooks/use-supply-chain-data';
import { useUIStore } from '@/stores/ui-store';
import { SUPPLIER_CATEGORIES, SUPPLIER_REGIONS, CHART_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { SupplierRecord } from '@/lib/types';
import { MetricCard } from '@/components/shared/MetricCard';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';
import { SupplierRatingDialog } from './SupplierRatingDialog';
import { SupplierComparisonPanel } from './SupplierComparisonPanel';
import dynamic from 'next/dynamic';
import { LazyLoader } from '@/components/shared/LazyLoader';
import { SupplierAnalyticsPanel } from './SupplierAnalyticsPanel';
import { CHART_TOOLTIP_STYLE, StarRating, SupplierForm } from './SupplierTab.helpers';

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
  } = useUIStore();

  // React Query hooks for data fetching
  const { data: supplierData, isLoading: supplierLoading } = useSuppliers() as { data: Record<string, any> | undefined; isLoading: boolean };
  const { data: performanceData } = useAnalytics('supplier-performance');
  const { data: reorderData } = useReorder();
  const { data: warehouseCapacityData } = useWarehouse('capacity');

  // Local state
  const [supplierPerfExpanded, setSupplierPerfExpanded] = useState(false);
  const [supplierVirtualMode, setSupplierVirtualMode] = useState(true);
  const [supplierDetailTab, setSupplierDetailTab] = useState('details');
  const [ratingDialogOpen, setRatingDialogOpen] = useState(false);
  const [ratingSupplier, setRatingSupplier] = useState<SupplierRecord | null>(null);

  // Derived data from React Query responses
  const suppliers = useMemo<SupplierRecord[]>(() => {
    if (!supplierData) return [];
    return ((supplierData as any)?.data ?? supplierData as Record<string, unknown>)?.suppliers as SupplierRecord[] || [];
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

  // Performance radar chart data
  const radarData = useMemo(() => {
    if (!supplierPerformance || !Array.isArray((supplierPerformance as Record<string, unknown>).suppliers)) return [];
    const perfSuppliers = (supplierPerformance as Record<string, unknown>).suppliers as Record<string, unknown>[];
    if (perfSuppliers.length === 0) return [];
    // Build average metrics across all suppliers for radar
    const metrics = perfSuppliers.map((s) => s.metrics as Record<string, number>);
    if (metrics.length === 0) return [];
    const avgOverall = metrics.reduce((a, m) => a + (m.overallScore || 0), 0) / metrics.length;
    const avgOnTime = metrics.reduce((a, m) => a + (m.onTimeDeliveryRate || 0), 0) / metrics.length;
    const avgQuality = metrics.reduce((a, m) => a + (m.qualityScore || 0), 0) / metrics.length;
    const avgResponse = metrics.reduce((a, m) => a + (m.responseTime || 0), 0) / metrics.length;
    const avgFlexibility = metrics.reduce((a, m) => a + (m.flexibility || 0), 0) / metrics.length;
    return [
      { dimension: '综合评分', value: Math.round(avgOverall), fullMark: 100 },
      { dimension: '准时交货', value: Math.round(avgOnTime), fullMark: 100 },
      { dimension: '质量评分', value: Math.round(avgQuality), fullMark: 100 },
      { dimension: '响应速度', value: Math.round(avgResponse), fullMark: 100 },
      { dimension: '灵活性', value: Math.round(avgFlexibility), fullMark: 100 },
    ];
  }, [supplierPerformance]);

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

      {/* ==================== 绩效分析 ==================== */}
      {!!supplierPerformance && !!(supplierPerformance as Record<string, unknown>).suppliers && (
        <>
          {/* ==================== 绩效分析雷达图 + 排名 ==================== */}
          <Card className="card-dashboard hover:translate-y-[-2px] hover:shadow-lg hover:shadow-orange-500/5 hover:border-orange-200 dark:hover:border-orange-800 transition-all duration-300 ease-out">
            <CardHeader className="pb-2 bg-muted/30">
              <CardTitle className="text-base font-semibold flex items-center gap-2" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                <Star className="h-4 w-4 text-orange-500" />
                绩效分析
                <Badge variant="outline" className="ml-auto text-xs font-normal">{((supplierPerformance as Record<string, unknown>).suppliers as unknown[]).length} 家评估</Badge>
              </CardTitle>
            </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Radar Chart */}
              {radarData.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2 text-center">供应商综合绩效雷达图</p>
                  <ResponsiveContainer width="100%" height={280}>
                    <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                      <PolarGrid stroke="#e5e7eb" className="dark:opacity-20" />
                      <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
                      <Radar name="平均绩效" dataKey="value" stroke="#f97316" fill="#f97316" fillOpacity={0.2} strokeWidth={2} animationDuration={800} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {/* Horizontal Bar Chart */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 text-center">供应商评分排名</p>
                <ResponsiveContainer width="100%" height={Math.max(180, ((supplierPerformance as Record<string, unknown>).suppliers as unknown[]).length * 36)}>
                  <BarChart data={(supplierPerformance as Record<string, unknown>).suppliers as Record<string, unknown>[]} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="dark:opacity-20" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number, name: string) => [`${value}`, name === 'overallScore' ? '综合评分' : name]} />
                    <Bar dataKey="metrics.overallScore" name="overallScore" radius={[0, 4, 4, 0]} animationDuration={800}>
                      {((supplierPerformance as Record<string, unknown>).suppliers as Record<string, unknown>[]).map((s: Record<string, unknown>, idx: number) => (
                        <Cell key={idx} fill={s.riskLevel === 'high' ? '#ef4444' : s.riskLevel === 'medium' ? '#eab308' : '#22c55e'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 汇总指标卡 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-center">
                <p className="text-xs text-muted-foreground">平均准时率</p>
                <p className="text-xl font-bold metric-flash">{(supplierPerformance as Record<string, unknown>).summary ? String(((supplierPerformance as Record<string, unknown>).summary as Record<string, unknown>).avgOnTimeRate ?? '--') : '--'}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-center">
                <p className="text-xs text-muted-foreground">高风险数</p>
                <p className="text-xl font-bold text-red-600 metric-flash">{(supplierPerformance as Record<string, unknown>).summary ? String(((supplierPerformance as Record<string, unknown>).summary as Record<string, unknown>).highRiskCount ?? 0) : '0'}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-center">
                <p className="text-xs text-muted-foreground">最佳供应商</p>
                <p className="text-sm font-bold text-emerald-600 truncate metric-flash">{(supplierPerformance as Record<string, unknown>).summary ? String(((supplierPerformance as Record<string, unknown>).summary as Record<string, unknown>).topPerformer ?? '--') : '--'}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-center">
                <p className="text-xs text-muted-foreground">交货期均值</p>
                <p className="text-xl font-bold metric-flash">{suppliers.length > 0 ? `${Math.round(suppliers.reduce((a, s) => a + s.leadTime, 0) / suppliers.length)}天` : '--'}</p>
              </div>
            </div>

            {/* 查看详情展开区 */}
            <div className="mt-4">
              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setSupplierPerfExpanded(!supplierPerfExpanded)}>
                {supplierPerfExpanded ? '收起详情' : '查看详情'}
                <ChevronRight className={cn('h-3 w-3 transition-transform duration-300', supplierPerfExpanded && 'rotate-90')} />
              </Button>
              {supplierPerfExpanded && (
                <div className="mt-3 rounded-lg border overflow-hidden drill-down-panel">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs uppercase tracking-wider">排名</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider">供应商</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider">准时率</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider">质量分</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider">交货期</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider">风险</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider">建议</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {((supplierPerformance as Record<string, unknown>).suppliers as Record<string, unknown>[]).map((s: Record<string, unknown>) => {
                        const metrics = s.metrics as Record<string, number>;
                        return (
                          <TableRow key={String(s.code)} className="hover:bg-orange-50/50 dark:hover:bg-orange-950/20 border-l-[3px] hover:border-l-orange-400 transition-colors duration-200">
                            <TableCell className="font-bold text-sm">#{String(s.rank)}</TableCell>
                            <TableCell className="font-medium text-sm">{String(s.name)}</TableCell>
                            <TableCell className="text-sm">{metrics?.onTimeDeliveryRate}%</TableCell>
                            <TableCell className="text-sm">{metrics?.qualityScore}</TableCell>
                            <TableCell className="text-sm">{String(s.leadTime)}天</TableCell>
                            <TableCell>
                              <Badge className={cn('text-[10px]', s.riskLevel === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300' : s.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300' : 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300')}>
                                {s.riskLevel === 'high' ? '高风险' : s.riskLevel === 'medium' ? '中风险' : '低风险'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{String(s.recommendation || '')}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        </>
      )}

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
        supplierPerformance={supplierPerformance}
      />

      {/* ==================== 筛选 + 操作 ==================== */}
      <Card className="card-dashboard">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Globe className="h-4 w-4 text-orange-500" />
            供应商列表
            <Badge variant="outline" className="text-xs font-normal">{filteredSuppliers.length} 家</Badge>
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
                renderRow={(s: SupplierRecord) => (
                  <div
                    className="flex items-center border-b hover:bg-muted/30 hover:border-l-orange-400 transition-all cursor-pointer px-4 py-2 border-l-[3px] border-l-transparent"
                    onClick={() => {
                      setSelectedSupplier(s);
                      setSupplierDetailOpen(true);
                      setSupplierDetailTab('details');
                    }}
                  >
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

      {/* ==================== 补货订单管理 ==================== */}
      <Card className="card-dashboard">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-amber-500" />
            补货订单管理
            <Badge variant="outline" className="ml-auto text-xs font-normal">{reorderOrders.length} 笔</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reorderOrders.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs uppercase tracking-wider">SKU</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">产品</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">数量</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">仓库</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">优先级</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">状态</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">创建时间</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reorderOrders.map((o: Record<string, unknown>) => (
                    <TableRow key={String(o.id)} className="hover:bg-muted/30 border-l-[3px] hover:border-l-amber-400 transition-all">
                      <TableCell className="font-mono text-xs">{String(o.sku)}</TableCell>
                      <TableCell className="text-sm">{String(o.productName)}</TableCell>
                      <TableCell className="text-sm font-medium">{String(o.quantity)}</TableCell>
                      <TableCell className="text-xs">{String(o.warehouse)}</TableCell>
                      <TableCell>
                        <Badge className={cn('text-[10px]', o.priority === '紧急' ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300')}>
                          {String(o.priority)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('text-[10px]',
                          o.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300' :
                          o.status === 'approved' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' :
                          o.status === 'shipped' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300' :
                          o.status === 'delivered' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' :
                          'bg-gray-100 text-gray-700 dark:bg-gray-950/30 dark:text-gray-300'
                        )}>
                          {o.status === 'pending' ? '待审批' : o.status === 'approved' ? '已审批' : o.status === 'shipped' ? '运输中' : o.status === 'delivered' ? '已送达' : '已取消'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(String(o.createdAt)).toLocaleDateString('zh-CN')}</TableCell>
                      <TableCell>
                        {o.status === 'pending' && (
                          <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => handleReorderStatusUpdate(String(o.id), 'approved', String(o.sku), Number(o.quantity))}>
                            <CheckCircle2 className="h-3 w-3" />审批
                          </Button>
                        )}
                        {o.status === 'approved' && (
                          <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => handleReorderStatusUpdate(String(o.id), 'shipped', String(o.sku), Number(o.quantity))}>
                            <Ship className="h-3 w-3" />发货
                          </Button>
                        )}
                        {o.status === 'shipped' && (
                          <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => handleReorderStatusUpdate(String(o.id), 'delivered', String(o.sku), Number(o.quantity))}>
                            <PackageCheck className="h-3 w-3" />签收
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <PackageCheck className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">暂无补货订单</p>
              <p className="text-xs mt-1">在库存优化模块中点击&ldquo;确认下单&rdquo;创建补货订单</p>
            </div>
          )}
          {/* 补货订单统计 */}
          {reorderOrders.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div className="rounded-lg bg-muted/30 p-3 text-center">
                <p className="text-lg font-bold text-foreground">{reorderOrders.length}</p>
                <p className="text-[10px] text-muted-foreground">总订单</p>
              </div>
              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/20 p-3 text-center">
                <p className="text-lg font-bold text-yellow-600">{reorderOrders.filter((o) => o.status === 'pending').length}</p>
                <p className="text-[10px] text-muted-foreground">待审批</p>
              </div>
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-3 text-center">
                <p className="text-lg font-bold text-blue-600">{reorderOrders.filter((o) => o.status === 'approved' || o.status === 'shipped').length}</p>
                <p className="text-[10px] text-muted-foreground">进行中</p>
              </div>
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-3 text-center">
                <p className="text-lg font-bold text-emerald-600">{reorderOrders.filter((o) => o.status === 'delivered').length}</p>
                <p className="text-[10px] text-muted-foreground">已完成</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>


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

      {/* ==================== Supplier Detail Dialog (with tabs) ==================== */}
      <Dialog open={supplierDetailOpen} onOpenChange={setSupplierDetailOpen}>
        <DialogContent className="max-w-lg backdrop-blur-sm border shadow-2xl dialog-scale-in">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-amber-500" />
              供应商详情
            </DialogTitle>
          </DialogHeader>
          {!!selectedSupplier && (
            <Tabs value={supplierDetailTab} onValueChange={setSupplierDetailTab}>
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="details" className="text-xs">基本信息</TabsTrigger>
                <TabsTrigger value="orders" className="text-xs">订单历史</TabsTrigger>
                <TabsTrigger value="performance" className="text-xs">绩效</TabsTrigger>
              </TabsList>

              {/* Details Tab */}
              <TabsContent value="details" className="mt-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className="text-xs text-muted-foreground">编码</p><p className="font-mono text-sm">{(selectedSupplier as Record<string, unknown>).code as string}</p></div>
                    <div><p className="text-xs text-muted-foreground">名称</p><p className="font-medium text-sm">{(selectedSupplier as Record<string, unknown>).name as string}</p></div>
                    <div><p className="text-xs text-muted-foreground">联系人</p><p className="text-sm">{((selectedSupplier as Record<string, unknown>).contact as string) || '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground">电话</p><p className="text-sm">{((selectedSupplier as Record<string, unknown>).phone as string) || '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground">邮箱</p><p className="text-sm">{((selectedSupplier as Record<string, unknown>).email as string) || '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground">地区</p><p className="text-sm">{(selectedSupplier as Record<string, unknown>).region as string}</p></div>
                    <div><p className="text-xs text-muted-foreground">品类</p><p className="text-sm">{(selectedSupplier as Record<string, unknown>).category as string}</p></div>
                    <div><p className="text-xs text-muted-foreground">交货期</p><p className="text-sm">{(selectedSupplier as Record<string, unknown>).leadTime as number} 天</p></div>
                    <div>
                      <p className="text-xs text-muted-foreground">评分</p>
                      <StarRating rating={(selectedSupplier as Record<string, unknown>).rating as number} size="md" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">状态</p>
                      <Badge className={cn('text-[10px]', (selectedSupplier as Record<string, unknown>).status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-700')}>
                        {(selectedSupplier as Record<string, unknown>).status === 'active' ? '活跃' : (selectedSupplier as Record<string, unknown>).status === 'suspended' ? '暂停' : '停用'}
                      </Badge>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-1 flex-1" onClick={() => handleToggleStatus(selectedSupplier as Record<string, unknown>)}>
                      {(selectedSupplier as Record<string, unknown>).status === 'active' ? <><XCircle className="h-3 w-3" />暂停合作</> : <><CheckCircle2 className="h-3 w-3" />恢复合作</>}
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1 flex-1" onClick={() => openEditDialog(selectedSupplier as Record<string, unknown>)}>
                      <Pencil className="h-3 w-3" />编辑信息
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Orders Tab */}
              <TabsContent value="orders" className="mt-4">
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">最近与该供应商相关的补货订单</p>
                  {reorderOrders.filter((o) => {
                    // Show orders that might be related to this supplier's category
                    return true; // Show all for now; in production would filter by supplier
                  }).slice(0, 5).map((o: Record<string, unknown>) => (
                    <div key={String(o.id)} className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/30 transition-colors">
                      <div>
                        <p className="text-sm font-medium">{String(o.productName)}</p>
                        <p className="text-xs text-muted-foreground">{String(o.sku)} &middot; {String(o.warehouse)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">x{String(o.quantity)}</p>
                        <Badge className={cn('text-[10px]',
                          o.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300' :
                          o.status === 'delivered' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' :
                          'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                        )}>
                          {o.status === 'pending' ? '待审批' : o.status === 'approved' ? '已审批' : o.status === 'shipped' ? '运输中' : o.status === 'delivered' ? '已送达' : '已取消'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {reorderOrders.length === 0 && (
                    <div className="text-center py-4 text-muted-foreground">
                      <p className="text-xs">暂无相关订单</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Performance Tab */}
              <TabsContent value="performance" className="mt-4">
                <div className="space-y-3">
                  {supplierPerformance && Array.isArray((supplierPerformance as Record<string, unknown>).suppliers) ? (
                    (() => {
                      const matchedPerf = ((supplierPerformance as Record<string, unknown>).suppliers as Record<string, unknown>[]).find(
                        (sp) => sp.code === (selectedSupplier as Record<string, unknown>).code
                      );
                      if (matchedPerf) {
                        const metrics = matchedPerf.metrics as Record<string, number>;
                        const perfRadarData = [
                          { dimension: '综合评分', value: metrics?.overallScore || 0, fullMark: 100 },
                          { dimension: '准时交货', value: metrics?.onTimeDeliveryRate || 0, fullMark: 100 },
                          { dimension: '质量评分', value: metrics?.qualityScore || 0, fullMark: 100 },
                          { dimension: '响应速度', value: metrics?.responseTime || 0, fullMark: 100 },
                          { dimension: '灵活性', value: metrics?.flexibility || 0, fullMark: 100 },
                        ];
                        return (
                          <>
                            <ResponsiveContainer width="100%" height={250}>
                              <RadarChart data={perfRadarData} cx="50%" cy="50%" outerRadius="70%">
                                <PolarGrid stroke="#e5e7eb" className="dark:opacity-20" />
                                <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
                                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 8 }} />
                                <Radar name={String(matchedPerf.name)} dataKey="value" stroke="#f97316" fill="#f97316" fillOpacity={0.25} strokeWidth={2} animationDuration={800} />
                              </RadarChart>
                            </ResponsiveContainer>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              {perfRadarData.map((d) => (
                                <div key={d.dimension} className="flex items-center justify-between p-2 rounded border bg-muted/30">
                                  <span className="text-xs text-muted-foreground">{d.dimension}</span>
                                  <span className="text-sm font-bold">{d.value}</span>
                                </div>
                              ))}
                            </div>
                            {matchedPerf.recommendation && (
                              <div className="p-2 rounded border bg-amber-50/50 dark:bg-amber-950/20 mt-2">
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                  <span className="font-medium">建议: </span>{String(matchedPerf.recommendation)}
                                </p>
                              </div>
                            )}
                          </>
                        );
                      }
                      return <p className="text-xs text-muted-foreground text-center py-4">暂无该供应商的绩效数据</p>;
                    })()
                  ) : (
                    <div className="text-center py-4">
                      <Button variant="outline" size="sm" className="gap-2" onClick={async () => {
                        try {
                          const res = await fetch(`/api/suppliers?action=detail&code=${(selectedSupplier as Record<string, unknown>).code}`);
                          const data = await res.json();
                          if ((data as Record<string, unknown>).supplier) {
                            toast.info('供应商详情已更新', { description: `订单历史: ${((data as Record<string, unknown>).orderHistory as unknown[])?.length || 0} 条` });
                          }
                        } catch {
                          toast.error('获取详情失败');
                        }
                      }}>
                        <ExternalLink className="h-3 w-3" />刷新详情
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* ==================== Supplier Rating Dialog ==================== */}
      <SupplierRatingDialog
        open={ratingDialogOpen}
        onOpenChange={setRatingDialogOpen}
        supplier={ratingSupplier}
      />
    </div>
  );
}
