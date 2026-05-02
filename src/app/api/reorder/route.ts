import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import { getReorderOrders, createReorderOrder, updateReorderOrder } from "@/lib/queries/reorder.queries";
import { createAuditLog } from "@/lib/services/audit.service";

// GET /api/reorder - List all reorder orders
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;

  const result = await getReorderOrders({ status });

  return NextResponse.json({ orders: result.orders });
}));

// POST /api/reorder - Create a new reorder order
export const POST = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { sku, productName, quantity, warehouse, priority, notes } = body;

  // Validate required fields
  if (!sku || !productName || !quantity || !warehouse) {
    return NextResponse.json(
      { error: "缺少必填字段: sku, productName, quantity, warehouse" },
      { status: 422 }
    );
  }

  if (typeof quantity !== "number" || quantity <= 0) {
    return NextResponse.json(
      { error: "quantity 必须为正整数" },
      { status: 422 }
    );
  }

  const order = await createReorderOrder({ sku, productName, quantity, warehouse, priority, notes });

  await createAuditLog({
    action: 'CREATE',
    entity: 'reorder',
    entityId: order.id,
    sku,
    details: { sku, productName, quantity, warehouse, priority: priority || '常规' },
  });

  return NextResponse.json({ success: true, order });
}));

// PUT /api/reorder - Update reorder order status
export const PUT = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { id, status } = body;

  if (!id || !status) {
    return NextResponse.json(
      { error: "缺少必填字段: id, status" },
      { status: 422 }
    );
  }

  try {
    const order = await updateReorderOrder(id, { status });

    await createAuditLog({
      action: 'UPDATE',
      entity: 'reorder',
      entityId: id,
      sku: order.sku,
      details: { status, previousStatus: 'pending' },
    });

    return NextResponse.json({ success: true, order });
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新补货订单失败';
    const statusCode = message.includes('未找到') ? 404 : message.includes('无效') ? 422 : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}));
