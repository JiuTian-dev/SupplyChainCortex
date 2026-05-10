// SupplyChain Cortex - 常量定义

import type { ConnectorStatus, AlertRule } from './types';

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
// Initial connector data — shows online until SSE pushes real status
export const MCP_CONNECTORS: ConnectorStatus[] = [
  { name: '数据库', type: 'database', status: 'online', lastSync: new Date().toISOString(), latency: 2, recordsSynced: 72000 },
  { name: 'Open-Meteo 天气', type: 'weather', status: 'online', lastSync: new Date().toISOString(), latency: 45, recordsSynced: 12 },
  { name: 'Frankfurter 汇率', type: 'fx', status: 'online', lastSync: new Date().toISOString(), latency: 38, recordsSynced: 63 },
  { name: '库存 MCP', type: 'inventory', status: 'online', lastSync: new Date().toISOString(), latency: 5, recordsSynced: 72 },
  { name: '成本 MCP', type: 'cost', status: 'online', lastSync: new Date().toISOString(), latency: 8, recordsSynced: 72 },
  { name: '物流 MCP', type: 'logistics', status: 'online', lastSync: new Date().toISOString(), latency: 12, recordsSynced: 220 },
  { name: '销售 MCP', type: 'sales', status: 'online', lastSync: new Date().toISOString(), latency: 6, recordsSynced: 26280 },
];

export const AGING_COLORS = { '0-30天': '#22c55e', '31-60天': '#3b82f6', '61-90天': '#f59e0b', '90+天': '#ef4444' };

// Legacy static data removed — replaced by dynamic DB queries via API routes.
// Inventory aging, warehouse zones, score trends, sales heatmap, cost variance
// are now computed from Prisma DB data at query time.

// ==================== 预警规则默认值 ====================
export const DEFAULT_ALERT_RULES: AlertRule[] = [
  { id: 'low-stock', name: '低库存预警', field: 'quantity', operator: '<', threshold: 0.5, unit: '安全库存倍数', enabled: true, severity: 'critical' },
  { id: 'overstock', name: '库存积压预警', field: 'turnoverDays', operator: '>', threshold: 120, unit: '天', enabled: true, severity: 'warning' },
  { id: 'slow-moving', name: '滞销产品预警', field: 'turnoverDays', operator: '>', threshold: 90, unit: '天', enabled: true, severity: 'warning' },
  { id: 'low-margin', name: '低毛利预警', field: 'grossMargin', operator: '<', threshold: 48, unit: '%', enabled: true, severity: 'critical' },
];

// ==================== 供应商品类/地区选项 ====================
export const SUPPLIER_CATEGORIES = ['原材料', '电子配件', '包装材料', '五金配件', '塑料件', '电机组件'];
export const SUPPLIER_REGIONS = ['华东', '华南', '华北', '华中', '西南', '海外'];
