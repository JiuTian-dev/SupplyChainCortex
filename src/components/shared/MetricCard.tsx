'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface MetricCardProps {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  unit?: string;
  trend?: string;
  subtitle?: string;
  color: string;
  bgColor: string;
  /** Dark mode background color override */
  darkBgColor?: string;
  /** Optional sparkline data array */
  sparkline?: number[];
  /** Optional detail text shown on click/tooltip */
  detail?: string;
}

export function MetricCard({
  icon,
  title,
  value,
  unit,
  trend,
  subtitle,
  color,
  bgColor,
  sparkline,
  detail,
  darkBgColor,
}: MetricCardProps) {
  const [displayValue, setDisplayValue] = useState<string | number>(0);
  const animRef = useRef<number>(0);

  // Animated counter for numeric values
  const prevValueRef = useRef(value);

  useEffect(() => {
    const numericValue =
      typeof value === 'number'
        ? value
        : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    if (isNaN(numericValue) || typeof value === 'string') {
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => setDisplayValue(value));
      }
      return;
    }

    const prevNum =
      typeof prevValueRef.current === 'number'
        ? prevValueRef.current
        : parseFloat(String(prevValueRef.current).replace(/[^0-9.-]/g, '')) || 0;
    const startValue = isNaN(prevNum) ? 0 : prevNum;
    const duration = 600;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = startValue + (numericValue - startValue) * eased;
      setDisplayValue(Math.round(current));
      if (progress < 1) {
        if (typeof requestAnimationFrame !== 'undefined') {
          animRef.current = requestAnimationFrame(animate);
        }
      }
    };
    if (typeof requestAnimationFrame !== 'undefined') {
      animRef.current = requestAnimationFrame(animate);
    }
    prevValueRef.current = value;
    return () => {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, [value]);

  // Trend direction indicators
  const isPositiveTrend = trend && (trend.startsWith('+') || trend.startsWith('✓'));
  const isNegativeTrend = trend && (trend.startsWith('-') || trend.startsWith('⚠'));
  const sparklineColor = isPositiveTrend
    ? '#22c55e'
    : isNegativeTrend
      ? '#ef4444'
      : '#94a3b8';

  // Solid color for top accent based on color prop
  const accentColorMap: Record<string, string> = {
    'text-orange-600': '#f97316',
    'text-emerald-600': '#10b981',
    'text-cyan-600': '#06b6d4',
    'text-violet-600': '#8b5cf6',
    'text-rose-600': '#f43f5e',
    'text-green-600': '#22c55e',
    'text-amber-600': '#f59e0b',
    'text-red-600': '#ef4444',
  };
  const accentColor = accentColorMap[color] || '#f97316';

  // Build sparkline SVG path from data array if provided
  const renderSparklineSvg = useCallback(() => {
    if (sparkline && sparkline.length >= 2) {
      const max = Math.max(...sparkline);
      const min = Math.min(...sparkline);
      const range = max - min || 1;
      const w = 28;
      const h = 14;
      const points = sparkline.map((v, i) => {
        const x = (i / (sparkline.length - 1)) * w;
        const y = h - ((v - min) / range) * h;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      const linePoints = points.join(' ');
      const lastPoint = sparkline[sparkline.length - 1];
      const lastX = w;
      const lastY = h - ((lastPoint - min) / range) * h;
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
          <polyline
            points={linePoints}
            fill="none"
            stroke={sparklineColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={lastX} cy={lastY} r="1.5" fill={sparklineColor} />
        </svg>
      );
    }

    // Default inline sparkline based on trend direction
    if (!trend) return null;
    return (
      <svg width="28" height="14" viewBox="0 0 28 14" className="shrink-0">
        {isPositiveTrend ? (
          <>
            <polyline
              points="2,11 9,7 16,8 24,3"
              fill="none"
              stroke={sparklineColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="24" cy="3" r="1.5" fill={sparklineColor} />
          </>
        ) : isNegativeTrend ? (
          <>
            <polyline
              points="2,3 9,7 16,5 24,11"
              fill="none"
              stroke={sparklineColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="24" cy="11" r="1.5" fill={sparklineColor} />
          </>
        ) : (
          <>
            <polyline
              points="2,7 9,6 16,8 24,7"
              fill="none"
              stroke={sparklineColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="24" cy="7" r="1.5" fill={sparklineColor} />
          </>
        )}
      </svg>
    );
  }, [sparkline, trend, isPositiveTrend, isNegativeTrend, sparklineColor]);

  // Tooltip detail content
  const tooltipContent = detail || `${title}: ${typeof value === 'number' ? value.toLocaleString() : value}${unit ? ` ${unit}` : ''}${trend ? ` (${trend})` : ''}`;

  const cardContent = (
    <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden cursor-pointer group border">
      {/* Thin top accent line */}
      <div className="h-[2px]" style={{ backgroundColor: accentColor }} />
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <p key={`num-${value}`} className="text-2xl font-bold tabular-nums number-count-anim">
                {typeof value === 'number' ? displayValue : value}
              </p>
              {unit && (
                <span className="text-xs text-muted-foreground">{unit}</span>
              )}
              {(trend || sparkline) && renderSparklineSvg()}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {subtitle}
                {trend && (
                  <span
                    className={`text-[10px] font-medium ${
                      isPositiveTrend
                        ? 'text-green-600'
                        : isNegativeTrend
                          ? 'text-amber-600'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {trend}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className={`p-2.5 rounded-xl ${bgColor} ${darkBgColor || ''} transition-transform duration-200 group-hover:scale-105`}>
            <div className={color}>{icon}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <UITooltip>
        <TooltipTrigger asChild>
          {cardContent}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[240px]">
          <p className="font-medium text-sm">{tooltipContent}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </TooltipContent>
      </UITooltip>
    </TooltipProvider>
  );
}
