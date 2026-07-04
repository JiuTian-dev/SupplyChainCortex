import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import {
  getProcurementPlan,
  getBudgetAnalysis,
  getTimeline,
  getProcurementComparison,
  getProcurementHistory,
} from "@/lib/services/procurement.service";

// GET /api/procurement - Procurement planning API
// Actions: plan, budget, timeline, comparison, history
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "plan";

  switch (action) {
    case "plan": {
      const result = await getProcurementPlan();
      return NextResponse.json(result);
    }

    case "budget": {
      const result = await getBudgetAnalysis();
      return NextResponse.json(result);
    }

    case "timeline": {
      const result = await getTimeline();
      return NextResponse.json(result);
    }

    case "comparison": {
      const result = await getProcurementComparison();
      return NextResponse.json(result);
    }

    case "history": {
      const result = await getProcurementHistory();
      return NextResponse.json(result);
    }

    default:
      return NextResponse.json({ error: "未知操作，支持: plan, budget, timeline, comparison, history" }, { status: 400 });
  }
}));
