'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { useSupplyChainScore } from '@/hooks/use-supply-chain-data';

const SUB_SCORE_CONFIG = [
  { key: 'inventory', label: '库存评分', weight: '25%', color: 'bg-green-500' },
  { key: 'cost', label: '成本评分', weight: '20%', color: 'bg-rose-500' },
  { key: 'logistics', label: '物流评分', weight: '20%', color: 'bg-violet-500' },
  { key: 'sales', label: '销售评分', weight: '20%', color: 'bg-cyan-500' },
  { key: 'risk', label: '风险评分', weight: '15%', color: 'bg-amber-500' },
] as const;

const GRADE_COLORS: Record<string, string> = {
  A: 'text-green-600 dark:text-green-400',
  B: 'text-blue-600 dark:text-blue-400',
  C: 'text-yellow-600 dark:text-yellow-400',
  D: 'text-orange-600 dark:text-orange-400',
  F: 'text-red-600 dark:text-red-400',
};

const GRADE_BG: Record<string, string> = {
  A: 'bg-green-50 dark:bg-green-950/20',
  B: 'bg-blue-50 dark:bg-blue-950/20',
  C: 'bg-yellow-50 dark:bg-yellow-950/20',
  D: 'bg-orange-50 dark:bg-orange-950/20',
  F: 'bg-red-50 dark:bg-red-950/20',
};

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const PRIORITY_LABELS: Record<string, string> = { high: '高', medium: '中', low: '低' };

function CircularGauge({ score, grade }: { score: number; grade: string }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeColor = grade === 'A' ? '#22c55e' : grade === 'B' ? '#3b82f6' : grade === 'C' ? '#eab308' : grade === 'D' ? '#f97316' : '#ef4444';

  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const duration = 1000;
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(eased * score));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const dashOffset = circumference - (animatedScore / 100) * circumference;

  return (
    <div className="relative w-24 h-24 sm:w-32 sm:h-32">
      <svg className="w-24 h-24 sm:w-32 sm:h-32 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="10" />
        <circle cx="60" cy="60" r={radius} fill="none" stroke={strokeColor} strokeWidth="10"
          strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round"
          className="transition-all duration-100 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span key={animatedScore} className="text-2xl sm:text-3xl font-bold">{animatedScore}</span>
        <span className="text-[10px] sm:text-xs text-muted-foreground">/100</span>
      </div>
    </div>
  );
}

function ScoreSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Shield className="h-4 w-4 text-orange-500" />供应链健康评分</CardTitle></CardHeader>
      <CardContent><div className="flex flex-col md:flex-row items-center gap-6"><Skeleton className="w-32 h-32 rounded-full" /><div className="flex-1 w-full space-y-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-2/3" /></div></div></CardContent>
    </Card>
  );
}

export function SupplyChainScoreCard() {
  const { data, isLoading, error } = useSupplyChainScore() as { data: Record<string, any> | undefined; isLoading: boolean; error: Error | null };
  const [expanded, setExpanded] = useState(false);

  if (isLoading) return <ScoreSkeleton />;
  if (error || !data) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" />供应链健康评分</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">加载评分数据失败，请稍后重试</p></CardContent>
      </Card>
    );
  }

  const { overallScore, grade, gradeLabel, subScores, recommendations } = data;
  const gradeBg = GRADE_BG[grade] || GRADE_BG.C;

  return (
    <Card className={`card-dashboard ${gradeBg}`}
     >
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4 text-orange-500" />
          供应链健康评分
          <Badge className={`ml-2 text-sm font-bold ${GRADE_COLORS[grade]}`}>{grade} · {gradeLabel}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
          {/* Circular gauge */}
          <CircularGauge score={overallScore} grade={grade} />
          {/* Sub-scores */}
          <div className="flex-1 w-full space-y-2 sm:space-y-3">
            {SUB_SCORE_CONFIG.map(({ key, label, weight, color }) => {
              const score = subScores[key]?.score ?? 0;
              return (
                <div key={key} className="flex items-center gap-2 sm:gap-3">
                  <span className="text-[10px] sm:text-xs w-16 sm:w-20 shrink-0 text-muted-foreground">{label}<span className="ml-1 text-[9px] sm:text-[10px] opacity-60">({weight})</span></span>
                  <div className="flex-1 h-2 sm:h-2.5 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${color} transition-all duration-500`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <span className="text-[10px] sm:text-xs font-semibold w-7 sm:w-8 text-right tabular-nums">{score}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top 3 recommendations */}
        {recommendations.length > 0 && (
          <div className="mt-4 space-y-2">
            {recommendations.slice(0, 3).map((rec, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg border bg-background/50 hover:bg-background/80 transition-colors">
                <Badge className={`text-[10px] shrink-0 ${PRIORITY_STYLES[rec.priority]}`}>{PRIORITY_LABELS[rec.priority]}</Badge>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{rec.title}</p>
                  <p className="text-[10px] text-muted-foreground line-clamp-1">{rec.impact}</p>
                </div>
                {rec.priority === 'low' ? <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0 ml-auto" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 ml-auto" />}
              </div>
            ))}
          </div>
        )}

        {/* Expandable detailed analysis */}
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger className="flex items-center gap-1 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center">
            详细分析 <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3 p-3 rounded-lg border bg-background/40 space-y-2">
              {SUB_SCORE_CONFIG.map(({ key, label, color }) => {
                const sub = subScores[key];
                if (!sub?.components) return null;
                return (
                  <div key={key} className="text-xs">
                    <span className={`font-semibold inline-block w-20 ${color.replace('bg-', 'text-')}`}>{label}</span>
                    <span className="text-muted-foreground">{Object.entries(sub.components).map(([k, v]) => `${k}: ${v}`).join(' · ')}</span>
                  </div>
                );
              })}
              {data.summary && (
                <p className="text-[10px] text-muted-foreground pt-1 border-t">
                  产品{data.summary.totalProducts} · 库存{data.summary.totalInventory} · 货运{data.summary.totalShipments} · 供应商{data.summary.totalSuppliers}
                </p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
