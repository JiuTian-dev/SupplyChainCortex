'use client';

import { useMemo, useEffect, useState } from 'react';
import { useSkuFilter } from '@/hooks/useSkuFilter';
import {
  DollarSign, TrendingUp, AlertTriangle, PieChart, Globe, Package,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell,
  ReferenceLine, AreaChart, Area,
} from 'recharts';
import {
  useCost,
} from '@/hooks/use-supply-chain-data';
import { ProductFilter } from '@/components/shared/ProductFilter';
import { FilterChips } from '@/components/shared/FilterChips';
import { useInventoryUIStore } from '@/stores/useInventoryUIStore';
import { useDashboardConfigStore } from '@/stores/dashboard-config-store';
import { useExchangeRate } from '@/hooks/use-exchange-rate';
import { CURRENCY_SYMBOLS } from '@/lib/dashboard/config';
// CHART_COLORS moved to CostTab.helpers.tsx
import { CostSimulatorEnhanced } from '@/components/cost/CostSimulatorEnhanced';
import { ExchangeRateMatrix } from '@/components/cost/ExchangeRateMatrix';
import type { CostRecord } from '@prisma/client';
// MetricCard moved elsewhere
import { ExportMenu } from '@/components/shared/ExportMenu';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';
import dynamic from 'next/dynamic';
import { LazyLoader } from '@/components/shared/LazyLoader';

const CostImpactHeatmap = dynamic(
  () => import('@/components/cost/CostImpactHeatmap').then((m) => ({ default: m.CostImpactHeatmap })),
  { loading: () => <LazyLoader type="chart" className="h-[280px]" />, ssr: false }
);
import { CostOptimizationPanel } from '@/components/cost/CostOptimizationPanel';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CHART_TOOLTIP_STYLE, CostBreakdownChart, CommodityBanner, FreightBanner } from './CostTab.helpers';

// ==================== Main CostTab Component ====================
export function CostTab() {
  // Local filter state with URL persistence
  const { selectedSkus, updateSkus, filterParams } = useSkuFilter();
  const currency = useDashboardConfigStore(s => s.config.currency);
  const sym = CURRENCY_SYMBOLS[currency] || '$';
  const [skuLabels, setSkuLabels] = useState<Record<string, string>>({});
  const costListQuery = useCost('list', filterParams);
  const costTrendQuery = useCost('trend', filterParams);

  // Exchange rate for KPI bar
  const { rate: usdRateObj, liveRate: usdLive } = useExchangeRate('USD');
  const usdDisplayRate = usdLive ?? (usdRateObj as { rate?: number })?.rate ?? 7.25;

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

  // Extract costs array before early return so all hooks can use it
  const costs: CostRecord[] = costData
    ? (costData as Record<string, unknown>).costs as CostRecord[]
    : [];

  // Cost trend deep-dive state: selected product for stacked area / waterfall
  const [selectedTrendProduct, setSelectedTrendProduct] = useState<string>('');

  // ── Feature 1: Heatmap custom threshold ──
  const [heatmapThreshold, setHeatmapThreshold] = useState(10);
  // ── Feature 2: Donut click drill-down ──
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);

  const DRIVER_KEY_MAP: Record<string, string> = {
    '原材料': 'rawMaterial',
    '人工': 'labor',
    '物流': 'logistics',
    '关税': 'tariff',
    '平台费': 'platformFee',
  };

  // Derived: top 3 products contributing to each driver
  const driverContributions = useMemo(() => {
    const risers = costVarianceData.filter(d => d.change > 0);
    const result: Record<string, Array<{ name: string; value: number }>> = {};
    for (const [chName, key] of Object.entries(DRIVER_KEY_MAP)) {
      const contrib = risers.map(d => {
        const r = costs.find((c: CostRecord) => c.sku === d.sku);
        if (!r) return null;
        const componentValue = r[key as keyof CostRecord] as number;
        return {
          name: d.name,
          value: +(d.absChange * (componentValue / r.totalLanded)).toFixed(2),
        };
      }).filter(Boolean).sort((a, b) => b!.value - a!.value).slice(0, 3);
      result[chName] = contrib as Array<{ name: string; value: number }>;
    }
    return result;
  }, [costVarianceData, costs]);

  // ── 1. Stacked Area Trend: 12-month cost breakdown for selected product ──
  const stackedAreaData = useMemo(() => {
    if (!selectedTrendProduct || costs.length === 0) return [];
    const record = costs.find((c: CostRecord) => c.sku === selectedTrendProduct);
    const trendData = costTrendQuery.data as Record<string, unknown> | undefined;
    const trends = (trendData as any)?.trends as Array<any> | undefined;
    const productTrend = trends?.find((t: any) => t.sku === selectedTrendProduct);
    if (!record || !productTrend?.monthlyData?.length) return [];

    const total = record.totalLanded;
    const ratios = {
      rawMaterial: record.rawMaterial / total,
      labor: record.labor / total,
      logistics: record.logistics / total,
      tariff: record.tariff / total,
      platformFee: record.platformFee / total,
    };

    const months = productTrend.monthlyData.slice(-12);
    const now = new Date();
    return months.map((m: any, i: number) => {
      const d = new Date(now.getFullYear(), now.getMonth() - months.length + 1 + i, 1);
      return {
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        rawMaterial: +(m.totalLanded * ratios.rawMaterial).toFixed(2),
        labor: +(m.totalLanded * ratios.labor).toFixed(2),
        logistics: +(m.totalLanded * ratios.logistics).toFixed(2),
        tariff: +(m.totalLanded * ratios.tariff).toFixed(2),
        platformFee: +(m.totalLanded * ratios.platformFee).toFixed(2),
        total: +m.totalLanded.toFixed(2),
      };
    });
  }, [selectedTrendProduct, costTrendQuery.data, costs]);

  // ── 2. Waterfall: month-over-month component deltas ──
  const waterfallData = useMemo(() => {
    if (stackedAreaData.length < 2) return [];
    const prev = stackedAreaData[stackedAreaData.length - 2];
    const curr = stackedAreaData[stackedAreaData.length - 1];

    const entries = [
      { key: 'rawMaterial' as const, name: '原材料', delta: curr.rawMaterial - prev.rawMaterial },
      { key: 'labor' as const, name: '人工', delta: curr.labor - prev.labor },
      { key: 'logistics' as const, name: '物流', delta: curr.logistics - prev.logistics },
      { key: 'tariff' as const, name: '关税', delta: curr.tariff - prev.tariff },
      { key: 'platformFee' as const, name: '平台费', delta: curr.platformFee - prev.platformFee },
    ];

    let runningTotal = prev.total;
    const items: Array<{ name: string; base: number; value: number; fill: string }> = [
      { name: '上月成本', base: 0, value: prev.total, fill: '#6b7280' },
    ];

    for (const e of entries) {
      if (e.delta >= 0) {
        items.push({ name: e.name, base: runningTotal, value: e.delta, fill: '#ef4444' });
      } else {
        items.push({ name: e.name, base: runningTotal + e.delta, value: Math.abs(e.delta), fill: '#22c55e' });
      }
      runningTotal += e.delta;
    }

    items.push({ name: '本月成本', base: 0, value: curr.total, fill: '#6b7280' });
    return items;
  }, [stackedAreaData]);

  // ── 3. Driver Donut: cost increase decomposition ──
  const driverDonutData = useMemo(() => {
    const risers = costVarianceData.filter(d => d.change > 0);
    if (risers.length === 0) {
      return { totalIncrease: 0, segments: [] as Array<{ name: string; value: number; color: string }> };
    }

    const drivers = { rawMaterial: 0, labor: 0, logistics: 0, tariff: 0, platformFee: 0 };
    let totalIncrease = 0;

    for (const d of risers) {
      const r = costs.find((c: CostRecord) => c.sku === d.sku);
      if (!r) continue;
      const div = r.totalLanded;
      drivers.rawMaterial += d.absChange * (r.rawMaterial / div);
      drivers.labor += d.absChange * (r.labor / div);
      drivers.logistics += d.absChange * (r.logistics / div);
      drivers.tariff += d.absChange * (r.tariff / div);
      drivers.platformFee += d.absChange * (r.platformFee / div);
      totalIncrease += d.absChange;
    }

    return {
      totalIncrease: +totalIncrease.toFixed(2),
      segments: [
        { name: '原材料', value: +drivers.rawMaterial.toFixed(2), color: '#f97316' },
        { name: '人工', value: +drivers.labor.toFixed(2), color: '#f59e0b' },
        { name: '物流', value: +drivers.logistics.toFixed(2), color: '#8b5cf6' },
        { name: '关税', value: +drivers.tariff.toFixed(2), color: '#e11d48' },
        { name: '平台费', value: +drivers.platformFee.toFixed(2), color: '#059669' },
      ].filter(s => s.value > 0),
    };
  }, [costVarianceData, costs]);

  // ── 4. Heatmap: top 10 products x last 6 months ──
  const heatmapData = useMemo(() => {
    const sorted = [...costVarianceData].sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    const top10 = sorted.slice(0, 10);
    const trendData = costTrendQuery.data as Record<string, unknown> | undefined;
    const trends = (trendData as any)?.trends as Array<any> | undefined;
    if (!trends) return [];

    const now = new Date();
    const labels = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    return top10.map(d => {
      const pt = trends.find((t: any) => t.sku === d.sku);
      const md = pt?.monthlyData || [];
      const last6 = md.slice(-6);
      return {
        name: d.name,
        sku: d.sku,
        months: last6.map((m: any, i: number) => ({
          label: labels[i] || `M-${i + 1}`,
          totalLanded: m.totalLanded,
        })),
      };
    });
  }, [costVarianceData, costTrendQuery.data]);

  // ── 5. Top Movers ──
  const topRisers = useMemo(
    () => [...costVarianceData].filter(d => d.change > 0).sort((a, b) => b.change - a.change).slice(0, 5),
    [costVarianceData]
  );
  const topDecliners = useMemo(
    () => [...costVarianceData].filter(d => d.change < 0).sort((a, b) => a.change - b.change).slice(0, 5),
    [costVarianceData]
  );

  // Loading state
  if (costListQuery.isLoading || !costData) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-30 flex items-center gap-2 flex-wrap py-2 bg-background/95 backdrop-blur border-b -mx-2 px-2">
        <ProductFilter selected={selectedSkus} onChange={updateSkus} onLabelsLoad={setSkuLabels} />
        <FilterChips selected={selectedSkus} labels={skuLabels} onRemove={(sku) => updateSkus(selectedSkus.filter(s => s !== sku))} onClearAll={() => updateSkus([])} />
      </div>
      {/* 成本趋势横幅 — 大宗商品 · 运费 */}
      {costTrend && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 py-1">
            <Package className="h-3 w-3" /> 大宗商品 & 运费参考数据 ▸
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-wrap gap-2 text-[11px] mt-1">
              <CommodityBanner data={costTrend.commodity as Record<string, unknown>} />
              <FreightBanner data={costTrend.freight as Record<string, unknown>} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* KPI 摘要条 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-4 flex-1 min-w-0 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
            <DollarSign className="h-4 w-4 text-orange-500" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">平均到岸成本</p>
              <p className="text-lg font-bold tabular-nums">{sym}{(costs.reduce((s: number, c: CostRecord) => s + c.totalLanded, 0) / costs.length).toFixed(2)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">平均毛利率</p>
              <p className="text-lg font-bold tabular-nums">{(costs.reduce((s: number, c: CostRecord) => s + c.grossMargin, 0) / costs.length).toFixed(1)}%</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">成本预警</p>
              <p className="text-lg font-bold tabular-nums">{costs.filter((c: CostRecord) => c.grossMargin < 48).length}<span className="text-xs text-muted-foreground font-normal">/{costs.length}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
            <Globe className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">实时汇率</p>
              <p className="text-sm font-bold tabular-nums">1 USD = {usdDisplayRate.toFixed(2)} CNY</p>
            </div>
          </div>
        </div>
        <ExportMenu
          data={costs.map((c: CostRecord) => ({
            产品: c.productName, SKU: c.sku,
            原材料: `${sym}${c.rawMaterial.toFixed(2)}`,
            人工: `${sym}${c.labor.toFixed(2)}`,
            物流: `${sym}${c.logistics.toFixed(2)}`,
            关税: `${sym}${c.tariff.toFixed(2)}`,
            平台费: `${sym}${c.platformFee.toFixed(2)}`,
            到岸成本: `${sym}${c.totalLanded.toFixed(2)}`,
            毛利率: `${c.grossMargin.toFixed(1)}%`,
          }))}
          columns={[
            {key:'产品',label:'产品'},{key:'SKU',label:'SKU'},
            {key:'原材料',label:'原材料'},{key:'人工',label:'人工'},
            {key:'物流',label:'物流'},{key:'关税',label:'关税'},
            {key:'平台费',label:'平台费'},{key:'到岸成本',label:'到岸成本'},
            {key:'毛利率',label:'毛利率'},
          ]}
          filename="成本分析报告"
          variant="outline"
          size="sm"
          label="导出报告"
        />
      </div>

      {/* ═══ 快跳导航 ═══ */}
      <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-muted/30 text-xs">
        <span className="text-muted-foreground mr-1">跳转:</span>
        <a href="#cost-tracking" className="px-2 py-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/30 transition-colors text-rose-700 dark:text-rose-400 font-medium">成本追踪</a>
        <a href="#cost-simulator" className="px-2 py-1 rounded hover:bg-cyan-100 dark:hover:bg-cyan-950/30 transition-colors text-cyan-700 dark:text-cyan-400 font-medium">利润模拟</a>
        <a href="#cost-table" className="px-2 py-1 rounded hover:bg-muted transition-colors">成本明细</a>
      </div>

      {/* 主要结算货币对 CNY 实时汇率矩阵 */}
      <ExchangeRateMatrix />

      {/* 交叉影响矩阵 — 外部因素对产品毛利率的敏感度 */}
      <Collapsible defaultOpen={false}>
        <Card className="card-dashboard">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              <CollapsibleTrigger className="flex items-center gap-2 hover:text-foreground/80 transition-colors">
                外部因素敏感度矩阵 <span className="text-xs text-muted-foreground font-normal">▸ 点击展开</span>
              </CollapsibleTrigger>
            </CardTitle>
          </CardHeader>
          <CollapsibleContent>
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
        </CollapsibleContent>
      </Card>
      </Collapsible>

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
          id="cost-tracking"
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
            {/* ── 柱状图: 各产品环比变化 ── */}
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

            <Separator className="my-4" />

            {/* ── 1. 成本构成趋势 (12个月) ── */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold">成本构成趋势 (12个月)</h4>
                <Select value={selectedTrendProduct} onValueChange={setSelectedTrendProduct}>
                  <SelectTrigger className="w-[200px] h-8 text-xs">
                    <SelectValue placeholder="选择产品分析趋势" />
                  </SelectTrigger>
                  <SelectContent>
                    {costs.map((c: CostRecord) => (
                      <SelectItem key={c.sku} value={c.sku}>
                        {c.productName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedTrendProduct && stackedAreaData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={stackedAreaData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                    <Area type="monotone" dataKey="rawMaterial" name="原材料" stackId="1" stroke="#f97316" fill="#f97316" fillOpacity={0.85} />
                    <Area type="monotone" dataKey="labor" name="人工" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.85} />
                    <Area type="monotone" dataKey="logistics" name="物流" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.85} />
                    <Area type="monotone" dataKey="tariff" name="关税" stackId="1" stroke="#e11d48" fill="#e11d48" fillOpacity={0.85} />
                    <Area type="monotone" dataKey="platformFee" name="平台费" stackId="1" stroke="#059669" fill="#059669" fillOpacity={0.85} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                  {selectedTrendProduct ? '暂无趋势数据' : '请在上方选择产品'}
                </div>
              )}
            </div>

            {/* ── 2. 成本差异分解 (Waterfall) ── */}
            {waterfallData.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold mb-3">成本差异分解</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={waterfallData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(_: number, __: string, props: any) => [`$${props.payload.value.toFixed(2)}`, props.payload.name]}
                    />
                    <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
                    <Bar dataKey="value" stackId="wf" isAnimationActive={false} radius={[2, 2, 0, 0]}>
                      {waterfallData.map((d, i) => (
                        <Cell key={i} fill={d.fill} />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── 3. 涨价驱动因素 (Donut) ── */}
            {driverDonutData.segments.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold mb-3">涨价驱动因素</h4>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="relative shrink-0">
                    <ResponsiveContainer width={220} height={220}>
                      <RechartsPieChart>
                        <Pie
                          data={driverDonutData.segments}
                          cx="50%" cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          dataKey="value"
                          nameKey="name"
                          onClick={(entry) => {
                            if (entry?.name) {
                              setSelectedDriver(prev => prev === entry.name ? null : entry.name);
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          {driverDonutData.segments.map((s, i) => (
                            <Cell key={i} fill={s.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center" onClick={() => setSelectedDriver(null)} style={{ cursor: selectedDriver ? 'pointer' : 'default' }}>
                      <div className="text-center leading-tight">
                        <div className="text-[10px] text-muted-foreground">总涨价</div>
                        <div className="text-sm font-bold">${driverDonutData.totalIncrease.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-[120px]">
                    {driverDonutData.segments.map((s) => {
                      const pct = ((s.value / driverDonutData.totalIncrease) * 100).toFixed(1);
                      return (
                        <div key={s.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                            <span>{s.name}</span>
                          </div>
                          <span className="font-medium">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* ── Donut drill-down: top products for selected driver ── */}
                {selectedDriver && driverContributions[selectedDriver]?.length > 0 && (
                  <div className="mt-3 p-3 rounded-lg bg-muted/30 border">
                    <p className="text-xs font-semibold mb-1.5">{selectedDriver}上涨贡献 Top 3:</p>
                    <div className="space-y-1">
                      {driverContributions[selectedDriver].map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="font-medium">{i + 1}. {item.name}</span>
                          <span className="text-red-600 font-semibold">+{sym}{item.value.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── 4. 成本变动热力图 ── */}
            {heatmapData.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold mb-3">成本变动热力图</h4>
                <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">异常阈值: &plusmn;{heatmapThreshold}%</span>
                <Slider
                  value={[heatmapThreshold]}
                  onValueChange={([val]) => setHeatmapThreshold(val)}
                  min={5}
                  max={30}
                  step={1}
                  className="w-[160px]"
                />
                <span className="text-[10px] text-muted-foreground">5%</span>
                <span className="text-[10px] text-muted-foreground ml-auto">30%</span>
              </div>
              <div className="overflow-x-auto">
                  <div className="min-w-[520px]">
                    {/* Header */}
                    <div className="grid grid-cols-[130px_repeat(6,1fr)] gap-1 mb-1">
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">产品</div>
                      {heatmapData[0]?.months.map((m: { label: string }, i: number) => (
                        <div key={i} className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">{m.label}</div>
                      ))}
                    </div>
                    {/* Rows */}
                    {heatmapData.map((row) => (
                      <div key={row.sku} className="grid grid-cols-[130px_repeat(6,1fr)] gap-1 mb-1">
                        <div className="px-2 py-2 text-xs font-medium truncate flex items-center" title={row.name}>
                          <span className="truncate">{row.name}</span>
                        </div>
                        {row.months.map((m: { totalLanded: number; label: string }, mi: number) => {
                          const prevTotal = mi > 0 ? row.months[mi - 1].totalLanded : m.totalLanded;
                          const pctChange = prevTotal > 0 ? ((m.totalLanded - prevTotal) / prevTotal) * 100 : 0;
                          const absChange = m.totalLanded - prevTotal;

                          let bgColor = '#f9fafb';
                          let textColor = '#6b7280';
                          if (pctChange > heatmapThreshold) {
                            const intensity = Math.min(Math.abs(pctChange) / 10, 0.85);
                            bgColor = `rgba(239, 68, 68, ${intensity})`;
                            textColor = intensity > 0.45 ? '#fff' : '#7f1d1d';
                          } else if (pctChange < -heatmapThreshold) {
                            const intensity = Math.min(Math.abs(pctChange) / 10, 0.85);
                            bgColor = `rgba(34, 197, 94, ${intensity})`;
                            textColor = intensity > 0.45 ? '#fff' : '#14532d';
                          }

                          const tooltip = [
                            row.name,
                            m.label,
                            `环比: ${pctChange > 0 ? '+' : ''}${pctChange.toFixed(1)}%`,
                            `绝对值: ${absChange > 0 ? '+' : ''}$${absChange.toFixed(2)}`,
                          ].join('\n');

                          return (
                            <div
                              key={mi}
                              className="px-2 py-2 rounded text-xs font-medium text-center cursor-default"
                              style={{ backgroundColor: bgColor, color: textColor }}
                              title={tooltip}
                            >
                              {mi === 0 ? '—' : `${pctChange > 0 ? '+' : ''}${pctChange.toFixed(1)}%`}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── 5. Top Movers 排行榜 ── */}
            <div className="mb-4">
              <h4 className="text-sm font-semibold mb-3">涨跌排行</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 涨价 Top 5 */}
                <div>
                  <h5 className="text-xs font-semibold text-red-600 mb-2">涨价 Top 5</h5>
                  <div className="space-y-2">
                    {topRisers.length === 0 && (
                      <p className="text-xs text-muted-foreground">暂无数据</p>
                    )}
                    {topRisers.map((d, i) => {
                      const maxChange = topRisers.length > 0 ? Math.max(...topRisers.map(r => r.change)) : 1;
                      const barWidth = (d.change / maxChange) * 100;
                      return (
                        <div key={d.sku}>
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span className="truncate mr-2">{i + 1}. {d.name}</span>
                            <span className="font-semibold text-red-600 shrink-0">+{d.change}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-red-100 dark:bg-red-950/30">
                              <div className="h-full rounded-full bg-red-500" style={{ width: `${barWidth}%` }} />
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0 w-14 text-right">
                              +${d.absChange.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* 降价 Top 5 */}
                <div>
                  <h5 className="text-xs font-semibold text-green-600 mb-2">降价 Top 5</h5>
                  <div className="space-y-2">
                    {topDecliners.length === 0 && (
                      <p className="text-xs text-muted-foreground">暂无数据</p>
                    )}
                    {topDecliners.map((d, i) => {
                      const maxAbs = topDecliners.length > 0 ? Math.max(...topDecliners.map(r => Math.abs(r.change))) : 1;
                      const barWidth = (Math.abs(d.change) / maxAbs) * 100;
                      return (
                        <div key={d.sku}>
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span className="truncate mr-2">{i + 1}. {d.name}</span>
                            <span className="font-semibold text-green-600 shrink-0">{d.change}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-green-100 dark:bg-green-950/30">
                              <div className="h-full rounded-full bg-green-500" style={{ width: `${barWidth}%` }} />
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0 w-14 text-right">
                              ${d.absChange.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 快速统计摘要 */}
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

      {/* 成本影响热力图 */}
      <CostImpactHeatmap costs={costs} />

      {/* 利润影响模拟器 (Enhanced) */}
      <div id="cost-simulator">
        <CostSimulatorEnhanced costs={costs} />
      </div>

      {/* 成本优化建议 */}
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2 py-2 px-1">
          💡 成本优化建议 <span className="text-xs font-normal">▸ 点击展开</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CostOptimizationPanel />
        </CollapsibleContent>
      </Collapsible>

      {/* 成本明细表 */}
      <Card
        id="cost-table"
        className="card-dashboard"
       
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span>成本明细</span>
            <ExportMenu
              data={costs.map((c: CostRecord) => ({
                sku: c.sku,
                productName: c.productName,
                rawMaterial: Number(c.rawMaterial.toFixed(2)),
                labor: Number(c.labor.toFixed(2)),
                logistics: Number(c.logistics.toFixed(2)),
                tariff: Number(c.tariff.toFixed(2)),
                platformFee: Number(c.platformFee.toFixed(2)),
                totalLanded: Number(c.totalLanded.toFixed(2)),
                grossMargin: `${c.grossMargin}%`,
              }))}
              columns={[
                { key: 'sku', label: 'SKU' },
                { key: 'productName', label: '产品名称' },
                { key: 'rawMaterial', label: '原材料' },
                { key: 'labor', label: '人工' },
                { key: 'logistics', label: '物流' },
                { key: 'tariff', label: '关税' },
                { key: 'platformFee', label: '平台费' },
                { key: 'totalLanded', label: '到岸成本' },
                { key: 'grossMargin', label: '毛利率' },
              ]}
              filename="成本数据"
              variant="outline"
              size="sm"
              label=""
            />
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
