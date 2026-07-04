import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-utils";
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { getAlertRules, bulkUpdateAlertRules } from "@/lib/queries/alert-rules.queries";
import { createAuditLog } from "@/lib/services/audit.service";

// GET /api/alert-rules - List all alert rules
export const GET = withApiRateLimit(withErrorHandler(async () => {
  await optionalRequireAuth();
  const result = await getAlertRules();
  return NextResponse.json({ rules: result.rules });
}));

// PUT /api/alert-rules - Bulk update alert rules
export const PUT = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const body = await request.json();
  const { rules } = body;

  if (!rules || !Array.isArray(rules) || rules.length === 0) {
    return NextResponse.json(
      { error: "缺少必填字段: rules (非空数组)" },
      { status: 422 }
    );
  }

  // Validate each rule entry
  for (const rule of rules) {
    if (!rule.ruleId) {
      return NextResponse.json(
        { error: "每条规则必须包含 ruleId" },
        { status: 422 }
      );
    }
    if (rule.enabled !== undefined && typeof rule.enabled !== "boolean") {
      return NextResponse.json(
        { error: `规则 ${rule.ruleId} 的 enabled 必须为布尔值` },
        { status: 422 }
      );
    }
    if (rule.threshold !== undefined && typeof rule.threshold !== "number") {
      return NextResponse.json(
        { error: `规则 ${rule.ruleId} 的 threshold 必须为数值` },
        { status: 422 }
      );
    }
    if (rule.severity !== undefined && !["warning", "critical"].includes(rule.severity)) {
      return NextResponse.json(
        { error: `规则 ${rule.ruleId} 的 severity 必须为 warning 或 critical` },
        { status: 422 }
      );
    }
  }

  try {
    const updatedRules = await bulkUpdateAlertRules(rules);

    await createAuditLog({
      action: 'UPDATE',
      entity: 'alert_rule',
      details: { action: 'bulkUpdate', count: updatedRules.length, ruleIds: rules.map((r: { ruleId: string }) => r.ruleId) },
    });

    return NextResponse.json({ success: true, rules: updatedRules });
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新预警规则失败';
    const statusCode = message.includes('未找到') ? 404 : 422;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}));
