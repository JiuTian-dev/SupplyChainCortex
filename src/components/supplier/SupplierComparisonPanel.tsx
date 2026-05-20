'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  GitCompareArrows, CheckCircle2, Download, Star, Shield,
  Clock, Globe, Truck, MessageSquare,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CHART_COLORS } from '@/lib/constants';
import type { Supplier } from '@prisma/client';

// ==================== Types ====================

interface RatingDetails {
  deliveryScore?: number;
  qualityScore?: number;
  priceScore?: number;
  communicationScore?: number;
  comments?: string;
  ratedAt?: string;
}

interface PerfMetrics {
  onTimeDeliveryRate?: number;
  qualityScore?: number;
  overallScore?: number;
  leadTimeConsistency?: number;
  responseTime?: number;
  flexibility?: number;
}

interface SupplierPerfEntry {
  code: string;
  name: string;
  riskLevel?: string;
  metrics?: PerfMetrics;
  leadTime?: number;
  recommendation?: string;
}

interface SupplierComparisonPanelProps {
  suppliers: Supplier[];
  supplierPerformance: Record<string, unknown> | null;
}

// ==================== Helpers ====================

const COMPARISON_COLORS = ['#f97316', '#22c55e', '#06b6d4', '#8b5cf6'];

function parseRatingDetails(raw: unknown): RatingDetails | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  if (typeof raw === 'object') return raw as RatingDetails;
  return null;
}

function getRiskBadge(level: string | undefined) {
  if (!level) return <Badge className="text-[9px] bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">未知</Badge>;
  const config: Record<string, { label: string; cls: string }> = {
    high: { label: '高风险', cls: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300' },
    medium: { label: '中风险', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300' },
    low: { label: '低风险', cls: 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300' },
  };
  const c = config[level] || { label: level, cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' };
  return <Badge className={cn('text-[9px]', c.cls)}>{c.label}</Badge>;
}

function renderStars(rating: number) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={cn('w-3 h-3', star <= Math.round(rating) ? 'text-amber-400' : 'text-gray-200 dark:text-gray-700')}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <span className={cn(
        'text-xs font-medium',
        rating >= 4.5 ? 'text-green-600' : rating >= 3.5 ? 'text-amber-500' : 'text-red-500',
      )}>
        {rating.toFixed(1)}
      </span>
    </div>
  );
}

// ==================== Main Component ====================

export function SupplierComparisonPanel({ suppliers, supplierPerformance }: SupplierComparisonPanelProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [animatedIn, setAnimatedIn] = useState(false);

  // Trigger entrance animation
  React.useEffect(() => {
    const t = setTimeout(() => setAnimatedIn(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Build performance map: code -> performance entry
  const perfMap = useMemo(() => {
    const map = new Map<string, SupplierPerfEntry>();
    if (!supplierPerformance) return map;
    const perfSuppliers = (supplierPerformance as Record<string, unknown>).suppliers;
    if (!Array.isArray(perfSuppliers)) return map;
    for (const sp of perfSuppliers as Record<string, unknown>[]) {
      map.set(String(sp.code), {
        code: String(sp.code),
        name: String(sp.name),
        riskLevel: sp.riskLevel as string | undefined,
        metrics: sp.metrics as PerfMetrics | undefined,
        leadTime: sp.leadTime as number | undefined,
        recommendation: sp.recommendation as string | undefined,
      });
    }
    return map;
  }, [supplierPerformance]);

  // Toggle supplier selection
  const toggleSupplier = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) {
        toast.warning('最多选择4家供应商对比');
        return prev;
      }
      return [...prev, id];
    });
  }, []);

  // Selected supplier records with performance data
  const selectedSuppliers = useMemo(
    () => selectedIds.map((id) => suppliers.find((s) => s.id === id)).filter(Boolean) as Supplier[],
    [selectedIds, suppliers],
  );

  // Compute comparison rows with "best" indicators
  const comparisonData = useMemo(() => {
    if (selectedSuppliers.length < 2) return null;

    return selectedSuppliers.map((s) => {
      const perf = perfMap.get(s.code);
      const ratingDetails = parseRatingDetails(s.ratingDetails);
      return {
        supplier: s,
        perf,
        ratingDetails,
        // Basic info
        name: s.name,
        code: s.code,
        region: s.region,
        category: s.category,
        leadTime: s.leadTime,
        status: s.status,
        // Rating
        rating: s.rating,
        deliveryScore: ratingDetails?.deliveryScore ?? 0,
        qualityScore: ratingDetails?.qualityScore ?? 0,
        priceScore: ratingDetails?.priceScore ?? 0,
        communicationScore: ratingDetails?.communicationScore ?? 0,
        // Performance metrics
        onTimeDeliveryRate: perf?.metrics?.onTimeDeliveryRate ?? 0,
        perfQualityScore: perf?.metrics?.qualityScore ?? 0,
        overallScore: perf?.metrics?.overallScore ?? Math.round(s.rating * 20),
        leadTimeConsistency: perf?.metrics?.leadTimeConsistency ?? 0,
        // Risk
        riskLevel: perf?.riskLevel ?? 'unknown',
      };
    });
  }, [selectedSuppliers, perfMap]);

  // Determine "best" values for winner indicators
  const bestValues = useMemo(() => {
    if (!comparisonData || comparisonData.length < 2) return {};
    const rows = comparisonData;
    return {
      rating: Math.max(...rows.map((r) => r.rating)),
      deliveryScore: Math.max(...rows.map((r) => r.deliveryScore)),
      qualityScore: Math.max(...rows.map((r) => r.qualityScore)),
      priceScore: Math.max(...rows.map((r) => r.priceScore)),
      communicationScore: Math.max(...rows.map((r) => r.communicationScore)),
      onTimeDeliveryRate: Math.max(...rows.map((r) => r.onTimeDeliveryRate)),
      perfQualityScore: Math.max(...rows.map((r) => r.perfQualityScore)),
      overallScore: Math.max(...rows.map((r) => r.overallScore)),
      leadTimeConsistency: Math.max(...rows.map((r) => r.leadTimeConsistency)),
      leadTime: Math.min(...rows.map((r) => r.leadTime)), // lower is better
      riskLevel: rows.reduce((best, r) => {
        const order: Record<string, number> = { low: 0, medium: 1, high: 2, unknown: 3 };
        return (order[r.riskLevel] ?? 3) < (order[best.riskLevel] ?? 3) ? r : best;
      }).code,
    };
  }, [comparisonData]);

  // Radar chart data for overlaid suppliers
  const radarData = useMemo(() => {
    if (!comparisonData || comparisonData.length < 2) return [];
    const dimensions = [
      { key: 'onTimeDeliveryRate' as const, label: '准时交货' },
      { key: 'perfQualityScore' as const, label: '质量评分' },
      { key: 'overallScore' as const, label: '综合评分' },
      { key: 'leadTimeConsistency' as const, label: '交货稳定' },
      { key: 'deliveryScore' as const, label: '交货评分' },
      { key: 'communicationScore' as const, label: '沟通评分' },
    ];
    return dimensions.map(({ key, label }) => {
      const point: Record<string, string | number> = { dimension: label, fullMark: 100 };
      comparisonData.forEach((row, idx) => {
        const supplierKey = `supplier_${idx}`;
        point[supplierKey] = row[key] ?? 0;
      });
      return point;
    });
  }, [comparisonData]);

  // Export comparison as CSV
  const handleExportCSV = useCallback(() => {
    if (!comparisonData || comparisonData.length < 2) return;
    const headers = [
      '维度', ...comparisonData.map((r) => `${r.name}(${r.code})`),
    ];
    const rows = [
      ['名称', ...comparisonData.map((r) => r.name)],
      ['编码', ...comparisonData.map((r) => r.code)],
      ['地区', ...comparisonData.map((r) => r.region)],
      ['品类', ...comparisonData.map((r) => r.category)],
      ['交货期(天)', ...comparisonData.map((r) => String(r.leadTime))],
      ['状态', ...comparisonData.map((r) => r.status)],
      ['综合评分', ...comparisonData.map((r) => String(r.rating))],
      ['交货评分', ...comparisonData.map((r) => String(r.deliveryScore))],
      ['质量评分', ...comparisonData.map((r) => String(r.qualityScore))],
      ['价格评分', ...comparisonData.map((r) => String(r.priceScore))],
      ['沟通评分', ...comparisonData.map((r) => String(r.communicationScore))],
      ['准时交货率(%)', ...comparisonData.map((r) => String(r.onTimeDeliveryRate))],
      ['绩效质量分', ...comparisonData.map((r) => String(r.perfQualityScore))],
      ['绩效综合分', ...comparisonData.map((r) => String(r.overallScore))],
      ['交货稳定性', ...comparisonData.map((r) => String(r.leadTimeConsistency))],
      ['风险等级', ...comparisonData.map((r) => r.riskLevel)],
    ];
    const csvContent = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supplier_comparison_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('对比数据已导出为CSV');
  }, [comparisonData]);

  // Comparison table sections
  const sections = useMemo(() => {
    if (!comparisonData) return [];
    return [
      {
        title: '基本信息',
        icon: <Globe className="h-3 w-3" />,
        rows: [
          { label: '名称', key: 'name', type: 'text' as const },
          { label: '编码', key: 'code', type: 'text' as const },
          { label: '地区', key: 'region', type: 'text' as const },
          { label: '品类', key: 'category', type: 'text' as const },
          { label: '交货期', key: 'leadTime', type: 'leadTime' as const },
          { label: '状态', key: 'status', type: 'status' as const },
        ],
      },
      {
        title: '评分',
        icon: <Star className="h-3 w-3" />,
        rows: [
          { label: '综合评分', key: 'rating', type: 'rating' as const },
          { label: '交货评分', key: 'deliveryScore', type: 'score' as const, best: 'deliveryScore' },
          { label: '质量评分', key: 'qualityScore', type: 'score' as const, best: 'qualityScore' },
          { label: '价格评分', key: 'priceScore', type: 'score' as const, best: 'priceScore' },
          { label: '沟通评分', key: 'communicationScore', type: 'score' as const, best: 'communicationScore' },
        ],
      },
      {
        title: '绩效指标',
        icon: <Truck className="h-3 w-3" />,
        rows: [
          { label: '准时交货率', key: 'onTimeDeliveryRate', type: 'percent' as const, best: 'onTimeDeliveryRate' },
          { label: '质量分', key: 'perfQualityScore', type: 'score' as const, best: 'perfQualityScore' },
          { label: '综合绩效分', key: 'overallScore', type: 'score' as const, best: 'overallScore' },
          { label: '交货稳定性', key: 'leadTimeConsistency', type: 'score' as const, best: 'leadTimeConsistency' },
        ],
      },
      {
        title: '风险等级',
        icon: <Shield className="h-3 w-3" />,
        rows: [
          { label: '风险等级', key: 'riskLevel', type: 'risk' as const, best: 'riskLevel' },
        ],
      },
    ];
  }, [comparisonData]);

  const renderCell = (row: typeof sections[number]['rows'][number], data: typeof comparisonData extends (infer T)[] | null ? T : never, idx: number) => {
    if (!data) return null;
    const value = (data as Record<string, unknown>)[row.key];
    let isBest = false;

    if (row.key === 'leadTime') {
      isBest = value === bestValues.leadTime;
    } else if ('best' in row && row.best && row.key !== 'riskLevel') {
      isBest = value === (bestValues as Record<string, unknown>)[row.best];
    } else if (row.key === 'riskLevel') {
      isBest = data.code === bestValues.riskLevel;
    } else if (row.key === 'rating') {
      isBest = value === bestValues.rating;
    }

    return (
      <td
        key={idx}
        className={cn(
          'px-3 py-2.5 text-sm text-center relative border-r last:border-r-0 border-border/50',
          isBest && 'bg-green-50/80 dark:bg-green-950/20',
        )}
      >
        <div className="flex items-center justify-center gap-1">
          {row.type === 'rating' && typeof value === 'number' && renderStars(value)}
          {row.type === 'status' && (
            <Badge className={cn(
              'text-[9px]',
              value === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' :
              value === 'suspended' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' :
              'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
            )}>
              {value === 'active' ? '活跃' : value === 'suspended' ? '暂停' : '停用'}
            </Badge>
          )}
          {row.type === 'risk' && getRiskBadge(value as string)}
          {row.type === 'leadTime' && <span>{String(value)}天</span>}
          {row.type === 'percent' && <span>{String(value)}%</span>}
          {row.type === 'score' && <span>{String(value)}</span>}
          {row.type === 'text' && <span className="truncate max-w-[120px] inline-block">{String(value)}</span>}
          {isBest && (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
          )}
        </div>
      </td>
    );
  };

  return (
    <Card
      className={cn(
        'card-dashboard hover:translate-y-[-2px] hover:shadow-lg hover:shadow-orange-500/5 hover:border-orange-200 dark:hover:border-orange-800 transition-all duration-300 ease-out overflow-hidden',
        animatedIn && 'opacity-100 translate-y-0',
        !animatedIn && 'opacity-0 translate-y-4',
      )}
     
    >
      <CardHeader className="pb-3 bg-muted/30">
        <CardTitle className="text-base font-semibold flex items-center gap-2" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <GitCompareArrows className="h-4 w-4 text-orange-500" />
          供应商对比
          <span className="text-xs text-muted-foreground font-normal ml-1">选择多个供应商进行并排对比</span>
          {selectedIds.length >= 2 && (
            <Badge variant="outline" className="ml-auto text-xs font-normal">{selectedIds.length} 家已选</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ==================== Supplier Selector ==================== */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">选择2-4家供应商进行对比：</p>
          <div className="flex flex-wrap gap-2">
            {suppliers.map((s) => {
              const isSelected = selectedIds.includes(s.id);
              const isDisabled = !isSelected && selectedIds.length >= 4;
              return (
                <label
                  key={s.id}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all duration-200 text-sm',
                    isSelected
                      ? 'border-orange-400 bg-orange-50 dark:border-orange-600 dark:bg-orange-950/30 shadow-sm'
                      : isDisabled
                        ? 'border-border/50 bg-muted/30 opacity-50 cursor-not-allowed'
                        : 'border-border hover:border-orange-300 hover:bg-orange-50/50 dark:hover:border-orange-700 dark:hover:bg-orange-950/10',
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={isDisabled}
                    onCheckedChange={() => toggleSupplier(s.id)}
                    className="pointer-events-none"
                  />
                  <span className="truncate max-w-[120px]">{s.name}</span>
                  <Badge variant="outline" className="text-[8px] shrink-0 ml-0.5">{s.code}</Badge>
                </label>
              );
            })}
          </div>
        </div>

        {/* ==================== Comparison Content ==================== */}
        {selectedSuppliers.length >= 2 && comparisonData ? (
          <>
            <Separator />

            {/* ==================== Comparison Table ==================== */}
            <div className="overflow-x-auto custom-scrollbar rounded-lg border">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-[100px] border-r border-border/50">
                      维度
                    </th>
                    {comparisonData.map((data, idx) => (
                      <th
                        key={data.supplier.id}
                        className="px-3 py-2 text-center text-xs font-semibold border-r last:border-r-0 border-border/50"
                        style={{ color: COMPARISON_COLORS[idx] }}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="truncate max-w-[120px]">{data.name}</span>
                          <span className="text-[9px] text-muted-foreground font-normal">{data.code}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sections.map((section, sIdx) => (
                    <React.Fragment key={section.title}>
                      {/* Section header row */}
                      <tr
                        className={cn(
                          'bg-muted/20',
                          sIdx > 0 && 'border-t-2 border-border/30',
                        )}
                        style={{ animationDelay: `${sIdx * 100}ms` }}
                      >
                        <td
                          colSpan={1 + comparisonData.length}
                          className="px-3 py-1.5"
                        >
                          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            {section.icon}
                            {section.title}
                          </div>
                        </td>
                      </tr>
                      {/* Data rows */}
                      {section.rows.map((row) => (
                        <tr
                          key={row.key}
                          className="hover:bg-orange-50/30 dark:hover:bg-orange-950/10 transition-colors duration-150 border-t border-border/30"
                        >
                          <td className="px-3 py-2.5 text-xs text-muted-foreground border-r border-border/50 whitespace-nowrap">
                            {row.label}
                          </td>
                          {comparisonData.map((data, idx) => renderCell(row, data, idx))}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ==================== Radar Chart ==================== */}
            {radarData.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2 text-center">供应商多维对比雷达图</p>
                <div className="w-full max-w-[500px] mx-auto">
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                      <PolarGrid stroke="#e5e7eb" className="dark:opacity-20" />
                      <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 8 }} />
                      {comparisonData.map((_, idx) => (
                        <Radar
                          key={idx}
                          name={_.name}
                          dataKey={`supplier_${idx}`}
                          stroke={COMPARISON_COLORS[idx]}
                          fill={COMPARISON_COLORS[idx]}
                          fillOpacity={0.1}
                          strokeWidth={2}
                          animationDuration={800 + idx * 200}
                        />
                      ))}
                      <Tooltip
                        contentStyle={{
                          borderRadius: '10px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          border: '1px solid #e5e7eb',
                          fontSize: '12px',
                          backgroundColor: 'var(--tooltip-bg, #fff)',
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: '11px' }}
                        formatter={(value: string, entry) => {
                          const idx = parseInt(value.replace('supplier_', ''));
                          const name = comparisonData[idx]?.name || value;
                          return <span style={{ color: entry.color }}>{name}</span>;
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ==================== Export Button ==================== */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleExportCSV}
              >
                <Download className="h-3.5 w-3.5" />
                导出对比CSV
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <GitCompareArrows className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">请选择至少2家供应商开始对比</p>
            <p className="text-xs mt-1">最多可同时对比4家供应商</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
