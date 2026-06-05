/**
 * TabbedSection — unified pluggable tab container.
 *
 * Replaces two hardcoded <Tabs> blocks in page.tsx with a single data-driven component.
 *
 * Input:  panelDefs[], activeTab state, onTabChange
 * Output: <Tabs> + <TabsList> (auto-grid) + dynamic <TabsContent> per panel
 */

'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LazyLoader } from '@/components/shared/LazyLoader';
import { SectionErrorBoundary } from '@/components/error';
import type { PanelDef } from '@/lib/dashboard/panel-registry';

// ─── Static Import Map ───────────────────────────────────────────────────────────
// next/dynamic requires static string literals — each panel registers here.

const MonitorStrip = dynamic(() => import('@/components/dashboard/MonitorStrip').then(m => ({ default: m.MonitorStrip })), { ssr: false, loading: () => <LazyLoader type="chart" /> });
const CascadeRiskPanel = dynamic(() => import('@/components/risk/CascadeRiskPanel').then(m => ({ default: m.CascadeRiskPanel })), { ssr: false, loading: () => <LazyLoader type="chart" /> });
const DecisionCenter = dynamic(() => import('@/components/dashboard/DecisionCenter').then(m => ({ default: m.DecisionCenter })), { ssr: false, loading: () => <LazyLoader type="chart" /> });
const SandboxReplay = dynamic(() => import('@/components/dashboard/SandboxReplay').then(m => ({ default: m.SandboxReplay })), { ssr: false, loading: () => <LazyLoader type="chart" /> });
const InventoryTab = dynamic(() => import('@/components/inventory/InventoryTab').then(m => ({ default: m.InventoryTab })), { ssr: false, loading: () => <LazyLoader type="tab" /> });
const CostTab = dynamic(() => import('@/components/cost/CostTab').then(m => ({ default: m.CostTab })), { ssr: false, loading: () => <LazyLoader type="chart" /> });
const LogisticsTab = dynamic(() => import('@/components/logistics/LogisticsTab').then(m => ({ default: m.LogisticsTab })), { ssr: false, loading: () => <LazyLoader type="tab" /> });
const SalesTab = dynamic(() => import('@/components/sales/SalesTab').then(m => ({ default: m.SalesTab })), { ssr: false, loading: () => <LazyLoader type="chart" /> });
const SupplierTab = dynamic(() => import('@/components/supplier/SupplierTab').then(m => ({ default: m.SupplierTab })), { ssr: false, loading: () => <LazyLoader type="tab" /> });
const RiskTab = dynamic(() => import('@/components/risk/RiskTab').then(m => ({ default: m.RiskTab })), { ssr: false, loading: () => <LazyLoader type="chart" /> });
const AuditTabComponent = dynamic(() => import('@/components/audit/AuditTab').then(m => ({ default: m.AuditTab })), { ssr: false, loading: () => <LazyLoader type="tab" /> });

const PANEL_COMPONENTS: Record<string, React.ComponentType<any>> = {
  'monitor': MonitorStrip,
  'cascade-risk': CascadeRiskPanel,
  'decision-center': DecisionCenter,
  'sandbox': SandboxReplay,
  'inventory': InventoryTab,
  'cost': CostTab,
  'logistics': LogisticsTab,
  'sales': SalesTab,
  'supplier': SupplierTab,
  'risk': RiskTab,
  'audit': AuditTabComponent,
  'dashboard': SalesTab, // dashboard uses SalesTab
};

// ─── Props ───────────────────────────────────────────────────────────────────────

interface TabbedSectionProps {
  panels: PanelDef[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────────

export function TabbedSection({ panels, activeTab, onTabChange }: TabbedSectionProps) {
  if (panels.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        当前视角下没有启用的面板，请切换视角或开启面板。
      </div>
    );
  }

  const effectiveTab = panels.some(p => p.id === activeTab) ? activeTab : panels[0].id;

  return (
    <Tabs value={effectiveTab} onValueChange={onTabChange}>
      <TabsList className="mb-4 h-auto w-full flex-nowrap overflow-x-auto p-1">
        {panels.map(panel => (
          <TabsTrigger key={panel.id} value={panel.id} className="flex items-center gap-1.5 text-xs h-8 px-2.5 shrink-0 flex-none">
            <panel.icon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline truncate">{panel.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {panels.map(panel => {
        const Comp = PANEL_COMPONENTS[panel.id];
        if (!Comp) return null;
        return (
          <TabsContent key={panel.id} value={panel.id} className="mt-0">
            <SectionErrorBoundary sectionName={panel.label}>
              <Suspense fallback={<LazyLoader type={panel.loaderType} />}>
                <Comp />
              </Suspense>
            </SectionErrorBoundary>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
