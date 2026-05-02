import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withErrorHandler, apiSuccess, apiError, parsePagination, ValidationError, NotFoundError } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';

// ==================== GET /api/quality ====================
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "overview";
  const { page, pageSize } = parsePagination(searchParams);

  switch (action) {
    // ---- Return records with Pareto analysis ----
    case "returns": {
      const status = searchParams.get("status") || undefined;
      const reason = searchParams.get("reason") || undefined;
      const platform = searchParams.get("platform") || undefined;
      const sku = searchParams.get("sku") || undefined;

      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (reason) where.reason = reason;
      if (platform) where.platform = platform;
      if (sku) where.sku = sku;

      const [records, total] = await Promise.all([
        db.returnRecord.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        db.returnRecord.count({ where }),
      ]);

      // Pareto analysis: count by reason
      const allReturns = await db.returnRecord.findMany({
        where,
        select: { reason: true, quantity: true, costImpact: true },
      });

      const reasonMap = new Map<string, { count: number; totalQty: number; totalCost: number }>();
      for (const r of allReturns) {
        const existing = reasonMap.get(r.reason) || { count: 0, totalQty: 0, totalCost: 0 };
        existing.count++;
        existing.totalQty += r.quantity;
        existing.totalCost += r.costImpact;
        reasonMap.set(r.reason, existing);
      }

      const paretoData = Array.from(reasonMap.entries())
        .map(([reason, data]) => ({ reason, ...data }))
        .sort((a, b) => b.count - a.count);

      // Calculate cumulative percentage for Pareto
      const totalReturns = paretoData.reduce((sum, p) => sum + p.count, 0);
      let cumulative = 0;
      const paretoWithCumulative = paretoData.map(p => {
        cumulative += p.count;
        return { ...p, cumulativePercent: totalReturns > 0 ? Math.round((cumulative / totalReturns) * 100) : 0 };
      });

      const totalPages = Math.ceil(total / pageSize) || 1;

      return apiSuccess({
        records,
        pagination: { page, pageSize, total, totalPages },
        pareto: paretoWithCumulative,
        summary: {
          totalReturns: allReturns.length,
          totalQuantity: allReturns.reduce((s, r) => s + r.quantity, 0),
          totalCostImpact: allReturns.reduce((s, r) => s + r.costImpact, 0),
        },
      });
    }

    // ---- Defect records with statistics ----
    case "defects": {
      const status = searchParams.get("status") || undefined;
      const defectType = searchParams.get("defectType") || undefined;
      const severity = searchParams.get("severity") || undefined;
      const sku = searchParams.get("sku") || undefined;

      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (defectType) where.defectType = defectType;
      if (severity) where.severity = severity;
      if (sku) where.sku = sku;

      const [records, total] = await Promise.all([
        db.defectRecord.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        db.defectRecord.count({ where }),
      ]);

      // Statistics
      const allDefects = await db.defectRecord.findMany({
        where,
        select: { defectType: true, severity: true, quantity: true, detectedAt: true, status: true },
      });

      const byType: Record<string, number> = {};
      const bySeverity: Record<string, number> = {};
      const byDetectedAt: Record<string, number> = {};
      let openCount = 0;
      let totalDefectQty = 0;

      for (const d of allDefects) {
        byType[d.defectType] = (byType[d.defectType] || 0) + 1;
        bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;
        byDetectedAt[d.detectedAt] = (byDetectedAt[d.detectedAt] || 0) + 1;
        if (d.status === "open" || d.status === "investigating") openCount++;
        totalDefectQty += d.quantity;
      }

      const totalPages = Math.ceil(total / pageSize) || 1;

      return apiSuccess({
        records,
        pagination: { page, pageSize, total, totalPages },
        statistics: {
          total: allDefects.length,
          totalDefectQuantity: totalDefectQty,
          openCount,
          byType,
          bySeverity,
          byDetectedAt,
        },
      });
    }

    // ---- Warranty cost records with totals ----
    case "warranty": {
      const status = searchParams.get("status") || undefined;
      const category = searchParams.get("category") || undefined;
      const sku = searchParams.get("sku") || undefined;

      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (category) where.category = category;
      if (sku) where.sku = sku;

      const [records, total] = await Promise.all([
        db.warrantyCost.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        db.warrantyCost.count({ where }),
      ]);

      // Totals
      const allWarranty = await db.warrantyCost.findMany({
        where,
        select: { cost: true, category: true, status: true },
      });

      const totalCost = allWarranty.reduce((s, w) => s + w.cost, 0);
      const byCategory: Record<string, { count: number; totalCost: number }> = {};
      const byStatus: Record<string, number> = {};

      for (const w of allWarranty) {
        if (!byCategory[w.category]) byCategory[w.category] = { count: 0, totalCost: 0 };
        byCategory[w.category].count++;
        byCategory[w.category].totalCost += w.cost;
        byStatus[w.status] = (byStatus[w.status] || 0) + 1;
      }

      const totalPages = Math.ceil(total / pageSize) || 1;

      return apiSuccess({
        records,
        pagination: { page, pageSize, total, totalPages },
        totals: {
          totalCost: Math.round(totalCost * 100) / 100,
          totalClaims: allWarranty.length,
          byCategory,
          byStatus,
        },
      });
    }

    // ---- Quality overview / dashboard ----
    case "overview": {
      const [totalReturns, totalDefects, totalWarranty, returnByReason, defectBySeverity, warrantyByCategory] =
        await Promise.all([
          db.returnRecord.count(),
          db.defectRecord.count(),
          db.warrantyCost.count(),
          db.returnRecord.groupBy({ by: ["reason"], _count: true, _sum: { quantity: true, costImpact: true }, orderBy: { _count: { reason: "desc" } } }),
          db.defectRecord.groupBy({ by: ["severity"], _count: true, _sum: { quantity: true } }),
          db.warrantyCost.groupBy({ by: ["category"], _sum: { cost: true }, _count: true }),
        ]);

      const warrantyTotalCost = await db.warrantyCost.aggregate({ _sum: { cost: true } });
      const openDefects = await db.defectRecord.count({ where: { status: { in: ["open", "investigating"] } } });
      const pendingReturns = await db.returnRecord.count({ where: { status: "pending" } });

      // Pareto data for returns
      const totalReturnCount = returnByReason.reduce((s, r) => s + r._count, 0);
      let cumulative = 0;
      const paretoData = returnByReason.map(r => {
        cumulative += r._count;
        return {
          reason: r.reason,
          count: r._count,
          totalQty: r._sum.quantity || 0,
          totalCost: r._sum.costImpact || 0,
          cumulativePercent: totalReturnCount > 0 ? Math.round((cumulative / totalReturnCount) * 100) : 0,
        };
      });

      return apiSuccess({
        returnRate: {
          total: totalReturns,
          pending: pendingReturns,
          byReason: paretoData,
        },
        defectRate: {
          total: totalDefects,
          open: openDefects,
          bySeverity: defectBySeverity.map(d => ({
            severity: d.severity,
            count: d._count,
            totalQty: d._sum.quantity || 0,
          })),
        },
        warrantyCost: {
          total: totalWarranty,
          totalCost: Math.round((warrantyTotalCost._sum.cost || 0) * 100) / 100,
          byCategory: warrantyByCategory.map(w => ({
            category: w.category,
            count: w._count,
            totalCost: w._sum.cost || 0,
          })),
        },
        pareto: paretoData,
      });
    }

    default:
      return apiError(`未知操作: ${action}`, 400, 'UNKNOWN_ACTION');
  }
}));

// ==================== POST /api/quality ====================
export const POST = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (!action) {
    throw ValidationError("缺少 action 参数");
  }

  const body = await request.json();

  switch (action) {
    case "create_return": {
      const { sku, productName, quantity, reason, reasonDetail, platform, costImpact, status } = body as {
        sku: string; productName: string; quantity: number; reason: string;
        reasonDetail?: string; platform?: string; costImpact?: number; status?: string;
      };

      if (!sku || !productName || !quantity || !reason) {
        throw ValidationError("缺少必填字段: sku, productName, quantity, reason");
      }
      const validReasons = ["质量", "物流", "规格", "其他"];
      if (!validReasons.includes(reason)) {
        throw ValidationError(`无效的退货原因: ${reason}，有效值: ${validReasons.join("/")}`);
      }

      const record = await db.returnRecord.create({
        data: {
          sku, productName, quantity, reason,
          reasonDetail: reasonDetail || null,
          platform: platform || null,
          costImpact: costImpact || 0,
          status: status || "pending",
        },
      });

      return apiSuccess(record, 201);
    }

    case "create_defect": {
      const { sku, productName, defectType, severity, quantity, detectedAt, rootCause, correctiveAction, status } = body as {
        sku: string; productName: string; defectType: string; severity?: string;
        quantity?: number; detectedAt: string; rootCause?: string; correctiveAction?: string; status?: string;
      };

      if (!sku || !productName || !defectType || !detectedAt) {
        throw ValidationError("缺少必填字段: sku, productName, defectType, detectedAt");
      }
      const validTypes = ["外观", "功能", "包装", "安全"];
      if (!validTypes.includes(defectType)) {
        throw ValidationError(`无效的缺陷类型: ${defectType}`);
      }
      const validSeverities = ["minor", "major", "critical"];
      if (severity && !validSeverities.includes(severity)) {
        throw ValidationError(`无效的严重程度: ${severity}`);
      }

      const record = await db.defectRecord.create({
        data: {
          sku, productName, defectType,
          severity: severity || "minor",
          quantity: quantity || 1,
          detectedAt,
          rootCause: rootCause || null,
          correctiveAction: correctiveAction || null,
          status: status || "open",
        },
      });

      return apiSuccess(record, 201);
    }

    case "create_warranty": {
      const { sku, productName, category, cost, description, claimDate, resolvedDate, status } = body as {
        sku: string; productName: string; category: string; cost: number;
        description?: string; claimDate: string; resolvedDate?: string; status?: string;
      };

      if (!sku || !productName || !category || !cost || !claimDate) {
        throw ValidationError("缺少必填字段: sku, productName, category, cost, claimDate");
      }
      const validCategories = ["repair", "replacement", "refund", "support"];
      if (!validCategories.includes(category)) {
        throw ValidationError(`无效的质保类别: ${category}`);
      }

      const record = await db.warrantyCost.create({
        data: {
          sku, productName, category, cost,
          description: description || null,
          claimDate,
          resolvedDate: resolvedDate || null,
          status: status || "submitted",
        },
      });

      return apiSuccess(record, 201);
    }

    default:
      return apiError(`未知 POST 操作: ${action}`, 400, 'UNKNOWN_ACTION');
  }
}));

// ==================== PUT /api/quality ====================
export const PUT = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (!action) {
    throw ValidationError("缺少 action 参数");
  }

  const body = await request.json();

  switch (action) {
    case "update_return": {
      const { id, status } = body as { id: string; status: string };

      if (!id || !status) {
        throw ValidationError("缺少必填字段: id, status");
      }
      const validStatuses = ["pending", "processed", "refunded", "rejected"];
      if (!validStatuses.includes(status)) {
        throw ValidationError(`无效的退货状态: ${status}`);
      }

      const existing = await db.returnRecord.findUnique({ where: { id } });
      if (!existing) throw NotFoundError(`退货记录不存在: ${id}`);

      const updated = await db.returnRecord.update({
        where: { id },
        data: { status },
      });

      return apiSuccess(updated);
    }

    case "update_defect": {
      const { id, status, rootCause, correctiveAction } = body as {
        id: string; status?: string; rootCause?: string; correctiveAction?: string;
      };

      if (!id) {
        throw ValidationError("缺少必填字段: id");
      }

      const existing = await db.defectRecord.findUnique({ where: { id } });
      if (!existing) throw NotFoundError(`缺陷记录不存在: ${id}`);

      const updateData: Record<string, unknown> = {};
      if (status) {
        const validStatuses = ["open", "investigating", "resolved", "closed"];
        if (!validStatuses.includes(status)) {
          throw ValidationError(`无效的缺陷状态: ${status}`);
        }
        updateData.status = status;
        if (status === "resolved" || status === "closed") {
          updateData.resolvedAt = new Date();
        }
      }
      if (rootCause !== undefined) updateData.rootCause = rootCause;
      if (correctiveAction !== undefined) updateData.correctiveAction = correctiveAction;

      const updated = await db.defectRecord.update({
        where: { id },
        data: updateData,
      });

      return apiSuccess(updated);
    }

    case "update_warranty": {
      const { id, status, resolvedDate } = body as {
        id: string; status?: string; resolvedDate?: string;
      };

      if (!id) {
        throw ValidationError("缺少必填字段: id");
      }

      const existing = await db.warrantyCost.findUnique({ where: { id } });
      if (!existing) throw NotFoundError(`质保记录不存在: ${id}`);

      const updateData: Record<string, unknown> = {};
      if (status) {
        const validStatuses = ["submitted", "approved", "rejected", "completed"];
        if (!validStatuses.includes(status)) {
          throw ValidationError(`无效的质保状态: ${status}`);
        }
        updateData.status = status;
      }
      if (resolvedDate !== undefined) updateData.resolvedDate = resolvedDate;
      if (status === "completed" && !resolvedDate) {
        updateData.resolvedDate = new Date().toISOString().split("T")[0];
      }

      const updated = await db.warrantyCost.update({
        where: { id },
        data: updateData,
      });

      return apiSuccess(updated);
    }

    default:
      return apiError(`未知 PUT 操作: ${action}`, 400, 'UNKNOWN_ACTION');
  }
}));
