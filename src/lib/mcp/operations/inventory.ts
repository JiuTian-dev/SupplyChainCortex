/**
 * MCP Tools: Inventory Operations (adjust_inventory, create_transfer).
 * Extracted from tools-operations.ts.
 */

import type { MCPTool } from '../tools';
import { computeStockStatus } from '@/lib/services/inventory.service';

export const inventoryOperations: MCPTool[] = [
  {
    name: 'adjust_inventory',
    description: '调整库存数量，支持入库(正数)和出库(负数)操作。需要提供SKU、调整数量和调整原因。',
    parameters: {
      type: 'object',
      properties: {
        sku: {
          type: 'string',
          description: '产品SKU，如: KA-RC4001',
        },
        quantity: {
          type: 'number',
          description: '调整数量，正数表示入库，负数表示出库，如: 100 或 -50',
        },
        reason: {
          type: 'string',
          description: '调整原因，如: 采购入库、退货出库、盘点调整',
        },
        warehouse: {
          type: 'string',
          description: '目标仓库名称，如: 深圳仓, 义乌仓',
        },
      },
      required: ['sku', 'quantity', 'reason', 'warehouse'],
    },
    handler: async (params) => {
      const { sku, quantity, reason, warehouse } = params;
      if (!sku) throw new Error('缺少必填参数: sku');
      if (typeof quantity !== 'number') throw new Error('缺少必填参数: quantity');
      if (!reason) throw new Error('缺少必填参数: reason');
      if (!warehouse) throw new Error('缺少必填参数: warehouse');

      // Numeric validation
      if (quantity === 0) {
        return { success: false, error: 'adjustment must be a non-zero number' };
      }
      if (!Number.isInteger(quantity)) {
        return { success: false, error: 'adjustment must be an integer (whole units only)' };
      }

      // Import db directly for the adjustment operation
      const { db } = await import('@/lib/db');
      const { serverCache } = await import('@/lib/cache');

      const where: Record<string, unknown> = { sku, warehouse };

      const inventory = await db.inventory.findFirst({ where });
      if (!inventory) throw new Error(`未找到 SKU: ${sku} 在仓库 ${warehouse} 的库存记录`);

      const newQuantity = inventory.quantity + quantity;
      if (newQuantity < 0) throw new Error(`调整后库存不能为负数。当前库存: ${inventory.quantity}，调整量: ${quantity > 0 ? '+' : ''}${quantity}`);

      const newStatus = computeStockStatus(newQuantity, inventory.safetyStock);

      const updatedInventory = await db.inventory.update({
        where: { id: inventory.id },
        data: {
          quantity: newQuantity,
          stockStatus: newStatus,
          lastSyncAt: new Date(),
        },
      });

      // Create supply chain event
      const adjustmentType = quantity > 0 ? '入库' : '出库';
      const absQuantity = Math.abs(quantity);

      await db.supplyChainEvent.create({
        data: {
          type: '库存调整',
          title: `库存${adjustmentType}: ${inventory.productName}`,
          description: `${adjustmentType} ${absQuantity} 件，原因: ${reason}. 库存从 ${inventory.quantity} 变为 ${newQuantity}`,
          icon: quantity > 0 ? 'inbound' : 'outbound',
          color: quantity > 0 ? 'green' : 'red',
          severity: newStatus === 'critical' ? 'critical' : newStatus === 'warning' ? 'warning' : 'info',
          sku: sku as string,
        },
      });

      serverCache.invalidate('inventory');
      serverCache.invalidate('dashboard');

      return {
        adjustment: {
          sku: inventory.sku,
          productName: inventory.productName,
          warehouse: inventory.warehouse,
          previousQuantity: inventory.quantity,
          adjustment: quantity,
          newQuantity: updatedInventory.quantity,
          previousStatus: inventory.stockStatus,
          newStatus: updatedInventory.stockStatus,
          reason,
        },
      };
    },
  },

  {
    name: 'create_transfer',
    description: '创建库存调拨单 — 在两个仓库之间转移库存（扣减来源仓，增加目标仓）。需要验证来源仓库存充足，同时更新两地库存状态。调拨记录记入审计日志。',
    parameters: {
      type: 'object',
      properties: {
        sku: {
          type: 'string',
          description: '产品SKU，如: KA-RC4001',
        },
        sourceWarehouse: {
          type: 'string',
          description: '来源仓库，如: 深圳仓',
        },
        targetWarehouse: {
          type: 'string',
          description: '目标仓库，如: 义乌仓',
        },
        quantity: {
          type: 'number',
          description: '调拨数量，必须为正整数',
        },
        reason: {
          type: 'string',
          description: '调拨原因（可选），如: 区域调拨、紧急补货',
        },
      },
      required: ['sku', 'sourceWarehouse', 'targetWarehouse', 'quantity'],
    },
    handler: async (params) => {
      const { sku, sourceWarehouse, targetWarehouse, quantity, reason } = params;

      if (!sku) throw new Error('缺少必填参数: sku');
      if (!sourceWarehouse) throw new Error('缺少必填参数: sourceWarehouse');
      if (!targetWarehouse) throw new Error('缺少必填参数: targetWarehouse');
      if (typeof quantity !== 'number' || quantity <= 0) throw new Error('quantity 必须为正整数');
      if (sourceWarehouse === targetWarehouse) throw new Error('来源仓库和目标仓库不能相同');

      const { db } = await import('@/lib/db');
      const { serverCache } = await import('@/lib/cache');

      const qty = quantity as number;

      // 1. Validate source has enough stock
      const sourceInventory = await db.inventory.findFirst({
        where: { sku: sku as string, warehouse: sourceWarehouse as string },
      });
      if (!sourceInventory) {
        throw new Error(`未找到 SKU: ${sku} 在仓库 ${sourceWarehouse} 的库存记录`);
      }
      if (sourceInventory.quantity < qty) {
        throw new Error(
          `库存不足。SKU ${sku} 在 ${sourceWarehouse} 当前库存: ${sourceInventory.quantity}，调拨量: ${qty}`
        );
      }

      // 2. Find (or prepare to create) target inventory
      const targetInventory = await db.inventory.findFirst({
        where: { sku: sku as string, warehouse: targetWarehouse as string },
      });

      const transferReason = (reason as string) || '仓库调拨';

      // 3. Decrement source
      const sourceNewQty = sourceInventory.quantity - qty;
      const sourceNewStatus = computeStockStatus(sourceNewQty, sourceInventory.safetyStock);

      await db.inventory.update({
        where: { id: sourceInventory.id },
        data: {
          quantity: sourceNewQty,
          stockStatus: sourceNewStatus,
          lastSyncAt: new Date(),
        },
      });

      // 4. Increment target (create if not exists)
      let targetNewQty: number;
      if (targetInventory) {
        targetNewQty = targetInventory.quantity + qty;
        const targetNewStatus = computeStockStatus(targetNewQty, targetInventory.safetyStock);
        await db.inventory.update({
          where: { id: targetInventory.id },
          data: {
            quantity: targetNewQty,
            stockStatus: targetNewStatus,
            lastSyncAt: new Date(),
          },
        });
      } else {
        targetNewQty = qty;
        await db.inventory.create({
          data: {
            productId: sourceInventory.productId,
            sku: sku as string,
            productName: sourceInventory.productName,
            warehouse: targetWarehouse as string,
            quantity: qty,
            safetyStock: 0,
            reorderPoint: 0,
            stockStatus: 'healthy',
            lastSyncAt: new Date(),
          },
        });
      }

      // 5. Create supply chain event
      await db.supplyChainEvent.create({
        data: {
          type: '库存调整',
          title: `库存调拨: ${sourceInventory.productName}`,
          description: `从 ${sourceWarehouse} 调拨 ${qty} 件至 ${targetWarehouse}，原因: ${transferReason}. 来源仓从 ${sourceInventory.quantity} 变为 ${sourceNewQty}，目标仓从 ${targetInventory?.quantity ?? 0} 变为 ${targetNewQty}`,
          icon: 'transfer',
          color: 'purple',
          severity: 'info',
          sku: sku as string,
        },
      });

      // 6. Create audit log
      await db.auditLog.create({
        data: {
          action: 'TRANSFER',
          entity: 'inventory',
          entityId: sourceInventory.id,
          sku: sku as string,
          details: {
            fromWarehouse: sourceWarehouse,
            toWarehouse: targetWarehouse,
            quantity: qty,
            reason: transferReason,
            sourcePreviousQty: sourceInventory.quantity,
            sourceNewQty,
            targetPreviousQty: targetInventory?.quantity ?? 0,
            targetNewQty,
          },
        },
      });

      serverCache.invalidate('inventory');
      serverCache.invalidate('dashboard');

      return {
        success: true,
        transfer: {
          sku,
          productName: sourceInventory.productName,
          from: {
            warehouse: sourceWarehouse,
            previousQuantity: sourceInventory.quantity,
            newQuantity: sourceNewQty,
            stockStatus: sourceNewStatus,
          },
          to: {
            warehouse: targetWarehouse,
            previousQuantity: targetInventory?.quantity ?? 0,
            newQuantity: targetNewQty,
            stockStatus: targetInventory
              ? computeStockStatus(targetNewQty, targetInventory.safetyStock)
              : 'healthy',
          },
          quantity: qty,
          reason: transferReason,
        },
      };
    },
  },
];
