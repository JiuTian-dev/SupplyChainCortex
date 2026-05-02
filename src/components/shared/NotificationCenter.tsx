'use client';

import { useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Bell,
  BellRing,
  X,
  CheckCircle2,
  CheckCheck,
  ChevronRight,
  Package,
  DollarSign,
  Truck,
  TrendingDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { VirtualList } from '@/components/shared/VirtualList';
import { useUIStore } from '@/stores/ui-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useNotifications } from '@/hooks/use-supply-chain-data';
import type { BackendNotification } from '@/lib/types';
import { toast } from 'sonner';

export interface NotificationCenterProps {
  /** Navigate to a tab (e.g. 'inventory', 'cost', 'logistics', 'sales') */
  onNavigate: (tab: string, sku?: string) => void;
  /** View inventory detail for a specific SKU */
  onViewInventoryDetail?: (sku: string) => void;
  /** Fallback data for generating notifications when backend hasn't loaded */
  inventoryData?: { inventory?: { sku: string; productName: string; quantity: number; safetyStock: number; stockStatus: string; lastSyncAt: string }[] } | null;
  costData?: { costs?: { sku: string; productName: string; grossMargin: number }[] } | null;
  logisticsData?: { shipments?: { id: string; sku: string; productName: string; origin: string; destination: string; status: string; delayDays: number; eta: string }[] } | null;
}

export function NotificationCenter({
  onNavigate,
  onViewInventoryDetail,
  inventoryData,
  costData,
  logisticsData,
}: NotificationCenterProps) {
  const notificationOpen = useUIStore((s) => s.notificationOpen);
  const setNotificationOpen = useUIStore((s) => s.setNotificationOpen);
  const readNotifications = useUIStore((s) => s.readNotifications);
  const addReadNotification = useUIStore((s) => s.addReadNotification);
  const setReadNotifications = useUIStore((s) => s.setReadNotifications);
  const setHighlightElement = useUIStore((s) => s.setHighlightElement);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const setSelectedProduct = useUIStore((s) => s.setSelectedProduct);
  const badgePop = useUIStore((s) => s.badgePop);
  const setBadgePop = useUIStore((s) => s.setBadgePop);

  const backendNotifications = useNotificationStore(
    (s) => s.backendNotifications
  );
  const setNotifications = useNotificationStore((s) => s.setNotifications);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);

  // Fetch notifications from API
  const { data: notificationsData } = useNotifications();

  // Track whether we've initialized from API to avoid overwriting store on re-renders
  const initializedFromApiRef = useRef(false);

  // Sync API data to notification store
  useEffect(() => {
    const apiData = notificationsData as { notifications?: BackendNotification[] } | null;
    if (apiData?.notifications && !initializedFromApiRef.current) {
      setNotifications(apiData.notifications as BackendNotification[]);
      initializedFromApiRef.current = true;
    }
  }, [notificationsData, setNotifications]);

  // Build display notifications from backend or fallback client data
  const notifications = useMemo(() => {
    if (backendNotifications.length > 0) {
      return backendNotifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        description: n.description,
        severity: n.severity,
        time: n.createdAt,
        icon: (n.source === 'inventory' ? (
            <Package className="h-4 w-4 text-red-500" />
          ) : n.source === 'cost' ? (
            <DollarSign className="h-4 w-4 text-orange-500" />
          ) : n.source === 'logistics' ? (
            <Truck className="h-4 w-4 text-red-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-amber-500" />
          )) as React.ReactNode,
        sku: n.sku,
      }));
    }
    // Fallback: generate from client data if backend not loaded yet
    const notifs: {
      id: string;
      type: string;
      title: string;
      description: string;
      severity: string;
      time: string;
      icon: React.ReactNode;
      sku?: string;
    }[] = [];
    if (inventoryData?.inventory) {
      inventoryData.inventory.forEach((inv) => {
        if (inv.stockStatus === 'critical') {
          notifs.push({
            id: `low-${inv.sku}`,
            type: '库存预警',
            title: `${inv.productName} 库存紧急`,
            description: `当前库存 ${inv.quantity}，低于安全库存 ${inv.safetyStock}`,
            severity: 'critical',
            time: inv.lastSyncAt,
            icon: <Package className="h-4 w-4 text-red-500" />,
            sku: inv.sku,
          });
        }
      });
    }
    if (costData?.costs) {
      costData.costs.forEach((c) => {
        if (c.grossMargin < 48) {
          notifs.push({
            id: `cost-${c.sku}`,
            type: '成本预警',
            title: `${c.productName} 毛利率偏低`,
            description: `当前毛利率 ${c.grossMargin}%`,
            severity: 'warning',
            time: new Date().toISOString(),
            icon: <DollarSign className="h-4 w-4 text-orange-500" />,
            sku: c.sku,
          });
        }
      });
    }
    if (logisticsData?.shipments) {
      logisticsData.shipments.forEach((s) => {
        if (s.status === 'delayed' || s.status === 'exception') {
          notifs.push({
            id: `ship-${s.id}`,
            type: '物流延误',
            title: `${s.productName} 货运延误`,
            description: `${s.origin} → ${s.destination}，延误 ${s.delayDays} 天`,
            severity: s.delayDays > 5 ? 'critical' : 'warning',
            time: s.eta || new Date().toISOString(),
            icon: <Truck className="h-4 w-4 text-red-500" />,
            sku: s.sku,
          });
        }
      });
    }
    return notifs;
  }, [backendNotifications, inventoryData, costData, logisticsData]);

  const unreadCount =
    backendNotifications.length > 0
      ? backendNotifications.filter((n) => !n.isRead).length
      : notifications.filter((n) => !readNotifications.has(n.id)).length;

  // Badge bounce animation on unread count change
  const prevUnreadCountRef = useRef(unreadCount);
  useEffect(() => {
    if (unreadCount !== prevUnreadCountRef.current) {
      if (prevUnreadCountRef.current !== 0) {
        const t1 = setTimeout(() => setBadgePop(true), 0);
        const t2 = setTimeout(() => setBadgePop(false), 500);
        prevUnreadCountRef.current = unreadCount;
        return () => {
          clearTimeout(t1);
          clearTimeout(t2);
        };
      }
      prevUnreadCountRef.current = unreadCount;
    }
  }, [unreadCount, setBadgePop]);

  // Handle notification click - mark as read and navigate
  const handleNotificationClick = useCallback(
    (
      n: (typeof notifications)[0],
      e?: React.MouseEvent
    ) => {
      e?.stopPropagation();
      // Mark as read
      if (backendNotifications.length > 0) {
        fetch('/api/notifications', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notificationId: n.id }),
        }).catch(() => {});
        markAsRead(n.id);
      } else {
        addReadNotification(n.id);
      }
      // Close panel after a small delay
      setTimeout(() => {
        setNotificationOpen(false);
      }, 50);
      // Navigate based on notification type
      const sku =
        n.sku ||
        n.id.replace(/^(low-|cost-|ship-|sales-|inv-|log-)/, '');
      if (n.type === '库存预警') {
        setActiveTab('inventory');
        if (sku) {
          setTimeout(() => onViewInventoryDetail?.(sku), 100);
          setHighlightElement(`inventory-${sku}`);
          setTimeout(() => setHighlightElement(''), 1500);
        }
      } else if (n.type === '成本预警') {
        setActiveTab('cost');
        if (sku) {
          setSelectedProduct(sku);
          setHighlightElement(`cost-${sku}`);
          setTimeout(() => setHighlightElement(''), 1500);
        }
      } else if (n.type === '物流延误') {
        setActiveTab('logistics');
        setHighlightElement(`logistics-${sku}`);
        setTimeout(() => setHighlightElement(''), 1500);
      } else if (n.type === '销售异常') {
        setActiveTab('sales');
        setHighlightElement(`sales-${sku}`);
        setTimeout(() => setHighlightElement(''), 1500);
      }
    },
    [
      backendNotifications,
      markAsRead,
      addReadNotification,
      setNotificationOpen,
      setActiveTab,
      setSelectedProduct,
      setHighlightElement,
      onViewInventoryDetail,
    ]
  );

  // Mark all as read
  const handleMarkAllRead = useCallback(() => {
    if (backendNotifications.length > 0) {
      fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      }).catch(() => {});
      markAllRead();
    } else {
      setReadNotifications(new Set(notifications.map((n) => n.id)));
    }
    toast.success('已标记全部通知为已读');
  }, [backendNotifications, markAllRead, notifications, setReadNotifications]);

  const isUnread = (n: (typeof notifications)[0]) => {
    return backendNotifications.length > 0
      ? !backendNotifications.find((bn) => bn.id === n.id)?.isRead
      : !readNotifications.has(n.id);
  };

  return (
    <>
      {/* Notification panel - rendered as portal-level overlay */}
      {notificationOpen && (
        <>
          {/* Backdrop to close on outside click */}
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => setNotificationOpen(false)}
          />
          <div
            className="fixed right-4 sm:right-8 top-16 w-80 sm:w-96 bg-popover border rounded-xl shadow-xl z-[70] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
          <div className="flex items-center justify-between p-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-orange-500" />
              <span className="font-semibold text-sm">通知中心</span>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {unreadCount} 未读
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setNotificationOpen(false)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <VirtualList
            items={notifications}
            renderItem={(n, nIdx) => (
              <div
                className={`flex items-start gap-3 p-3 border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer group/notif notification-slide-in ${
                  isUnread(n)
                    ? 'bg-orange-50/30 dark:bg-orange-950/10'
                    : ''
                }`}
                style={{ animationDelay: `${nIdx * 50}ms` }}
                onClick={(e) => handleNotificationClick(n, e)}
              >
                <div className="mt-0.5 shrink-0">{n.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        n.severity === 'critical'
                          ? 'destructive'
                          : 'secondary'
                      }
                      className="text-[10px] shrink-0"
                    >
                      {n.type}
                    </Badge>
                    {isUnread(n) && (
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                    )}
                    <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto opacity-0 group-hover/notif:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-sm font-medium mt-1 truncate">
                    {n.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {n.description}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {n.time
                      ? new Date(n.time).toLocaleString('zh-CN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </p>
                </div>
              </div>
            )}
            estimateSize={80}
            maxHeight={320}
            overscan={3}
            emptyMessage="暂无通知"
            emptyIcon={<CheckCircle2 className="h-8 w-8" />}
          />
          {notifications.length > 0 && (
            <div className="p-2 border-t bg-muted/20">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs gap-1"
                onClick={handleMarkAllRead}
              >
                <CheckCheck className="h-3 w-3" />
                标记全部已读
              </Button>
            </div>
          )}
        </div>
        </>
      )}
    </>
  );
}
