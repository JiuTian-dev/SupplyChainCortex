'use client';

import { useState, useMemo } from 'react';
import {
  TrendingUp, ArrowUpRight, ArrowDownRight, Target, Eye, EyeOff, Minus,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line, ComposedChart,
} from 'recharts';
import { useSalesForecast, useSales } from '@/hooks/use-supply-chain-data';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';

const CHART_TOOLTIP_STYLE = {
  borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  border: '1px solid #e5e7eb', fontSize: '12px',
  backgroundColor: 'var(--tooltip-bg, #fff)',
};

export function SalesForecastEnhanced() {
  const [showConfidence, setShowConfidence] = useState(true);
  const [showTrend, setShowTrend] = useState(true);

  const forecastQuery = useSalesForecast();
  const dailyQuery = useSales('daily');

  const forecastData = useMemo(() =>
    forecastQuery.data as Record<string, unknown> | null ?? null,
    [forecastQuery.data]
  );

  const dailyData = useMemo(() => {
    const d = dailyQuery.data as Record<string, unknown> | null;
    if (!d) return [] as Array<Record<string, unknown>>;
    return (d.daily || []) as Array<Record<string, unknown>>;
  }, [dailyQuery.data]);

  const chartData = useMemo(() => {
    if (!forecastData) return [];
    const historical = (forecastData.historicalDaily || []) as Array<Record<string, unknown>>;
    const projections = (forecastData.dailyProjections || []) as Array<Record<string, unknown>>;
    const points: Array<Record<string, unknown>> = [];

    historical.forEach((d, idx) => {
      const rev = Number(d.revenue || 0);
      points.push({
        date: String(d.date).slice(5), historical: rev, forecast: null as number | null,
        upper: null as number | null, lower: null as number | null,
        trend: null as number | null, idx, isHistorical: true,
      });
    });

    projections.forEach((d, idx) => {
      const fRev = Number(d.revenue || 0);
      // Uncertainty cone: widens over time (±5% → ±25%)
      const spread = 0.05 + (idx / Math.max(projections.length - 1, 1)) * 0.20;
      const upper = Math.round(fRev * (1 + spread));
      const lower = Math.round(fRev * (1 - spread));
      points.push({
        date: String(d.date).slice(5), historical: null as number | null,
        forecast: Math.round(fRev), upper, lower,
        trend: showTrend ? Math.round(fRev) : null, idx: historical.length + idx,
        isHistorical: false,
      });
    });
    return points;
  }, [forecastData, showTrend]);

  const summary = useMemo(() => (forecastData?.summary || {}) as Record<string, unknown>, [forecastData]);
  const projectedRevenue = Number(summary.projectedRevenue || 0);
  const growthRate = Number(summary.growthRate || 0);
  const confidenceLevel = String(summary.confidence || 'low');
  const avgDaily = projectedRevenue > 0 ? Math.round(projectedRevenue / 14) : 0;
  const trendDir = growthRate > 2 ? 'up' : growthRate < -2 ? 'down' : 'stable';

  if (forecastQuery.isLoading) {
    return (
      <Card className="card-dashboard">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-orange-500" />
            增强销售预测
          </CardTitle>
        </CardHeader>
        <CardContent><DashboardSkeleton /></CardContent>
      </Card>
    );
  }

  if (!forecastData) return null;

  return (
    <Card className="card-dashboard border-l-[4px] border-l-orange-400"
     >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              增强销售预测
            </CardTitle>
            <CardDescription>30天历史 + 14天预测 | 置信区间随时间扩展</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={showConfidence ? 'default' : 'outline'} size="sm" className="h-7 text-xs gap-1"
              onClick={() => setShowConfidence(!showConfidence)}>
              {showConfidence ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              显示置信区间
            </Button>
            <Button variant={showTrend ? 'default' : 'outline'} size="sm" className="h-7 text-xs gap-1"
              onClick={() => setShowTrend(!showTrend)}>
              {showTrend ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              显示趋势线
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Chart */}
        <div className="w-full min-h-[200px]">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="ehHist" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ehFore" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ehConf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE}
                formatter={((v: number | null | string, name: string) => {
                  const val = typeof v === 'number' ? v : null;
                  if (val === null) return ['-', ''];
                  const m: Record<string, string> = { historical: '历史收入', forecast: '预测值', upper: '置信上限', lower: '置信下限', trend: '趋势线' };
                  return [`$${val.toLocaleString()}`, m[name] || name];
                }) as any} />
              {showConfidence && (
                <Area type="monotone" dataKey="upper" stroke="none" fill="#8b5cf6" fillOpacity={0.08} name="置信上限" connectNulls={false} />
              )}
              {showConfidence && (
                <Area type="monotone" dataKey="lower" stroke="none" fill="var(--tooltip-bg, #fff)" fillOpacity={1} name="置信下限" connectNulls={false} />
              )}
              <Area type="monotone" dataKey="historical" stroke="#f97316" fill="url(#ehHist)" strokeWidth={2} name="历史收入" connectNulls={false} dot={false} />
              <Area type="monotone" dataKey="forecast" stroke="#8b5cf6" fill="url(#ehFore)" strokeWidth={2} strokeDasharray="5 3" name="预测值" connectNulls={false} dot={false} />
              {showTrend && (
                <Line type="monotone" dataKey="trend" stroke="#06b6d4" strokeWidth={1.5} strokeDasharray="2 4" dot={false} name="趋势线" connectNulls={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-1 text-xs flex-wrap">
            <div className="flex items-center gap-1.5"><div className="w-6 h-0.5 bg-orange-500 rounded" /><span className="text-muted-foreground">历史数据</span></div>
            <div className="flex items-center gap-1.5"><div className="w-6 h-0.5 bg-violet-500 rounded" style={{ borderTop: '2px dashed #8b5cf6' }} /><span className="text-muted-foreground">预测值</span></div>
            <div className="flex items-center gap-1.5"><div className="w-4 h-2.5 bg-violet-200/50 dark:bg-violet-800/30 rounded" /><span className="text-muted-foreground">置信区间</span></div>
            {showTrend && <div className="flex items-center gap-1.5"><div className="w-6 h-0.5 bg-cyan-500 rounded" style={{ borderTop: '2px dashed #06b6d4' }} /><span className="text-muted-foreground">趋势线</span></div>}
          </div>
        </div>
        {/* Key Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card rounded-lg p-3 border shadow-sm">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">预测总收入 (14天)</p>
            <p className="text-lg font-bold text-orange-600 dark:text-orange-400 tabular-nums">${Math.round(projectedRevenue).toLocaleString()}</p>
          </div>
          <div className="bg-card rounded-lg p-3 border shadow-sm">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">日均预测</p>
            <p className="text-lg font-bold tabular-nums">${avgDaily.toLocaleString()}</p>
          </div>
          <div className="bg-card rounded-lg p-3 border shadow-sm">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">趋势方向</p>
            <div className="flex items-center gap-1 mt-0.5">
              {trendDir === 'up' ? <ArrowUpRight className="h-4 w-4 text-green-600" /> : trendDir === 'down' ? <ArrowDownRight className="h-4 w-4 text-red-600" /> : <Minus className="h-4 w-4 text-muted-foreground" />}
              <span className={`text-lg font-bold ${trendDir === 'up' ? 'text-green-600' : trendDir === 'down' ? 'text-red-600' : ''}`}>
                {growthRate >= 0 ? '+' : ''}{growthRate.toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="bg-card rounded-lg p-3 border shadow-sm">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">置信度</p>
            <Badge className={`gap-1 text-xs font-medium ${
              confidenceLevel === 'high' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
              confidenceLevel === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' :
              'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
            }`}>
              <Target className="h-3 w-3" />
              {confidenceLevel === 'high' ? '高' : confidenceLevel === 'medium' ? '中' : '低'}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
