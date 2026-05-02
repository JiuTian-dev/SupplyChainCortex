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

// ==================== 供应链事件默认数据 ====================
export const DEFAULT_EVENTS = [
  { id: '1', type: '补货订单', icon: '📦', color: '#f97316', title: '补货订单已下单', description: 'KA-BK2001 补货 500 件已下单', createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
  { id: '2', type: '货运更新', icon: '🚢', color: '#3b82f6', title: '货运状态更新', description: 'SH-20250118 已完成清关', createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },
  { id: '3', type: '库存预警', icon: '⚠️', color: '#f59e0b', title: '库存低于安全线', description: 'CL-HM5004 库存低于安全线', createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString() },
];

// ==================== 航线地图数据 ====================
export const SHIPPING_ROUTES = [
  { id: 'CN-US', from: { name: '深圳', x: 74, y: 48 }, to: { name: '洛杉矶', x: 15, y: 36 }, color: '#f97316', status: 'active', shipments: 2, avgDays: 12 },
  { id: 'CN-EU', from: { name: '义乌', x: 76, y: 40 }, to: { name: '伦敦', x: 47, y: 28 }, color: '#ef4444', status: 'delayed', shipments: 1, avgDays: 15 },
  { id: 'CN-JP', from: { name: '深圳', x: 74, y: 48 }, to: { name: '东京', x: 83, y: 38 }, color: '#22c55e', status: 'active', shipments: 2, avgDays: 5 },
  { id: 'CN-CA', from: { name: '义乌', x: 76, y: 40 }, to: { name: '温哥华', x: 13, y: 30 }, color: '#06b6d4', status: 'customs', shipments: 1, avgDays: 13 },
  { id: 'CN-AU', from: { name: '深圳', x: 74, y: 48 }, to: { name: '悉尼', x: 86, y: 74 }, color: '#8b5cf6', status: 'delivered', shipments: 1, avgDays: 11 },
];

// ==================== 库存库龄分布数据 ====================
export const INVENTORY_AGING_DATA = [
  { name: '空气炸锅', '0-30天': 320, '31-60天': 180, '61-90天': 85, '90+天': 45 },
  { name: '吸尘器', '0-30天': 250, '31-60天': 150, '61-90天': 120, '90+天': 95 },
  { name: '电吹风', '0-30天': 410, '31-60天': 90, '61-90天': 40, '90+天': 20 },
  { name: '咖啡机', '0-30天': 180, '31-60天': 200, '61-90天': 110, '90+天': 130 },
  { name: '电饭煲', '0-30天': 290, '31-60天': 160, '61-90天': 70, '90+天': 55 },
  { name: '榨汁机', '0-30天': 150, '31-60天': 130, '61-90天': 140, '90+天': 180 },
];

export const AGING_COLORS = { '0-30天': '#22c55e', '31-60天': '#3b82f6', '61-90天': '#f59e0b', '90+天': '#ef4444' };

// ==================== 仓库容量热力图数据 ====================
export const WAREHOUSE_DATA = {
  zones: [
    { name: 'A区-高周转', capacity: 5000, used: 4200, category: '厨房电器', color: '#f97316' },
    { name: 'B区-中周转', capacity: 4000, used: 2800, category: '清洁电器', color: '#22c55e' },
    { name: 'C区-低周转', capacity: 3000, used: 2400, category: '个人护理', color: '#06b6d4' },
    { name: 'D区-暂存区', capacity: 2000, used: 1800, category: '待出库', color: '#8b5cf6' },
    { name: 'E区-退货区', capacity: 1000, used: 350, category: '退货处理', color: '#ef4444' },
    { name: 'F区-新品区', capacity: 1500, used: 900, category: '新品入库', color: '#f59e0b' },
  ],
  totalCapacity: 16500,
  totalUsed: 12450,
  warehouses: [
    { name: '深圳仓', zones: [0,1,2], capacity: 8000, used: 6400 },
    { name: '义乌仓', zones: [3,4,5], capacity: 8500, used: 6050 },
  ],
};

// ==================== 供应链评分趋势数据 ====================
export const SCORE_TREND_DATA = [
  { month: '11月', score: 65, inventory: 70, cost: 60, logistics: 62, sales: 68, risk: 58 },
  { month: '12月', score: 68, inventory: 72, cost: 63, logistics: 65, sales: 72, risk: 60 },
  { month: '1月', score: 70, inventory: 73, cost: 65, logistics: 68, sales: 75, risk: 62 },
  { month: '2月', score: 69, inventory: 72, cost: 64, logistics: 70, sales: 74, risk: 61 },
  { month: '3月', score: 71, inventory: 74, cost: 66, logistics: 71, sales: 78, risk: 63 },
  { month: '4月', score: 72, inventory: 75, cost: 68, logistics: 72, sales: 82, risk: 65 },
];

// ==================== 品类下钻产品数据 ====================
export const DRILL_DOWN_PRODUCTS: Record<string, { name: string; revenue: number; qty: number; margin: number }[]> = {
  '厨房电器': [
    { name: '智能电热水壶', revenue: 28500, qty: 712, margin: 52.1 },
    { name: '便携式咖啡机', revenue: 42000, qty: 525, margin: 48.5 },
    { name: '多功能烤面包机', revenue: 18700, qty: 340, margin: 49.8 },
    { name: '便携榨汁杯', revenue: 12300, qty: 615, margin: 44.2 },
  ],
  '清洁电器': [
    { name: '无线手持吸尘器', revenue: 51000, qty: 510, margin: 47.6 },
    { name: '智能加湿器', revenue: 15600, qty: 520, margin: 51.2 },
    { name: 'HEPA 空气净化器', revenue: 38000, qty: 292, margin: 46.8 },
    { name: '蒸汽挂烫机', revenue: 11200, qty: 249, margin: 47.5 },
  ],
  '个人护理': [
    { name: '负离子吹风机', revenue: 22000, qty: 440, margin: 50.0 },
    { name: '电动按摩仪', revenue: 19800, qty: 330, margin: 43.8 },
    { name: '电动牙刷套装', revenue: 8700, qty: 348, margin: 45.6 },
    { name: '电子秤', revenue: 5200, qty: 325, margin: 53.2 },
  ],
};

// ==================== 销售日历热力图数据 ====================
export const SALES_HEATMAP_DATA = (() => {
  const data: { day: number; weekday: number; week: number; sales: number }[] = [];
  const today = new Date();
  // Use a deterministic seed for consistent rendering
  let seed = 42;
  const seededRandom = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    data.push({
      day: d.getDate(),
      weekday: d.getDay() === 0 ? 6 : d.getDay() - 1,
      week: Math.floor((27 - i) / 7),
      sales: Math.floor(500 + seededRandom() * 1000),
    });
  }
  return data;
})();

// ==================== 成本变动追踪数据 ====================
export const COST_VARIANCE_DATA = [
  { name: '空气炸锅', change: 5.2, absChange: 3.85, sku: 'KA-TP1003' },
  { name: '吸尘器', change: -3.1, absChange: -2.45, sku: 'CL-HM5004' },
  { name: '电吹风', change: 2.8, absChange: 1.92, sku: 'PE-HM2005' },
  { name: '咖啡机', change: 7.5, absChange: 6.12, sku: 'KA-CF3002' },
  { name: '电饭煲', change: -1.5, absChange: -1.08, sku: 'KA-RC4001' },
  { name: '榨汁机', change: 4.3, absChange: 2.67, sku: 'KA-BK2001' },
];

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
