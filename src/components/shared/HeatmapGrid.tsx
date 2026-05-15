'use client';

import type { ReactNode } from 'react';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ─── Generic heatmap cell color helpers ──────────────────────────────────────

export interface HeatmapThreshold {
  max: number;
  bg: string;
  text?: string;
}

export function getHeatmapColor(value: number, thresholds: HeatmapThreshold[]): { bg: string; text: string } {
  for (const t of thresholds) {
    if (value <= t.max) return { bg: t.bg, text: t.text ?? 'text-inherit' };
  }
  const last = thresholds[thresholds.length - 1];
  return { bg: last.bg, text: last.text ?? 'text-inherit' };
}

export function getLegendColor(value: number, thresholds: HeatmapThreshold[]): string {
  for (const t of thresholds) {
    if (value <= t.max) return t.bg;
  }
  return thresholds[thresholds.length - 1].bg;
}

// ─── Color band thresholds for 5-level severity ──────────────────────────────

export const SEVERITY_THRESHOLDS: HeatmapThreshold[] = [
  { max: 0.25, bg: 'bg-green-100 dark:bg-green-900/20', text: 'text-green-900 dark:text-green-100' },
  { max: 0.50, bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-900 dark:text-yellow-100' },
  { max: 0.75, bg: 'bg-orange-200 dark:bg-orange-800/40', text: 'text-orange-900 dark:text-orange-100' },
  { max: 0.90, bg: 'bg-red-200 dark:bg-red-800/40', text: 'text-red-900 dark:text-red-100' },
  { max: 1.00, bg: 'bg-red-400 dark:bg-red-600', text: 'text-white' },
];

export const SEVERITY_LEGEND_BG: HeatmapThreshold[] = [
  { max: 0.25, bg: 'bg-green-100 dark:bg-green-900/20' },
  { max: 0.50, bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  { max: 0.75, bg: 'bg-orange-200 dark:bg-orange-800/40' },
  { max: 0.90, bg: 'bg-red-200 dark:bg-red-800/40' },
  { max: 1.00, bg: 'bg-red-400 dark:bg-red-600' },
];

// ─── Heatmap Cell ───────────────────────────────────────────────────────────

interface HeatmapCellProps {
  children: ReactNode;
  bg: string;
  text: string;
  tooltipContent?: ReactNode;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function HeatmapCell({ children, bg, text, tooltipContent, onClick, className = '', style }: HeatmapCellProps) {
  const cell = (
    <div
      onClick={onClick}
      className={`
        ${bg} ${text} px-2 py-2 rounded-md text-xs font-medium text-center
        ${onClick ? 'hover:scale-110 hover:z-10 transition-transform duration-200 cursor-pointer' : ''}
        select-none min-h-[36px] flex items-center justify-center
        ${className}
      `}
      style={style}
    >
      {children}
    </div>
  );

  if (tooltipContent) {
    return (
      <UITooltip>
        <TooltipTrigger asChild>{cell}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="bg-popover text-popover-foreground border shadow-lg max-w-[260px] text-xs"
        >
          {tooltipContent}
        </TooltipContent>
      </UITooltip>
    );
  }

  return cell;
}

// ─── Heatmap Legend ─────────────────────────────────────────────────────────

interface HeatmapLegendProps {
  thresholds: Array<{ label: string; bg: string }>;
  className?: string;
}

export function HeatmapLegend({ thresholds, className = '' }: HeatmapLegendProps) {
  return (
    <div className={`flex items-center gap-1 flex-wrap ${className}`}>
      {thresholds.map((item) => (
        <div key={item.label} className="flex items-center gap-1">
          <div className={`w-4 h-4 rounded-sm ${item.bg}`} />
          <span className="text-[10px] text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Heatmap Wrapper — provides TooltipProvider context ─────────────────────

interface HeatmapWrapperProps {
  children: ReactNode;
  delayDuration?: number;
}

export function HeatmapWrapper({ children, delayDuration = 150 }: HeatmapWrapperProps) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      {children}
    </TooltipProvider>
  );
}
