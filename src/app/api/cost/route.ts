import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, AppError } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import {
  getCostOverviewWithMargin,
  getCostList,
  getLandedCostOrThrow,
  getCostBreakdownForSku,
  simulateCosts,
  getCostOptimization,
  getCostTrend,
  getCostBenchmark,
} from "@/lib/services/cost.service";

// GET /api/cost - 成本监控数据
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "list";
  const sku = searchParams.get("sku");
  const exchangeRateChange = parseFloat(searchParams.get("exchangeRateChange") || "0");
  const freightChange = parseFloat(searchParams.get("freightChange") || "0");
  const asOfDate = searchParams.get("asOfDate") || undefined;

  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");
  const minMargin = searchParams.get("minMargin") ? parseFloat(searchParams.get("minMargin")!) : undefined;
  const maxMargin = searchParams.get("maxMargin") ? parseFloat(searchParams.get("maxMargin")!) : undefined;
  const category = searchParams.get("category") || undefined;
  const skusParam = searchParams.get("skus");
  const skus = skusParam ? skusParam.split(',').map(s => s.trim()).filter(Boolean) : undefined;
  const sortBy = searchParams.get("sortBy") || undefined;
  const sortOrder = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";

  // Validate asOfDate format if provided
  if (asOfDate) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(asOfDate)) {
      throw new AppError("asOfDate 格式无效，需要 YYYY-MM-DD", 400, "VALIDATION_ERROR");
    }
  }

  // Validate margin range
  if (minMargin !== undefined && isNaN(minMargin)) {
    throw new AppError("minMargin 格式无效", 400, "VALIDATION_ERROR");
  }
  if (maxMargin !== undefined && isNaN(maxMargin)) {
    throw new AppError("maxMargin 格式无效", 400, "VALIDATION_ERROR");
  }
  if (minMargin !== undefined && maxMargin !== undefined && minMargin > maxMargin) {
    throw new AppError("minMargin 不能大于 maxMargin", 400, "VALIDATION_ERROR");
  }

  switch (action) {
    case "list": {
      const result = await getCostList({ minMargin, maxMargin, category, skus, sortBy, sortOrder, page, pageSize });
      return NextResponse.json(result);
    }
    case "landed_cost": {
      if (!sku) {
        throw new AppError("缺少 sku 参数", 422, "VALIDATION_ERROR");
      }
      const result = await getLandedCostOrThrow({ sku, minMargin, maxMargin, category, asOfDate });
      return NextResponse.json(result);
    }
    case "breakdown": {
      if (!sku) {
        throw new AppError("缺少 sku 参数", 422, "VALIDATION_ERROR");
      }
      const result = await getCostBreakdownForSku(sku, category);
      return NextResponse.json(result);
    }
    case "simulate": {
      const rawMaterialChange = parseFloat(searchParams.get("rawMaterialChange") || "0");
      const tariffChange = parseFloat(searchParams.get("tariffChange") || "0");
      const laborChange = parseFloat(searchParams.get("laborChange") || "0");
      const platformFeeChange = parseFloat(searchParams.get("platformFeeChange") || "0");
      const result = await simulateCosts({
        category, minMargin, maxMargin,
        exchangeRateChange, freightChange, rawMaterialChange,
        tariffChange, laborChange, platformFeeChange, asOfDate,
      });
      return NextResponse.json(result);
    }
    case "overview": {
      const result = await getCostOverviewWithMargin(category);
      return NextResponse.json(result);
    }
    case "optimization": {
      const result = await getCostOptimization(category);
      return NextResponse.json(result);
    }
    case "trend": {
      const months = parseInt(searchParams.get("months") || "6");
      const result = await getCostTrend(category, months);
      return NextResponse.json(result);
    }
    case "benchmark": {
      const result = await getCostBenchmark(category);
      return NextResponse.json(result);
    }
    default:
      throw new AppError(`未知操作: ${action}`, 400, "UNKNOWN_ACTION");
  }
}));
