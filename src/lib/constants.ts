// SupplyChain Cortex - 常量定义

import type { ConnectorStatus } from './types';
import type { AlertRule } from '@prisma/client';

// ==================== 状态映射 ====================
export const STATUS_COLORS: Record<string, string> = {
  healthy: "#22c55e",
  warning: "#f59e0b",
  critical: "#ef4444",
  overstock: "#8b5cf6",
};

export const STATUS_LABELS: Record<string, string> = {
  healthy: "健康",
  warning: "预警",
  critical: "紧急",
  overstock: "积压",
};

export const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  pending: "待发货",
  in_transit: "运输中",
  customs: "清关中",
  delivered: "已送达",
  delayed: "延误",
  exception: "异常",
};

export const SHIPMENT_STATUS_COLORS: Record<string, string> = {
  pending: "#94a3b8",
  in_transit: "#3b82f6",
  customs: "#f59e0b",
  delivered: "#22c55e",
  delayed: "#ef4444",
  exception: "#dc2626",
};

// ==================== 图表颜色 ====================
export const CHART_COLORS = ["#f97316", "#22c55e", "#06b6d4", "#8b5cf6", "#ef4444", "#f59e0b", "#ec4899"];

// ==================== MCP 连接器 ====================
// Initial connector data — status starts at 'offline' (honest default).
// Real health data arrives via:
//   1. SSE `connector-health` push (every 90 s, first at 5 s)
//   2. Client-side getConnectorHealth() call on mount (see connection-store)
// The status field is NEVER hardcoded to 'online' — it reflects live probes.
export const MCP_CONNECTORS: ConnectorStatus[] = [
  { name: '数据库',          type: 'database',  status: 'offline', lastSync: new Date().toISOString(), latency: 0, recordsSynced: 0 },
  { name: 'Open-Meteo 天气', type: 'weather',   status: 'offline', lastSync: new Date().toISOString(), latency: 0, recordsSynced: 0 },
  { name: 'Frankfurter 汇率', type: 'fx',        status: 'offline', lastSync: new Date().toISOString(), latency: 0, recordsSynced: 0 },
  { name: '库存 MCP',       type: 'inventory', status: 'offline', lastSync: new Date().toISOString(), latency: 0, recordsSynced: 0 },
  { name: '成本 MCP',       type: 'cost',       status: 'offline', lastSync: new Date().toISOString(), latency: 0, recordsSynced: 0 },
  { name: '物流 MCP',       type: 'logistics', status: 'offline', lastSync: new Date().toISOString(), latency: 0, recordsSynced: 0 },
  { name: '销售 MCP',       type: 'sales',     status: 'offline', lastSync: new Date().toISOString(), latency: 0, recordsSynced: 0 },
];

export const AGING_COLORS = { '0-30天': '#22c55e', '31-60天': '#3b82f6', '61-90天': '#f59e0b', '90+天': '#ef4444' };

// Legacy static data removed — replaced by dynamic DB queries via API routes.
// Inventory aging, warehouse zones, score trends, sales heatmap, cost variance
// are now computed from Prisma DB data at query time.

// ==================== 预警规则默认值 ====================
export const DEFAULT_ALERT_RULES: Omit<AlertRule, 'createdAt' | 'updatedAt' | 'ruleId'>[] = [
  { id: 'low-stock', name: '低库存预警', field: 'quantity', operator: '<', threshold: 0.5, unit: '安全库存倍数', enabled: true, severity: 'critical', tenantId: 'default' },
  { id: 'overstock', name: '库存积压预警', field: 'turnoverDays', operator: '>', threshold: 120, unit: '天', enabled: true, severity: 'warning', tenantId: 'default' },
  { id: 'slow-moving', name: '滞销产品预警', field: 'turnoverDays', operator: '>', threshold: 90, unit: '天', enabled: true, severity: 'warning', tenantId: 'default' },
  { id: 'low-margin', name: '低毛利预警', field: 'grossMargin', operator: '<', threshold: 48, unit: '%', enabled: true, severity: 'critical', tenantId: 'default' },
];

// ==================== 供应商品类/地区选项 ====================
export const SUPPLIER_CATEGORIES = ['原材料', '电子配件', '包装材料', '五金配件', '塑料件', '电机组件'];
export const SUPPLIER_REGIONS = ['华东', '华南', '华北', '华中', '西南', '海外'];
