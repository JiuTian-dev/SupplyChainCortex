/**
 * Procurement Service - Procurement planning business logic
 * Extracted from /api/procurement route for reusability and testability
 * Replaces Math.random() with deterministic calculations
 */

import { db } from '@/lib/db';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProcurementItem {
  sku: string;
  productName: string;
  currentStock: number;
  safetyStock: number;
  suggestedQty: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedCost: number;
  unitCost: number;
  warehouse: string;
  category: string;
}

export interface ProcurementPlan {
  items: ProcurementItem[];
  summary: {
    totalItems: number;
    urgentItems: number;
    totalBudget: number;
    avgLeadTime: number;
    pendingOrders: number;
  };
}

export interface BudgetAnalysis {
  totalBudget: number;
  bulkDiscount: number;
  netBudget: number;
  byCategory: Array<{ category: string; amount: number; items: number }>;
  byPriority: Array<{ priority: string; amount: number; items: number }>;
}

export interface TimelineItem {
  sku: string;
  productName: string;
  orderDate: string;
  expectedDelivery: string;
  leadTime: number;
  quantity: number;
  estimatedCost: number;
  status: string;
  priority: string;
}

export interface TimelineResult {
  timeline: TimelineItem[];
  summary: {
    totalOrders: number;
    earliestDelivery: string | null;
    latestDelivery: string | null;
  };
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MAX_TAKE = 5000;

// ─── Deterministic Lead Time ───────────────────────────────────────────────────

/** 
 * Deterministic lead time calculation (replaces Math.random())
 * Uses a simple hash based on SKU to generate consistent pseudo-random values
 */
function deterministicLeadTime(sku: string): number {
  let hash = 0;
  for (let i = 0; i < sku.length; i++) {
    const char = sku.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  // Map to 0-6 range (14-20 days), deterministic per SKU
  return 14 + Math.abs(hash) % 7;
}

// ─── Core Business Logic ───────────────────────────────────────────────────────

/** Get procurement plan */
export async function getProcurementPlan(): Promise<ProcurementPlan> {
  const [inventory, costRecords, products, reorderOrders] = await Promise.all([
    db.inventory.findMany({ take: MAX_TAKE }),
    db.costRecord.findMany({ take: MAX_TAKE }),
    db.product.findMany({ take: MAX_TAKE }),
    db.reorderOrder.findMany({ where: { status: { in: ['pending', 'approved'] } }, take: MAX_TAKE }),
  ]);

  const procurementItems: ProcurementItem[] = inventory.map(inv => {
    const cost = costRecords.find(c => c.sku === inv.sku);
    const product = products.find(p => p.sku === inv.sku);
    const unitCost = cost?.totalLanded || product?.unitCost || 0;
    const gap = inv.safetyStock * 2 - inv.quantity;
    const suggestedQty = Math.max(0, gap);
    const estimatedCost = Math.round(suggestedQty * unitCost);

    let priority: ProcurementItem['priority'] = 'low';
    if (inv.stockStatus === 'critical') priority = 'critical';
    else if (inv.stockStatus === 'warning') priority = 'high';
    else if (suggestedQty > 0) priority = 'medium';

    return {
      sku: inv.sku,
      productName: inv.productName,
      currentStock: inv.quantity,
      safetyStock: inv.safetyStock,
      suggestedQty,
      priority,
      estimatedCost,
      unitCost: Math.round(unitCost * 100) / 100,
      warehouse: inv.warehouse,
      category: product?.category || '未分类',
    };
  }).filter(item => item.suggestedQty > 0 || item.priority === 'critical')
    .sort((a, b) => {
      const prio = { critical: 0, high: 1, medium: 2, low: 3 };
      return (prio[a.priority] - prio[b.priority]) || (b.estimatedCost - a.estimatedCost);
    });

  const totalBudget = procurementItems.reduce((sum, item) => sum + item.estimatedCost, 0);
  const urgentCount = procurementItems.filter(i => i.priority === 'critical' || i.priority === 'high').length;

  return {
    items: procurementItems,
    summary: {
      totalItems: procurementItems.length,
      urgentItems: urgentCount,
      totalBudget,
      avgLeadTime: 14,
      pendingOrders: reorderOrders.length,
    },
  };
}

/** Get budget analysis */
export async function getBudgetAnalysis(): Promise<BudgetAnalysis> {
  const [inventory, costRecords, products] = await Promise.all([
    db.inventory.findMany({ take: MAX_TAKE }),
    db.costRecord.findMany({ take: MAX_TAKE }),
    db.product.findMany({ take: MAX_TAKE }),
  ]);

  const categoryBudget: Record<string, { category: string; amount: number; items: number }> = {};
  const priorityBudget: Record<string, { priority: string; amount: number; items: number }> = {
    critical: { priority: '紧急', amount: 0, items: 0 },
    high: { priority: '高', amount: 0, items: 0 },
    medium: { priority: '中', amount: 0, items: 0 },
    low: { priority: '低', amount: 0, items: 0 },
  };

  let totalBudget = 0;
  let bulkDiscount = 0;

  inventory.forEach(inv => {
    const cost = costRecords.find(c => c.sku === inv.sku);
    const product = products.find(p => p.sku === inv.sku);
    const unitCost = cost?.totalLanded || product?.unitCost || 0;
    const gap = inv.safetyStock * 2 - inv.quantity;
    const suggestedQty = Math.max(0, gap);
    if (suggestedQty === 0) return;

    const estimatedCost = Math.round(suggestedQty * unitCost);
    totalBudget += estimatedCost;

    let priority: string = 'low';
    if (inv.stockStatus === 'critical') priority = 'critical';
    else if (inv.stockStatus === 'warning') priority = 'high';
    else priority = 'medium';

    const category = product?.category || '未分类';
    if (!categoryBudget[category]) {
      categoryBudget[category] = { category, amount: 0, items: 0 };
    }
    categoryBudget[category].amount += estimatedCost;
    categoryBudget[category].items += 1;

    if (priorityBudget[priority]) {
      priorityBudget[priority].amount += estimatedCost;
      priorityBudget[priority].items += 1;
    }

    // Bulk discount: 5% for orders > 500 units, 10% for > 1000
    if (suggestedQty > 1000) bulkDiscount += estimatedCost * 0.1;
    else if (suggestedQty > 500) bulkDiscount += estimatedCost * 0.05;
  });

  return {
    totalBudget,
    bulkDiscount: Math.round(bulkDiscount),
    netBudget: Math.round(totalBudget - bulkDiscount),
    byCategory: Object.values(categoryBudget).sort((a, b) => b.amount - a.amount),
    byPriority: Object.values(priorityBudget).filter(p => p.amount > 0),
  };
}

/** Get procurement timeline with deterministic lead times (no Math.random) */
export async function getTimeline(): Promise<TimelineResult> {
  const [inventory, costRecords, products] = await Promise.all([
    db.inventory.findMany({ take: MAX_TAKE }),
    db.costRecord.findMany({ take: MAX_TAKE }),
    db.product.findMany({ take: MAX_TAKE }),
  ]);

  const today = new Date();
  const timeline: TimelineItem[] = inventory
    .filter(inv => inv.stockStatus === 'critical' || inv.stockStatus === 'warning')
    .map((inv, idx) => {
      const cost = costRecords.find(c => c.sku === inv.sku);
      const product = products.find(p => p.sku === inv.sku);
      // FIX: Use deterministic lead time based on SKU instead of Math.random()
      const leadTime = deterministicLeadTime(inv.sku);
      const orderDate = new Date(today);
      orderDate.setDate(orderDate.getDate() + idx * 2);
      const expectedDelivery = new Date(orderDate);
      expectedDelivery.setDate(expectedDelivery.getDate() + leadTime);

      const gap = inv.safetyStock * 2 - inv.quantity;
      const suggestedQty = Math.max(0, gap);
      const unitCost = cost?.totalLanded || product?.unitCost || 0;

      return {
        sku: inv.sku,
        productName: inv.productName,
        orderDate: orderDate.toISOString().split('T')[0],
        expectedDelivery: expectedDelivery.toISOString().split('T')[0],
        leadTime,
        quantity: suggestedQty,
        estimatedCost: Math.round(suggestedQty * unitCost),
        status: idx === 0 ? 'ordering' : 'planned',
        priority: inv.stockStatus === 'critical' ? '紧急' : '高',
      };
    });

  return {
    timeline,
    summary: {
      totalOrders: timeline.length,
      earliestDelivery: timeline.length > 0 ? timeline.reduce((min, t) => t.expectedDelivery < min ? t.expectedDelivery : min, timeline[0].expectedDelivery) : null,
      latestDelivery: timeline.length > 0 ? timeline.reduce((max, t) => t.expectedDelivery > max ? t.expectedDelivery : max, timeline[0].expectedDelivery) : null,
    },
  };
}

/** Get procurement comparison data */
export async function getProcurementComparison() {
  const [inventory, costRecords] = await Promise.all([
    db.inventory.findMany({ take: MAX_TAKE }),
    db.costRecord.findMany({ take: MAX_TAKE }),
  ]);

  const criticalItems = inventory.filter(i => i.stockStatus === 'critical' || i.stockStatus === 'warning');

  const comparison = criticalItems.map(inv => {
    const cost = costRecords.find(c => c.sku === inv.sku);
    const unitCost = cost?.totalLanded || 50;
    const gap = inv.safetyStock * 2 - inv.quantity;
    const qty = Math.max(0, gap);

    return {
      sku: inv.sku,
      productName: inv.productName,
      quantity: qty,
      options: [
        { supplier: '默认供应商', unitCost: Math.round(unitCost * 100) / 100, leadTime: 14, totalCost: Math.round(qty * unitCost), reliability: 0.92 },
        { supplier: '备选供应商 A', unitCost: Math.round(unitCost * 1.05 * 100) / 100, leadTime: 10, totalCost: Math.round(qty * unitCost * 1.05), reliability: 0.88 },
        { supplier: '备选供应商 B', unitCost: Math.round(unitCost * 0.95 * 100) / 100, leadTime: 21, totalCost: Math.round(qty * unitCost * 0.95), reliability: 0.85 },
      ],
    };
  });

  return { comparison };
}

/** Get procurement history */
export async function getProcurementHistory() {
  const reorderOrders = await db.reorderOrder.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const history = reorderOrders.map(order => ({
    id: order.id,
    sku: order.sku,
    productName: order.productName,
    quantity: order.quantity,
    warehouse: order.warehouse,
    priority: order.priority,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }));

  return {
    history,
    summary: {
      total: history.length,
      pending: history.filter(h => h.status === 'pending').length,
      approved: history.filter(h => h.status === 'approved').length,
      shipped: history.filter(h => h.status === 'shipped').length,
      delivered: history.filter(h => h.status === 'delivered').length,
    },
  };
}
