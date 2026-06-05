'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Loader2 } from 'lucide-react';

interface TraceStep {
  id: string;
  stepIndex: number;
  state: string;
  toolCalls: Array<{ toolName: string; params: Record<string, unknown> }>;
}

interface ReplayDiff {
  claimsChanged: number;
  confidenceDelta: number;
  newToolsUsed: string[];
  originalClaims: number;
  replayedClaims: number;
  originalConfidence: number;
  replayedConfidence: number;
}

const STATE_LABELS: Record<string, string> = {
  classify: '分类', plan: '规划', execute: '执行',
  observe: '观察', decide: '决策', synthesize: '合成',
};

export function ReplayPanel({ traceId, steps, prefillNode, onClearPrefill }: {
  traceId: string;
  steps: TraceStep[];
  prefillNode?: { stepIndex: number; state: string; findings: string | null; toolCalls: Array<{ toolName: string; params: Record<string, unknown>; success: boolean }> } | null;
  onClearPrefill?: () => void;
}) {
  const [modifications, setModifications] = useState<Array<{ toolName: string; paramsStr: string }>>([]);
  const [running, setRunning] = useState(false);
  const [diff, setDiff] = useState<ReplayDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from CausalGraph node selection
  useEffect(() => {
    if (prefillNode && prefillNode.toolCalls.length > 0) {
      const newMods = prefillNode.toolCalls.map(tc => ({
        toolName: tc.toolName,
        paramsStr: JSON.stringify(tc.params, null, 2),
      }));
      setModifications(newMods);
    }
  }, [prefillNode]);

  const executeSteps = steps.filter(s => s.toolCalls.length > 0);

  const addModification = (toolName: string, params: Record<string, unknown>) => {
    setModifications(prev => [...prev, { toolName, paramsStr: JSON.stringify(params, null, 2) }]);
  };

  const updateParams = (index: number, paramsStr: string) => {
    setModifications(prev => prev.map((m, i) => i === index ? { ...m, paramsStr } : m));
  };

  const removeModification = (index: number) => {
    setModifications(prev => prev.filter((_, i) => i !== index));
  };

  const handleReplay = async () => {
    setRunning(true);
    setError(null);
    try {
      const parsed = modifications.map(m => ({ toolName: m.toolName, newParams: JSON.parse(m.paramsStr) }));
      const res = await fetch(`/api/audit/traces/${traceId}/replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modifications: parsed }),
      });
      const data = await res.json();
      if (data.success) {
        setDiff(data.data.diff);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      {prefillNode && (
        <div className="flex items-center justify-between bg-blue-50 rounded-lg p-2 mb-2">
          <span className="text-xs text-blue-700">
            回放源: Step {prefillNode.stepIndex} — {prefillNode.state}
            {prefillNode.findings && ` (${prefillNode.findings.slice(0, 60)})`}
          </span>
          <Button variant="ghost" size="sm" className="h-5 text-xs" onClick={onClearPrefill}>清除</Button>
        </div>
      )}
      <h3 className="text-sm font-semibold">反事实回放</h3>
      <p className="text-xs text-muted-foreground">
        修改工具参数，重新执行并对比结果差异，评估决策敏感性。
      </p>

      {/* Available tools */}
      {executeSteps.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-2">此决策流程中没有工具调用步骤，无法进行回放。</p>
      )}
      {executeSteps.map(step => (
        <div key={step.stepIndex} className="border rounded-lg p-3">
          <p className="text-xs font-semibold mb-2">Step {step.stepIndex} — {STATE_LABELS[step.state] || step.state}</p>
          {step.toolCalls.map((tc, i) => (
            <div key={i} className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono">{tc.toolName}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                onClick={() => addModification(tc.toolName, tc.params)}
              >
                修改参数
              </Button>
            </div>
          ))}
        </div>
      ))}

      {/* Modifications */}
      {modifications.map((mod, i) => (
        <div key={i} className="border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-semibold">{mod.toolName}</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs text-red-500" onClick={() => removeModification(i)}>
              删除
            </Button>
          </div>
          <textarea
            className="w-full h-24 text-xs font-mono p-2 border rounded"
            value={mod.paramsStr}
            onChange={e => updateParams(i, e.target.value)}
          />
        </div>
      ))}

      {modifications.length > 0 && (
        <Button onClick={handleReplay} disabled={running} className="w-full">
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          执行回放
        </Button>
      )}

      {error && <p className="text-xs text-red-500">错误: {error}</p>}

      {/* Diff result */}
      {diff && (
        <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
          <h4 className="text-xs font-semibold">回放对比</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 bg-white rounded">
              <p className="font-semibold">原始</p>
              <p>声明: {diff.originalClaims}</p>
              <p>置信度: {(diff.originalConfidence * 100).toFixed(0)}%</p>
            </div>
            <div className="p-2 bg-white rounded">
              <p className="font-semibold">回放</p>
              <p>声明: {diff.replayedClaims}</p>
              <p>置信度: {(diff.replayedConfidence * 100).toFixed(0)}%</p>
            </div>
          </div>
          <div className="text-xs">
            <p>声明变化: <span className={diff.claimsChanged > 0 ? 'text-orange-600' : 'text-green-600'}>±{diff.claimsChanged}</span></p>
            <p>置信度变化: <span className={diff.confidenceDelta > 0 ? 'text-green-600' : diff.confidenceDelta < 0 ? 'text-red-600' : ''}>{diff.confidenceDelta > 0 ? '+' : ''}{diff.confidenceDelta.toFixed(2)}</span></p>
            <p>新工具: {diff.newToolsUsed.join(', ')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
