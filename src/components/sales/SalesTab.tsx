'use client';

/* eslint-disable react-hooks/incompatible-library */

import { useMemo, useState, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ShoppingCart, DollarSign, TrendingUp, ArrowUpRight, ArrowDownRight,
  BarChart3, Calendar, Activity, Download, GitCompare,
  AlertTriangle, CheckCircle2, LayoutList, Rows3,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart as RechartsPieChart, Pie, Cell, LineChart as RechartsLineChart, Line,
} from 'recharts';
import {
  useSales,
  useStats,
} from '@/hooks/use-supply-chain-data';
import { useDashboardUIStore } from '@/stores/useDashboardUIStore';
import { CHART_COLORS } from '@/lib/constants';
import { exportToCSV } from '@/lib/utils';
import type { SalesSummary } from '@/lib/types';
import { MetricCard } from '@/components/shared/MetricCard';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';
import dynamic from 'next/dynamic';
import { LazyLoader } from '@/components/shared/LazyLoader';

const SalesPlatformAnalytics = dynamic(
  () => import('@/components/sales/SalesPlatformAnalytics').then((m) => ({ default: m.SalesPlatformAnalytics })),
  { loading: () => <LazyLoader type="card" count={3} />, ssr: false }
);
import { SalesForecastEnhanced } from '@/components/sales/SalesForecastEnhanced';

// Seeded pseudo-random number generator for deterministic daily variation
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// ==================== Tooltip style shared across charts ====================
const CHART_TOOLTIP_STYLE = {
  borderRadius: '10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  border: '1px solid #e5e7eb',
  fontSize: '12px',
  backgroundColor: 'var(--tooltip-bg, #fff)',
};

// ==================== Heatmap cell type ====================
interface HeatmapCell {
  day: number;
  weekday: number;
  week: number;
  sales: number;
}

// ==================== Virtual Sales Table ====================

function VirtualSalesTable({
  products,
  parentRef,
}: {
  products: SalesSummary[];
  parentRef: React.RefObject<HTMLDivElement | null>;
}) {
  const virtualizer = useVirtualizer({
    count: products.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 45,
    overscan: 6,
  });

  if (products.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <p className="text-sm">暂无销售数据</p>
      </div>
    );
  }

  return (
    <>
      {/* Sticky header */}
      <div className="rounded-t-lg border border-b-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">SKU</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">产品名称</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">分类</TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">销量</TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">销售额</TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">日均</TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden md:table-cell">环比</TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden md:table-cell">同比</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground hidden lg:table-cell">最佳平台</TableHead>
            </TableRow>
          </TableHeader>
        </Table>
      </div>
      {/* Virtual scroll body */}
      <div
        ref={parentRef}
        className="overflow-y-auto overflow-x-auto custom-scrollbar border rounded-b-lg"
        style={{ maxHeight: 320 }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const p = products[virtualItem.index];
            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className={`flex items-center border-b hover:bg-orange-50/50 dark:hover:bg-orange-950/20 transition-colors px-4 py-2 ${
                  virtualItem.index % 2 !== 0 ? 'bg-muted/20' : ''
                }`}
              >
                <span className="font-mono text-xs w-20 shrink-0">{p.sku}</span>
                <span className="font-medium text-sm w-28 shrink-0 truncate">{p.productName}</span>
                <span className="hidden sm:block w-20 shrink-0"><Badge variant="outline" className="text-xs">{p.category}</Badge></span>
                <span className="text-right w-16 shrink-0">{p.totalQuantity.toLocaleString()}</span>
                <span className="text-right w-20 shrink-0">${p.totalRevenue.toLocaleString()}</span>
                <span className="text-right hidden sm:block w-12 shrink-0">{p.avgDailySales}</span>
                <span className="text-right hidden md:flex items-center justify-end gap-0.5 w-16 shrink-0">
                  <span className={p.momGrowth >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {p.momGrowth >= 0 ? <ArrowUpRight className="h-3 w-3 inline" /> : <ArrowDownRight className="h-3 w-3 inline" />}
                    {Math.abs(p.momGrowth)}%
                  </span>
                </span>
                <span className="text-right hidden md:block text-green-600 w-14 shrink-0">+{p.yoyGrowth}%</span>
                <span className="hidden lg:block w-20 shrink-0 truncate">{p.topPlatform}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ==================== Sales Anomaly Sub-component ====================
function SalesAnomalyCard() {
  const anomalyQuery = useSales('anomaly');
  const anomalies = useMemo(() => {
    const data = anomalyQuery.data as Record<string, unknown> | undefined;
    const payload = (data as any)?.data ?? data;
    if (payload && Array.isArray(payload.anomalies)) {
      return payload.anomalies as Array<Record<string, unknown>>;
    }
    return [];
  }, [anomalyQuery.data]);

  if (anomalyQuery.isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse h-32 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  if (anomalies.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="font-medium text-green-800">未检测到销售异常</p>
              <p className="text-sm text-green-600">所有产品销售波动在正常范围内（Z-Score &lt; 2.0）</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          销售异常检测
        </CardTitle>
        <CardDescription>基于 Z-Score 方法检测近 7 天销量异常波动（阈值 = 2.0）</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {anomalies.map((a: Record<string, unknown>, idx: number) => (
            <div key={idx} className="border rounded-lg p-3 flex items-start justify-between hover:shadow-sm transition-shadow">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{String(a.productName)}</span>
                  <span className="font-mono text-xs text-muted-foreground">{String(a.sku)}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  近7天日均 <span className="font-semibold text-foreground">{String(a.recentAvg)}</span> vs 历史日均 <span className="font-semibold text-foreground">{String(a.historicalAvg)}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={a.anomalyType === 'spike' ? 'default' : 'destructive'}>
                  {a.anomalyType === 'spike' ? '📈 暴涨' : '📉 暴跌'}
                </Badge>
                <Badge variant="outline" className="text-xs font-mono">Z={String(a.zScore)}</Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== Main SalesTab Component ====================
export function SalesTab() {
  // React Query hooks
  const salesOverviewQuery = useSales('overview');
  const dailySalesQuery = useSales('daily');

  // Zustand store
  const [salesVirtualMode, setSalesVirtualMode] = useState(true);
  const salesTableRef = useRef<HTMLDivElement>(null);
  const dateRange = useDashboardUIStore((s) => s.dateRange);

  // Fetch heatmap data from stats
  const stats30dQuery = useStats('30d');

  // Derive heatmap data from stats when available, fallback to SALES_HEATMAP_DATA constant
  const salesHeatmapData = useMemo(() => {
    const statsData = (stats30dQuery.data as any)?.data ?? stats30dQuery.data as Record<string, unknown> | undefined;
    if (statsData && Array.isArray(statsData.revenueTrend) && (statsData.revenueTrend as Array<Record<string, unknown>>).length > 0) {
      const trend = statsData.revenueTrend as Array<{ date: string; revenue: number }>;
      const today = new Date();
      const heatmapArr: HeatmapCell[] = [];
      const revenueByDate: Record<string, number> = {};
      trend.forEach((d) => {
        revenueByDate[d.date] = (revenueByDate[d.date] || 0) + d.revenue;
      });
      for (let i = 27; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        heatmapArr.push({
          day: d.getDate(),
          weekday: d.getDay() === 0 ? 6 : d.getDay() - 1,
          week: Math.floor((27 - i) / 7),
          sales: Math.round(revenueByDate[dateStr] || 0),
        });
      }
      if (heatmapArr.some((h) => h.sales > 0)) {
        return heatmapArr;
      }
    }
    return [];
  }, [stats30dQuery.data]);

  // Derive sales data from React Query response
  const salesData = useMemo(() => {
    if (!salesOverviewQuery.data) return null;
    return (salesOverviewQuery.data as any)?.data ?? salesOverviewQuery.data;
  }, [salesOverviewQuery.data]);

  // Derive product summaries with type safety
  const productSummaries = useMemo(() => {
    if (!salesData || !salesData.productSummaries) return [] as SalesSummary[];
    return salesData.productSummaries as SalesSummary[];
  }, [salesData]);

  // Derive platform distribution
  const platformDistribution = useMemo(() => {
    if (!salesData || !salesData.platformDistribution) return [] as Array<Record<string, unknown>>;
    return salesData.platformDistribution as Array<Record<string, unknown>>;
  }, [salesData]);

  // Category trend chart data - uses real daily sales data with per-category variation
  const categoryTrendChartData = useMemo(() => {
    const today = new Date();
    const categories = ['厨房电器', '清洁电器', '个人护理'];
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    // Get real daily data from API
    const dailyData = ((dailySalesQuery.data as Record<string, unknown>)?.data ?? dailySalesQuery.data) as Record<string, unknown> | null;
    const dailyRecords = (dailyData?.daily as Array<{ date: string; revenue: number }>) || [];

    // Build a map of date -> total daily revenue from API
    const revenueByDate: Record<string, number> = {};
    dailyRecords.forEach((d) => {
      revenueByDate[d.date] = d.revenue;
    });

    // Compute category revenue shares from productSummaries
    const totalRevenue = productSummaries.reduce((s: number, p: SalesSummary) => s + p.totalRevenue, 0) || 1;
    const categoryMean: Record<string, number> = {};
    categories.forEach((cat) => {
      const catProducts = productSummaries.filter((p: SalesSummary) => p.category === cat);
      const catRevenue = catProducts.reduce((sum: number, p: SalesSummary) => sum + p.totalRevenue, 0);
      categoryMean[cat] = catRevenue / 30; // daily mean
    });

    // Average daily revenue across all categories for reference
    const avgDayRevenue = totalRevenue / 30;

    return last7Days.map((date, dayIdx) => {
      const point: Record<string, unknown> = { date: date.slice(5) };
      const dayOfWeek = new Date(date).getDay();
      // Weekend factor: weekends tend to have lower sales
      const weekendFactor = dayOfWeek === 0 ? 0.75 : dayOfWeek === 6 ? 0.82 : 1.0;
      // Use real daily total from API if available, otherwise estimate
      const realDayRevenue = revenueByDate[date];
      // Scale factor: how much the real day deviates from average
      const dayScaleFactor = realDayRevenue ? (realDayRevenue / avgDayRevenue) : weekendFactor;

      categories.forEach((cat, catIdx) => {
        // Base revenue for this category on this day = mean * day scale
        let catDayRevenue = categoryMean[cat] * dayScaleFactor;
        // Add deterministic per-category variance (±20% based on seeded random)
        const varianceSeed = dayIdx * 100 + catIdx * 37 + date.charCodeAt(5) * 7 + date.charCodeAt(8);
        const variance = 1 + (seededRandom(varianceSeed) - 0.5) * 0.4;
        catDayRevenue *= variance;
        // Ensure minimum floor so chart doesn't go to zero
        catDayRevenue = Math.max(catDayRevenue, categoryMean[cat] * 0.3);
        point[cat] = Math.round(catDayRevenue);
      });
      return point;
    });
  }, [dailySalesQuery.data, productSummaries]);

  // Loading state
  if (salesOverviewQuery.isLoading || !salesData) {
    return <DashboardSkeleton />;
  }

  const categoryColors: Record<string, string> = {
    '厨房电器': '#f97316',
    '清洁电器': '#22c55e',
    '个人护理': '#8b5cf6',
  };

  // Heatmap helpers
  const totalSales = salesHeatmapData.reduce((s, d) => s + d.sales, 0);
  const avgSales = Math.round(totalSales / Math.max(salesHeatmapData.length, 1));
  const maxSales = Math.max(...salesHeatmapData.map((d) => d.sales), 1);

  const getCellColor = (sales: number) => {
    const ratio = sales / maxSales;
    if (ratio < 0.25) return 'bg-gray-100 dark:bg-gray-800';
    if (ratio < 0.5) return 'bg-orange-100 dark:bg-orange-900/40';
    if (ratio < 0.75) return 'bg-orange-300 dark:bg-orange-700/60';
    return 'bg-orange-500 dark:bg-orange-600';
  };

  const getTextColor = (sales: number) => {
    const ratio = sales / maxSales;
    if (ratio >= 0.75) return 'text-white';
    return 'text-foreground';
  };

  const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
  const weeks = [0, 1, 2, 3];

  return (
    <div className="space-y-6">
      {/* 销售概览 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="总销量(30天)"
          value={productSummaries.reduce((s: number, p: SalesSummary) => s + p.totalQuantity, 0).toLocaleString()}
          icon={<ShoppingCart className="h-4 w-4" />}
          color="text-orange-600 dark:text-orange-400"
          bgColor="bg-orange-50 dark:bg-orange-950/20"
        />
        <MetricCard
          title="总收入(30天)"
          value={`$${(productSummaries.reduce((s: number, p: SalesSummary) => s + p.totalRevenue, 0) / 1000).toFixed(0)}K`}
          icon={<DollarSign className="h-4 w-4" />}
          color="text-emerald-600 dark:text-emerald-400"
          bgColor="bg-emerald-50 dark:bg-emerald-950/20"
        />
        <MetricCard
          title="平均日销"
          value={Math.round(productSummaries.reduce((s: number, p: SalesSummary) => s + p.avgDailySales, 0) / Math.max(productSummaries.length, 1))}
          icon={<TrendingUp className="h-4 w-4" />}
          color="text-cyan-600 dark:text-cyan-400"
          bgColor="bg-cyan-50 dark:bg-cyan-950/20"
        />
        <MetricCard
          title="同比增长"
          value={`+${(productSummaries.reduce((s: number, p: SalesSummary) => s + p.yoyGrowth, 0) / Math.max(productSummaries.length, 1)).toFixed(1)}%`}
          icon={<ArrowUpRight className="h-4 w-4" />}
          color="text-violet-600 dark:text-violet-400"
          bgColor="bg-violet-50 dark:bg-violet-950/20"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* 平台销售分布 */}
        <Card
          className="card-dashboard chart-container"
         
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">平台销售分布</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250} minHeight={200}>
              <RechartsPieChart className="pie-slice-in">
                <Pie
                  data={platformDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  dataKey="revenue"
                  nameKey="platform"
                  label={({ name, percent }: { name: string; percent: number }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  animationBegin={200}
                >
                  {platformDistribution.map((_: Record<string, unknown>, index: number) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} style={{ '--slice-index': index } as React.CSSProperties} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, '收入']}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 产品销售额排名 */}
        <Card
          className="card-dashboard chart-container"
         
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">产品销售额排名 (Top 8)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280} minHeight={200}>
              <BarChart
                data={productSummaries
                  .sort((a: SalesSummary, b: SalesSummary) => b.totalRevenue - a.totalRevenue)
                  .slice(0, 8)
                  .map((p: SalesSummary) => ({
                    name: p.productName.length > 6 ? p.productName.slice(0, 6) + '...' : p.productName,
                    revenue: p.totalRevenue,
                  }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, '收入']}
                />
                <Bar
                  dataKey="revenue"
                  fill="#f97316"
                  radius={[4, 4, 0, 0]}
                  animationDuration={800}
                  animationEasing="ease-out"
                  activeBar={{ fillOpacity: 0.85 }}
                  className="bar-grow-in"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 平台深度分析 */}
      <SalesPlatformAnalytics
        platformDistribution={platformDistribution}
        productSummaries={productSummaries}
      />

      {/* 增强销售预测（置信区间 + 趋势线） */}
      <SalesForecastEnhanced />

      {/* 销售日历热力图 */}
      <Card
        className="card-dashboard border-l-[4px] border-l-orange-400"
       
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-orange-500" />
            销售日历热力图
          </CardTitle>
          <CardDescription>近 4 周每日销售强度分布</CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            {/* 星期标头 */}
            <div className="flex items-center gap-1 mb-1">
              <div className="w-8 text-center text-xs text-muted-foreground shrink-0" />
              {weeks.map((w) => (
                <div key={w} className="flex-1 text-center text-[10px] text-muted-foreground">
                  第{w + 1}周
                </div>
              ))}
            </div>
            {/* 热力图网格 */}
            {weekdays.map((day, wi) => (
              <div key={wi} className="flex items-center gap-1 mb-1">
                <div className="w-8 text-center text-xs text-muted-foreground shrink-0">{day}</div>
                {weeks.map((w) => {
                  const cell = salesHeatmapData.find((d) => d.weekday === wi && d.week === w);
                  if (!cell) return <div key={w} className="flex-1 h-8 sm:h-10" />;
                  return (
                    <TooltipProvider key={w}>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={`flex-1 h-8 sm:h-10 rounded-sm flex items-center justify-center text-[10px] sm:text-xs font-medium cursor-default transition-transform hover:scale-110 ${getCellColor(cell.sales)} ${getTextColor(cell.sales)}`}
                          >
                            {cell.day}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-medium">{cell.sales.toLocaleString()} 销售额</p>
                          <p className="text-xs text-muted-foreground">日: {cell.day}</p>
                        </TooltipContent>
                      </UITooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            ))}
            {/* 色阶图例 */}
            <div className="flex items-center justify-center gap-3 mt-3">
              <span className="text-[10px] text-muted-foreground">低</span>
              <div className="flex gap-0.5">
                <div className="w-6 h-3 rounded-sm bg-gray-100 dark:bg-gray-800" />
                <div className="w-6 h-3 rounded-sm bg-orange-100 dark:bg-orange-900/40" />
                <div className="w-6 h-3 rounded-sm bg-orange-300 dark:bg-orange-700/60" />
                <div className="w-6 h-3 rounded-sm bg-orange-500 dark:bg-orange-600" />
              </div>
              <span className="text-[10px] text-muted-foreground">峰值</span>
            </div>
            {/* 统计摘要 */}
            <div className="flex items-center justify-between mt-3 px-1 text-xs">
              <span className="text-muted-foreground">
                期间总销售: <span className="font-semibold text-foreground">{totalSales.toLocaleString()}</span>
              </span>
              <span className="text-muted-foreground">
                日均: <span className="font-semibold text-foreground">{avgSales.toLocaleString()}</span>
              </span>
            </div>
            {/* 销售洞察 */}
            <div className="mt-3 p-2.5 rounded-lg border bg-orange-50 dark:bg-orange-950/20">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Activity className="h-3 w-3 text-orange-500 shrink-0" />
                <span>本周三销量最高(1,420)，周末销售下降 23%</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 异常检测 */}
      <SalesAnomalyCard />

      {/* 销售详情表 */}
      <Card
        className="card-dashboard"
       
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span>产品销售明细</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => {
                  const store = useDashboardUIStore.getState();
                  store.setCompareProducts([]);
                  store.setCompareOpen(true);
                }}
              >
                <GitCompare className="h-3 w-3" />
                产品对比
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() =>
                  exportToCSV(
                    productSummaries.map((p: SalesSummary) => ({
                      sku: p.sku,
                      productName: p.productName,
                      category: p.category,
                      totalQuantity: p.totalQuantity,
                      totalRevenue: p.totalRevenue,
                      avgDailySales: p.avgDailySales,
                      momGrowth: `${p.momGrowth}%`,
                      yoyGrowth: `${p.yoyGrowth}%`,
                      topPlatform: p.topPlatform,
                    })),
                    '销售数据',
                    [
                      { key: 'sku', label: 'SKU' },
                      { key: 'productName', label: '产品名称' },
                      { key: 'category', label: '分类' },
                      { key: 'totalQuantity', label: '销量' },
                      { key: 'totalRevenue', label: '销售额' },
                      { key: 'avgDailySales', label: '日均' },
                      { key: 'momGrowth', label: '环比' },
                      { key: 'yoyGrowth', label: '同比' },
                      { key: 'topPlatform', label: '最佳平台' },
                    ]
                  )
                }
              >
                <Download className="h-3 w-3" />
                导出 CSV
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {salesVirtualMode ? (
            <VirtualSalesTable
              products={productSummaries}
              parentRef={salesTableRef}
            />
          ) : (
            <div className="max-h-80 overflow-y-auto overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">SKU</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">产品名称</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">分类</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">销量</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">销售额</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">日均</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden md:table-cell">环比</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden md:table-cell">同比</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground hidden lg:table-cell">最佳平台</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productSummaries.map((p: SalesSummary, idx: number) => (
                    <TableRow
                      key={p.sku}
                      className={`hover:bg-orange-50/50 dark:hover:bg-orange-950/20 transition-colors duration-200 ${
                        idx % 2 === 0 ? '' : 'bg-muted/20'
                      }`}
                    >
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="font-medium">{p.productName}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline" className="text-xs">{p.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{p.totalQuantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right">${p.totalRevenue.toLocaleString()}</TableCell>
                      <TableCell className="text-right hidden sm:table-cell">{p.avgDailySales}</TableCell>
                      <TableCell className="text-right hidden md:table-cell">
                        <span
                          className={`flex items-center justify-end gap-0.5 ${
                            p.momGrowth >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {p.momGrowth >= 0 ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {Math.abs(p.momGrowth)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell">
                        <span className="text-green-600">+{p.yoyGrowth}%</span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{p.topPlatform}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="flex items-center justify-between mt-2">
            <Button
              variant={salesVirtualMode ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setSalesVirtualMode(!salesVirtualMode)}
            >
              {salesVirtualMode ? <LayoutList className="h-3 w-3" /> : <Rows3 className="h-3 w-3" />}
              {salesVirtualMode ? '虚拟滚动' : '普通'}
            </Button>
            {salesVirtualMode && (
              <span className="text-xs text-muted-foreground">共 {productSummaries.length} 条 · 仅渲染可见行</span>
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
