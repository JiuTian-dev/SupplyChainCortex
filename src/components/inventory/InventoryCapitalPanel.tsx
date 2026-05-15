'use client';

import { useMemo } from 'react';
import {
  DollarSign, BarChart3, PieChart as PieIcon, Layers, TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { useInventoryCapitalAnalysis } from '@/hooks/use-supply-chain-data';
import { MetricCard } from '@/components/shared/MetricCard';

const CHART_TOOLTIP_STYLE = {
  borderRadius: '10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  border: '1px solid #e5e7eb',
  fontSize: '12px',
  backgroundColor: 'var(--tooltip-bg, #fff)',
};

const ABC_COLORS: Record<string, string> = { A: '#f97316', B: '#06b6d4', C: '#8b5cf6' };
const CATEGORY_COLORS = ['#f97316', '#22c55e', '#8b5cf6', '#06b6d4', '#ef4444', '#eab308'];
const WAREHOUSE_COLORS = ['#06b6d4', '#f97316', '#22c55e', '#8b5cf6'];

interface CapitalData {
  itemCapital: Array<{
    sku: string;
    productName: string;
    category: string;
    warehouse: string;
    quantity: number;
    unitCost: number;
    capitalOccupied: number;
  }>;
  totalCapital: number;
  capitalTurnoverRate: number;
  abcAnalysis: Array<{
    sku: string;
    productName: string;
    category: string;
    warehouse: string;
    quantity: number;
    unitCost: number;
    capitalOccupied: number;
    cumulativePercent: number;
    abcClass: 'A' | 'B' | 'C';
  }>;
  abcSummary: {
    A: { count: number; capital: number };
    B: { count: number; capital: number };
    C: { count: number; capital: number };
  };
  categoryBreakdown: Array<{ category: string; capital: number; percent: number }>;
  warehouseBreakdown: Array<{ warehouse: string; capital: number; percent: number }>;
}

export function InventoryCapitalPanel() {
  const { data, isLoading } = useInventoryCapitalAnalysis();

  const capitalData = useMemo<CapitalData | null>(() => {
    if (!data) return null;
    const raw = (data as Record<string, unknown>)?.data ? (data as { data: CapitalData }).data : data as unknown as CapitalData;
    return raw;
  }, [data]);

  if (isLoading) {
    return (
      <Card className="card-dashboard border-l-[4px] border-l-amber-400">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-amber-500" />
            库存资金占用分析
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse h-64 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!capitalData) return null;

  const {
    totalCapital,
    capitalTurnoverRate,
    abcAnalysis,
    abcSummary,
    categoryBreakdown,
    warehouseBreakdown,
  } = capitalData;

  // Top 10 items by capital
  const top10Items = abcAnalysis.slice(0, 10).map(item => ({
    name: item.productName.length > 8 ? item.productName.slice(0, 8) + '...' : item.productName,
    capital: item.capitalOccupied,
    abcClass: item.abcClass,
  }));

  return (
    <Card className="card-dashboard border-l-[4px] border-l-amber-400">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-amber-500" />
          库存资金占用分析
        </CardTitle>
        <CardDescription>
          基于库存数量 × 单位成本计算资金占用 | ABC 分类基于资金占比
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <MetricCard
            title="总资金占用"
            value={`¥${(totalCapital / 1000).toFixed(0)}K`}
            icon={<DollarSign className="h-4 w-4" />}
            color="text-amber-600 dark:text-amber-400"
            bgColor="bg-amber-50 dark:bg-amber-950/20"
          />
          <MetricCard
            title="资金周转率"
            value={capitalTurnoverRate.toFixed(2)}
            icon={<TrendingUp className="h-4 w-4" />}
            color="text-emerald-600 dark:text-emerald-400"
            bgColor="bg-emerald-50 dark:bg-emerald-950/20"
          />
          <MetricCard
            title="A类商品"
            value={`${abcSummary.A.count} 项`}
            icon={<BarChart3 className="h-4 w-4" />}
            color="text-orange-600 dark:text-orange-400"
            bgColor="bg-orange-50 dark:bg-orange-950/20"
          />
          <MetricCard
            title="C类商品"
            value={`${abcSummary.C.count} 项`}
            icon={<Layers className="h-4 w-4" />}
            color="text-violet-600 dark:text-violet-400"
            bgColor="bg-violet-50 dark:bg-violet-950/20"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Top 10 Capital Occupation - Horizontal Bar Chart */}
          <Card className="border shadow-none">
            <CardHeader className="pb-1 px-3 pt-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-3.5 w-3.5 text-amber-500" />
                资金占用 Top 10
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <ResponsiveContainer width="100%" height={280} minHeight={200}>
                <BarChart data={top10Items} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `¥${(v / 1000).toFixed(0)}K`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={70} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value: number) => [`¥${value.toLocaleString()}`, '资金占用']}
                  />
                  <Bar dataKey="capital" radius={[0, 4, 4, 0]} animationDuration={800} animationEasing="ease-out">
                    {top10Items.map((item, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={ABC_COLORS[item.abcClass] || '#f97316'}
                        style={{ '--bar-index': idx } as React.CSSProperties}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Category distribution pie chart */}
          <Card className="border shadow-none">
            <CardHeader className="pb-1 px-3 pt-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <PieIcon className="h-3.5 w-3.5 text-cyan-500" />
                品类资金分布
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <ResponsiveContainer width="100%" height={280} minHeight={200}>
                <PieChart>
                  <Pie
                    data={categoryBreakdown.map(c => ({ name: c.category, value: c.capital }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }: { name: string; percent: number }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    animationBegin={200}
                  >
                    {categoryBreakdown.map((_, idx) => (
                      <Cell key={`cat-${idx}`} fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value: number) => [`¥${value.toLocaleString()}`, '资金占用']}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Warehouse distribution pie chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Card className="border shadow-none">
            <CardHeader className="pb-1 px-3 pt-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-violet-500" />
                仓库资金分布
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <ResponsiveContainer width="100%" height={250} minHeight={200}>
                <PieChart>
                  <Pie
                    data={warehouseBreakdown.map(w => ({ name: w.warehouse, value: w.capital }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }: { name: string; percent: number }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    animationBegin={200}
                  >
                    {warehouseBreakdown.map((_, idx) => (
                      <Cell key={`wh-${idx}`} fill={WAREHOUSE_COLORS[idx % WAREHOUSE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value: number) => [`¥${value.toLocaleString()}`, '资金占用']}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ABC Summary cards */}
          <Card className="border shadow-none">
            <CardHeader className="pb-1 px-3 pt-3">
              <CardTitle className="text-sm font-semibold">ABC 资金分类概览</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="space-y-4 mt-2">
                {(['A', 'B', 'C'] as const).map((cls, idx) => {
                  const info = abcSummary[cls];
                  const percent = totalCapital > 0 ? (info.capital / totalCapital) * 100 : 0;
                  const targetPercent = cls === 'A' ? 80 : cls === 'B' ? 15 : 5;
                  return (
                    <div key={cls}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: ABC_COLORS[cls] }}
                          />
                          <span className="text-sm font-medium">
                            {cls}类 ({cls === 'A' ? '核心' : cls === 'B' ? '重要' : '一般'})
                          </span>
                          <Badge variant="outline" className="text-[10px]">{info.count} 项</Badge>
                        </div>
                        <span className="text-sm font-semibold" style={{ color: ABC_COLORS[cls] }}>
                          ¥{info.capital.toLocaleString()} ({percent.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${percent}%`,
                            backgroundColor: ABC_COLORS[cls],
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        目标: 占总资金 {targetPercent}% | 实际: {percent.toFixed(1)}%
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Capital insight */}
              <div className="mt-4 p-2.5 rounded-lg border bg-amber-50 dark:bg-amber-950/20">
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-amber-500 shrink-0">●</span>
                  <span>
                    A类商品 {abcSummary.A.count} 项占总资金 {totalCapital > 0 ? ((abcSummary.A.capital / totalCapital) * 100).toFixed(1) : 0}%，
                    需重点管控库存水位和周转效率
                  </span>
                </p>
                <p className="text-xs text-muted-foreground flex items-start gap-1.5 mt-1">
                  <span className="text-cyan-500 shrink-0">●</span>
                  <span>
                    资金周转率 {capitalTurnoverRate.toFixed(2)}，
                    {capitalTurnoverRate >= 6 ? '周转良好' : capitalTurnoverRate >= 3 ? '周转正常' : '周转偏慢，需优化库存结构'}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ABC Analysis Table */}
        <div className="mt-2 max-h-96 overflow-y-auto custom-scrollbar">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">SKU</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">产品</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">资金占用</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">单价</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">数量</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground hidden md:table-cell">累计%</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">ABC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {abcAnalysis.map((item, idx) => (
                <TableRow
                  key={item.sku}
                  className={`hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-colors ${
                    idx % 2 !== 0 ? 'bg-muted/20' : ''
                  }`}
                >
                  <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                  <TableCell className="font-medium text-sm">{item.productName}</TableCell>
                  <TableCell className="text-right text-sm font-semibold">
                    ¥{item.capitalOccupied.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-xs hidden sm:table-cell">
                    ¥{item.unitCost.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-xs hidden sm:table-cell">
                    {item.quantity.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-xs hidden md:table-cell">
                    {item.cumulativePercent.toFixed(1)}%
                  </TableCell>
                  <TableCell>
                    <Badge
                      className="text-[10px]"
                      style={{
                        backgroundColor: ABC_COLORS[item.abcClass] + '20',
                        color: ABC_COLORS[item.abcClass],
                        borderColor: ABC_COLORS[item.abcClass] + '40',
                      }}
                    >
                      {item.abcClass}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
