'use client';

/**
 * Supplier Chokepoint Alerts — highlights shared supply bottlenecks.
 *
 * Displays suppliers that serve multiple competing companies, indicating
 * structural single points of failure in the supply chain.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { ChokepointResponse } from '@/lib/services/supplier-api.types';

interface Props {
  data: ChokepointResponse | undefined;
  isLoading: boolean;
  className?: string;
}

function getRiskColor(count: number): string {
  if (count >= 5) return 'text-red-500';
  if (count >= 3) return 'text-amber-500';
  return 'text-blue-500';
}

function getRiskBg(count: number): string {
  if (count >= 5) return 'bg-red-50 border-red-200';
  if (count >= 3) return 'bg-amber-50 border-amber-200';
  return 'bg-blue-50 border-blue-200';
}

export function SupplierChokepointAlerts({ data, isLoading, className }: Props) {
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4" />
            卡脖子供应商
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data?.chokepoints.length) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4" />
            卡脖子供应商
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <AlertTriangle className="w-10 h-10 mb-2 opacity-20" />
          <p className="text-sm">暂未发现卡脖子风险</p>
          <p className="text-xs mt-1">Supplier API 图谱数据不可用</p>
        </CardContent>
      </Card>
    );
  }

  const top10 = data.chokepoints.slice(0, 10);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4" />
            卡脖子供应商
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            共 {data.count} 个
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <div className="space-y-1.5">
          {top10.map((cp) => (
            <div
              key={cp.code}
              className={`flex items-center justify-between p-2.5 rounded-md border ${getRiskBg(cp.companies_supplied)}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{cp.supplier}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {cp.code}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <span className="text-xs text-muted-foreground">供应</span>
                <span className={`text-lg font-bold ${getRiskColor(cp.companies_supplied)}`}>
                  {cp.companies_supplied}
                </span>
                <span className="text-xs text-muted-foreground">家企业</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <Badge
                  variant={cp.companies_supplied >= 5 ? 'destructive' : cp.companies_supplied >= 3 ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {cp.companies_supplied >= 5 ? '高风险' : cp.companies_supplied >= 3 ? '中风险' : '低风险'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
