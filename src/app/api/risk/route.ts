import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import {
  getRiskDashboard,
  getRiskMatrix,
  getRiskMitigations,
  getRiskAlerts,
  runRiskSimulation,
} from "@/lib/services/risk.service";
import { createAuditLog } from "@/lib/services/audit.service";

// GET /api/risk - Risk monitoring API
// Actions: dashboard, matrix, mitigation, alerts, simulation
export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "dashboard";

  switch (action) {
    case "dashboard": {
      const result = await getRiskDashboard();
      return NextResponse.json(result);
    }

    case "matrix": {
      const result = await getRiskMatrix();
      return NextResponse.json(result);
    }

    case "mitigation": {
      const result = await getRiskMitigations();
      return NextResponse.json(result);
    }

    case "alerts": {
      const result = await getRiskAlerts();
      return NextResponse.json(result);
    }

    case "simulation": {
      const scenario = searchParams.get("scenario") || "supply_disruption";
      try {
        const result = await runRiskSimulation(scenario);

        await createAuditLog({
          action: 'SIMULATE',
          entity: 'forecast',
          details: { scenario, scenarioName: result.scenarioName },
        });

        return NextResponse.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知场景';
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    default:
      return NextResponse.json({ error: "未知操作，支持: dashboard, matrix, mitigation, alerts, simulation" }, { status: 400 });
  }
}));
