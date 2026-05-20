'use client';

import { useMemo, useCallback, useState } from 'react';
import { Settings, RotateCcw, Layers, Download, Layout, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger,
} from '@/components/ui/sheet';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useDashboardConfigStore } from '@/stores/dashboard-config-store';
import { PANEL_REGISTRY, VIEW_PRESETS, resolveEnabledPanels } from '@/lib/dashboard/panel-registry';
import { exportDashboardReport } from '@/lib/services/report-export.service';
import type { Currency, TimeHorizon, Aggregation } from '@/lib/dashboard/config';

// ─── Export Report Button ────────────────────────────────────────────────────

function ExportReportButton() {
  const [exporting, setExporting] = useState(false);

  const handleExportCSV = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportDashboardReport();
      toast.success('报告导出成功', { description: '仪表盘报告已下载' });
    } catch {
      toast.error('报告导出失败', { description: '请检查控制台了解详情' });
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 text-[10px] gap-1"
          disabled={exporting}
        >
          <Download className="h-2.5 w-2.5" />
          {exporting ? '导出中...' : '导出报告'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={handleExportCSV} disabled={exporting}>
          <Download className="h-3.5 w-3.5 mr-2" />
          导出 Excel 报告
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            // Generate and open a printable version of the dashboard
            window.print();
          }}
        >
          <Download className="h-3.5 w-3.5 mr-2" />
          打印 PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Layout Panel List (inside Sheet DndContext) ─────────────────────────┐

interface LayoutPanelListProps {
  panelOrder: string[];
  panels: Record<string, boolean>;
  onToggle: (panelId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

function LayoutPanelList({ panelOrder, panels, onToggle, onReorder }: LayoutPanelListProps) {
  // Build a map for quick lookup
  const panelMap = useMemo(() => new Map(PANEL_REGISTRY.map(p => [p.id, p])), []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = panelOrder.indexOf(active.id as string);
    const newIndex = panelOrder.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(oldIndex, newIndex);
  };

  // Build sorted list of panels: decision first, then ops
  const sortedPanels = useMemo(() => {
    const decision: { id: string; def: (typeof PANEL_REGISTRY)[number] }[] = [];
    const ops: { id: string; def: (typeof PANEL_REGISTRY)[number] }[] = [];
    for (const id of panelOrder) {
      const def = panelMap.get(id);
      if (!def) continue;
      (def.category === 'decision' ? decision : ops).push({ id, def });
    }
    return [...decision, ...ops];
  }, [panelOrder, panelMap]);

  const allIds = sortedPanels.map(p => p.id);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
        <div className="flex-1 space-y-2 py-4 overflow-y-auto max-h-[60vh]">
          {sortedPanels.map(({ id, def }) => (
            <SortablePanelRow
              key={id}
              panelId={id}
              label={def.label}
              Icon={def.icon}
              enabled={(panels as any)[id] !== false}
              onToggle={() => onToggle(id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ─── Sortable Row for Layout Customizer Sheet ──────────────────────────────

interface SortablePanelRowProps {
  panelId: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
  onToggle: () => void;
}

function SortablePanelRow({ panelId, label, Icon, enabled, onToggle }: SortablePanelRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: panelId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg border bg-card',
        isDragging && 'opacity-50 shadow-md ring-1 ring-primary/20 z-10',
      )}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Icon + label */}
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="flex-1 text-sm">{label}</span>

      {/* Toggle switch */}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          enabled ? 'bg-primary' : 'bg-input',
        )}
      >
        <span
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform',
            enabled ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
}

// ─── Main ConfigToolbar ──────────────────────────────────────────────────────

export function ConfigToolbar() {
  const config = useDashboardConfigStore(s => s.config);
  const setCurrency = useDashboardConfigStore(s => s.setCurrency);
  const setTimeHorizon = useDashboardConfigStore(s => s.setTimeHorizon);
  const setRiskThresholds = useDashboardConfigStore(s => s.setRiskThresholds);
  const togglePanel = useDashboardConfigStore(s => s.togglePanel);
  const reorderPanels = useDashboardConfigStore(s => s.reorderPanels);
  const resetLayout = useDashboardConfigStore(s => s.resetLayout);
  const resetConfig = useDashboardConfigStore(s => s.resetConfig);
  const setConfig = useDashboardConfigStore(s => s.setConfig);
  const { currency, timeHorizon, riskThresholds, panels } = config;
  const [layoutOpen, setLayoutOpen] = useState(false);

  // Current view: infer from enabled panels, or use 'custom'
  const activeView = useMemo(() => {
    const enabled = Object.entries(panels).filter(([, v]) => v).map(([k]) => k);
    for (const preset of VIEW_PRESETS) {
      const presetSet = new Set(preset.enabledPanels);
      const enabledSet = new Set(enabled);
      if (presetSet.size === enabledSet.size && [...presetSet].every(p => enabledSet.has(p))) {
        return preset.id;
      }
    }
    return 'custom';
  }, [panels]);

  const applyView = (viewId: string) => {
    const preset = VIEW_PRESETS.find(v => v.id === viewId);
    if (!preset) return;
    const newPanels: Record<string, boolean> = {};
    for (const p of PANEL_REGISTRY) {
      newPanels[p.id] = preset.enabledPanels.includes(p.id);
    }
    setConfig({ panels: newPanels as any });
  };

  // Group panels by category for toggle display
  const decisionPanels = PANEL_REGISTRY.filter(p => p.category === 'decision');
  const opsPanels = PANEL_REGISTRY.filter(p => p.category === 'ops');

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b text-xs flex-wrap">
      <Settings className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-[10px] text-muted-foreground font-medium shrink-0">配置</span>

      <Separator orientation="vertical" className="h-4" />

      {/* View Preset Switcher */}
      <div className="flex items-center gap-1">
        <Layers className="h-3 w-3 text-muted-foreground" />
        <Select value={activeView} onValueChange={applyView}>
          <SelectTrigger className="h-6 text-[10px] w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIEW_PRESETS.map(v => (
              <SelectItem key={v.id} value={v.id}>
                {v.label} · {v.description}
              </SelectItem>
            ))}
            <SelectItem value="custom">自定义</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator orientation="vertical" className="h-4" />

      {/* Currency */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground">货币</span>
        <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
          <SelectTrigger className="h-6 text-[10px] w-16">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CNY">¥ CNY</SelectItem>
            <SelectItem value="USD">$ USD</SelectItem>
            <SelectItem value="EUR">€ EUR</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Time Horizon */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground">时间窗</span>
        <Select value={timeHorizon} onValueChange={(v) => setTimeHorizon(v as TimeHorizon)}>
          <SelectTrigger className="h-6 text-[10px] w-16">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7天</SelectItem>
            <SelectItem value="30d">30天</SelectItem>
            <SelectItem value="90d">90天</SelectItem>
            <SelectItem value="6M">6个月</SelectItem>
            <SelectItem value="1Y">1年</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Risk Thresholds */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">风险阈值</span>
        {(['low', 'medium', 'high'] as const).map(level => {
          const colors = { low: 'text-green-600', medium: 'text-yellow-600', high: 'text-red-600' };
          const ranges = { low: [0, 30], medium: [20, 60], high: [50, 100] };
          return (
            <Tooltip key={level}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <span className={`text-[9px] ${colors[level]}`}>
                    {level === 'low' ? '低' : level === 'medium' ? '中' : '高'}
                  </span>
                  <Slider
                    value={[riskThresholds[level]]}
                    onValueChange={([v]) => setRiskThresholds({ ...riskThresholds, [level]: v })}
                    min={ranges[level][0]} max={ranges[level][1]} step={1}
                    className="w-10 h-3"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent className="text-[10px]">
                {level === 'low' ? '低' : level === 'medium' ? '中' : '高'}风险阈值: {riskThresholds[level]}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <Separator orientation="vertical" className="h-4" />

      {/* Panel Toggles — grouped by category */}
      <span className="text-[9px] text-muted-foreground">面板</span>
      {decisionPanels.map(p => (
        <Badge
          key={p.id}
          variant={(panels as any)[p.id] !== false ? 'default' : 'outline'}
          className="text-[9px] h-5 px-1.5 cursor-pointer"
          onClick={() => togglePanel(p.id as any)}
        >
          {p.label}
        </Badge>
      ))}
      <span className="text-[9px] text-muted-foreground mx-0.5">|</span>
      {opsPanels.map(p => (
        <Badge
          key={p.id}
          variant={(panels as any)[p.id] !== false ? 'default' : 'outline'}
          className="text-[9px] h-5 px-1.5 cursor-pointer"
          onClick={() => togglePanel(p.id as any)}
        >
          {p.label}
        </Badge>
      ))}

      <div className="ml-auto flex items-center gap-1">
        <ExportReportButton />

        {/* Layout Customizer Trigger */}
        <Sheet open={layoutOpen} onOpenChange={setLayoutOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="h-5 text-[10px] gap-1">
              <Layout className="h-2.5 w-2.5" />
              自定义布局
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 sm:max-w-sm">
            <SheetHeader>
              <SheetTitle>自定义布局</SheetTitle>
              <SheetDescription>
                拖拽调整面板顺序，开关控制面板显示
              </SheetDescription>
            </SheetHeader>

            {/* Sortable panel list */}
            <LayoutPanelList
              panelOrder={config.panelOrder}
              panels={panels}
              onToggle={togglePanel}
              onReorder={reorderPanels}
            />

            <div className="mt-auto pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs gap-1"
                onClick={() => {
                  resetLayout();
                  setLayoutOpen(false);
                }}
              >
                <RotateCcw className="h-3 w-3" />
                恢复默认
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={resetConfig}>
          <RotateCcw className="h-2.5 w-2.5 mr-1" />重置
        </Button>
      </div>
    </div>
  );
}
