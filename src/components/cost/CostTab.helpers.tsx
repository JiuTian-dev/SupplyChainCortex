import { PieChart as RechartsPieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Package, Ship } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { CHART_COLORS } from '@/lib/constants';
import type { CostRecord } from '@prisma/client';

// ==================== Tooltip style shared across charts ====================

export const CHART_TOOLTIP_STYLE = {
  borderRadius: '10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  border: '1px solid #e5e7eb',
  fontSize: '12px',
  backgroundColor: 'var(--tooltip-bg, #fff)',
  className: 'chart-tooltip-custom',
};

// ==================== Cost Breakdown Sub-component ====================

export function CostBreakdownChart({ sku, costs }: { sku: string; costs: CostRecord[] }) {
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
            data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={80}
            dataKey="value" nameKey="name"
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

export function pillStyle(trend: string) {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ';
  if (trend === 'rising') return base + 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400';
  if (trend === 'falling') return base + 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/20 dark:text-green-400';
  return base + 'border-border bg-muted/30 text-muted-foreground';
}

export function CommodityBanner({ data }: { data: Record<string, unknown> }) {
  const trend = (data?.overallTrend as string) || 'stable';
  const pct = data?.avgChangePct as number || 0;
  return <span className={pillStyle(trend)}><Package className="h-3 w-3" />商品 {pct > 0 ? '+' : ''}{pct}%</span>;
}

export function FreightBanner({ data }: { data: Record<string, unknown> }) {
  const trend = (data?.trend as string) || 'stable';
  return <span className={pillStyle(trend)}><Ship className="h-3 w-3" />运费 ${data?.avgRate40GP as number || 0}/40GP</span>;
}
