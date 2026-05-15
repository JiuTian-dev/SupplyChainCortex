import { create } from 'zustand';
import { MCP_CONNECTORS } from '@/lib/constants';
import type { ConnectorStatus } from '@/lib/types';

// ==================== Connection Store ====================
// Manages SSE real-time connection status and MCP connector data.
// Note: `wsConnected` / `setWsConnected` are legacy names from the
// previous WebSocket implementation. They now track the SSE connection
// state. The SSE hook (`useSSE`) calls `setWsConnected(true/false)`.
// The deprecated WebSocket hook has been removed.
//
// Connector health flow:
//   1. Initial state — all 'offline' (honest, from constants.ts)
//   2. On mount → refreshHealth() fetches GET /api/connector-health
//   3. SSE 'connector-health' event pushes updates every 90 s

interface ConnectionState {
  /** Whether the SSE real-time stream is connected (legacy name: wsConnected) */
  wsConnected: boolean;
  connectorData: ConnectorStatus[];
  /** Registered reconnect function for SSE */
  _reconnectFn: (() => void) | null;
  /** True while a health-check fetch is in flight */
  healthLoading: boolean;
}

interface ConnectionActions {
  /** Update SSE connection status (legacy name: setWsConnected) */
  setWsConnected: (connected: boolean) => void;
  setConnectorData: (data: ConnectorStatus[]) => void;
  /** Update a single connector by type */
  updateConnector: (type: string, update: Partial<ConnectorStatus>) => void;
  /** Register a reconnect function (called by SSE hook) */
  registerReconnect: (fn: (() => void) | null) => void;
  /** Trigger a manual reconnect (called by UI) */
  requestReconnect: () => void;
  /**
   * Fetch live connector health from the server.
   * Calls GET /api/connector-health and replaces connectorData
   * with real probe results.
   */
  refreshHealth: () => Promise<void>;
}

export const useConnectionStore = create<ConnectionState & ConnectionActions>((set, get) => ({
  // ==================== Initial State ====================
  wsConnected: false,
  connectorData: MCP_CONNECTORS as ConnectorStatus[],
  _reconnectFn: null,
  healthLoading: false,

  // ==================== Actions ====================
  setWsConnected: (connected) => set({ wsConnected: connected }),

  setConnectorData: (data) => set({ connectorData: data }),

  updateConnector: (type, update) =>
    set((state) => ({
      connectorData: state.connectorData.map((c) =>
        c.type === type ? { ...c, ...update } : c
      ),
    })),

  registerReconnect: (fn) => set({ _reconnectFn: fn }),

  requestReconnect: () => {
    const fn = get()._reconnectFn;
    if (fn) {
      fn();
    }
  },

  refreshHealth: async () => {
    set({ healthLoading: true });
    try {
      const res = await fetch('/api/connector-health');
      if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
      const json = (await res.json()) as { data?: { connectors?: ConnectorStatus[] } };
      const connectors = json?.data?.connectors;
      if (connectors && Array.isArray(connectors) && connectors.length > 0) {
        set({ connectorData: connectors });
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[ConnectionStore] refreshHealth failed:', err);
      }
      // Keep last-known-good data on failure — don't reset to offline
    } finally {
      set({ healthLoading: false });
    }
  },
}));
