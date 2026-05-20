import { NextRequest } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { withApiRateLimit } from "@/lib/api-protection";
import { withErrorHandler, apiSuccess, apiError, sanitizeObject } from "@/lib/api-utils";
import { validateToolArgs, TOOL_SCHEMAS } from "@/lib/validators/supply-chain-tools";

const execFileAsync = promisify(execFile);

const VALID_TOOLS = new Set(Object.keys(TOOL_SCHEMAS));

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

    // Sanitize and validate against per-tool Zod schema
    const sanitized = sanitizeObject(body as Record<string, unknown>);
    const validation = validateToolArgs(tool, sanitized);
    if (!validation.success) {
      return apiError(`参数校验失败: ${validation.error}`, 400, "INVALID_ARGS");
    }

    const bridgePath = path.join(process.cwd(), "mcp-server", "bridge.py");
    const argsJson = JSON.stringify(validation.data);
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
