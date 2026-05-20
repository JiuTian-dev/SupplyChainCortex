import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, AppError } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import { db } from "@/lib/db";
import {
  computeSalesSummary,
  detectAnomalies,
  generateSalesForecast,
  getSalesOverview,
  getSalesSummaryForSku,
  getDailySales,
  getSalesForecastForSku,
} from "@/lib/services/sales.service";

// GET /api/sales - 销售分析数据
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "overview";
  const sku = searchParams.get("sku");
  const days = parseInt(searchParams.get("days") || "30");
  const threshold = parseFloat(searchParams.get("threshold") || "2.0");
  const horizon = parseInt(searchParams.get("horizon") || "14");

  // Date range parameters
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;

  // Filter parameters
  const platform = searchParams.get("platform") || undefined;
  const category = searchParams.get("category") || undefined;

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (startDate && !dateRegex.test(startDate)) {
    throw new AppError("startDate 格式无效，需要 YYYY-MM-DD", 400, "VALIDATION_ERROR");
  }
  if (endDate && !dateRegex.test(endDate)) {
    throw new AppError("endDate 格式无效，需要 YYYY-MM-DD", 400, "VALIDATION_ERROR");
  }

  // Validate platform if provided
  const validPlatforms = ["Amazon", "Shopify", "Walmart", "eBay"];
  if (platform && !validPlatforms.includes(platform)) {
    throw new AppError(`无效的平台: ${platform}，支持: ${validPlatforms.join("/")}`, 400, "VALIDATION_ERROR");
  }

  // Pagination parameters
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  switch (action) {
    case "overview": {
      const result = await getSalesOverview({
        days,
        startDate,
        endDate,
        platform,
        category,
        page,
        pageSize,
      });
      return NextResponse.json(result);
    }

    case "summary": {
      if (!sku) {
        throw new AppError("缺少 sku 参数", 422, "VALIDATION_ERROR");
      }

      const result = await getSalesSummaryForSku({
        sku,
        days,
        startDate,
        endDate,
        platform,
      });

      if (!result) {
        throw new AppError(`未找到 SKU: ${sku}`, 404, "NOT_FOUND");
      }

      return NextResponse.json(result);
    }

    case "daily": {
      const result = await getDailySales({
        days,
        startDate,
        endDate,
        platform,
      });
      return NextResponse.json(result);
    }

    case "anomaly": {
      if (!sku) {
        // Detect anomalies for all products using service function
        const [products, allSalesRecords] = await Promise.all([
          db.product.findMany({ where: category ? { category } : {}, take: 1000 }),
          db.salesRecord.findMany({ take: 5000 }),
        ]);

        // Apply platform filter
        let filteredSales = allSalesRecords;
        if (platform) {
          filteredSales = filteredSales.filter(r => r.platform === platform);
        }

        // Apply date range filter
        const startDt = startDate ? new Date(startDate) : undefined;
        const endDt = endDate ? new Date(endDate) : undefined;
        if (startDt) {
          filteredSales = filteredSales.filter(r => r.date >= startDt);
        }
        if (endDt) {
          filteredSales = filteredSales.filter(r => r.date <= endDt);
        }

        // Apply category filter
        const productIds = new Set(products.map(p => p.id));
        if (category) {
          filteredSales = filteredSales.filter(r => productIds.has(r.productId));
        }

        // Flatten for detectAnomalies
        const productSales = filteredSales.map(r => ({
          sku: products.find(p => p.id === r.productId)?.sku || '',
          productName: products.find(p => p.id === r.productId)?.name || '',
          category: products.find(p => p.id === r.productId)?.category || '',
          quantity: r.quantity,
        }));

        const anomalies = detectAnomalies(productSales, threshold);

        return NextResponse.json({
          threshold,
          anomalyCount: anomalies.length,
          anomalies,
          filters: { platform: platform || null, category: category || null },
        });
      }

      // Single SKU anomaly
      const product = await db.product.findUnique({ where: { sku } });
      if (!product) {
        throw new AppError(`未找到 SKU: ${sku}`, 404, "NOT_FOUND");
      }

      // Build date filter for Prisma query
      const dateFilter: Record<string, unknown> = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate) dateFilter.lte = endDate;

      const where: Record<string, unknown> = { productId: product.id };
      if (startDate || endDate) {
        where.date = dateFilter;
      }
      if (platform) {
        where.platform = platform;
      }

      const salesRecords = await db.salesRecord.findMany({
        where,
        orderBy: { date: "desc" },
        take: 5000,
      });

      if (salesRecords.length < 7) {
        return NextResponse.json({
          sku: product.sku,
          productName: product.name,
          isAnomaly: false,
          anomalyType: "none" as const,
          zScore: 0,
          recentAvg: 0,
          historicalAvg: 0,
        });
      }

      // Use detectAnomalies for single product
      const productSales = salesRecords.map(r => ({
        sku: product.sku,
        productName: product.name,
        category: product.category,
        quantity: r.quantity,
      }));
      const anomalies = detectAnomalies(productSales, threshold);
      const anomaly = anomalies.length > 0 ? anomalies[0] : {
        sku: product.sku,
        productName: product.name,
        category: product.category,
        isAnomaly: false,
        anomalyType: "none" as const,
        zScore: 0,
        recentAvg: 0,
        historicalAvg: 0,
      };

      return NextResponse.json(anomaly);
    }

    case "seasonal_index": {
      // Fetch all sales records
      const [products, allSales] = await Promise.all([
        db.product.findMany({ take: 1000 }),
        db.salesRecord.findMany({ take: 5000 }),
      ]);

      // Apply filters
      let filteredSales = allSales;
      if (platform) filteredSales = filteredSales.filter(r => r.platform === platform);
      if (category) {
        const catProductIds = new Set(products.filter(p => p.category === category).map(p => p.id));
        filteredSales = filteredSales.filter(r => catProductIds.has(r.productId));
      }

      if (filteredSales.length < 30) {
        return NextResponse.json({
          indices: [],
          rawMonthly: [],
          trend: [],
          summary: { peakMonth: null, troughMonth: null, seasonalityStrength: 0, dataPoints: filteredSales.length, message: '数据不足，至少需要30条销售记录' },
        });
      }

      // Group revenue by month (1-12) across all years
      const monthlyRevenue: Record<number, { total: number; count: number }> = {};
      for (let m = 1; m <= 12; m++) {
        monthlyRevenue[m] = { total: 0, count: 0 };
      }

      filteredSales.forEach(r => {
        const month = r.date.getMonth() + 1;
        if (month >= 1 && month <= 12) {
          monthlyRevenue[month].total += r.revenue;
          monthlyRevenue[month].count += 1;
        }
      });

      // Calculate average revenue per month
      const monthlyAverages: Record<number, number> = {};
      let totalAvg = 0;
      let monthsWithData = 0;
      for (let m = 1; m <= 12; m++) {
        if (monthlyRevenue[m].count > 0) {
          monthlyAverages[m] = monthlyRevenue[m].total / monthlyRevenue[m].count;
          totalAvg += monthlyAverages[m];
          monthsWithData++;
        } else {
          monthlyAverages[m] = 0;
        }
      }

      const overallAvg = monthsWithData > 0 ? totalAvg / monthsWithData : 1;

      // Calculate seasonal indices (ratio-to-moving-average)
      const rawIndices: Record<number, number> = {};
      for (let m = 1; m <= 12; m++) {
        rawIndices[m] = overallAvg > 0 ? monthlyAverages[m] / overallAvg : 1;
      }

      // Normalize so indices sum to 12
      const indexSum = Object.values(rawIndices).reduce((s, v) => s + v, 0);
      const normalizationFactor = indexSum > 0 ? 12 / indexSum : 1;
      const normalizedIndices: Record<number, number> = {};
      for (let m = 1; m <= 12; m++) {
        normalizedIndices[m] = Math.round(rawIndices[m] * normalizationFactor * 1000) / 1000;
      }

      // Build response arrays
      const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
      const indices = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        monthName: monthNames[i],
        index: normalizedIndices[i + 1],
        averageRevenue: Math.round(monthlyAverages[i + 1]),
        classification: normalizedIndices[i + 1] > 1.1 ? '旺季' as const
          : normalizedIndices[i + 1] < 0.9 ? '淡季' as const
          : '平季' as const,
        suggestedAction: normalizedIndices[i + 1] > 1.1 ? '增加库存和营销投入'
          : normalizedIndices[i + 1] < 0.9 ? '减少库存，优化成本'
          : '维持正常运营',
      }));

      // Raw monthly data for chart
      const rawMonthly = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        monthName: monthNames[i],
        revenue: Math.round(monthlyRevenue[i + 1].total),
        recordCount: monthlyRevenue[i + 1].count,
      }));

      // Trend: monthly revenue by year-month for trend lines
      const yearMonthRevenue: Record<string, number> = {};
      filteredSales.forEach(r => {
        const ym = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, '0')}`;
        yearMonthRevenue[ym] = (yearMonthRevenue[ym] || 0) + r.revenue;
      });
      const trend = Object.entries(yearMonthRevenue)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ym, revenue]) => ({ yearMonth: ym, revenue: Math.round(revenue) }));

      // Summary
      const peakMonth = indices.reduce((max, item) => item.index > max.index ? item : max, indices[0]);
      const troughMonth = indices.reduce((min, item) => item.index < min.index ? item : min, indices[0]);
      const maxIndex = Math.max(...Object.values(normalizedIndices));
      const minIndex = Math.min(...Object.values(normalizedIndices));
      const seasonalityStrength = Math.round(((maxIndex - minIndex) / (maxIndex + minIndex || 1)) * 1000) / 10;

      return NextResponse.json({
        indices,
        rawMonthly,
        trend,
        summary: {
          peakMonth: { month: peakMonth.month, monthName: peakMonth.monthName, index: peakMonth.index },
          troughMonth: { month: troughMonth.month, monthName: troughMonth.monthName, index: troughMonth.index },
          seasonalityStrength,
          dataPoints: filteredSales.length,
          overallAverageRevenue: Math.round(overallAvg),
        },
      });
    }

    case "forecast": {
      // Parse alpha parameter for exponential smoothing
      const alpha = parseFloat(searchParams.get("alpha") || "0.3");

      // If SKU is provided, return single-product forecast
      if (sku) {
        const result = await getSalesForecastForSku({
          sku,
          horizon,
          platform,
          alpha,
        });

        if (!result) {
          throw new AppError(`未找到 SKU: ${sku}`, 404, "NOT_FOUND");
        }

        if ('insufficientData' in result) {
          return NextResponse.json(result);
        }

        return NextResponse.json(result);
      }

      // === Overall forecast (no SKU) - use service function ===
      try {
        const result = await generateSalesForecast(horizon, category);
        return NextResponse.json(result);
      } catch (error) {
        if (error instanceof Error && error.message.includes("数据不足")) {
          throw new AppError(error.message, 400, "INSUFFICIENT_DATA");
        }
        throw error;
      }
    }

    default:
      throw new AppError(`未知操作: ${action}`, 400, "UNKNOWN_ACTION");
  }
}));
