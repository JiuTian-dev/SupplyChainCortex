'use client';

import { Settings, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useDashboardConfigStore } from '@/stores/dashboard-config-store';
import type { Currency, TimeHorizon, Aggregation } from '@/lib/dashboard/config';

export function ConfigToolbar() {
  const config = useDashboardConfigStore(s => s.config);
  const setCurrency = useDashboardConfigStore(s => s.setCurrency);
  const setTimeHorizon = useDashboardConfigStore(s => s.setTimeHorizon);
  const setRiskThresholds = useDashboardConfigStore(s => s.setRiskThresholds);
  const togglePanel = useDashboardConfigStore(s => s.togglePanel);
  const resetConfig = useDashboardConfigStore(s => s.resetConfig);
  const { currency, timeHorizon, aggregation, riskThresholds, panels } = config;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b text-xs flex-wrap">
      <Settings className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-[10px] text-muted-foreground font-medium shrink-0">配置</span>

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
          </SelectContent>
        </Select>
      </div>

      {/* Risk Thresholds */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">风险阈值</span>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-green-600">低</span>
                <Slider
                  value={[riskThresholds.low]}
                  onValueChange={([v]) => setRiskThresholds({ ...riskThresholds, low: v })}
                  min={0} max={30} step={1}
                  className="w-12 h-3"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent className="text-[10px]">低风险阈值: {riskThresholds.low}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-yellow-600">中</span>
                <Slider
                  value={[riskThresholds.medium]}
                  onValueChange={([v]) => setRiskThresholds({ ...riskThresholds, medium: v })}
                  min={20} max={60} step={1}
                  className="w-12 h-3"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent className="text-[10px]">中风险阈值: {riskThresholds.medium}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-red-600">高</span>
                <Slider
                  value={[riskThresholds.high]}
                  onValueChange={([v]) => setRiskThresholds({ ...riskThresholds, high: v })}
                  min={50} max={100} step={1}
                  className="w-12 h-3"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent className="text-[10px]">高风险阈值: {riskThresholds.high}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Separator orientation="vertical" className="h-4" />

      {/* Panel Toggles */}
      {Object.entries(panels).map(([key, visible]) => (
        <Badge
          key={key}
          variant={visible ? 'default' : 'outline'}
          className="text-[9px] h-5 px-1.5 cursor-pointer"
          onClick={() => togglePanel(key as keyof typeof panels)}
        >
          {key === 'monitor' ? '监控' : key === 'analysis' ? '分析' : key === 'decision' ? '决策' : '推演'}
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
