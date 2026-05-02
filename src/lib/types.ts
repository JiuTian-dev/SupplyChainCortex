// SupplyChain Cortex - 类型定义

// ==================== 仪表盘 ====================
export interface DashboardMetrics {
  totalProducts: number;
  totalInventory: number;
  totalRevenue: number;
  revenueGrowth: number;
  activeShipments: number;
  delayedShipments: number;
  avgTurnoverDays: number;
  avgGrossMargin: number;
  lowStockAlerts: number;
  costAlerts: number;
}

// ==================== 库存 ====================
export interface InventoryRecord {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  warehouse: string;
  quantity: number;
  safetyStock: number;
  reorderPoint: number;
  inTransit: number;
  turnoverRate: number;
  turnoverDays: number;
  stockStatus: "healthy" | "warning" | "critical" | "overstock";
  lastSyncAt: string;
  abcClass?: string;
  fsnClass?: string;
  category?: string;
}

// ==================== 成本 ====================
export interface CostRecord {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  rawMaterial: number;
  labor: number;
  logistics: number;
  tariff: number;
  platformFee: number;
  exchangeRate: number;
  destination: string;
  totalLanded: number;
  sellingPrice: number;
  grossMargin: number;
  category?: string;
}

// ==================== 物流 ====================
export interface ShipmentRecord {
  id: string;
  trackingNumber: string;
  sku: string;
  productName: string;
  origin: string;
  destination: string;
  carrier: string;
  status: string;
  eta: string;
  actualDelivery: string | null;
  delayDays: number;
  riskLevel: string;
  events: { eventTime: string; location: string; description: string; status: string }[];
}

// ==================== 销售 ====================
export interface SalesSummary {
  sku: string;
  productName: string;
  category: string;
  totalQuantity: number;
  totalRevenue: number;
  avgDailySales: number;
  momGrowth: number;
  yoyGrowth: number;
  topPlatform: string;
}

// ==================== MCP 连接器 ====================
export interface ConnectorStatus {
  name: string;
  type: string;
  status: 'online' | 'degraded' | 'offline';
  lastSync: string;
  latency: number;
  recordsSynced: number;
}

// ==================== 通知 ====================
export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: string;
  time: string;
  icon: React.ReactNode;
  sku?: string;
}

export interface BackendNotification {
  id: string;
  type: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  severity: string;
  sku?: string;
  isRead: boolean;
  createdAt: string;
  source: string;
}

// ==================== 供应商 ====================
export interface SupplierRecord {
  id: string;
  code: string;
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  region: string;
  category: string;
  leadTime: number;
  rating: number;
  ratingDetails?: Record<string, unknown> | string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 补货订单 ====================
export interface ReorderRecord {
  id: string;
  sku: string;
  productName: string;
  quantity: number;
  warehouse: string;
  priority: string;
  status: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 供应链备注 ====================
export interface SupplyChainNote {
  id: string;
  sku: string;
  author: string;
  content: string;
  category: string;
  priority: string;
  isResolved: boolean;
  createdAt: string;
  updatedAt: string;
}

// ==================== 预警规则 ====================
export interface AlertRule {
  id: string;
  name: string;
  field: string;
  operator: string;
  threshold: number;
  unit: string;
  enabled: boolean;
  severity: string;
}
