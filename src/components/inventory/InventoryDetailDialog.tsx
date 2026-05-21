'use client';

import {
  Boxes, Zap, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ─── Typed interface for unknown detail data ──────────────────────────────

interface DetailReorder {
  currentStock: string;
  inTransit: string;
  recommendedOrder: number;
  urgency: string;
}

interface InventoryDetailData {
  reorder?: DetailReorder;
}

// ==================== Inventory Detail Dialog ====================

interface InventoryDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sku: string;
  detail: unknown | null;
  reorderQty: number;
  onReorderQtyChange: (qty: number) => void;
  reorderWarehouse: string;
  onReorderWarehouseChange: (warehouse: string) => void;
  reorderPriority: string;
  onReorderPriorityChange: (priority: string) => void;
  onSubmitReorder: () => void;
}

export function InventoryDetailDialog({
  open,
  onOpenChange,
  sku,
  detail,
  reorderQty,
  onReorderQtyChange,
  reorderWarehouse,
  onReorderWarehouseChange,
  reorderPriority,
  onReorderPriorityChange,
  onSubmitReorder,
}: InventoryDetailDialogProps) {
  const d = detail as InventoryDetailData | null;
  const reorder = d?.reorder ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg backdrop-blur-sm border shadow-2xl dialog-scale-in">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-orange-500" />
            库存详情 - {sku}
          </DialogTitle>
          <DialogDescription>补货操作</DialogDescription>
        </DialogHeader>
        {reorder ? (
          <div className="space-y-4">
            <div className="p-3 rounded-lg border bg-muted/30">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-500" />补货操作
              </h4>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">订单数量</label>
                  <Input
                    type="number"
                    min={1}
                    value={reorderQty || reorder.recommendedOrder || 0}
                    onChange={(e) => onReorderQtyChange(Number(e.target.value))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">目标仓库</label>
                  <Select value={reorderWarehouse} onValueChange={onReorderWarehouseChange}>
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
                  <Select value={reorderPriority} onValueChange={onReorderPriorityChange}>
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
                  onClick={onSubmitReorder}
                >
                  <Zap className="h-4 w-4 mr-1" />
                  确认下单
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
