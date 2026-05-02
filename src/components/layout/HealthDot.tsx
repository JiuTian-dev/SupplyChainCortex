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

export function HealthDot() {
  const [status, setStatus] = useState<HealthStatus>('loading');

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/engine-health');
        const data = await res.json();
        setStatus(data.status as HealthStatus);
      } catch {
        setStatus('unhealthy');
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  const cfg = STATUS_CONFIG[status];

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
