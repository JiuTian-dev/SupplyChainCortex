'use client';

import { useState, useCallback } from 'react';
import { Check, X, Loader2, Shield, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface ConfirmationCardData {
  title: string;
  description: string;
  toolName: string;
  params: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high';
  confirmLabel: string;
  cancelLabel: string;
}

export interface ActionCardState {
  card: ConfirmationCardData;
  status: 'pending' | 'executing' | 'executed' | 'cancelled' | 'error';
  result?: string;
  error?: string;
}

// ─── ActionCard Component ─────────────────────────────────────────────────────────

interface ActionCardProps {
  card: ConfirmationCardData;
  msgId: string;
  onExecuted?: (result: string) => void;
}

export function ActionCard({ card, msgId, onExecuted }: ActionCardProps) {
  const [status, setStatus] = useState<ActionCardState['status']>('pending');
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');

  const riskColors: Record<string, string> = {
    low: 'border-l-blue-400 bg-blue-50/30 dark:bg-blue-950/10',
    medium: 'border-l-amber-400 bg-amber-50/30 dark:bg-amber-950/10',
    high: 'border-l-red-400 bg-red-50/30 dark:bg-red-950/10',
  };

  const riskIcons: Record<string, React.ReactNode> = {
    low: <Shield className="h-4 w-4 text-blue-500" />,
    medium: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    high: <AlertTriangle className="h-4 w-4 text-red-500" />,
  };

  const handleConfirm = useCallback(async () => {
    setStatus('executing');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `执行操作: ${card.toolName} ${JSON.stringify(card.params)}`,
          stream: false,
          executeConfirmed: { toolName: card.toolName, params: card.params },
        }),
      });

      const data = await res.json();
      if (data.success) {
        const execResult = data.data?.reply || '操作已执行';
        setResult(execResult);
        setStatus('executed');
        onExecuted?.(execResult);
        toast.success(`${card.toolName} 执行成功`);
      } else {
        setError(data.error || '执行失败');
        setStatus('error');
        toast.error(`执行失败: ${data.error}`);
      }
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
      toast.error('网络错误');
    }
  }, [card, onExecuted]);

  const handleCancel = useCallback(() => {
    setStatus('cancelled');
    toast.info('操作已取消');
  }, []);

  if (status === 'cancelled') {
    return (
      <Card className="border-dashed opacity-60">
        <CardContent className="p-3 text-xs text-muted-foreground flex items-center gap-2">
          <X className="h-3 w-3" /> 已取消: {card.title}
        </CardContent>
      </Card>
    );
  }

  if (status === 'executed') {
    return (
      <Card className="border-emerald-200 dark:border-emerald-800">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Check className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">已执行: {card.title}</span>
          </div>
          {result && <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{result.slice(0, 500)}</p>}
        </CardContent>
      </Card>
    );
  }

  if (status === 'error') {
    return (
      <Card className="border-red-200 dark:border-red-800">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <X className="h-4 w-4 text-red-500" />
            <span className="text-xs font-medium text-red-700 dark:text-red-400">执行失败: {card.title}</span>
          </div>
          {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-l-4 ${riskColors[card.riskLevel]} animate-in fade-in slide-in-from-left-2`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          {riskIcons[card.riskLevel]}
          <div>
            <p className="text-sm font-medium">{card.title}</p>
            <p className="text-[11px] text-muted-foreground">{card.description.slice(0, 200)}</p>
          </div>
        </div>

        {status === 'executing' ? (
          <Button size="sm" disabled className="w-full h-8 text-xs gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> 执行中...
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-8 text-xs gap-1 bg-emerald-500 hover:bg-emerald-600"
              onClick={handleConfirm}
            >
              <Check className="h-3 w-3" /> {card.confirmLabel}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs gap-1"
              onClick={handleCancel}
            >
              <X className="h-3 w-3" /> {card.cancelLabel}
            </Button>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          工具: {card.toolName} · 风险: {card.riskLevel === 'low' ? '低' : card.riskLevel === 'medium' ? '中' : '高'}
        </p>
      </CardContent>
    </Card>
  );
}
