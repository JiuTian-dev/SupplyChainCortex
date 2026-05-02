'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Zap, Clock, Calendar, CheckCircle2, XCircle, ThumbsUp, ThumbsDown,
  ChevronRight, ExternalLink, MessageSquare, AlertTriangle, RefreshCw,
  TrendingDown, DollarSign, Target,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useDashboardConfigStore } from '@/stores/dashboard-config-store';
import { createMetricsFormatter } from '@/lib/dashboard/metrics';
import type { DecisionPassport, AlternativeOption } from '@/lib/engine';

interface DecisionItem {
  id: string;
  priority: 'immediate' | 'this_week' | 'this_month';
  title: string;
  description: string;
  reasoning: string;
  confidence: number;
  estimatedImpact: string;
  estimatedSaving: number;
  category: string;
  passport?: DecisionPassport;
}

type FeedbackState = 'none' | 'accepted' | 'rejected';

function DecisionCard({
  item, onFeedback, feedbackState, submitting,
}: {
  item: DecisionItem;
  onFeedback: (id: string, action: 'accepted' | 'rejected', notes?: string) => void;
  feedbackState: FeedbackState;
  submitting: boolean;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const config = useDashboardConfigStore(s => s.config);
  const m = createMetricsFormatter(config);

  const priorityConfig = {
    immediate: { icon: Zap, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-200 dark:border-red-800', label: '立即执行' },
    this_week: { icon: Clock, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/20', border: 'border-orange-200 dark:border-orange-800', label: '本周内' },
    this_month: { icon: Calendar, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/20', border: 'border-blue-200 dark:border-blue-800', label: '本月内' },
  };

  const p = priorityConfig[item.priority];
  const Icon = p.icon;

  const confidenceLabel = item.confidence >= 0.9 ? '高置信' : item.confidence >= 0.7 ? '中置信' : '低置信';
  const confidenceColor = item.confidence >= 0.9 ? 'text-green-600' : item.confidence >= 0.7 ? 'text-yellow-600' : 'text-red-600';

  return (
    <Card className={`border-l-4 ${p.border} hover:shadow-md transition-shadow`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-full ${p.bg} flex items-center justify-center`}>
              <Icon className={`h-4 w-4 ${p.color}`} />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">{item.title}</CardTitle>
              <CardDescription className="text-xs">{item.category} · {p.label}</CardDescription>
            </div>
          </div>
          {feedbackState !== 'none' ? (
            <Badge variant={feedbackState === 'accepted' ? 'default' : 'secondary'} className={`text-[10px] ${feedbackState === 'accepted' ? 'bg-green-100 text-green-700 dark:bg-green-950/20 dark:text-green-400' : 'bg-gray-100 text-gray-600'}`}>
              {feedbackState === 'accepted' ? <><CheckCircle2 className="h-3 w-3 mr-1" />已采纳</> : <><XCircle className="h-3 w-3 mr-1" />已忽略</>}
            </Badge>
          ) : (
            <Badge variant="outline" className={`text-[10px] ${confidenceColor}`}>{confidenceLabel}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{item.description}</p>

        {/* Reasoning chain */}
        <div className="bg-muted/50 rounded-lg p-2.5 text-xs space-y-1.5">
          <div className="flex items-center gap-1 text-muted-foreground"><Target className="h-3 w-3" />推理链</div>
          <p className="text-xs">{item.reasoning}</p>
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span>置信度: {(item.confidence * 100).toFixed(0)}%</span>
            <span className="flex items-center gap-1"><DollarSign className="h-2.5 w-2.5" />预估节省: {m.formatCurrency(item.estimatedSaving)}</span>
          </div>
        </div>

        {/* Feedback actions */}
        {feedbackState === 'none' && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400"
              disabled={submitting}
              onClick={() => {
                onFeedback(item.id, 'accepted', notes || undefined);
                toast.success(`已采纳决策: ${item.title}`);
              }}
            >
              <ThumbsUp className="h-3 w-3" />采纳
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400"
              disabled={submitting}
              onClick={() => setShowNotes(!showNotes)}
            >
              <ThumbsDown className="h-3 w-3" />忽略
            </Button>
            {showNotes && (
              <div className="flex items-center gap-1">
                <Textarea
                  placeholder="忽略原因..."
                  className="h-7 text-xs min-h-0 py-1 px-2 w-32"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-red-500"
                  disabled={submitting}
                  onClick={() => {
                    onFeedback(item.id, 'rejected', notes || undefined);
                    setShowNotes(false);
                    toast.success('已记录反馈');
                  }}
                >
                  确认
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Passport link */}
        {item.passport && (
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <ExternalLink className="h-2.5 w-2.5" />
            审计 ID: {item.passport.auditId.slice(0, 20)}...
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main DecisionCenter Component ──────────────────────────────────────────────

export function DecisionCenter() {
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, FeedbackState>>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchDecisions = useCallback(async () => {
    try {
      const [cascadeRes] = await Promise.all([
        fetch('/api/cascade-risk?scenario=auto&includeForwardProjection=true&includeCounterfactuals=true'),
      ]);
      const risk = await cascadeRes.json();
      if (!risk?.success && !risk?.summary) return;

      const passport = risk.passport;
      const items: DecisionItem[] = [];

      // Generate decisions from cascade risk report
      const topRisks = risk.propagation?.filter((p: any) => p.riskScore > 30).slice(0, 5) ?? [];
      const counterfactuals = risk.counterfactuals ?? [];

      topRisks.forEach((r: any, i: number) => {
        const cf = counterfactuals[i];
        items.push({
          id: `dec-${r.nodeId || i}`,
          priority: r.riskScore >= 70 ? 'immediate' : r.riskScore >= 50 ? 'this_week' : 'this_month',
          title: r.label || `风险节点 #${i + 1}`,
          description: `传播深度 ${r.path?.length ?? '?'} 层，${r.explanation ?? '需关注风险传播'}`,
          reasoning: `衰减系数 ${r.attenuation?.toFixed(2) ?? '?'}，传播风险 ${r.propagatedRisk ?? '?'}%`,
          confidence: passport?.confidence ?? 0.7,
          estimatedImpact: cf?.expectedImpact ?? '暂无预估',
          estimatedSaving: (cf?.riskReduction ?? 0.3) * 50000,
          category: r.type ?? 'PRODUCT',
          passport,
        });
      });

      // Add counterfactual-based decisions
      counterfactuals.slice(0, 3).forEach((cf: any, i: number) => {
        items.push({
          id: `cf-${i}`,
          priority: cf.riskReduction > 0.5 ? 'immediate' : 'this_week',
          title: cf.name || cf.question || `替代方案 #${i + 1}`,
          description: cf.recommendation || cf.originalOutcome || '',
          reasoning: `风险降低 ${(cf.riskReduction * 100).toFixed(0)}%`,
          confidence: cf.riskReduction ?? 0.5,
          estimatedImpact: `可降低风险 ${(cf.riskReduction * 100).toFixed(0)}%`,
          estimatedSaving: (cf.riskReduction ?? 0.3) * 80000,
          category: '反事实分析',
          passport,
        });
      });

      // Deduplicate by id
      const seen = new Set<string>();
      setDecisions(items.filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }));
    } catch {
      // Degraded — show empty state
    }
  }, []);

  useEffect(() => { fetchDecisions(); }, [fetchDecisions]);

  const handleFeedback = useCallback(async (id: string, action: 'accepted' | 'rejected', notes?: string) => {
    setSubmitting(true);
    try {
      const item = decisions.find(d => d.id === id);
      await fetch('/api/engine-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditId: item?.passport?.auditId ?? id,
          engine: item?.passport?.engine ?? 'cascade-risk',
          action,
          userNotes: notes,
          tags: [item?.category ?? '', item?.priority ?? ''],
        }),
      });
      setFeedbackMap(prev => ({ ...prev, [id]: action }));
    } catch {
      toast.error('反馈提交失败，请重试');
    }
    setSubmitting(false);
  }, [decisions]);

  const immediateItems = decisions.filter(d => d.priority === 'immediate');
  const weekItems = decisions.filter(d => d.priority === 'this_week');
  const monthItems = decisions.filter(d => d.priority === 'this_month');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">决策执行中心</h2>
          <p className="text-xs text-muted-foreground">基于级联风险分析生成的可执行决策建议</p>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={fetchDecisions}>
          <RefreshCw className="h-3 w-3 mr-1" />刷新决策
        </Button>
      </div>

      {decisions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Target className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">正在加载决策建议...</p>
            <p className="text-xs text-muted-foreground mt-1">决策引擎基于实时风险数据生成可执行方案</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Immediate */}
          {immediateItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">立即执行 ({immediateItems.length})</h3>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {immediateItems.map(item => (
                  <DecisionCard
                    key={item.id}
                    item={item}
                    onFeedback={handleFeedback}
                    feedbackState={feedbackMap[item.id] || 'none'}
                    submitting={submitting}
                  />
                ))}
              </div>
            </div>
          )}

          {/* This Week */}
          {weekItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-500" />
                <h3 className="text-sm font-semibold text-orange-600 dark:text-orange-400">本周内 ({weekItems.length})</h3>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {weekItems.map(item => (
                  <DecisionCard
                    key={item.id}
                    item={item}
                    onFeedback={handleFeedback}
                    feedbackState={feedbackMap[item.id] || 'none'}
                    submitting={submitting}
                  />
                ))}
              </div>
            </div>
          )}

          {/* This Month */}
          {monthItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-blue-600 dark:text-blue-400">本月内 ({monthItems.length})</h3>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {monthItems.map(item => (
                  <DecisionCard
                    key={item.id}
                    item={item}
                    onFeedback={handleFeedback}
                    feedbackState={feedbackMap[item.id] || 'none'}
                    submitting={submitting}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
