'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  Star, MapPin, Clock, Truck, MessageSquare, Shield,
  TrendingUp, TrendingDown, AlertTriangle, Lightbulb,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer,
} from 'recharts';
import { useAnalytics, useRateSupplier } from '@/hooks/use-supply-chain-data';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ==================== Types ====================

interface SupplierRatingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: {
    id: string;
    code: string;
    name: string;
    region: string;
    category: string;
    leadTime: number;
    rating: number;
    status: string;
    ratingDetails?: unknown;
    updatedAt?: string | Date;
  } | null;
}

// ==================== Dimension Config ====================

const RATING_DIMENSIONS = [
  { key: 'quality', label: '质量', icon: Star, color: 'text-emerald-500', bg: 'bg-emerald-500' },
  { key: 'delivery', label: '交货', icon: Truck, color: 'text-cyan-500', bg: 'bg-cyan-500' },
  { key: 'price', label: '价格', icon: TrendingDown, color: 'text-amber-500', bg: 'bg-amber-500' },
  { key: 'service', label: '服务', icon: MessageSquare, color: 'text-rose-500', bg: 'bg-rose-500' },
  { key: 'responsiveness', label: '响应', icon: TrendingUp, color: 'text-teal-500', bg: 'bg-teal-500' },
] as const;

type DimensionKey = typeof RATING_DIMENSIONS[number]['key'];

// ==================== Star Rating Component ====================

function InteractiveStarRating({ value, onChange, size = 'lg' }: {
  value: number;
  onChange: (rating: number) => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeMap = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-7 h-7' };
  const sizeClass = sizeMap[size];
  const [hoverStar, setHoverStar] = useState(0);

  const displayRating = hoverStar || value;

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const isFull = displayRating >= star;
        const isHalf = !isFull && displayRating >= star - 0.5;

        return (
          <button
            key={star}
            type="button"
            className={cn(
              'relative transition-transform duration-150 focus:outline-none',
              'hover:scale-125 cursor-pointer active:scale-95',
            )}
            onMouseEnter={() => setHoverStar(star)}
            onMouseLeave={() => setHoverStar(0)}
            onClick={() => {
              if (value === star) {
                onChange(star - 0.5);
              } else {
                onChange(star);
              }
            }}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
          >
            <svg className={cn(sizeClass, 'text-gray-200 dark:text-gray-700')} fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            {(isFull || isHalf) && (
              <svg
                className={cn(sizeClass, 'absolute inset-0 text-amber-400 transition-all duration-200')}
                fill="currentColor"
                viewBox="0 0 20 20"
                style={{ clipPath: isHalf ? 'inset(0 50% 0 0)' : undefined }}
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            )}
          </button>
        );
      })}
      <span className={cn(
        'ml-2 font-bold',
        size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-lg' : 'text-sm',
        value >= 4.5 ? 'text-green-600' : value >= 3.5 ? 'text-amber-500' : 'text-red-500'
      )}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

export function SupplierRatingDialog({ open, onOpenChange, supplier }: SupplierRatingDialogProps) {
  const { data: performanceData } = useAnalytics('supplier-performance');
  const rateSupplier = useRateSupplier();

  // Rating form state
  const [overallRating, setOverallRating] = useState(0);
  const [dimensionRatings, setDimensionRatings] = useState<Record<DimensionKey, number>>({
    quality: 0,
    delivery: 0,
    price: 0,
    service: 0,
    responsiveness: 0,
  });
  const [comments, setComments] = useState('');

  // Find matched performance data
  const matchedPerf = supplier && performanceData
    ? ((performanceData as Record<string, unknown>)?.suppliers as Record<string, unknown>[])?.find(
        (sp) => sp.code === supplier.code
      )
    : null;

  const metrics = matchedPerf?.metrics as Record<string, number> | undefined;

  // Compute radar chart data from dimension ratings
  const radarData = useMemo(() => {
    return RATING_DIMENSIONS.map(({ key, label }) => ({
      dimension: label,
      value: dimensionRatings[key] * 20, // Convert 5-star to 100 scale
      fullMark: 100,
    }));
  }, [dimensionRatings]);

  // Recommendation engine: auto-suggest based on performance data
  const recommendations = useMemo(() => {
    if (!metrics) return [];
    const recs: { text: string; type: 'up' | 'down' | 'info' }[] = [];

    if ((metrics.onTimeDeliveryRate ?? 0) < 70) {
      recs.push({ text: '准时交货率偏低，建议交货评分不超过3星', type: 'down' });
    } else if ((metrics.onTimeDeliveryRate ?? 0) >= 90) {
      recs.push({ text: '准时交货率优秀，建议交货评分4星以上', type: 'up' });
    }

    if ((metrics.qualityScore ?? 0) < 60) {
      recs.push({ text: '质量评分低于60，建议质量评分不超过3星', type: 'down' });
    } else if ((metrics.qualityScore ?? 0) >= 80) {
      recs.push({ text: '质量评分优秀，建议质量评分4星以上', type: 'up' });
    }

    if (matchedPerf?.riskLevel === 'high') {
      recs.push({ text: '该供应商风险等级较高，请谨慎评估', type: 'down' });
    } else if (matchedPerf?.riskLevel === 'low') {
      recs.push({ text: '该供应商风险等级较低，整体可靠', type: 'up' });
    }

    if ((metrics.overallScore ?? 0) >= 75) {
      recs.push({ text: '综合绩效分数良好，推荐总体评分4星以上', type: 'up' });
    }

    return recs;
  }, [metrics, matchedPerf]);

  // Reset form when supplier changes
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      setOverallRating(0);
      setDimensionRatings({ quality: 0, delivery: 0, price: 0, service: 0, responsiveness: 0 });
      setComments('');
    }
    onOpenChange(newOpen);
  }, [onOpenChange]);

  // Initialize rating from supplier data
  React.useEffect(() => {
    if (supplier && open) {
      setOverallRating(supplier.rating);
      const details = (supplier as Record<string, unknown>).ratingDetails as Record<string, unknown> | null | undefined;
      if (details) {
        const parsed: Record<DimensionKey, number> = { quality: 0, delivery: 0, price: 0, service: 0, responsiveness: 0 };
        // Map from existing ratingDetails fields
        if (typeof details.qualityScore === 'number') parsed.quality = Math.round(details.qualityScore / 2); // 10->5 scale
        if (typeof details.deliveryScore === 'number') parsed.delivery = Math.round(details.deliveryScore / 2);
        if (typeof details.priceScore === 'number') parsed.price = Math.round(details.priceScore / 2);
        if (typeof details.communicationScore === 'number') parsed.service = Math.round(details.communicationScore / 2);
        if (typeof details.comments === 'string') setComments(details.comments);
        setDimensionRatings(parsed);
      }
    }
  }, [supplier, open]);

  // Apply recommendations (auto-fill suggested ratings)
  const handleApplyRecommendations = useCallback(() => {
    if (!metrics) return;
    const suggested: Record<DimensionKey, number> = { ...dimensionRatings };

    if ((metrics.onTimeDeliveryRate ?? 0) < 70) {
      suggested.delivery = Math.min(suggested.delivery, 3);
    } else if ((metrics.onTimeDeliveryRate ?? 0) >= 90) {
      suggested.delivery = Math.max(suggested.delivery, 4);
    }

    if ((metrics.qualityScore ?? 0) < 60) {
      suggested.quality = Math.min(suggested.quality, 3);
    } else if ((metrics.qualityScore ?? 0) >= 80) {
      suggested.quality = Math.max(suggested.quality, 4);
    }

    if ((metrics.overallScore ?? 0) >= 75) {
      const avgDim = Object.values(suggested).reduce((a, b) => a + b, 0) / 5;
      if (avgDim < 4) {
        setOverallRating(Math.max(overallRating, 4));
      }
    }

    setDimensionRatings(suggested);
    toast.success('已应用系统建议', { description: '评分已根据绩效数据自动调整' });
  }, [metrics, dimensionRatings, overallRating]);

  // Submit rating
  const handleSubmit = useCallback(async () => {
    if (!supplier) return;
    if (overallRating === 0) {
      toast.error('请选择总体评分', { description: '至少需要给出1星评分' });
      return;
    }

    // Convert 5-star to 10-scale for API compatibility
    rateSupplier.mutate({
      id: supplier.id,
      rating: overallRating,
      deliveryScore: dimensionRatings.delivery * 2,
      qualityScore: dimensionRatings.quality * 2,
      priceScore: dimensionRatings.price * 2,
      communicationScore: dimensionRatings.service * 2,
      comments,
    }, {
      onSuccess: () => {
        toast.success('评分已保存', {
          description: `${supplier.name} 总体评分: ${overallRating.toFixed(1)}/5.0`,
        });
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error('保存失败', { description: error.message || '未知错误' });
      },
    });
  }, [supplier, overallRating, dimensionRatings, comments, rateSupplier, onOpenChange]);

  if (!supplier) return null;

  const statusColors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
    suspended: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
    inactive: 'bg-gray-100 text-gray-700 dark:bg-gray-950/30 dark:text-gray-300',
  };
  const statusLabels: Record<string, string> = { active: '活跃', suspended: '暂停', inactive: '停用' };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl backdrop-blur-sm border shadow-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-500" />
            供应商绩效评审
          </DialogTitle>
          <DialogDescription>对供应商进行综合评分与绩效回顾</DialogDescription>
        </DialogHeader>

        {/* ==================== Header: Supplier Info ==================== */}
        <div className="rounded-lg border bg-orange-50 dark:bg-orange-950/20 p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-bold text-lg">{supplier.name}</h3>
              <p className="text-xs text-muted-foreground font-mono">{supplier.code}</p>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-[10px] gap-1">
                <MapPin className="h-2.5 w-2.5" />
                {supplier.region}
              </Badge>
              <Badge className={cn('text-[10px]', statusColors[supplier.status] || statusColors.inactive)}>
                {statusLabels[supplier.status] || supplier.status}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />交货期 {supplier.leadTime}天</span>
            <span className="flex items-center gap-1"><Truck className="h-3 w-3" />{supplier.category}</span>
          </div>
        </div>

        {/* ==================== Overall Rating ==================== */}
        <div className="rounded-lg border p-4">
          <Label className="text-sm font-semibold mb-3 block">总体评分</Label>
          <div className="flex items-center justify-center py-2">
            <InteractiveStarRating
              value={overallRating}
              onChange={setOverallRating}
              size="lg"
            />
          </div>
          <p className="text-xs text-muted-foreground text-center mt-1">
            点击星星评分，再次点击同一颗星可给半星
          </p>
        </div>

        {/* ==================== Dimension Star Ratings + Radar Chart ==================== */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between mb-4">
            <Label className="text-sm font-semibold">详细评分</Label>
            {recommendations.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                onClick={handleApplyRecommendations}
              >
                <Lightbulb className="h-3 w-3" />
                应用建议
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Star Ratings for each dimension */}
            <div className="space-y-4">
              {RATING_DIMENSIONS.map(({ key, label, icon: Icon, color }) => (
                <div key={key} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className={cn('p-1 rounded-md', color.replace('text-', 'bg-').replace('500', '500/15'))}>
                      <Icon className={cn('h-3.5 w-3.5', color)} />
                    </div>
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <InteractiveStarRating
                    value={dimensionRatings[key]}
                    onChange={(val) => setDimensionRatings({ ...dimensionRatings, [key]: val })}
                    size="md"
                  />
                </div>
              ))}
            </div>

            {/* Right: Radar Chart */}
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="#e5e7eb" className="dark:opacity-20" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 8 }} />
                  <Radar
                    name="评分"
                    dataKey="value"
                    stroke="#f97316"
                    fill="#f97316"
                    fillOpacity={0.25}
                    strokeWidth={2}
                    animationDuration={600}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Comment field */}
          <div className="mt-4 space-y-2">
            <Label className="text-sm">评价备注</Label>
            <Textarea
              placeholder="请输入对该供应商的综合评价..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              className="text-sm"
            />
          </div>
        </div>

        {/* ==================== Recommendations ==================== */}
        {recommendations.length > 0 && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <Label className="text-sm font-semibold text-amber-700 dark:text-amber-400">系统建议</Label>
            </div>
            <div className="space-y-1.5">
              {recommendations.map((rec, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs">
                  {rec.type === 'up' ? (
                    <TrendingUp className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                  ) : rec.type === 'down' ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  ) : (
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  )}
                  <span className={cn(
                    rec.type === 'up' ? 'text-green-700 dark:text-green-400' :
                    rec.type === 'down' ? 'text-amber-700 dark:text-amber-400' :
                    'text-muted-foreground'
                  )}>
                    {rec.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* ==================== Actions ==================== */}
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            className="flex-1 bg-amber-500 text-white hover:bg-amber-600"
            onClick={handleSubmit}
            disabled={rateSupplier.isPending}
          >
            {rateSupplier.isPending ? '提交中...' : '提交评分'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
