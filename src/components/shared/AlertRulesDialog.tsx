'use client';

import { useState, useEffect } from 'react';
import { Settings2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useUIStore } from '@/stores/ui-store';
import { DEFAULT_ALERT_RULES } from '@/lib/constants';
import type { AlertRule } from '@/lib/types';
import { toast } from 'sonner';

export function AlertRulesDialog() {
  const alertRulesOpen = useUIStore((s) => s.alertRulesOpen);
  const setAlertRulesOpen = useUIStore((s) => s.setAlertRulesOpen);

  const [alertRules, setAlertRules] = useState<AlertRule[]>(DEFAULT_ALERT_RULES);

  // Fetch alert rules from API on mount
  useEffect(() => {
    fetch('/api/alert-rules')
      .then((r) => r.json())
      .then((data) => {
        if (data.rules && data.rules.length > 0) {
          setAlertRules(
            data.rules.map((r: Record<string, unknown>) => ({
              id: r.ruleId as string,
              name: r.name as string,
              field: r.field as string,
              operator: r.operator as string,
              threshold: r.threshold as number,
              unit: r.unit as string,
              enabled: r.enabled as boolean,
              severity: r.severity as string,
            }))
          );
        }
      })
      .catch((err) => { if (process.env.NODE_ENV === 'development') console.error('获取预警规则失败:', err); });
  }, []);

  return (
    <Dialog open={alertRulesOpen} onOpenChange={setAlertRulesOpen}>
      <DialogContent className="sm:max-w-lg backdrop-blur-sm border shadow-2xl dialog-scale-in">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-orange-500" />
            预警规则配置
          </DialogTitle>
          <DialogDescription>配置各模块预警阈值和开关状态</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {alertRules.map((rule) => {
            const severityBg =
              rule.severity === 'critical'
                ? 'bg-red-50 dark:bg-red-950/30'
                : 'bg-yellow-50 dark:bg-yellow-950/30';
            const severityBorder =
              rule.severity === 'critical'
                ? 'border-red-200 dark:border-red-800'
                : 'border-yellow-200 dark:border-yellow-800';
            const severityBadge: 'destructive' | 'secondary' =
              rule.severity === 'critical' ? 'destructive' : 'secondary';

            return (
              <div
                key={rule.id}
                className={`rounded-xl border p-4 ${severityBg} ${severityBorder} transition-all`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">
                        {rule.name}
                      </span>
                      <Badge variant={severityBadge} className="text-[10px]">
                        {rule.severity === 'critical' ? '严重' : '警告'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      当 {rule.field} {rule.operator} 阈值时触发预警
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setAlertRules((prev) =>
                        prev.map((r) =>
                          r.id === rule.id
                            ? { ...r, enabled: !r.enabled }
                            : r
                        )
                      )
                    }
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      rule.enabled
                        ? 'bg-green-500'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                    aria-label={`切换 ${rule.name}`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        rule.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <span className="text-xs text-muted-foreground">阈值:</span>
                  <Input
                    type="number"
                    value={rule.threshold}
                    onChange={(e) =>
                      setAlertRules((prev) =>
                        prev.map((r) =>
                          r.id === rule.id
                            ? { ...r, threshold: parseFloat(e.target.value) || 0 }
                            : r
                        )
                      )
                    }
                    className="h-7 w-20 text-xs"
                    step="any"
                  />
                  <span className="text-xs text-muted-foreground">
                    {rule.unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAlertRulesOpen(false)}
          >
            取消
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              try {
                const res = await fetch('/api/alert-rules', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    rules: alertRules.map((r) => ({
                      ruleId: r.id,
                      enabled: r.enabled,
                      threshold: r.threshold,
                      severity: r.severity,
                    })),
                  }),
                });
                const data = await res.json();
                if (data.success) {
                  toast.success('预警规则已更新');
                } else {
                  toast.error('保存失败', {
                    description: data.error || '未知错误',
                  });
                }
              } catch {
                toast.error('保存失败', { description: '网络错误' });
              }
              setAlertRulesOpen(false);
            }}
          >
            保存规则
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
