/**
 * @internal 待评估 — 此路由在前端组件中无直接调用，疑似无运行时引用。
 * 决策：保留以备运维/外部系统/未来用途，但标注待评估。
 * 评估建议：如确认无任何调用方（含外部脚本、Prometheus、运维工具），可考虑删除。
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withErrorHandler, apiSuccess, AppError } from "@/lib/api-utils";
import { withApiRateLimit } from "@/lib/api-protection";
import { optionalRequireAuth } from "@/lib/auth-helpers";
import { getSupplierPerformance } from "@/lib/services/suppliers.service";

// GET /api/supplier-performance - Supplier performance analysis
export const GET = withApiRateLimit(withErrorHandler(async (_request: NextRequest) => {
  await optionalRequireAuth();
  const result = await getSupplierPerformance();
  return apiSuccess(result);
}));

// POST /api/supplier-performance - Rate a supplier
export const POST = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const body = await request.json();
  const { supplierId, rating, dimensions } = body;

  if (!supplierId || !rating || rating < 1 || rating > 5) {
    throw new AppError("参数无效：需要 supplierId 和 rating (1-5)", 400, "VALIDATION_ERROR");
  }

  const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) {
    throw new AppError("供应商不存在", 404, "NOT_FOUND");
  }

  // Update supplier rating
  const ratingDetails = dimensions
    ? {
        quality: dimensions.quality || 0,
        delivery: dimensions.delivery || 0,
        cost: dimensions.cost || 0,
        service: dimensions.service || 0,
        ratedAt: new Date().toISOString(),
      }
    : supplier.ratingDetails;

  await db.supplier.update({
    where: { id: supplierId },
    data: {
      rating,
      ratingDetails: ratingDetails as Prisma.InputJsonValue,
    },
  });

  // Create supply chain event for audit
  await db.supplyChainEvent.create({
    data: {
      type: "供应商评级",
      title: `供应商 ${supplier.name} 评分更新`,
      description: `评分更新为 ${rating}/5${dimensions ? `，维度：质量${dimensions.quality || 0}，交付${dimensions.delivery || 0}，成本${dimensions.cost || 0}，服务${dimensions.service || 0}` : ""}`,
      icon: "⭐",
      color: "#f59e0b",
      severity: "info",
    },
  });

  return NextResponse.json({
    success: true,
    supplierId,
    newRating: rating,
    dimensions: dimensions || null,
  });
}));
