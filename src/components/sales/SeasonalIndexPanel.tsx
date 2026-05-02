'use client';

import { useMemo } from 'react';
import { Thermometer, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ComposedChart, Bar, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { useSalesSeasonalIndex } from '@/hooks/use-supply-chain-data';

const CHART_TOOLTIP_STYLE = {
  borderRadius: '10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  border: '1px solid #e5e7eb',
  fontSize: '12px',
  backgroundColor: 'var(--tooltip-bg, #fff)',
};

const CLASSIFICATION_COLORS: Record<string, string> = {
  '旺季': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  '淡季': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  '平季': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export function SeasonalIndexPanel() {
  const { data, isLoading } = useSalesSeasonalIndex();

  const seasonalData = useMemo(() => {
    if (!data) return null;
    return (data as Record<string, unknown>)?.indices
      ? data as {
          indices: Array<{
            month: number;
            monthName: string;
            index: number;
            averageRevenue: number;
            classification: '旺季' | '淡季' | '平季';
            suggestedAction: string;
          }>;
          rawMonthly: Array<{ month: number; monthName: string; revenue: number; recordCount: number }>;
          trend: Array<{ yearMonth: string; revenue: number }>;
          summary: {
            peakMonth: { month: number; monthName: string; index: number } | null;
            troughMonth: { month: number; monthName: string; index: number } | null;
            seasonalityStrength: number;
            dataPoints: number;
            overallAverageRevenue: number;
            message?: string;
          };
        }
      : null;
  }, [data]);

  if (isLoading) {
    return (
      <Card className="card-entrance border-l-[4px] border-l-cyan-400">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Thermometer className="h-4 w-4 text-cyan-500" />
            销售季节性指数
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse h-64 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!seasonalData || seasonalData.indices.length === 0) {
    return (
      <Card className="card-entrance border-l-[4px] border-l-cyan-400">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Thermometer className="h-4 w-4 text-cyan-500" />
            销售季节性指数
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {seasonalData?.summary?.message || '暂无足够数据计算季节性指数'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const { indices, summary } = seasonalData;
  const strengthLabel = summary.seasonalityStrength > 30 ? '强' : summary.seasonalityStrength > 15 ? '中' : '弱';
  const strengthColor = summary.seasonalityStrength > 30 ? 'text-red-600' : summary.seasonalityStrength > 15 ? 'text-amber-600' : 'text-green-600';

  return (
    <Card className="card-entrance border-l-[4px] border-l-cyan-400 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Thermometer className="h-4 w-4 text-cyan-500" />
          销售季节性指数
        </CardTitle>
        <CardDescription>
          基于移动平均比率法计算各月季节性强度 | 指数 {'>'} 1.0 为旺季，{'<'} 1.0 为淡季
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg border p-2.5 text-center bg-cyan-50 dark:bg-cyan-950/20">
            <p className="text-[10px] text-muted-foreground">旺季峰值</p>
            <p className="text-sm font-bold text-cyan-700 dark:text-cyan-400">
              {summary.peakMonth?.monthName || '-'}
            </p>
            <p className="text-xs text-muted-foreground">
              指数 {summary.peakMonth?.index.toFixed(3) || '-'}
            </p>
          </div>
          <div className="rounded-lg border p-2.5 text-center bg-orange-50 dark:bg-orange-950/20">
            <p className="text-[10px] text-muted-foreground">淡季谷值</p>
            <p className="text-sm font-bold text-orange-700 dark:text-orange-400">
              {summary.troughMonth?.monthName || '-'}
            </p>
            <p className="text-xs text-muted-foreground">
              指数 {summary.troughMonth?.index.toFixed(3) || '-'}
            </p>
          </div>
          <div className="rounded-lg border p-2.5 text-center bg-violet-50 dark:bg-violet-950/20">
            <p className="text-[10px] text-muted-foreground">季节性强度</p>
            <p className={`text-sm font-bold ${strengthColor}`}>
              {summary.seasonalityStrength}%
            </p>
            <p className="text-xs text-muted-foreground">{strengthLabel}季节性</p>
          </div>
          <div className="rounded-lg border p-2.5 text-center bg-gray-50 dark:bg-gray-900/20">
            <p className="text-[10px] text-muted-foreground">数据量</p>
            <p className="text-sm font-bold">{summary.dataPoints}</p>
            <p className="text-xs text-muted-foreground">条记录</p>
          </div>
        </div>

        {/* ComposedChart - Bar chart with reference line */}
        <ResponsiveContainer width="100%" height={260} minHeight={200}>
          <ComposedChart data={indices} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
            <XAxis
              dataKey="monthName"
              tick={{ fontSize: 10 }}
              interval={0}
              angle={-30}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              domain={[0, 'auto']}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(value: number, name: string) => {
                if (name === 'index') return [value.toFixed(3), '季节指数'];
                return [value, name];
              }}
              labelFormatter={(label: string) => `${label}`}
            />
            <ReferenceLine
              y={1.0}
              stroke="#94a3b8"
              strokeDasharray="6 3"
              strokeWidth={1.5}
              label={{ value: '平均线 (1.0)', position: 'insideTopRight', fill: '#94a3b8', fontSize: 10 }}
            />
            <Bar dataKey="index" radius={[4, 4, 0, 0]} animationDuration={800} animationEasing="ease-out">
              {indices.map((item, idx) => (
                <Cell
                  key={`cell-${idx}`}
                  fill={item.index >= 1.0 ? '#06b6d4' : '#f97316'}
                  fillOpacity={item.index >= 1.0 ? 0.85 : 0.75}
                  style={{ '--bar-index': idx } as React.CSSProperties}
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-2">
          <div className="flex items-center gap-1.5 text-xs">
            <div className="w-3 h-3 rounded-sm bg-cyan-500" />
            <span className="text-muted-foreground">旺季 (指数 ≥ 1.0)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <div className="w-3 h-3 rounded-sm bg-orange-500" />
            <span className="text-muted-foreground">淡季 (指数 &lt; 1.0)</span>
          </div>
        </div>

        {/* Classification Table */}
        <div className="mt-4 max-h-72 overflow-y-auto custom-scrollbar">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">月份</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">季节指数</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">月均收入</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">分类</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground hidden md:table-cell">建议操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {indices.map((item, idx) => (
                <TableRow
                  key={item.month}
                  className={`hover:bg-cyan-50/50 dark:hover:bg-cyan-950/20 transition-colors ${
                    idx % 2 !== 0 ? 'bg-muted/20' : ''
                  }`}
                >
                  <TableCell className="font-medium text-sm">{item.monthName}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    <span className={item.index >= 1.0 ? 'text-cyan-600 font-semibold' : 'text-orange-600 font-semibold'}>
                      {item.index.toFixed(3)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm hidden sm:table-cell">
                    ${item.averageRevenue.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] ${CLASSIFICATION_COLORS[item.classification] || ''}`}>
                      {item.classification}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                    {item.suggestedAction}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Seasonality insight */}
        <div className="mt-4 p-3 rounded-lg border bg-cyan-50 dark:bg-cyan-950/20">
          <h4 className="text-sm font-semibold flex items-center gap-2 text-cyan-700 dark:text-cyan-400">
            <Activity className="h-3.5 w-3.5" />
            季节性洞察
          </h4>
          <div className="mt-2 space-y-1.5">
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <TrendingUp className="h-3 w-3 text-cyan-500 shrink-0 mt-0.5" />
              <span>
                {summary.peakMonth?.monthName || '-'}为销售旺季（指数 {summary.peakMonth?.index.toFixed(3) || '-'}），
                建议提前 1-2 个月增加库存备货
              </span>
            </p>
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <TrendingDown className="h-3 w-3 text-orange-500 shrink-0 mt-0.5" />
              <span>
                {summary.troughMonth?.monthName || '-'}为销售淡季（指数 {summary.troughMonth?.index.toFixed(3) || '-'}），
                建议控制库存水位，优化运营成本
              </span>
            </p>
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="text-violet-500 shrink-0">●</span>
              <span>
                季节性强度 {summary.seasonalityStrength}%（{strengthLabel}），
                {strengthLabel === '强' ? '需重点关注季节性库存规划' : strengthLabel === '中' ? '适度考虑季节因素调整' : '销售较平稳，季节影响有限'}
              </span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
