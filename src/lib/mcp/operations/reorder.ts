/**
 * MCP Tools: Reorder Operations (create_reorder, batch_create_reorder).
 * Extracted from tools-operations.ts.
 */

import type { MCPTool } from '../tools';
import { createReorderOrder, type CreateReorderData } from '@/lib/queries/reorder.queries';

export const reorderOperations: MCPTool[] = [
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
];

// 单独导出，便于 barrel 控制顺序（保持 batch_create_reorder 在 operations 数组末尾）
export const batchReorderOperations: MCPTool[] = [
  {
    name: 'batch_create_reorder',
    description: 'Create reorder orders for multiple products at once. Each item requires sku, productName, quantity, and warehouse. Returns summary with created count and any failures.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: '补货项目列表，每个项目需包含 sku, productName, quantity, warehouse',
          items: {
            type: 'object',
            properties: {
              sku: { type: 'string', description: '产品SKU' },
              productName: { type: 'string', description: '产品名称' },
              quantity: { type: 'number', description: '补货数量' },
              warehouse: { type: 'string', description: '目标仓库' },
              priority: { type: 'string', description: '优先级: 常规 或 紧急', enum: ['常规', '紧急'] },
            },
            required: ['sku', 'productName', 'quantity', 'warehouse'],
          },
        },
        priority: {
          type: 'string',
          description: '全局默认优先级（被单项priority覆盖）',
          enum: ['常规', '紧急'],
        },
      },
      required: ['items'],
    },
    handler: async (params) => {
      const { items, priority } = params;
      if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error('缺少必填参数: items（至少需要一个补货项目）');
      }

      const { db } = await import('@/lib/db');
      const { serverCache } = await import('@/lib/cache');

      const defaultPriority = (priority as string) || '常规';

      try {
        await db.$transaction(async (tx) => {
          for (const item of items) {
            const sku = item.sku as string;
            const productName = item.productName as string;
            const quantity = item.quantity as number;
            const warehouse = item.warehouse as string;
            const itemPriority = (item.priority as string) || defaultPriority;

            if (!sku || !productName || !quantity || !warehouse) {
              throw new Error('补货项目缺少必填字段: sku, productName, quantity, warehouse');
            }
            if (typeof quantity !== 'number' || quantity <= 0) {
              throw new Error(`SKU ${sku}: quantity 必须为正整数`);
            }

            await tx.reorderOrder.create({
              data: {
                sku,
                productName,
                quantity,
                warehouse,
                priority: itemPriority,
                status: 'pending',
              },
            });

            await tx.supplyChainEvent.create({
              data: {
                type: '补货订单',
                title: `批量补货: ${productName}`,
                description: `批量创建补货订单: SKU ${sku}, 数量 ${quantity}, 仓库 ${warehouse}, 优先级 ${itemPriority}`,
                icon: 'package',
                color: 'orange',
                severity: itemPriority === '紧急' ? 'warning' : 'info',
                sku,
              },
            });
          }
        });

        serverCache.invalidate('reorder');
        return { success: true, created: items.length };
      } catch (err) {
        return { success: false, error: `Batch reorder failed: ${(err as Error).message}`, created: 0 };
      }
    },
  },
];
