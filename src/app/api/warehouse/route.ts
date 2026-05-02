import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import {
  getWarehouseOverview,
  getWarehouseCapacity,
  getWarehouseAging,
  getWarehouseZones,
  getWarehouseTrend,
  getWarehouseStats,
  getTransferSuggestions,
  transferStock,
} from "@/lib/services/warehouse.service";
import { createAuditLog } from "@/lib/services/audit.service";

// GET /api/warehouse - Warehouse analytics and stats
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "overview";
  const warehouse = searchParams.get("warehouse") || undefined;

  switch (action) {
    case "overview": {
      const result = await getWarehouseOverview(warehouse);
      return NextResponse.json(result);
    }

    case "capacity": {
      const result = await getWarehouseCapacity(warehouse);
      return NextResponse.json(result);
    }

    case "aging": {
      const result = await getWarehouseAging(warehouse);
      return NextResponse.json(result);
    }

    case "zones": {
      const result = await getWarehouseZones(warehouse);
      return NextResponse.json(result);
    }

    case "utilization_trend": {
      const days = parseInt(searchParams.get("days") || "7");
      const result = await getWarehouseTrend(days, warehouse);
      return NextResponse.json(result);
    }

    case "stats": {
      const result = await getWarehouseStats();
      return NextResponse.json(result);
    }

    case "transfer": {
      const result = await getTransferSuggestions();
      return NextResponse.json(result);
    }

    default:
      return NextResponse.json({ error: `未知操作: ${action}` }, { status: 400 });
  }
}));

// POST /api/warehouse - Transfer stock between zones/warehouses
export const POST = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "transfer";

  if (action === "transfer") {
    const body = await request.json();
    const { fromZone, toZone, sku, quantity } = body;

    // Validate required fields
    if (!fromZone || !toZone || !sku || !quantity) {
      return NextResponse.json(
        { error: "缺少必填字段: fromZone, toZone, sku, quantity" },
        { status: 400 }
      );
    }

    if (quantity <= 0) {
      return NextResponse.json(
        { error: "调拨数量必须大于0" },
        { status: 400 }
      );
    }

    if (fromZone === toZone) {
      return NextResponse.json(
        { error: "源仓库/区域和目标仓库/区域不能相同" },
        { status: 400 }
      );
    }

    try {
      const result = await transferStock({ fromZone, toZone, sku, quantity });

      await createAuditLog({
        action: 'TRANSFER',
        entity: 'inventory',
        sku,
        details: {
          fromZone,
          toZone,
          quantity,
          transferType: result.transfer.type,
          fromBefore: result.transfer.fromBefore,
          fromAfter: result.transfer.fromAfter,
          toBefore: result.transfer.toBefore,
          toAfter: result.transfer.toAfter,
        },
      });

      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '仓库操作失败';
      const statusCode = message.includes('未找到') ? 404 : message.includes('不足') ? 400 : 500;
      return NextResponse.json({ error: message }, { status: statusCode });
    }
  }

  return NextResponse.json({ error: `未知 POST 操作: ${action}` }, { status: 400 });
}));
