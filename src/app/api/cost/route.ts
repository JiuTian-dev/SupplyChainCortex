import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withErrorHandler, apiError, paginate, AppError } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import { getExchangeRate } from '@/lib/exchange-rate';
import {
  computeCostBreakdown,
  computeMarginAnalysis,
  getCostOverview,
  simulateCostImpact,
  getCostList,
  getLandedCostDetail,
  getCostBenchmark,
  getCostOptimization,
  getCostTrend,
} from "@/lib/services/cost.service";

// GET /api/cost - 成本监控数据
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "list";
  const sku = searchParams.get("sku");
  const exchangeRateChange = parseFloat(searchParams.get("exchangeRateChange") || "0");
  const freightChange = parseFloat(searchParams.get("freightChange") || "0");
  const asOfDate = searchParams.get("asOfDate") || undefined;

  // Pagination parameters
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  // Filter parameters
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
      const result = await getCostList({
        minMargin,
        maxMargin,
        category,
        skus,
        sortBy,
        sortOrder,
        page,
        pageSize,
      });
      return NextResponse.json(result);
    }

    case "landed_cost": {
      if (!sku) {
        throw new AppError("缺少 sku 参数", 422, "VALIDATION_ERROR");
      }

      const result = await getLandedCostDetail({
        sku,
        minMargin,
        maxMargin,
        category,
        asOfDate,
      });

      if (!result) {
        // Determine specific error message
        const cost = await db.costRecord.findFirst({ where: { sku }, include: { product: true } });
        if (!cost) {
          throw new AppError(`未找到 SKU: ${sku}`, 404, "NOT_FOUND");
        }
        if (minMargin !== undefined && cost.grossMargin < minMargin) {
          throw new AppError(`SKU: ${sku} 毛利率 ${cost.grossMargin}% 低于最小值 ${minMargin}%`, 404, "NOT_FOUND");
        }
        if (maxMargin !== undefined && cost.grossMargin > maxMargin) {
          throw new AppError(`SKU: ${sku} 毛利率 ${cost.grossMargin}% 高于最大值 ${maxMargin}%`, 404, "NOT_FOUND");
        }
        if (category && cost.product?.category !== category) {
          throw new AppError(`SKU: ${sku} 品类不匹配`, 404, "NOT_FOUND");
        }
        throw new AppError(`未找到 SKU: ${sku}`, 404, "NOT_FOUND");
      }

      return NextResponse.json(result);
    }

    case "breakdown": {
      if (!sku) {
        throw new AppError("缺少 sku 参数", 422, "VALIDATION_ERROR");
      }
      const cost = await db.costRecord.findFirst({ where: { sku }, include: { product: true } });
      if (!cost) {
        throw new AppError(`未找到 SKU: ${sku}`, 404, "NOT_FOUND");
      }

      // Apply category filter
      if (category && cost.product?.category !== category) {
        throw new AppError(`SKU: ${sku} 品类不匹配`, 404, "NOT_FOUND");
      }

      // Use service for breakdown
      const breakdown = computeCostBreakdown(cost);

      return NextResponse.json({
        sku: cost.sku,
        productName: cost.productName,
        totalLanded: cost.totalLanded,
        breakdown,
        category: cost.product?.category,
      });
    }

    case "simulate": {
      const where: Record<string, unknown> = {};

      if (category) {
        where.product = { category };
      }

      // Margin range filter
      if (minMargin !== undefined || maxMargin !== undefined) {
        const marginFilter: Record<string, number> = {};
        if (minMargin !== undefined) marginFilter.gte = minMargin;
        if (maxMargin !== undefined) marginFilter.lte = maxMargin;
        where.grossMargin = marginFilter;
      }

      const costRecords = await db.costRecord.findMany({
        where,
        include: { product: true },
        take: 1000,
      });

      // Additional simulation parameters
      const rawMaterialChange = parseFloat(searchParams.get("rawMaterialChange") || "0");
      const tariffChange = parseFloat(searchParams.get("tariffChange") || "0");
      const laborChange = parseFloat(searchParams.get("laborChange") || "0");
      const platformFeeChange = parseFloat(searchParams.get("platformFeeChange") || "0");

      // Use service for simulation (now async with live FX rates)
      const results = await Promise.all(costRecords.map(async (cost) => {
        const simulated = await simulateCostImpact(cost, {
          exchangeRateChange,
          freightChange,
          rawMaterialChange,
          tariffChange,
          laborChange,
          platformFeeChange,
        });

        const newRawMaterial = cost.rawMaterial * (1 + rawMaterialChange / 100);
        const newLabor = cost.labor * (1 + laborChange / 100);
        const newLogistics = cost.logistics * (1 + freightChange / 100);
        const newTariff = cost.tariff * (1 + tariffChange / 100);
        const newPlatformFee = cost.platformFee * (1 + platformFeeChange / 100);

        return {
          product: cost.productName,
          sku: cost.sku,
          category: cost.product?.category,
          currentMargin: cost.grossMargin,
          simulatedMargin: simulated.simulatedMargin,
          marginChange: simulated.marginChange,
          currentTotalLanded: cost.totalLanded,
          simulatedTotalLanded: simulated.simulatedTotalLanded,
          totalLandedChange: simulated.totalLandedChange,
          costBreakdown: {
            current: {
              rawMaterial: cost.rawMaterial,
              labor: cost.labor,
              logistics: cost.logistics,
              tariff: cost.tariff,
              platformFee: cost.platformFee,
            },
            simulated: {
              rawMaterial: Math.round(newRawMaterial * 100) / 100,
              labor: Math.round(newLabor * 100) / 100,
              logistics: Math.round(newLogistics * 100) / 100,
              tariff: Math.round(newTariff * 100) / 100,
              platformFee: Math.round(newPlatformFee * 100) / 100,
            },
          },
        };
      }));

      // Sort by marginChange for summary calculations
      const sortedResults = [...results].sort((a, b) => a.marginChange - b.marginChange);

      // Reference exchange rate from service
      const currentUsdRate = getExchangeRate('USD')?.rate ?? 7.25;
      const referenceExchangeRate = asOfDate
        ? (() => {
            const dateNum = parseInt(asOfDate.replace(/-/g, ""), 10);
            const variation = ((dateNum % 100) - 50) * 0.001;
            return Math.round((currentUsdRate + variation) * 1000) / 1000;
          })()
        : currentUsdRate;

      return NextResponse.json({
        parameters: {
          exchangeRateChange,
          freightChange,
          rawMaterialChange,
          tariffChange,
          laborChange,
          platformFeeChange,
          ...(asOfDate ? { asOfDate, referenceExchangeRate: Math.round(referenceExchangeRate * 1000) / 1000 } : {}),
        },
        results,
        summary: {
          avgMarginChange: results.length > 0 ? Math.round(results.reduce((sum, r) => sum + r.marginChange, 0) / results.length * 10) / 10 : 0,
          worstAffected: sortedResults.length > 0 ? sortedResults[0].product : "",
          worstAffectedChange: sortedResults.length > 0 ? sortedResults[0].marginChange : 0,
          bestPositioned: sortedResults.length > 0 ? sortedResults[sortedResults.length - 1].product : "",
          bestPositionedChange: sortedResults.length > 0 ? sortedResults[sortedResults.length - 1].marginChange : 0,
          productsAtRisk: results.filter(r => r.simulatedMargin < 48).length,
          avgTotalLandedChange: results.length > 0 ? Math.round(results.reduce((sum, r) => sum + r.totalLandedChange, 0) / results.length * 100) / 100 : 0,
        },
        filters: { minMargin: minMargin ?? null, maxMargin: maxMargin ?? null, category: category || null },
      });
    }

    case "overview": {
      const overview = await getCostOverview(category);
      const marginAnalysis = computeMarginAnalysis(
        await db.costRecord.findMany({
          where: category ? { product: { category } } : {},
          take: 1000,
        })
      );
      return NextResponse.json({ overview, marginAnalysis });
    }

    // ==================== Cost optimization ====================
    case "optimization": {
      const result = await getCostOptimization(category);
      return NextResponse.json(result);
    }

    // ==================== Cost trend analysis ====================
    case "trend": {
      const months = parseInt(searchParams.get("months") || "6");
      const result = await getCostTrend(category, months);
      return NextResponse.json(result);
    }

    // ==================== Cost benchmark comparison ====================
    case "benchmark": {
      const result = await getCostBenchmark(category);
      return NextResponse.json(result);
    }

    default:
      throw new AppError(`未知操作: ${action}`, 400, "UNKNOWN_ACTION");
  }
}));
