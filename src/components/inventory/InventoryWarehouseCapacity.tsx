'use client';

import { Warehouse, ArrowRightLeft, Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CHART_COLORS } from '@/lib/constants';
import { CHART_TOOLTIP_STYLE } from './InventoryTab.helpers';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ==================== Warehouse Capacity Heatmap ====================

// ─── Typed interfaces for unknown data ────────────────────────────────────

interface TrendItem {
  date: string;
  overallUtilization: number;
}

interface TrendSummary {
  currentOverallUtilization: number;
  peakUtilization: number;
  trendDirection: 'increasing' | 'decreasing' | 'stable';
}

interface InventoryWarehouseCapacityProps {
  warehouseCapacityData: unknown;
  zoneSummary: Record<string, unknown> | null;
  trend: Record<string, unknown>[];
  trendSummary: Record<string, unknown> | null;
  onTransferClick: () => void;
}

export function InventoryWarehouseCapacity({
  warehouseCapacityData,
  zoneSummary,
  trend: rawTrend,
  trendSummary: rawTrendSummary,
  onTransferClick,
}: InventoryWarehouseCapacityProps) {
  const trendSummary = rawTrendSummary as TrendSummary | null;
  const trend = rawTrend as unknown as TrendItem[];
  return (
    <Card className="card-dashboard border-l-[4px] border-l-violet-400">
      <CardHeader className="pb-2 bg-muted/30">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-violet-500" />
            仓库容量热力图
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-normal">
              {warehouseCapacityData ? ((warehouseCapacityData as Record<string, unknown>)?.capacity as unknown[])?.length || '-' : '-'} 个仓库
            </Badge>
            {zoneSummary && (
              <>
                {(zoneSummary as Record<string, number>).criticalZones > 0 && (
                  <Badge variant="outline" className="text-xs bg-white dark:bg-white/90" style={{ color: '#ef4444', fontWeight: 600 }}>
                    {(zoneSummary as Record<string, number>).criticalZones} 满仓
                  </Badge>
                )}
                {(zoneSummary as Record<string, number>).warningZones > 0 && (
                  <Badge variant="outline" className="text-xs bg-white dark:bg-white/90" style={{ color: '#b8860b', fontWeight: 600 }}>
                    {(zoneSummary as Record<string, number>).warningZones} 拥挤
                  </Badge>
                )}
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30"
              onClick={onTransferClick}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              库存调拨
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {(() => {
          // Use API data if available, otherwise fallback to constant
          if (warehouseCapacityData) {
            const whCapacity = (warehouseCapacityData as Record<string, unknown>)?.capacity as Record<string, unknown>[];
            if (!whCapacity) return null;
            const allZones = whCapacity.flatMap((wh: Record<string, unknown>) => (wh.zones as Record<string, unknown>[]));
            const totalCap = whCapacity.reduce((s: number, wh: Record<string, unknown>) => s + (wh.totalCapacity as number), 0);
            const totalUsed = whCapacity.reduce((s: number, wh: Record<string, unknown>) => s + (wh.totalUsed as number), 0);
            const zoneColors: Record<string, string> = { fast: '#f97316', normal: '#22c55e', bulk: '#06b6d4' };
            const GOLD = '#b8860b';
            const allRecommendations = whCapacity.flatMap((wh: Record<string, unknown>) => (wh.recommendations as string[] || []));
            return (
              <>
                {/* 总利用率 */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium">总利用率</span>
                    <span className="text-sm text-muted-foreground">
                      {totalUsed.toLocaleString()} / {totalCap.toLocaleString()} (<span style={{ color: GOLD, fontWeight: 600 }}>{((totalUsed / totalCap) * 100).toFixed(1)}%</span>)
                    </span>
                  </div>
                  <Progress value={(totalUsed / totalCap) * 100} className="h-2 transition-all duration-500" />
                </div>
                {/* 仓库分布 */}
                <div className="space-y-3 mb-5">
                  {whCapacity.map((wh: Record<string, unknown>) => {
                    const whPercent = ((wh.totalUsed as number) / (wh.totalCapacity as number)) * 100;
                    return (
                      <div key={wh.warehouse as string}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">{wh.warehouse as string}</span>
                          <span className="text-xs text-muted-foreground">{(wh.totalUsed as number).toLocaleString()} / {(wh.totalCapacity as number).toLocaleString()} (<span style={{ color: GOLD, fontWeight: 600 }}>{whPercent.toFixed(1)}%</span>)</span>
                        </div>
                        <Progress value={whPercent} className="h-1.5 transition-all duration-500" />
                      </div>
                    );
                  })}
                </div>
                {/* 区域卡片网格 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {allZones.map((zone: Record<string, unknown>, idx: number) => {
                    const zonePercent = zone.utilization as number;
                    const barColor = zonePercent > 90 ? '#ef4444' : zonePercent > 70 ? '#f59e0b' : '#22c55e';
                    const zoneColor = (zoneColors[zone.type as string] || CHART_COLORS[idx % CHART_COLORS.length]) as string;
                    return (
                      <div key={`${zone.warehouse as string}-${zone.name as string}`} className="rounded-lg border p-3 hover:shadow-md hover:scale-[1.02] transition-all duration-200" style={{ borderLeftWidth: '3px', borderLeftColor: zoneColor }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold">{zone.name as string}</span>
                          <div className="flex items-center gap-1">
                            <span className="inline-block w-2 h-2 rounded-full bg-white border" style={{ borderColor: barColor }} />
                            <Badge variant="outline" className="text-[10px] bg-white dark:bg-white/90" style={{ color: GOLD, fontWeight: 700 }}>
                              {zonePercent.toFixed(0)}%
                            </Badge>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] mb-2">{zone.type === 'fast' ? '高频拣选' : zone.type === 'normal' ? '常规存储' : '大件仓储'}</Badge>
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>{(zone.used as number).toLocaleString()} / {(zone.capacity as number).toLocaleString()}</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full progress-fill-bar" style={{ width: `${zonePercent}%`, backgroundColor: zoneColor, transition: 'width 1s ease-out' }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* 容量建议 */}
                {allRecommendations.length > 0 && (
                  <div className="mt-4 p-3 rounded-lg border bg-violet-50 dark:bg-violet-950/20">
                    <h4 className="text-sm font-semibold flex items-center gap-2 text-violet-700 dark:text-violet-400">
                      <Zap className="h-3.5 w-3.5" />
                      容量建议
                    </h4>
                    <div className="mt-2 space-y-1.5">
                      {allRecommendations.map((rec: string, rIdx: number) => (
                        <p key={rIdx} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="shrink-0" style={{ color: GOLD }}>●</span>
                          {rec}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {/* 7天利用率趋势 */}
                {trend.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2 text-violet-700 dark:text-violet-400">
                        {(() => {
                          const TrendIcon = trendSummary?.trendDirection === 'increasing' ? TrendingUp
                            : trendSummary?.trendDirection === 'decreasing' ? TrendingDown : Minus;
                          return <TrendIcon className="h-4 w-4" />;
                        })()}
                        7天利用率趋势
                      </h4>
                      {trendSummary && (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>当前: <b>{trendSummary.currentOverallUtilization}%</b></span>
                          <span>峰值: {trendSummary.peakUtilization}%</span>
                          <span>趋势:
                            <span className="ml-1" style={{ color: GOLD, fontWeight: 600 }}>
                              {trendSummary.trendDirection === 'increasing' ? '↑ 上升' :
                               trendSummary.trendDirection === 'decreasing' ? '↓ 下降' : '→ 稳定'}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={trend.map((d: TrendItem) => ({
                        date: (d.date as string).slice(5),
                        utilization: d.overallUtilization,
                      }))}>
                        <defs>
                          <linearGradient id="utilGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number) => [`${value}%`, '利用率']} />
                        <Area
                          type="monotone"
                          dataKey="utilization"
                          stroke="#8b5cf6"
                          strokeWidth={2}
                          fill="url(#utilGradient)"
                          animationDuration={800}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            );
          }
          // Fallback to constant data
          return (
            <>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">总利用率</span>
                  <span className="text-sm text-muted-foreground">
                    {0} / {1} ({((0 / 1) * 100).toFixed(1)}%)
                  </span>
                </div>
                <Progress value={75} className="h-2 transition-all duration-500" />
              </div>
              <div className="space-y-3 mb-5">
                {([] as Array<{ name: string; used: number; capacity: number }>).map((wh) => {
                  const whPercent = (wh.used / wh.capacity) * 100;
                  return (
                    <div key={wh.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">{wh.name}</span>
                        <span className="text-xs text-muted-foreground">{wh.used.toLocaleString()} / {wh.capacity.toLocaleString()} ({whPercent.toFixed(1)}%)</span>
                      </div>
                      <Progress value={whPercent} className="h-1.5 transition-all duration-500" />
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {([] as Array<{ name: string; used: number; capacity: number; color: string; category: string }>).map((zone) => {
                  const zonePercent = (zone.used / zone.capacity) * 100;
                  const badgeColor = zonePercent > 90 ? 'destructive' : zonePercent > 70 ? 'secondary' : 'default';
                  const badgeTextColor = zonePercent > 90 ? 'text-red-600 dark:text-red-400' : zonePercent > 70 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400';
                  return (
                    <div key={zone.name} className="rounded-lg border p-3 hover:shadow-md hover:scale-[1.02] transition-all duration-200" style={{ borderLeftWidth: '3px', borderLeftColor: zone.color }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold">{zone.name}</span>
                        <Badge variant={badgeColor as 'default' | 'secondary' | 'destructive'} className={`text-[10px] pulse-soft ${badgeTextColor}`}>
                          {zonePercent.toFixed(0)}%
                        </Badge>
                      </div>
                      <Badge variant="outline" className="text-[10px] mb-2">{zone.category}</Badge>
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>{zone.used.toLocaleString()} / {zone.capacity.toLocaleString()}</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full progress-fill-bar" style={{ width: `${zonePercent}%`, backgroundColor: zone.color, transition: 'width 1s ease-out' }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 p-3 rounded-lg border bg-violet-50 dark:bg-violet-950/20">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-violet-700 dark:text-violet-400">
                  <Zap className="h-3.5 w-3.5" />
                  容量建议
                </h4>
                <div className="mt-2 space-y-1.5">
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-yellow-500 shrink-0">●</span>
                    深圳仓 A 区利用率 84%，建议调拨部分库存至义乌仓
                  </p>
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-green-500 shrink-0">●</span>
                    义乌仓 E 区退货区利用率仅 35%，可临时调整为暂存区
                  </p>
                </div>
              </div>
              {/* 7天利用率趋势 */}
              {trend.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2 text-violet-700 dark:text-violet-400">
                      {(() => {
                        const TrendIcon = trendSummary?.trendDirection === 'increasing' ? TrendingUp
                          : trendSummary?.trendDirection === 'decreasing' ? TrendingDown : Minus;
                        return <TrendIcon className="h-4 w-4" />;
                      })()}
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
                    <AreaChart data={trend.map((d: TrendItem) => ({
                      date: (d.date as string).slice(5),
                      utilization: d.overallUtilization,
                    }))}>
                      <defs>
                        <linearGradient id="utilGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number) => [`${value}%`, '利用率']} />
                      <Area
                        type="monotone"
                        dataKey="utilization"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        fill="url(#utilGradient)"
                        animationDuration={800}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          );
        })()}
      </CardContent>
    </Card>
  );
}
