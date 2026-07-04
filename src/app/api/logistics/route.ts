import { NextRequest, NextResponse } from "next/server";
import { createAuditLog } from "@/lib/services/audit.service";
import { withErrorHandler, apiError, AppError } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import {
  getShipmentList,
  getShipmentByTracking,
  updateShipmentStatus,
  getShipmentEstimate,
  getLogisticsRisks,
  isValidShipmentStatus,
  STATUS_LABELS,
  SHIPMENT_STATUSES,
} from "@/lib/services/logistics.service";
import type { ShipmentStatusUpdate } from "@/lib/services/logistics.service";

// GET /api/logistics - 物流追踪数据
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "list";
  const trackingNumber = searchParams.get("trackingNumber");
  const sku = searchParams.get("sku");
  const skusParam = searchParams.get("skus");
  const skus = skusParam ? skusParam.split(',').map(s => s.trim()).filter(Boolean) : undefined;
  const route = searchParams.get("route") || "CN-US";

  // Filter parameters
  const status = searchParams.get("status") || undefined;
  const carrier = searchParams.get("carrier") || undefined;

  // Validate status if provided
  if (status && !isValidShipmentStatus(status)) {
    throw new AppError(`无效的状态: ${status}，支持: ${SHIPMENT_STATUSES.join("/")}`, 400, "VALIDATION_ERROR");
  }

  switch (action) {
    case "list": {
      const result = await getShipmentList({ status, carrier, skus });
      return NextResponse.json(result);
    }

    case "track": {
      if (!trackingNumber) {
        throw new AppError("缺少 trackingNumber 参数", 422, "VALIDATION_ERROR");
      }

      const detail = await getShipmentByTracking(trackingNumber);

      if (!detail) {
        throw new AppError(`未找到追踪号: ${trackingNumber}`, 404, "NOT_FOUND");
      }

      // Apply filters (return 404 if filtered out)
      if (status && detail.status !== status) {
        throw new AppError(`追踪号 ${trackingNumber} 状态不匹配筛选条件`, 404, "NOT_FOUND");
      }
      if (carrier && detail.carrier !== carrier) {
        throw new AppError(`追踪号 ${trackingNumber} 承运商不匹配筛选条件`, 404, "NOT_FOUND");
      }

      return NextResponse.json(detail);
    }

    case "estimate": {
      if (!sku) {
        throw new AppError("缺少 sku 参数", 422, "VALIDATION_ERROR");
      }

      try {
        const estimate = await getShipmentEstimate(sku, route);
        return NextResponse.json(estimate);
      } catch (error) {
        if (error instanceof Error && error.message.includes("未找到")) {
          throw new AppError(error.message, 404, "NOT_FOUND");
        }
        throw error;
      }
    }

    case "risk": {
      const risks = await getLogisticsRisks();
      return NextResponse.json(risks);
    }

    default:
      throw new AppError(`未知操作: ${action}`, 400, "UNKNOWN_ACTION");
  }
}));

// POST /api/logistics - 货运状态更新
// Body: { action: "update_status", trackingNumber: string, status: string, eta?: string, progress?: number, notes?: string }
export const POST = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const body = await request.json();
  const { action, trackingNumber, status, eta, progress, notes } = body;

  if (action !== "update_status" && !trackingNumber) {
    throw new AppError("缺少 action 或 trackingNumber 参数", 422, "VALIDATION_ERROR");
  }

  const effectiveTracking = trackingNumber || (action === "update_status" ? body.trackingNumber : null);
  if (!effectiveTracking) {
    throw new AppError("缺少 trackingNumber 参数", 422, "VALIDATION_ERROR");
  }

  // Validate status
  if (status && !isValidShipmentStatus(status)) {
    throw new AppError(`无效的状态: ${status}`, 400, "VALIDATION_ERROR");
  }

  const statusUpdate: ShipmentStatusUpdate = {
    status,
    eta,
    progress: typeof progress === "number" ? progress : undefined,
    notes,
  };

  try {
    const result = await updateShipmentStatus(effectiveTracking, statusUpdate);

    // Audit log for shipment status update
    const shipment = await (await import('@/lib/db')).db.shipmentItem.findUnique({
      where: { trackingNumber: effectiveTracking },
    });
    if (shipment) {
      await createAuditLog({
        action: 'UPDATE',
        entity: 'shipment',
        entityId: shipment.id,
        sku: shipment.sku,
        details: { trackingNumber: effectiveTracking, newStatus: status, eta, progress },
        request,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("未找到")) {
        throw new AppError(error.message, 404, "NOT_FOUND");
      }
      if (error.message.includes("无效")) {
        throw new AppError(error.message, 400, "VALIDATION_ERROR");
      }
    }
    throw error;
  }
}));
