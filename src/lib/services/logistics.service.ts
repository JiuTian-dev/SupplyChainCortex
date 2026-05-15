/**
 * Logistics Service - Business logic for logistics/shipment operations
 * Extracted from API routes for reusability and testability
 */

import { db } from '@/lib/db';

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Valid shipment statuses */
export const SHIPMENT_STATUSES = ['pending', 'in_transit', 'customs', 'delivered', 'delayed', 'exception'] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/** Valid status transitions mapping */
export const STATUS_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  pending: ['in_transit', 'delayed'],
  in_transit: ['customs', 'delivered', 'delayed'],
  customs: ['delivered', 'delayed'],
  delivered: [],
  delayed: ['in_transit', 'customs', 'delivered'],
  exception: [],
};

/** Status display labels */
export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending: '待发货',
  in_transit: '运输中',
  customs: '清关中',
  delivered: '已送达',
  delayed: '延误',
  exception: '异常',
};

/** Route estimate data */
export interface RouteEstimate {
  avgDays: number;
  minDays: number;
  maxDays: number;
}

/** Logistics risk item */
export interface LogisticsRisk {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedRoutes: string[];
}

/** Shipment list filters */
export interface ShipmentListFilters {
  status?: string;
  carrier?: string;
  skus?: string[];
}

/** Status update parameters */
export interface ShipmentStatusUpdate {
  status?: ShipmentStatus;
  eta?: string;
  progress?: number;
  notes?: string;
}

/** Formatted shipment with parsed events */
export interface FormattedShipment {
  id: string;
  trackingNumber: string;
  productId: string;
  sku: string;
  productName: string;
  origin: string;
  destination: string;
  carrier: string;
  status: string;
  eta: string | null;
  actualDelivery: string | null;
  delayDays: number;
  riskLevel: string;
  events: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

/** Shipment tracking detail */
export interface ShipmentTrackingDetail {
  trackingNumber: string;
  productName: string;
  sku: string;
  carrier: string;
  route: string;
  status: string;
  eta: string | null;
  actualDelivery: string | null;
  delayDays: number;
  riskLevel: string;
  events: unknown[];
}

/** Shipment estimate result */
export interface ShipmentEstimate {
  sku: string;
  productName: string;
  route: string;
  estimate: RouteEstimate;
  weight: number;
  estimatedShippingCost: number;
}

/** Logistics summary statistics */
export interface LogisticsStats {
  totalShipments: number;
  byStatus: Record<string, number>;
  onTimeDeliveryRate: number;
  avgDelayDays: number;
  criticalRiskCount: number;
  highRiskCount: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Route estimate lookup table */
export const ROUTE_ESTIMATES: Record<string, RouteEstimate> = {
  'CN-US': { avgDays: 12, minDays: 8, maxDays: 18 },
  'CN-EU': { avgDays: 15, minDays: 10, maxDays: 22 },
  'CN-JP': { avgDays: 5, minDays: 3, maxDays: 8 },
  'CN-CA': { avgDays: 13, minDays: 9, maxDays: 19 },
  'CN-AU': { avgDays: 11, minDays: 7, maxDays: 16 },
};

/** Hardcoded logistics risks */
export const LOGISTICS_RISKS: LogisticsRisk[] = [
  { type: '港口拥堵', description: '洛杉矶港口近期拥堵严重，平均等待时间延长至5天', severity: 'high', affectedRoutes: ['CN-US'] },
  { type: '天气影响', description: '太平洋风暴季，跨太平洋航线可能延误2-3天', severity: 'medium', affectedRoutes: ['CN-US', 'CN-CA'] },
  { type: '海关政策', description: '欧盟新规生效，电子产品清关时间增加1-2天', severity: 'medium', affectedRoutes: ['CN-EU'] },
  { type: '航线调整', description: '中东局势紧张，部分航线绕行好望角，运输时间增加7-10天', severity: 'critical', affectedRoutes: ['CN-EU', 'CN-ME'] },
  { type: '空运运力', description: '春节前空运运力紧张，价格预计上涨30%', severity: 'low', affectedRoutes: ['CN-US', 'CN-EU', 'CN-JP'] },
];

// ─── Core Business Logic ───────────────────────────────────────────────────────

/** Validate a shipment status value */
export function isValidShipmentStatus(status: string): status is ShipmentStatus {
  return SHIPMENT_STATUSES.includes(status as ShipmentStatus);
}

/** Check if a status transition is valid */
export function isValidStatusTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

/** Parse shipment events (handles both Json object and string types) */
export function parseShipmentEvents(eventsJson: unknown): unknown[] {
  if (Array.isArray(eventsJson)) return eventsJson;
  if (typeof eventsJson === 'string') {
    try {
      return JSON.parse(eventsJson);
    } catch {
      return [];
    }
  }
  return [];
}

/** Get filtered/paginated shipments */
export async function getShipmentList(filters: ShipmentListFilters = {}): Promise<{
  shipments: FormattedShipment[];
  filters: { status: string | null; carrier: string | null };
}> {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.carrier) where.carrier = filters.carrier;
  if (filters.skus && filters.skus.length > 0) where.sku = { in: filters.skus };

  const shipments = await db.shipmentItem.findMany({ where });

  const formattedShipments: FormattedShipment[] = shipments.map(s => ({
    ...s,
    events: parseShipmentEvents(s.events as unknown),
  }));

  return {
    shipments: formattedShipments,
    filters: { status: filters.status || null, carrier: filters.carrier || null },
  };
}

/** Get a single shipment by tracking number */
export async function getShipmentByTracking(trackingNumber: string): Promise<ShipmentTrackingDetail | null> {
  const shipment = await db.shipmentItem.findUnique({
    where: { trackingNumber },
  });

  if (!shipment) return null;

  return {
    trackingNumber: shipment.trackingNumber,
    productName: shipment.productName,
    sku: shipment.sku,
    carrier: shipment.carrier,
    route: `${shipment.origin} → ${shipment.destination}`,
    status: shipment.status,
    eta: shipment.eta,
    actualDelivery: shipment.actualDelivery,
    delayDays: shipment.delayDays,
    riskLevel: shipment.riskLevel,
    events: parseShipmentEvents(shipment.events as unknown),
  };
}

/** Get logistics summary statistics */
export async function getShipmentStats(): Promise<LogisticsStats> {
  const shipments = await db.shipmentItem.findMany();

  const byStatus: Record<string, number> = {};
  for (const status of SHIPMENT_STATUSES) {
    byStatus[status] = 0;
  }
  shipments.forEach(s => {
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  });

  const deliveredOnTime = shipments.filter(s => s.status === 'delivered' && s.delayDays === 0).length;
  const totalDelivered = shipments.filter(s => s.status === 'delivered').length;
  const onTimeDeliveryRate = totalDelivered > 0
    ? Math.round((deliveredOnTime / totalDelivered) * 100)
    : 0;

  const delayedShipments = shipments.filter(s => s.delayDays > 0);
  const avgDelayDays = delayedShipments.length > 0
    ? Math.round(delayedShipments.reduce((sum, s) => sum + s.delayDays, 0) / delayedShipments.length * 10) / 10
    : 0;

  return {
    totalShipments: shipments.length,
    byStatus,
    onTimeDeliveryRate,
    avgDelayDays,
    criticalRiskCount: shipments.filter(s => s.riskLevel === 'critical').length,
    highRiskCount: shipments.filter(s => s.riskLevel === 'high').length,
  };
}

/** Update shipment status with validation and event creation */
export async function updateShipmentStatus(
  trackingNumber: string,
  statusUpdate: ShipmentStatusUpdate
): Promise<{
  success: boolean;
  shipment: { trackingNumber: string; status: string; eta: string | null; actualDelivery: string | null };
}> {
  const shipment = await db.shipmentItem.findUnique({
    where: { trackingNumber },
  });

  if (!shipment) {
    throw new Error(`未找到追踪号: ${trackingNumber}`);
  }

  // Validate status if provided
  if (statusUpdate.status && !isValidShipmentStatus(statusUpdate.status)) {
    throw new Error(`无效的状态: ${statusUpdate.status}`);
  }

  // Build update data
  const updateData: Record<string, unknown> = {};
  if (statusUpdate.status) updateData.status = statusUpdate.status;
  if (statusUpdate.eta) updateData.eta = statusUpdate.eta;

  if (typeof statusUpdate.progress === 'number') {
    if (statusUpdate.progress >= 100 && statusUpdate.status === 'delivered') {
      updateData.actualDelivery = new Date().toISOString().split('T')[0];
      updateData.delayDays = shipment.eta
        ? Math.max(0, Math.ceil((Date.now() - new Date(shipment.eta).getTime()) / 86400000))
        : 0;
    }
  }

  // Update the shipment
  const updatedShipment = await db.shipmentItem.update({
    where: { trackingNumber },
    data: updateData,
  });

  // Create a supply chain event for the status update
  if (statusUpdate.status) {
    const statusLabel = STATUS_LABELS[statusUpdate.status] || statusUpdate.status;

    await db.supplyChainEvent.create({
      data: {
        type: '货运更新',
        title: '货运状态更新',
        description: `${trackingNumber} (${shipment.productName}) 状态更新为${statusLabel}${statusUpdate.notes ? `：${statusUpdate.notes}` : ''}`,
        icon: '🚢',
        color: '#3b82f6',
        severity: statusUpdate.status === 'delayed' || statusUpdate.status === 'exception' ? 'warning' : 'info',
        sku: shipment.sku,
      },
    });

    // Add the update event to the shipment's events JSON array
    const existingEvents = parseShipmentEvents(updatedShipment.events as unknown) as Array<{
      eventTime: string;
      location: string;
      description: string;
      status: string;
    }>;

    const newEvent = {
      eventTime: new Date().toISOString(),
      location: shipment.destination || '未知',
      description: `状态更新: ${statusLabel}${statusUpdate.notes ? ` - ${statusUpdate.notes}` : ''}`,
      status: statusUpdate.status || shipment.status,
    };

    await db.shipmentItem.update({
      where: { trackingNumber },
      data: { events: [newEvent, ...existingEvents] },
    });
  }

  return {
    success: true,
    shipment: {
      trackingNumber: updatedShipment.trackingNumber,
      status: updatedShipment.status,
      eta: updatedShipment.eta,
      actualDelivery: updatedShipment.actualDelivery,
    },
  };
}

/** Get shipment estimate for a product and route */
export async function getShipmentEstimate(sku: string, route: string): Promise<ShipmentEstimate> {
  const product = await db.product.findUnique({ where: { sku } });
  if (!product) {
    throw new Error(`未找到 SKU: ${sku}`);
  }

  const estimate = ROUTE_ESTIMATES[route] || { avgDays: 14, minDays: 8, maxDays: 20 };

  return {
    sku: product.sku,
    productName: product.name,
    route,
    estimate,
    weight: product.weight,
    estimatedShippingCost: Math.round(product.weight * 3.5 * 100) / 100,
  };
}

/** Get logistics risk data, enriched with real-time Open-Meteo weather data */
export async function getLogisticsRisks(): Promise<{
  totalRisks: number;
  criticalCount: number;
  highCount: number;
  risks: LogisticsRisk[];
  weatherAlerts?: Array<{ port: string; type: string; severity: string; description: string }>;
}> {
  // Try to fetch real-time weather data
  let weatherAlerts: Array<{ port: string; type: string; severity: string; description: string }> | undefined;
  try {
    const { getPortWeatherSummary } = await import('@/lib/services/weather.service');
    const weather = await getPortWeatherSummary();
    if (weather.activeAlerts.length > 0) {
      weatherAlerts = weather.activeAlerts.map(a => ({
        port: a.port,
        type: a.type,
        severity: a.severity,
        description: a.description,
      }));
    }
  } catch { /* fall back to static risks if weather API fails */ }

  return {
    totalRisks: LOGISTICS_RISKS.length + (weatherAlerts?.length ?? 0),
    criticalCount: LOGISTICS_RISKS.filter(r => r.severity === 'critical').length
      + (weatherAlerts?.filter(a => a.severity === 'critical').length ?? 0),
    highCount: LOGISTICS_RISKS.filter(r => r.severity === 'high').length
      + (weatherAlerts?.filter(a => a.severity === 'high').length ?? 0),
    risks: LOGISTICS_RISKS,
    ...(weatherAlerts?.length ? { weatherAlerts } : {}),
  };
}
