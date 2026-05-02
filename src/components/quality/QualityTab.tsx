'use client';

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShieldCheck, Bug, Wrench, RotateCcw } from 'lucide-react';
import { useQualityOverview } from '@/hooks/use-supply-chain-data';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';
import { ReturnAnalysisTab, DefectAnalysisTab, WarrantyCostTab } from './QualityTab.panels';

// ─── Main QualityTab Component ──────────────────────────────────────────────────

export function QualityTab() {
  const overviewQuery = useQualityOverview();

  if (overviewQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-teal-600 dark:text-teal-400" />
        <h2 className="text-lg font-semibold">质量管理</h2>
        <span className="text-xs text-muted-foreground">退货 · 缺陷 · 质保成本</span>
      </div>
      <Tabs defaultValue="returns" className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="returns" className="gap-1.5 text-xs data-[state=active]:bg-orange-50 dark:data-[state=active]:bg-orange-950/30 data-[state=active]:text-orange-700 dark:data-[state=active]:text-orange-300">
            <RotateCcw className="h-3.5 w-3.5" />退货分析
          </TabsTrigger>
          <TabsTrigger value="defects" className="gap-1.5 text-xs data-[state=active]:bg-red-50 dark:data-[state=active]:bg-red-950/30 data-[state=active]:text-red-700 dark:data-[state=active]:text-red-300">
            <Bug className="h-3.5 w-3.5" />缺陷分析
          </TabsTrigger>
          <TabsTrigger value="warranty" className="gap-1.5 text-xs data-[state=active]:bg-violet-50 dark:data-[state=active]:bg-violet-950/30 data-[state=active]:text-violet-700 dark:data-[state=active]:text-violet-300">
            <Wrench className="h-3.5 w-3.5" />质保成本
          </TabsTrigger>
        </TabsList>
        <TabsContent value="returns" className="tab-fade-in"><ReturnAnalysisTab /></TabsContent>
        <TabsContent value="defects" className="tab-fade-in"><DefectAnalysisTab /></TabsContent>
        <TabsContent value="warranty" className="tab-fade-in"><WarrantyCostTab /></TabsContent>
      </Tabs>
    </div>
  );
}
