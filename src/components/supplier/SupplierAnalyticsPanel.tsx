'use client';

import React, { useMemo } from 'react';
import {
  BarChart3, Clock, Tag,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { CHART_COLORS } from '@/lib/constants';
import type { Supplier } from '@prisma/client';

// ==================== Types ====================

interface SupplierAnalyticsPanelProps {
  suppliers: Supplier[];
}

// ==================== Tooltip Style ====================

const CHART_TOOLTIP_STYLE = {
  borderRadius: '10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  border: '1px solid #e5e7eb',
  fontSize: '12px',
  backgroundColor: 'var(--tooltip-bg, #fff)',
};

// ==================== Main Component ====================

export function SupplierAnalyticsPanel({ suppliers }: SupplierAnalyticsPanelProps) {
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* ==================== 1. Lead Time Comparison ==================== */}
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

      {/* ==================== 2. Category Distribution ==================== */}
      <Card className="card-dashboard card-dashboard glass-card">
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
