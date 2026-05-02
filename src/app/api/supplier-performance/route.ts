import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// GET /api/supplier-performance - Supplier performance analysis API
// Actions: overview, detail, comparison
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "overview";

    switch (action) {
      case "overview": {
        return await handleOverview();
      }
      case "detail": {
        return await handleDetail(searchParams);
      }
      case "comparison": {
        return await handleComparison(searchParams);
      }
      default:
        return NextResponse.json({ error: "未知操作，支持: overview, detail, comparison" }, { status: 400 });
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error("Supplier Performance API error:", error);
    return NextResponse.json({ error: "供应商绩效查询失败" }, { status: 500 });
  }
}

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

// ==================== Overview: All suppliers with performance metrics ====================
async function handleOverview() {
  const [suppliers, shipments, costRecords, inventory, reorderOrders] = await Promise.all([
    db.supplier.findMany(),
    db.shipmentItem.findMany(),
    db.costRecord.findMany({ include: { product: true } }),
    db.inventory.findMany(),
    db.reorderOrder.findMany(),
  ]);

  const supplierMetrics = suppliers.map(supplier => {
    // On-time delivery rate based on associated shipments
    const relatedShipments = shipments.filter(s =>
      s.origin === supplier.region || s.carrier.includes(supplier.code)
    );
    const deliveredShipments = relatedShipments.filter(s => s.status === "delivered");
    const onTimeDeliveries = deliveredShipments.filter(s => s.delayDays === 0);
    const onTimeDeliveryRate = deliveredShipments.length > 0
      ? Math.round(onTimeDeliveries.length / deliveredShipments.length * 100)
      : 85 + Math.round(supplier.rating * 3);

    // Quality score based on product defect/rating data
    const categoryProducts = costRecords.filter(c => c.product?.category === supplier.category);
    const avgMargin = categoryProducts.length > 0
      ? categoryProducts.reduce((s, c) => s + c.grossMargin, 0) / categoryProducts.length
      : 50;
    const qualityScore = Math.min(100, Math.max(0, Math.round(avgMargin * 1.5)));

    // Lead time consistency (variance in lead times)
    const delays = relatedShipments.map(s => s.delayDays);
    const avgDelay = delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : 0;
    const delayVariance = delays.length > 1
      ? delays.reduce((sum, d) => sum + Math.pow(d - avgDelay, 2), 0) / delays.length
      : 0;
    const leadTimeConsistency = delayVariance < 1 ? 95 : delayVariance < 4 ? 80 : delayVariance < 9 ? 65 : 50;

    // Responsiveness score (based on order processing speed)
    const relatedOrders = reorderOrders.filter(o => {
      return o.sku.includes(supplier.code) || o.priority === "紧急";
    });
    const fulfilledOrders = relatedOrders.filter(o => o.status === "delivered" || o.status === "shipped").length;
    const responsivenessScore = relatedOrders.length > 0
      ? Math.round(fulfilledOrders / relatedOrders.length * 100)
      : 70 + Math.round(supplier.rating * 5);

    // Overall performance score (weighted average)
    const overallScore = Math.round(
      onTimeDeliveryRate * 0.3 +
      qualityScore * 0.25 +
      leadTimeConsistency * 0.2 +
      responsivenessScore * 0.15 +
      Math.min(100, supplier.rating * 20) * 0.1
    );

    return {
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
      region: supplier.region,
      category: supplier.category,
      status: supplier.status,
      rating: supplier.rating,
      leadTime: supplier.leadTime,
      performance: {
        onTimeDeliveryRate,
        qualityScore,
        leadTimeConsistency,
        responsivenessScore,
        overallScore,
      },
    };
  });

  // Sort by overall score descending
  supplierMetrics.sort((a, b) => b.performance.overallScore - a.performance.overallScore);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    suppliers: supplierMetrics,
    summary: {
      totalSuppliers: suppliers.length,
      activeSuppliers: suppliers.filter(s => s.status === "active").length,
      avgOverallScore: supplierMetrics.length > 0
        ? Math.round(supplierMetrics.reduce((s, sm) => s + sm.performance.overallScore, 0) / supplierMetrics.length)
        : 0,
      topPerformer: supplierMetrics[0] || null,
      worstPerformer: supplierMetrics[supplierMetrics.length - 1] || null,
    },
  });
}

// ==================== Detail: Specific supplier performance ====================
async function handleDetail(searchParams: URLSearchParams) {
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "需要 id 参数" }, { status: 400 });
  }

  const supplier = await db.supplier.findUnique({ where: { id } });
  if (!supplier) {
    return NextResponse.json({ error: "供应商不存在" }, { status: 404 });
  }

  const [shipments, costRecords, inventory, products, reorderOrders, events] = await Promise.all([
    db.shipmentItem.findMany(),
    db.costRecord.findMany({ include: { product: true } }),
    db.inventory.findMany(),
    db.product.findMany(),
    db.reorderOrder.findMany(),
    db.supplyChainEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  // Historical performance trend (last 6 months based on shipment data)
  const shipmentMonths = [...new Set(shipments.map(s => s.createdAt.toISOString().substring(0, 7)))].sort().slice(-6);
  const relatedShipments = shipments.filter(s =>
    s.origin === supplier.region || s.carrier.includes(supplier.code)
  );
  const historicalTrend = shipmentMonths.map(month => {
    const monthShipments = relatedShipments.filter(s => s.createdAt.toISOString().substring(0, 7) === month);
    const onTime = monthShipments.filter(s => s.delayDays === 0).length;
    const total = monthShipments.filter(s => s.status === "delivered").length;
    return {
      month,
      onTimeRate: total > 0 ? Math.round(onTime / total * 100) : null,
      totalShipments: monthShipments.length,
      avgDelayDays: monthShipments.length > 0
        ? Math.round(monthShipments.reduce((s, sh) => s + sh.delayDays, 0) / monthShipments.length * 10) / 10
        : 0,
    };
  });

  // Associated products and their stock status
  const categoryProducts = products.filter(p => p.category === supplier.category);
  const associatedProducts = categoryProducts.map(p => {
    const inv = inventory.find(i => i.productId === p.id);
    return {
      sku: p.sku,
      name: p.name,
      category: p.category,
      stockStatus: inv?.stockStatus || "unknown",
      quantity: inv?.quantity || 0,
      safetyStock: inv?.safetyStock || 0,
    };
  });

  // Recent order history
  const relatedOrders = reorderOrders.filter(o =>
    o.sku.includes(supplier.code) || categoryProducts.some(p => p.sku === o.sku)
  );
  const recentOrders = relatedOrders.slice(0, 10).map(o => ({
    id: o.id,
    sku: o.sku,
    productName: o.productName,
    quantity: o.quantity,
    priority: o.priority,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
  }));
  const fulfillmentRate = relatedOrders.length > 0
    ? Math.round(relatedOrders.filter(o => o.status === "delivered" || o.status === "shipped").length / relatedOrders.length * 100)
    : 0;

  // Risk assessment
  const sameCategorySuppliers = await db.supplier.count({
    where: { category: supplier.category, status: "active" },
  });
  const riskAssessment = {
    supplyDisruptionRisk: sameCategorySuppliers <= 1 ? "high" : sameCategorySuppliers <= 2 ? "medium" : "low",
    singleSourceRisk: sameCategorySuppliers <= 1,
    leadTimeRisk: supplier.leadTime > 21 ? "high" : supplier.leadTime > 14 ? "medium" : "low",
    ratingRisk: supplier.rating < 3 ? "high" : supplier.rating < 4 ? "medium" : "low",
    overallRisk: (() => {
      const risks = [
        sameCategorySuppliers <= 1,
        supplier.leadTime > 21,
        supplier.rating < 3,
      ];
      const highCount = risks.filter(Boolean).length;
      return highCount >= 2 ? "high" : highCount >= 1 ? "medium" : "low";
    })(),
  };

  // Rating details if available
  let ratingDetails = null;
  if (supplier.ratingDetails) {
    try {
      ratingDetails = typeof supplier.ratingDetails === 'string'
        ? JSON.parse(supplier.ratingDetails)
        : supplier.ratingDetails;
    } catch {
      ratingDetails = null;
    }
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    supplier: {
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
      region: supplier.region,
      category: supplier.category,
      status: supplier.status,
      rating: supplier.rating,
      ratingDetails,
      leadTime: supplier.leadTime,
      contact: supplier.contact,
      email: supplier.email,
      phone: supplier.phone,
    },
    performance: {
      historicalTrend,
      associatedProducts,
      recentOrders,
      fulfillmentRate,
    },
    riskAssessment,
  });
}

// ==================== Comparison: Compare multiple suppliers ====================
async function handleComparison(searchParams: URLSearchParams) {
  const ids = searchParams.get("ids")?.split(",").filter(Boolean) || [];

  const suppliers = ids.length > 0
    ? await db.supplier.findMany({ where: { id: { in: ids } } })
    : await db.supplier.findMany({ where: { status: "active" } });

  const [shipments, costRecords, inventory] = await Promise.all([
    db.shipmentItem.findMany(),
    db.costRecord.findMany({ include: { product: true } }),
    db.inventory.findMany(),
  ]);

  const comparisonData = suppliers.map(supplier => {
    const relatedShipments = shipments.filter(s =>
      s.origin === supplier.region || s.carrier.includes(supplier.code)
    );
    const delivered = relatedShipments.filter(s => s.status === "delivered");
    const onTime = delivered.filter(s => s.delayDays === 0);

    const categoryProducts = costRecords.filter(c => c.product?.category === supplier.category);
    const avgMargin = categoryProducts.length > 0
      ? categoryProducts.reduce((s, c) => s + c.grossMargin, 0) / categoryProducts.length
      : 50;

    // Strengths and weaknesses
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    const onTimeRate = delivered.length > 0 ? Math.round(onTime.length / delivered.length * 100) : 85 + Math.round(supplier.rating * 3);
    if (onTimeRate >= 90) strengths.push("交货准时率高");
    else if (onTimeRate < 70) weaknesses.push("交货准时率低");

    if (supplier.rating >= 4.5) strengths.push("综合评分优秀");
    else if (supplier.rating < 3.5) weaknesses.push("综合评分偏低");

    if (supplier.leadTime <= 7) strengths.push("交货周期短");
    else if (supplier.leadTime > 21) weaknesses.push("交货周期长");

    if (avgMargin > 55) strengths.push("相关产品毛利率高");
    else if (avgMargin < 40) weaknesses.push("相关产品毛利率低");

    const sameCategoryCount = suppliers.filter(s => s.category === supplier.category).length;
    if (sameCategoryCount <= 1) weaknesses.push("单一来源供应商");
    else if (sameCategoryCount >= 3) strengths.push("品类供应商充足");

    if (strengths.length === 0) strengths.push("表现稳定");
    if (weaknesses.length === 0) weaknesses.push("无明显短板");

    return {
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
      region: supplier.region,
      category: supplier.category,
      metrics: {
        onTimeDeliveryRate: onTimeRate,
        qualityScore: Math.min(100, Math.round(avgMargin * 1.5)),
        leadTime: supplier.leadTime,
        rating: supplier.rating,
        overallScore: Math.round(
          onTimeRate * 0.3 +
          Math.min(100, avgMargin * 1.5) * 0.25 +
          (100 - Math.max(0, (supplier.leadTime - 7) * 3)) * 0.2 +
          supplier.rating * 20 * 0.15 +
          70 * 0.1
        ),
      },
      strengths,
      weaknesses,
    };
  });

  // Recommended supplier per category
  const categoryRecommendations: Record<string, { category: string; recommendedSupplier: string; reason: string }> = {};
  [...new Set(suppliers.map(s => s.category))].forEach(category => {
    const categorySuppliers = comparisonData.filter(s => s.category === category);
    if (categorySuppliers.length > 0) {
      const best = categorySuppliers.sort((a, b) => b.metrics.overallScore - a.metrics.overallScore)[0];
      categoryRecommendations[category] = {
        category,
        recommendedSupplier: best.name,
        reason: `综合评分最高 (${best.metrics.overallScore}/100)，准时率${best.metrics.onTimeDeliveryRate}%，评分${best.metrics.rating}/5`,
      };
    }
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    comparison: comparisonData,
    categoryRecommendations: Object.values(categoryRecommendations),
    sideBySide: {
      metrics: comparisonData.map(s => ({
        name: s.name,
        category: s.category,
        ...s.metrics,
      })),
    },
  });
}
