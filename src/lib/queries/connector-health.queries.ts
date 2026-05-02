/**
 * Connector Health Queries — MCP connector liveness probes for SSE.
 * Migrated from services/connector-health.service.ts.
 */

import { executeTool, getToolNames } from '@/lib/mcp/tools';
import type { ConnectorStatus } from '@/lib/types';

const ACTION_MAP: Record<string, { tool: string; params: Record<string, string> }> = {
  query_inventory: { tool: 'query_inventory', params: { action: 'overview' } },
  query_cost: { tool: 'query_cost', params: { action: 'overview' } },
  query_sales: { tool: 'query_sales', params: { action: 'overview', days: '7' } },
  query_logistics: { tool: 'query_logistics', params: { action: 'stats' } },
  query_suppliers: { tool: 'query_suppliers', params: { action: 'list' } },
  query_dashboard: { tool: 'query_dashboard', params: { action: 'summary' } },
  query_risk: { tool: 'query_risk', params: { action: 'dashboard' } },
  query_analytics: { tool: 'query_analytics', params: { action: 'supplier_performance' } },
  create_reorder: { tool: 'query_inventory', params: { action: 'reorder' } },
  adjust_inventory: { tool: 'query_inventory', params: { action: 'overview' } },
  update_shipment_status: { tool: 'query_logistics', params: { action: 'stats' } },
  update_cost_record: { tool: 'query_cost', params: { action: 'overview' } },
  create_note: { tool: 'query_suppliers', params: { action: 'list' } },
  resolve_alert: { tool: 'query_dashboard', params: { action: 'alerts' } },
};

function extractRecordCount(result: Record<string, unknown>): number {
  if (typeof result.totalItems === 'number') return result.totalItems;
  if (typeof result.totalProducts === 'number') return result.totalProducts;
  if (Array.isArray(result.shipments)) return result.shipments.length;
  if (Array.isArray(result.suppliers)) return result.suppliers.length;
  if (typeof result.totalRecommendations === 'number') return result.totalRecommendations;
  return 1;
}

export async function pingConnector(type: string): Promise<ConnectorStatus> {
  const start = Date.now();
  let status: ConnectorStatus['status'] = 'offline';
  let recordsSynced = 0;
  let latency = 0;

  try {
    const mapping = ACTION_MAP[type];
    if (!mapping) {
      return { name: type, type, status: 'offline', lastSync: new Date().toISOString(), latency: 0, recordsSynced: 0 };
    }

    const result = await executeTool(mapping.tool, mapping.params);
    latency = Date.now() - start;

    if (result && typeof result === 'object') {
      recordsSynced = extractRecordCount(result as Record<string, unknown>);
    }

    status = latency < 500 ? 'online' : latency < 2000 ? 'degraded' : 'offline';
  } catch {
    latency = Date.now() - start;
    status = 'offline';
  }

  return { name: type, type, status, lastSync: new Date().toISOString(), latency, recordsSynced };
}

export async function pingAllConnectors(): Promise<ConnectorStatus[]> {
  const toolNames = getToolNames();
  const results = await Promise.allSettled(toolNames.map(name => pingConnector(name)));
  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          name: toolNames[i] || `unknown-${i}`,
          type: toolNames[i] || '',
          status: 'offline' as const,
          lastSync: new Date().toISOString(),
          latency: 0,
          recordsSynced: 0,
        }
  );
}
