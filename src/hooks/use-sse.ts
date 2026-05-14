'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useConnectionStore } from '@/stores/connection-store';
import { useNotificationStore } from '@/stores/notification-store';
import type { BackendNotification } from '@/lib/types';

// ==================== SSE Hook ====================

/** Reconnection config */
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const MAX_RECONNECT_ATTEMPTS = 50;

/** Helper to convert SSE event payload to BackendNotification (same logic as WS hook) */
function sseNotifToBackendNotification(notif: {
  id?: string;
  type?: string;
  title: string;
  description: string;
  severity?: string;
  sku?: string;
  timestamp?: string;
  source?: string;
  alertType?: string;
}): BackendNotification {
  const typeMap: Record<string, string> = {
    inventory_alert: '库存预警',
    cost_alert: '成本预警',
    logistics_update: '物流延误',
    sales_anomaly: '销售异常',
  };
  const iconMap: Record<string, string> = {
    inventory_alert: '📦',
    cost_alert: '💰',
    logistics_update: '🚢',
    sales_anomaly: '📈',
  };
  const alertTypeMap: Record<string, string> = {
    low_stock: '库存预警',
    overstock: '库存积压',
    reorder_reminder: '补货提醒',
  };
  const alertIconMap: Record<string, string> = {
    low_stock: '🔴',
    overstock: '🟡',
    reorder_reminder: '📋',
  };

  const eventType = notif.alertType ? alertTypeMap[notif.alertType] ?? '库存通知' : typeMap[notif.type ?? ''] ?? '系统通知';
  const eventIcon = notif.alertType ? alertIconMap[notif.alertType] ?? '📦' : iconMap[notif.type ?? ''] ?? '🔔';
  const source = notif.source ?? (notif.type === 'inventory_alert' ? 'inventory' : notif.type === 'cost_alert' ? 'cost' : notif.type === 'logistics_update' ? 'logistics' : 'sales');
  const severity = notif.severity ?? 'info';
  const color = severity === 'critical' ? '#ef4444' : severity === 'warning' ? '#f59e0b' : '#3b82f6';

  return {
    id: notif.id ?? `sse-${Date.now()}`,
    type: eventType,
    title: notif.title,
    description: notif.description,
    icon: eventIcon,
    color,
    severity,
    sku: notif.sku,
    isRead: false,
    createdAt: notif.timestamp ?? new Date().toISOString(),
    source,
  };
}

export function useSSE() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();
  const setWsConnected = useConnectionStore((s) => s.setWsConnected);
  const wsConnected = useConnectionStore((s) => s.wsConnected);
  const refreshHealth = useConnectionStore((s) => s.refreshHealth);
  const registerReconnect = useConnectionStore((s) => s.registerReconnect);
  const addNotification = useNotificationStore((s) => s.addNotification);

  useEffect(() => {
    // Skip during SSR
    if (typeof window === 'undefined') return;

    let cancelled = false;

    function doConnect() {
      if (cancelled) return;

      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const url = '/api/sse?channel=dashboard,inventory,logistics,sales';
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.addEventListener('connected', (_e) => {
        if (process.env.NODE_ENV === 'development') console.log('[SSE] Connected');
        reconnectAttemptsRef.current = 0;
        setWsConnected(true);
        // Seed connector health immediately (SSE pushes every 90 s, first at 5 s)
        refreshHealth();
      });

      // ── Dashboard update ──
      eventSource.addEventListener('dashboard-update', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (process.env.NODE_ENV === 'development') console.log('[SSE] dashboard-update');
          if (data.metrics) {
            toast.info('仪表盘数据已更新', {
              description: `收入 $${((data.metrics.totalRevenue as number) / 1000).toFixed(0)}K | 库存 ${(data.metrics.totalInventory as number).toLocaleString()}`,
              duration: 3000,
            });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          }
        } catch (err) {
          if (process.env.NODE_ENV === 'development') console.warn('[SSE] Failed to parse dashboard-update:', err);
        }
      });

      // ── Notification event ──
      eventSource.addEventListener('notification', (e) => {
        try {
          const notif = JSON.parse(e.data);
          if (process.env.NODE_ENV === 'development') console.log('[SSE] notification');
          const toastType = notif.severity === 'critical' ? 'error' : notif.severity === 'warning' ? 'warning' : 'info';
          toast[toastType](notif.title, { description: notif.description });
          addNotification(sseNotifToBackendNotification(notif));
        } catch (err) {
          if (process.env.NODE_ENV === 'development') console.warn('[SSE] Failed to parse notification:', err);
        }
      });

      // ── Graph change event (v0.14 push hub) ──
      eventSource.addEventListener('graph-change', (e) => {
        try {
          const change = JSON.parse(e.data);
          if (process.env.NODE_ENV === 'development') console.log('[SSE] graph-change', change.message);
          if (change.severity === 'warning') {
            toast.warning('图谱变化', { description: change.message });
          }
          // Graph changes are informational — don't spam for 'info' level
        } catch (err) {
          if (process.env.NODE_ENV === 'development') console.warn('[SSE] Failed to parse graph-change:', err);
        }
      });

      // ── Alert summary event (v0.14 push hub) ──
      eventSource.addEventListener('alert-summary', (e) => {
        try {
          const summary = JSON.parse(e.data);
          if (summary.critical > 0) {
            toast.error(`${summary.critical} 个严重告警`, {
              description: `共 ${summary.total} 个告警，其中 ${summary.warning} 个警告`,
            });
          }
        } catch { /* ignore parse errors */ }
      });

      // ── Inventory alert ──
      eventSource.addEventListener('inventory-alert', (e) => {
        try {
          const alert = JSON.parse(e.data);
          if (process.env.NODE_ENV === 'development') console.log('[SSE] inventory-alert');
          const toastType = alert.severity === 'critical' ? 'error' : 'warning';
          toast[toastType](alert.title, { description: alert.description, duration: 5000 });
          addNotification(sseNotifToBackendNotification(alert));
          queryClient.invalidateQueries({ queryKey: ['inventory'] });
        } catch (err) {
          if (process.env.NODE_ENV === 'development') console.warn('[SSE] Failed to parse inventory-alert:', err);
        }
      });

      // ── Shipment update ──
      eventSource.addEventListener('shipment-update', (e) => {
        try {
          const update = JSON.parse(e.data);
          if (process.env.NODE_ENV === 'development') console.log('[SSE] shipment-update');
          const isDelivered = update.currentStatus === 'delivered';
          const isDelayed = update.currentStatus === 'delayed';
          const toastType = isDelayed ? 'error' : isDelivered ? 'success' : 'info';
          toast[toastType](update.description, {
            description: `${update.trackingId} | ${update.origin}→${update.destination}`,
            duration: 4000,
          });

          if (isDelayed || isDelivered) {
            addNotification({
              id: update.id ?? `sse-ship-${Date.now()}`,
              type: isDelivered ? '货运送达' : isDelayed ? '物流延误' : '货运更新',
              title: `${update.trackingId} ${isDelivered ? '已送达' : isDelayed ? '延误' : '状态更新'}`,
              description: update.description,
              icon: isDelivered ? '✅' : isDelayed ? '⚠️' : '🚢',
              color: isDelayed ? '#ef4444' : isDelivered ? '#22c55e' : '#3b82f6',
              severity: isDelayed ? 'critical' : 'info',
              sku: update.sku,
              isRead: false,
              createdAt: update.timestamp ?? new Date().toISOString(),
              source: 'logistics',
            });
          }
          queryClient.invalidateQueries({ queryKey: ['logistics'] });
        } catch (err) {
          if (process.env.NODE_ENV === 'development') console.warn('[SSE] Failed to parse shipment-update:', err);
        }
      });

      // ── Supply chain event ──
      eventSource.addEventListener('supply-chain-event', (e) => {
        try {
          const event = JSON.parse(e.data);
          if (process.env.NODE_ENV === 'development') console.log('[SSE] supply-chain-event');
          const toastType = event.severity === 'critical' ? 'error' : event.severity === 'warning' ? 'warning' : 'info';
          toast[toastType](event.title, { description: event.description });
          addNotification(sseNotifToBackendNotification(event));
        } catch (err) {
          if (process.env.NODE_ENV === 'development') console.warn('[SSE] Failed to parse supply-chain-event:', err);
        }
      });

      // ── Connector health ──
      eventSource.addEventListener('connector-health', (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.connectors && Array.isArray(payload.connectors)) {
            useConnectionStore.getState().setConnectorData(payload.connectors);
          }
        } catch {
          // Silently ignore parse errors
        }
      });

      // ── Error handling & reconnect ──
      eventSource.onerror = () => {
        if (process.env.NODE_ENV === 'development') console.warn('[SSE] Connection error');
        setWsConnected(false);
        eventSource.close();
        eventSourceRef.current = null;

        if (cancelled) return;

        // Exponential backoff reconnection
        const attempts = reconnectAttemptsRef.current;
        if (attempts >= MAX_RECONNECT_ATTEMPTS) {
          if (process.env.NODE_ENV === 'development') console.warn('[SSE] Max reconnect attempts reached');
          return;
        }

        const delay = Math.min(
          RECONNECT_BASE_DELAY * Math.pow(2, attempts),
          RECONNECT_MAX_DELAY
        );

        if (process.env.NODE_ENV === 'development') console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${attempts + 1})`);

        reconnectTimerRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          doConnect();
        }, delay);
      };
    }

    // Register reconnect function so UI can trigger manual reconnect
    registerReconnect(() => {
      reconnectAttemptsRef.current = 0;
      doConnect();
    });

    // Start the initial connection
    doConnect();

    return () => {
      cancelled = true;
      registerReconnect(null);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setWsConnected(false);
    };
  }, [setWsConnected, refreshHealth, registerReconnect, addNotification, queryClient]);

  return { connected: wsConnected };
}
