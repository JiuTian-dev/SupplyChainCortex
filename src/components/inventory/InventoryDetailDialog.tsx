'use client';

import {
  Boxes, Activity, Shield, Zap, RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants';

// ─── Typed interface for unknown detail data ──────────────────────────────

interface DetailHealth {
  quantity: number;
  safetyStock: number;
  turnoverRate: number;
  turnoverDays: number;
  abcClass: string;
  fsnClass: string;
  reorderPoint: number;
  stockStatus: string;
}

interface DetailSafety {
  serviceLevel: number;
  safetyStock: string;
  formula: string;
}

interface DetailReorder {
  currentStock: string;
  inTransit: string;
  recommendedOrder: number;
  urgency: string;
}

interface InventoryDetailData {
  health?: DetailHealth;
  safety?: DetailSafety;
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
  const health = d?.health ?? null;
  const safety = d?.safety ?? null;
  const reorder = d?.reorder ?? null;
  const progressValue = health ? Math.min(100, (health.quantity / health.reorderPoint) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg backdrop-blur-sm border shadow-2xl dialog-scale-in">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-orange-500" />
            库存详情 - {sku}
          </DialogTitle>
          <DialogDescription>库存健康度、安全库存与补货建议</DialogDescription>
        </DialogHeader>
        {detail ? (
          <div className="space-y-4">
            {/* 健康度 */}
            <div className="p-3 rounded-lg border bg-muted/30">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Activity className="h-4 w-4 text-orange-500" />库存健康度
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">当前库存:</span> <span className="font-medium">{health ? health.quantity : ''}</span></div>
                <div><span className="text-muted-foreground">安全库存:</span> <span className="font-medium">{health ? health.safetyStock : ''}</span></div>
                <div><span className="text-muted-foreground">周转率:</span> <span className="font-medium">{health ? health.turnoverRate : ''}</span></div>
                <div><span className="text-muted-foreground">周转天数:</span> <span className="font-medium">{health ? health.turnoverDays : ''}</span></div>
                <div><span className="text-muted-foreground">ABC 分类:</span> <Badge variant="outline">{health ? health.abcClass : ''}</Badge></div>
                <div><span className="text-muted-foreground">FSN 分类:</span> <Badge variant="outline">{health ? health.fsnClass : ''}</Badge></div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">库存水位:</span>
                <div className="flex-1">
                  <Progress value={progressValue} className="h-2 transition-all duration-500" />
                </div>
                <Badge
                  style={{ backgroundColor: STATUS_COLORS[health?.stockStatus ?? ''] + '20', color: STATUS_COLORS[health?.stockStatus ?? ''] }}
                >
                  {STATUS_LABELS[health?.stockStatus ?? '']}
                </Badge>
              </div>
            </div>
            {/* 安全库存 */}
            <div className="p-3 rounded-lg border bg-muted/30">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4 text-cyan-500" />安全库存计算
              </h4>
              <div className="text-sm space-y-1">
                <div><span className="text-muted-foreground">服务水平:</span> <span className="font-medium">{safety ? (safety.serviceLevel * 100).toFixed(0) : ''}%</span></div>
                <div><span className="text-muted-foreground">安全库存:</span> <span className="font-medium text-lg">{safety ? safety.safetyStock : ''}</span></div>
                <div className="text-xs text-muted-foreground mt-1 font-mono bg-muted/50 p-2 rounded">{safety ? safety.formula : ''}</div>
              </div>
            </div>
            {/* 补货建议 */}
            {reorder && (
              <div className="p-3 rounded-lg border bg-muted/30">
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-violet-500" />补货建议
                </h4>
                <div className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">当前库存:</span> <span className="font-medium">{reorder.currentStock}</span></div>
                  <div><span className="text-muted-foreground">在途库存:</span> <span className="font-medium">{reorder.inTransit}</span></div>
                  <div><span className="text-muted-foreground">建议补货:</span> <span className="font-bold text-lg text-violet-600">{reorder.recommendedOrder}</span></div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-muted-foreground">紧急程度:</span>
                    <Badge variant={reorder.urgency === 'urgent' ? 'destructive' : reorder.urgency === 'normal' ? 'default' : 'secondary'}>
                      {reorder.urgency === 'urgent' ? '紧急' : reorder.urgency === 'normal' ? '常规' : '低优先'}
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
            )}
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
