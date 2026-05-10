'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  LineChart, ArrowUpRight, ArrowDownRight, Minus,
  Settings2, Info, Zap,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line, Legend,
} from 'recharts';
import { useSalesForecastForSku } from '@/hooks/use-supply-chain-data';
import { useUIStore } from '@/stores/ui-store';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';
import type { SalesSummary } from '@/lib/types';

const CHART_TOOLTIP_STYLE = {
  borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  border: '1px solid #e5e7eb', fontSize: '12px',
  backgroundColor: 'var(--tooltip-bg, #fff)',
};

interface DemandForecastPanelProps {
  productSummaries: SalesSummary[];
}

export function DemandForecastPanel({ productSummaries }: DemandForecastPanelProps) {
  const salesForecastSku = useUIStore((s) => s.salesForecastSku);
  const setSalesForecastSku = useUIStore((s) => s.setSalesForecastSku);
  const salesForecast = useUIStore((s) => s.salesForecast);
  const setSalesForecast = useUIStore((s) => s.setSalesForecast);
  const [showSettings, setShowSettings] = useState(false);
  const [alpha, setAlpha] = useState(0.3);

  // Auto-select first product
  useEffect(() => {
    if (!salesForecastSku && productSummaries.length > 0) {
      setSalesForecastSku(productSummaries[0].sku);
    }
  }, [salesForecastSku, productSummaries, setSalesForecastSku]);

  // Fetch forecast data (only when SKU is available)
  const forecastQuery = useSalesForecastForSku(salesForecastSku || null, 14, alpha);

  // Sync forecast data to store
  useEffect(() => {
    if (forecastQuery.data && !forecastQuery.isFetching) {
      setSalesForecast(forecastQuery.data);
    }
  }, [forecastQuery.data, forecastQuery.isFetching, setSalesForecast]);

  const forecastData = useMemo(() => {
    if (!salesForecast || !(salesForecast as Record<string, unknown>).dates) return null;
    return salesForecast as Record<string, unknown>;
  }, [salesForecast]);

  const chartData = useMemo(() => {
    if (!forecastData) return [];
    const points: Array<Record<string, unknown>> = [];

    // Historical data
    const histDates = (forecastData.historicalDates || []) as string[];
    const histQtys = (forecastData.historicalQuantities || []) as number[];
    histDates.forEach((date, i) => {
      points.push({
        date: date.slice(5),
        historical: histQtys[i],
        forecast: null as number | null,
        upper: null as number | null,
        lower: null as number | null,
      });
    });

    // Forecast data
    const dates = (forecastData.dates || []) as string[];
    const fc = (forecastData.forecast || []) as number[];
    const ub = (forecastData.upperBound || []) as number[];
    const lb = (forecastData.lowerBound || []) as number[];

    dates.forEach((date, i) => {
      points.push({
        date: date.slice(5),
        historical: null as number | null,
        forecast: fc[i],
        upper: ub[i],
        lower: lb[i],
      });
    });

    return points;
  }, [forecastData]);

  const selectedProduct = productSummaries.find(p => p.sku === salesForecastSku);
  const trendSlope = Number(forecastData?.trendSlope || 0);
  const optimizedAlpha = Number(forecastData?.optimizedAlpha || alpha);
  const mse = Number(forecastData?.mse || 0);
  const confidence = String(forecastData?.confidence || 'low');
  const method = String(forecastData?.method || '--');

  if (forecastQuery.isLoading && !forecastData) {
    return (
      <Card className="card-dashboard border-l-[4px] border-l-violet-400"
       >
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <LineChart className="h-4 w-4 text-violet-500" />
            需求预测（简单指数平滑）
          </CardTitle>
        </CardHeader>
        <CardContent><DashboardSkeleton /></CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-dashboard border-l-[4px] border-l-violet-400"
     >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <LineChart className="h-4 w-4 text-violet-500" />
              需求预测（简单指数平滑）
            </CardTitle>
            <CardDescription>
              {selectedProduct ? `${selectedProduct.productName} · 14天需求预测` : '选择产品查看预测'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={salesForecastSku} onValueChange={(v) => setSalesForecastSku(v)}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="选择产品" />
              </SelectTrigger>
              <SelectContent>
                {productSummaries.map((p) => (
                  <SelectItem key={p.sku} value={p.sku}>
                    {p.productName} ({p.sku})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={showSettings ? 'default' : 'outline'}
              size="sm" className="h-8 gap-1 text-xs"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings2 className="h-3 w-3" />
              参数
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Settings Panel */}
        <Collapsible open={showSettings} onOpenChange={setShowSettings}>
          <CollapsibleContent>
            <div className="p-3 rounded-lg border bg-violet-50/50 dark:bg-violet-950/10 space-y-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">平滑系数 α</span>
                <span className="text-sm font-mono font-bold text-violet-600">{alpha.toFixed(2)}</span>
              </div>
              <Slider
                value={[alpha]}
                onValueChange={([v]) => setAlpha(v)}
                min={0.05}
                max={0.95}
                step={0.05}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0.05 (平稳)</span>
                <span>0.50 (响应)</span>
                <span>0.95 (紧跟)</span>
              </div>
              {forecastData && (
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Info className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    优化推荐 α = {optimizedAlpha.toFixed(2)}（MSE 最低: {mse.toFixed(1)}）
                  </span>
                  <Button variant="link" size="sm" className="h-auto p-0 text-xs text-violet-600"
                    onClick={() => setAlpha(optimizedAlpha)}>
                    应用
                  </Button>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Chart */}
        {chartData.length > 0 ? (
          <div className="w-full min-h-[200px]">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="dfHist" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="dfFore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={((v: number | null, name: string) => {
                    if (v === null) return ['-', ''];
                    const m: Record<string, string> = {
                      historical: '历史销量', forecast: '预测值',
                      upper: '置信上限', lower: '置信下限',
                    };
                    return [v.toLocaleString(), m[name] || name];
                  }) as never} />
                <Legend />
                {/* Confidence interval */}
                <Area type="monotone" dataKey="upper" stroke="none" fill="#8b5cf6" fillOpacity={0.08} name="置信上限" connectNulls={false} />
                <Area type="monotone" dataKey="lower" stroke="none" fill="var(--tooltip-bg, #fff)" fillOpacity={1} name="" connectNulls={false} />
                {/* Historical */}
                <Area type="monotone" dataKey="historical" stroke="#f97316" fill="url(#dfHist)" strokeWidth={2} name="历史销量" connectNulls={false} dot={false} />
                {/* Forecast */}
                <Line type="monotone" dataKey="forecast" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 3" name="预测值" connectNulls={false} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-1 text-xs flex-wrap">
              <div className="flex items-center gap-1.5"><div className="w-6 h-0.5 bg-orange-500 rounded" /><span className="text-muted-foreground">历史数据</span></div>
              <div className="flex items-center gap-1.5"><div className="w-6 h-0.5 bg-violet-500 rounded" style={{ borderTop: '2px dashed #8b5cf6' }} /><span className="text-muted-foreground">预测值</span></div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-2.5 bg-violet-200/50 dark:bg-violet-800/30 rounded" /><span className="text-muted-foreground">95%置信区间</span></div>
            </div>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <LineChart className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">选择产品查看需求预测曲线</p>
            </div>
          </div>
        )}

        {/* Key Metrics */}
        {forecastData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-card rounded-lg p-3 border shadow-sm">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">预测方法</p>
              <p className="text-xs font-semibold text-violet-600 mt-1">{method}</p>
            </div>
            <div className="bg-card rounded-lg p-3 border shadow-sm">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">趋势方向</p>
              <div className="flex items-center gap-1 mt-1">
                {trendSlope > 0.5 ? <ArrowUpRight className="h-4 w-4 text-green-600" />
                  : trendSlope < -0.5 ? <ArrowDownRight className="h-4 w-4 text-red-600" />
                  : <Minus className="h-4 w-4 text-muted-foreground" />}
                <span className={`text-sm font-bold ${trendSlope > 0.5 ? 'text-green-600' : trendSlope < -0.5 ? 'text-red-600' : ''}`}>
                  {trendSlope > 0 ? '+' : ''}{trendSlope.toFixed(1)} /天
                </span>
              </div>
            </div>
            <div className="bg-card rounded-lg p-3 border shadow-sm">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">置信度</p>
              <Badge className={`gap-1 text-xs font-medium ${
                confidence === 'high' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                confidence === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' :
                'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
              }`}>
                <Zap className="h-3 w-3" />
                {confidence === 'high' ? '高' : confidence === 'medium' ? '中' : '低'}
              </Badge>
            </div>
            <div className="bg-card rounded-lg p-3 border shadow-sm">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">MSE</p>
              <p className="text-sm font-bold tabular-nums">{mse.toFixed(1)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
