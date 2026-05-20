'use client';

import React, { useMemo } from 'react';
import {
  BarChart3, TrendingUp, PieChart as PieChartIcon, Clock, Tag,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, Legend,
  PieChart, Pie,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import { cn } from '@/lib/utils';
import { CHART_COLORS } from '@/lib/constants';
import type { Supplier } from '@prisma/client';

// ==================== Types ====================

interface SupplierAnalyticsPanelProps {
  suppliers: Supplier[];
  supplierPerformance: Record<string, unknown> | null;
}

// ==================== Tooltip Style ====================

const CHART_TOOLTIP_STYLE = {
  borderRadius: '10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  border: '1px solid #e5e7eb',
  fontSize: '12px',
  backgroundColor: 'var(--tooltip-bg, #fff)',
};

// ==================== Gradient Color Helper ====================

function getScoreGradientColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

// ==================== Main Component ====================

export function SupplierAnalyticsPanel({ suppliers, supplierPerformance }: SupplierAnalyticsPanelProps) {
  // Extract performance suppliers array
  const perfSuppliers = useMemo(() => {
    if (!supplierPerformance) return [];
    const arr = (supplierPerformance as Record<string, unknown>).suppliers;
    if (!Array.isArray(arr)) return [];
    return arr as Record<string, unknown>[];
  }, [supplierPerformance]);

  // 1. Supplier Score Ranking - Bar Chart
  const scoreRankingData = useMemo(() => {
    if (perfSuppliers.length === 0 && suppliers.length === 0) return [];
    if (perfSuppliers.length > 0) {
      return [...perfSuppliers]
        .sort((a, b) => {
          const scoreA = (a.metrics as Record<string, number>)?.overallScore ?? 0;
          const scoreB = (b.metrics as Record<string, number>)?.overallScore ?? 0;
          return scoreB - scoreA;
        })
        .map((s) => ({
          name: String(s.name),
          score: (s.metrics as Record<string, number>)?.overallScore ?? 0,
          riskLevel: String(s.riskLevel ?? 'unknown'),
        }));
    }
    // Fallback from suppliers with rating
    return [...suppliers]
      .sort((a, b) => b.rating - a.rating)
      .map((s) => ({
        name: s.name,
        score: Math.round(s.rating * 20), // Convert 5-star to 100 scale
        riskLevel: 'unknown',
      }));
  }, [perfSuppliers, suppliers]);

  // 2. Performance Trend - Line Chart (simulated 6-month trend)
  const performanceTrendData = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return `${d.getMonth() + 1}月`;
    });
    return months.map((month, idx) => {
      const point: Record<string, string | number> = { month };
      // Show top 4 suppliers trend
      const topSuppliers = perfSuppliers.slice(0, 4);
      topSuppliers.forEach((s, sIdx) => {
        const baseScore = (s.metrics as Record<string, number>)?.overallScore ?? 50;
        const variation = Math.sin((idx + sIdx) * 0.8) * 5;
        point[String(s.name)] = Math.round(baseScore + variation);
      });
      return point;
    });
  }, [perfSuppliers]);

  const trendColors = ['#f97316', '#22c55e', '#06b6d4', '#8b5cf6'];

  // 3. Risk Distribution - Pie Chart
  const riskDistributionData = useMemo(() => {
    const counts: Record<string, number> = { high: 0, medium: 0, low: 0, unknown: 0 };
    if (perfSuppliers.length > 0) {
      perfSuppliers.forEach((s) => {
        const level = String(s.riskLevel ?? 'unknown');
        counts[level] = (counts[level] || 0) + 1;
      });
    } else {
      suppliers.forEach(() => { counts.unknown++; });
    }
    return [
      { name: '高风险', value: counts.high, fill: '#ef4444' },
      { name: '中风险', value: counts.medium, fill: '#f59e0b' },
      { name: '低风险', value: counts.low, fill: '#22c55e' },
      { name: '未知', value: counts.unknown, fill: '#94a3b8' },
    ].filter((d) => d.value > 0);
  }, [perfSuppliers, suppliers]);

  // 4. Lead Time Comparison - Horizontal Bar Chart
  const leadTimeData = useMemo(() => {
    if (suppliers.length === 0) return [];
    return [...suppliers]
      .sort((a, b) => b.leadTime - a.leadTime)
      .map((s) => ({
        name: s.name,
        leadTime: s.leadTime,
        category: s.category,
      }));
  }, [suppliers]);

  // 5. Category Distribution
  const categoryData = useMemo(() => {
    if (suppliers.length === 0) return [];
    const catMap: Record<string, { name: string; count: number; suppliers: string[] }> = {};
    suppliers.forEach((s) => {
      if (!catMap[s.category]) {
        catMap[s.category] = { name: s.category, count: 0, suppliers: [] };
      }
      catMap[s.category].count++;
      catMap[s.category].suppliers.push(s.name);
    });
    return Object.values(catMap)
      .sort((a, b) => b.count - a.count)
      .map((c, idx) => ({
        name: c.name,
        count: c.count,
        suppliers: c.suppliers.join('、'),
        fill: CHART_COLORS[idx % CHART_COLORS.length],
      }));
  }, [suppliers]);

  if (suppliers.length === 0) {
    return (
      <Card className="card-dashboard glass-card">
        <CardContent className="p-8 text-center text-muted-foreground">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">暂无供应商数据可供分析</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* ==================== 1. Supplier Score Ranking ==================== */}
      <Card className="card-dashboard card-dashboard glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-orange-500" />
            供应商评分排名
          </CardTitle>
        </CardHeader>
        <CardContent>
          {scoreRankingData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={scoreRankingData} margin={{ left: 5, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="dark:opacity-20" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: number) => [`${value}`, '综合评分']}
                />
                <Bar dataKey="score" radius={[4, 4, 0, 0]} animationDuration={800}>
                  {scoreRankingData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={getScoreGradientColor(entry.score)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">暂无评分数据</div>
          )}
        </CardContent>
      </Card>

      {/* ==================== 2. Performance Trend ==================== */}
      <Card className="card-dashboard card-dashboard glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            绩效趋势
          </CardTitle>
        </CardHeader>
        <CardContent>
          {perfSuppliers.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={performanceTrendData} margin={{ left: 5, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="dark:opacity-20" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                {perfSuppliers.slice(0, 4).map((s, idx) => (
                  <Line
                    key={idx}
                    type="monotone"
                    dataKey={String(s.name)}
                    stroke={trendColors[idx]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    animationDuration={800 + idx * 200}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">暂无绩效趋势数据</div>
          )}
        </CardContent>
      </Card>

      {/* ==================== 3. Risk Distribution ==================== */}
      <Card className="card-dashboard card-dashboard glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-amber-500" />
            风险分布
          </CardTitle>
        </CardHeader>
        <CardContent>
          {riskDistributionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={riskDistributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  animationDuration={800}
                >
                  {riskDistributionData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => [`${value} 家`, name]}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">暂无风险数据</div>
          )}
        </CardContent>
      </Card>

      {/* ==================== 4. Lead Time Comparison ==================== */}
      <Card className="card-dashboard card-dashboard glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-cyan-500" />
            交货期对比
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leadTimeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(160, leadTimeData.length * 32)}>
              <BarChart data={leadTimeData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="dark:opacity-20" />
                <XAxis type="number" tick={{ fontSize: 9 }} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: number) => [`${value} 天`, '交货期']}
                />
                <Bar dataKey="leadTime" radius={[0, 4, 4, 0]} animationDuration={800}>
                  {leadTimeData.map((entry, idx) => {
                    const color = entry.leadTime <= 7 ? '#22c55e' : entry.leadTime <= 14 ? '#f59e0b' : '#ef4444';
                    return <Cell key={idx} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[160px] flex items-center justify-center text-xs text-muted-foreground">暂无交货期数据</div>
          )}
        </CardContent>
      </Card>

      {/* ==================== 5. Category Distribution ==================== */}
      <Card className="card-dashboard card-dashboard glass-card md:col-span-2 lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Tag className="h-4 w-4 text-rose-500" />
            品类分布
            <Badge variant="outline" className="text-[9px] ml-auto">{categoryData.length} 个品类</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {categoryData.length > 0 ? (
            <div className="space-y-3">
              {categoryData.map((cat, idx) => {
                const pct = (cat.count / suppliers.length) * 100;
                return (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-sm shrink-0"
                          style={{ backgroundColor: cat.fill }}
                        />
                        <span className="text-sm font-medium">{cat.name}</span>
                        <Badge variant="outline" className="text-[9px]">{cat.count} 家</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: cat.fill,
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{cat.suppliers}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-[100px] flex items-center justify-center text-xs text-muted-foreground">暂无品类数据</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
