'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import {
  Search,
  RefreshCw,
  Sun,
  Moon,
  Bell,
  Settings2,
  Download,
  Upload,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDashboardUIStore } from '@/stores/useDashboardUIStore';
import { useConnectionStore } from '@/stores/connection-store';
import { useNotificationStore } from '@/stores/notification-store';
import { STATUS_LABELS, SHIPMENT_STATUS_LABELS } from '@/lib/constants';
import { exportToCSV } from '@/lib/utils';
import { fetchInventory, fetchCost, fetchLogistics, fetchSales } from '@/lib/api-client';
import type { SalesSummary } from '@/lib/types';
import type { Inventory, CostRecord, ShipmentItem } from '@prisma/client';
import { toast } from 'sonner';
import { HealthDot } from './HealthDot';

export interface HeaderProps {
  onRefresh: () => void;
  /** Pass-through data for export functionality (used as cache, API fetch as fallback) */
  inventoryData?: { inventory?: Inventory[] } | null;
  costData?: { costs?: CostRecord[] } | null;
  logisticsData?: { shipments?: ShipmentItem[] } | null;
  salesData?: { productSummaries?: SalesSummary[] } | null;
  /** Risk data for the indicator badge */
  riskData?: { overallRisk: number } | null;
  /** Ref for scrolling to risk panel */
  riskPanelRef?: React.RefObject<HTMLDivElement | null>;
  /** Notes count */
  unresolvedNotesCount?: number;
  /** Callback to open settings sheet */
  onOpenSettings?: () => void;
  /** Callback to open tools panel */
  onOpenTools?: () => void;
  /** Callback to open notes dialog */
  onOpenNotes?: () => void;
  /** Callback to open CSV import dialog */
  onOpenCSVImport?: () => void;
  /** User menu component (from auth system) */
  userMenu?: React.ReactNode;
}

export function Header({
  onRefresh,
  inventoryData,
  costData,
  logisticsData,
  salesData,
  riskData,
  riskPanelRef,
  unresolvedNotesCount = 0,
  onOpenSettings,
  onOpenTools,
  onOpenNotes,
  onOpenCSVImport,
  userMenu,
}: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const refreshCountdown = useDashboardUIStore((s) => s.refreshCountdown);
  const [prevCountdown, setPrevCountdown] = useState(60);
  const isRefreshing = useDashboardUIStore((s) => s.isRefreshing);
  const lastSyncTime = useDashboardUIStore((s) => s.lastSyncTime);
  const setGlobalSearchOpen = useDashboardUIStore((s) => s.setGlobalSearchOpen);
  const setAlertRulesOpen = useDashboardUIStore((s) => s.setAlertRulesOpen);
  const setActiveTab = useDashboardUIStore((s) => s.setActiveTab);

  const wsConnected = useConnectionStore((s) => s.wsConnected);
  const requestReconnect = useConnectionStore((s) => s.requestReconnect);
  const connectorData = useConnectionStore((s) => s.connectorData);

  const unreadCount = useNotificationStore((s) => s.unreadCount());
  const badgePop = useDashboardUIStore((s) => s.badgePop);
  const [exporting, setExporting] = useState(false);

  // Bell shake key: changes when unreadCount increases, re-triggers CSS animation
  const bellShakeKey = unreadCount;

  // ==================== Export Handlers ====================
  const handleExportFull = useCallback(async () => {
    setExporting(true);
    try {
      const [invRes, costRes, logRes, salesRes] = await Promise.all([
        inventoryData?.inventory ? Promise.resolve(inventoryData) : fetchInventory('list').catch(() => null),
        costData?.costs ? Promise.resolve(costData) : fetchCost('list').catch(() => null),
        logisticsData?.shipments ? Promise.resolve(logisticsData) : fetchLogistics('list').catch(() => null),
        salesData?.productSummaries ? Promise.resolve(salesData) : fetchSales('overview').catch(() => null),
      ]);
      const allData: Record<string, unknown>[] = [];
      const inv = (invRes as { inventory?: Inventory[] } | null)?.inventory;
      if (inv) {
        inv.forEach((i) => {
          allData.push({
            模块: '库存', SKU: i.sku, 产品名称: i.productName, 仓库: i.warehouse,
            数量: i.quantity, 安全库存: i.safetyStock, 状态: STATUS_LABELS[i.stockStatus] || i.stockStatus,
            周转天数: i.turnoverDays,
          });
        });
      }
      const costs = (costRes as { costs?: CostRecord[] } | null)?.costs;
      if (costs) {
        costs.forEach((c) => {
          allData.push({
            模块: '成本', SKU: c.sku, 产品名称: c.productName, 到岸成本: c.totalLanded,
            售价: c.sellingPrice, 毛利率: c.grossMargin, 汇率: c.exchangeRate,
          });
        });
      }
      const shipments = (logRes as { shipments?: ShipmentItem[] } | null)?.shipments;
      if (shipments) {
        shipments.forEach((s) => {
          allData.push({
            模块: '物流', SKU: s.sku, 产品名称: s.productName, 追踪号: s.trackingNumber,
            始发地: s.origin, 目的地: s.destination, 承运商: s.carrier,
            状态: SHIPMENT_STATUS_LABELS[s.status] || s.status, 延误天数: s.delayDays,
          });
        });
      }
      const sales = (salesRes as { productSummaries?: SalesSummary[] } | null)?.productSummaries;
      if (sales) {
        sales.forEach((p) => {
          allData.push({
            模块: '销售', SKU: p.sku, 产品名称: p.productName, 总销量: p.totalQuantity,
            总收入: p.totalRevenue, 日均销售: p.avgDailySales,
          });
        });
      }
      if (allData.length === 0) {
        toast.error('暂无可导出的数据');
        return;
      }
      const allKeys = new Set<string>();
      allData.forEach((d) => Object.keys(d).forEach((k) => allKeys.add(k)));
      const columns = Array.from(allKeys).map((k) => ({ key: k, label: k }));
      exportToCSV(allData, '供应链全量数据', columns);
      toast.success('全部数据已导出');
    } catch {
      toast.error('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  }, [inventoryData, costData, logisticsData, salesData]);

  const handleExportInventory = useCallback(async () => {
    setExporting(true);
    try {
      const res = inventoryData?.inventory
        ? inventoryData
        : await fetchInventory('list').catch(() => null);
      const inv = (res as { inventory?: Inventory[] } | null)?.inventory;
      if (!inv || inv.length === 0) {
        toast.error('暂无库存数据');
        return;
      }
      exportToCSV(
        inv.map((i) => ({
          SKU: i.sku, 产品名: i.productName, 仓库: i.warehouse, 数量: i.quantity,
          安全库存: i.safetyStock, 再订购点: i.reorderPoint, 在途: i.inTransit,
          周转率: i.turnoverRate, 周转天数: i.turnoverDays,
          状态: STATUS_LABELS[i.stockStatus] || i.stockStatus,
        })),
        '库存数据',
        [
          { key: 'SKU', label: 'SKU' }, { key: '产品名', label: '产品名' },
          { key: '仓库', label: '仓库' }, { key: '数量', label: '数量' },
          { key: '安全库存', label: '安全库存' }, { key: '再订购点', label: '再订购点' },
          { key: '在途', label: '在途' }, { key: '周转率', label: '周转率' },
          { key: '周转天数', label: '周转天数' }, { key: '状态', label: '状态' },
        ]
      );
      toast.success('库存数据已导出');
    } catch {
      toast.error('导出库存数据失败');
    } finally {
      setExporting(false);
    }
  }, [inventoryData]);

  const handleExportCost = useCallback(async () => {
    setExporting(true);
    try {
      const res = costData?.costs
        ? costData
        : await fetchCost('list').catch(() => null);
      const costs = (res as { costs?: CostRecord[] } | null)?.costs;
      if (!costs || costs.length === 0) {
        toast.error('暂无成本数据');
        return;
      }
      exportToCSV(
        costs.map((c) => ({
          SKU: c.sku, 产品名: c.productName, 原材料: c.rawMaterial, 人工: c.labor,
          物流: c.logistics, 关税: c.tariff, 平台费: c.platformFee, 汇率: c.exchangeRate,
          到岸成本: c.totalLanded, 售价: c.sellingPrice, 毛利率: c.grossMargin,
        })),
        '成本数据',
        [
          { key: 'SKU', label: 'SKU' }, { key: '产品名', label: '产品名' },
          { key: '原材料', label: '原材料' }, { key: '人工', label: '人工' },
          { key: '物流', label: '物流' }, { key: '关税', label: '关税' },
          { key: '平台费', label: '平台费' }, { key: '汇率', label: '汇率' },
          { key: '到岸成本', label: '到岸成本' }, { key: '售价', label: '售价' },
          { key: '毛利率', label: '毛利率' },
        ]
      );
      toast.success('成本数据已导出');
    } catch {
      toast.error('导出成本数据失败');
    } finally {
      setExporting(false);
    }
  }, [costData]);

  const handleExportLogistics = useCallback(async () => {
    setExporting(true);
    try {
      const res = logisticsData?.shipments
        ? logisticsData
        : await fetchLogistics('list').catch(() => null);
      const shipments = (res as { shipments?: ShipmentItem[] } | null)?.shipments;
      if (!shipments || shipments.length === 0) {
        toast.error('暂无物流数据');
        return;
      }
      exportToCSV(
        shipments.map((s) => ({
          跟踪号: s.trackingNumber, SKU: s.sku, 产品名: s.productName,
          起点: s.origin, 终点: s.destination, 承运商: s.carrier,
          状态: SHIPMENT_STATUS_LABELS[s.status] || s.status,
          ETA: s.eta ? new Date(s.eta).toLocaleDateString('zh-CN') : '',
          延误天数: s.delayDays, 风险等级: s.riskLevel,
        })),
        '物流数据',
        [
          { key: '跟踪号', label: '跟踪号' }, { key: 'SKU', label: 'SKU' },
          { key: '产品名', label: '产品名' }, { key: '起点', label: '起点' },
          { key: '终点', label: '终点' }, { key: '承运商', label: '承运商' },
          { key: '状态', label: '状态' }, { key: 'ETA', label: '预计到达' },
          { key: '延误天数', label: '延误天数' }, { key: '风险等级', label: '风险等级' },
        ]
      );
      toast.success('物流数据已导出');
    } catch {
      toast.error('导出物流数据失败');
    } finally {
      setExporting(false);
    }
  }, [logisticsData]);

  const handleExportSales = useCallback(async () => {
    setExporting(true);
    try {
      // Fetch individual sales records from the export API for detailed per-record export
      const res = await fetch('/api/export?module=sales&format=json');
      if (!res.ok) throw new Error('Failed to fetch sales data');
      const data = await res.json() as { sales?: Record<string, unknown>[] };
      const sales = data.sales;
      if (!sales || sales.length === 0) {
        toast.error('暂无销售数据');
        return;
      }
      exportToCSV(
        sales.map((r) => ({
          SKU: r.SKU ?? r.sku ?? '',
          产品名: r['产品名称'] ?? r.productName ?? '',
          日期: r['日期'] ?? r.date ?? '',
          数量: r['数量'] ?? r.quantity ?? '',
          收入: r['收入'] ?? r.revenue ?? '',
          平台: r['平台'] ?? r.platform ?? '',
        })),
        '销售数据',
        [
          { key: 'SKU', label: 'SKU' }, { key: '产品名', label: '产品名' },
          { key: '日期', label: '日期' }, { key: '数量', label: '数量' },
          { key: '收入', label: '收入' }, { key: '平台', label: '平台' },
        ]
      );
      toast.success('销售数据已导出');
    } catch {
      toast.error('导出销售数据失败');
    } finally {
      setExporting(false);
    }
  }, []);

  // Avoid hydration mismatch
  useEffect(() => {
    if (typeof requestAnimationFrame !== 'undefined') {
      const timeout = requestAnimationFrame(() => setMounted(true));
      return () => {
        if (typeof cancelAnimationFrame !== 'undefined') {
          cancelAnimationFrame(timeout);
        }
      };
    }
    return undefined;
  }, []);

  // Track scroll for header shadow & blur
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const setNotificationOpen = useDashboardUIStore((s) => s.setNotificationOpen);
  const notificationOpen = useDashboardUIStore((s) => s.notificationOpen);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          const exportBtn = document.querySelector('[aria-label="批量导出"]') as HTMLButtonElement | null;
          exportBtn?.click();
        }
        if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          setNotificationOpen(!notificationOpen);
        }
        if (e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          setGlobalSearchOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setNotificationOpen, notificationOpen, setGlobalSearchOpen]);

  // Progress bar width: 0% at 60s (full countdown), 100% at 0s (about to refresh)
  const progressWidth = ((60 - refreshCountdown) / 60) * 100;

  // Track countdown changes for smooth number transition
  const countdownChanged = prevCountdown !== refreshCountdown;
  useEffect(() => {
    setPrevCountdown(refreshCountdown);
  }, [refreshCountdown]);

  return (
    <header
      className={`sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b transition-all duration-300 ${isScrolled ? 'header-scrolled' : ''}`}
    >
      {/* Auto-refresh countdown progress bar */}
      <div
        className="header-progress-bar-v2"
        style={{ width: `${progressWidth}%` }}
      />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center">
              <span className="text-white dark:text-zinc-900 text-xs font-bold tracking-tight">SC</span>
            </div>
            <h1 className="text-sm font-semibold tracking-tight">
              SupplyChain Cortex
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Notification bell */}
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <button
                    className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors relative"
                    aria-label="通知中心"
                    onClick={() => setNotificationOpen(!notificationOpen)}
                  >
                    {unreadCount > 0 ? (
                      <Bell key={`bell-${bellShakeKey}`} className="h-3.5 w-3.5 text-orange-500" />
                    ) : (
                      <Bell className="h-3.5 w-3.5 text-zinc-500" />
                    )}
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>通知中心{unreadCount > 0 ? ` (${unreadCount} 未读)` : ''}</TooltipContent>
              </UITooltip>
            </TooltipProvider>

            {/* Tools panel */}
            {onOpenTools && (
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      onClick={onOpenTools}
                      aria-label="工具箱"
                    >
                      <Wrench className="h-4 w-4 text-zinc-500" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>工具箱</TooltipContent>
                </UITooltip>
              </TooltipProvider>
            )}

            {/* Settings gear */}
            {onOpenSettings && (
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      onClick={onOpenSettings}
                      aria-label="设置"
                    >
                      <Settings2 className="h-4 w-4 text-zinc-500" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>设置</TooltipContent>
                </UITooltip>
              </TooltipProvider>
            )}

            <HealthDot />
            {userMenu}
          </div>
        </div>
      </div>
    </header>
  );
}
