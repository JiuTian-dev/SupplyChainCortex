import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { withErrorHandler } from "@/lib/api-utils";
import { CACHE_TAGS, CACHE_TTL } from "@/lib/cache";
import { computeSupplyChainScore } from "@/lib/queries/score.queries";
import { db } from "@/lib/db";

// ─── Next.js unstable_cache for score computation ─────────────────────────────

const cachedScore = unstable_cache(
  (detailed: boolean) => computeSupplyChainScore(detailed),
  ['supply-chain-score'],
  { revalidate: CACHE_TTL.SHORT, tags: [CACHE_TAGS.SCORE] }
);

// Weather condition mapping based on overall score
function getWeatherCondition(score: number) {
  if (score >= 80) return { condition: "晴朗", icon: "☀️", key: "sunny" };
  if (score >= 60) return { condition: "多云", icon: "⛅", key: "cloudy" };
  if (score >= 40) return { condition: "阴雨", icon: "🌧️", key: "rainy" };
  if (score >= 20) return { condition: "暴风雨", icon: "⛈️", key: "stormy" };
  return { condition: "飓风", icon: "🌪️", key: "hurricane" };
}

// Deterministic hash for seeded pseudo-random (replaces Math.random)
function deterministicOffset(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  // Map to [-4, +4) range (same distribution as (Math.random() - 0.5) * 8)
  return ((Math.abs(hash) % 800) / 100) - 4;
}

// Generate 5-day forecast based on trend data (deterministic, no Math.random)
function generateForecast(score: number, subScores: Record<string, { score: number }>) {
  const days = ["明天", "后天", "周三", "周四", "周五"];
  const trend = subScores.sales.score > 60 ? 1 : -1;
  const today = new Date().toISOString().slice(0, 10);
  return days.map((day, i) => {
    const offset = deterministicOffset(`forecast-${today}-${i}`);
    const projectedScore = Math.max(0, Math.min(100, score + trend * (i + 1) * 3 + offset));
    const weather = getWeatherCondition(Math.round(projectedScore));
    const tempHigh = Math.round((projectedScore / 100) * 45);
    const tempLow = Math.round(tempHigh * 0.6);
    return { day, condition: weather.condition, icon: weather.icon, high: tempHigh, low: tempLow };
  });
}

// Generate alerts based on sub-scores
function generateAlerts(subScores: Record<string, { score: number; label: string }>) {
  const alerts: { text: string; severity: "info" | "warning" | "critical" }[] = [];
  if (subScores.inventory.score < 50) alerts.push({ text: `库存评分仅 ${subScores.inventory.score}，多项产品低于安全库存`, severity: "critical" });
  if (subScores.cost.score < 50) alerts.push({ text: `成本评分 ${subScores.cost.score}，毛利率偏低需关注`, severity: "warning" });
  if (subScores.logistics.score < 50) alerts.push({ text: `物流评分 ${subScores.logistics.score}，存在延误风险`, severity: "warning" });
  if (subScores.risk.score < 40) alerts.push({ text: `风险评分 ${subScores.risk.score}，供应链脆弱性高`, severity: "critical" });
  if (subScores.sales.score < 50) alerts.push({ text: `销售评分 ${subScores.sales.score}，增长乏力`, severity: "warning" });
  if (alerts.length === 0) alerts.push({ text: "供应链运行平稳，暂无预警", severity: "info" });
  return alerts;
}

// Generate grade from score
function getGrade(score: number): string {
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
}

// Deterministic pseudo-random offset based on day offset (no Math.random)
function historyOffset(dayOffset: number, dimension: string): number {
  const seed = `history-${dimension}-${dayOffset}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  // Map to [-6, +6) range
  return ((Math.abs(hash) % 1200) / 100) - 6;
}

// Generate 30-day historical score snapshots (deterministic, no Math.random)
function generateHistory(result: {
  overallScore: number;
  subScores: {
    inventory: { score: number };
    cost: { score: number };
    logistics: { score: number };
    sales: { score: number };
    risk: { score: number };
  };
}) {
  const today = new Date();
  const history: Array<{ date: string; overallScore: number; grade: string; inventoryScore: number; costScore: number; logisticsScore: number; salesScore: number; riskScore: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);

    // Slight trend: scores were slightly lower in the past, with a gentle upward slope
    const trendBias = (30 - i) * 0.3; // +0.3 per day going forward

    const inventoryScore = Math.max(0, Math.min(100, Math.round(result.subScores.inventory.score - trendBias + historyOffset(i, 'inventory'))));
    const costScore = Math.max(0, Math.min(100, Math.round(result.subScores.cost.score - trendBias * 0.8 + historyOffset(i, 'cost'))));
    const logisticsScore = Math.max(0, Math.min(100, Math.round(result.subScores.logistics.score - trendBias * 0.6 + historyOffset(i, 'logistics'))));
    const salesScore = Math.max(0, Math.min(100, Math.round(result.subScores.sales.score - trendBias * 1.2 + historyOffset(i, 'sales'))));
    const riskScore = Math.max(0, Math.min(100, Math.round(result.subScores.risk.score - trendBias * 0.5 + historyOffset(i, 'risk'))));
    const overallScore = Math.max(0, Math.min(100, Math.round(
      inventoryScore * 0.25 + costScore * 0.20 + logisticsScore * 0.20 + salesScore * 0.20 + riskScore * 0.15
    )));

    history.push({
      date: dateStr,
      overallScore,
      grade: getGrade(overallScore),
      inventoryScore,
      costScore,
      logisticsScore,
      salesScore,
      riskScore,
    });
  }
  return history;
}

// GET /api/supply-chain-score - Comprehensive supply chain health scoring
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  // Use cached score computation
  const result = await cachedScore(searchParams.get("detailed") === "true");

  // History action - 30-day trend data
  if (action === "history") {
    const history = generateHistory(result);
    return NextResponse.json({ history, generatedAt: new Date().toISOString() });
  }

  // Weather action
  if (action === "weather") {
    const inventory = await db.inventory.findMany({ select: { stockStatus: true }, take: 5000 });
    const warningCount = inventory.filter(i => i.stockStatus === "warning").length;
    const criticalCount = inventory.filter(i => i.stockStatus === "critical").length;
    const overstockCount = inventory.filter(i => i.stockStatus === "overstock").length;
    const totalInventory = inventory.length;

    const weather = getWeatherCondition(result.overallScore);
    const temperature = Math.round((result.overallScore / 100) * 45);
    const humidity = totalInventory > 0
      ? Math.round(((warningCount + criticalCount + overstockCount) / totalInventory) * 100)
      : 50;
    const windSpeed = Math.round(Math.abs((result.subScores.sales.components as Record<string, number>).growthRate || 0) * 0.8 + 5);
    const visibility = result.overallScore >= 80 ? "优" : result.overallScore >= 60 ? "良" : result.overallScore >= 40 ? "中" : "差";

    return NextResponse.json({
      condition: weather.condition,
      icon: weather.icon,
      conditionKey: weather.key,
      temperature,
      humidity,
      windSpeed,
      visibility,
      overallScore: result.overallScore,
      forecast: generateForecast(result.overallScore, result.subScores as Record<string, { score: number }>),
      alerts: generateAlerts(result.subScores as Record<string, { score: number; label: string }>),
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json(result);
});
