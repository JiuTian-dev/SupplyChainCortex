'use client';

import {
  RefreshCw,
  Download,
  BellRing,
  Search,
  GitCompare,
} from 'lucide-react';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUIStore } from '@/stores/ui-store';
import { useNotificationStore } from '@/stores/notification-store';
import { exportToCSV } from '@/lib/utils';
import { toast } from 'sonner';

export interface QuickActionsProps {
  onRefresh: () => void;
  isRefreshing: boolean;
  activeTab: string;
}

export function QuickActions({
  onRefresh,
  isRefreshing,
  activeTab,
}: QuickActionsProps) {
  const showQuickActions = useUIStore((s) => s.showQuickActions);
  const badgePop = useUIStore((s) => s.badgePop);
  const setNotificationOpen = useUIStore((s) => s.setNotificationOpen);
  const setGlobalSearchOpen = useUIStore((s) => s.setGlobalSearchOpen);
  const setCompareOpen = useUIStore((s) => s.setCompareOpen);
  const unreadCount = useNotificationStore((s) => s.unreadCount());

  if (!showQuickActions) return null;

  return (
    <TooltipProvider>
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 slide-up-fade">
        <div className="flex items-center gap-2 sm:gap-3 px-4 py-2.5 rounded-full bg-background/80 backdrop-blur-lg border shadow-lg">
          {/* Refresh */}
          <UITooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onRefresh}
                className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
                aria-label="刷新数据"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              📊 刷新数据
            </TooltipContent>
          </UITooltip>

          {/* Export */}
          <UITooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  const columns =
                    activeTab === 'inventory'
                      ? [
                          { key: 'sku', label: 'SKU' },
                          { key: 'productName', label: '产品名称' },
                          { key: 'warehouse', label: '仓库' },
                          { key: 'quantity', label: '当前库存' },
                        ]
                      : activeTab === 'cost'
                        ? [
                            { key: 'sku', label: 'SKU' },
                            { key: 'productName', label: '产品名称' },
                            { key: 'totalLanded', label: '到岸成本' },
                            { key: 'grossMargin', label: '毛利率' },
                          ]
                        : activeTab === 'logistics'
                          ? [
                              { key: 'trackingNumber', label: '追踪号' },
                              { key: 'origin', label: '始发地' },
                              { key: 'destination', label: '目的地' },
                              { key: 'status', label: '状态' },
                            ]
                          : activeTab === 'sales'
                            ? [
                                { key: 'sku', label: 'SKU' },
                                { key: 'productName', label: '产品名称' },
                                { key: 'totalRevenue', label: '收入' },
                                { key: 'momGrowth', label: '环比' },
                              ]
                            : [
                                { key: 'metric', label: '指标' },
                                { key: 'value', label: '数值' },
                              ];
                  exportToCSV([], `supply-chain-${activeTab}`, columns);
                  toast.success('报告已导出');
                }}
                className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
                aria-label="导出报告"
              >
                <Download className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              📤 导出报告
            </TooltipContent>
          </UITooltip>

          {/* Alerts */}
          <UITooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setNotificationOpen(true)}
                className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 relative"
                aria-label="预警总览"
              >
                <BellRing className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span
                    className={`absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center ${
                      badgePop ? 'badge-pop-anim' : 'badge-pulse'
                    }`}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              🔔 预警总览
            </TooltipContent>
          </UITooltip>

          {/* Search */}
          <UITooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setGlobalSearchOpen(true)}
                className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-200 dark:hover:bg-cyan-900/50 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
                aria-label="搜索"
              >
                <Search className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              🔍 搜索
            </TooltipContent>
          </UITooltip>

          {/* Compare */}
          <UITooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCompareOpen(true)}
                className="hidden sm:flex h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900/50 items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
                aria-label="对比"
              >
                <GitCompare className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              📐 对比
            </TooltipContent>
          </UITooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
