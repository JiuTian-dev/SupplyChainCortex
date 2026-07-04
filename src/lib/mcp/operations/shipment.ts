/**
 * MCP Tools: Shipment Operations (update_shipment_status).
 * Extracted from tools-operations.ts.
 */

import type { MCPTool } from '../tools';
import { updateShipmentStatus, type ShipmentStatusUpdate } from '@/lib/services/logistics.service';

// 与 schema.prisma 和 logistics.service.ts 保持一致的状态枚举
const VALID_STATUSES = ['pending', 'in_transit', 'customs', 'delivered', 'delayed', 'exception'];

export const shipmentOperations: MCPTool[] = [
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
      required: ['trackingNumber', 'status'],
    },
    handler: async (params) => {
      const trackingNumber = params.trackingNumber as string;
      const status = params.status as string;
      // 空字符串校验（JSON Schema required 不拦截空字符串）
      if (!trackingNumber) throw new Error('缺少必填参数: trackingNumber');
      if (!status) throw new Error('缺少必填参数: status');
      if (!VALID_STATUSES.includes(status)) {
        return { success: false, error: `Invalid status "${status}". Valid: ${VALID_STATUSES.join(', ')}` };
      }

      const update: ShipmentStatusUpdate = {};
      update.status = status as ShipmentStatusUpdate['status'];
      if (params.eta) update.eta = params.eta as string;
      if (typeof params.progress === 'number') update.progress = params.progress as number;
      if (params.notes) update.notes = params.notes as string;
      return await updateShipmentStatus(trackingNumber, update);
    },
  },
];
