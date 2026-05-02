'use client';

import {
  Shield, AlertTriangle, Zap, ArrowUpRight, ArrowDownRight, X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { MetricCard } from '@/components/shared/MetricCard';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';
import { RiskMatrixHeatmap } from '@/components/risk/RiskMatrixHeatmap';
import { WeatherRiskWidget } from '@/components/risk/WeatherRiskWidget';
import { CascadeRiskPanel } from '@/components/risk/CascadeRiskPanel';
import { DecisionPanel } from '@/components/risk/DecisionPanel';
import { useRisk } from '@/hooks/use-supply-chain-data';
import { useUIStore } from '@/stores/ui-store';

// ==================== Type definitions ====================

interface RiskDimension {
  name: string;
  score: number;
  key: string;
}

interface TopRisk {
  severity: string;
  description: string;
  dimension: string;
}

interface RiskDashboardData {
  overallRisk: number;
  riskLevel: string;
  dimensions: RiskDimension[];
  topRisks: TopRisk[];
}

interface SimulationImpact {
  dimension: string;
  currentScore: number;
  simulatedScore: number;
  change: number;
}

interface SimulationData {
  scenario: string;
  scenarioName: string;
  description: string;
  impacts: SimulationImpact[];
  recommendations: string[];
}

// ==================== Risk Tab ====================

export function RiskTab() {
  // React Query hooks
  const riskDashboardQuery = useRisk('dashboard');
  const selectedScenario = useUIStore((s) => s.selectedScenario);
  const setSelectedScenario = useUIStore((s) => s.setSelectedScenario);
  const riskSimulationQuery = useRisk('simulation', selectedScenario ? { scenario: selectedScenario } : undefined);

  // Derived data
  const riskData = ((riskDashboardQuery.data as any)?.data ?? riskDashboardQuery.data) as RiskDashboardData | null;
  const simulationData = (selectedScenario ? (riskSimulationQuery.data as any)?.data ?? riskSimulationQuery.data : null) as SimulationData | null;

  // Loading state
  if (riskDashboardQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  // Empty state: no risk data after loading completes
  if (!riskData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-4 mb-4">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
        </div>
        <p className="text-lg font-semibold text-muted-foreground">暂无风险数据</p>
        <p className="text-sm text-muted-foreground/70 mt-1">请稍后再试或联系管理员</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ==================== Risk Overview Metric Cards ==================== */}
      {riskData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <MetricCard
            title="整体风险评分"
            value={riskData.overallRisk}
            icon={<Shield className="h-4 w-4" />}
            subtitle="/ 100"
            color="text-red-600 dark:text-red-400"
            bgColor="bg-red-50 dark:bg-red-950/20"
            trend={riskData.riskLevel === 'low' ? '✓ 低风险' : riskData.riskLevel === 'medium' ? '⚠ 中风险' : '⚠ 高风险'}
          />
          <MetricCard
            title="风险维度"
            value={riskData.dimensions.length}
            icon={<AlertTriangle className="h-4 w-4" />}
            subtitle="监控中"
            color="text-orange-600 dark:text-orange-400"
            bgColor="bg-orange-50 dark:bg-orange-950/20"
          />
          <MetricCard
            title="高风险项"
            value={riskData.topRisks.filter((r) => r.severity === 'critical' || r.severity === 'high').length}
            icon={<AlertTriangle className="h-4 w-4" />}
            subtitle="需关注"
            color="text-amber-600 dark:text-amber-400"
            bgColor="bg-amber-50 dark:bg-amber-950/20"
          />
          <MetricCard
            title="模拟场景"
            value={4}
            icon={<Zap className="h-4 w-4" />}
            subtitle="可分析"
            color="text-purple-600 dark:text-purple-400"
            bgColor="bg-purple-50 dark:bg-purple-950/20"
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          Layer 1: Real-time Signals — "What's happening right now?"
          ══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WeatherRiskWidget />
        <CascadeRiskPanel />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          Layer 2: Decision Intelligence — "What should I do?"
          ══════════════════════════════════════════════════════════════════ */}
      <DecisionPanel />

      {/* ══════════════════════════════════════════════════════════════════
          Layer 3: Deep Dive — Simulation + Risk Matrix
          ══════════════════════════════════════════════════════════════════ */}

      {/* ==================== Overall Risk Score Gauge ==================== */}
      <Card className="card-entrance border-l-[4px] border-l-red-400 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
        <CardHeader className="pb-2 bg-red-50 dark:bg-red-950/20">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-red-500" />
            供应链风险监控
            {riskData && (
              <Badge variant="outline" className={`ml-auto text-xs font-normal ${riskData.riskLevel === 'low' ? 'border-green-400 text-green-600 dark:text-green-400' : riskData.riskLevel === 'medium' ? 'border-yellow-400 text-yellow-600 dark:text-yellow-400' : 'border-red-400 text-red-600 dark:text-red-400'}`}>
                {riskData.riskLevel === 'low' ? '低风险' : riskData.riskLevel === 'medium' ? '中风险' : '高风险'}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {riskData ? (
            <>
              {/* Overall Risk Score + Dimensions */}
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mb-5">
                {/* Semi-circle SVG Gauge */}
                <div className="flex-shrink-0 flex flex-col items-center justify-center">
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="8" />
                    <circle
                      cx="60" cy="60" r="50" fill="none"
                      stroke={riskData.overallRisk < 30 ? '#22c55e' : riskData.overallRisk < 60 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="8"
                      strokeDasharray={`${(riskData.overallRisk / 100) * 314.16} 314.16`}
                      strokeLinecap="round"
                      transform="rotate(-90 60 60)"
                      className="transition-all duration-1000 ease-out"
                    />
                    <text x="60" y="52" textAnchor="middle" className="fill-foreground text-2xl font-bold" style={{ fontSize: '28px' }}>{riskData.overallRisk}</text>
                    <text x="60" y="72" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: '11px' }}>风险评分</text>
                  </svg>
                  <Badge className={`mt-2 text-xs ${riskData.riskLevel === 'low' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : riskData.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                    {riskData.riskLevel === 'low' ? '🟢 低风险' : riskData.riskLevel === 'medium' ? '🟡 中风险' : '🔴 高风险'}
                  </Badge>
                </div>

                {/* Risk Dimension Cards */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {riskData.dimensions.map((dim) => {
                    const color = dim.score < 30 ? '#22c55e' : dim.score < 60 ? '#f59e0b' : '#ef4444';
                    const level = dim.score < 30 ? '低' : dim.score < 60 ? '中' : '高';
                    const levelBg = dim.score < 30 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : dim.score < 60 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
                    return (
                      <div key={dim.key} className="rounded-lg border p-3 hover:shadow-md hover:scale-[1.02] transition-all duration-200" style={{ borderLeftWidth: '3px', borderLeftColor: color }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold">{dim.name}</span>
                          <Badge className={`text-[10px] ${levelBg}`}>{level}</Badge>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg font-bold" style={{ color }}>{dim.score}</span>
                          <span className="text-xs text-muted-foreground">/100</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${dim.score}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 主要风险 */}
              {riskData.topRisks.length > 0 && (
                <div className="mb-4 p-3 rounded-lg border bg-red-50 dark:bg-red-950/15">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    主要风险
                  </h4>
                  <div className="mt-2 space-y-2">
                    {riskData.topRisks.map((risk, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs">
                        <Badge className={`text-[10px] shrink-0 ${risk.severity === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : risk.severity === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                          {risk.severity === 'critical' ? '严重' : risk.severity === 'high' ? '高' : '中'}
                        </Badge>
                        <span className="text-muted-foreground">{risk.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 场景模拟 */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">场景模拟：</span>
                <Select value={selectedScenario} onValueChange={setSelectedScenario}>
                  <SelectTrigger className="w-[220px] h-8 text-xs">
                    <SelectValue placeholder="选择模拟场景..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supply_disruption">🏭 供应中断</SelectItem>
                    <SelectItem value="demand_spike">📈 需求激增</SelectItem>
                    <SelectItem value="exchange_rate_shock">💱 汇率冲击</SelectItem>
                    <SelectItem value="tariff_increase">📋 关税上调</SelectItem>
                  </SelectContent>
                </Select>
                {selectedScenario && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedScenario('')}>
                    <X className="h-3 w-3 mr-1" />清除
                  </Button>
                )}
              </div>

              {/* Simulation Results */}
              {simulationData && (
                <div className="mt-4 p-3 rounded-lg border bg-purple-50 dark:bg-purple-950/15">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-purple-700 dark:text-purple-400 mb-2">
                    <Zap className="h-3.5 w-3.5" />
                    {simulationData.scenarioName} - 影响分析
                  </h4>
                  <p className="text-xs text-muted-foreground mb-3">{simulationData.description}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-3">
                    {simulationData.impacts.map((imp) => {
                      const isPositive = imp.change > 0;
                      return (
                        <div key={imp.dimension} className="rounded-md border p-2 text-center">
                          <p className="text-[10px] text-muted-foreground mb-1">{imp.dimension}</p>
                          <p className="text-sm font-bold" style={{ color: isPositive ? '#ef4444' : '#22c55e' }}>{imp.simulatedScore}</p>
                          <p className="text-[10px] flex items-center justify-center gap-0.5" style={{ color: isPositive ? '#ef4444' : '#22c55e' }}>
                            {isPositive ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                            +{imp.change}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {simulationData.recommendations.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-purple-600 dark:text-purple-400">建议措施：</p>
                      {simulationData.recommendations.map((rec, i) => (
                        <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-purple-500 shrink-0">•</span>{rec}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ==================== Risk Matrix Heatmap ==================== */}
      <Card className="card-entrance border-l-[4px] border-l-orange-400 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
        <CardHeader className="pb-2 bg-orange-50 dark:bg-orange-950/20">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            风险矩阵
            <span className="text-xs font-normal text-muted-foreground ml-1">产品风险分布热力图</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
        <RiskMatrixHeatmap />
        </CardContent>
      </Card>
    </div>
  );
}
