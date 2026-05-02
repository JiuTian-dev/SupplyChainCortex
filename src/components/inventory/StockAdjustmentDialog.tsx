'use client';

import { useState, useMemo } from 'react';
import { SlidersHorizontal, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { stockAdjustment } from '@/lib/api-client';

// Adjustment reasons
const ADJUSTMENT_REASONS = [
  { value: '采购入库', label: '采购入库', direction: 'inbound' },
  { value: '退货入库', label: '退货入库', direction: 'inbound' },
  { value: '盘盈', label: '盘盈', direction: 'inbound' },
  { value: '盘亏', label: '盘亏', direction: 'outbound' },
  { value: '损耗', label: '损耗', direction: 'outbound' },
  { value: '调拨出库', label: '调拨出库', direction: 'outbound' },
];

interface StockAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled SKU from inventory row */
  defaultSku?: string;
  /** Current inventory list for lookup */
  inventory: Array<{
    sku: string;
    productName: string;
    warehouse: string;
    quantity: number;
    safetyStock: number;
    stockStatus: string;
  }>;
}

export function StockAdjustmentDialog({
  open,
  onOpenChange,
  defaultSku,
  inventory,
}: StockAdjustmentDialogProps) {
  const queryClient = useQueryClient();

  const [sku, setSku] = useState(defaultSku || '');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  // Find current stock level for selected SKU
  const selectedItem = useMemo(() => {
    if (!sku) return null;
    return inventory.find(i => i.sku === sku) ?? null;
  }, [sku, inventory]);

  const currentStock = selectedItem?.quantity ?? 0;

  // Compute resulting stock preview
  const adjustmentQty = Number(quantity) || 0;
  const resultingStock = currentStock + adjustmentQty;

  // Determine if adjustment is inbound or outbound
  const isInbound = adjustmentQty > 0;
  const isOutbound = adjustmentQty < 0;

  // Compute new status preview
  const newStatusPreview = useMemo(() => {
    if (!selectedItem || adjustmentQty === 0) return null;
    const safetyStock = selectedItem.safetyStock;
    if (resultingStock <= safetyStock * 0.5) return { label: '紧急', color: '#ef4444' };
    if (resultingStock <= safetyStock) return { label: '预警', color: '#f59e0b' };
    if (resultingStock >= safetyStock * 3) return { label: '积压', color: '#8b5cf6' };
    return { label: '健康', color: '#22c55e' };
  }, [selectedItem, adjustmentQty, resultingStock]);

  // Reset form when dialog opens with new defaultSku
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setSku(defaultSku || '');
      setQuantity('');
      setReason('');
    }
    onOpenChange(newOpen);
  };

  const adjustmentMutation = useMutation({
    mutationFn: stockAdjustment,
    onSuccess: (data: any) => {
      if (data.success) {
        const adj = data.adjustment;
        toast.success('库存调整成功', {
          description: `${adj.sku}: ${adj.previousQuantity} → ${adj.newQuantity} (${adj.adjustment > 0 ? '+' : ''}${adj.adjustment})`,
        });
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
        queryClient.invalidateQueries({ queryKey: ['warehouse'] });
        onOpenChange(false);
        setSku('');
        setQuantity('');
        setReason('');
      } else {
        toast.error('调整失败', { description: data.error || '未知错误' });
      }
    },
    onError: (error: Error) => {
      toast.error('调整失败', { description: error.message || '网络错误' });
    },
  });

  const handleSubmit = () => {
    if (!sku) {
      toast.error('请选择产品 SKU');
      return;
    }
    if (!quantity || adjustmentQty === 0) {
      toast.error('请输入调整数量（正数入库，负数出库）');
      return;
    }
    if (!reason) {
      toast.error('请选择调整原因');
      return;
    }
    if (resultingStock < 0) {
      toast.error(`调整后库存不能为负数（当前 ${currentStock}，调整 ${adjustmentQty > 0 ? '+' : ''}${adjustmentQty}）`);
      return;
    }
    adjustmentMutation.mutate({ sku, quantity: adjustmentQty, reason });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md backdrop-blur-sm border shadow-2xl dialog-scale-in">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-orange-500" />
            库存调整
          </DialogTitle>
          <DialogDescription>入库/出库库存调整，正数表示入库，负数表示出库</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* SKU Select */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">产品 SKU *</label>
            <Select value={sku} onValueChange={setSku}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="选择产品" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {inventory.map(item => (
                  <SelectItem key={item.sku} value={item.sku}>
                    {item.sku} - {item.productName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Current stock display */}
          {selectedItem && (
            <div className="p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">当前库存</span>
                <span className="text-lg font-bold">{currentStock}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">安全库存</span>
                <span className="text-sm font-medium">{selectedItem.safetyStock}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">仓库</span>
                <span className="text-sm">{selectedItem.warehouse}</span>
              </div>
            </div>
          )}

          {/* Quantity input */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">调整数量 *（正数=入库，负数=出库）</label>
            <Input
              type="number"
              placeholder="如：+50 入库，-30 出库"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          {/* Reason select */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">调整原因 *</label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="选择原因" />
              </SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_REASONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>
                    <span className="flex items-center gap-1.5">
                      {r.direction === 'inbound' ? (
                        <ArrowUpCircle className="h-3 w-3 text-green-500" />
                      ) : (
                        <ArrowDownCircle className="h-3 w-3 text-red-500" />
                      )}
                      {r.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Result preview */}
          {selectedItem && adjustmentQty !== 0 && (
            <div className={`p-3 rounded-lg border ${
              resultingStock < 0
                ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20'
                : isInbound
                  ? 'border-green-300 bg-green-50/50 dark:bg-green-950/20'
                  : 'border-orange-300 bg-orange-50/50 dark:bg-orange-950/20'
            }`}>
              <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                {isInbound ? (
                  <ArrowUpCircle className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <ArrowDownCircle className="h-3.5 w-3.5 text-red-500" />
                )}
                调整预览
              </h4>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">调整前</span>
                <span className="font-medium">{currentStock}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">调整量</span>
                <span className={`font-semibold ${isInbound ? 'text-green-600' : 'text-red-600'}`}>
                  {adjustmentQty > 0 ? '+' : ''}{adjustmentQty}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1 pt-1 border-t">
                <span className="text-muted-foreground">调整后</span>
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-lg ${resultingStock < 0 ? 'text-red-600' : ''}`}>
                    {resultingStock < 0 ? '⚠ ' : ''}{resultingStock}
                  </span>
                  {newStatusPreview && (
                    <Badge
                      variant="outline"
                      className="text-[10px]"
                      style={{
                        backgroundColor: newStatusPreview.color + '20',
                        color: newStatusPreview.color,
                        borderColor: newStatusPreview.color + '40',
                      }}
                    >
                      {newStatusPreview.label}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}

          <Button
            className="w-full bg-orange-500 hover:bg-orange-600 text-white"
            onClick={handleSubmit}
            disabled={adjustmentMutation.isPending || !sku || !quantity || !reason}
          >
            {adjustmentMutation.isPending ? '处理中...' : (
              <>
                <SlidersHorizontal className="h-4 w-4 mr-1" />
                确认调整
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
