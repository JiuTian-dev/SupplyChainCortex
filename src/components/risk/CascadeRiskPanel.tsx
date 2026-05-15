'use client';

import { useState, useMemo } from 'react';
import { useCascadeRisk } from '@/hooks/use-cascade-risk';
import {
  Network, AlertTriangle, TrendingDown, Clock, DollarSign,
  ChevronDown, RefreshCw, GitBranch, TrendingUp, ArrowRight, Beaker,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { RiskPropagationGraph } from './RiskPropagationGraph';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SourceNode {
  id: string; label: string; riskScore: number; cause: string;
}

interface PropagationItem {
  nodeId: string; label: string; type: string;
  riskScore: number; initialRisk: number; propagatedRisk: number;
  path: string[]; depth: number;
  metadata: Record<string, unknown>;
}

interface CriticalPath {
  path: string[]; totalRisk: number; description: string;
}

interface TopProduct {
  sku: string; productName: string; impactScore: number;
  propagationPath: string; estimatedDelay: number; estimatedRevenueImpact: number;
}

interface DayProjection {
  day: number; date: string;
  portRisks: Array<{ port: string; risk: number; weather: string }>;
  affectedShipments: number;
  inventoryDepletionRisk: Array<{ sku: string; productName: string; daysUntilDepletion: number; riskLevel: string }>;
  cumulativeRevenueImpact: number;
}

interface CounterfactualResult {
  scenario: string;
  originalImpact: { affectedProducts: number; totalRisk: number };
  alternativeImpact: { affectedProducts: number; totalRisk: number };
  improvement: number;
  recommendation: string;
}

interface CascadeReport {
  triggeredBy: { source: string; description: string; timestamp: string };
  sourceNodes: SourceNode[];
  propagation: PropagationItem[];
  forwardProjection?: DayProjection[];
  counterfactuals?: CounterfactualResult[];
  summary: {
    totalNodes: number; affectedNodes: number; maxDepth: number;
    avgPropagatedRisk: number; criticalPaths: CriticalPath[];
    topAffectedProducts: TopProduct[];
  };
}

function riskColor(score: number): string {
  if (score >= 70) return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30';
  if (score >= 40) return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30';
  if (score >= 15) return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30';
  return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30';
}

function riskBarColor(score: number): string {
  if (score >= 70) return 'bg-red-500';
  if (score >= 40) return 'bg-orange-500';
  if (score >= 15) return 'bg-yellow-500';
  return 'bg-green-500';
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function CascadeRiskPanel() {
  const [scenario, setScenario] = useState('auto');
  const [showDetails, setShowDetails] = useState(false);

  const { data: report, isLoading: loading, error, refetch } = useCascadeRisk(scenario);

  const productRisks = useMemo(() =>
    (report?.propagation || []).filter(p => p.type === 'PRODUCT' && p.propagatedRisk > 0),
    [report?.propagation]
  );

  // ── Loading ──
  if (loading && !report) {
    return (
      <Card className="card-dashboard border-purple-200 dark:border-purple-900">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-3 w-96 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  // ── Error ──
  if (error && !report) {
    return (
      <Card className="card-dashboard border-purple-200 dark:border-purple-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Network className="h-4 w-4 text-purple-500" />
            级联风险传播分析
          </CardTitle>
          <CardDescription>数据加载失败</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />重试
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!report) return null;

  const { summary, triggeredBy, sourceNodes, propagation } = report;

  return (
    <Card className="card-dashboard border-purple-200 dark:border-purple-900">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Network className="h-4 w-4 text-purple-500" />
              级联风险传播分析
            </CardTitle>
            <CardDescription>
              {triggeredBy.description} | {summary.affectedNodes}/{summary.totalNodes} 节点受影响 | 最大传播深度 {summary.maxDepth}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={scenario} onValueChange={(v) => setScenario(v)}>
              <SelectTrigger className="h-7 text-xs w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">自动检测</SelectItem>
                <SelectItem value="weather_disruption">天气中断</SelectItem>
                <SelectItem value="port_congestion">港口拥堵</SelectItem>
                <SelectItem value="exchange_shock">汇率冲击</SelectItem>
                <SelectItem value="supplier_failure">供应商故障</SelectItem>
                <SelectItem value="commodity_shock">原材料波动</SelectItem>
                <SelectItem value="cbam_enforcement">CBAM 碳关税</SelectItem>
                <SelectItem value="competitor_pressure">竞品价格挤压</SelectItem>
              </SelectContent>
            </Select>
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => refetch()} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Source Nodes */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground self-center">触发源:</span>
          {sourceNodes.map(s => (
            <Badge key={s.id} variant="outline" className={`text-[10px] gap-1 ${riskColor(s.riskScore)}`}>
              <AlertTriangle className="h-2.5 w-2.5" />
              {s.label}: {s.riskScore}%
            </Badge>
          ))}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">受影响节点</p>
            <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{summary.affectedNodes}</p>
          </div>
          <div className="rounded-lg border p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">最大深度</p>
            <p className="text-lg font-bold">{summary.maxDepth} 层</p>
          </div>
          <div className="rounded-lg border p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">平均风险</p>
            <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{summary.avgPropagatedRisk}%</p>
          </div>
          <div className="rounded-lg border p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">受影响产品</p>
            <p className="text-lg font-bold text-red-600 dark:text-red-400">{productRisks.length}</p>
          </div>
        </div>

        {/* Detail toggle */}
        <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => setShowDetails(!showDetails)}>
          {showDetails ? '收起详细分析' : '展开风险传播详情'}
          <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
        </Button>

        {showDetails && (<>
        {/* Risk Propagation Graph */}
        <div className="rounded-lg border p-3 bg-muted/10">
          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <TrendingDown className="h-3 w-3 text-purple-500" />
            风险传播图 ({propagation.length} 节点, 最大深度 {summary.maxDepth})
          </h4>
          <RiskPropagationGraph
            sourceNodes={sourceNodes}
            propagation={propagation}
            maxDepth={summary.maxDepth}
          />
        </div>

        {/* Top Affected Products */}
        {summary.topAffectedProducts.length > 0 && (
          <div className="rounded-lg border p-3 bg-red-50/30 dark:bg-red-950/10">
            <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-red-500" />
              受影响产品排名 (Top {summary.topAffectedProducts.length})
            </h4>
            <div className="space-y-2">
              {summary.topAffectedProducts.map((p, i) => (
                <div key={p.sku} className="flex items-center gap-3 bg-card rounded-md p-2.5 border">
                  <span className="text-lg font-bold text-muted-foreground/40">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{p.productName}</p>
                    <p className="text-[10px] text-muted-foreground truncate" title={p.propagationPath}>
                      传播路径: {p.propagationPath}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-orange-500" />
                      <span className="text-xs">延误 {p.estimatedDelay} 天</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-3 w-3 text-red-500" />
                      <span className="text-xs font-bold text-red-600">${p.estimatedRevenueImpact.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </>)}

        {/* Counterfactuals */}
        {report.counterfactuals && report.counterfactuals.length > 0 && (
          <div className="rounded-lg border p-3 bg-emerald-50/30 dark:bg-emerald-950/10">
            <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <GitBranch className="h-3 w-3 text-emerald-500" />
              反事实分析：如果采取不同措施？
            </h4>
            <div className="space-y-2">
              {report.counterfactuals.map((cf, i) => (
                <div key={i} className="flex items-center gap-3 bg-card rounded-md p-2 border text-xs">
                  <span className="font-medium w-24 shrink-0">{cf.scenario}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground flex-1 truncate">{cf.recommendation}</span>
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] shrink-0">
                    -{cf.improvement}%
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7-Day Forward Projection */}
        {report.forwardProjection && report.forwardProjection.length > 0 && (
          <div className="rounded-lg border p-3 bg-blue-50/30 dark:bg-blue-950/10">
            <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-blue-500" />
              7 天风险预测
            </h4>
            <div className="overflow-x-auto">
              <div className="flex gap-2 min-w-[500px]">
                {report.forwardProjection.map((day, i) => {
                  const depletionCritical = day.inventoryDepletionRisk.filter(d => d.riskLevel === 'critical').length;
                  const depletionWarning = day.inventoryDepletionRisk.filter(d => d.riskLevel === 'warning').length;
                  return (
                    <div key={i} className={`flex-1 rounded-lg border p-2 text-center min-w-[70px] ${
                      depletionCritical > 0 ? 'border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20'
                      : depletionWarning > 0 ? 'border-yellow-300 bg-yellow-50/50 dark:border-yellow-800 dark:bg-yellow-950/20'
                      : 'border-border bg-card'
                    }`}>
                      <p className="text-[9px] text-muted-foreground">
                        {i === 0 ? '今天' : i === 1 ? '明天' : `D+${i}`}
                      </p>
                      <p className="text-[10px] font-bold">
                        {depletionCritical > 0 ? `🔴 ${depletionCritical}` : depletionWarning > 0 ? `🟡 ${depletionWarning}` : '✓'}
                      </p>
                      <p className="text-[8px] text-muted-foreground mt-0.5">
                        风险 ${(day.cumulativeRevenueImpact / 1000).toFixed(0)}k
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Legend — concise */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground px-1">
          <span>衰减系数: DEPARTS {0.43} · CARRIES {0.95} · ARRIVES {0.70} · STORED {0.60}</span>
          <span className="hidden sm:inline">|</span>
          <span>融合策略: weighted_sum · 截止阈值: 0.5%</span>
        </div>
      </CardContent>
    </Card>
  );
}
