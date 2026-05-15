import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withErrorHandler, apiSuccess } from "@/lib/api-utils";
import { getSupplierPerformance } from "@/lib/services/suppliers.service";

// GET /api/supplier-performance - Supplier performance analysis
export const GET = withErrorHandler(async (_request: NextRequest) => {
  const result = await getSupplierPerformance();
  return apiSuccess(result);
});

// POST /api/supplier-performance - Rate a supplier
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { supplierId, rating, dimensions } = body;

    if (!supplierId || !rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "参数无效：需要 supplierId 和 rating (1-5)" }, { status: 400 });
    }

    const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      return NextResponse.json({ error: "供应商不存在" }, { status: 404 });
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
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error("Supplier Performance POST error:", error);
    return NextResponse.json({ error: "供应商评分更新失败" }, { status: 500 });
  }
}
