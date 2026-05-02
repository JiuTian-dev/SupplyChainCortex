/**
 * MCP API Route - Exposes MCP tools via REST API
 * 
 * GET  /api/mcp  → Returns list of available tools (schemas only, no handlers)
 * POST /api/mcp  → Executes a tool call
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, apiSuccess, apiError } from '@/lib/api-utils';
import { withMCPRateLimit } from '@/lib/api-protection';
import { optionalRequirePermission } from '@/lib/auth-helpers';
import { getToolSchemas, executeTool, getTool } from '@/lib/mcp/tools';

// ─── GET: List available tools ─────────────────────────────────────────────────

const handleGet = async (_request: NextRequest): Promise<NextResponse> => {
  const tools = getToolSchemas();
  return apiSuccess({
    tools,
    count: tools.length,
    description: 'SupplyChain Cortex - 可用工具列表',
  });
};

// ─── POST: Execute a tool call ─────────────────────────────────────────────────

const handlePost = async (request: NextRequest): Promise<NextResponse> => {
  await optionalRequirePermission('mcp:execute');
  let body: { tool?: string; parameters?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return apiError('请求体格式无效', 400, 'INVALID_BODY');
  }

  const { tool, parameters = {} } = body;

  if (!tool || typeof tool !== 'string') {
    return apiError('缺少必填字段: tool (工具名称)', 400, 'MISSING_TOOL');
  }

  // Validate tool exists
  const toolDef = getTool(tool);
  if (!toolDef) {
    return apiError(
      `未找到工具: ${tool}。请使用 GET /api/mcp 查看可用工具列表`,
      404,
      'TOOL_NOT_FOUND'
    );
  }

  // Validate required parameters
  const requiredParams = toolDef.parameters.required || [];
  const missingParams = requiredParams.filter(
    (param) => parameters[param] === undefined || parameters[param] === null
  );

  if (missingParams.length > 0) {
    return apiError(
      `缺少必填参数: ${missingParams.join(', ')}`,
      400,
      'MISSING_PARAMETERS'
    );
  }

  // Execute the tool
  try {
    const result = await executeTool(tool, parameters);
    return apiSuccess({
      tool,
      parameters,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '工具执行失败';
    return apiError(message, 500, 'TOOL_EXECUTION_ERROR');
  }
};

// ─── Export handlers with error wrapper ─────────────────────────────────────────

export const GET = withMCPRateLimit(withErrorHandler(handleGet));
export const POST = withMCPRateLimit(withErrorHandler(handlePost));
