/**
 * SSE (Server-Sent Events) Real-time Stream API
 *
 * Replaces the broken WebSocket (Socket.IO) connection that returns 404
 * through the Caddy gateway. SSE works natively with Next.js Route Handlers
 * and requires no separate server or gateway configuration.
 *
 * Event schedule:
 * - heartbeat:        every 30s (keep-alive)
 * - dashboard-update: every 30s
 * - inventory-alert:  every 45s
 * - shipment-update:  every 60s
 * - supply-chain-event: every 60s
 * - notification:     every 45s
 *
 * Channel subscription via ?channel=dashboard,inventory,logistics,sales
 */

import { NextRequest } from 'next/server';
import { getDashboardMetrics, getInventoryDistribution } from '@/lib/queries/dashboard.queries';
import { getAlertTimeline } from '@/lib/services/inventory.service';
import { getShipmentList } from '@/lib/services/logistics.service';
import { getEvents } from '@/lib/queries/events.queries';
import { pingAllConnectors } from '@/lib/queries/connector-health.queries';
import { getLatestRates } from '@/lib/queries/exchange-rate.queries';
import { getPortWeatherSummary } from '@/lib/services/weather.service';
import { setCostSseBroadcaster } from '@/lib/services/cost.service';
import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch dashboard data for SSE push (with short-lived cache to avoid DB overload) */
async function fetchDashboardPayload() {
  return cachedFetch(
    cacheKey('sse', 'dashboard'),
    async () => {
      const [metrics, distribution] = await Promise.all([
        getDashboardMetrics().catch(() => null),
        getInventoryDistribution().catch(() => null),
      ]);
      return { metrics, distribution };
    },
    CACHE_TTL.SHORT // 15s cache
  );
}

/** Fetch inventory alert data for SSE push */
async function fetchInventoryAlertPayload() {
  return cachedFetch(
    cacheKey('sse', 'inventory-alert'),
    async () => {
      const timeline = await getAlertTimeline(5).catch(() => null);
      if (!timeline || !timeline.events || timeline.events.length === 0) return null;
      const latestAlert = timeline.events[0];
      return {
        id: `inv-alert-${Date.now()}`,
        alertType: latestAlert.eventType === 'critical' ? 'low_stock' : 'reorder_reminder',
        title: latestAlert.title || '库存预警',
        description: latestAlert.description || '',
        severity: latestAlert.severity || 'warning',
        sku: latestAlert.sku,
        productName: latestAlert.productName,
      };
    },
    CACHE_TTL.SHORT
  );
}

/** Fetch shipment data for SSE push */
async function fetchShipmentPayload() {
  return cachedFetch(
    cacheKey('sse', 'shipment-update'),
    async () => {
      const result = await getShipmentList().catch(() => null);
      if (!result || !result.shipments || result.shipments.length === 0) return null;
      // Pick a random shipment to highlight
      const idx = Math.floor(Math.random() * result.shipments.length);
      const s = result.shipments[idx];
      return {
        id: `ship-${Date.now()}`,
        trackingId: s.trackingNumber,
        sku: s.sku,
        productName: s.productName,
        currentStatus: s.status,
        description: `${s.trackingNumber} ${s.origin}\u2192${s.destination} \u72B6\u6001: ${s.status}`,
        progress: 0,
        eta: s.eta,
        origin: s.origin,
        destination: s.destination,
      };
    },
    CACHE_TTL.SHORT
  );
}

/** Fetch notification/event data for SSE push */
async function fetchNotificationPayload() {
  return cachedFetch(
    cacheKey('sse', 'notification'),
    async () => {
      const result = await getEvents({ pageSize: 5 }).catch(() => null);
      if (!result || !result.events || result.events.length === 0) return null;
      const latestEvent = result.events[0];
      return {
        id: latestEvent.id || `notif-${Date.now()}`,
        type: latestEvent.type || 'system',
        title: latestEvent.title || '系统通知',
        description: latestEvent.description || '',
        severity: latestEvent.severity || 'info',
        sku: latestEvent.sku,
      };
    },
    CACHE_TTL.SHORT
  );
}

/** Fetch supply-chain-event data for SSE push */
async function fetchSupplyChainEventPayload() {
  return cachedFetch(
    cacheKey('sse', 'supply-chain-event'),
    async () => {
      const result = await getEvents({ pageSize: 3 }).catch(() => null);
      if (!result || !result.events || result.events.length === 0) return null;
      const latestEvent = result.events[0];
      return {
        type: latestEvent.type || 'system',
        title: latestEvent.title,
        description: latestEvent.description,
        severity: latestEvent.severity || 'info',
        sku: latestEvent.sku,
        timestamp: latestEvent.createdAt?.toISOString?.() ?? new Date().toISOString(),
      };
    },
    CACHE_TTL.SHORT
  );
}

/** Fetch FX rate data for SSE push */
async function fetchFxPayload() {
  try {
    const rates = await getLatestRates('CNY');
    return { rates: rates.rates, trend: rates.trend, base: rates.base, timestamp: rates.timestamp };
  } catch { return null; }
}

/** Fetch weather alert summary for SSE push */
async function fetchWeatherPayload() {
  try {
    const summary = await getPortWeatherSummary();
    return { ...summary, timestamp: new Date().toISOString() };
  } catch { return null; }
}

/** Format an SSE message string */
function formatSSE(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Format a heartbeat SSE message */
function formatHeartbeat(): string {
  return `:heartbeat ${Date.now()}\n\n`;
}

// ─── Channel filtering ────────────────────────────────────────────────────────

/** Fetch connector health data for SSE push */
async function fetchConnectorHealthPayload() {
  try {
    const connectors = await pingAllConnectors();
    return { connectors, timestamp: new Date().toISOString() };
  } catch {
    return null;
  }
}

/** Map channels to which SSE events they subscribe to */
const CHANNEL_EVENTS: Record<string, string[]> = {
  dashboard: ['dashboard-update', 'heartbeat'],
  inventory: ['inventory-alert', 'dashboard-update'],
  logistics: ['shipment-update'],
  sales: ['dashboard-update', 'notification'],
};

function parseChannels(url: URL): Set<string> {
  const channelParam = url.searchParams.get('channel') || '';
  if (!channelParam) {
    // If no channel specified, subscribe to all events
    return new Set([
      'dashboard-update',
      'inventory-alert',
      'shipment-update',
      'supply-chain-event',
      'notification',
      'heartbeat',
    ]);
  }
  const channels = channelParam.split(',').map(c => c.trim()).filter(Boolean);
  const events = new Set<string>();
  for (const ch of channels) {
    const evts = CHANNEL_EVENTS[ch];
    if (evts) {
      evts.forEach(e => events.add(e));
    }
  }
  // Always include heartbeat
  events.add('heartbeat');
  return events;
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const subscribedEvents = parseChannels(url);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const enqueue = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
          clearAllTimers();
        }
      };

      // Wire cost service SSE broadcaster (so FX rate changes push to connected clients)
      setCostSseBroadcaster((event, data) => {
        enqueue(formatSSE(event, data as Record<string, unknown>));
      });

      // ── Heartbeat (every 30s) ──
      const heartbeatTimer = setInterval(() => {
        if (!subscribedEvents.has('heartbeat') && !subscribedEvents.has('dashboard-update')) return;
        enqueue(formatHeartbeat());
      }, 30000);

      // ── Dashboard update (every 30s) ──
      const dashboardTimer = setInterval(async () => {
        if (!subscribedEvents.has('dashboard-update')) return;
        try {
          const payload = await fetchDashboardPayload();
          if (payload && payload.metrics) {
            enqueue(formatSSE('dashboard-update', {
              metrics: payload.metrics,
              inventorySummary: payload.distribution
                ? { total: payload.metrics.totalInventory, distribution: payload.distribution }
                : undefined,
              timestamp: new Date().toISOString(),
              source: 'sse',
            }));
          }
        } catch {
          // Silently ignore errors to keep the stream alive
        }
      }, 30000);

      // ── Inventory alert (every 45s) ──
      const inventoryAlertTimer = setInterval(async () => {
        if (!subscribedEvents.has('inventory-alert')) return;
        try {
          const payload = await fetchInventoryAlertPayload();
          if (payload) {
            enqueue(formatSSE('inventory-alert', {
              ...payload,
              timestamp: new Date().toISOString(),
              source: 'sse',
            }));
            // Also push as supply-chain-event
            if (subscribedEvents.has('supply-chain-event')) {
              enqueue(formatSSE('supply-chain-event', {
                type: 'inventory_alert',
                title: payload.title,
                description: payload.description,
                severity: payload.severity,
                sku: payload.sku,
                timestamp: new Date().toISOString(),
              }));
            }
          }
        } catch {
          // Silently ignore
        }
      }, 45000);

      // ── Shipment update (every 60s) ──
      const shipmentTimer = setInterval(async () => {
        if (!subscribedEvents.has('shipment-update')) return;
        try {
          const payload = await fetchShipmentPayload();
          if (payload) {
            enqueue(formatSSE('shipment-update', {
              ...payload,
              timestamp: new Date().toISOString(),
              source: 'sse',
            }));
          }
        } catch {
          // Silently ignore
        }
      }, 60000);

      // ── Notification (every 45s) ──
      const notificationTimer = setInterval(async () => {
        if (!subscribedEvents.has('notification')) return;
        try {
          const payload = await fetchNotificationPayload();
          if (payload) {
            enqueue(formatSSE('notification', {
              ...payload,
              timestamp: new Date().toISOString(),
              source: 'sse',
            }));
          }
        } catch {
          // Silently ignore
        }
      }, 45000);

      // ── Supply-chain-event (every 60s) ──
      const supplyChainEventTimer = setInterval(async () => {
        if (!subscribedEvents.has('supply-chain-event')) return;
        try {
          const payload = await fetchSupplyChainEventPayload();
          if (payload) {
            enqueue(formatSSE('supply-chain-event', {
              ...payload,
              timestamp: new Date().toISOString(),
              source: 'sse',
            }));
          }
        } catch {
          // Silently ignore
        }
      }, 60000);

      // ── Connector-health (every 90s) ──
      const connectorHealthTimer = setInterval(async () => {
        try {
          const payload = await fetchConnectorHealthPayload();
          if (payload) {
            enqueue(formatSSE('connector-health', payload));
          }
        } catch {
          // Silently ignore
        }
      }, 90000);

      // Push initial connector health after 5s
      setTimeout(async () => {
        try {
          const payload = await fetchConnectorHealthPayload();
          if (payload) enqueue(formatSSE('connector-health', payload));
        } catch { /* ignore */ }
      }, 5000);

      // ── FX rates (every 5min) ──
      let fxTimer: ReturnType<typeof setInterval> | null = null;
      const pushFx = async () => {
        try {
          const payload = await fetchFxPayload();
          if (payload) enqueue(formatSSE('fx-update', payload));
        } catch { /* ignore */ }
      };
      fxTimer = setInterval(pushFx, 300000);
      setTimeout(pushFx, 8000); // initial after 8s

      // ── Weather alerts (every 10min) ──
      let weatherTimer: ReturnType<typeof setInterval> | null = null;
      const pushWeather = async () => {
        try {
          const payload = await fetchWeatherPayload();
          if (payload) enqueue(formatSSE('weather-update', payload));
        } catch { /* ignore */ }
      };
      weatherTimer = setInterval(pushWeather, 600000);
      setTimeout(pushWeather, 10000); // initial after 10s

      // ── Initial connection event ──
      enqueue(formatSSE('connected', {
        message: '供应链实时推送服务已连接（SSE模式）',
        serverTime: new Date().toISOString(),
        channels: [...subscribedEvents],
        source: 'sse',
      }));

      // Push an initial dashboard update after 2 seconds
      setTimeout(async () => {
        if (!subscribedEvents.has('dashboard-update')) return;
        try {
          const payload = await fetchDashboardPayload();
          if (payload && payload.metrics) {
            enqueue(formatSSE('dashboard-update', {
              metrics: payload.metrics,
              inventorySummary: payload.distribution
                ? { total: payload.metrics.totalInventory, distribution: payload.distribution }
                : undefined,
              timestamp: new Date().toISOString(),
              source: 'sse',
            }));
          }
        } catch {
          // Silently ignore
        }
      }, 2000);

      // ── Cleanup ──
      const allTimers = [heartbeatTimer, dashboardTimer, inventoryAlertTimer, shipmentTimer, notificationTimer, supplyChainEventTimer, connectorHealthTimer, fxTimer, weatherTimer].filter(Boolean) as ReturnType<typeof setInterval>[];

      function clearAllTimers() {
        allTimers.forEach(t => clearInterval(t));
      }

      // When the client disconnects, Next.js will abort the request.
      // We detect this via request.signal.
      request.signal.addEventListener('abort', () => {
        closed = true;
        clearAllTimers();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
