/**
 * MCP Tools: Cost & Note Operations (update_cost_record, create_note, resolve_alert).
 * Extracted from tools-operations.ts.
 */

import type { MCPTool } from '../tools';
import { createNote, type CreateNoteData } from '@/lib/services/notes.service';
import { updateAlertRule } from '@/lib/queries/alert-rules.queries';

export const costNoteOperations: MCPTool[] = [
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

      // Cost components are split by currency:
      // CNY: rawMaterial, labor (domestic procurement/production costs)
      // USD: logistics, tariff, platformFee (international freight, duties, platform charges)
      // exchangeRate is used to convert USD components to CNY for totalLanded calculation
      const newRawMaterial = (updateData.rawMaterial as number) ?? costRecord.rawMaterial;
      const newLabor = (updateData.labor as number) ?? costRecord.labor;
      const newLogistics = (updateData.logistics as number) ?? costRecord.logistics;
      const newTariff = (updateData.tariff as number) ?? costRecord.tariff;
      const newPlatformFee = (updateData.platformFee as number) ?? costRecord.platformFee;
      const newExchangeRate = (updateData.exchangeRate as number) ?? costRecord.exchangeRate;
      const newSellingPrice = (updateData.sellingPrice as number) ?? costRecord.sellingPrice;

      // 除零风险防护：汇率和售价必须大于 0，否则会产生 Infinity/NaN 写入数据库
      if (!newExchangeRate || newExchangeRate <= 0) {
        throw new Error(`exchangeRate 必须大于 0，当前值: ${newExchangeRate}`);
      }
      if (!newSellingPrice || newSellingPrice <= 0) {
        throw new Error(`sellingPrice 必须大于 0，当前值: ${newSellingPrice}`);
      }

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
