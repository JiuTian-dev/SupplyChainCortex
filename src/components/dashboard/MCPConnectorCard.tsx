'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Database,
  CloudSun,
  Banknote,
  Package,
  DollarSign,
  Ship,
  TrendingUp,
  Wifi,
  WifiOff,
  Clock,
  Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useConnectionStore } from '@/stores/connection-store';

// ==================== Connector Icon Map ====================

const CONNECTOR_ICONS: Record<string, LucideIcon> = {
  database:  Database,
  weather:   CloudSun,
  fx:        Banknote,
  inventory: Package,
  cost:      DollarSign,
  logistics: Ship,
  sales:     TrendingUp,
};

const CONNECTOR_COLORS: Record<string, string> = {
  database:  'from-blue-500/20 to-blue-600/10 border-blue-200 dark:border-blue-800',
  weather:   'from-cyan-500/20 to-cyan-600/10 border-cyan-200 dark:border-cyan-800',
  fx:        'from-emerald-500/20 to-emerald-600/10 border-emerald-200 dark:border-emerald-800',
  inventory: 'from-orange-500/20 to-orange-600/10 border-orange-200 dark:border-orange-800',
  cost:      'from-violet-500/20 to-violet-600/10 border-violet-200 dark:border-violet-800',
  logistics: 'from-rose-500/20 to-rose-600/10 border-rose-200 dark:border-rose-800',
  sales:     'from-amber-500/20 to-amber-600/10 border-amber-200 dark:border-amber-800',
};

const ICON_COLORS: Record<string, string> = {
  database:  'text-blue-500',
  weather:   'text-cyan-500',
  fx:        'text-emerald-500',
  inventory: 'text-orange-500',
  cost:      'text-violet-500',
  logistics: 'text-rose-500',
  sales:     'text-amber-500',
};

// ==================== Status Helpers ====================

const STATUS_CONFIG: Record<string, { label: string; dotClass: string; bgClass: string }> = {
  online:   { label: '在线',   dotClass: 'bg-green-500',  bgClass: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' },
  degraded: { label: '降级',   dotClass: 'bg-yellow-500', bgClass: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400' },
  offline:  { label: '离线',   dotClass: 'bg-red-500',    bgClass: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

// ==================== Component ====================

export function MCPConnectorCard() {
  const connectorData = useConnectionStore((s) => s.connectorData);
  const healthLoading = useConnectionStore((s) => s.healthLoading);

  const onlineCount = useMemo(
    () => connectorData.filter((c) => c.status === 'online').length,
    [connectorData],
  );
  const degradedCount = useMemo(
    () => connectorData.filter((c) => c.status === 'degraded').length,
    [connectorData],
  );
  const offlineCount = useMemo(
    () => connectorData.filter((c) => c.status === 'offline').length,
    [connectorData],
  );

  if (connectorData.length === 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
          暂无连接器数据
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Summary bar ── */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            在线 {onlineCount}
          </span>
          {degradedCount > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
              降级 {degradedCount}
            </span>
          )}
          {offlineCount > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
              离线 {offlineCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Activity className={`h-3 w-3 ${healthLoading ? 'animate-pulse' : ''}`} />
          <span>{healthLoading ? '检测中...' : `${connectorData.length} 个连接器`}</span>
        </div>
      </div>

      {/* ── Connector cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {connectorData.map((conn) => {
          const Icon = CONNECTOR_ICONS[conn.type] || Database;
          const colorClass = CONNECTOR_COLORS[conn.type] || 'from-gray-500/20 to-gray-600/10 border-gray-200';
          const iconColor = ICON_COLORS[conn.type] || 'text-gray-500';
          const statusCfg = STATUS_CONFIG[conn.status] || STATUS_CONFIG.offline;

          return (
            <Card
              key={conn.type}
              className={`relative overflow-hidden border bg-gradient-to-br ${colorClass} p-3 transition-all duration-200 hover:shadow-md`}
            >
              {/* ── Header: icon + name + status dot ── */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`shrink-0 p-1.5 rounded-lg bg-background/60 ${iconColor}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm font-medium truncate">{conn.name}</span>
                </div>
                <TooltipProvider>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <div className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusCfg.bgClass}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusCfg.dotClass}`} />
                        {statusCfg.label}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>状态: {statusCfg.label}</p>
                      <p className="text-xs text-muted-foreground">延迟: {conn.latency} ms</p>
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              </div>

              {/* ── Metrics ── */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span className="truncate">{timeAgo(conn.lastSync)}</span>
                </div>
                <div className="flex items-center gap-1">
                  {conn.status === 'offline' ? (
                    <WifiOff className="h-3 w-3 shrink-0 text-red-400" />
                  ) : (
                    <Wifi className="h-3 w-3 shrink-0 text-green-500" />
                  )}
                  <span>{conn.latency} ms</span>
                </div>
                <div className="flex items-center gap-1 col-span-2">
                  <Database className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {conn.recordsSynced.toLocaleString()} 条记录
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
