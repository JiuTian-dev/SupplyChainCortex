'use client';

import { useMemo, useEffect, useState, useCallback } from 'react';
import { useSkuFilter } from '@/hooks/useSkuFilter';
import {
  DollarSign, TrendingUp, AlertTriangle,
  Download, PieChart, Ship, Globe, Package,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell,
  ReferenceLine,
} from 'recharts';
import {
  useCost,
} from '@/hooks/use-supply-chain-data';
import { ProductFilter } from '@/components/shared/ProductFilter';
import { FilterChips } from '@/components/shared/FilterChips';
import { useInventoryUIStore } from '@/stores/useInventoryUIStore';
import { useDashboardConfigStore } from '@/stores/dashboard-config-store';
import { CURRENCY_SYMBOLS } from '@/lib/dashboard/config';
import { CHART_COLORS } from '@/lib/constants';
import { CostSimulatorEnhanced } from '@/components/cost/CostSimulatorEnhanced';
import { ExchangeRateMatrix } from '@/components/cost/ExchangeRateMatrix';
import { exportToCSV } from '@/lib/utils';
import type { CostRecord } from '@prisma/client';
import { MetricCard } from '@/components/shared/MetricCard';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';
import dynamic from 'next/dynamic';
import { LazyLoader } from '@/components/shared/LazyLoader';

const CostImpactHeatmap = dynamic(
  () => import('@/components/cost/CostImpactHeatmap').then((m) => ({ default: m.CostImpactHeatmap })),
  { loading: () => <LazyLoader type="chart" className="h-[280px]" />, ssr: false }
);
import { CostOptimizationPanel } from '@/components/cost/CostOptimizationPanel';
const CostWaterfallChart = dynamic(
  () => import('@/components/cost/CostWaterfallChart').then((m) => ({ default: m.CostWaterfallChart })),
  { loading: () => <LazyLoader type="chart" className="h-[300px]" />, ssr: false }
);

// ==================== Tooltip style shared across charts ====================
const CHART_TOOLTIP_STYLE = {
  borderRadius: '10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  border: '1px solid #e5e7eb',
  fontSize: '12px',
  backgroundColor: 'var(--tooltip-bg, #fff)',
  className: 'chart-tooltip-custom',
};

// ==================== Cost Breakdown Sub-component ====================
function CostBreakdownChart({ sku, costs }: { sku: string; costs: CostRecord[] }) {
  const cost = costs.find(c => c.sku === sku);
  if (!cost) return null;

  const data = [
    { name: '原材料', value: cost.rawMaterial },
    { name: '人工', value: cost.labor },
    { name: '物流', value: cost.logistics },
    { name: '关税', value: cost.tariff },
    { name: '平台费', value: cost.platformFee },
  ];

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <RechartsPieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={80}
            dataKey="value"
            nameKey="name"
            label={({ name, percent }: { name: string; percent: number }) =>
              `${name} ${(percent * 100).toFixed(0)}%`
            }
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[index]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
          />
        </RechartsPieChart>
      </ResponsiveContainer>
      <div className="mt-2 space-y-1.5">
        {data.map((item, idx) => (
          <div key={item.name} className="flex items-center justify-between text-sm px-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: CHART_COLORS[idx] }} />
              <span>{item.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">${item.value.toFixed(2)}</span>
              <span className="text-xs text-muted-foreground">
                ({(item.value / cost.totalLanded * 100).toFixed(1)}%)
              </span>
            </div>
          </div>
        ))}
        <Separator className="my-1" />
        <div className="flex items-center justify-between text-sm px-2 font-semibold">
          <span>到岸总成本</span>
          <span>${cost.totalLanded.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

// ==================== Banner Helpers ====================
function pillStyle(trend: string) {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ';
  if (trend === 'rising') return base + 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400';
  if (trend === 'falling') return base + 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/20 dark:text-green-400';
  return base + 'border-border bg-muted/30 text-muted-foreground';
}

function CommodityBanner({ data }: { data: Record<string, unknown> }) {
  const trend = (data?.overallTrend as string) || 'stable';
  const pct = data?.avgChangePct as number || 0;
  return <span className={pillStyle(trend)}><Package className="h-3 w-3" />商品 {pct > 0 ? '+' : ''}{pct}%</span>;
}

function FreightBanner({ data }: { data: Record<string, unknown> }) {
  const trend = (data?.trend as string) || 'stable';
  return <span className={pillStyle(trend)}><Ship className="h-3 w-3" />运费 ${data?.avgRate40GP as number || 0}/40GP</span>;
}

// ==================== Main CostTab Component ====================
export function CostTab() {
  // Local filter state with URL persistence
  const { selectedSkus, updateSkus, filterParams } = useSkuFilter();
  const currency = useDashboardConfigStore(s => s.config.currency);
  const sym = CURRENCY_SYMBOLS[currency] || '$';
  const [skuLabels, setSkuLabels] = useState<Record<string, string>>({});
  const costListQuery = useCost('list', filterParams);
  const costTrendQuery = useCost('trend', filterParams);

  // Zustand store
  const selectedProduct = useInventoryUIStore((s) => s.selectedProduct);
  const setSelectedProduct = useInventoryUIStore((s) => s.setSelectedProduct);

  // Cost trend banner — live commodity/freight/carbon data
  const [costTrend, setCostTrend] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    const fetchTrend = async () => {
      try {
        const [commodity, freight] = await Promise.all([
          fetch('/api/commodity').then(r => r.json()).catch(() => ({})),
          fetch('/api/freight').then(r => r.json()).catch(() => ({})),
        ]);
        setCostTrend({ commodity, freight });
      } catch { /* degrade silently */ }
    };
    fetchTrend();
    const i = setInterval(fetchTrend, 120000);
    return () => clearInterval(i);
  }, []);

  // Derive cost data from React Query responses
  const costData = useMemo(() => {
    if (!costListQuery.data) return null;
    return (costListQuery.data as any)?.data ?? costListQuery.data;
  }, [costListQuery.data]);

  // Derive cost variance data from trend API, fallback to constant
  const costVarianceData = useMemo(() => {
    const trendData = costTrendQuery.data as Record<string, unknown> | undefined;
    // API returns { months, trends: [...] } directly; react-query stores it in .data
    const trends = (trendData as any)?.trends as Array<{
      sku: string;
      productName: string;
      monthlyData: Array<{ totalLanded: number }>;
    }> | undefined;
    if (trends && Array.isArray(trends)) {
      return trends.map((t) => {
        const md = t.monthlyData;
        if (!md || md.length < 2) return { name: t.productName, change: 0, absChange: 0, sku: t.sku };
        const prev = md[md.length - 2].totalLanded;
        const curr = md[md.length - 1].totalLanded;
        const change = prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : 0;
        const absChange = Math.round((curr - prev) * 100) / 100;
        return { name: t.productName, change, absChange, sku: t.sku };
      });
    }
    return [];
  }, [costTrendQuery.data]);

  // Loading state
  if (costListQuery.isLoading || !costData) {
    return <DashboardSkeleton />;
  }

  const costs = (costData as Record<string, unknown>).costs as CostRecord[];

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-30 flex items-center gap-2 flex-wrap py-2 bg-background/95 backdrop-blur border-b -mx-2 px-2">
        <ProductFilter selected={selectedSkus} onChange={updateSkus} onLabelsLoad={setSkuLabels} />
        <FilterChips selected={selectedSkus} labels={skuLabels} onRemove={(sku) => updateSkus(selectedSkus.filter(s => s !== sku))} onClearAll={() => updateSkus([])} />
      </div>
      {/* 成本趋势横幅 — 大宗商品 · 运费 */}
      {costTrend && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          <CommodityBanner data={costTrend.commodity as Record<string, unknown>} />
          <FreightBanner data={costTrend.freight as Record<string, unknown>} />
        </div>
      )}

      {/* 成本概览卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <MetricCard
          title="平均到岸成本"
          value={`${sym}${(costs.reduce((s: number, c: CostRecord) => s + c.totalLanded, 0) / costs.length).toFixed(2)}`}
          icon={<DollarSign className="h-4 w-4" />}
          color="text-orange-600 dark:text-orange-400"
          bgColor="bg-orange-50 dark:bg-orange-950/20"
        />
        <MetricCard
          title="平均毛利率"
          value={`${(costs.reduce((s: number, c: CostRecord) => s + c.grossMargin, 0) / costs.length).toFixed(1)}%`}
          icon={<TrendingUp className="h-4 w-4" />}
          color="text-emerald-600 dark:text-emerald-400"
          bgColor="bg-emerald-50 dark:bg-emerald-950/20"
        />
        <MetricCard
          title="成本预警"
          value={costs.filter((c: CostRecord) => c.grossMargin < 48).length}
          icon={<AlertTriangle className="h-4 w-4" />}
          color="text-rose-600 dark:text-rose-400"
          bgColor="bg-rose-50 dark:bg-rose-950/20"
        />
      </div>

      {/* 主要结算货币对 CNY 实时汇率矩阵 */}
      <ExchangeRateMatrix />

      {/* 交叉影响矩阵 — 外部因素对产品毛利率的敏感度 */}
      <Card className="card-dashboard">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">外部因素敏感度矩阵</CardTitle>
          <CardDescription>铜/运费/汇率变动对各产品毛利率的影响估算 · <span className="text-orange-600 font-medium">含 2 周趋势预测</span></CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px]">产品</TableHead>
                  <TableHead className="text-right text-[10px]">铜价 +10%</TableHead>
                  <TableHead className="text-right text-[10px]">运费 +15%</TableHead>
                  <TableHead className="text-right text-[10px]">CNY 升值 5%</TableHead>
                  <TableHead className="text-right text-[10px]">综合影响</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costs.slice(0, 6).map((c: CostRecord) => {
                  const copperShare = c.rawMaterial / Math.max(c.totalLanded, 1);
                  const freightShare = c.logistics / Math.max(c.totalLanded, 1);
                  const cnyShare = (c.rawMaterial + c.labor) / Math.max(c.totalLanded, 1);
                  const copperImpact = Math.round(copperShare * 10 * 0.3 * 100) / 100;
                  const freightImpact = Math.round(freightShare * 15 * 100) / 100;
                  const fxImpact = Math.round(cnyShare * 5 * 100) / 100;
                  const totalImpact = Math.round((copperImpact + freightImpact + fxImpact) * 10) / 10;
                  const severityColor = totalImpact >= 4 ? 'text-red-600' : totalImpact >= 2.5 ? 'text-amber-600' : 'text-muted-foreground';
                  return (
                    <TableRow key={c.sku} className="text-xs">
                      <TableCell className="font-medium">{c.productName.length > 8 ? c.productName.slice(0, 8) + '…' : c.productName}</TableCell>
                      <TableCell className="text-right">{copperImpact > 0 ? '−' : ''}{copperImpact}pp</TableCell>
                      <TableCell className="text-right">−{freightImpact}pp</TableCell>
                      <TableCell className="text-right">−{fxImpact}pp</TableCell>
                      <TableCell className={`text-right font-semibold ${severityColor}`}>−{totalImpact}pp</TableCell>
                    </TableRow>
                  );
                })}
                {/* Cost prediction — 2-week trend extrapolation */}
                <TableRow className="bg-orange-50/50 dark:bg-orange-950/10 border-t-2">
                  <TableCell colSpan={5} className="text-[10px] text-muted-foreground py-1.5">
                    📈 <span className="font-medium text-orange-700 dark:text-orange-300">2 周预测:</span>
                    {' '}当前铜/运费/汇率趋势持续 → 综合毛利影响将进一步扩大至{' '}
                    <span className="font-bold text-red-600">
                      −{(costs.slice(0, 6).reduce((s: number, c: CostRecord) => {
                        const copperShare = c.rawMaterial / Math.max(c.totalLanded, 1) * 10 * 0.3;
                        const freightShare = c.logistics / Math.max(c.totalLanded, 1) * 15;
                        const cnyShare = (c.rawMaterial + c.labor) / Math.max(c.totalLanded, 1) * 5;
                        return s + (copperShare + freightShare + cnyShare) * 1.4; // 1.4x for 2-week compounding
                      }, 0) / Math.max(costs.slice(0, 6).length, 1)).toFixed(1)}
                      pp
                    </span>{' '}(6 产品均值，基于 2 周趋势外推)
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* 毛利率对比 */}
        <Card
          className="card-dashboard chart-container"
         
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">产品毛利率对比</CardTitle>
            <CardDescription>绿色虚线 = 48% 安全线</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart
                data={costs.map((c: CostRecord) => ({
                  name: c.productName.length > 6 ? c.productName.slice(0, 6) + '...' : c.productName,
                  grossMargin: c.grossMargin,
                  totalLanded: c.totalLanded,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 80]} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend />
                <ReferenceLine
                  y={48}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  label={{ value: '预警线 48%', position: 'top', fill: '#ef4444', fontSize: 10 }}
                />
                <Bar dataKey="grossMargin" name="毛利率 (%)" radius={[4, 4, 0, 0]} className="bar-grow-in">
                  {costs.map((c: CostRecord, i: number) => (
                    <Cell key={i} fill={c.grossMargin < 48 ? '#ef4444' : '#22c55e'} style={{ '--bar-index': i } as React.CSSProperties} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 成本变动追踪 */}
        <Card
          className="card-dashboard chart-container border-l-[4px] border-l-rose-400"
         
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-rose-500" />
              成本变动追踪
            </CardTitle>
            <CardDescription>产品月度成本环比变化 | 红色=成本上升，绿色=成本下降</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300} minHeight={200}>
              <ComposedChart
                data={costVarianceData.map((d) => ({
                  name: d.name,
                  change: d.change,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: number) => [`${value > 0 ? '+' : ''}${value}%`, '环比变化']}
                />
                <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1.5} />
                <Bar dataKey="change" radius={[4, 4, 0, 0]} className="bar-grow-in">
                  {costVarianceData.map((d, i) => (
                    <Cell key={i} fill={d.change >= 0 ? '#ef4444' : '#22c55e'} style={{ '--bar-index': i } as React.CSSProperties} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
            {/* 影响标签 */}
            <div className="flex flex-wrap gap-2 mt-2">
              {costVarianceData.map((d) => (
                <div
                  key={d.sku}
                  className={`text-[10px] px-2 py-1 rounded-full border ${
                    d.change >= 0
                      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400'
                      : 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400'
                  }`}
                >
                  {d.name}: {d.change > 0 ? '+' : ''}{d.change}% ({d.change > 0 ? '+' : ''}${d.absChange.toFixed(2)})
                </div>
              ))}
            </div>
            {/* 成本变动摘要 */}
            <div className="mt-3 p-2.5 rounded-lg border bg-rose-50 dark:bg-rose-950/20">
              <p className="text-xs text-muted-foreground">
                成本上升产品: <span className="font-semibold text-red-600">{costVarianceData.filter(d => d.change > 0).length} 个</span>
                {' | '}成本下降产品: <span className="font-semibold text-green-600">{costVarianceData.filter(d => d.change < 0).length} 个</span>
                {' | '}平均变化: <span className="font-semibold">{(costVarianceData.reduce((s, d) => s + d.change, 0) / costVarianceData.length).toFixed(1)}%</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 成本结构 */}
        <Card
          className="card-dashboard chart-container"
         
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">成本结构分析</CardTitle>
            <div className="mt-2">
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择产品查看成本结构" />
                </SelectTrigger>
                <SelectContent>
                  {costs.map((c: CostRecord) => (
                    <SelectItem key={c.sku} value={c.sku}>
                      {c.productName} ({c.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {selectedProduct ? (
              <CostBreakdownChart sku={selectedProduct} costs={costs} />
            ) : (
              <div className="h-[260px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <PieChart className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">请选择产品查看成本结构</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 成本瀑布图 */}
      <CostWaterfallChart />

      {/* 成本影响热力图 */}
      <CostImpactHeatmap costs={costs} />

      {/* 利润影响模拟器 (Enhanced) */}
      <CostSimulatorEnhanced costs={costs} />

      {/* 成本优化建议 */}
      <CostOptimizationPanel />

      {/* 成本明细表 */}
      <Card
        className="card-dashboard"
       
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span>成本明细</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() =>
                exportToCSV(
                  costs.map((c: CostRecord) => ({
                    sku: c.sku,
                    productName: c.productName,
                    rawMaterial: c.rawMaterial.toFixed(2),
                    labor: c.labor.toFixed(2),
                    logistics: c.logistics.toFixed(2),
                    tariff: c.tariff.toFixed(2),
                    platformFee: c.platformFee.toFixed(2),
                    totalLanded: c.totalLanded.toFixed(2),
                    grossMargin: `${c.grossMargin}%`,
                  })),
                  '成本数据',
                  [
                    { key: 'sku', label: 'SKU' },
                    { key: 'productName', label: '产品名称' },
                    { key: 'rawMaterial', label: '原材料' },
                    { key: 'labor', label: '人工' },
                    { key: 'logistics', label: '物流' },
                    { key: 'tariff', label: '关税' },
                    { key: 'platformFee', label: '平台费' },
                    { key: 'totalLanded', label: '到岸成本' },
                    { key: 'grossMargin', label: '毛利率' },
                  ],
                )
              }
            >
              <Download className="h-3 w-3" />
              导出 CSV
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-80 overflow-y-auto overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">SKU</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">产品名称</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">原材料</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">人工</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden md:table-cell">物流</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden md:table-cell">关税</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden lg:table-cell">平台费</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">到岸成本</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">毛利率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costs.map((cost: CostRecord, idx: number) => (
                  <TableRow
                    key={cost.id}
                    className={`cursor-pointer hover:bg-orange-50/50 dark:hover:bg-orange-950/20 transition-colors duration-200 ${
                      idx % 2 === 0 ? '' : 'bg-muted/20'
                    }`}
                    onClick={() => setSelectedProduct(cost.sku)}
                  >
                    <TableCell className="font-mono text-xs">{cost.sku}</TableCell>
                    <TableCell className="font-medium">{cost.productName}</TableCell>
                    <TableCell className="text-right hidden sm:table-cell">${cost.rawMaterial.toFixed(2)}</TableCell>
                    <TableCell className="text-right hidden sm:table-cell">${cost.labor.toFixed(2)}</TableCell>
                    <TableCell className="text-right hidden md:table-cell">${cost.logistics.toFixed(2)}</TableCell>
                    <TableCell className="text-right hidden md:table-cell">${cost.tariff.toFixed(2)}</TableCell>
                    <TableCell className="text-right hidden lg:table-cell">${cost.platformFee.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-semibold">${cost.totalLanded.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <span className={`font-semibold ${cost.grossMargin < 48 ? 'text-red-600' : 'text-green-600'}`}>
                        {cost.grossMargin}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
