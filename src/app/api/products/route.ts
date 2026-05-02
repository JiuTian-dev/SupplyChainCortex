import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, AppError } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import {
  getProductsList,
  searchProducts,
  getProductDetail,
  createProduct,
  updateProduct,
  deleteProduct,
  safeDecode,
} from "@/lib/services/products.service";
import type { CreateProductData, UpdateProductData } from "@/lib/services/products.service";

// GET /api/products - List all products with optional filters and pagination
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  // Fix: decode category to handle URL-encoded values (e.g. %E5%8E%A8...)
  const category = safeDecode(searchParams.get("category"));
  const abcClass = searchParams.get("abcClass");
  const fsnClass = searchParams.get("fsnClass");
  const search = searchParams.get("search");
  const sku = searchParams.get("sku");
  const action = searchParams.get("action") || "list";
  const id = searchParams.get("id");
  const q = searchParams.get("q");

  // Pagination parameters
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  // ==================== Action: search ====================
  if (action === "search") {
    const query = q || search || "";
    if (!query.trim()) {
      throw new AppError("搜索关键词不能为空，请提供 q 参数", 400, "VALIDATION_ERROR");
    }

    const result = await searchProducts({ query, page, pageSize });
    return NextResponse.json(result);
  }

  // ==================== Action: detail ====================
  if (action === "detail") {
    if (!id && !sku) {
      throw new AppError("请提供 id 或 sku 参数查询产品详情", 400, "VALIDATION_ERROR");
    }

    const by = id ? "id" : "sku";
    const result = await getProductDetail(id || sku || "", by);

    if (!result) {
      throw new AppError(`未找到产品: ${id || sku}`, 404, "NOT_FOUND");
    }

    return NextResponse.json(result);
  }

  // ==================== Action: list (default) ====================
  const result = await getProductsList({
    category: category || undefined,
    abcClass: abcClass || undefined,
    fsnClass: fsnClass || undefined,
    sku: sku || undefined,
    search: search || undefined,
    page,
    pageSize,
  });

  return NextResponse.json(result);
}));

// POST /api/products - Create a new product
export const POST = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { sku, name, category, subCategory, unitCost, sellingPrice, weight, origin, abcClass, fsnClass } = body;

  // Validate required fields
  if (!sku || !name || !category || unitCost === undefined || sellingPrice === undefined || weight === undefined) {
    throw new AppError("缺少必填字段: sku, name, category, unitCost, sellingPrice, weight", 422, "VALIDATION_ERROR");
  }

  const data: CreateProductData = {
    sku,
    name,
    category,
    subCategory,
    unitCost: Number(unitCost),
    sellingPrice: Number(sellingPrice),
    weight: Number(weight),
    origin,
    abcClass,
    fsnClass,
  };

  try {
    const { product } = await createProduct(data);
    return NextResponse.json({ success: true, product }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("已存在")) {
        throw new AppError(error.message, 409, "CONFLICT");
      }
      if (error.message.includes("不能为负数")) {
        throw new AppError(error.message, 422, "VALIDATION_ERROR");
      }
    }
    throw error;
  }
}));

// PUT /api/products - Update a product
export const PUT = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { id, ...fields } = body;

  if (!id) {
    throw new AppError("缺少必填字段: id", 422, "VALIDATION_ERROR");
  }

  const data: UpdateProductData = { id, ...fields };

  try {
    const { product } = await updateProduct(data);
    return NextResponse.json({ success: true, product });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("未找到")) {
        throw new AppError(error.message, 404, "NOT_FOUND");
      }
      if (error.message.includes("不能为负数") || error.message.includes("必须为")) {
        throw new AppError(error.message, 422, "VALIDATION_ERROR");
      }
    }
    throw error;
  }
}));

// DELETE /api/products - Delete a product
export const DELETE = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    throw new AppError("缺少必填参数: id", 422, "VALIDATION_ERROR");
  }

  try {
    const result = await deleteProduct(id);
    return NextResponse.json({ success: true, message: result.message });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("未找到")) {
        throw new AppError(error.message, 404, "NOT_FOUND");
      }
      if (error.message.includes("关联")) {
        throw new AppError(error.message, 409, "CONFLICT");
      }
    }
    throw error;
  }
}));
