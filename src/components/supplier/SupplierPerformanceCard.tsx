'use client';

import React, { useEffect, useRef } from 'react';
import { Star, Clock, Truck, Shield, TrendingUp, TrendingDown, Minus, MessageSquare } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface RatingDetails {
  deliveryScore?: number;
  qualityScore?: number;
  priceScore?: number;
  communicationScore?: number;
  comments?: string;
  ratedAt?: string;
}

interface SupplierPerformanceCardProps {
  supplier: {
    id: string;
    code: string;
    name: string;
    region: string;
    category: string;
    leadTime: number;
    rating: number;
    status: string;
    ratingDetails?: RatingDetails | string | null;
  };
  metrics?: {
    onTimeDeliveryRate?: number;
    qualityScore?: number;
    overallScore?: number;
    leadTimeConsistency?: number;
  };
  riskLevel?: string;
  onClick?: () => void;
}

// Sub-score colors and labels
const SUB_SCORE_CONFIG = [
  { key: 'deliveryScore' as const, label: '交货', color: 'bg-blue-500', icon: Truck },
  { key: 'qualityScore' as const, label: '质量', color: 'bg-emerald-500', icon: Star },
  { key: 'priceScore' as const, label: '价格', color: 'bg-amber-500', icon: null },
  { key: 'communicationScore' as const, label: '沟通', color: 'bg-violet-500', icon: MessageSquare },
];

// Animated circular gauge component with micro-animation using ref-based DOM manipulation
function ScoreGauge({ score, size = 56 }: { score: number; size?: number }) {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, score));
  const circleRef = useRef<SVGCircleElement>(null);

  // Color based on score
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : score >= 40 ? '#f97316' : '#ef4444';
  const bgColor = score >= 80 ? '#22c55e20' : score >= 60 ? '#f59e0b20' : score >= 40 ? '#f9731620' : '#ef444420';

  // Micro-animation: use ref to directly animate strokeDashoffset with CSS transition
  const targetOffset = circumference - (progress / 100) * circumference;

  useEffect(() => {
    const el = circleRef.current;
    if (!el) return;
    // Set initial empty state
    el.style.strokeDashoffset = String(circumference);
    // Animate to target on next frame
    const raf = requestAnimationFrame(() => {
      el.style.strokeDashoffset = String(targetOffset);
    });
    return () => cancelAnimationFrame(raf);
  }, [circumference, targetOffset]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        {/* Progress arc with micro-animation */}
        <circle
          ref={circleRef}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
          style={{
            filter: `drop-shadow(0 0 4px ${color}40)`,
          }}
        />
      </svg>
      {/* Score text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold" style={{ color }}>{score}</span>
      </div>
      {/* Glow effect */}
      <div
        className="absolute inset-0 rounded-full blur-md opacity-20"
        style={{ backgroundColor: color, background: bgColor }}
      />
    </div>
  );
}

// Mini metric bar
function MiniMetric({ label, value, max = 100, unit = '' }: {
  label: string; value: number; max?: number; unit?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="text-[10px] font-semibold">{value}{unit}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Sub-score mini bar for rating details
function SubScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.min(100, (value / 10) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-muted-foreground w-6 shrink-0">{label}</span>
      <div className="h-1 bg-muted rounded-full overflow-hidden flex-1">
        <div
          className={cn('h-full rounded-full', color)}
          style={{
            width: `${pct}%`,
            transition: 'width 0.6s ease-out',
          }}
        />
      </div>
      <span className="text-[9px] font-semibold w-4 text-right">{value}</span>
    </div>
  );
}

export function SupplierPerformanceCard({ supplier, metrics, riskLevel, onClick }: SupplierPerformanceCardProps) {
  const overallScore = metrics?.overallScore ?? Math.round(supplier.rating * 20);
  const onTimeRate = metrics?.onTimeDeliveryRate ?? 0;
  const qualityScore = metrics?.qualityScore ?? 0;

  // Parse ratingDetails
  let ratingDetails: RatingDetails | null = null;
  if (supplier.ratingDetails) {
    if (typeof supplier.ratingDetails === 'string') {
      try {
        ratingDetails = JSON.parse(supplier.ratingDetails);
      } catch {
        // ignore
      }
    } else if (typeof supplier.ratingDetails === 'object') {
      ratingDetails = supplier.ratingDetails as RatingDetails;
    }
  }

  // Trend indicator based on rating vs average
  const trendIcon = supplier.rating >= 4 ? TrendingUp : supplier.rating >= 3 ? Minus : TrendingDown;
  const TrendIcon = trendIcon;

  // Tooltip content with rating breakdown
  const tooltipContent = ratingDetails ? (
    <div className="space-y-1.5 py-1">
      <p className="font-semibold text-xs border-b border-border pb-1 mb-1">评分明细</p>
      {SUB_SCORE_CONFIG.map(({ key, label }) => {
        const val = ratingDetails?.[key];
        return val !== undefined ? (
          <div key={key} className="flex items-center justify-between gap-4 text-[11px]">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{val}/10</span>
          </div>
        ) : null;
      })}
      {ratingDetails.comments && (
        <p className="text-[10px] text-muted-foreground italic mt-1 border-t border-border pt-1">
          &ldquo;{ratingDetails.comments}&rdquo;
        </p>
      )}
      {ratingDetails.ratedAt && (
        <p className="text-[9px] text-muted-foreground mt-0.5">
          评价于 {new Date(ratingDetails.ratedAt).toLocaleDateString('zh-CN')}
        </p>
      )}
    </div>
  ) : (
    <p className="text-xs py-1">暂无详细评分</p>
  );

  return (
    <Card
      className={cn(
        'hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer group',
        'hover:border-orange-300 dark:hover:border-orange-700',
        'border-l-[3px]',
        riskLevel === 'high' ? 'border-l-red-500' : riskLevel === 'medium' ? 'border-l-amber-500' : 'border-l-green-500',
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Gauge with tooltip */}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="shrink-0 mt-1 cursor-default">
                  <ScoreGauge score={overallScore} />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[200px]">
                {tooltipContent}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-semibold text-sm truncate group-hover:text-orange-600 transition-colors">
                {supplier.name}
              </h4>
              <Badge variant="outline" className="text-[9px] shrink-0 ml-1">{supplier.region}</Badge>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <svg
                    key={star}
                    className={cn('w-3 h-3', star <= Math.round(supplier.rating) ? 'text-amber-400' : 'text-gray-200 dark:text-gray-700')}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
                <span className={cn(
                  'text-xs font-medium ml-1',
                  supplier.rating >= 4.5 ? 'text-green-600' : supplier.rating >= 3.5 ? 'text-amber-500' : 'text-red-500'
                )}>
                  {supplier.rating.toFixed(1)}
                </span>
                <TrendIcon className={cn(
                  'h-3 w-3 ml-0.5',
                  supplier.rating >= 4 ? 'text-green-500' : supplier.rating >= 3 ? 'text-muted-foreground' : 'text-red-500'
                )} />
              </div>
            </div>

            {/* Mini metrics from computed data */}
            <div className="space-y-1.5">
              <MiniMetric label="准时交货" value={onTimeRate} unit="%" />
              <MiniMetric label="质量评分" value={qualityScore} />
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-2.5 w-2.5" />
                <span>交货期 {supplier.leadTime}天</span>
                <Truck className="h-2.5 w-2.5 ml-1" />
                <span>{supplier.category}</span>
              </div>
            </div>

            {/* Sub-scores from ratingDetails if available */}
            {ratingDetails && (
              <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                {SUB_SCORE_CONFIG.map(({ key, label, color }) => {
                  const val = ratingDetails?.[key];
                  return val !== undefined ? (
                    <SubScoreBar key={key} label={label} value={val} color={color} />
                  ) : null;
                })}
                {ratingDetails.comments && (
                  <p className="text-[9px] text-muted-foreground italic mt-1 line-clamp-1">
                    &ldquo;{ratingDetails.comments}&rdquo;
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Risk badge */}
        {riskLevel && (
          <div className="mt-2 flex items-center gap-1">
            <Shield className={cn(
              'h-3 w-3',
              riskLevel === 'high' ? 'text-red-500' : riskLevel === 'medium' ? 'text-amber-500' : 'text-green-500'
            )} />
            <Badge className={cn(
              'text-[9px]',
              riskLevel === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300' :
              riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300' :
              'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300'
            )}>
              {riskLevel === 'high' ? '高风险' : riskLevel === 'medium' ? '中风险' : '低风险'}
            </Badge>
            <span className="text-[9px] text-muted-foreground ml-auto">点击查看详情 →</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
