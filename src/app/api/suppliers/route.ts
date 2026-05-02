import { NextRequest, NextResponse } from "next/server";
import { createAuditLog } from "@/lib/services/audit.service";
import { withErrorHandler, apiError, AppError } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import {
  getSuppliersList,
  getSupplierByCode,
  rateSupplier,
  getSupplierPerformance,
  createSupplier,
  SUPPLIER_STATUSES,
} from "@/lib/services/suppliers.service";
import type { CreateSupplierData, SupplierRatingData } from "@/lib/services/suppliers.service";

// GET /api/suppliers - List all suppliers or get supplier detail
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const code = searchParams.get("code");
  const region = searchParams.get("region");
  const category = searchParams.get("category");
  const status = searchParams.get("status");

  // Pagination parameters
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  // ==================== Supplier Performance Metrics ====================
  if (action === "performance") {
    const result = await getSupplierPerformance();
    return NextResponse.json(result);
  }

  // Get supplier detail
  if (action === "detail") {
    if (!code) {
      throw new AppError("缺少必填参数: code", 422, "VALIDATION_ERROR");
    }

    const result = await getSupplierByCode(code);

    if (!result) {
      throw new AppError(`未找到供应商: ${code}`, 404, "NOT_FOUND");
    }

    return NextResponse.json(result);
  }

  // List all suppliers with optional filters
  const result = await getSuppliersList({
    region: region || undefined,
    category: category || undefined,
    status: status || undefined,
    page,
    pageSize,
  });

  return NextResponse.json({
    suppliers: result.data,
    pagination: result.pagination,
  });
}));

// POST /api/suppliers - Create a new supplier
export const POST = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { code, name, contact, email, phone, region, category, leadTime, rating } = body;

  // Validate required fields
  if (!code || !name || !region || !category) {
    throw new AppError("缺少必填字段: code, name, region, category", 422, "VALIDATION_ERROR");
  }

  const data: CreateSupplierData = {
    code,
    name,
    contact,
    email,
    phone,
    region,
    category,
    leadTime,
    rating,
  };

  try {
    const supplier = await createSupplier(data);
    return NextResponse.json({ success: true, supplier });
  } catch (error) {
    if (error instanceof Error && error.message.includes("已存在")) {
      throw new AppError(error.message, 409, "CONFLICT");
    }
    throw error;
  }
}));

// PUT /api/suppliers - Update a supplier
export const PUT = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { id, ...fields } = body;

  if (!id) {
    throw new AppError("缺少必填字段: id", 422, "VALIDATION_ERROR");
  }

  const { deliveryScore, qualityScore, priceScore, communicationScore, comments } = fields;

  const ratingData: SupplierRatingData = {
    id,
    ...fields,
  };

  try {
    const supplier = await rateSupplier(ratingData);

    // Audit log for supplier rating if sub-scores were provided
    if (deliveryScore !== undefined || qualityScore !== undefined ||
        priceScore !== undefined || communicationScore !== undefined) {
      await createAuditLog({
        action: 'RATE',
        entity: 'supplier',
        entityId: id,
        details: { rating: fields.rating, deliveryScore, qualityScore, priceScore, communicationScore },
        request,
      });
    }

    return NextResponse.json({ success: true, supplier });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("未找到")) {
        throw new AppError(error.message, 404, "NOT_FOUND");
      }
      if (error.message.includes("无效") || error.message.includes("0-5") || error.message.includes("0-10")) {
        throw new AppError(error.message, 422, "VALIDATION_ERROR");
      }
    }
    throw error;
  }
}));
