'use client';

import { useProductDetail } from '@/hooks/use-supply-chain-data';
import { getRateForDestination } from '@/lib/exchange-rate';
import { useExchangeRate } from '@/hooks/use-exchange-rate';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Package, DollarSign, Warehouse, Truck, TrendingUp, RefreshCw,
} from 'lucide-react';

interface ProductDetailSheetProps {
  sku: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusColor: Record<string, string> = {
  healthy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  overstock: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
};

const shipmentStatusMap: Record<string, string> = {
  pending: '待发货', in_transit: '运输中', customs: '清关中',
  delivered: '已送达', delayed: '延误', exception: '异常',
};

function SectionCard({ title, icon, borderColor, children }: {
  title: string; icon: React.ReactNode; borderColor: string; children: React.ReactNode;
}) {
  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function ProductDetailSheet({ sku, open, onOpenChange }: ProductDetailSheetProps) {
  const { data, isLoading, isError, refetch } = useProductDetail(sku);

  const product = (data as { product?: Record<string, unknown> } | undefined)?.product;
  const inventory = (data as { inventory?: Record<string, unknown> } | undefined)?.inventory;
  const cost = (data as { cost?: Record<string, unknown> } | undefined)?.cost;
  const recentSales = (data as { recentSales?: unknown[] } | undefined)?.recentSales;
  const recentShipments = (data as { recentShipments?: Record<string, unknown>[] } | undefined)?.recentShipments;
  const stats = (data as { stats?: Record<string, unknown> } | undefined)?.stats;

  const destCurrency = getRateForDestination(String(cost?.destination ?? 'US')).code;
  const { liveRate: costLiveRate } = useExchangeRate(destCurrency);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[500px] overflow-y-auto p-0">
        <SheetHeader className="p-4 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-orange-500" />
            {product ? String(product.name) : '产品详情'}
          </SheetTitle>
          <SheetDescription>
            {product ? (
              <span className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs">{String(product.sku)}</span>
                <Badge variant="outline" className="text-[10px]">
                  ABC {String(product.abcClass)}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  FSN {String(product.fsnClass)}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {String(product.category)}
                </Badge>
              </span>
            ) : '加载中...'}
          </SheetDescription>
        </SheetHeader>

        {isError ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 p-4">
            <p className="text-sm text-muted-foreground">加载失败</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />重试
            </Button>
          </div>
        ) : isLoading ? (
          <DetailSkeleton />
        ) : product ? (
          <div className="space-y-4 p-4 pt-2">
            {/* Key Metrics */}
            <SectionCard title="基础信息" icon={<DollarSign className="h-4 w-4 text-orange-500" />} borderColor="border-l-orange-400">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">单位成本</span><p className="font-semibold">${Number(product.unitCost).toFixed(2)}</p></div>
                <div><span className="text-muted-foreground">售价</span><p className="font-semibold">${Number(product.sellingPrice).toFixed(2)}</p></div>
                <div><span className="text-muted-foreground">重量</span><p className="font-semibold">{Number(product.weight)}kg</p></div>
                <div><span className="text-muted-foreground">产地</span><p className="font-semibold">{String(product.origin)}</p></div>
              </div>
            </SectionCard>

            {/* Inventory */}
            <SectionCard title="库存信息" icon={<Warehouse className="h-4 w-4 text-emerald-500" />} borderColor="border-l-emerald-400">
              {inventory ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">当前库存</span><p className="font-semibold">{Number(inventory.quantity).toLocaleString()}</p></div>
                    <div><span className="text-muted-foreground">安全库存</span><p className="font-semibold">{Number(inventory.safetyStock).toLocaleString()}</p></div>
                    <div><span className="text-muted-foreground">再订购点</span><p className="font-semibold">{Number(inventory.reorderPoint ?? '-').toLocaleString()}</p></div>
                    <div><span className="text-muted-foreground">仓库</span><p className="font-semibold">{String(inventory.warehouse ?? '-')}</p></div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">库存状态</span>
                    <Badge className={statusColor[String(inventory.stockStatus)] ?? ''}>{String(inventory.stockStatus)}</Badge>
                  </div>
                  {inventory.turnoverDays != null && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">周转天数</span>
                      <span className="ml-2 font-semibold">{Number(inventory.turnoverDays)}天</span>
                      {inventory.turnoverRate != null && <span className="ml-1 text-muted-foreground">({Number(inventory.turnoverRate).toFixed(1)}次/年)</span>}
                    </div>
                  )}
                </div>
              ) : <p className="text-sm text-muted-foreground">暂无库存数据</p>}
            </SectionCard>

            {/* Cost Breakdown */}
            <SectionCard title="成本结构" icon={<DollarSign className="h-4 w-4 text-rose-500" />} borderColor="border-l-rose-400">
              {cost ? (
                <div className="space-y-2">
                  {[
                    ['原材料', cost.rawMaterial], ['人工', cost.labor], ['物流', cost.logistics],
                    ['关税', cost.tariff], ['平台费', cost.platformFee],
                    [`汇率 (${destCurrency}/CNY)${costLiveRate ? ' · 实时' : ''}`, costLiveRate ?? cost.exchangeRate],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{String(label)}</span>
                      <span className="font-mono">{Number(val).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                    <span>到岸成本</span><span>${Number(cost.totalLanded).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">毛利率</span>
                    <span className={`font-semibold ${Number(cost.grossMargin) >= 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {Number(cost.grossMargin).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ) : <p className="text-sm text-muted-foreground">暂无成本数据</p>}
            </SectionCard>

            {/* Recent Shipments */}
            {recentShipments && recentShipments.length > 0 && (
              <SectionCard title="最近货运" icon={<Truck className="h-4 w-4 text-violet-500" />} borderColor="border-l-violet-400">
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {recentShipments.slice(0, 5).map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                      <div>
                        <p className="font-mono text-xs">{String(s.trackingNumber)}</p>
                        <p className="text-muted-foreground text-xs">{String(s.carrier)}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="text-[10px]">{shipmentStatusMap[String(s.status)] ?? String(s.status)}</Badge>
                        {!!s.eta && <p className="text-[10px] text-muted-foreground mt-0.5">ETA {new Date(String(s.eta)).toLocaleDateString()}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Recent Sales Mini */}
            {recentSales && (recentSales as unknown[]).length > 0 && stats && (
              <SectionCard title="销售概况" icon={<TrendingUp className="h-4 w-4 text-cyan-500" />} borderColor="border-l-cyan-400">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">总收入</span><p className="font-semibold">${Number(stats.totalRevenue).toLocaleString()}</p></div>
                  <div><span className="text-muted-foreground">总销量</span><p className="font-semibold">{Number(stats.totalQuantity).toLocaleString()}</p></div>
                  <div><span className="text-muted-foreground">日均销量</span><p className="font-semibold">{Number(stats.avgDailySales)}</p></div>
                  <div><span className="text-muted-foreground">毛利率</span><p className="font-semibold">{Number(stats.grossMargin).toFixed(1)}%</p></div>
                </div>
                {/* Mini bar chart for last 7 sales */}
                {(recentSales as unknown[]).length > 0 && (
                  <div className="flex items-end gap-1 h-12 mt-2">
                    {(recentSales as Record<string, unknown>[]).slice(0, 7).reverse().map((s, i) => {
                      const qty = Number(s.quantity || 0);
                      const maxQty = Math.max(...(recentSales as Record<string, unknown>[]).slice(0, 7).map(r => Number(r.quantity || 1)));
                      const h = Math.max(4, (qty / maxQty) * 100);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                          <div className="w-full bg-cyan-400/70 dark:bg-cyan-600/60 rounded-sm" style={{ height: `${h}%` }} />
                          <span className="text-[8px] text-muted-foreground">{qty}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
