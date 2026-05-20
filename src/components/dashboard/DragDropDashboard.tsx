/**
 * DragDropDashboard — sortable card grid for decision-flow panels.
 *
 * Uses @dnd-kit for drag-and-drop reordering. Panel order is persisted
 * to the dashboard-config-store (→ localStorage).
 *
 * Hidden panels (via config toggle) are excluded from the layout.
 * Each panel renders a gripper handle (GripVertical) at the top of its card.
 */

'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  MeasuringStrategy,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardConfigStore } from '@/stores/dashboard-config-store';
import { PANEL_REGISTRY } from '@/lib/dashboard/panel-registry';
import { LazyLoader } from '@/components/shared/LazyLoader';
import { SectionErrorBoundary } from '@/components/error';

// ── Dynamic imports (one per decision panel) ───────────────────────────────

const MonitorStrip = dynamic(
  () => import('@/components/dashboard/MonitorStrip').then(m => ({ default: m.MonitorStrip })),
  { ssr: false, loading: () => <LazyLoader type="chart" /> },
);
const CascadeRiskPanel = dynamic(
  () => import('@/components/risk/CascadeRiskPanel').then(m => ({ default: m.CascadeRiskPanel })),
  { ssr: false, loading: () => <LazyLoader type="chart" /> },
);
const DecisionCenter = dynamic(
  () => import('@/components/dashboard/DecisionCenter').then(m => ({ default: m.DecisionCenter })),
  { ssr: false, loading: () => <LazyLoader type="chart" /> },
);
const SandboxReplay = dynamic(
  () => import('@/components/dashboard/SandboxReplay').then(m => ({ default: m.SandboxReplay })),
  { ssr: false, loading: () => <LazyLoader type="chart" /> },
);
const CalibrationPanel = dynamic(
  () => import('@/components/engine/CalibrationPanel').then(m => ({ default: m.CalibrationPanel })),
  { ssr: false, loading: () => <LazyLoader type="chart" /> },
);

const PANEL_COMPONENTS: Record<string, React.ComponentType<any>> = {
  monitor: MonitorStrip,
  'cascade-risk': CascadeRiskPanel,
  'decision-center': DecisionCenter,
  sandbox: SandboxReplay,
  calibration: CalibrationPanel,
};

// ─── Sortable Panel Card ────────────────────────────────────────────────────

interface SortablePanelCardProps {
  panelId: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

function SortablePanelCard({ panelId, label, icon: Icon }: SortablePanelCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: panelId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Comp = PANEL_COMPONENTS[panelId];
  if (!Comp) return null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative bg-card border rounded-lg overflow-hidden',
        'transition-shadow duration-200',
        isDragging && 'opacity-50 shadow-xl ring-2 ring-primary/20 z-50',
      )}
    >
      {/* Drag handle header */}
      <div
        {...attributes}
        {...listeners}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b',
          'cursor-grab active:cursor-grabbing select-none',
          'hover:bg-muted/50 transition-colors',
        )}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>

      {/* Panel content */}
      <div className="p-3">
        <SectionErrorBoundary sectionName={label}>
          <Comp />
        </SectionErrorBoundary>
      </div>
    </div>
  );
}

// ─── DragDropDashboard ──────────────────────────────────────────────────────

export function DragDropDashboard() {
  const panels = useDashboardConfigStore(s => s.config.panels);
  const panelOrder = useDashboardConfigStore(s => s.config.panelOrder);
  const reorderPanels = useDashboardConfigStore(s => s.reorderPanels);

  // Build a look-up map from the registry once
  const panelMap = useMemo(() => new Map(PANEL_REGISTRY.map(p => [p.id, p])), []);

  // Resolve visible decision panels sorted by panelOrder
  const visiblePanels = useMemo(
    () =>
      panelOrder
        .filter(id => {
          const def = panelMap.get(id);
          return def && def.category === 'decision' && panels[id] !== false;
        })
        .map(id => panelMap.get(id)!),
    [panelOrder, panels, panelMap],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = panelOrder.indexOf(active.id as string);
    const newIndex = panelOrder.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    reorderPanels(oldIndex, newIndex);
  };

  if (visiblePanels.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        当前视角下没有启用的面板，请切换视角或开启面板。
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    >
      <SortableContext
        items={visiblePanels.map(p => p.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-4">
          {visiblePanels.map(panel => (
            <SortablePanelCard
              key={panel.id}
              panelId={panel.id}
              label={panel.label}
              icon={panel.icon}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
