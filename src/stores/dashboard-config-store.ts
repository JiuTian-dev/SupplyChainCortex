/**
 * Dashboard Config Store — Zustand store for DashboardConfig state.
 *
 * Persists to localStorage on every change. All visualization components
 * consume config via useDashboardConfig() → useConfigurableMetric(config).
 */

'use client';

import { create } from 'zustand';
import type { DashboardConfig } from '@/lib/dashboard/config';
import { DEFAULT_CONFIG, loadConfig, saveConfig } from '@/lib/dashboard/config';

interface DashboardConfigState {
  config: DashboardConfig;
  hydrated: boolean;

  // Actions
  setConfig: (partial: Partial<DashboardConfig>) => void;
  setCurrency: (currency: DashboardConfig['currency']) => void;
  setCurrencyRate: (rate: number) => void;
  setRiskThresholds: (thresholds: DashboardConfig['riskThresholds']) => void;
  setTimeHorizon: (horizon: DashboardConfig['timeHorizon']) => void;
  togglePanel: (panel: string) => void;
  reorderPanels: (fromIndex: number, toIndex: number) => void;
  resetLayout: () => void;
  resetConfig: () => void;
  hydrate: () => void;
}

export const useDashboardConfigStore = create<DashboardConfigState>((set, get) => ({
  config: { ...DEFAULT_CONFIG },
  hydrated: false,

  setConfig: (partial) => {
    const next = { ...get().config, ...partial };
    set({ config: next });
    saveConfig(next);
  },

  setCurrency: (currency) => {
    const next = { ...get().config, currency };
    set({ config: next });
    saveConfig(next);
  },

  setCurrencyRate: (rate) => {
    const next = { ...get().config, currencyRate: rate };
    set({ config: next });
    saveConfig(next);
  },

  setRiskThresholds: (thresholds) => {
    const next = { ...get().config, riskThresholds: thresholds };
    set({ config: next });
    saveConfig(next);
  },

  setTimeHorizon: (horizon) => {
    const next = { ...get().config, timeHorizon: horizon };
    set({ config: next });
    saveConfig(next);
  },

  togglePanel: (panel) => {
    const next = {
      ...get().config,
      panels: { ...get().config.panels, [panel]: !get().config.panels[panel] },
    };
    set({ config: next });
    saveConfig(next);
  },

  reorderPanels: (fromIndex, toIndex) => {
    const currentOrder = [...get().config.panelOrder];
    const [moved] = currentOrder.splice(fromIndex, 1);
    currentOrder.splice(toIndex, 0, moved);
    const next = { ...get().config, panelOrder: currentOrder };
    set({ config: next });
    saveConfig(next);
  },

  resetLayout: () => {
    const defaults = { ...DEFAULT_CONFIG };
    const next = {
      ...get().config,
      panels: { ...defaults.panels },
      panelOrder: [...defaults.panelOrder],
    };
    set({ config: next as DashboardConfig });
    saveConfig(next as DashboardConfig);
  },

  resetConfig: () => {
    const defaults = { ...DEFAULT_CONFIG };
    set({ config: defaults });
    saveConfig(defaults);
  },

  hydrate: () => {
    if (get().hydrated) return;
    const stored = loadConfig();
    // Migrate old panel IDs to new registry
    if (stored.panels) {
      const p = stored.panels as Record<string, boolean>;
      if ('analysis' in p) { p['cascade-risk'] = p.analysis; delete p.analysis; }
      if ('decision' in p) { p['decision-center'] = p.decision; delete p.decision; }
      if ('simulation' in p) { p.sandbox = p.simulation; delete p.simulation; }
      // Ensure audit tab is visible (added in v2.0.0)
      if (!('audit' in p)) { p.audit = true; }
    }
    // Ensure audit is in panelOrder
    if (stored.panelOrder && !stored.panelOrder.includes('audit')) {
      stored.panelOrder.push('audit');
    }
    set({ config: stored, hydrated: true });
  },
}));

/** Convenience hook: subscribe to full config */
export function useDashboardConfig(): DashboardConfig {
  const store = useDashboardConfigStore();
  return store.config;
}
