'use client';

import { useState, useMemo } from 'react';
import { Star, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import { cn } from '@/lib/utils';
import { CHART_TOOLTIP_STYLE } from './SupplierTab.helpers';
import type { Supplier } from '@prisma/client';

// ==================== Supplier Performance Panel ====================

interface SupplierPerformancePanelProps {
  supplierPerformance: Record<string, unknown> | null;
  suppliers: Supplier[];
}

export function SupplierPerformancePanel({ supplierPerformance, suppliers }: SupplierPerformancePanelProps) {
  const [supplierPerfExpanded, setSupplierPerfExpanded] = useState(false);

  // Performance radar chart data
  const radarData = useMemo(() => {
    if (!supplierPerformance || !Array.isArray((supplierPerformance as Record<string, unknown>).suppliers)) return [];
    const perfSuppliers = (supplierPerformance as Record<string, unknown>).suppliers as Record<string, unknown>[];
    if (perfSuppliers.length === 0) return [];
    const metrics = perfSuppliers.map((s) => s.metrics as Record<string, number>);
    if (metrics.length === 0) return [];
    const avgOverall = metrics.reduce((a, m) => a + (m.overallScore || 0), 0) / metrics.length;
    const avgOnTime = metrics.reduce((a, m) => a + (m.onTimeDeliveryRate || 0), 0) / metrics.length;
    const avgQuality = metrics.reduce((a, m) => a + (m.qualityScore || 0), 0) / metrics.length;
    const avgResponse = metrics.reduce((a, m) => a + (m.responseTime || 0), 0) / metrics.length;
    const avgFlexibility = metrics.reduce((a, m) => a + (m.flexibility || 0), 0) / metrics.length;
    return [
      { dimension: '综合评分', value: Math.round(avgOverall), fullMark: 100 },
      { dimension: '准时交货', value: Math.round(avgOnTime), fullMark: 100 },
      { dimension: '质量评分', value: Math.round(avgQuality), fullMark: 100 },
      { dimension: '响应速度', value: Math.round(avgResponse), fullMark: 100 },
      { dimension: '灵活性', value: Math.round(avgFlexibility), fullMark: 100 },
    ];
  }, [supplierPerformance]);

  if (!supplierPerformance || !(supplierPerformance as Record<string, unknown>).suppliers) return null;

  return (
    <Card className="card-dashboard hover:translate-y-[-2px] hover:shadow-lg hover:shadow-orange-500/5 hover:border-orange-200 dark:hover:border-orange-800 transition-all duration-300 ease-out">
      <CardHeader className="pb-2 bg-muted/30">
        <CardTitle className="text-base font-semibold flex items-center gap-2" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <Star className="h-4 w-4 text-orange-500" />
          绩效分析
          <Badge variant="outline" className="ml-auto text-xs font-normal">{((supplierPerformance as Record<string, unknown>).suppliers as unknown[]).length} 家评估</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Radar Chart */}
          {radarData.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2 text-center">供应商综合绩效雷达图</p>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="#e5e7eb" className="dark:opacity-20" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Radar name="平均绩效" dataKey="value" stroke="#f97316" fill="#f97316" fillOpacity={0.2} strokeWidth={2} animationDuration={800} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
          {/* Horizontal Bar Chart */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 text-center">供应商评分排名</p>
            <ResponsiveContainer width="100%" height={Math.max(180, ((supplierPerformance as Record<string, unknown>).suppliers as unknown[]).length * 36)}>
              <BarChart data={(supplierPerformance as Record<string, unknown>).suppliers as Record<string, unknown>[]} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="dark:opacity-20" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number, name: string) => [`${value}`, name === 'overallScore' ? '综合评分' : name]} />
                <Bar dataKey="metrics.overallScore" name="overallScore" radius={[0, 4, 4, 0]} animationDuration={800}>
                  {((supplierPerformance as Record<string, unknown>).suppliers as Record<string, unknown>[]).map((s: Record<string, unknown>, idx: number) => (
                    <Cell key={idx} fill={s.riskLevel === 'high' ? '#ef4444' : s.riskLevel === 'medium' ? '#eab308' : '#22c55e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 汇总指标卡 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <p className="text-xs text-muted-foreground">平均准时率</p>
            <p className="text-xl font-bold metric-flash">{(supplierPerformance as Record<string, unknown>).summary ? String(((supplierPerformance as Record<string, unknown>).summary as Record<string, unknown>).avgOnTimeRate ?? '--') : '--'}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <p className="text-xs text-muted-foreground">高风险数</p>
            <p className="text-xl font-bold text-red-600 metric-flash">{(supplierPerformance as Record<string, unknown>).summary ? String(((supplierPerformance as Record<string, unknown>).summary as Record<string, unknown>).highRiskCount ?? 0) : '0'}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <p className="text-xs text-muted-foreground">最佳供应商</p>
            <p className="text-sm font-bold text-emerald-600 truncate metric-flash">{(supplierPerformance as Record<string, unknown>).summary ? String(((supplierPerformance as Record<string, unknown>).summary as Record<string, unknown>).topPerformer ?? '--') : '--'}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <p className="text-xs text-muted-foreground">交货期均值</p>
            <p className="text-xl font-bold metric-flash">{suppliers.length > 0 ? `${Math.round(suppliers.reduce((a, s) => a + s.leadTime, 0) / suppliers.length)}天` : '--'}</p>
          </div>
        </div>

        {/* 查看详情展开区 */}
        <div className="mt-4">
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setSupplierPerfExpanded(!supplierPerfExpanded)}>
            {supplierPerfExpanded ? '收起详情' : '查看详情'}
            <ChevronRight className={cn('h-3 w-3 transition-transform duration-300', supplierPerfExpanded && 'rotate-90')} />
          </Button>
          {supplierPerfExpanded && (
            <div className="mt-3 rounded-lg border overflow-hidden drill-down-panel">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs uppercase tracking-wider">排名</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">供应商</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">准时率</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">质量分</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">交货期</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">风险</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">建议</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {((supplierPerformance as Record<string, unknown>).suppliers as Record<string, unknown>[]).map((s: Record<string, unknown>) => {
                    const metrics = s.metrics as Record<string, number>;
                    return (
                      <TableRow key={String(s.code)} className="hover:bg-orange-50/50 dark:hover:bg-orange-950/20 border-l-[3px] hover:border-l-orange-400 transition-colors duration-200">
                        <TableCell className="font-bold text-sm">#{String(s.rank)}</TableCell>
                        <TableCell className="font-medium text-sm">{String(s.name)}</TableCell>
                        <TableCell className="text-sm">{metrics?.onTimeDeliveryRate}%</TableCell>
                        <TableCell className="text-sm">{metrics?.qualityScore}</TableCell>
                        <TableCell className="text-sm">{String(s.leadTime)}天</TableCell>
                        <TableCell>
                          <Badge className={cn('text-[10px]', s.riskLevel === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300' : s.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300' : 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300')}>
                            {s.riskLevel === 'high' ? '高风险' : s.riskLevel === 'medium' ? '中风险' : '低风险'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{String(s.recommendation || '')}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
