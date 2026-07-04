'use client';

import { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'loading';

const STATUS_CONFIG: Record<HealthStatus, { color: string; pulse: string; label: string }> = {
  healthy:   { color: 'bg-green-500',   pulse: 'animate-pulse', label: '引擎健康' },
  degraded:  { color: 'bg-yellow-500',  pulse: 'animate-pulse', label: '部分降级' },
  unhealthy: { color: 'bg-red-500',     pulse: '',              label: '引擎异常' },
  loading:   { color: 'bg-gray-400',    pulse: 'animate-pulse', label: '检测中...' },
};

const VALID_STATUSES: HealthStatus[] = ['healthy', 'degraded', 'unhealthy', 'loading'];

function normalizeStatus(value: unknown): HealthStatus {
  return VALID_STATUSES.includes(value as HealthStatus) ? (value as HealthStatus) : 'unhealthy';
}

export function HealthDot() {
  const [status, setStatus] = useState<HealthStatus>('loading');

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/engine-health');
        // 401/403 = 未登录（不是引擎故障）。匿名访问场景下HealthDot应显示中性状态，
        // 不应误报为"引擎异常"。
        if (res.status === 401 || res.status === 403) {
          setStatus('loading');
          return;
        }
        if (!res.ok) {
          setStatus('unhealthy');
          return;
        }
        const data = await res.json();
        setStatus(normalizeStatus(data?.status));
      } catch {
        setStatus('unhealthy');
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unhealthy;

  return (
    <TooltipProvider>
      <UITooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 cursor-default">
            <Activity className="h-3 w-3 text-muted-foreground" />
            <div className={`h-2 w-2 rounded-full ${cfg.color} ${cfg.pulse}`} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {cfg.label}
        </TooltipContent>
      </UITooltip>
    </TooltipProvider>
  );
}
