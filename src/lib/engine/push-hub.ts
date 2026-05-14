/**
 * Push Hub — lightweight in-process event emitter for real-time notifications.
 *
 * Enables the notification service to broadcast to all connected SSE clients
 * without external dependencies (no Redis, no Socket.IO server).
 *
 * Architecture:
 *   notifications.service → pushHub.emit('notification', n) →
 *   SSE endpoint listeners → push to connected clients
 *
 * Also emits graph-change events when edge weights shift significantly.
 */

import { EventEmitter } from 'events';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface PushNotification {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  sku?: string;
  source: string;
  timestamp: string;
}

export interface GraphChangeEvent {
  nodeId: string;
  nodeLabel: string;
  changeType: 'weight_change' | 'node_added' | 'node_removed' | 'edge_removed' | 'risk_spike';
  oldValue?: number;
  newValue?: number;
  message: string;
  severity: 'warning' | 'info';
  timestamp: string;
}

export type PushEvent =
  | { type: 'notification'; data: PushNotification }
  | { type: 'graph-change'; data: GraphChangeEvent }
  | { type: 'alert-summary'; data: { critical: number; warning: number; total: number } }
  | { type: 'connected'; data: { message: string } };

// ─── Hub ─────────────────────────────────────────────────────────────────────────

class PushHub {
  private emitter = new EventEmitter();
  private listenerCount = 0;

  /** Broadcast an event to all SSE listeners */
  emit(event: PushEvent): void {
    this.emitter.emit('push', event);
  }

  /** Subscribe a callback for SSE streaming. Returns unsubscribe function. */
  subscribe(callback: (event: PushEvent) => void): () => void {
    this.listenerCount++;
    const handler = (event: PushEvent) => callback(event);
    this.emitter.on('push', handler);
    return () => {
      this.listenerCount--;
      this.emitter.off('push', handler);
    };
  }

  /** Get number of connected clients */
  getConnectionCount(): number {
    return this.listenerCount;
  }

  /**
   * Convenience: emit a notification from the standard Notification format
   * used by notifications.service.ts
   */
  emitNotification(n: {
    id: string; type: string; title: string; description: string;
    severity: string; sku?: string; source: string; createdAt: Date;
  }): void {
    this.emit({
      type: 'notification',
      data: {
        id: n.id,
        type: n.type,
        title: n.title,
        description: n.description,
        severity: n.severity as 'critical' | 'warning' | 'info',
        sku: n.sku,
        source: n.source,
        timestamp: n.createdAt.toISOString(),
      },
    });
  }

  /** Emit a batch of notifications efficiently */
  emitNotificationBatch(notifications: Array<{
    id: string; type: string; title: string; description: string;
    severity: string; sku?: string; source: string; createdAt: Date;
  }>): void {
    if (notifications.length === 0) return;
    for (const n of notifications) {
      this.emitNotification(n);
    }
    // Also emit summary
    const critical = notifications.filter(n => n.severity === 'critical').length;
    const warning = notifications.filter(n => n.severity === 'warning').length;
    this.emit({
      type: 'alert-summary',
      data: { critical, warning, total: notifications.length },
    });
  }

  /** Emit a graph change event */
  emitGraphChange(change: GraphChangeEvent): void {
    this.emit({ type: 'graph-change', data: change });
  }
}

export const pushHub = new PushHub();
