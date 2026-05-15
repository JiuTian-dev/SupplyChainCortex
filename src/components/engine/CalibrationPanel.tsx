'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle, Brain, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface EngineCal {
  engine: string;
  totalDecisions: number;
  accepted: number;
  rejected: number;
  acceptanceRate: number;
  confidenceDrift: number;
  biasScore: number;
  recommendedWeightAdjustment: number;
  recommendation: string;
}

interface WeightSource {
  source: string;
  weight: number;
  sampleSize: number;
}

interface CalData {
  report: {
    globalAcceptanceRate: number;
    summary: string;
    totalFeedback: number;
    engines: EngineCal[];
  };
  sourceWeights: WeightSource[];
  weightTrend: Array<{
    source: string;
    current: number;
    previous: number;
    delta: number;
  }> | null;
}

function weightIcon(adj: number) {
  if (adj > 0) return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
  if (adj < 0) return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-gray-400" />;
}

function sourceLabel(s: string): string {
  const map: Record<string, string> = {
    'weather:open-meteo': '天气',
    'fx:frankfurter': '汇率',
    'db:inventory': '库存',
    'db:shipments': '发货',
    'db:suppliers': '供应商',
  };
  return map[s] || s;
}

function rateColor(rate: number): string {
  if (rate >= 0.8) return 'text-green-600';
  if (rate >= 0.5) return 'text-yellow-600';
  return 'text-red-600';
}

function rateBg(rate: number): string {
  if (rate >= 0.8) return 'bg-green-100 dark:bg-green-950';
  if (rate >= 0.5) return 'bg-yellow-100 dark:bg-yellow-950';
  return 'bg-red-100 dark:bg-red-950';
}

export function CalibrationPanel() {
  const [data, setData] = useState<CalData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/engine-calibrate');
        const json = await res.json();
        if (!cancelled && json.success) setData(json);
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Brain className="w-4 h-4" />引擎校准</CardTitle></CardHeader>
        <CardContent><div className="h-24 flex items-center justify-center text-sm text-muted-foreground">加载中...</div></CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Brain className="w-4 h-4" />引擎校准</CardTitle></CardHeader>
        <CardContent><div className="h-24 flex items-center justify-center text-sm text-red-500">加载失败</div></CardContent>
      </Card>
    );
  }

  const { report, sourceWeights, weightTrend } = data;
  const globalRate = report.globalAcceptanceRate;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2"><Brain className="w-4 h-4" />引擎校准</span>
          <Badge variant={globalRate >= 0.7 ? 'default' : globalRate >= 0.4 ? 'secondary' : 'destructive'}>
            {Math.round(globalRate * 100)}% 采纳率
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <p className="text-xs text-muted-foreground">{report.summary}</p>

        {/* Per-engine acceptance */}
        <div className="space-y-2">
          {report.engines.map(eng => (
            <div key={eng.engine} className="p-2 rounded border text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium">{eng.engine}</span>
                <span className={`font-mono font-bold ${rateColor(eng.acceptanceRate)}`}>
                  {Math.round(eng.acceptanceRate * 100)}%
                </span>
              </div>
              <Progress value={eng.acceptanceRate * 100} className="h-1.5" />
              <div className="flex items-center gap-3 text-muted-foreground">
                <span>决策 {eng.totalDecisions}</span>
                <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" />{eng.accepted}</span>
                <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-500" />{eng.rejected}</span>
                <span className="flex items-center gap-1">{weightIcon(eng.recommendedWeightAdjustment)} adj {eng.recommendedWeightAdjustment > 0 ? '+' : ''}{eng.recommendedWeightAdjustment}</span>
              </div>
              <p className="text-muted-foreground">{eng.recommendation}</p>
            </div>
          ))}
        </div>

        {/* Source weights */}
        {sourceWeights.length > 0 && (
          <div>
            <h4 className="text-xs font-medium mb-2">数据源权重</h4>
            <div className="space-y-1.5">
              {sourceWeights.map(sw => {
                const trend = weightTrend?.find(t => t.source === sw.source);
                return (
                  <div key={sw.source} className="flex items-center justify-between text-xs">
                    <span>{sourceLabel(sw.source)}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono">{(sw.weight * 100).toFixed(1)}%</span>
                      {trend && trend.delta !== 0 && (
                        <span className={`text-xs ${trend.delta > 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {trend.delta > 0 ? '+' : ''}{(trend.delta * 100).toFixed(1)}%
                        </span>
                      )}
                      <span className="text-muted-foreground">n={sw.sampleSize}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
