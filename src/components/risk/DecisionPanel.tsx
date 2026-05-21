'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useCascadeRisk } from '@/hooks/use-cascade-risk';
import {
  Lightbulb, ArrowRight, TrendingUp, Shield, Zap, DollarSign,
  Clock, Package, Building2, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DecisionOutcome {
  id: string; action: string; reasoning: string; confidence: number;
  urgency: 'immediate' | 'this_week' | 'this_month' | 'monitor';
  impact: { estimatedSaving: number; riskReduction: number; timeline: string; effort: string };
  followUpDecisions: string[];
  fallbackAction?: string;
}

interface DecisionPath {
  nodeId: string; question: string; matchedCondition: string; outcome: DecisionOutcome;
  analysisData: Record<string, unknown>;
}

interface ActionItem {
  priority: number; action: string; domain: string; urgency: string;
  reasoning: string; estimatedImpact: string;
}

interface DecisionReport {
  triggeredBy: { query: string; domain: string; timestamp: string };
  context: { exchangeRates?: { rate: number; deviation: number }; weatherAlerts?: number };
  decisions: DecisionPath[];
  summary: {
    totalDecisions: number; urgentActions: number; thisWeekActions: number;
    estimatedTotalSaving: number; estimatedTotalRiskReduction: number;
    executiveSummary: string;
  };
  actionPlan: ActionItem[];
}

const urgencyIcon: Record<string, React.ReactNode> = {
  immediate: <AlertTriangle className="h-3.5 w-3.5 text-red-500" />,
  this_week: <Clock className="h-3.5 w-3.5 text-yellow-500" />,
  this_month: <Clock className="h-3.5 w-3.5 text-blue-500" />,
  monitor: <Shield className="h-3.5 w-3.5 text-green-500" />,
};

const urgencyBadge: Record<string, string> = {
  immediate: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  this_week: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  this_month: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  monitor: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};

const domainLabel: Record<string, string> = {
  inventory: '库存', cost: '成本', logistics: '物流',
  supplier: '供应商', cross_domain: '综合',
};

export function DecisionPanel() {
  const [report, setReport] = useState<DecisionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [domain, setDomain] = useState('cross_domain');

  // Reuse shared cascade risk hook — avoids duplicate API call
  const { data: cascadeReport } = useCascadeRisk('auto');

  const fetchDecisions = (dom?: string) => {
    setLoading(true);
    setError(false);
    const doms = dom || domain;
    fetch(`/api/decision-graph?domains=${doms}&query=自动检测供应链状态`)
      .then(res => { if (!res.ok) throw new Error('Failed'); return res.json(); })
      .then(data => { setReport(data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => {
    setLoading(false);
  }, []);

  // Fetch decisions when cascade report is ready
  const initRef = useRef(false);
  useEffect(() => {
    if (!cascadeReport || initRef.current) return;
    initRef.current = true;
    let cancelled = false;
    fetch(`/api/decision-graph?domains=cross_domain&query=自动检测供应链状态`)
      .then(res => { if (!res.ok) throw new Error('Failed'); return res.json(); })
      .then(data => { if (!cancelled) { setReport(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [cascadeReport]);

  if (loading && !report) {
    return (
      <Card className="card-dashboard border-amber-200 dark:border-amber-900">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-48 bg-muted rounded animate-pulse" />
              <div className="h-3 w-64 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !report) {
    return (
      <Card className="card-dashboard border-amber-200 dark:border-amber-900">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            <span className="text-sm text-muted-foreground">决策引擎暂时不可用</span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => fetchDecisions()}>
              <RefreshCw className="h-3 w-3 mr-1" />重试
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!report) return null;

  const { summary, actionPlan, context } = report;
  const hasUrgent = summary.urgentActions > 0;

  return (
    <Card className={`card-dashboard ${hasUrgent ? 'border-red-300 dark:border-red-800' : 'border-amber-200 dark:border-amber-900'}`}>
      <CardHeader className={`pb-2 ${hasUrgent ? 'bg-red-50/50 dark:bg-red-950/20' : 'bg-amber-50/30 dark:bg-amber-950/10'}`}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Lightbulb className={`h-4 w-4 ${hasUrgent ? 'text-red-500' : 'text-amber-500'}`} />
              决策建议
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] gap-1">
                <Zap className="h-2.5 w-2.5" />
                AI 决策引擎
              </Badge>
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Select value={domain} onValueChange={(v) => { setDomain(v); fetchDecisions(v); }}>
              <SelectTrigger className="h-7 text-xs w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cross_domain">综合风险</SelectItem>
                <SelectItem value="inventory">库存决策</SelectItem>
                <SelectItem value="cost">成本/汇率</SelectItem>
                <SelectItem value="logistics">物流延误</SelectItem>
              </SelectContent>
            </Select>
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => fetchDecisions()} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        {/* Quick context bar */}
        <div className="flex flex-wrap gap-2 mb-3 text-[10px] text-muted-foreground">
          {context.exchangeRates && (
            <span className="px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/30">
              USD {context.exchangeRates.rate} CNY ({context.exchangeRates.deviation}%偏离)
            </span>
          )}
          {context.weatherAlerts !== undefined && (
            <span className="px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/30">
              天气警报 {context.weatherAlerts > 0 ? `🔴 ${context.weatherAlerts}个港口` : '✅ 无'}
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/30">
            节省预估: ${summary.estimatedTotalSaving.toLocaleString()}
          </span>
        </div>

        {/* Action Plan - Decision-maker's priority list */}
        {actionPlan.length > 0 ? (
          <div className="space-y-2">
            {actionPlan.map((item) => (
              <div
                key={`${item.priority}-${item.domain}`}
                className={`flex items-start gap-3 rounded-lg border p-3 transition-all duration-200 hover:shadow-sm ${
                  item.urgency.includes('立即') ? 'border-red-200 dark:border-red-800 bg-red-50/20 dark:bg-red-950/10' : 'border-border bg-card'
                }`}
              >
                <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  item.priority <= 2 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                }`}>
                  {item.priority}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge className={`text-[9px] ${urgencyBadge[item.urgency.includes('立即') ? 'immediate' : item.urgency.includes('本周') ? 'this_week' : 'this_month']}`}>
                      {urgencyIcon[item.urgency.includes('立即') ? 'immediate' : item.urgency.includes('本周') ? 'this_week' : 'this_month']}
                      {item.urgency}
                    </Badge>
                    <Badge variant="outline" className="text-[9px]">{domainLabel[item.domain] || item.domain}</Badge>
                  </div>
                  <p className="text-sm font-semibold">{item.action}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{item.reasoning}</p>
                </div>

                <div className="text-right shrink-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 justify-end">
                    <TrendingUp className="h-3 w-3 text-emerald-500" />
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{item.estimatedImpact}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Shield className="h-4 w-4 mr-2 text-green-500" />
            ✅ 当前供应链运行正常，所有指标在安全范围内
          </div>
        )}

        {/* Footer metrics */}
        <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground border-t pt-2">
          <span>⚡ {summary.urgentActions} 项立即行动</span>
          <span>📅 {summary.thisWeekActions} 项本周内</span>
          <span>💰 预计节省 ${summary.estimatedTotalSaving.toLocaleString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}
