'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { CausalGraph } from './CausalGraph';
import { ReplayPanel } from './ReplayPanel';
import { ComplianceReport } from './ComplianceReport';

interface TraceDetailData {
  id: string;
  auditId: string;
  userQuery: string;
  intent: string;
  confidence: number;
  durationMs: number;
  toolsUsed: string[];
  claimsCount: number;
  createdAt: string;
  steps: Array<{
    id: string;
    stepIndex: number;
    state: string;
    confidence: number | null;
    findings: string | null;
    nextState: string | null;
    toolCalls: Array<{
      toolName: string;
      params: Record<string, unknown>;
      result: unknown;
      success: boolean;
      latencyMs: number;
      error?: string;
    }>;
    claims: Array<{
      claimIndex: number;
      text: string;
      source: string;
      confidence: string;
    }>;
  }>;
}

const STATE_LABELS: Record<string, string> = {
  classify: '分类', plan: '规划', execute: '执行',
  observe: '观察', decide: '决策', synthesize: '合成',
};

const STATE_COLORS: Record<string, string> = {
  classify: '#8b5cf6', plan: '#3b82f6', execute: '#10b981',
  observe: '#f59e0b', decide: '#ef4444', synthesize: '#06b6d4',
};

export function TraceDetail({ traceId }: { traceId: string }) {
  const [trace, setTrace] = useState<TraceDetailData | null>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/audit/traces/${traceId}`)
      .then(r => r.json())
      .then(d => { if (d.success) setTrace(d.data); });
  }, [traceId]);

  if (!trace) return <div className="p-8 text-center text-muted-foreground">加载中...</div>;

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-1">{trace.userQuery}</h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{trace.intent}</Badge>
          <span>置信度: {(trace.confidence * 100).toFixed(0)}%</span>
          <span>耗时: {(trace.durationMs / 1000).toFixed(1)}s</span>
          <span>工具: {trace.toolsUsed.join(', ') || '无'}</span>
          <span>{new Date(trace.createdAt).toLocaleString('zh-CN')}</span>
        </div>
      </div>

      {/* Causal Graph */}
      <div className="mb-6 border rounded-lg p-4 bg-muted/30">
        <h3 className="text-sm font-semibold mb-3">因果链路图</h3>
        <CausalGraph steps={trace.steps} expandedStep={expandedStep} onExpand={setExpandedStep} />
      </div>

      {/* Step list */}
      <h3 className="text-sm font-semibold mb-3">决策步骤</h3>
      <div className="space-y-2">
        {trace.steps.map(step => (
          <div
            key={step.id}
            className="border rounded-lg p-3 cursor-pointer hover:bg-accent transition-colors"
            onClick={() => setExpandedStep(expandedStep === step.stepIndex ? null : step.stepIndex)}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: STATE_COLORS[step.state] || '#999' }}
              />
              <span className="font-medium text-sm">{STATE_LABELS[step.state] || step.state}</span>
              <span className="text-xs text-muted-foreground">Step {step.stepIndex}</span>
              {step.nextState && (
                <span className="text-xs text-muted-foreground">→ {STATE_LABELS[step.nextState] || step.nextState}</span>
              )}
            </div>

            {step.findings && (
              <p className="text-xs text-muted-foreground mt-1">{step.findings}</p>
            )}

            {/* Expanded detail */}
            {expandedStep === step.stepIndex && (
              <div className="mt-3 space-y-2 border-t pt-2">
                {/* Tool calls */}
                {step.toolCalls.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-1">工具调用:</p>
                    {step.toolCalls.map((tc, i) => (
                      <div key={i} className="bg-muted rounded p-2 text-xs mb-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold">{tc.toolName}</span>
                          <span className={tc.success ? 'text-green-600' : 'text-red-600'}>
                            {tc.success ? `✅ ${tc.latencyMs}ms` : `❌ ${tc.error}`}
                          </span>
                        </div>
                        {tc.result ? (
                          <pre className="mt-1 text-[10px] text-muted-foreground overflow-x-auto max-h-32">
                            {JSON.stringify(tc.result, null, 2)?.slice(0, 500) ?? ''}
                          </pre>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}

                {/* Claims */}
                {step.claims.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-1">声明溯源:</p>
                    {step.claims.map(c => (
                      <div key={c.claimIndex} className="flex items-start gap-2 text-xs mb-1">
                        <span className={`shrink-0 px-1 rounded text-[10px] ${
                          c.confidence === 'high' ? 'bg-green-100 text-green-700' :
                          c.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          [{c.source}]
                        </span>
                        <span>[claim-{c.claimIndex}] {c.text.slice(0, 200)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Replay */}
      <div className="mt-6 border rounded-lg p-4">
        <ReplayPanel traceId={traceId} steps={trace.steps} />
      </div>

      {/* Compliance Report */}
      <div className="mt-4 border rounded-lg p-4">
        <ComplianceReport />
      </div>
    </div>
  );
}
