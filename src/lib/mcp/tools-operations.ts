/**
 * MCP Tools: Operations (reorder, shipment status, inventory adjust, cost update, notes, alerts).
 * Extracted from tools.ts.
 */

import type { MCPTool } from './tools';
import { summarize } from './helpers';

import {
  getInventoryOverview, getInventoryList, computeStockStatus, getReorderRecommendations,
} from '@/lib/services/inventory.service';

import { getCostOverview, getLandedCostDetail } from '@/lib/services/cost.service';

import { updateShipmentStatus, type ShipmentStatusUpdate } from '@/lib/services/logistics.service';

import { createReorderOrder, type CreateReorderData } from '@/lib/queries/reorder.queries';

import { createNote, type CreateNoteData } from '@/lib/services/notes.service';

import { updateAlertRule } from '@/lib/queries/alert-rules.queries';

import { getDashboardMetrics } from '@/lib/queries/dashboard.queries';

// ─── Tool Definitions ───────────────────────────────────────────────────────────

export const operationsTools: MCPTool[] = [
  {
    name: 'create_reorder',
    description: '创建补货订单。需要提供SKU、产品名称、数量和仓库。可选优先级(常规/紧急)和备注。',
    parameters: {
      type: 'object',
      properties: {
        sku: {
          type: 'string',
          description: '产品SKU，如: KA-RC4001',
        },
        productName: {
          type: 'string',
          description: '产品名称，如: 智能电饭煲',
        },
        quantity: {
          type: 'number',
          description: '补货数量',
        },
        warehouse: {
          type: 'string',
          description: '目标仓库，如: 深圳仓, 义乌仓',
        },
        priority: {
          type: 'string',
          description: '优先级: 常规 或 紧急',
          enum: ['常规', '紧急'],
        },
        notes: {
          type: 'string',
          description: '备注说明',
        },
      },
      required: ['sku', 'productName', 'quantity', 'warehouse'],
    },
    handler: async (params) => {
      const data: CreateReorderData = {
        sku: params.sku as string,
        productName: params.productName as string,
        quantity: params.quantity as number,
        warehouse: params.warehouse as string,
        priority: params.priority as string | undefined,
        notes: params.notes as string | undefined,
      };
      return await createReorderOrder(data);
    },
  },

  // ─── 9. update_shipment_status ────────────────────────────────────────────
  {
    name: 'update_shipment_status',
    description: '更新货运状态。需要提供追踪号和新状态。可选更新预计到达时间、进度百分比和备注。',
    parameters: {
      type: 'object',
      properties: {
        trackingNumber: {
          type: 'string',
          description: '货运追踪号',
        },
        status: {
          type: 'string',
          description: '新状态: pending, in_transit, customs, delivered, delayed, exception',
          enum: ['pending', 'in_transit', 'customs', 'delivered', 'delayed', 'exception'],
        },
        eta: {
          type: 'string',
          description: '预计到达日期 YYYY-MM-DD',
        },
        progress: {
          type: 'number',
          description: '进度百分比 0-100',
        },
        notes: {
          type: 'string',
          description: '状态更新备注',
        },
      },
      required: ['trackingNumber'],
    },
    handler: async (params) => {
      const update: ShipmentStatusUpdate = {};
      if (params.status) update.status = params.status as ShipmentStatusUpdate['status'];
      if (params.eta) update.eta = params.eta as string;
      if (typeof params.progress === 'number') update.progress = params.progress as number;
      if (params.notes) update.notes = params.notes as string;
      return await updateShipmentStatus(params.trackingNumber as string, update);
    },
  },

  // ─── 10. adjust_inventory ──────────────────────────────────────────────
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
          description: '仓库筛选(可选)，如: 深圳仓, 义乌仓',
        },
      },
      required: ['sku', 'quantity', 'reason'],
    },
    handler: async (params) => {
      const { sku, quantity, reason, warehouse } = params;
      if (!sku) throw new Error('缺少必填参数: sku');
      if (typeof quantity !== 'number') throw new Error('缺少必填参数: quantity');
      if (!reason) throw new Error('缺少必填参数: reason');

      // Import db directly for the adjustment operation
      const { db } = await import('@/lib/db');
      const { serverCache } = await import('@/lib/cache');

      const where: Record<string, unknown> = { sku };
      if (warehouse) where.warehouse = warehouse;

      const inventory = await db.inventory.findFirst({ where });
      if (!inventory) throw new Error(`未找到 SKU: ${sku}${warehouse ? ` 在仓库 ${warehouse}` : ''} 的库存记录`);

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
          icon: quantity > 0 ? '📥' : '📤',
          color: quantity > 0 ? '#22c55e' : '#f59e0b',
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

  // ─── 11. update_cost_record ─────────────────────────────────────────────
  {
    name: 'update_cost_record',
    description: '更新成本记录。可以更新原材料、人工、物流、关税、平台费等成本构成，以及售价和汇率。系统会自动重算到岸成本和毛利率。',
    parameters: {
      type: 'object',
      properties: {
        sku: {
          type: 'string',
          description: '产品SKU，如: KA-RC4001',
        },
        rawMaterial: {
          type: 'number',
          description: '新的原材料成本(CNY)',
        },
        labor: {
          type: 'number',
          description: '新的人工成本(CNY)',
        },
        logistics: {
          type: 'number',
          description: '新的物流成本(USD)',
        },
        tariff: {
          type: 'number',
          description: '新的关税(USD)',
        },
        platformFee: {
          type: 'number',
          description: '新的平台费(USD)',
        },
        sellingPrice: {
          type: 'number',
          description: '新的售价(USD)',
        },
        exchangeRate: {
          type: 'number',
          description: '新的汇率(CNY/USD)',
        },
      },
      required: ['sku'],
    },
    handler: async (params) => {
      const { sku, rawMaterial, labor, logistics, tariff, platformFee, sellingPrice, exchangeRate } = params;
      if (!sku) throw new Error('缺少必填参数: sku');

      const { db } = await import('@/lib/db');
      const { serverCache } = await import('@/lib/cache');

      const costRecord = await db.costRecord.findFirst({ where: { sku } });
      if (!costRecord) throw new Error(`未找到 SKU: ${sku} 的成本记录`);

      // Build update data
      const updateData: Record<string, unknown> = {};
      if (typeof rawMaterial === 'number') updateData.rawMaterial = rawMaterial;
      if (typeof labor === 'number') updateData.labor = labor;
      if (typeof logistics === 'number') updateData.logistics = logistics;
      if (typeof tariff === 'number') updateData.tariff = tariff;
      if (typeof platformFee === 'number') updateData.platformFee = platformFee;
      if (typeof exchangeRate === 'number') updateData.exchangeRate = exchangeRate;
      if (typeof sellingPrice === 'number') updateData.sellingPrice = sellingPrice;

      if (Object.keys(updateData).length === 0) {
        throw new Error('至少需要提供一个要更新的成本字段');
      }

      // Recalculate totalLanded and grossMargin
      const newRawMaterial = (updateData.rawMaterial as number) ?? costRecord.rawMaterial;
      const newLabor = (updateData.labor as number) ?? costRecord.labor;
      const newLogistics = (updateData.logistics as number) ?? costRecord.logistics;
      const newTariff = (updateData.tariff as number) ?? costRecord.tariff;
      const newPlatformFee = (updateData.platformFee as number) ?? costRecord.platformFee;
      const newExchangeRate = (updateData.exchangeRate as number) ?? costRecord.exchangeRate;
      const newSellingPrice = (updateData.sellingPrice as number) ?? costRecord.sellingPrice;

      const cnyComponents = newRawMaterial + newLabor;
      const usdComponents = newLogistics + newTariff + newPlatformFee;
      const totalLanded = Math.round((cnyComponents / newExchangeRate + usdComponents) * 100) / 100;
      const grossMargin = Math.round(((newSellingPrice - totalLanded) / newSellingPrice) * 1000) / 10;

      updateData.totalLanded = totalLanded;
      updateData.grossMargin = grossMargin;

      const updated = await db.costRecord.update({
        where: { id: costRecord.id },
        data: updateData,
      });

      serverCache.invalidate('cost');
      serverCache.invalidate('dashboard');

      return {
        sku: updated.sku,
        productName: updated.productName,
        previousTotalLanded: costRecord.totalLanded,
        newTotalLanded: updated.totalLanded,
        previousGrossMargin: costRecord.grossMargin,
        newGrossMargin: updated.grossMargin,
        updatedFields: Object.keys(updateData).filter(k => k !== 'totalLanded' && k !== 'grossMargin'),
      };
    },
  },

  // ─── 12. create_note ────────────────────────────────────────────────────
  {
    name: 'create_note',
    description: '创建供应链备注。可以为特定产品或通用场景添加备注，支持不同优先级和分类。',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: '备注内容',
        },
        sku: {
          type: 'string',
          description: '关联的产品SKU(可选)，如: KA-RC4001',
        },
        category: {
          type: 'string',
          description: '分类: general(通用), inventory(库存), cost(成本), logistics(物流), sales(销售)',
          enum: ['general', 'inventory', 'cost', 'logistics', 'sales'],
        },
        priority: {
          type: 'string',
          description: '优先级: normal(普通), important(重要), urgent(紧急)',
          enum: ['normal', 'important', 'urgent'],
        },
        author: {
          type: 'string',
          description: '作者名称(可选)',
        },
      },
      required: ['content'],
    },
    handler: async (params) => {
      const data: CreateNoteData = {
        content: params.content as string,
        sku: params.sku as string | undefined,
        category: params.category as CreateNoteData['category'] | undefined,
        priority: params.priority as CreateNoteData['priority'] | undefined,
        author: params.author as string | undefined,
      };
      return await createNote(data);
    },
  },

  // ─── 13. resolve_alert ──────────────────────────────────────────────────
  {
    name: 'resolve_alert',
    description: '解除预警规则。可以启用/禁用预警规则、调整预警阈值或修改严重级别。',
    parameters: {
      type: 'object',
      properties: {
        ruleId: {
          type: 'string',
          description: '预警规则ID，如: low_stock_warning, overstock_alert',
        },
        enabled: {
          type: 'boolean',
          description: '是否启用该规则',
        },
        threshold: {
          type: 'number',
          description: '新的预警阈值',
        },
        severity: {
          type: 'string',
          description: '严重级别: warning(警告) 或 critical(严重)',
          enum: ['warning', 'critical'],
        },
      },
      required: ['ruleId'],
    },
    handler: async (params) => {
      const { ruleId, enabled, threshold, severity } = params;
      if (!ruleId) throw new Error('缺少必填参数: ruleId');

      if (enabled === undefined && threshold === undefined && severity === undefined) {
        throw new Error('至少需要提供一个要更新的字段: enabled, threshold 或 severity');
      }

      return await updateAlertRule(ruleId as string, {
        enabled: enabled as boolean | undefined,
        threshold: threshold as number | undefined,
        severity: severity as string | undefined,
      });
    },
  },
];
