/**
 * Reorder Queries — CRUD + events for /api/reorder.
 * Migrated from services/reorder.service.ts.
 */

import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface ReorderFilters {
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateReorderData {
  sku: string;
  productName: string;
  quantity: number;
  warehouse: string;
  priority?: string;
  notes?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────────

const MAX_TAKE = 500;
const VALID_STATUSES = ['approved', 'shipped', 'delivered', 'cancelled'] as const;

const STATUS_LABELS: Record<string, string> = {
  approved: '已审批',
  shipped: '已发货',
  delivered: '已到货',
  cancelled: '已取消',
};

const STATUS_SEVERITY: Record<string, string> = {
  approved: 'info',
  shipped: 'info',
  delivered: 'info',
  cancelled: 'warning',
};

const STATUS_ICONS: Record<string, string> = {
  delivered: '✅',
  cancelled: '❌',
};

// ─── Core ────────────────────────────────────────────────────────────────────────

export async function getReorderOrders(filters: ReorderFilters = {}) {
  const { status } = filters;
  const where = status ? { status } : {};

  const orders = await db.reorderOrder.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: MAX_TAKE,
  });

  return { orders };
}

export async function createReorderOrder(data: CreateReorderData) {
  const { sku, productName, quantity, warehouse, priority, notes } = data;

  if (!sku || !productName || !quantity || !warehouse) {
    throw new Error('缺少必填字段: sku, productName, quantity, warehouse');
  }

  if (typeof quantity !== 'number' || quantity <= 0) {
    throw new Error('quantity 必须为正整数');
  }

  const order = await db.reorderOrder.create({
    data: {
      sku,
      productName,
      quantity,
      warehouse,
      priority: priority || '常规',
      status: 'pending',
      notes: notes || null,
    },
  });

  await db.supplyChainEvent.create({
    data: {
      type: '补货订单',
      title: `新补货订单: ${productName}`,
      description: `SKU ${sku} 创建补货订单，数量 ${quantity}，仓库 ${warehouse}，优先级 ${priority || '常规'}`,
      icon: '📦',
      color: '#f97316',
      severity: priority === '紧急' ? 'warning' : 'info',
      sku,
      isRead: false,
    },
  });

  return order;
}

export async function updateReorderOrder(id: string, data: { status: string }) {
  const { status } = data;

  if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
    throw new Error(`无效的 status 值，允许: ${VALID_STATUSES.join(', ')}`);
  }

  const existingOrder = await db.reorderOrder.findUnique({ where: { id } });
  if (!existingOrder) {
    throw new Error('未找到该补货订单');
  }

  const order = await db.reorderOrder.update({ where: { id }, data: { status } });

  const label = STATUS_LABELS[status] || status;
  await db.supplyChainEvent.create({
    data: {
      type: '补货订单',
      title: `补货订单${label}: ${existingOrder.productName}`,
      description: `SKU ${existingOrder.sku} 补货订单状态更新为 ${label}，数量 ${existingOrder.quantity}`,
      icon: STATUS_ICONS[status] || '📦',
      color: status === 'delivered' ? '#22c55e' : status === 'cancelled' ? '#ef4444' : '#f97316',
      severity: STATUS_SEVERITY[status] || 'info',
      sku: existingOrder.sku,
      isRead: false,
    },
  });

  return order;
}
