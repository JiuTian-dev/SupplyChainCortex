'use client';

import { useMemo } from 'react';
import { Settings, RotateCcw, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useDashboardConfigStore } from '@/stores/dashboard-config-store';
import { PANEL_REGISTRY, VIEW_PRESETS, resolveEnabledPanels } from '@/lib/dashboard/panel-registry';
import type { Currency, TimeHorizon, Aggregation } from '@/lib/dashboard/config';

export function ConfigToolbar() {
  const config = useDashboardConfigStore(s => s.config);
  const setCurrency = useDashboardConfigStore(s => s.setCurrency);
  const setTimeHorizon = useDashboardConfigStore(s => s.setTimeHorizon);
  const setRiskThresholds = useDashboardConfigStore(s => s.setRiskThresholds);
  const togglePanel = useDashboardConfigStore(s => s.togglePanel);
  const resetConfig = useDashboardConfigStore(s => s.resetConfig);
  const setConfig = useDashboardConfigStore(s => s.setConfig);
  const { currency, timeHorizon, riskThresholds, panels } = config;

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

      <div className="ml-auto">
        <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={resetConfig}>
          <RotateCcw className="h-2.5 w-2.5 mr-1" />重置
        </Button>
      </div>
    </div>
  );
}
