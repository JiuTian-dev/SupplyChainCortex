'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  ShoppingCart, AlertTriangle, TrendingDown, Clock, DollarSign,
  Package, Filter, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useReorderRecommendations } from '@/hooks/use-supply-chain-data';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ==================== Priority Config ====================
const PRIORITY_CONFIG: Record<string, { label: string; color: string; bgClass: string; textClass: string; borderClass: string }> = {
  URGENT: { label: '紧急', color: '#ef4444', bgClass: 'bg-red-100 dark:bg-red-950/40', textClass: 'text-red-700 dark:text-red-400', borderClass: 'border-red-300 dark:border-red-800' },
  HIGH: { label: '高', color: '#f59e0b', bgClass: 'bg-amber-100 dark:bg-amber-950/40', textClass: 'text-amber-700 dark:text-amber-400', borderClass: 'border-amber-300 dark:border-amber-800' },
  MEDIUM: { label: '中', color: '#06b6d4', bgClass: 'bg-cyan-100 dark:bg-cyan-950/40', textClass: 'text-cyan-700 dark:text-cyan-400', borderClass: 'border-cyan-300 dark:border-cyan-800' },
  LOW: { label: '低', color: '#10b981', bgClass: 'bg-emerald-100 dark:bg-emerald-950/40', textClass: 'text-emerald-700 dark:text-emerald-400', borderClass: 'border-emerald-300 dark:border-emerald-800' },
};

// ==================== Days Remaining Color ====================
function getDaysRemainingColor(days: number): string {
  if (days < 7) return '#ef4444';
  if (days < 14) return '#f59e0b';
  return '#10b981';
}

function getDaysRemainingTextClass(days: number): string {
  if (days < 7) return 'text-red-600 dark:text-red-400';
  if (days < 14) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

// ==================== Main Component ====================
export function ReorderRecommendationPanel() {
  const queryClient = useQueryClient();
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [showAboveSafety, setShowAboveSafety] = useState(false);
  const [creatingOrders, setCreatingOrders] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useReorderRecommendations();
  const recommendations = useMemo(() => (data as any)?.recommendations ?? [], [data]);
  const summary = useMemo(() => (data as any)?.summary ?? { totalRecommendations: 0, urgentCount: 0, highCount: 0, totalEstimatedCost: 0, belowSafetyCount: 0, avgLeadTime: 14, safetyDays: 14 }, [data]);

  // Filtered recommendations
  const filtered = useMemo(() => {
    let items = recommendations as any[];
    // Filter by priority
    if (priorityFilter !== 'all') {
      items = items.filter((r: any) => r.priority === priorityFilter);
    }
    // Filter by below safety stock (default: only show below-safety items)
    if (!showAboveSafety) {
      items = items.filter((r: any) => r.currentStock < r.safetyStock || r.priority === 'URGENT' || r.priority === 'HIGH');
    }
    return items;
  }, [recommendations, priorityFilter, showAboveSafety]);

  // Create reorder order mutation
  const handleCreateReorder = useCallback(async (item: any) => {
    setCreatingOrders(prev => new Set(prev).add(item.sku));
    try {
      const priorityMap: Record<string, string> = { URGENT: '紧急', HIGH: '紧急', MEDIUM: '常规', LOW: '常规' };
      const res = await fetch('/api/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: item.sku,
          productName: item.productName,
          quantity: item.recommendedQty,
          warehouse: item.warehouse,
          priority: priorityMap[item.priority] || '常规',
          notes: `智能补货推荐: 日销量${item.dailyVelocity}/天, 剩余${item.daysRemaining}天, 交期${item.leadTimeDays}天`,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('补货单已创建', {
          description: `${item.productName} x${item.recommendedQty} → ${item.warehouse}`,
        });
        queryClient.invalidateQueries({ queryKey: ['reorder'] });
        queryClient.invalidateQueries({ queryKey: ['inventory', 'reorder_recommendations'] });
      } else {
        toast.error('创建补货单失败', { description: result.error || '未知错误' });
      }
    } catch {
      toast.error('创建补货单失败', { description: '网络错误' });
    } finally {
      setCreatingOrders(prev => {
        const next = new Set(prev);
        next.delete(item.sku);
        return next;
      });
    }
  }, [queryClient]);

  // Loading state
  if (isLoading) {
    return (
      <Card className="card-dashboard border-l-[4px] border-l-orange-400">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="card-dashboard border-l-[4px] border-l-red-400">
        <CardContent className="p-6 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-red-500 mb-2" />
          <p className="text-sm text-muted-foreground">加载补货推荐数据失败</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="card-dashboard border-l-[4px] border-l-orange-400"
     
    >
      <CardHeader className="pb-2 bg-orange-50 dark:bg-orange-950/20">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <ShoppingCart className="h-4 w-4 text-orange-500" />
              智能补货推荐
            </CardTitle>
            <CardDescription className="text-xs">
              基于销售速率、交期和安全库存的智能补货建议 | 平均交期 {summary.avgLeadTime} 天 | 安全天数 {summary.safetyDays} 天
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-24 h-7 text-xs">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部优先级</SelectItem>
                <SelectItem value="URGENT">紧急</SelectItem>
                <SelectItem value="HIGH">高</SelectItem>
                <SelectItem value="MEDIUM">中</SelectItem>
                <SelectItem value="LOW">低</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setShowAboveSafety(!showAboveSafety)}
            >
              {showAboveSafety ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showAboveSafety ? '隐藏充足' : '显示全部'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg border p-3 text-center bg-orange-50 dark:bg-orange-950/15">
            <p className="text-xs text-muted-foreground">推荐补货项</p>
            <p className="text-lg font-bold text-orange-700 dark:text-orange-400">{summary.totalRecommendations}</p>
          </div>
          <div className="rounded-lg border p-3 text-center bg-red-50 dark:bg-red-950/15">
            <p className="text-xs text-muted-foreground">紧急项</p>
            <p className="text-lg font-bold text-red-700 dark:text-red-400">{summary.urgentCount}</p>
          </div>
          <div className="rounded-lg border p-3 text-center bg-amber-50 dark:bg-amber-950/15">
            <p className="text-xs text-muted-foreground">高优先级</p>
            <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{summary.highCount}</p>
          </div>
          <div className="rounded-lg border p-3 text-center bg-emerald-50 dark:bg-emerald-950/15">
            <p className="text-xs text-muted-foreground">预估总成本</p>
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">¥{summary.totalEstimatedCost.toLocaleString()}</p>
          </div>
        </div>

        {/* Recommendation Cards */}
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">暂无补货推荐</p>
            <p className="text-xs mt-1">所有产品库存充足或无销售数据</p>
          </div>
        ) : (
          <div className="max-h-[520px] overflow-y-auto custom-scrollbar space-y-3">
            {filtered.map((item: any, idx: number) => {
              const pConfig = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.LOW;
              const stockPercent = item.safetyStock > 0 ? Math.min(100, Math.round((item.currentStock / item.safetyStock) * 100)) : 100;
              const stockBarColor = stockPercent < 50 ? '#ef4444' : stockPercent < 100 ? '#f59e0b' : '#10b981';
              const isCreating = creatingOrders.has(item.sku);

              return (
                <div
                  key={item.sku}
                  className={`rounded-lg border p-4 hover:shadow-md transition-all duration-200 ${pConfig.borderClass} bg-card`}
                  style={{ borderLeftWidth: '4px', borderLeftColor: pConfig.color, animationDelay: `${idx * 50}ms` }}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold truncate">{item.productName}</span>
                        <Badge variant="outline" className="text-[10px] font-mono">{item.sku}</Badge>
                        <Badge className={`text-[10px] ${pConfig.bgClass} ${pConfig.textClass} border-0`}>
                          {pConfig.label}
                        </Badge>
                      </div>
                      {item.category && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.category} · {item.warehouse}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="h-7 text-[11px] gap-1 bg-orange-500 text-white shrink-0 disabled:opacity-50"
                      disabled={isCreating || item.recommendedQty <= 0}
                      onClick={() => handleCreateReorder(item)}
                    >
                      {isCreating ? (
                        <span className="animate-pulse">提交中...</span>
                      ) : (
                        <>
                          <ShoppingCart className="h-3 w-3" />
                          创建补货单
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Metrics Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    {/* Current Stock vs Safety Stock */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-muted-foreground">库存/安全库存</span>
                        <span className={`font-medium ${item.currentStock < item.safetyStock ? 'text-red-600 dark:text-red-400' : ''}`}>
                          {item.currentStock}/{item.safetyStock}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, stockPercent)}%`, backgroundColor: stockBarColor }}
                        />
                      </div>
                    </div>

                    {/* Daily Velocity */}
                    <div>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <TrendingDown className="h-3 w-3" />
                        日销量
                      </span>
                      <span className="font-medium block mt-0.5">{item.dailyVelocity} 件/天</span>
                    </div>

                    {/* Days Remaining */}
                    <div>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        剩余天数
                      </span>
                      <span className={`font-medium block mt-0.5 ${getDaysRemainingTextClass(item.daysRemaining)}`}>
                        {item.daysRemaining >= 999 ? '∞' : `${item.daysRemaining} 天`}
                      </span>
                    </div>

                    {/* Recommended Qty & Cost */}
                    <div>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        建议补货
                      </span>
                      <span className="font-medium block mt-0.5">
                        {item.recommendedQty > 0 ? (
                          <>
                            {item.recommendedQty} 件
                            <span className="text-muted-foreground ml-1">
                              ≈¥{item.estimatedCost.toLocaleString()}
                            </span>
                          </>
                        ) : (
                          <span className="text-emerald-600">无需补货</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Formula hint */}
                  <div className="mt-2 text-[10px] text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded inline-block">
                    {item.dailyVelocity} × ({item.leadTimeDays}交期 + {item.safetyDays}安全) − {item.currentStock} = {item.recommendedQty}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </CardContent>
    </Card>
  );
}
