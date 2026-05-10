'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Truck, Shield, Package, CreditCard, TrendingDown,
  ChevronDown, ChevronUp, Zap, Target, BarChart3,
  ArrowUpDown, Filter, Sparkles, CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { useCostOptimization } from '@/hooks/use-supply-chain-data';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';

// ==================== Type Icon Mapping ====================
const TYPE_ICON_MAP: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  logistics: { icon: <Truck className="h-5 w-5" />, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40' },
  tariff: { icon: <Shield className="h-5 w-5" />, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
  rawMaterial: { icon: <Package className="h-5 w-5" />, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
  platformFee: { icon: <CreditCard className="h-5 w-5" />, color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
  exchangeHedge: { icon: <TrendingDown className="h-5 w-5" />, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
};

const IMPACT_COLORS: Record<string, string> = {
  high: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
};

const EFFORT_COLORS: Record<string, string> = {
  easy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  complex: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800',
};

// ==================== Animated Counter ====================
function AnimatedCounter({ value, prefix = '', suffix = '', duration = 800 }: {
  value: number; prefix?: string; suffix?: string; duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const prevTarget = useRef(0);
  const animRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  useEffect(() => {
    const start = prevTarget.current;
    const diff = value - start;
    if (diff === 0) return;

    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + diff * eased);
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        prevTarget.current = value;
      }
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [value, duration]);

  return (
    <span className="number-count-anim">
      {prefix}{display.toFixed(2)}{suffix}
    </span>
  );
}

// ==================== Suggestion Type ====================
interface OptimizationSuggestion {
  id: string;
  type: string;
  typeLabel: string;
  title: string;
  description: string;
  currentCost: number;
  potentialSaving: number;
  savingPercent: number;
  impact: 'high' | 'medium' | 'low';
  impactLabel: string;
  effort: 'easy' | 'medium' | 'complex';
  effortLabel: string;
  roi: number;
  affectedProducts: { sku: string; productName: string; currentMargin: number; optimizedMargin: number }[];
  implementationSteps: string[];
  simulatedTotalSaving: number;
}

// ==================== Simulated Apply Dialog ====================
function SimulatedApplyPanel({ suggestion, onBack }: {
  suggestion: OptimizationSuggestion;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4 p-4 rounded-lg border-2 border-dashed border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          模拟应用: {suggestion.typeLabel}
        </h4>
        <Button variant="ghost" size="sm" onClick={onBack} className="h-7 text-xs">
          返回
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{suggestion.description}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="text-center p-2 rounded-lg bg-white dark:bg-gray-900 border">
          <p className="text-xs text-muted-foreground">当前成本</p>
          <p className="text-lg font-bold text-rose-600">${suggestion.currentCost.toFixed(2)}</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-white dark:bg-gray-900 border">
          <p className="text-xs text-muted-foreground">潜在节省</p>
          <p className="text-lg font-bold text-emerald-600">${suggestion.potentialSaving.toFixed(2)}</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-white dark:bg-gray-900 border">
          <p className="text-xs text-muted-foreground">节省比例</p>
          <p className="text-lg font-bold text-emerald-600">{suggestion.savingPercent}%</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-white dark:bg-gray-900 border">
          <p className="text-xs text-muted-foreground">ROI</p>
          <p className="text-lg font-bold text-cyan-600">{suggestion.roi.toFixed(1)}</p>
        </div>
      </div>
      <Separator />
      <div>
        <h5 className="text-sm font-medium mb-2">受影响产品毛利率变化</h5>
        <div className="max-h-48 overflow-y-auto space-y-1.5 custom-scrollbar">
          {suggestion.affectedProducts.map((p) => {
            const improvement = p.optimizedMargin - p.currentMargin;
            return (
              <div key={p.sku} className="flex items-center justify-between text-xs p-2 rounded bg-white/70 dark:bg-gray-900/70 border">
                <span className="font-mono">{p.sku}</span>
                <span className="truncate mx-2 max-w-[120px]">{p.productName}</span>
                <span className="text-muted-foreground">{p.currentMargin}%</span>
                <span className="text-emerald-500 mx-1">→</span>
                <span className="font-semibold text-emerald-600">{p.optimizedMargin}%</span>
                <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400">
                  +{improvement.toFixed(1)}%
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ==================== Main CostOptimizationPanel Component ====================
export function CostOptimizationPanel() {
  const { data, isLoading, error } = useCostOptimization();

  // Sort & filter state
  const [sortBy, setSortBy] = useState<'roi' | 'impact' | 'effort'>('roi');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterEffort, setFilterEffort] = useState<string>('all');

  // Expanded cards
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Simulated apply state
  const [appliedId, setAppliedId] = useState<string | null>(null);

  // Animation entrance
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse data
  const suggestions = useMemo(() => {
    if (!data) return [];
    return (data as Record<string, unknown>).suggestions as OptimizationSuggestion[];
  }, [data]);

  const summary = useMemo(() => {
    if (!data) return null;
    return (data as Record<string, unknown>).summary as {
      totalPotentialSaving: number;
      highImpactCount: number;
      quickWinsCount: number;
      totalProducts: number;
      avgSavingPercent: number;
    };
  }, [data]);

  // Filtered & sorted suggestions
  const processedSuggestions = useMemo(() => {
    let result = [...suggestions];

    // Filter by type
    if (filterType !== 'all') {
      result = result.filter((s) => s.type === filterType);
    }
    // Filter by effort
    if (filterEffort !== 'all') {
      result = result.filter((s) => s.effort === filterEffort);
    }

    // Sort
    const impactOrder = { high: 3, medium: 2, low: 1 };
    const effortOrder = { easy: 3, medium: 2, complex: 1 };

    switch (sortBy) {
      case 'roi':
        result.sort((a, b) => b.roi - a.roi);
        break;
      case 'impact':
        result.sort((a, b) => impactOrder[b.impact] - impactOrder[a.impact]);
        break;
      case 'effort':
        result.sort((a, b) => effortOrder[b.effort] - effortOrder[a.effort]);
        break;
    }

    return result;
  }, [suggestions, sortBy, filterType, filterEffort]);

  // Staggered entrance animation key (reset when suggestions change)
  const animationKey = useMemo(
    () => `${processedSuggestions.length}-${sortBy}-${filterType}-${filterEffort}`,
    [processedSuggestions.length, sortBy, filterType, filterEffort]
  );

  // Available filter options
  const typeOptions = useMemo(() => {
    const types = new Set(suggestions.map((s) => s.type));
    return Array.from(types);
  }, [suggestions]);

  if (isLoading) return <DashboardSkeleton />;
  if (error) {
    return (
      <Card className="border-rose-200 dark:border-rose-800">
        <CardContent className="p-6 text-center text-rose-600">
          加载优化建议失败，请稍后重试
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="card-dashboard hover:shadow-lg transition-all duration-300"
     
    >
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Zap className="h-5 w-5 text-orange-500" />
              成本优化建议
            </CardTitle>
            <CardDescription>基于当前成本结构的智能优化建议</CardDescription>
          </div>
        </div>

        {/* Summary bar */}
        {summary && (
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40">
              <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/60">
                <BarChart3 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">总潜在节省</p>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  <AnimatedCounter value={summary.totalPotentialSaving} prefix="$" />
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40">
              <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-900/60">
                <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">快速见效</p>
                <p className="text-sm font-bold text-amber-700 dark:text-amber-400">{summary.quickWinsCount} 项</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/40">
              <div className="p-1.5 rounded-md bg-rose-100 dark:bg-rose-900/60">
                <Target className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">高影响</p>
                <p className="text-sm font-bold text-rose-700 dark:text-rose-400">{summary.highImpactCount} 项</p>
              </div>
            </div>
          </div>
        )}

        {/* Sort & Filter controls */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'roi' | 'impact' | 'effort')}>
              <SelectTrigger className="h-7 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="roi">按 ROI</SelectItem>
                <SelectItem value="impact">按影响力</SelectItem>
                <SelectItem value="effort">按难度</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-7 w-[120px] text-xs">
                <SelectValue placeholder="类型筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {typeOptions.map((t) => {
                  const label = suggestions.find((s) => s.type === t)?.typeLabel || t;
                  return <SelectItem key={t} value={t}>{label}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
          <Select value={filterEffort} onValueChange={setFilterEffort}>
            <SelectTrigger className="h-7 w-[100px] text-xs">
              <SelectValue placeholder="难度筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部难度</SelectItem>
              <SelectItem value="easy">简单</SelectItem>
              <SelectItem value="medium">中等</SelectItem>
              <SelectItem value="complex">复杂</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent ref={containerRef}>
        {processedSuggestions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">暂无匹配的优化建议</p>
          </div>
        ) : (
          <div className="space-y-3">
            {processedSuggestions.map((suggestion, idx) => {
              const isExpanded = expandedIds.has(suggestion.id);
              const isApplied = appliedId === suggestion.id;
              const typeConfig = TYPE_ICON_MAP[suggestion.type] || TYPE_ICON_MAP.logistics;

              return (
                <div
                  key={`${suggestion.id}-${animationKey}`}
                  className="card-dashboard"
                >
                  <Collapsible open={isExpanded} onOpenChange={() => toggleExpand(suggestion.id)}>
                    <Card className="border hover:shadow-md transition-all duration-200 group">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-start gap-3 p-4 cursor-pointer">
                          {/* Type icon */}
                          <div className={`flex-shrink-0 p-2.5 rounded-xl ${typeConfig.bg}`}>
                            <span className={typeConfig.color}>{typeConfig.icon}</span>
                          </div>

                          {/* Main content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-semibold text-sm">{suggestion.title}</h4>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${IMPACT_COLORS[suggestion.impact]}`}>
                                {suggestion.impactLabel}影响
                              </Badge>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${EFFORT_COLORS[suggestion.effort]}`}>
                                {suggestion.effortLabel}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {suggestion.description}
                            </p>

                            {/* Cost & savings row */}
                            <div className="flex items-center gap-4 mt-2 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground">当前:</span>
                                <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                                  <AnimatedCounter value={suggestion.currentCost} prefix="$" />
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground">可节省:</span>
                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                  <AnimatedCounter value={suggestion.potentialSaving} prefix="$" />
                                </span>
                                <span className="text-[10px] text-emerald-500">({suggestion.savingPercent}%)</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">ROI:</span>
                                <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                                  {suggestion.roi.toFixed(1)}
                                </span>
                              </div>
                            </div>

                            {/* Mini progress bar for saving */}
                            <div className="mt-2 h-1.5 w-full max-w-[200px] bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(suggestion.savingPercent * 3, 100)}%` }}
                              />
                            </div>
                          </div>

                          {/* Expand chevron */}
                          <div className="flex-shrink-0 mt-1">
                            {isExpanded
                              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            }
                          </div>
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="px-4 pb-4 pt-0">
                          <Separator className="mb-3" />

                          {/* If "模拟应用" is active, show simulated panel */}
                          {isApplied ? (
                            <SimulatedApplyPanel
                              suggestion={suggestion}
                              onBack={() => setAppliedId(null)}
                            />
                          ) : (
                            <div className="space-y-3">
                              {/* Implementation steps */}
                              <div>
                                <h5 className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                  实施步骤
                                </h5>
                                <ol className="space-y-1">
                                  {suggestion.implementationSteps.map((step) => (
                                    <li key={step} className="text-xs text-muted-foreground pl-2 border-l-2 border-emerald-300 dark:border-emerald-700">
                                      {step}
                                    </li>
                                  ))}
                                </ol>
                              </div>

                              {/* Affected products preview */}
                              <div>
                                <h5 className="text-xs font-medium mb-1.5">
                                  受影响产品 ({suggestion.affectedProducts.length})
                                </h5>
                                <div className="max-h-32 overflow-y-auto space-y-1 custom-scrollbar">
                                  {suggestion.affectedProducts.slice(0, 5).map((p) => {
                                    const improvement = p.optimizedMargin - p.currentMargin;
                                    return (
                                      <div key={p.sku} className="flex items-center justify-between text-[11px] p-1.5 rounded bg-muted/40">
                                        <span className="font-mono text-muted-foreground">{p.sku}</span>
                                        <span className="truncate mx-1 max-w-[100px]">{p.productName}</span>
                                        <span className="text-muted-foreground">{p.currentMargin}%</span>
                                        <span className="text-emerald-500 mx-0.5">→</span>
                                        <span className="font-medium text-emerald-600 dark:text-emerald-400">{p.optimizedMargin}%</span>
                                        <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0 border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400">
                                          +{improvement.toFixed(1)}
                                        </Badge>
                                      </div>
                                    );
                                  })}
                                  {suggestion.affectedProducts.length > 5 && (
                                    <p className="text-[10px] text-muted-foreground text-center">
                                      ...还有 {suggestion.affectedProducts.length - 5} 个产品
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Apply button */}
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full h-8 text-xs gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAppliedId(suggestion.id);
                                }}
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                模拟应用
                              </Button>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
