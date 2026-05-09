'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Flame, Percent, DollarSign } from 'lucide-react';
import type { CostRecord } from '@/lib/types';

// ==================== Cost categories config ====================
const COST_CATEGORIES = [
  { key: 'rawMaterial' as const, label: '原材料' },
  { key: 'labor' as const, label: '人工' },
  { key: 'logistics' as const, label: '物流' },
  { key: 'tariff' as const, label: '关税' },
  { key: 'platformFee' as const, label: '平台费' },
];

// ==================== Color band thresholds ====================
function getCellColorClass(ratio: number): { bg: string; text: string } {
  if (ratio >= 0.9) return { bg: 'bg-red-400 dark:bg-red-600', text: 'text-white' };
  if (ratio >= 0.75) return { bg: 'bg-red-200 dark:bg-red-800/40', text: 'text-red-900 dark:text-red-100' };
  if (ratio >= 0.5) return { bg: 'bg-orange-200 dark:bg-orange-800/40', text: 'text-orange-900 dark:text-orange-100' };
  if (ratio >= 0.25) return { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-900 dark:text-yellow-100' };
  return { bg: 'bg-green-100 dark:bg-green-900/20', text: 'text-green-900 dark:text-green-100' };
}

function getLegendColorClass(ratio: number): string {
  if (ratio >= 0.9) return 'bg-red-400 dark:bg-red-600';
  if (ratio >= 0.75) return 'bg-red-200 dark:bg-red-800/40';
  if (ratio >= 0.5) return 'bg-orange-200 dark:bg-orange-800/40';
  if (ratio >= 0.25) return 'bg-yellow-100 dark:bg-yellow-900/30';
  return 'bg-green-100 dark:bg-green-900/20';
}

// ==================== Props ====================
interface CostImpactHeatmapProps {
  costs: CostRecord[];
}

// ==================== Component ====================
export function CostImpactHeatmap({ costs }: CostImpactHeatmapProps) {
  const [viewMode, setViewMode] = useState<'absolute' | 'percentage'>('absolute');

  // Compute max per category for color scaling
  const categoryMaxes = useMemo(() => {
    const maxes: Record<string, number> = {};
    for (const cat of COST_CATEGORIES) {
      const vals = costs.map((c) => c[cat.key]);
      maxes[cat.key] = Math.max(...vals, 0.01); // avoid div by zero
    }
    return maxes;
  }, [costs]);

  // Compute average per category for summary row
  const categoryAverages = useMemo(() => {
    const avgs: Record<string, number> = {};
    for (const cat of COST_CATEGORIES) {
      const vals = costs.map((c) => c[cat.key]);
      avgs[cat.key] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
    return avgs;
  }, [costs]);

  // Format value based on view mode
  const formatValue = (amount: number, totalLanded: number): string => {
    if (viewMode === 'percentage') {
      return totalLanded > 0 ? `${((amount / totalLanded) * 100).toFixed(1)}%` : '0%';
    }
    return `$${amount.toFixed(2)}`;
  };

  // Get ratio for cell coloring
  const getRatio = (amount: number, categoryKey: string): number => {
    return amount / categoryMaxes[categoryKey];
  };

  // Average ratio for summary row
  const getAvgRatio = (categoryKey: string): number => {
    return categoryAverages[categoryKey] / categoryMaxes[categoryKey];
  };

  return (
    <Card
      className="card-dashboard"
      style={{ '--delay': '150ms' } as React.CSSProperties}
    >
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              成本影响热力图
            </CardTitle>
            <CardDescription>
              产品 × 成本类别的费用热力分布 | 颜色越深代表成本越高
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant={viewMode === 'absolute' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setViewMode('absolute')}
            >
              <DollarSign className="h-3 w-3" />
              绝对值
            </Button>
            <Button
              variant={viewMode === 'percentage' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setViewMode('percentage')}
            >
              <Percent className="h-3 w-3" />
              占比
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={150}>
          <div className="max-h-96 overflow-auto custom-scrollbar">
            {/* Heatmap Grid */}
            <div className="min-w-[640px]">
              {/* Header row */}
              <div className="grid grid-cols-[minmax(140px,1fr)_repeat(5,minmax(80px,1fr))] gap-1 mb-1">
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  产品
                </div>
                {COST_CATEGORIES.map((cat) => (
                  <div
                    key={cat.key}
                    className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center"
                  >
                    {cat.label}
                  </div>
                ))}
              </div>

              {/* Data rows */}
              {costs.map((cost) => (
                <div
                  key={cost.id}
                  className="grid grid-cols-[minmax(140px,1fr)_repeat(5,minmax(80px,1fr))] gap-1 mb-1"
                >
                  {/* Product name cell */}
                  <div className="px-2 py-2 text-sm font-medium truncate flex items-center" title={cost.productName}>
                    <span className="truncate">{cost.productName}</span>
                    {cost.grossMargin < 48 && (
                      <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0 h-4 shrink-0">
                        低利
                      </Badge>
                    )}
                  </div>

                  {/* Cost cells */}
                  {COST_CATEGORIES.map((cat) => {
                    const amount = cost[cat.key];
                    const ratio = getRatio(amount, cat.key);
                    const { bg, text } = getCellColorClass(ratio);
                    const pctOfTotal = cost.totalLanded > 0
                      ? ((amount / cost.totalLanded) * 100).toFixed(1)
                      : '0';

                    return (
                      <UITooltip key={cat.key}>
                        <TooltipTrigger asChild>
                          <div
                            className={`${bg} ${text} px-2 py-2 rounded-md text-xs font-medium text-center
                              hover:scale-110 hover:z-10 transition-transform duration-200 cursor-pointer
                              select-none min-h-[36px] flex items-center justify-center`}
                          >
                            {formatValue(amount, cost.totalLanded)}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="bg-popover text-popover-foreground border shadow-lg"
                        >
                          <div className="space-y-1 text-xs">
                            <p className="font-semibold">{cost.productName}</p>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-muted-foreground">{cat.label}:</span>
                              <span className="font-medium">${amount.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-muted-foreground">占到岸成本:</span>
                              <span className="font-medium">{pctOfTotal}%</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-muted-foreground">到岸总成本:</span>
                              <span className="font-medium">${cost.totalLanded.toFixed(2)}</span>
                            </div>
                          </div>
                        </TooltipContent>
                      </UITooltip>
                    );
                  })}
                </div>
              ))}

              {/* Summary row - averages */}
              <div className="grid grid-cols-[minmax(140px,1fr)_repeat(5,minmax(80px,1fr))] gap-1 mt-2 pt-2 border-t border-border">
                <div className="px-2 py-2 text-xs font-semibold text-muted-foreground flex items-center">
                  平均值
                </div>
                {COST_CATEGORIES.map((cat) => {
                  const avg = categoryAverages[cat.key];
                  const avgRatio = getAvgRatio(cat.key);
                  const { bg, text } = getCellColorClass(avgRatio);

                  return (
                    <div
                      key={cat.key}
                      className={`${bg} ${text} px-2 py-2 rounded-md text-xs font-semibold text-center min-h-[36px] flex items-center justify-center`}
                    >
                      {viewMode === 'percentage'
                        ? `${((avg / (costs.reduce((s, c) => s + c.totalLanded, 0) / Math.max(costs.length, 1))) * 100).toFixed(1)}%`
                        : `$${avg.toFixed(2)}`
                      }
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Color Legend */}
          <div className="mt-4 pt-3 border-t border-border">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="text-xs text-muted-foreground font-medium shrink-0">颜色图例:</span>
              <div className="flex items-center gap-1 flex-wrap">
                {[
                  { label: '极低 (0-25%)', ratio: 0.1 },
                  { label: '低 (25-50%)', ratio: 0.35 },
                  { label: '中 (50-75%)', ratio: 0.6 },
                  { label: '高 (75-90%)', ratio: 0.82 },
                  { label: '极高 (90-100%)', ratio: 0.95 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-1">
                    <div className={`w-4 h-4 rounded-sm ${getLegendColorClass(item.ratio)}`} />
                    <span className="text-[10px] text-muted-foreground">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
