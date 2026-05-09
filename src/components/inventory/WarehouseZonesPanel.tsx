'use client';

import { useState, useMemo } from 'react';
import { Warehouse, TrendingUp, TrendingDown, Minus, ArrowRightLeft, Box } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useWarehouseZones, useWarehouseTrend } from '@/hooks/use-supply-chain-data';
import { stockTransfer } from '@/lib/api-client';

// Tooltip style
const TOOLTIP_STYLE = {
  borderRadius: '10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  border: '1px solid #e5e7eb',
  fontSize: '12px',
  backgroundColor: 'var(--tooltip-bg, #fff)',
};

// Zone type labels
const ZONE_TYPE_LABELS: Record<string, string> = {
  fast: '高频拣选',
  normal: '常规存储',
  bulk: '大件仓储',
};

// Zone colors by type
const ZONE_COLORS: Record<string, string> = {
  fast: '#f97316',
  normal: '#22c55e',
  bulk: '#06b6d4',
};

// Status badge config
const STATUS_CONFIG: Record<string, { label: string; color: string; bgClass: string }> = {
  healthy: { label: '正常', color: '#22c55e', bgClass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  warning: { label: '拥挤', color: '#f59e0b', bgClass: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  critical: { label: '满仓', color: '#ef4444', bgClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

// Progress bar color based on utilization
function getUtilizationColor(utilization: number): string {
  if (utilization > 90) return '#ef4444';
  if (utilization > 70) return '#f59e0b';
  return '#22c55e';
}

// ==================== Transfer Dialog ====================
export function TransferDialog({
  open,
  onOpenChange,
  warehouses,
  inventory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouses: string[];
  inventory: Array<{ sku: string; productName: string; warehouse: string; quantity: number }>;
}) {
  const queryClient = useQueryClient();
  const [fromZone, setFromZone] = useState('');
  const [toZone, setToZone] = useState('');
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  // Filter SKUs available at source warehouse
  const availableSkus = useMemo(() => {
    if (!fromZone) return inventory;
    return inventory.filter(i => i.warehouse === fromZone);
  }, [fromZone, inventory]);

  // Current stock of selected SKU at source
  const selectedStock = useMemo(() => {
    if (!sku || !fromZone) return 0;
    const item = inventory.find(i => i.sku === sku && i.warehouse === fromZone);
    return item?.quantity ?? 0;
  }, [sku, fromZone, inventory]);

  const transferMutation = useMutation({
    mutationFn: stockTransfer,
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success('库存调拨成功', {
          description: `${sku}: ${data.transfer.fromZone} → ${data.transfer.toZone}，${data.transfer.quantity} 件`,
        });
        queryClient.invalidateQueries({ queryKey: ['warehouse'] });
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
        onOpenChange(false);
        // Reset form
        setFromZone('');
        setToZone('');
        setSku('');
        setQuantity('');
        setReason('');
      } else {
        toast.error('调拨失败', { description: data.error || '未知错误' });
      }
    },
    onError: (error: Error) => {
      toast.error('调拨失败', { description: error.message || '网络错误' });
    },
  });

  const handleSubmit = () => {
    if (!fromZone || !toZone || !sku || !quantity) {
      toast.error('请填写所有必填字段');
      return;
    }
    if (fromZone === toZone) {
      toast.error('源仓库和目标仓库不能相同');
      return;
    }
    const qty = Number(quantity);
    if (qty <= 0) {
      toast.error('调拨数量必须大于0');
      return;
    }
    if (qty > selectedStock) {
      toast.error(`调拨数量不能超过源库存 (${selectedStock} 件)`);
      return;
    }
    transferMutation.mutate({ sku, fromZone, toZone, quantity: qty, reason: reason || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md backdrop-blur-sm border shadow-2xl dialog-scale-in">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-orange-500" />
            库存调拨
          </DialogTitle>
          <DialogDescription>在不同仓库之间调拨库存</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">源仓库 *</label>
            <Select value={fromZone} onValueChange={(v) => { setFromZone(v); setSku(''); }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="选择源仓库" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map(wh => (
                  <SelectItem key={wh} value={wh}>{wh}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">目标仓库 *</label>
            <Select value={toZone} onValueChange={setToZone}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="选择目标仓库" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.filter(wh => wh !== fromZone).map(wh => (
                  <SelectItem key={wh} value={wh}>{wh}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">SKU *</label>
            <Select value={sku} onValueChange={setSku}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={fromZone ? '选择产品' : '请先选择源仓库'} />
              </SelectTrigger>
              <SelectContent>
                {availableSkus.map(item => (
                  <SelectItem key={`${item.sku}-${item.warehouse}`} value={item.sku}>
                    {item.sku} - {item.productName} ({item.quantity}件)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedStock > 0 && (
            <div className="p-2.5 rounded-lg border bg-muted/30 text-xs">
              <span className="text-muted-foreground">源仓库库存: </span>
              <span className="font-semibold">{selectedStock} 件</span>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">调拨数量 *</label>
            <Input
              type="number"
              min={1}
              max={selectedStock}
              placeholder="输入调拨数量"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">调拨原因</label>
            <Input
              placeholder="可选：说明调拨原因"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <Button
            className="w-full bg-orange-500 hover:bg-orange-600 text-white"
            onClick={handleSubmit}
            disabled={transferMutation.isPending}
          >
            {transferMutation.isPending ? '处理中...' : (
              <>
                <ArrowRightLeft className="h-4 w-4 mr-1" />
                确认调拨
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Main WarehouseZonesPanel Component ====================
export function WarehouseZonesPanel() {
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);

  const { data: zonesData, isLoading: zonesLoading } = useWarehouseZones();
  const { data: trendData, isLoading: trendLoading } = useWarehouseTrend();

  // Parse zones data
  const zones = useMemo(() => (zonesData as any)?.zones ?? [], [zonesData]);
  const summary = useMemo(() => (zonesData as any)?.summary ?? null, [zonesData]);

  // Parse trend data
  const trend = useMemo(() => (trendData as any)?.trend ?? [], [trendData]);
  const trendSummary = useMemo(() => (trendData as any)?.summary ?? null, [trendData]);

  // Flatten all zone cards from all warehouses
  const allZoneCards = useMemo(() => {
    return zones.flatMap((wh: any) =>
      wh.zones.map((zone: any) => ({
        ...zone,
        warehouseName: wh.warehouse,
        warehouseUtilization: wh.overallUtilization,
      }))
    );
  }, [zones]);

  // Get unique warehouse names
  const warehouseNames = useMemo(() => zones.map((wh: any) => wh.warehouse as string), [zones]);

  // Build inventory list for transfer dialog (using zone data)
  const inventoryForTransfer = useMemo(() => {
    return zones.flatMap((wh: any) =>
      wh.zones.map((zone: any) => ({
        sku: `${wh.warehouse}-${zone.type}`,
        productName: `${wh.warehouse} ${zone.name}`,
        warehouse: wh.warehouse,
        quantity: zone.used,
      }))
    );
  }, [zones]);

  // Trend direction icon
  const TrendIcon = trendSummary?.trendDirection === 'increasing' ? TrendingUp
    : trendSummary?.trendDirection === 'decreasing' ? TrendingDown : Minus;

  if (zonesLoading || trendLoading) {
    return (
      <Card className="card-dashboard border-l-[4px] border-l-teal-400">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-teal-500" />
            仓库区域可视化
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-36 bg-muted rounded-lg" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="card-dashboard border-l-[4px] border-l-teal-400">
        <CardHeader className="pb-2 bg-teal-50 dark:bg-teal-950/20">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Warehouse className="h-4 w-4 text-teal-500" />
                仓库区域可视化
              </CardTitle>
              <CardDescription>各仓库分区利用率与状态</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {summary && (
                <div className="flex items-center gap-2 mr-2">
                  <Badge variant="outline" className="text-xs">
                    {summary.totalZones} 个区域
                  </Badge>
                  {summary.criticalZones > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {summary.criticalZones} 满仓
                    </Badge>
                  )}
                  {summary.warningZones > 0 && (
                    <Badge variant="secondary" className="text-xs text-yellow-700 dark:text-yellow-400">
                      {summary.warningZones} 拥挤
                    </Badge>
                  )}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1 border-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30"
                onClick={() => setTransferDialogOpen(true)}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                库存调拨
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Zone cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {allZoneCards.map((zone: any) => {
              const statusCfg = STATUS_CONFIG[zone.status] || STATUS_CONFIG.healthy;
              const zoneColor = ZONE_COLORS[zone.type] || '#94a3b8';
              const barColor = getUtilizationColor(zone.utilization);

              return (
                <div
                  key={`${zone.warehouseName}-${zone.zoneId}`}
                  className="rounded-lg border p-4 hover:shadow-md hover:scale-[1.02] transition-all duration-200 group"
                  style={{ borderLeftWidth: '3px', borderLeftColor: zoneColor }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">{zone.name}</span>
                    <Badge className={`text-[10px] ${statusCfg.bgClass}`}>
                      {statusCfg.label}
                    </Badge>
                  </div>

                  {/* Warehouse label */}
                  <p className="text-xs text-muted-foreground mb-2">{zone.warehouseName}</p>

                  {/* Type badge */}
                  <Badge variant="outline" className="text-[10px] mb-3">
                    {ZONE_TYPE_LABELS[zone.type] || zone.type}
                  </Badge>

                  {/* Capacity info */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>{zone.used.toLocaleString()} / {zone.capacity.toLocaleString()} 件</span>
                    <span className="font-semibold" style={{ color: barColor }}>
                      {zone.utilization.toFixed(0)}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden mb-2">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${zone.utilization}%`, backgroundColor: barColor }}
                    />
                  </div>

                  {/* Product count */}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Box className="h-3 w-3" />
                    <span>{zone.productCount} 个产品</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 7-Day Utilization Trend */}
          {trend.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-teal-700 dark:text-teal-400">
                  <TrendIcon className="h-4 w-4" />
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
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [`${value}%`, '利用率']} />
                  <Area
                    type="monotone"
                    dataKey="utilization"
                    stroke="#14b8a6"
                    strokeWidth={2}
                    fill="url(#utilGradient)"
                    animationDuration={800}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transfer Dialog */}
      <TransferDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        warehouses={warehouseNames}
        inventory={inventoryForTransfer}
      />
    </>
  );
}
