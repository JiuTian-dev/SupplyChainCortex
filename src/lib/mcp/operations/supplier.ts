/**
 * MCP Tools: Supplier Operations (update_supplier_status, create_supplier, update_supplier).
 * Extracted from tools-operations.ts.
 */

import type { MCPTool } from '../tools';

export const supplierOperations: MCPTool[] = [
  {
    name: 'update_supplier_status',
    description: 'Activate or suspend a supplier. Updates the supplier status and logs an audit event.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: '供应商编码，如: SUP-GD001',
        },
        status: {
          type: 'string',
          description: '新状态: active(激活) 或 suspended(暂停)',
          enum: ['active', 'suspended'],
        },
        reason: {
          type: 'string',
          description: '状态变更原因（可选）',
        },
      },
      required: ['code', 'status'],
    },
    handler: async (params) => {
      const { code, status, reason } = params;
      if (!code) throw new Error('缺少必填参数: code');
      if (!status) throw new Error('缺少必填参数: status');

      const { db } = await import('@/lib/db');
      const { serverCache } = await import('@/lib/cache');

      const supplier = await db.supplier.findUnique({ where: { code: code as string } });
      if (!supplier) throw new Error(`未找到供应商: ${code}`);

      const updated = await db.supplier.update({
        where: { code: code as string },
        data: { status: status as string },
      });

      // Create audit log
      await db.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'supplier',
          entityId: updated.id,
          details: {
            field: 'status',
            previousValue: supplier.status,
            newValue: status,
            reason: reason || null,
          },
        },
      });

      if (reason) {
        await db.supplyChainEvent.create({
          data: {
            type: '供应商状态变更',
            title: `供应商${status === 'active' ? '激活' : '暂停'}: ${updated.name}`,
            description: `供应商 ${updated.code} (${updated.name}) 状态从 ${supplier.status} 变更为 ${status}。原因: ${reason}`,
            icon: status === 'active' ? 'active' : 'paused',
            color: status === 'active' ? 'green' : 'orange',
            severity: status === 'active' ? 'info' : 'warning',
          },
        });
      }

      // 失效供应商缓存，确保列表查询返回最新状态
      serverCache.invalidate('suppliers');

      return {
        code: updated.code,
        name: updated.name,
        previousStatus: supplier.status,
        newStatus: updated.status,
        reason: reason || null,
      };
    },
  },

  {
    name: 'create_supplier',
    description: 'Add a new supplier to the system. Creates a supplier record with status=active and rating=3.0.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: '唯一供应商编码，如: SUP-GD001',
        },
        name: {
          type: 'string',
          description: '供应商名称',
        },
        region: {
          type: 'string',
          description: '所属地区',
          enum: ['华东', '华南', '华北', '华中', '海外'],
        },
        category: {
          type: 'string',
          description: '供应品类',
          enum: ['电子元器件', '塑料五金件', '成品代工', '物流运输', '清关服务', '包装材料'],
        },
        leadTime: {
          type: 'number',
          description: '平均交货天数',
        },
        contact: {
          type: 'string',
          description: '联系人（可选）',
        },
        email: {
          type: 'string',
          description: '联系邮箱（可选）',
        },
        phone: {
          type: 'string',
          description: '联系电话（可选）',
        },
      },
      required: ['code', 'name', 'region', 'category', 'leadTime'],
    },
    handler: async (params) => {
      const { code, name, region, category, leadTime, contact, email, phone } = params;
      if (!code) throw new Error('缺少必填参数: code');
      if (!name) throw new Error('缺少必填参数: name');
      if (!region) throw new Error('缺少必填参数: region');
      if (!category) throw new Error('缺少必填参数: category');
      if (typeof leadTime !== 'number') throw new Error('缺少必填参数: leadTime');

      const { db } = await import('@/lib/db');
      const { serverCache } = await import('@/lib/cache');

      // Check if code already exists
      const existing = await db.supplier.findUnique({ where: { code: code as string } });
      if (existing) {
        throw new Error(`供应商编码已存在: ${code}`);
      }

      const supplier = await db.supplier.create({
        data: {
          code: code as string,
          name: name as string,
          region: region as string,
          category: category as string,
          leadTime: leadTime as number,
          contact: (contact as string) || null,
          email: (email as string) || null,
          phone: (phone as string) || null,
          status: 'active',
          rating: 3.0,
        },
      });

      // Create supply chain event
      await db.supplyChainEvent.create({
        data: {
          type: '供应商新增',
          title: `新供应商: ${supplier.name}`,
          description: `新增供应商 ${supplier.code} (${supplier.name})，地区: ${supplier.region}，品类: ${supplier.category}`,
          icon: 'factory',
          color: 'green',
          severity: 'info',
        },
      });

      serverCache.invalidate('suppliers');

      return {
        code: supplier.code,
        name: supplier.name,
        region: supplier.region,
        category: supplier.category,
        leadTime: supplier.leadTime,
        rating: supplier.rating,
        status: supplier.status,
        contact: supplier.contact,
        email: supplier.email,
        phone: supplier.phone,
      };
    },
  },

  {
    name: 'update_supplier',
    description: 'Update supplier information. Only provided fields are updated. Use update_supplier_status for status changes.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: '供应商编码',
        },
        name: {
          type: 'string',
          description: '供应商名称',
        },
        region: {
          type: 'string',
          description: '所属地区',
        },
        category: {
          type: 'string',
          description: '供应品类',
        },
        leadTime: {
          type: 'number',
          description: '平均交货天数',
        },
        contact: {
          type: 'string',
          description: '联系人',
        },
        email: {
          type: 'string',
          description: '联系邮箱',
        },
        phone: {
          type: 'string',
          description: '联系电话',
        },
        rating: {
          type: 'number',
          description: '综合评分 0-5',
        },
      },
      required: ['code'],
    },
    handler: async (params) => {
      const { code, name, region, category, leadTime, contact, email, phone, rating } = params;
      if (!code) throw new Error('缺少必填参数: code');

      const { db } = await import('@/lib/db');
      const { serverCache } = await import('@/lib/cache');

      const existing = await db.supplier.findUnique({ where: { code: code as string } });
      if (!existing) throw new Error(`未找到供应商: ${code}`);

      const updateData: Record<string, unknown> = {};
      if (name) updateData.name = name;
      if (region) updateData.region = region;
      if (category) updateData.category = category;
      if (typeof leadTime === 'number') updateData.leadTime = leadTime;
      if (contact !== undefined) updateData.contact = contact;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (typeof rating === 'number') {
        if (rating < 0 || rating > 5) throw new Error('rating 必须为 0-5 之间的数值');
        updateData.rating = rating;
      }

      if (Object.keys(updateData).length === 0) {
        throw new Error('至少需要提供一个要更新的字段');
      }

      const updated = await db.supplier.update({
        where: { code: code as string },
        data: updateData,
      });

      // Log changed fields
      const changedFields = Object.keys(updateData);
      await db.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'supplier',
          entityId: updated.id,
          details: { updatedFields: changedFields },
        },
      });

      serverCache.invalidate('suppliers');

      return {
        code: updated.code,
        name: updated.name,
        region: updated.region,
        category: updated.category,
        leadTime: updated.leadTime,
        contact: updated.contact,
        email: updated.email,
        phone: updated.phone,
        rating: updated.rating,
        status: updated.status,
        updatedFields: changedFields,
      };
    },
  },
];
