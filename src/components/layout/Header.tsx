'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import {
  Radio,
  Search,
  RefreshCw,
  Timer,
  WifiOff,
  Sun,
  Moon,
  Bell,
  Settings2,
  Download,
  Upload,
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
            <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center">
              <Radio className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight">
                  SupplyChain Cortex
                </h1>
                <Badge
                  variant="outline"
                  className="text-[9px] px-1.5 py-0 border-orange-300 text-orange-600 dark:border-orange-700 dark:text-orange-400"
                >
                  数据看板
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground -mt-0.5">
                SupplyChain Cortex
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Notes center */}
            {onOpenNotes && (
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="relative hover:bg-accent transition-colors duration-150"
                      onClick={onOpenNotes}
                      aria-label="备注中心"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      {unresolvedNotesCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-violet-500 text-white text-[9px] font-bold flex items-center justify-center">
                          {unresolvedNotesCount > 9
                            ? '9+'
                            : unresolvedNotesCount}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    备注中心 ({unresolvedNotesCount} 未解决)
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            )}

            {/* Notification bell with shake animation */}
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="relative hover:bg-accent transition-colors duration-150"
                    aria-label="通知中心"
                    onClick={() => setNotificationOpen(!notificationOpen)}
                  >
                    {unreadCount > 0 ? (
                      <Bell key={`bell-${bellShakeKey}`} className="h-3.5 w-3.5 text-orange-500" />
                    ) : (
                      <Bell className="h-3.5 w-3.5" />
                    )}
                    {/* Red dot badge with pop animation */}
                    {unreadCount > 0 && (
                      <span
                        key={`dot-${unreadCount}`}
                        className={`absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center notification-red-dot ${
                          badgePop ? 'badge-pop-anim' : ''
                        }`}
                      >
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>通知中心 ({unreadCount} 未读)</p>
                  <p className="text-xs text-muted-foreground">
                    快捷键: <span className="kbd-key">Ctrl</span>+<span className="kbd-key">N</span>
                  </p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>

            {/* Global search button */}
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hover:bg-accent transition-colors duration-150"
                    onClick={() => setGlobalSearchOpen(true)}
                    aria-label="全局搜索"
                  >
                    <Search className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>全局搜索</TooltipContent>
              </UITooltip>
            </TooltipProvider>

            {/* Auto-refresh countdown with next refresh time tooltip */}
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="text-xs gap-1.5 cursor-default tabular-nums"
                    aria-label={`自动刷新倒计时 ${refreshCountdown}秒`}
                  >
                    <Timer className="h-2.5 w-2.5" />
                    {wsConnected ? (
                      <span className="text-green-600 dark:text-green-400">实时</span>
                    ) : (
                      <span key={refreshCountdown} className={`countdown-number ${countdownChanged ? 'changing' : ''}`}>{refreshCountdown}</span>
                    )}
                    {!wsConnected && <span>s</span>}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{wsConnected ? 'SSE 实时推送已连接，无需轮询' : `下次自动刷新: ${refreshCountdown}秒`}</p>
                  <p className="text-xs text-muted-foreground">
                    上次同步: {lastSyncTime.toLocaleTimeString('zh-CN')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    预计刷新: {new Date(Date.now() + refreshCountdown * 1000).toLocaleTimeString('zh-CN')}
                  </p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>

            {/* MCP online indicator with gradient shift animation */}
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="text-xs gap-1 cursor-pointer"
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full mcp-pulse-dot ${
                        isRefreshing
                          ? 'text-yellow-500'
                          : wsConnected
                            ? 'text-green-500'
                            : 'text-green-500'
                      }`}
                      style={{ color: isRefreshing ? '#eab308' : '#22c55e' }}
                    />
                    <span>{isRefreshing ? '同步中' : 'MCP 在线'}</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>MCP Server 状态正常</p>
                  <p className="text-xs text-muted-foreground">
                    传输协议: stdio | 工具数: 16
                  </p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>

            {/* Risk Indicator */}
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={`text-xs gap-1 cursor-pointer transition-all duration-300 ${
                      riskData
                        ? riskData.overallRisk < 30
                          ? 'border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-950/20'
                          : riskData.overallRisk < 60
                            ? 'border-yellow-400 dark:border-yellow-600 bg-yellow-50/50 dark:bg-yellow-950/20'
                            : 'border-red-400 dark:border-red-600 bg-red-50/50 dark:bg-red-950/20'
                        : 'border-muted bg-muted/20'
                    }`}
                    onClick={() => {
                      setActiveTab('dashboard');
                      setTimeout(() => {
                        riskPanelRef?.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center',
                        });
                      }, 300);
                    }}
                  >
                    {riskData ? (
                      <span className="flex items-center gap-1">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            riskData.overallRisk < 30
                              ? 'bg-green-500'
                              : riskData.overallRisk < 60
                                ? 'bg-yellow-500'
                                : 'bg-red-500 animate-pulse'
                          }`}
                        />
                        风险 {riskData.overallRisk}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                        风险 --
                      </span>
                    )}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">
                    {riskData
                      ? `供应链风险评分: ${riskData.overallRisk}/100`
                      : '风险数据加载中...'}
                  </p>
                  {riskData && (
                    <p className="text-xs text-muted-foreground">
                      点击查看风险监控面板
                    </p>
                  )}
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>

            {/* SSE connection indicator with reconnect action */}
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={`text-xs gap-1.5 cursor-pointer transition-all duration-300 ${
                      wsConnected
                        ? 'border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-950/20'
                        : 'border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-950/10'
                    }`}
                    onClick={() => {
                      if (!wsConnected) {
                        requestReconnect();
                      }
                    }}
                  >
                    {wsConnected ? (
                      <span className="flex items-center gap-1">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                        实时
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <WifiOff className="h-2.5 w-2.5 text-red-500 dark:text-red-400" />
                        离线
                      </span>
                    )}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">
                    {wsConnected
                      ? 'SSE 实时推送已连接'
                      : 'SSE 连接断开，点击重连'}
                  </p>
                  {!wsConnected && (
                    <p className="text-xs text-muted-foreground mt-1">
                      点击此徽章手动重连
                    </p>
                  )}
                  <div className="mt-1.5 text-xs text-muted-foreground space-y-0.5">
                    <p>推送事件:</p>
                    <p>· dashboard-update (30s)</p>
                    <p>· notification (45s)</p>
                    <p>· inventory-alert (60s)</p>
                    <p>· shipment-update (20s)</p>
                    <p>· data-update (60s)</p>
                  </div>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>

            {/* Alert rules settings */}
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hover:bg-accent transition-colors duration-150"
                    onClick={() => setAlertRulesOpen(true)}
                    aria-label="预警规则设置"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>预警规则设置</TooltipContent>
              </UITooltip>
            </TooltipProvider>

            {/* Export dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="批量导出" disabled={exporting}>
                  <Download className={`h-3.5 w-3.5 ${exporting ? 'animate-pulse' : ''}`} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="export-dropdown-content">
                {onOpenCSVImport && (
                  <DropdownMenuItem onClick={onOpenCSVImport} disabled={exporting}>
                    <Upload className="h-3.5 w-3.5 mr-2" />
                    数据导入
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleExportFull} disabled={exporting}>
                  导出全部数据
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportInventory} disabled={exporting}>
                  导出库存数据
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportCost} disabled={exporting}>
                  导出成本数据
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportLogistics} disabled={exporting}>
                  导出物流数据
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportSales} disabled={exporting}>
                  导出销售数据
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Refresh */}
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hover:bg-accent transition-colors duration-150"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    aria-label="刷新数据"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>刷新数据</TooltipContent>
              </UITooltip>
            </TooltipProvider>

            {/* User menu / Auth */}
            <HealthDot />
            {userMenu}

            {/* Dark mode toggle */}
            {mounted && (
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hover:bg-accent transition-colors duration-150"
                      onClick={() =>
                        setTheme(theme === 'dark' ? 'light' : 'dark')
                      }
                      aria-label={
                        theme === 'dark' ? '切换亮色模式' : '切换暗色模式'
                      }
                    >
                      {theme === 'dark' ? (
                        <Sun className="h-3.5 w-3.5" />
                      ) : (
                        <Moon className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {theme === 'dark' ? '切换亮色模式' : '切换暗色模式'}
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
