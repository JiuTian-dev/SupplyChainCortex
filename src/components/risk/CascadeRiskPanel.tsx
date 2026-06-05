'use client';

import { useState, useMemo } from 'react';
import { useCascadeRisk } from '@/hooks/use-cascade-risk';
import {
  AlertTriangle, Clock, DollarSign,
  RefreshCw, ArrowRight, Activity,
} from 'lucide-react';
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

interface CausalCF {
  scenario: string;
  intervention: string;
  estimatedReduction: number;
  confidenceInterval: [number, number];
  causalEstimate: {
    ate: number;
    sampleSize: number;
    pValue: number;
    explanation: string;
  };
  improvement: number;
  recommendation: string;
  isReliable: boolean;
}

interface SEIRDay {
  day: number;
  date: string;
  susceptible: number;
  exposed: number;
  infectious: number;
  recovered: number;
  peakRisk: number;
}

interface SEIRTimeline {
  days: SEIRDay[];
  peakDay: number;
  peakInfectious: number;
  recoveryHorizon: number;
}

interface SEIRSummary {
  peakDay: number;
  peakInfectious: number;
  recoveryHorizon: number;
  finalSusceptible: number;
  finalRecovered: number;
}

interface CascadeReport {
  triggeredBy: { source: string; description: string; timestamp: string };
  sourceNodes: SourceNode[];
  propagation: PropagationItem[];
  forwardProjection?: DayProjection[];
  counterfactuals?: CounterfactualResult[];
  causalCounterfactuals?: CausalCF[];
  seirTimeline?: SEIRTimeline;
  summary: {
    totalNodes: number; affectedNodes: number; maxDepth: number;
    avgPropagatedRisk: number; criticalPaths: CriticalPath[];
    topAffectedProducts: TopProduct[];
    seirSummary?: SEIRSummary;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskDot(score: number): string {
  if (score >= 70) return 'bg-red-500';
  if (score >= 40) return 'bg-orange-400';
  if (score >= 15) return 'bg-yellow-400';
  return 'bg-emerald-400';
}

function riskText(score: number): string {
  if (score >= 70) return 'text-red-600 dark:text-red-400';
  if (score >= 40) return 'text-orange-600 dark:text-orange-400';
  return 'text-muted-foreground';
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function CascadeRiskPanel() {
  const [scenario, setScenario] = useState('auto');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: report, isLoading: loading, error, refetch } = useCascadeRisk(scenario);

  const productCount = useMemo(() =>
    (report?.propagation || []).filter((p: PropagationItem) => p.type === 'PRODUCT' && p.propagatedRisk > 0).length,
    [report?.propagation]
  );

  const toggle = (key: string) => setExpanded(prev => prev === key ? null : key);

  // ── Loading ──
  if (loading && !report) {
    return (
      <div className="space-y-4 p-1">
        <Skeleton className="h-4 w-48" />
        <div className="flex gap-6"><Skeleton className="h-8 w-16" /><Skeleton className="h-8 w-16" /><Skeleton className="h-8 w-16" /></div>
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
        <AlertTriangle className="h-4 w-4 text-red-400" />
        <span>级联风险分析加载失败</span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => refetch()}>重试</Button>
      </div>
    );
  }

  if (!report) return null;

  const { summary, sourceNodes, propagation } = report;

  return (
    <div className="space-y-6">
      {/* ── Header: scenario + refresh ── */}
      <div className="flex items-center justify-between">
        <Select value={scenario} onValueChange={setScenario}>
          <SelectTrigger className="h-8 w-[160px] text-sm font-medium bg-transparent border-0 shadow-none px-0 hover:bg-accent/50">
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
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* ── Key Metrics — inline, no cards ── */}
      <div className="flex items-end gap-6">
        <div>
          <p className="text-[11px] text-muted-foreground tracking-wide uppercase">受影响</p>
          <p className="text-2xl font-light tracking-tight">
            {summary.affectedNodes}<span className="text-sm text-muted-foreground font-normal">/{summary.totalNodes}</span>
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground tracking-wide uppercase">传播深度</p>
          <p className="text-2xl font-light tracking-tight">{summary.maxDepth}<span className="text-sm text-muted-foreground font-normal"> 层</span></p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground tracking-wide uppercase">平均风险</p>
          <p className={`text-2xl font-light tracking-tight ${riskText(summary.avgPropagatedRisk)}`}>
            {summary.avgPropagatedRisk}%
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground tracking-wide uppercase">产品</p>
          <p className="text-2xl font-light tracking-tight">{productCount}</p>
        </div>
        {summary.seirSummary && (
          <>
            <div>
              <p className="text-[11px] text-muted-foreground tracking-wide uppercase">传播峰值</p>
              <p className="text-2xl font-light tracking-tight">
                D+<span className="tabular-nums">{summary.seirSummary.peakDay}</span>
                <span className="text-sm text-muted-foreground font-normal"> ({summary.seirSummary.peakInfectious}节点)</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground tracking-wide uppercase">恢复周期</p>
              <p className="text-2xl font-light tracking-tight">
                {summary.seirSummary.recoveryHorizon}<span className="text-sm text-muted-foreground font-normal"> 天</span>
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Trigger Sources — minimal chips ── */}
      {sourceNodes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sourceNodes.map((s: SourceNode) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors hover:bg-accent/50"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${riskDot(s.riskScore)}`} />
              {s.label}
              <span className={`font-medium ${riskText(s.riskScore)}`}>{s.riskScore}%</span>
            </span>
          ))}
        </div>
      )}

      {/* ── Divider ── */}
      <div className="border-t" />

      {/* ── Accordion Sections ── */}
      <div className="space-y-0 divide-y">
        {/* Propagation Graph */}
        {propagation.length > 0 && (
          <Section title="传播路径" count={propagation.length} open={expanded === 'graph'} onToggle={() => toggle('graph')}>
            <RiskPropagationGraph
              sourceNodes={sourceNodes}
              propagation={propagation}
              maxDepth={summary.maxDepth}
            />
          </Section>
        )}

        {/* Top Products */}
        {summary.topAffectedProducts.length > 0 && (
          <Section title="受影响产品" count={summary.topAffectedProducts.length} open={expanded === 'products'} onToggle={() => toggle('products')}>
            <div className="space-y-1.5">
              {summary.topAffectedProducts.map((p: TopProduct, i: number) => (
                <div key={p.sku} className="flex items-center gap-3 py-2 group">
                  <span className="w-5 text-right text-xs text-muted-foreground/50 font-medium">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.productName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{p.propagationPath}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{p.estimatedDelay}d</span>
                    <span className="flex items-center gap-1 font-medium text-red-500"><DollarSign className="h-3 w-3" />{p.estimatedRevenueImpact.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Causal ML Counterfactuals (data-driven) */}
        {report.causalCounterfactuals && report.causalCounterfactuals.length > 0 && (
          <Section title="因果反事实" count={report.causalCounterfactuals.length} open={expanded === 'causal'} onToggle={() => toggle('causal')}>
            <div className="space-y-2">
              {report.causalCounterfactuals.map((cf: CausalCF, i: number) => (
                <div key={i} className="flex items-start gap-2.5 py-2 text-sm">
                  <span className="font-medium text-sm w-20 shrink-0">{cf.scenario}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground truncate">{cf.recommendation}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      ATE={cf.causalEstimate.ate.toFixed(2)} | n={cf.causalEstimate.sampleSize} | p={cf.causalEstimate.pValue.toFixed(3)}
                      {cf.isReliable && <span className="ml-1 text-emerald-500">✓可靠</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                      -{cf.improvement}%
                    </span>
                    <p className="text-[9px] text-muted-foreground/50 tabular-nums">
                      [{(cf.confidenceInterval[0] * 100).toFixed(0)}-{(cf.confidenceInterval[1] * 100).toFixed(0)}%]
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Counterfactuals (legacy) */}
        {report.counterfactuals && report.counterfactuals.length > 0 && (
          <Section title="反事实推演" count={report.counterfactuals.length} open={expanded === 'counter'} onToggle={() => toggle('counter')}>
            <div className="space-y-1.5">
              {report.counterfactuals.map((cf: CounterfactualResult, i: number) => (
                <div key={i} className="flex items-center gap-2.5 py-2 text-sm">
                  <span className="font-medium text-sm w-20 shrink-0">{cf.scenario}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                  <span className="text-sm text-muted-foreground flex-1 truncate">{cf.recommendation}</span>
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                    -{cf.improvement}%
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* 7-Day Projection */}
        {report.forwardProjection && report.forwardProjection.length > 0 && (
          <Section title="7 天预测" open={expanded === 'forecast'} onToggle={() => toggle('forecast')}>
            <div className="flex gap-1">
              {report.forwardProjection.map((day: DayProjection, i: number) => {
                const critical = day.inventoryDepletionRisk.filter((d: { riskLevel: string }) => d.riskLevel === 'critical').length;
                const warning = day.inventoryDepletionRisk.filter((d: { riskLevel: string }) => d.riskLevel === 'warning').length;
                const revenue = day.cumulativeRevenueImpact;
                return (
                  <div
                    key={i}
                    className="flex-1 min-w-[56px] text-center py-3 rounded-lg border transition-colors hover:bg-accent/30"
                  >
                    <p className="text-[10px] text-muted-foreground mb-1">
                      {i === 0 ? '今天' : i === 1 ? '明天' : `D+${i}`}
                    </p>
                    <div className="flex items-center justify-center gap-0.5 mb-1">
                      {critical > 0 && <span className="w-2 h-2 rounded-full bg-red-500" />}
                      {warning > 0 && !critical && <span className="w-2 h-2 rounded-full bg-yellow-400" />}
                      {!critical && !warning && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                    </div>
                    <p className="text-[10px] font-medium tabular-nums">
                      ${(revenue / 1000).toFixed(0)}k
                    </p>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* SEIR Epidemic Timeline */}
        {report.seirTimeline && report.seirTimeline.days.length > 0 && (
          <Section title="SEIR 传播动态" open={expanded === 'seir'} onToggle={() => toggle('seir')}>
            <div className="space-y-3">
              {/* Mini bar chart of SEIR states over time */}
              <div className="flex items-end gap-px h-16">
                {report.seirTimeline.days.map((d: SEIRDay, i: number) => {
                  const total = d.susceptible + d.exposed + d.infectious + d.recovered;
                  const iRatio = total > 0 ? d.infectious / total : 0;
                  const eRatio = total > 0 ? d.exposed / total : 0;
                  const rRatio = total > 0 ? d.recovered / total : 0;
                  return (
                    <div
                      key={i}
                      className="flex-1 min-w-[3px] max-w-[12px] flex flex-col-reverse rounded-t-sm overflow-hidden transition-opacity hover:opacity-100 opacity-80"
                      title={`D+${d.day}: S=${d.susceptible} E=${d.exposed} I=${d.infectious} R=${d.recovered}`}
                      style={{ height: '100%' }}
                    >
                      <div className="bg-emerald-400/70" style={{ height: `${rRatio * 100}%` }} />
                      <div className="bg-red-500/80" style={{ height: `${iRatio * 100}%` }} />
                      <div className="bg-orange-400/60" style={{ height: `${eRatio * 100}%` }} />
                      <div className="bg-blue-200/30 flex-1" />
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-200/60" />易感</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-400/60" />暴露</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500/80" />传播中</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400/70" />恢复</span>
              </div>
              {/* Key milestones */}
              <div className="flex gap-6 text-[10px] text-muted-foreground">
                <span>峰值: <strong className="text-foreground">D-{report.seirTimeline.peakDay}</strong> ({report.seirTimeline.peakInfectious}节点)</span>
                <span>恢复: <strong className="text-foreground">D-{report.seirTimeline.recoveryHorizon}</strong></span>
              </div>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

// ─── Section Component ─────────────────────────────────────────────────────────

function Section({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="py-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-left group"
      >
        <span className="text-sm font-medium">{title}</span>
        {count !== undefined && (
          <span className="text-[10px] text-muted-foreground/60 tabular-nums">{count}</span>
        )}
        <span className={`ml-auto text-muted-foreground/40 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
      </button>
      <div
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{
          maxHeight: open ? '2000px' : '0px',
          opacity: open ? 1 : 0,
          marginTop: open ? '12px' : '0px',
        }}
      >
        {children}
      </div>
    </div>
  );
}
