/**
 * Panel Registry — single source of truth for all dashboard panels.
 *
 * Each panel defines:
 *   - id, label, icon          → display
 *   - path                     → dynamic import target
 *   - category                 → 'decision' | 'ops' | 'dialog'
 *   - tags                     → which views include this panel
 *   - defaultEnabled           → visible on first load
 *   - loaderType               → LazyLoader skeleton variant
 *
 * Views are role-based presets that auto-enable tagged panels.
 * Users can customize and save their own view via localStorage.
 */

import {
  Eye, Search, Zap, Cpu, Boxes, DollarSign, Ship, TrendingUp,
  Building2, Shield,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface PanelDef {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
  category: 'decision' | 'ops';
  tags: string[];
  defaultEnabled: boolean;
  loaderType: 'tab' | 'chart';
}

export interface ViewPreset {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  enabledPanels: string[];
}

// ─── Panel Registry ──────────────────────────────────────────────────────────────

export const PANEL_REGISTRY: PanelDef[] = [
  // ── Decision Flow ──────────────────────────────────────────────────────────
  {
    id: 'monitor', label: '监控', icon: Eye,
    path: '@/components/dashboard/MonitorStrip',
    category: 'decision', tags: ['all', 'executive', 'ops'],
    defaultEnabled: true, loaderType: 'chart',
  },
  {
    id: 'cascade-risk', label: '级联风险', icon: Search,
    path: '@/components/risk/CascadeRiskPanel',
    category: 'decision', tags: ['all', 'executive', 'risk'],
    defaultEnabled: true, loaderType: 'chart',
  },
  {
    id: 'decision-center', label: '决策中心', icon: Zap,
    path: '@/components/dashboard/DecisionCenter',
    category: 'decision', tags: ['all', 'executive', 'ops'],
    defaultEnabled: true, loaderType: 'chart',
  },
  {
    id: 'sandbox', label: '沙箱推演', icon: Cpu,
    path: '@/components/dashboard/SandboxReplay',
    category: 'decision', tags: ['all', 'risk'],
    defaultEnabled: false, loaderType: 'chart',
  },
  // ── Operational Drill-down ─────────────────────────────────────────────────
  {
    id: 'inventory', label: '库存', icon: Boxes,
    path: '@/components/inventory/InventoryTab',
    category: 'ops', tags: ['all', 'ops', 'inventory'],
    defaultEnabled: true, loaderType: 'tab',
  },
  {
    id: 'cost', label: '成本', icon: DollarSign,
    path: '@/components/cost/CostTab',
    category: 'ops', tags: ['all', 'cost', 'executive'],
    defaultEnabled: true, loaderType: 'chart',
  },
  {
    id: 'logistics', label: '物流', icon: Ship,
    path: '@/components/logistics/LogisticsTab',
    category: 'ops', tags: ['all', 'logistics', 'ops'],
    defaultEnabled: true, loaderType: 'tab',
  },
  {
    id: 'sales', label: '销售', icon: TrendingUp,
    path: '@/components/sales/SalesTab',
    category: 'ops', tags: ['all', 'sales', 'executive'],
    defaultEnabled: false, loaderType: 'chart',
  },
  {
    id: 'supplier', label: '供应商', icon: Building2,
    path: '@/components/supplier/SupplierTab',
    category: 'ops', tags: ['all', 'ops', 'inventory'],
    defaultEnabled: true, loaderType: 'tab',
  },
  {
    id: 'risk', label: '风险仪表', icon: Shield,
    path: '@/components/risk/RiskTab',
    category: 'ops', tags: ['all', 'risk', 'executive'],
    defaultEnabled: true, loaderType: 'chart',
  },
  {
    id: 'audit', label: '审计', icon: Shield,
    path: '@/components/audit/AuditTab',
    category: 'decision', tags: ['all', 'executive'],
    defaultEnabled: true, loaderType: 'tab',
  },
];

// ─── View Presets ────────────────────────────────────────────────────────────────

export const VIEW_PRESETS: ViewPreset[] = [
  {
    id: 'all', label: '全貌', icon: Eye,
    description: '所有面板',
    enabledPanels: PANEL_REGISTRY.filter(p => p.tags.includes('all')).map(p => p.id),
  },
  {
    id: 'executive', label: '决策者', icon: TrendingUp,
    description: '健康分、风险金额、周报、碳关税',
    enabledPanels: PANEL_REGISTRY.filter(p => p.tags.includes('executive')).map(p => p.id),
  },
  {
    id: 'ops', label: '运营采购', icon: Boxes,
    description: '库存、供应商、大宗商品、运费',
    enabledPanels: PANEL_REGISTRY.filter(p => p.tags.includes('ops') || p.tags.includes('inventory')).map(p => p.id),
  },
  {
    id: 'risk', label: '风控合规', icon: Shield,
    description: '级联风险、召回、碳关税、关税',
    enabledPanels: PANEL_REGISTRY.filter(p => p.tags.includes('risk') || p.tags.includes('logistics')).map(p => p.id),
  },
  {
    id: 'cost', label: '成本财务', icon: DollarSign,
    description: '汇率、大宗商品、运费、碳价、竞品',
    enabledPanels: PANEL_REGISTRY.filter(p => p.tags.includes('cost') || p.tags.includes('executive')).map(p => p.id),
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────────

export function getPanel(id: string): PanelDef | undefined {
  return PANEL_REGISTRY.find(p => p.id === id);
}

export function getPanelsByCategory(category: PanelDef['category']): PanelDef[] {
  return PANEL_REGISTRY.filter(p => p.category === category);
}

export function getViewPreset(id: string): ViewPreset | undefined {
  return VIEW_PRESETS.find(v => v.id === id);
}

/** Resolve which panels are enabled for a given view + user overrides */
export function resolveEnabledPanels(
  viewId: string,
  userOverrides?: Record<string, boolean>,
): string[] {
  const preset = getViewPreset(viewId);
  if (!preset) return PANEL_REGISTRY.filter(p => p.defaultEnabled).map(p => p.id);

  const enabled = new Set(preset.enabledPanels);

  // Apply user overrides (explicit on/off takes precedence)
  if (userOverrides) {
    for (const [panelId, visible] of Object.entries(userOverrides)) {
      if (visible) enabled.add(panelId);
      else enabled.delete(panelId);
    }
  }

  return [...enabled];
}
