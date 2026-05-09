// @ts-nocheck — pre-existing type incompatibility with cascade-risk API response
'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Network, AlertTriangle, TrendingDown, Clock, DollarSign,
  ChevronDown, Zap, Anchor, Ship, Package, Building2, RefreshCw,
  GitBranch, Beaker, TrendingUp, BarChart3, ShieldCheck, ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

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

// ─── Node type icon ────────────────────────────────────────────────────────────

function NodeIcon({ type }: { type: string }) {
  switch (type) {
    case 'PORT': return <Anchor className="h-3 w-3" />;
    case 'SHIPMENT': return <Ship className="h-3 w-3" />;
    case 'WAREHOUSE': return <Building2 className="h-3 w-3" />;
    case 'PRODUCT': return <Package className="h-3 w-3" />;
    case 'SUPPLIER': return <Building2 className="h-3 w-3" />;
    default: return <Network className="h-3 w-3" />;
  }
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
  const [report, setReport] = useState<CascadeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [scenario, setScenario] = useState('auto');
  const [expanded, setExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const fetchReport = (scn?: string) => {
    setLoading(true);
    setError(false);
    const s = scn || scenario;
    fetch(`/api/cascade-risk?scenario=${s}`)
      .then(res => { if (!res.ok) throw new Error('Failed'); return res.json(); })
      .then(data => { setReport(data as any); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    let cancelled = false;
    fetch(`/api/cascade-risk?scenario=auto`)
      .then(res => { if (!res.ok) throw new Error('Failed'); return res.json(); })
      .then(data => { if (!cancelled) { setReport(data as any); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

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
          <Button variant="outline" size="sm" onClick={() => fetchReport()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />重试
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!report) return null;

  const { summary, triggeredBy, sourceNodes, propagation } = report;
  const products = propagation.filter(p => p.type === 'PRODUCT' && p.propagatedRisk > 0);
  const shipments = propagation.filter(p => p.type === 'SHIPMENT' && p.propagatedRisk > 0);

  return (
    <Card className="card-dashboard border-purple-200 dark:border-purple-900">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Network className="h-4 w-4 text-purple-500" />
              级联风险传播分析
              <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[10px] gap-1">
                <Zap className="h-2.5 w-2.5" />
                核心创新
              </Badge>
            </CardTitle>
            <CardDescription>
              {triggeredBy.description} | {summary.affectedNodes}/{summary.totalNodes} 节点受影响 | 最大传播深度 {summary.maxDepth}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={scenario} onValueChange={(v) => { setScenario(v); fetchReport(v); }}>
              <SelectTrigger className="h-7 text-xs w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">自动检测</SelectItem>
                <SelectItem value="weather_disruption">天气中断</SelectItem>
                <SelectItem value="port_congestion">港口拥堵</SelectItem>
                <SelectItem value="exchange_shock">汇率冲击</SelectItem>
                <SelectItem value="supplier_failure">供应商故障</SelectItem>
              </SelectContent>
            </Select>
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => fetchReport()} />
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
            <p className="text-lg font-bold text-red-600 dark:text-red-400">{products.length}</p>
          </div>
        </div>

        {/* Detail toggle */}
        <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => setShowDetails(!showDetails)}>
          {showDetails ? '收起详细分析' : '展开风险传播详情'}
          <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
        </Button>

        {showDetails && (<>
        {/* Risk Propagation Flow */}
        <div className="rounded-lg border p-3 bg-muted/10">
          <h4 className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <TrendingDown className="h-3 w-3 text-purple-500" />
            风险传播链路
          </h4>

          {/* Source → Propagation Depth visualization */}
          <div className="space-y-2">
            {sourceNodes.map(src => {
              const downstream = propagation.filter(p =>
                p.path.length > 1 && p.path[0] === src.label
              ).sort((a, b) => a.depth - b.depth);

              return (
                <div key={src.id} className="space-y-1.5">
                  {/* Source node */}
                  <div className="flex items-center gap-2">
                    <div className={`px-2 py-1 rounded-md text-xs font-medium ${riskColor(src.riskScore)}`}>
                      <NodeIcon type="PORT" />
                      <span className="ml-1">{src.label}</span>
                      <span className="ml-2 font-bold">{src.riskScore}%</span>
                    </div>
                    {downstream.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        → 影响 {downstream.length} 个下游节点
                      </span>
                    )}
                  </div>

                  {/* Downstream nodes by depth */}
                  {downstream.slice(0, expanded ? 50 : 8).map(node => (
                    <div key={node.nodeId} className="ml-6 flex items-center gap-2">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <NodeIcon type={node.type} />
                        <span className="text-xs truncate">{node.label}</span>
                        <span className="text-[10px] text-muted-foreground">深度 {node.depth}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${riskBarColor(node.riskScore)}`}
                            style={{ width: `${Math.min(node.riskScore, 100)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold ${riskColor(node.riskScore).split(' ')[0]}`}>
                          {node.riskScore}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {propagation.filter(p => p.depth > 1).length > 8 && (
            <Button variant="ghost" size="sm" className="w-full h-7 text-xs mt-2" onClick={() => setExpanded(!expanded)}>
              {expanded ? '收起' : `展开全部 (${propagation.filter(p => p.depth > 1).length} 条)`}
              <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </Button>
          )}
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

        {/* Counterfactuals (Phase 5) */}
        {(report as unknown as Record<string, unknown>).counterfactuals && ((report as unknown as Record<string, unknown>).counterfactuals as CounterfactualResult[]).length > 0 && (
          <div className="rounded-lg border p-3 bg-emerald-50/30 dark:bg-emerald-950/10">
            <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <GitBranch className="h-3 w-3 text-emerald-500" />
              反事实分析：如果采取不同措施？
            </h4>
            <div className="space-y-2">
              {((report as unknown as Record<string, unknown>).counterfactuals as CounterfactualResult[]).map((cf, i) => (
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

        {/* Forward Projection (Phase 3) */}
        {(report as unknown as Record<string, unknown>).forwardProjection && ((report as unknown as Record<string, unknown>).forwardProjection as DayProjection[]).length > 0 && (
          <div className="rounded-lg border p-3 bg-blue-50/30 dark:bg-blue-950/10">
            <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-blue-500" />
              7 天风险预测 (Phase 3: 时间维度)
            </h4>
            <div className="overflow-x-auto">
              <div className="flex gap-2 min-w-[500px]">
                {((report as unknown as Record<string, unknown>).forwardProjection as DayProjection[]).map((day, i) => {
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

        {/* Explanation Legend */}
        <div className="rounded-lg border p-2.5 bg-purple-50/20 dark:bg-purple-950/10">
          <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
            <Beaker className="h-3 w-3 text-purple-500" />
            传播逻辑说明
          </h4>
          <div className="grid grid-cols-2 gap-1 text-[9px] text-muted-foreground">
            <span>衰减DEPARTS_FROM: {0.85} (校准)</span>
            <span>衰减CARRIES: {0.75} (校准)</span>
            <span>衰减ARRIVES_AT: {0.70} (校准)</span>
            <span>衰减STORED_IN: {0.60} (校准)</span>
            <span>多源融合: weighted_sum</span>
            <span>传播截止: risk &lt; 0.5%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
