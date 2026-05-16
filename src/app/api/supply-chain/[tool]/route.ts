import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { withApiRateLimit } from "@/lib/api-protection";
import { withErrorHandler, apiSuccess, apiError } from "@/lib/api-utils";

const execFileAsync = promisify(execFile);

const VALID_TOOLS = new Set([
  "calculate_eoq",
  "calculate_safety_stock",
  "calculate_reorder_point",
  "classify_abc_xyz",
  "forecast_demand",
  "calculate_seasonal_decompose",
  "monte_carlo_inventory",
  "calculate_wagner_whitin",
  "calculate_newsvendor",
  "calculate_drp",
  "calculate_warehouse_location",
  "calculate_transport_route",
  "calculate_multi_echelon_ss",
  "calculate_inventory_kpi",
  "calculate_fill_rate",
  "calculate_lead_time_analysis",
  "calculate_purchase_variance",
  "calculate_total_cost",
  "calculate_supplier_scoring",
  "calculate_learning_curve",
  "calculate_break_even",
  "calculate_optimal_pricing",
  "calculate_joint_replenishment",
  "calculate_forecast_accuracy",
]);

const TIMEOUTS: Record<string, number> = {
  monte_carlo_inventory: 60000,
};

export const POST = withApiRateLimit(
  withErrorHandler(async (request: NextRequest, context?: unknown) => {
    const { tool } = await (context as { params: Promise<{ tool: string }> }).params;

    if (!VALID_TOOLS.has(tool)) {
      return apiError(`未知工具: ${tool}`, 400, "UNKNOWN_TOOL");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("请求体必须是有效的 JSON", 400, "INVALID_JSON");
    }

    const bridgePath = path.join(process.cwd(), "mcp-server", "bridge.py");
    const argsJson = JSON.stringify(body);
    const timeout = TIMEOUTS[tool] || 15000;

    try {
      const { stdout } = await execFileAsync("python3", [bridgePath, tool, argsJson], {
        timeout,
        encoding: "utf8",
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });
      const result = JSON.parse(stdout.trim());

      if (result.error) {
        return apiError(result.error, 400, "TOOL_ERROR");
      }

      return apiSuccess(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return apiError(message, 500, "BRIDGE_ERROR");
    }
  })
);
