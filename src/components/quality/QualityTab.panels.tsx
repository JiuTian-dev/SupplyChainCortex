'use client';

import { useState, useMemo } from 'react';
import {
  ShieldCheck, RotateCcw, Bug, Wrench, AlertTriangle, Plus,
  CheckCircle2, Clock, XCircle, ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { toast } from 'sonner';
import {
  useQualityOverview,
  useReturnRecords,
  useDefectRecords,
  useWarrantyCosts,
  useCreateReturnRecord,
  useCreateDefectRecord,
  useCreateWarrantyCost,
  useUpdateReturnRecord,
  useUpdateDefectRecord,
  useUpdateWarrantyCost,
} from '@/hooks/use-supply-chain-data';
import { MetricCard } from '@/components/shared/MetricCard';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';
import { CHART_COLORS } from '@/lib/constants';

// ==================== Tooltip Style ====================
const CHART_TOOLTIP_STYLE = {
  borderRadius: '10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  border: '1px solid #e5e7eb',
  fontSize: '12px',
  backgroundColor: 'var(--tooltip-bg, #fff)',
};

// ==================== Status Badge Helpers ====================
const RETURN_STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; className: string }> = {
  pending: { label: '待处理', variant: 'secondary', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  processed: { label: '已处理', variant: 'default', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  refunded: { label: '已退款', variant: 'outline', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  rejected: { label: '已拒绝', variant: 'destructive', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const DEFECT_STATUS_MAP: Record<string, { label: string; className: string }> = {
  open: { label: '待处理', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  investigating: { label: '调查中', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  resolved: { label: '已解决', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  closed: { label: '已关闭', className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' },
};

const WARRANTY_STATUS_MAP: Record<string, { label: string; className: string }> = {
  submitted: { label: '已提交', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  approved: { label: '已批准', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  rejected: { label: '已拒绝', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  completed: { label: '已完成', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

const SEVERITY_MAP: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  minor: { label: '轻微', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: <CheckCircle2 className="h-3 w-3" /> },
  major: { label: '重要', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: <AlertTriangle className="h-3 w-3" /> },
  critical: { label: '严重', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: <XCircle className="h-3 w-3" /> },
};

const DEFECT_TYPE_COLORS: Record<string, string> = {
  '外观': '#f97316',
  '功能': '#ef4444',
  '包装': '#8b5cf6',
  '安全': '#dc2626',
};

const WARRANTY_CATEGORY_MAP: Record<string, string> = {
  repair: '维修',
  replacement: '换货',
  refund: '退款',
  support: '支持',
};

const WARRANTY_CATEGORY_COLORS: Record<string, string> = {
  repair: '#f97316',
  replacement: '#22c55e',
  refund: '#ef4444',
  support: '#8b5cf6',
};

// ==================== Create Return Dialog ====================
function CreateReturnDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [sku, setSku] = useState('');
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [platform, setPlatform] = useState('');
  const [costImpact, setCostImpact] = useState('');
  const createReturn = useCreateReturnRecord();

  const handleSubmit = () => {
    if (!sku || !productName || !quantity || !reason) {
      toast.error('请填写必填字段');
      return;
    }
    createReturn.mutate(
      { sku, productName, quantity: Number(quantity), reason, platform: platform || undefined, costImpact: costImpact ? Number(costImpact) : 0 },
      {
        onSuccess: () => {
          toast.success('退货记录创建成功');
          onOpenChange(false);
          setSku(''); setProductName(''); setQuantity(''); setReason(''); setPlatform(''); setCostImpact('');
        },
        onError: () => toast.error('创建失败，请重试'),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-orange-500" />
            新建退货记录
          </DialogTitle>
          <DialogDescription>填写退货信息以创建新记录</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">SKU *</Label><Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="KA-TP1003" className="h-8 text-sm" /></div>
            <div><Label className="text-xs">产品名称 *</Label><Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="空气炸锅" className="h-8 text-sm" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">数量 *</Label><Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="10" className="h-8 text-sm" /></div>
            <div><Label className="text-xs">退货原因 *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="选择原因" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="质量">质量</SelectItem>
                  <SelectItem value="物流">物流</SelectItem>
                  <SelectItem value="规格">规格</SelectItem>
                  <SelectItem value="其他">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">平台</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="选择平台" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Amazon">Amazon</SelectItem>
                  <SelectItem value="Shopify">Shopify</SelectItem>
                  <SelectItem value="eBay">eBay</SelectItem>
                  <SelectItem value="Walmart">Walmart</SelectItem>
                  <SelectItem value="Temu">Temu</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">成本影响</Label><Input type="number" value={costImpact} onChange={(e) => setCostImpact(e.target.value)} placeholder="0" className="h-8 text-sm" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>取消</Button>
          <Button size="sm" onClick={handleSubmit} disabled={createReturn.isPending}>{createReturn.isPending ? '提交中...' : '提交'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Create Defect Dialog ====================
function CreateDefectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [sku, setSku] = useState('');
  const [productName, setProductName] = useState('');
  const [defectType, setDefectType] = useState('');
  const [severity, setSeverity] = useState('');
  const [quantity, setQuantity] = useState('');
  const [detectedAt, setDetectedAt] = useState('');
  const [rootCause, setRootCause] = useState('');
  const createDefect = useCreateDefectRecord();

  const handleSubmit = () => {
    if (!sku || !productName || !defectType || !detectedAt) {
      toast.error('请填写必填字段');
      return;
    }
    createDefect.mutate(
      { sku, productName, defectType, severity: severity || 'minor', quantity: Number(quantity) || 1, detectedAt, rootCause: rootCause || undefined },
      {
        onSuccess: () => {
          toast.success('缺陷记录创建成功');
          onOpenChange(false);
          setSku(''); setProductName(''); setDefectType(''); setSeverity(''); setQuantity(''); setDetectedAt(''); setRootCause('');
        },
        onError: () => toast.error('创建失败，请重试'),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-red-500" />
            新建缺陷记录
          </DialogTitle>
          <DialogDescription>填写缺陷信息以创建新记录</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">SKU *</Label><Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="KA-TP1003" className="h-8 text-sm" /></div>
            <div><Label className="text-xs">产品名称 *</Label><Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="空气炸锅" className="h-8 text-sm" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">缺陷类型 *</Label>
              <Select value={defectType} onValueChange={setDefectType}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="选择类型" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="外观">外观</SelectItem>
                  <SelectItem value="功能">功能</SelectItem>
                  <SelectItem value="包装">包装</SelectItem>
                  <SelectItem value="安全">安全</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">严重程度</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="选择程度" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minor">轻微</SelectItem>
                  <SelectItem value="major">重要</SelectItem>
                  <SelectItem value="critical">严重</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">数量</Label><Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1" className="h-8 text-sm" /></div>
            <div><Label className="text-xs">发现日期 *</Label><Input type="date" value={detectedAt} onChange={(e) => setDetectedAt(e.target.value)} className="h-8 text-sm" /></div>
          </div>
          <div><Label className="text-xs">根本原因</Label><Textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} placeholder="描述根本原因..." className="text-sm min-h-[60px]" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>取消</Button>
          <Button size="sm" onClick={handleSubmit} disabled={createDefect.isPending}>{createDefect.isPending ? '提交中...' : '提交'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Create Warranty Dialog ====================
function CreateWarrantyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [sku, setSku] = useState('');
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('');
  const [cost, setCost] = useState('');
  const [claimDate, setClaimDate] = useState('');
  const [description, setDescription] = useState('');
  const createWarranty = useCreateWarrantyCost();

  const handleSubmit = () => {
    if (!sku || !productName || !category || !cost || !claimDate) {
      toast.error('请填写必填字段');
      return;
    }
    createWarranty.mutate(
      { sku, productName, category, cost: Number(cost), claimDate, description: description || undefined },
      {
        onSuccess: () => {
          toast.success('质保记录创建成功');
          onOpenChange(false);
          setSku(''); setProductName(''); setCategory(''); setCost(''); setClaimDate(''); setDescription('');
        },
        onError: () => toast.error('创建失败，请重试'),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-violet-500" />
            新建质保记录
          </DialogTitle>
          <DialogDescription>填写质保成本信息以创建新记录</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">SKU *</Label><Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="KA-TP1003" className="h-8 text-sm" /></div>
            <div><Label className="text-xs">产品名称 *</Label><Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="空气炸锅" className="h-8 text-sm" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">类别 *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="选择类别" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="repair">维修</SelectItem>
                  <SelectItem value="replacement">换货</SelectItem>
                  <SelectItem value="refund">退款</SelectItem>
                  <SelectItem value="support">支持</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">成本 *</Label><Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" className="h-8 text-sm" /></div>
          </div>
          <div><Label className="text-xs">索赔日期 *</Label><Input type="date" value={claimDate} onChange={(e) => setClaimDate(e.target.value)} className="h-8 text-sm" /></div>
          <div><Label className="text-xs">描述</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="描述质保问题..." className="text-sm min-h-[60px]" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>取消</Button>
          <Button size="sm" onClick={handleSubmit} disabled={createWarranty.isPending}>{createWarranty.isPending ? '提交中...' : '提交'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Return Analysis Tab ====================
export function ReturnAnalysisTab() {
  const [createOpen, setCreateOpen] = useState(false);
  const overviewQuery = useQualityOverview();
  const returnsQuery = useReturnRecords();
  const updateReturn = useUpdateReturnRecord();

  const overviewData = useMemo(() => {
    const raw = overviewQuery.data as Record<string, unknown> | undefined;
    return (raw as any)?.data ?? raw;
  }, [overviewQuery.data]);

  const returnsData = useMemo(() => {
    const raw = returnsQuery.data as Record<string, unknown> | undefined;
    return (raw as any)?.data ?? raw;
  }, [returnsQuery.data]);

  const paretoData = useMemo(() => {
    if (!returnsData?.pareto) return overviewData?.returnRate?.byReason || [];
    return returnsData.pareto;
  }, [returnsData, overviewData]);

  const records = useMemo(() => returnsData?.records || [], [returnsData]);
  const summary = useMemo(() => {
    if (returnsData?.summary) return returnsData.summary;
    return {
      totalReturns: overviewData?.returnRate?.total || 0,
      totalQuantity: 0,
      totalCostImpact: overviewData?.returnRate?.byReason?.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.totalCost) || 0), 0) || 0,
      pending: overviewData?.returnRate?.pending || 0,
    };
  }, [returnsData, overviewData]);

  const handleStatusUpdate = (id: string, status: string) => {
    updateReturn.mutate({ id, status }, {
      onSuccess: () => toast.success('退货状态已更新'),
      onError: () => toast.error('更新失败'),
    });
  };

  if (overviewQuery.isLoading && returnsQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="总退货"
          value={summary.totalReturns || 0}
          icon={<RotateCcw className="h-4 w-4" />}
          color="text-orange-600 dark:text-orange-400"
          bgColor="bg-orange-50 dark:bg-orange-950/20"
        />
        <MetricCard
          title="待处理"
          value={summary.pending || overviewData?.returnRate?.pending || 0}
          icon={<Clock className="h-4 w-4" />}
          color="text-yellow-600 dark:text-yellow-400"
          bgColor="bg-yellow-50 dark:bg-yellow-950/20"
        />
        <MetricCard
          title="总退货数量"
          value={summary.totalQuantity || 0}
          icon={<ShieldCheck className="h-4 w-4" />}
          color="text-blue-600 dark:text-blue-400"
          bgColor="bg-blue-50 dark:bg-blue-950/20"
        />
        <MetricCard
          title="总成本影响"
          value={`¥${((summary.totalCostImpact || 0)).toLocaleString()}`}
          icon={<AlertTriangle className="h-4 w-4" />}
          color="text-red-600 dark:text-red-400"
          bgColor="bg-red-50 dark:bg-red-950/20"
        />
      </div>

      {/* Pareto Chart */}
      {paretoData && paretoData.length > 0 && (
        <Card className="card-dashboard chart-container">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-orange-500" />
              退货帕累托分析
              <span className="text-xs font-normal text-muted-foreground">按原因统计 · 80/20法则</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280} minHeight={200}>
              <ComposedChart data={paretoData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                <XAxis dataKey="reason" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: '数量', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]} label={{ value: '累计%', angle: 90, position: 'insideRight', style: { fontSize: 11 } }} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend />
                <Bar yAxisId="left" dataKey="count" name="退货次数" fill="#f97316" radius={[4, 4, 0, 0]} animationDuration={800} />
                <Line yAxisId="right" type="monotone" dataKey="cumulativePercent" name="累计%" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Records Table */}
      <Card className="card-dashboard">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-orange-500" />
              退货记录
            </span>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3 w-3" />
              新建退货
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <RotateCcw className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">暂无退货记录</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto overflow-x-auto custom-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">SKU</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">产品</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">数量</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">原因</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">平台</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden md:table-cell">成本</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">状态</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground hidden lg:table-cell">日期</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r: Record<string, unknown>, idx: number) => {
                    const statusInfo = RETURN_STATUS_MAP[String(r.status)] || { label: String(r.status), variant: 'secondary' as const, className: '' };
                    return (
                      <TableRow key={String(r.id)} className={`hover:bg-orange-50/50 dark:hover:bg-orange-950/20 transition-colors ${idx % 2 !== 0 ? 'bg-muted/20' : ''}`}>
                        <TableCell className="font-mono text-xs">{String(r.sku)}</TableCell>
                        <TableCell className="font-medium text-sm max-w-[120px] truncate">{String(r.productName)}</TableCell>
                        <TableCell className="text-right">{Number(r.quantity).toLocaleString()}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{String(r.reason)}</Badge></TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{String(r.platform || '-')}</TableCell>
                        <TableCell className="text-right hidden md:table-cell">¥{Number(r.costImpact || 0).toLocaleString()}</TableCell>
                        <TableCell>
                          <Select
                            value={String(r.status)}
                            onValueChange={(v) => handleStatusUpdate(String(r.id), v)}
                          >
                            <SelectTrigger className="h-6 text-[10px] w-[72px] border-0 p-0">
                              <Badge className={`text-[10px] cursor-pointer ${statusInfo.className}`}>{statusInfo.label}</Badge>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">待处理</SelectItem>
                              <SelectItem value="processed">已处理</SelectItem>
                              <SelectItem value="refunded">已退款</SelectItem>
                              <SelectItem value="rejected">已拒绝</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{String(r.createdAt || '').slice(0, 10)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateReturnDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

// ==================== Defect Analysis Tab ====================
export function DefectAnalysisTab() {
  const [createOpen, setCreateOpen] = useState(false);
  const overviewQuery = useQualityOverview();
  const defectsQuery = useDefectRecords();
  const updateDefect = useUpdateDefectRecord();

  const overviewData = useMemo(() => {
    const raw = overviewQuery.data as Record<string, unknown> | undefined;
    return (raw as any)?.data ?? raw;
  }, [overviewQuery.data]);

  const defectsData = useMemo(() => {
    const raw = defectsQuery.data as Record<string, unknown> | undefined;
    return (raw as any)?.data ?? raw;
  }, [defectsQuery.data]);

  const statistics = useMemo(() => defectsData?.statistics || {}, [defectsData]);
  const records = useMemo(() => defectsData?.records || [], [defectsData]);

  const byType = useMemo(() => {
    const bt = (statistics as Record<string, unknown>)?.byType || (overviewData?.defectRate as Record<string, unknown>)?.bySeverity || {};
    return bt;
  }, [statistics, overviewData]);

  const bySeverity = useMemo(() => {
    const bs = (statistics as Record<string, unknown>)?.bySeverity || {};
    return bs;
  }, [statistics]);

  const pieData = useMemo(() => {
    return Object.entries(byType as Record<string, number>).map(([name, value]) => ({ name, value }));
  }, [byType]);

  const openCount = useMemo(() => {
    return (statistics as Record<string, unknown>)?.openCount || (overviewData?.defectRate as Record<string, unknown>)?.open || 0;
  }, [statistics, overviewData]);

  const totalDefects = useMemo(() => {
    return (statistics as Record<string, unknown>)?.total || (overviewData?.defectRate as Record<string, unknown>)?.total || 0;
  }, [statistics, overviewData]);

  const handleStatusUpdate = (id: string, status: string) => {
    updateDefect.mutate({ id, status }, {
      onSuccess: () => toast.success('缺陷状态已更新'),
      onError: () => toast.error('更新失败'),
    });
  };

  if (overviewQuery.isLoading && defectsQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="总缺陷"
          value={Number(totalDefects) || 0}
          icon={<Bug className="h-4 w-4" />}
          color="text-red-600 dark:text-red-400"
          bgColor="bg-red-50 dark:bg-red-950/20"
        />
        <MetricCard
          title="待处理"
          value={Number(openCount) || 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          color="text-orange-600 dark:text-orange-400"
          bgColor="bg-orange-50 dark:bg-orange-950/20"
        />
        <MetricCard
          title="轻微"
          value={Number((bySeverity as Record<string, number>)?.minor) || 0}
          icon={<CheckCircle2 className="h-4 w-4" />}
          color="text-blue-600 dark:text-blue-400"
          bgColor="bg-blue-50 dark:bg-blue-950/20"
        />
        <MetricCard
          title="严重"
          value={Number((bySeverity as Record<string, number>)?.critical) || 0}
          icon={<XCircle className="h-4 w-4" />}
          color="text-red-600 dark:text-red-400"
          bgColor="bg-red-50 dark:bg-red-950/20"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Pie Chart - Defect Distribution */}
        {pieData.length > 0 && (
          <Card className="card-dashboard chart-container">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Bug className="h-4 w-4 text-red-500" />
                缺陷类型分布
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260} minHeight={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    animationBegin={200}
                  >
                    {pieData.map((entry: { name: string }, index: number) => (
                      <Cell key={`cell-${index}`} fill={DEFECT_TYPE_COLORS[entry.name] || CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number) => [value, '数量']} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Severity Breakdown */}
        <Card className="card-dashboard">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              严重程度分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(bySeverity as Record<string, number>).map(([sev, count]) => {
                const info = SEVERITY_MAP[sev] || { label: sev, className: 'bg-gray-100 text-gray-700', icon: null };
                const total = Object.values(bySeverity as Record<string, number>).reduce((s, v) => s + v, 0) || 1;
                const pct = Math.round((count / total) * 100);
                const colorMap: Record<string, string> = { minor: '#3b82f6', major: '#f97316', critical: '#ef4444' };
                return (
                  <div key={sev} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={`text-xs gap-1 ${info.className}`}>{info.icon}{info.label}</Badge>
                      </div>
                      <span className="text-sm font-semibold">{count} <span className="text-muted-foreground font-normal text-xs">({pct}%)</span></span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: colorMap[sev] || '#94a3b8' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Records Table */}
      <Card className="card-dashboard">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Bug className="h-4 w-4 text-red-500" />
              缺陷记录
            </span>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3 w-3" />
              新建缺陷
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bug className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">暂无缺陷记录</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto overflow-x-auto custom-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">SKU</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">产品</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">类型</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">严重度</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">发现日期</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">状态</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground hidden lg:table-cell">根本原因</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r: Record<string, unknown>, idx: number) => {
                    const statusInfo = DEFECT_STATUS_MAP[String(r.status)] || { label: String(r.status), className: '' };
                    const sevInfo = SEVERITY_MAP[String(r.severity)] || { label: String(r.severity), className: '', icon: null };
                    return (
                      <TableRow key={String(r.id)} className={`hover:bg-red-50/50 dark:hover:bg-red-950/20 transition-colors ${idx % 2 !== 0 ? 'bg-muted/20' : ''}`}>
                        <TableCell className="font-mono text-xs">{String(r.sku)}</TableCell>
                        <TableCell className="font-medium text-sm max-w-[120px] truncate">{String(r.productName)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs" style={{ borderColor: DEFECT_TYPE_COLORS[String(r.defectType)] || '#94a3b8', color: DEFECT_TYPE_COLORS[String(r.defectType)] || '#94a3b8' }}>
                            {String(r.defectType)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] gap-0.5 ${sevInfo.className}`}>{sevInfo.icon}{sevInfo.label}</Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{String(r.detectedAt || '').slice(0, 10)}</TableCell>
                        <TableCell>
                          <Select
                            value={String(r.status)}
                            onValueChange={(v) => handleStatusUpdate(String(r.id), v)}
                          >
                            <SelectTrigger className="h-6 text-[10px] w-[72px] border-0 p-0">
                              <Badge className={`text-[10px] cursor-pointer ${statusInfo.className}`}>{statusInfo.label}</Badge>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">待处理</SelectItem>
                              <SelectItem value="investigating">调查中</SelectItem>
                              <SelectItem value="resolved">已解决</SelectItem>
                              <SelectItem value="closed">已关闭</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[150px] truncate">{String(r.rootCause || '-')}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateDefectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

// ==================== Warranty Cost Tab ====================
export function WarrantyCostTab() {
  const [createOpen, setCreateOpen] = useState(false);
  const overviewQuery = useQualityOverview();
  const warrantyQuery = useWarrantyCosts();
  const updateWarranty = useUpdateWarrantyCost();

  const overviewData = useMemo(() => {
    const raw = overviewQuery.data as Record<string, unknown> | undefined;
    return (raw as any)?.data ?? raw;
  }, [overviewQuery.data]);

  const warrantyData = useMemo(() => {
    const raw = warrantyQuery.data as Record<string, unknown> | undefined;
    return (raw as any)?.data ?? raw;
  }, [warrantyQuery.data]);

  const records = useMemo(() => warrantyData?.records || [], [warrantyData]);
  const totals = useMemo(() => {
    if (warrantyData?.totals) return warrantyData.totals;
    return {
      totalCost: (overviewData?.warrantyCost as Record<string, unknown>)?.totalCost || 0,
      totalClaims: (overviewData?.warrantyCost as Record<string, unknown>)?.total || 0,
      byCategory: {},
    };
  }, [warrantyData, overviewData]);

  const byCategory = useMemo(() => {
    return (totals as Record<string, unknown>)?.byCategory || (overviewData?.warrantyCost as Record<string, unknown>)?.byCategory || {};
  }, [totals, overviewData]);

  // Build stacked bar chart data from records
  const stackedBarData = useMemo(() => {
    if (!records || records.length === 0) {
      // Use overview data if available
      const catData = byCategory as Array<Record<string, unknown>>;
      if (Array.isArray(catData)) {
        return catData.map((c) => ({
          category: WARRANTY_CATEGORY_MAP[String(c.category)] || String(c.category),
          cost: Number(c.totalCost) || 0,
        }));
      }
      return [];
    }
    // Group by category
    const grouped: Record<string, number> = {};
    for (const r of records as Array<Record<string, unknown>>) {
      const cat = String(r.category);
      grouped[cat] = (grouped[cat] || 0) + Number(r.cost || 0);
    }
    return Object.entries(grouped).map(([cat, cost]) => ({
      category: WARRANTY_CATEGORY_MAP[cat] || cat,
      cost,
    }));
  }, [records, byCategory]);

  const handleStatusUpdate = (id: string, status: string) => {
    updateWarranty.mutate({ id, status }, {
      onSuccess: () => toast.success('质保状态已更新'),
      onError: () => toast.error('更新失败'),
    });
  };

  if (overviewQuery.isLoading && warrantyQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="总质保成本"
          value={`¥${Number((totals as Record<string, unknown>)?.totalCost || 0).toLocaleString()}`}
          icon={<Wrench className="h-4 w-4" />}
          color="text-violet-600 dark:text-violet-400"
          bgColor="bg-violet-50 dark:bg-violet-950/20"
        />
        <MetricCard
          title="总索赔数"
          value={Number((totals as Record<string, unknown>)?.totalClaims || 0)}
          icon={<ShieldCheck className="h-4 w-4" />}
          color="text-orange-600 dark:text-orange-400"
          bgColor="bg-orange-50 dark:bg-orange-950/20"
        />
        <MetricCard
          title="维修"
          value={`¥${Number((byCategory as Record<string, { count: number; totalCost: number }>)?.repair?.totalCost || 0).toLocaleString()}`}
          icon={<Wrench className="h-4 w-4" />}
          color="text-orange-600 dark:text-orange-400"
          bgColor="bg-orange-50 dark:bg-orange-950/20"
        />
        <MetricCard
          title="退款"
          value={`¥${Number((byCategory as Record<string, { count: number; totalCost: number }>)?.refund?.totalCost || 0).toLocaleString()}`}
          icon={<RotateCcw className="h-4 w-4" />}
          color="text-red-600 dark:text-red-400"
          bgColor="bg-red-50 dark:bg-red-950/20"
        />
      </div>

      {/* Cost by Category Chart */}
      {stackedBarData.length > 0 && (
        <Card className="card-dashboard chart-container">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Wrench className="h-4 w-4 text-violet-500" />
              质保成本分布
              <span className="text-xs font-normal text-muted-foreground">按类别统计</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280} minHeight={200}>
              <ComposedChart data={stackedBarData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `¥${v.toLocaleString()}`} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number) => [`¥${value.toLocaleString()}`, '成本']} />
                <Bar dataKey="cost" name="成本" radius={[4, 4, 0, 0]} animationDuration={800}>
                  {stackedBarData.map((entry: { category: string }, index: number) => {
                    const colorKey = Object.entries(WARRANTY_CATEGORY_MAP).find(([, v]) => v === entry.category)?.[0] || '';
                    return <Cell key={`cell-${index}`} fill={WARRANTY_CATEGORY_COLORS[colorKey] || CHART_COLORS[index % CHART_COLORS.length]} />;
                  })}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Category Breakdown Cards */}
      {Array.isArray(byCategory) && byCategory.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {byCategory.map((cat: Record<string, unknown>, idx: number) => {
            const colorKey = String(cat.category);
            const color = WARRANTY_CATEGORY_COLORS[colorKey] || CHART_COLORS[idx % CHART_COLORS.length];
            return (
              <div key={colorKey} className="rounded-lg border p-3 hover:shadow-md hover:scale-[1.02] transition-all duration-200" style={{ borderLeftWidth: '3px', borderLeftColor: color }}>
                <p className="text-xs text-muted-foreground">{WARRANTY_CATEGORY_MAP[colorKey] || colorKey}</p>
                <p className="text-lg font-bold mt-1" style={{ color }}>¥{Number(cat.totalCost || 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{Number(cat.count || 0)} 索赔</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Records Table */}
      <Card className="card-dashboard">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-violet-500" />
              质保记录
            </span>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3 w-3" />
              新建质保
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Wrench className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">暂无质保记录</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto overflow-x-auto custom-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">SKU</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">产品</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">类别</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">成本</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">索赔日期</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r: Record<string, unknown>, idx: number) => {
                    const statusInfo = WARRANTY_STATUS_MAP[String(r.status)] || { label: String(r.status), className: '' };
                    const catColor = WARRANTY_CATEGORY_COLORS[String(r.category)] || '#94a3b8';
                    return (
                      <TableRow key={String(r.id)} className={`hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-colors ${idx % 2 !== 0 ? 'bg-muted/20' : ''}`}>
                        <TableCell className="font-mono text-xs">{String(r.sku)}</TableCell>
                        <TableCell className="font-medium text-sm max-w-[120px] truncate">{String(r.productName)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs" style={{ borderColor: catColor, color: catColor }}>
                            {WARRANTY_CATEGORY_MAP[String(r.category)] || String(r.category)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">¥{Number(r.cost || 0).toLocaleString()}</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{String(r.claimDate || '').slice(0, 10)}</TableCell>
                        <TableCell>
                          <Select
                            value={String(r.status)}
                            onValueChange={(v) => handleStatusUpdate(String(r.id), v)}
                          >
                            <SelectTrigger className="h-6 text-[10px] w-[72px] border-0 p-0">
                              <Badge className={`text-[10px] cursor-pointer ${statusInfo.className}`}>{statusInfo.label}</Badge>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="submitted">已提交</SelectItem>
                              <SelectItem value="approved">已批准</SelectItem>
                              <SelectItem value="rejected">已拒绝</SelectItem>
                              <SelectItem value="completed">已完成</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateWarrantyDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

