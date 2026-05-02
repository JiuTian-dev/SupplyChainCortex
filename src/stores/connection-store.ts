import { create } from 'zustand';
import { MCP_CONNECTORS } from '@/lib/constants';
import type { ConnectorStatus } from '@/lib/types';

// ==================== Connection Store ====================
// Manages SSE real-time connection status and MCP connector data.
// Note: `wsConnected` / `setWsConnected` are legacy names from the
// previous WebSocket implementation. They now track the SSE connection
// state. The SSE hook (`useSSE`) calls `setWsConnected(true/false)`.
// The deprecated WebSocket hook has been removed.

interface ConnectionState {
  /** Whether the SSE real-time stream is connected (legacy name: wsConnected) */
  wsConnected: boolean;
  connectorData: ConnectorStatus[];
  /** Registered reconnect function for SSE */
  _reconnectFn: (() => void) | null;
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
}

export const useConnectionStore = create<ConnectionState & ConnectionActions>((set, get) => ({
  // ==================== Initial State ====================
  wsConnected: false,
  connectorData: MCP_CONNECTORS as ConnectorStatus[],
  _reconnectFn: null,

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
}));
