'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { TrendingUp, DollarSign, BarChart3, Table as TableIcon, ArrowRight } from 'lucide-react';
import { useCost } from '@/hooks/use-supply-chain-data';
import type { CostRecord } from '@/lib/types';
import { useExchangeRate } from '@/hooks/use-exchange-rate';

// ==================== Color config for waterfall components ====================
const WATERFALL_COLORS: Record<string, { bar: string; light: string; dark: string }> = {
  rawMaterial: { bar: '#f97316', light: 'bg-orange-100 dark:bg-orange-900/30', dark: 'text-orange-700 dark:text-orange-300' },
  labor:       { bar: '#f59e0b', light: 'bg-amber-100 dark:bg-amber-900/30',  dark: 'text-amber-700 dark:text-amber-300' },
  logistics:   { bar: '#8b5cf6', light: 'bg-violet-100 dark:bg-violet-900/30', dark: 'text-violet-700 dark:text-violet-300' },
  tariff:      { bar: '#f43f5e', light: 'bg-rose-100 dark:bg-rose-900/30',     dark: 'text-rose-700 dark:text-rose-300' },
  platformFee: { bar: '#06b6d4', light: 'bg-cyan-100 dark:bg-cyan-900/30',     dark: 'text-cyan-700 dark:text-cyan-300' },
};

const TOTAL_COLOR = '#ef4444';
const BASE_COLOR = '#94a3b8';

const COMPONENT_LABELS: Record<string, string> = {
  rawMaterial: '原材料',
  labor: '人工',
  logistics: '物流',
  tariff: '关税',
  platformFee: '平台费',
};

const COMPONENT_KEYS = ['rawMaterial', 'labor', 'logistics', 'tariff', 'platformFee'] as const;

// ==================== Custom Tooltip ====================
function WaterfallTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; value: number; display: number; pctOfTotal: number; isTotal: boolean } }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-popover text-popover-foreground border shadow-lg rounded-lg px-3 py-2 text-xs">
      <p className="font-semibold mb-1">{data.name}</p>
      <div className="space-y-0.5">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">金额:</span>
          <span className="font-medium">${data.display.toFixed(2)}</span>
        </div>
        {!data.isTotal && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">占总成本:</span>
            <span className="font-medium">{data.pctOfTotal.toFixed(1)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Summary Card ====================
function SummaryCard({ title, value, sub, colorClass }: { title: string; value: string; sub?: string; colorClass: string }) {
  return (
    <div className={`rounded-lg p-3 ${colorClass} transition-all duration-200 hover:scale-[1.02]`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{title}</p>
      <p className="text-base font-bold">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ==================== Main Component ====================
export function CostWaterfallChart() {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [activeBar, setActiveBar] = useState<string | null>(null);

  const costListQuery = useCost('list');
  const { rate: usdStatic, liveRate: usdLive } = useExchangeRate('USD');
  const usdDisplayRate = usdLive ?? usdStatic?.rate ?? 7.25;

  // Compute average costs across all products
  const avgData = useMemo(() => {
    const resp = costListQuery.data as Record<string, unknown> | undefined;
    if (!resp) return null;
    const costs = resp.costs as CostRecord[];
    if (!costs || costs.length === 0) return null;

    const n = costs.length;
    const avg: Record<string, number> = {};
    for (const key of COMPONENT_KEYS) {
      avg[key] = costs.reduce((s, c) => s + (c[key] as number), 0) / n;
    }
    avg.totalLanded = costs.reduce((s, c) => s + c.totalLanded, 0) / n;
    avg.sellingPrice = costs.reduce((s, c) => s + c.sellingPrice, 0) / n;
    avg.grossMargin = costs.reduce((s, c) => s + c.grossMargin, 0) / n;
    avg.exchangeRate = costs.reduce((s, c) => s + c.exchangeRate, 0) / n;

    return avg;
  }, [costListQuery.data]);

  // Build waterfall data for Recharts
  const waterfallData = useMemo(() => {
    if (!avgData) return [];

    const total = avgData.totalLanded;
    const items: Array<{ name: string; value: number; base: number; display: number; pctOfTotal: number; isTotal: boolean; color: string; key: string }> = [];

    // Base column
    items.push({
      name: '产品成本',
      value: 0,
      base: 0,
      display: 0,
      pctOfTotal: 0,
      isTotal: false,
      color: BASE_COLOR,
      key: 'base',
    });

    // Incremental bars
    let cumulative = 0;
    for (const key of COMPONENT_KEYS) {
      const val = avgData[key];
      items.push({
        name: COMPONENT_LABELS[key],
        value: val,
        base: cumulative,
        display: val,
        pctOfTotal: total > 0 ? (val / total) * 100 : 0,
        isTotal: false,
        color: WATERFALL_COLORS[key].bar,
        key,
      });
      cumulative += val;
    }

    // Total column
    items.push({
      name: '总成本',
      value: total,
      base: 0,
      display: total,
      pctOfTotal: 100,
      isTotal: true,
      color: TOTAL_COLOR,
      key: 'total',
    });

    return items;
  }, [avgData]);

  // Summary metrics
  const summaryMetrics = useMemo(() => {
    if (!avgData) return null;

    const total = avgData.totalLanded;
    const componentValues = COMPONENT_KEYS.map((key) => ({ key, label: COMPONENT_LABELS[key], value: avgData[key] }));
    const sorted = [...componentValues].sort((a, b) => b.value - a.value);
    const maxComponent = sorted[0];
    const top2Pct = ((sorted[0].value + sorted[1].value) / total) * 100;
    const cnyPortion = avgData.rawMaterial + avgData.labor;
    const fxImpact = usdDisplayRate ? (cnyPortion * 0.03 / usdDisplayRate) : total * 0.03;

    return { total, maxComponent, top2Pct, fxImpact };
  }, [avgData]);

  // Table data with cumulative and margin
  const tableData = useMemo(() => {
    if (!avgData) return [];
    const total = avgData.totalLanded;
    let cum = 0;
    return COMPONENT_KEYS.map((key) => {
      const val = avgData[key];
      cum += val;
      const pct = total > 0 ? (val / total) * 100 : 0;
      const marginAfter = avgData.sellingPrice - cum;
      return { key, name: COMPONENT_LABELS[key], amount: val, pct, cumulative: cum, marginAfter };
    });
  }, [avgData]);

  // Loading state
  if (costListQuery.isLoading || !avgData) {
    return (
      <Card className="card-entrance" style={{ '--delay': '200ms' } as React.CSSProperties}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">成本瀑布图</CardTitle>
          <CardDescription>成本构成瀑布分析</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[340px] shimmer-loading rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="card-entrance hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
      style={{ '--delay': '200ms' } as React.CSSProperties}
    >
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              成本瀑布图
            </CardTitle>
            <CardDescription>
              成本构成瀑布分析 | 从原材料到总成本的累积过程
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant={viewMode === 'chart' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setViewMode('chart')}
            >
              <BarChart3 className="h-3 w-3" />
              图表
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setViewMode('table')}
            >
              <TableIcon className="h-3 w-3" />
              表格
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={150}>
          {viewMode === 'chart' ? (
            <div>
              {/* Waterfall Chart */}
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={waterfallData}
                  margin={{ top: 20, right: 10, left: 0, bottom: 5 }}
                  barCategoryGap="20%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `$${v}`}
                    axisLine={false}
                    tickLine={false}
                    width={55}
                  />
                  <Tooltip content={<WaterfallTooltip />} cursor={{ fill: 'rgba(249,115,22,0.06)' }} />
                  <Bar
                    dataKey="value"
                    stackId="waterfall"
                    radius={[4, 4, 0, 0]}
                    className="waterfall-bar-enter"
                    onClick={(data) => setActiveBar(activeBar === data.key ? null : data.key)}
                  >
                    {waterfallData.map((entry, idx) => {
                      const isActive = activeBar === entry.key;
                      const opacity = activeBar && !isActive ? 0.35 : 1;
                      return (
                        <Cell
                          key={idx}
                          fill={entry.isTotal ? 'url(#totalGradient)' : entry.key === 'base' ? BASE_COLOR : entry.color}
                          opacity={opacity}
                          style={{
                            cursor: 'pointer',
                            animationDelay: `${idx * 100}ms`,
                          } as React.CSSProperties}
                        />
                      );
                    })}
                  </Bar>
                  {/* Invisible base bar to position incremental bars */}
                  <Bar dataKey="base" stackId="waterfall" fill="transparent" />
                  {/* Gradient definition for total bar */}
                  <defs>
                    <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#dc2626" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>

              {/* Connector lines between bars (rendered as absolute positioned SVG overlay) */}
              <ConnectorLines data={waterfallData} />

              {/* Value labels on top of each bar */}
              <div className="flex justify-around mt-[-8px] px-2">
                {waterfallData.map((entry, idx) => (
                  <div
                    key={idx}
                    className="text-center waterfall-bar-enter"
                    style={{ animationDelay: `${idx * 100 + 200}ms`, width: `${100 / waterfallData.length}%` }}
                  >
                    <span className={`text-[10px] font-semibold ${entry.isTotal ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                      {entry.key === 'base' ? '$0' : `$${entry.display.toFixed(1)}`}
                    </span>
                  </div>
                ))}
              </div>

              {/* Active bar detail panel */}
              {activeBar && activeBar !== 'base' && activeBar !== 'total' && (
                <div className="mt-4 p-3 rounded-lg border bg-muted/30 dark:bg-muted/10 slide-in-bottom">
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: WATERFALL_COLORS[activeBar]?.bar || BASE_COLOR }}
                    />
                    <span className="text-sm font-semibold">{COMPONENT_LABELS[activeBar]}</span>
                    <Badge variant="outline" className="text-[10px] h-5">
                      {avgData && ((avgData[activeBar] / avgData.totalLanded) * 100).toFixed(1)}% of total
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">金额</span>
                      <p className="font-semibold">${avgData?.[activeBar]?.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">占售价比</span>
                      <p className="font-semibold">{avgData && ((avgData[activeBar] / avgData.sellingPrice) * 100).toFixed(1)}%</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">汇率敏感度</span>
                      <p className="font-semibold">{(avgData?.[activeBar] ? (avgData[activeBar] * 0.03).toFixed(2) : '$0')}</p>
                    </div>
                  </div>
                </div>
              )}
              {activeBar === 'total' && (
                <div className="mt-4 p-3 rounded-lg border bg-red-50/50 dark:bg-red-950/20 slide-in-bottom">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-sm bg-red-500" />
                    <span className="text-sm font-semibold">总成本</span>
                    <Badge variant="destructive" className="text-[10px] h-5">Total</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">到岸总成本</span>
                      <p className="font-semibold text-red-600 dark:text-red-400">${avgData?.totalLanded.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">售价</span>
                      <p className="font-semibold">${avgData?.sellingPrice.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">毛利率</span>
                      <p className="font-semibold">{avgData?.grossMargin.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Table View */
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">成本组件</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">金额</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">占总成本</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">累计成本</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden md:table-cell">剩余毛利</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableData.map((row) => (
                    <TableRow key={row.key} className="table-row-interactive">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: WATERFALL_COLORS[row.key].bar }}
                          />
                          <span className="font-medium text-sm">{row.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">${row.amount.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(row.pct, 100)}%`,
                                backgroundColor: WATERFALL_COLORS[row.key].bar,
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right">{row.pct.toFixed(1)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell text-xs">${row.cumulative.toFixed(2)}</TableCell>
                      <TableCell className="text-right hidden md:table-cell">
                        <span className={`text-xs font-medium ${row.marginAfter > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          ${row.marginAfter.toFixed(2)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Total row */}
                  <TableRow className="bg-muted/30 hover:bg-muted/40">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm bg-red-500 shrink-0" />
                        <span className="font-bold text-sm">总成本</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-red-600 dark:text-red-400">
                      ${avgData?.totalLanded.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs font-semibold">100%</span>
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell text-xs font-semibold">
                      ${avgData?.totalLanded.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right hidden md:table-cell">
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        ${(avgData ? avgData.sellingPrice - avgData.totalLanded : 0).toFixed(2)}
                      </span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </TooltipProvider>

        {/* Summary Cards */}
        {summaryMetrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border">
            <UITooltip>
              <TooltipTrigger asChild>
                <div>
                  <SummaryCard
                    title="总成本"
                    value={`$${summaryMetrics.total.toFixed(2)}`}
                    sub="平均到岸成本"
                    colorClass="bg-red-50 dark:bg-red-950/20"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">所有产品的平均总到岸成本</p>
              </TooltipContent>
            </UITooltip>

            <UITooltip>
              <TooltipTrigger asChild>
                <div>
                  <SummaryCard
                    title="最大组件"
                    value={summaryMetrics.maxComponent.label}
                    sub={`$${summaryMetrics.maxComponent.value.toFixed(2)}`}
                    colorClass={WATERFALL_COLORS[summaryMetrics.maxComponent.key].light}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">成本占比最高的组件: {summaryMetrics.maxComponent.label} (${summaryMetrics.maxComponent.value.toFixed(2)})</p>
              </TooltipContent>
            </UITooltip>

            <UITooltip>
              <TooltipTrigger asChild>
                <div>
                  <SummaryCard
                    title="成本集中度"
                    value={`${summaryMetrics.top2Pct.toFixed(1)}%`}
                    sub="Top 2 组件占比"
                    colorClass="bg-amber-50 dark:bg-amber-950/20"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">前2大成本组件占总体成本的比例</p>
              </TooltipContent>
            </UITooltip>

            <UITooltip>
              <TooltipTrigger asChild>
                <div>
                  <SummaryCard
                    title="汇率影响"
                    value={`$${summaryMetrics.fxImpact.toFixed(2)}`}
                    sub="预估3%波动影响"
                    colorClass="bg-cyan-50 dark:bg-cyan-950/20"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">汇率波动3%对总成本的预估影响 (1 USD = {usdDisplayRate.toFixed(2)} CNY{usdLive ? ' · 实时' : ''})</p>
              </TooltipContent>
            </UITooltip>
          </div>
        )}

        {/* Waterfall flow indicator */}
        <div className="mt-4 flex items-center justify-center gap-1 text-[10px] text-muted-foreground overflow-x-auto">
          <span className="shrink-0">产品成本</span>
          {COMPONENT_KEYS.map((key) => (
            <span key={key} className="flex items-center gap-1 shrink-0">
              <ArrowRight className="h-3 w-3" />
              <span style={{ color: WATERFALL_COLORS[key].bar }}>{COMPONENT_LABELS[key]}</span>
            </span>
          ))}
          <span className="flex items-center gap-1 shrink-0">
            <ArrowRight className="h-3 w-3" />
            <span className="text-red-500 font-semibold">总成本</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== Connector Lines Component ====================
function ConnectorLines({ data }: { data: Array<{ base: number; value: number; key: string }> }) {
  // We draw dashed lines between consecutive incremental bars
  // Only between bars that have actual values (not base and total)
  const incrementalBars = data.filter((d) => d.key !== 'base' && d.key !== 'total');
  if (incrementalBars.length < 2) return null;

  const total = data.find((d) => d.key === 'total');
  if (!total) return null;
  const maxVal = total.value;

  // Calculate connector positions as percentage of chart height
  const connectors: { leftPct: number; rightPct: number; yPct: number }[] = [];
  for (let i = 0; i < incrementalBars.length - 1; i++) {
    const curr = incrementalBars[i];
    const nextTop = curr.base + curr.value; // top of current bar = bottom of next bar
    connectors.push({
      leftPct: ((i + 1.5) / data.length) * 100, // approximate x positions
      rightPct: ((i + 2.5) / data.length) * 100,
      yPct: (1 - nextTop / maxVal) * 100, // from top
    });
  }

  return (
    <div className="relative w-full h-0 overflow-visible">
      <svg
        className="absolute left-0 right-0 waterfall-connector"
        style={{ top: '-320px', height: '320px', pointerEvents: 'none' }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {connectors.map((c, idx) => (
          <line
            key={idx}
            x1={c.leftPct}
            y1={c.yPct}
            x2={c.rightPct}
            y2={c.yPct}
            stroke="currentColor"
            strokeWidth="0.3"
            strokeDasharray="1 0.8"
            className="text-muted-foreground/40"
          />
        ))}
      </svg>
    </div>
  );
}
