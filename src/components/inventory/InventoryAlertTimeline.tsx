'use client';

/* eslint-disable react-hooks/incompatible-library */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  AlertTriangle, CheckCircle2, ArrowRightLeft, PackagePlus,
  ArrowDownUp, Clock, Filter, ChevronDown, ChevronUp,
  Activity, RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInventoryAlertTimeline } from '@/hooks/use-supply-chain-data';

// ==================== Types ====================

type EventType = 'critical' | 'warning' | 'adjustment' | 'restocked' | 'transfer';

interface TimelineEvent {
  id: string;
  eventType: EventType;
  title: string;
  description: string;
  timestamp: string;
  sku: string | null;
  productName: string | null;
  warehouse: string | null;
  quantityBefore: number | null;
  quantityAfter: number | null;
  stockStatus: string | null;
  icon: string;
  color: string;
  severity: string;
  source: string;
}

// ==================== Event Type Config ====================

const EVENT_TYPE_CONFIG: Record<EventType, {
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  dotColor: string;
}> = {
  critical: {
    label: '紧急',
    icon: <AlertTriangle className="h-4 w-4" />,
    color: '#ef4444',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-300 dark:border-red-800',
    textColor: 'text-red-700 dark:text-red-400',
    dotColor: 'bg-red-500',
  },
  warning: {
    label: '预警',
    icon: <AlertTriangle className="h-4 w-4" />,
    color: '#f59e0b',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-300 dark:border-amber-800',
    textColor: 'text-amber-700 dark:text-amber-400',
    dotColor: 'bg-amber-500',
  },
  adjustment: {
    label: '调整',
    icon: <ArrowDownUp className="h-4 w-4" />,
    color: '#3b82f6',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-300 dark:border-blue-800',
    textColor: 'text-blue-700 dark:text-blue-400',
    dotColor: 'bg-blue-500',
  },
  restocked: {
    label: '入库',
    icon: <PackagePlus className="h-4 w-4" />,
    color: '#22c55e',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-green-300 dark:border-green-800',
    textColor: 'text-green-700 dark:text-green-400',
    dotColor: 'bg-green-500',
  },
  transfer: {
    label: '调拨',
    icon: <ArrowRightLeft className="h-4 w-4" />,
    color: '#8b5cf6',
    bgColor: 'bg-violet-50 dark:bg-violet-950/30',
    borderColor: 'border-violet-300 dark:border-violet-800',
    textColor: 'text-violet-700 dark:text-violet-400',
    dotColor: 'bg-violet-500',
  },
};

// ==================== Relative Time Helper ====================

function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay === 1) return '昨天';
  if (diffDay < 7) return `${diffDay}天前`;
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// ==================== Stock Status Badge ====================

function StockStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const config: Record<string, { label: string; className: string }> = {
    healthy: { label: '健康', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
    warning: { label: '预警', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
    critical: { label: '紧急', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
    overstock: { label: '积压', className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400' },
  };
  const c = config[status];
  if (!c) return null;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}

// ==================== Summary Bar Component ====================

function SummaryBar({ summary, activeFilter, onFilterChange }: {
  summary: Record<string, number>;
  activeFilter: string;
  onFilterChange: (type: string) => void;
}) {
  const types: { key: EventType; emoji: string }[] = [
    { key: 'critical', emoji: '🔴' },
    { key: 'warning', emoji: '🟡' },
    { key: 'adjustment', emoji: '🔵' },
    { key: 'restocked', emoji: '🟢' },
    { key: 'transfer', emoji: '🟣' },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant={activeFilter === 'all' ? 'default' : 'outline'}
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={() => onFilterChange('all')}
      >
        全部 <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{summary.total || 0}</Badge>
      </Button>
      {types.map(({ key, emoji }) => {
        const config = EVENT_TYPE_CONFIG[key];
        const count = summary[key] || 0;
        return (
          <Button
            key={key}
            variant={activeFilter === key ? 'default' : 'outline'}
            size="sm"
            className={`h-7 text-xs gap-1 ${activeFilter === key ? config.bgColor + ' ' + config.textColor + ' border-0' : ''}`}
            onClick={() => onFilterChange(key)}
          >
            <span className="text-sm">{emoji}</span>
            {config.label}
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{count}</Badge>
          </Button>
        );
      })}
    </div>
  );
}

// ==================== Timeline Event Card ====================

function TimelineEventCard({ event, isLatest, isExpanded, onToggle }: {
  event: TimelineEvent;
  isLatest: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const config = EVENT_TYPE_CONFIG[event.eventType];

  return (
    <div className="relative flex gap-3 group">
      {/* Timeline line */}
      <div className="flex flex-col items-center shrink-0">
        <div className={`w-3 h-3 rounded-full shrink-0 ring-2 ring-background ${config.dotColor} ${isLatest ? 'animate-pulse' : ''}`} />
        <div className="w-0.5 flex-1 bg-border mt-1 group-last:bg-transparent" />
      </div>

      {/* Event card */}
      <div
        className={`flex-1 mb-3 rounded-lg border p-3 cursor-pointer transition-all duration-200 hover:shadow-md ${config.bgColor} ${config.borderColor} ${isLatest ? 'ring-1 ring-offset-1' : ''}`}
        style={isLatest ? { borderColor: config.color } as React.CSSProperties : {}}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`shrink-0 p-1 rounded ${config.bgColor} ${config.textColor}`}>
              {config.icon}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{event.title}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {event.sku && (
                  <span className="text-[10px] text-muted-foreground font-mono">{event.sku}</span>
                )}
                {event.warehouse && (
                  <span className="text-[10px] text-muted-foreground">· {event.warehouse}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <StockStatusBadge status={event.stockStatus} />
            <span className="text-[10px] text-muted-foreground whitespace-nowrap flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(event.timestamp)}
            </span>
          </div>
        </div>

        {/* Quantity change row */}
        {(event.quantityBefore !== null || event.quantityAfter !== null) && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            {event.quantityBefore !== null && (
              <span className="text-muted-foreground">库存 {event.quantityBefore}</span>
            )}
            {event.quantityBefore !== null && event.quantityAfter !== null && (
              <span className="text-muted-foreground">→</span>
            )}
            {event.quantityAfter !== null && (
              <span className={`font-semibold ${event.quantityBefore !== null ? (event.quantityAfter > event.quantityBefore ? 'text-green-600 dark:text-green-400' : event.quantityAfter < event.quantityBefore ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground') : 'text-muted-foreground'}`}>
                {event.quantityAfter}
              </span>
            )}
            {event.quantityBefore !== null && event.quantityAfter !== null && event.quantityBefore !== event.quantityAfter && (
              <Badge variant="outline" className={`text-[10px] h-4 ${event.quantityAfter > event.quantityBefore ? 'text-green-600 border-green-300' : 'text-red-600 border-red-300'}`}>
                {event.quantityAfter > event.quantityBefore ? '+' : ''}{event.quantityAfter - event.quantityBefore}
              </Badge>
            )}
          </div>
        )}

        {/* Expanded details */}
        {isExpanded && (
          <div className="mt-3 pt-2 border-t border-border/50 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
            <p className="text-xs text-muted-foreground leading-relaxed">{event.description}</p>
            <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Activity className="h-3 w-3" />
                来源: {event.source}
              </span>
              <span>严重性: {event.severity === 'critical' ? '🔴 紧急' : event.severity === 'warning' ? '🟡 预警' : '🔵 信息'}</span>
              {event.sku && <span>SKU: {event.sku}</span>}
            </div>
          </div>
        )}

        {/* Expand indicator */}
        <div className="flex justify-center mt-1">
          {isExpanded ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground/50" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== Virtual Timeline Component ====================

function VirtualTimeline({
  events,
  expandedIds,
  onToggle,
}: {
  events: TimelineEvent[];
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const event = events[index];
      // Expanded rows are taller - give more space for details
      if (expandedIds.has(event.id)) return 200;
      // Rows with quantity changes are slightly taller
      if (event.quantityBefore !== null || event.quantityAfter !== null) return 90;
      return 72;
    },
    overscan: 5,
    // Re-measure when expanded state changes
  });

  // Invalidate virtualizer measurements when expandedIds changes
  useEffect(() => {
    virtualizer.measure();
  }, [expandedIds, virtualizer]);

  return (
    <div
      ref={parentRef}
      className="max-h-[500px] overflow-y-auto custom-scrollbar pr-1"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const event = events[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <TimelineEventCard
                event={event}
                isLatest={virtualItem.index === 0}
                isExpanded={expandedIds.has(event.id)}
                onToggle={() => onToggle(event.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== Main Component ====================

export function InventoryAlertTimeline() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Build params for API
  const params = useMemo(() => {
    const p: Record<string, string | number> = { limit: 50 };
    if (typeFilter !== 'all') p.type = typeFilter;
    if (severityFilter !== 'all') p.severity = severityFilter;
    return p;
  }, [typeFilter, severityFilter]);

  const { data, isLoading, refetch, isFetching } = useInventoryAlertTimeline(params);

  const events = useMemo(() => ((data as any)?.events ?? []) as TimelineEvent[], [data]);
  const summary = useMemo(() => ((data as any)?.summary ?? { critical: 0, warning: 0, adjustment: 0, restocked: 0, transfer: 0, total: 0 }) as Record<string, number>, [data]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Handle type filter change
  const handleTypeFilterChange = (type: string) => {
    setTypeFilter(type);
    setExpandedIds(new Set());
  };

  return (
    <Card className="card-dashboard border-l-[4px] border-l-orange-400" style={{ '--delay': '350ms' } as React.CSSProperties}>
      <CardHeader className="pb-3 bg-orange-50 dark:bg-orange-950/10">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-orange-500" />
              库存预警时间线
            </CardTitle>
            <CardDescription className="text-xs mt-1">实时库存变动和预警事件</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary bar with filter */}
        <SummaryBar summary={summary} activeFilter={typeFilter} onFilterChange={handleTypeFilterChange} />

        {/* Severity filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue placeholder="严重性" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部级别</SelectItem>
              <SelectItem value="critical">🔴 紧急</SelectItem>
              <SelectItem value="warning">🟡 预警</SelectItem>
              <SelectItem value="info">🔵 信息</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[10px] text-muted-foreground ml-auto">
            共 {events.length} 条记录 · 自动刷新中
          </span>
        </div>

        {/* Timeline */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-3 h-3 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-2 rounded-lg border p-3">
                  <div className="h-4 bg-muted rounded w-3/4 skeleton-wave-v2" style={{ animationDelay: `${i * 100}ms` }} />
                  <div className="h-3 bg-muted rounded w-1/2 skeleton-wave-v2" style={{ animationDelay: `${i * 100 + 50}ms` }} />
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mb-2 text-green-500" />
            <p className="text-sm font-medium">暂无预警事件</p>
            <p className="text-xs mt-1">库存状态正常，无需关注</p>
          </div>
        ) : (
          <VirtualTimeline
            events={events}
            expandedIds={expandedIds}
            onToggle={toggleExpand}
          />
        )}
      </CardContent>
    </Card>
  );
}
