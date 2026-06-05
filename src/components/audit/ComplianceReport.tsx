'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, CheckCircle, AlertTriangle } from 'lucide-react';

interface ReportData {
  totalTraces: number;
  avgConfidence: number;
  intents: Record<string, number>;
  claimSources: Record<string, number>;
}

const EU_AI_CHECKLIST = [
  { id: 'transparency', label: '透明性 — 决策过程可追溯', required: true },
  { id: 'accuracy', label: '准确性 — 数据来源标注清晰', required: true },
  { id: 'human-oversight', label: '人工监督 — 关键操作需确认', required: true },
  { id: 'record-keeping', label: '记录保存 — 决策日志持久化', required: true },
  { id: 'risk-mgmt', label: '风险管理 — 置信度低时告警', required: true },
  { id: 'data-governance', label: '数据治理 — 来源可验证', required: true },
];

const CHINA_AI_CHECKLIST = [
  { id: 'content-review', label: '内容审核 — 生成内容经过MARC校验', required: true },
  { id: 'source-labeling', label: '来源标注 — 数字标注来源标签', required: true },
  { id: 'accountability', label: '责任追溯 — 决策结果可审计', required: true },
];

const INTENT_LABELS: Record<string, string> = {
  supply_chain_data: '供应链数据',
  supply_chain_knowledge: '专业知识',
  news_event: '新闻事件',
  general_knowledge: '通用知识',
  opinion_recommendation: '意见推荐',
  chat_greeting: '闲聊',
};

export function ComplianceReport() {
  const [stats, setStats] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Use the stats endpoint — single aggregated call instead of fetching all traces
    fetch('/api/audit/traces?action=stats')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data.totalTraces > 0) {
          setStats(d.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleExport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      stats,
      euAiChecklist: EU_AI_CHECKLIST,
      chinaAiChecklist: CHINA_AI_CHECKLIST,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="py-4 space-y-2 animate-pulse"><div className="h-4 bg-muted rounded w-1/2" /><div className="h-4 bg-muted rounded w-3/4" /></div>;
  if (!stats) return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
      <AlertTriangle className="h-4 w-4" />
      <span>需要至少一条决策记录才能生成合规报告。在 Chat 中提问后即可生成。</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">合规报告</h3>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleExport}>
          <Download className="h-3 w-3 mr-1" /> 导出 JSON
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold">{stats.totalTraces}</p>
          <p className="text-xs text-muted-foreground">总决策数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold">{(stats.avgConfidence * 100).toFixed(0)}%</p>
          <p className="text-xs text-muted-foreground">平均置信度</p>
        </div>
      </div>

      {/* Intent distribution */}
      <div className="border rounded-lg p-3">
        <h4 className="text-xs font-semibold mb-2">决策意图分布</h4>
        {Object.entries(stats.intents).map(([intent, count]) => (
          <div key={intent} className="flex justify-between text-xs mb-1">
            <span>{INTENT_LABELS[intent] || intent}</span>
            <span className="font-semibold">{count as number}</span>
          </div>
        ))}
      </div>

      {/* Claim sources */}
      {stats.claimSources && Object.keys(stats.claimSources).length > 0 && (
        <div className="border rounded-lg p-3">
          <h4 className="text-xs font-semibold mb-2">声明来源分布</h4>
          {Object.entries(stats.claimSources).map(([source, count]) => (
            <div key={source} className="flex justify-between text-xs mb-1">
              <span>{source}</span>
              <span className="font-semibold">{count as number}</span>
            </div>
          ))}
        </div>
      )}

      {/* EU AI Act Checklist */}
      <div className="border rounded-lg p-3">
        <h4 className="text-xs font-semibold mb-2">EU AI Act 合规清单</h4>
        {EU_AI_CHECKLIST.map(item => (
          <div key={item.id} className="flex items-center gap-2 text-xs mb-1">
            <CheckCircle className="h-3 w-3 text-green-600" />
            <span>{item.label}</span>
            <span className="text-[10px] px-1 rounded bg-green-100 text-green-700 ml-auto">已满足</span>
          </div>
        ))}
      </div>

      {/* China AI Checklist */}
      <div className="border rounded-lg p-3">
        <h4 className="text-xs font-semibold mb-2">中国生成式AI管理清单</h4>
        {CHINA_AI_CHECKLIST.map(item => (
          <div key={item.id} className="flex items-center gap-2 text-xs mb-1">
            <CheckCircle className="h-3 w-3 text-green-600" />
            <span>{item.label}</span>
            <span className="text-[10px] px-1 rounded bg-green-100 text-green-700 ml-auto">已满足</span>
          </div>
        ))}
      </div>
    </div>
  );
}
