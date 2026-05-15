'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Flame, Percent, DollarSign } from 'lucide-react';
import {
  HeatmapWrapper,
  HeatmapCell,
  HeatmapLegend,
  SEVERITY_LEGEND_BG,
  getHeatmapColor,
  getLegendColor,
  SEVERITY_THRESHOLDS,
} from '@/components/shared/HeatmapGrid';
import type { CostRecord } from '@prisma/client';

// ==================== Cost categories config ====================
const COST_CATEGORIES = [
  { key: 'rawMaterial' as const, label: '原材料' },
  { key: 'labor' as const, label: '人工' },
  { key: 'logistics' as const, label: '物流' },
  { key: 'tariff' as const, label: '关税' },
  { key: 'platformFee' as const, label: '平台费' },
];

// ==================== Color bands (ratio-based) ====================
function getCellColorClass(ratio: number): { bg: string; text: string } {
  return getHeatmapColor(ratio, SEVERITY_THRESHOLDS);
}

function getLegendColorClass(ratio: number): string {
  return getLegendColor(ratio, SEVERITY_LEGEND_BG);
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
      maxes[cat.key] = Math.max(...vals, 0.01);
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

  const formatValue = (amount: number, totalLanded: number): string => {
    if (viewMode === 'percentage') {
      return totalLanded > 0 ? `${((amount / totalLanded) * 100).toFixed(1)}%` : '0%';
    }
    return `$${amount.toFixed(2)}`;
  };

  const getRatio = (amount: number, categoryKey: string): number => {
    return amount / categoryMaxes[categoryKey];
  };

  const getAvgRatio = (categoryKey: string): number => {
    return categoryAverages[categoryKey] / categoryMaxes[categoryKey];
  };

  return (
    <Card className="card-dashboard">
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
        <HeatmapWrapper>
          <div className="max-h-96 overflow-auto custom-scrollbar">
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
                      <HeatmapCell
                        key={cat.key}
                        bg={bg}
                        text={text}
                        tooltipContent={
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
                        }
                      >
                        {formatValue(amount, cost.totalLanded)}
                      </HeatmapCell>
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
              <HeatmapLegend
                thresholds={[
                  { label: '极低 (0-25%)', bg: getLegendColorClass(0.1) },
                  { label: '低 (25-50%)', bg: getLegendColorClass(0.35) },
                  { label: '中 (50-75%)', bg: getLegendColorClass(0.6) },
                  { label: '高 (75-90%)', bg: getLegendColorClass(0.82) },
                  { label: '极高 (90-100%)', bg: getLegendColorClass(0.95) },
                ]}
              />
            </div>
          </div>
        </HeatmapWrapper>
      </CardContent>
    </Card>
  );
}
