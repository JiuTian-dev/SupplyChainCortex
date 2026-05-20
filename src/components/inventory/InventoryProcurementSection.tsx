'use client';

import { ShoppingCart, DollarSign, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ─── Typed interfaces for unknown data ──────────────────────────────────────────────

interface ProcurementItem {
  sku: string;
  productName: string;
  currentStock: number;
  safetyStock: number;
  suggestedQty: number;
  priority: string;
  estimatedCost: number;
}

interface ProcurementDataShape {
  data: {
    items: ProcurementItem[];
    summary: {
      totalItems: string;
      urgentItems: string;
      totalBudget: string;
    };
  };
}

interface BudgetDataShape {
  totalBudget: number;
  bulkDiscount?: number;
  netBudget: number;
  byCategory?: Array<{ category: string; amount: number; items: number }>;
  byPriority?: Array<{ priority: string; amount: number; items: number }>;
}

interface TimelineDataShape {
  timeline: Array<{
    sku: string;
    productName: string;
    orderDate: string;
    expectedDelivery: string;
    leadTime: number;
    quantity: number;
    status: string;
    priority: string;
  }>;
}

// ==================== Procurement Plan + Budget & Timeline Dialogs ====================

interface InventoryProcurementSectionProps {
  procurementData: unknown;
  budgetDialogOpen: boolean;
  onBudgetDialogOpenChange: (open: boolean) => void;
  budgetData: unknown;
  timelineDialogOpen: boolean;
  onTimelineDialogOpenChange: (open: boolean) => void;
  timelineData: unknown;
  onFetchBudget: () => void;
  onFetchTimeline: () => void;
}

export function InventoryProcurementSection({
  procurementData: rawProcurementData,
  budgetDialogOpen,
  onBudgetDialogOpenChange,
  budgetData: rawBudgetData,
  timelineDialogOpen,
  onTimelineDialogOpenChange,
  timelineData: rawTimelineData,
  onFetchBudget,
  onFetchTimeline,
}: InventoryProcurementSectionProps) {
  const procurementData = rawProcurementData as ProcurementDataShape | null;
  const budgetData = rawBudgetData as BudgetDataShape | null;
  const timelineData = rawTimelineData as TimelineDataShape | null;
  return (
    <>
      {/* 采购计划 */}
      {procurementData && procurementData?.data && procurementData.data?.items && ((procurementData.data).items).length > 0 && (
        <Card className="card-dashboard border-l-[4px] border-l-amber-400">
          <CardHeader className="pb-2 bg-amber-50 dark:bg-amber-950/20">
            <CardTitle className="text-base font-semibold flex items-center gap-2" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <ShoppingCart className="h-4 w-4 text-amber-500" />
              采购计划
              <Badge variant="outline" className="ml-auto text-xs font-normal">{procurementData.data ? procurementData.data.summary.totalItems as string : ''} 项</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg border p-3 text-center bg-amber-50 dark:bg-amber-950/15">
                <p className="text-xs text-muted-foreground">总计划项</p>
                <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{procurementData.data ? procurementData.data.summary.totalItems as string : ''}</p>
              </div>
              <div className="rounded-lg border p-3 text-center bg-red-50 dark:bg-red-950/15">
                <p className="text-xs text-muted-foreground">紧急采购</p>
                <p className="text-lg font-bold text-red-700 dark:text-red-400">{procurementData.data ? procurementData.data.summary.urgentItems as string : ''}</p>
              </div>
              <div className="rounded-lg border p-3 text-center bg-emerald-50 dark:bg-emerald-950/15">
                <p className="text-xs text-muted-foreground">预计预算</p>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">¥{procurementData ? procurementData.data.summary.totalBudget : ''}</p>
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
                  {(procurementData ? procurementData.data.items as Array<{ sku: string; productName: string; currentStock: number; safetyStock: number; suggestedQty: number; priority: string; estimatedCost: number }> : []).map((item, idx: number) => {
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
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 hover:bg-amber-50 dark:hover:bg-amber-950/20" onClick={onFetchBudget}>
                <DollarSign className="h-3.5 w-3.5" />查看预算
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 hover:bg-amber-50 dark:hover:bg-amber-950/20" onClick={onFetchTimeline}>
                <Clock className="h-3.5 w-3.5" />采购时间线
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Budget Dialog */}
      <Dialog open={budgetDialogOpen} onOpenChange={onBudgetDialogOpenChange}>
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
                  <span className="text-xl font-bold text-amber-700 dark:text-amber-400">¥{budgetData.totalBudget as number}</span>
                </div>
                {budgetData.bulkDiscount && (budgetData.bulkDiscount as number) > 0 && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">批量折扣</span>
                    <span className="text-sm text-green-600 font-semibold">-¥{(budgetData.bulkDiscount as number).toLocaleString()}</span>
                  </div>
                )}
                {budgetData.bulkDiscount && (budgetData.bulkDiscount as number) > 0 && (
                  <div className="flex items-center justify-between mt-1 pt-1 border-t">
                    <span className="text-xs font-semibold">净预算</span>
                    <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">¥{(budgetData.netBudget as number).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* By Category */}
              {budgetData.byCategory && (budgetData.byCategory).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">按品类分解</h4>
                  <div className="space-y-2">
                    {(budgetData.byCategory as Array<{ category: string; amount: number; items: number }>).map((cat) => {
                      const pct = budgetData.totalBudget > 0 ? (cat.amount / (budgetData.totalBudget as number)) * 100 : 0;
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
              {budgetData.byPriority && (budgetData.byPriority).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">按优先级分解</h4>
                  <div className="space-y-2">
                    {(budgetData.byPriority as Array<{ priority: string; amount: number; items: number }>).map((p) => {
                      const prioColors: Record<string, string> = { '紧急': '#ef4444', '高': '#f97316', '中': '#f59e0b', '低': '#22c55e' };
                      const pct = budgetData.totalBudget > 0 ? (p.amount / (budgetData.totalBudget as number)) * 100 : 0;
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
      <Dialog open={timelineDialogOpen} onOpenChange={onTimelineDialogOpenChange}>
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
              {(timelineData.timeline as Array<{ sku: string; productName: string; orderDate: string; expectedDelivery: string; leadTime: number; quantity: number; status: string; priority: string }>).map((item, idx: number) => {
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
    </>
  );
}
