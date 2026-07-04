/**
 * Connector Health — runs real MCP tool probes to determine each logical
 * connector's live status instead of relying on static constants.
 *
 * Each MCP_CONNECTOR type (weather, fx, inventory, …) maps to one or more
 * underlying MCP tools.  The function executes those tools, measures
 * latency, and returns a ConnectorStatus[] that the connection store can
 * consume immediately.
 */

import { executeTool } from './tools';
import type { ConnectorStatus } from '@/lib/types';

// ==================== Connector → MCP Tool Map ====================

/**
 * Maps logical connector type keys (as used in MCP_CONNECTORS) to the
 * real MCP tool + parameters that should be called to probe health.
 *
 * Each tool acts as a canary — if it returns successfully the
 * underlying service (and its data source) is presumed healthy.
 */
const CONNECTOR_MCP_MAP: Record<
  string,
  { tool: string; params: Record<string, string> }
> = {
  database:   { tool: 'query_dashboard',      params: { action: 'metrics' } },
  weather:    { tool: 'query_weather',        params: { action: 'summary' } },
  fx:         { tool: 'query_exchange_rates', params: { action: 'latest' } },
  inventory:  { tool: 'query_inventory',      params: { action: 'overview' } },
  cost:       { tool: 'query_cost',           params: { action: 'overview' } },
  logistics:  { tool: 'query_logistics',      params: { action: 'stats' } },
  sales:      { tool: 'query_sales',          params: { action: 'overview', days: '7' } },
};

// ==================== Canonical Connector List ====================

/**
 * The master list of connectors.  Every connector that appears here
 * will be probed by getConnectorHealth() and displayed in the UI.
 *
 * This is the single source of truth — keep MCP_CONNECTORS in
 * constants.ts in sync with this array.
 */
export const CONNECTOR_DEFINITIONS: { name: string; type: string }[] = [
  { name: '数据库',          type: 'database' },
  { name: 'Open-Meteo 天气', type: 'weather' },
  { name: 'Frankfurter 汇率', type: 'fx' },
  { name: '库存 MCP',       type: 'inventory' },
  { name: '成本 MCP',       type: 'cost' },
  { name: '物流 MCP',       type: 'logistics' },
  { name: '销售 MCP',       type: 'sales' },
  { name: 'Supplier API 图谱', type: 'supplier-api' },
];

// ==================== Helpers ====================

/** Try to extract a meaningful record count from a tool result. */
function extractRecordCount(result: unknown): number {
  if (!result || typeof result !== 'object') return 0;
  const r = result as Record<string, unknown>;
  if (typeof r.totalItems === 'number') return r.totalItems;
  if (typeof r.totalProducts === 'number') return r.totalProducts;
  if (typeof r.totalRecords === 'number') return r.totalRecords;
  if (Array.isArray(r.shipments)) return r.shipments.length;
  if (Array.isArray(r.suppliers)) return r.suppliers.length;
  if (Array.isArray(r.products)) return r.products.length;
  if (Array.isArray(r.records)) return r.records.length;
  if (Array.isArray(r.items)) return r.items.length;
  if (typeof r.count === 'number') return r.count;
  return 0;
}

/** Determine status from latency in ms. */
function statusFromLatency(ms: number): ConnectorStatus['status'] {
  if (ms < 500) return 'online';
  if (ms < 2000) return 'degraded';
  return 'offline';
}

// ==================== Public API ====================

/**
 * Run a real-time health probe against every MCP connector.
 *
 * For each connector type the mapped MCP tool is called; the
 * round-trip latency determines the returned status:
 *  - <500 ms   → online
 *  - <2000 ms  → degraded
 *  - >=2000 ms → offline
 *
 * If a connector type has no tool mapping or the tool throws, it is
 * reported as offline with 0 records.
 */
export async function getConnectorHealth(): Promise<ConnectorStatus[]> {
  const results = await Promise.allSettled(
    CONNECTOR_DEFINITIONS.map(async (def) => {
      const mapping = CONNECTOR_MCP_MAP[def.type];
      if (!mapping) {
        return buildOffline(def, 0);
      }

      const start = Date.now();
      try {
        const result = await executeTool(mapping.tool, mapping.params);
        const latency = Date.now() - start;
        return {
          name: def.name,
          type: def.type,
          status: statusFromLatency(latency),
          lastSync: new Date().toISOString(),
          latency,
          recordsSynced: extractRecordCount(result),
        };
      } catch {
        return buildOffline(def, Date.now() - start);
      }
    }),
  );

  return results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          name: 'unknown',
          type: 'unknown',
          status: 'offline' as const,
          lastSync: new Date().toISOString(),
          latency: 0,
          recordsSynced: 0,
        },
  );
}

function buildOffline(
  def: { name: string; type: string },
  latency: number,
): ConnectorStatus {
  return {
    name: def.name,
    type: def.type,
    status: 'offline',
    lastSync: new Date().toISOString(),
    latency,
    recordsSynced: 0,
  };
}

