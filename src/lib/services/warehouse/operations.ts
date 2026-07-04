/**
 * Warehouse Service - Operations (write/mutate)
 * Extracted from warehouse.service.ts for modularity.
 */

import { db } from '@/lib/db';
import { computeStockStatus } from '../inventory.service';
import { MAX_TAKE, type TransferData, type TransferResult } from './types';

/**
 * Transfer stock between zones/warehouses
 * BUG FIX: When toInventory doesn't exist and it's a partial transfer,
 * the old code created a phantom updatedTo object that wasn't persisted.
 * Fix: Mark the transfer as "in-transit" properly by incrementing inTransit
 * on the source record, and log the pending transfer in the event description.
 */
export async function transferStock(data: TransferData): Promise<TransferResult> {
  const { fromZone, toZone, sku, quantity } = data;

  // Validate required fields
  if (!fromZone || !toZone || !sku || !quantity) {
    throw new Error('缺少必填字段: fromZone, toZone, sku, quantity');
  }

  if (quantity <= 0) {
    throw new Error('调拨数量必须大于0');
  }

  if (fromZone === toZone) {
    throw new Error('源仓库/区域和目标仓库/区域不能相同');
  }

  // Find source inventory
  const fromInventory = await db.inventory.findFirst({
    where: { sku, warehouse: fromZone },
  });

  if (!fromInventory) {
    throw new Error(`未找到源仓库 ${fromZone} 中的 SKU: ${sku}`);
  }

  if (fromInventory.quantity < quantity) {
    throw new Error(`源仓库 ${fromZone} 库存不足，当前 ${fromInventory.quantity} 件，请求调拨 ${quantity} 件`);
  }

  // Find target inventory
  const toInventory = await db.inventory.findFirst({
    where: { sku, warehouse: toZone },
  });

  // Note: Due to the productId @unique constraint, each product can only have ONE inventory record.
  // Scenario 1: Full transfer (all stock) → change warehouse field on existing record
  // Scenario 2: Partial transfer + target exists → adjust both records
  // Scenario 3: Partial transfer + target doesn't exist → mark as in-transit (BUG FIX)

  if (!toInventory && quantity === fromInventory.quantity) {
    // Full transfer: move the entire inventory record to the new warehouse
    const newStatus = computeStockStatus(fromInventory.quantity, fromInventory.safetyStock);

    await db.inventory.update({
      where: { id: fromInventory.id },
      data: {
        warehouse: toZone,
        stockStatus: newStatus,
        lastSyncAt: new Date(),
      },
    });

    await db.supplyChainEvent.create({
      data: {
        type: '库存调拨',
        title: `库存调拨: ${sku}`,
        description: `${sku} (${fromInventory.productName}) 全部库存从 ${fromZone} 调拨到 ${toZone}，共 ${quantity} 件`,
        icon: '🔄',
        color: '#3b82f6',
        severity: 'info',
        sku,
        isRead: false,
      },
    });

    return {
      success: true,
      transfer: {
        sku,
        productName: fromInventory.productName,
        fromZone,
        toZone,
        quantity,
        fromBefore: fromInventory.quantity,
        fromAfter: 0,
        toBefore: 0,
        toAfter: quantity,
        type: 'full',
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Partial transfer or target already has inventory
  // Update source inventory (decrease quantity)
  const newFromQty = fromInventory.quantity - quantity;
  const newFromStatus = computeStockStatus(newFromQty, fromInventory.safetyStock);

  // BUG FIX: When destination doesn't exist, increment inTransit on the source
  // to properly track the pending transfer, instead of creating a phantom object
  const inTransitIncrement = toInventory ? 0 : quantity;

  await db.inventory.update({
    where: { id: fromInventory.id },
    data: {
      quantity: newFromQty,
      inTransit: fromInventory.inTransit + inTransitIncrement,
      stockStatus: newFromStatus,
      lastSyncAt: new Date(),
    },
  });

  let toBefore = 0;
  let toAfter: number;

  if (toInventory) {
    // Target warehouse already has an inventory record for this SKU
    const newToQty = toInventory.quantity + quantity;
    const newToStatus = computeStockStatus(newToQty, toInventory.safetyStock);

    toBefore = toInventory.quantity;
    toAfter = newToQty;

    await db.inventory.update({
      where: { id: toInventory.id },
      data: {
        quantity: newToQty,
        stockStatus: newToStatus,
        lastSyncAt: new Date(),
      },
    });
  } else {
    // BUG FIX: Target doesn't have inventory record - can't create due to unique constraint
    // The stock is properly marked as "in transit" in the source record's inTransit field
    // Log this as a pending transfer that needs manual resolution
    toAfter = quantity; // Expected final amount once in-transit is received
  }

  // Create supply chain event with proper in-transit logging
  const transferDescription = toInventory
    ? `${sku} (${fromInventory.productName}) 从 ${fromZone} 调拨 ${quantity} 件到 ${toZone}`
    : `${sku} (${fromInventory.productName}) 从 ${fromZone} 调拨 ${quantity} 件到 ${toZone}（在途，需手动确认收货）`;

  await db.supplyChainEvent.create({
    data: {
      type: '库存调拨',
      title: `库存调拨: ${sku}`,
      description: transferDescription,
      icon: '🔄',
      color: '#3b82f6',
      severity: toInventory ? 'info' : 'warning',
      sku,
      isRead: false,
    },
  });

  return {
    success: true,
    transfer: {
      sku,
      productName: fromInventory.productName,
      fromZone,
      toZone,
      quantity,
      fromBefore: fromInventory.quantity,
      fromAfter: newFromQty,
      toBefore,
      toAfter,
      type: toInventory ? 'partial' : 'in-transit',
    },
    timestamp: new Date().toISOString(),
  };
}
