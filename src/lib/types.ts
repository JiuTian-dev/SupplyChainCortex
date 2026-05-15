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
