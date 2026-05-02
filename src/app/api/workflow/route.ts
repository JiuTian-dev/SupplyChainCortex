/**
 * Workflow API — MCP Tool Orchestration
 * GET /api/workflow                              → list all workflows
 * GET /api/workflow?action=run&workflowId=wf-full-health
 * GET /api/workflow?action=detect&query=汇率冲击
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, AppError } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { executeWorkflow, detectWorkflows, getWorkflows } from '@/lib/services/mcp-orchestration.service';

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'list';

  switch (action) {
    case 'list': {
      return NextResponse.json({ workflows: getWorkflows() });
    }

    case 'detect': {
      const query = searchParams.get('query') || '';
      if (!query) throw new AppError('detect 需要 query 参数', 422);
      const workflows = detectWorkflows(query);
      return NextResponse.json({
        query,
        matchedWorkflows: workflows.map(w => ({ id: w.id, name: w.name, description: w.description, steps: w.steps.length })),
        recommendation: workflows.length > 0 ? workflows[0].id : 'wf-full-health',
      });
    }

    case 'run': {
      const workflowId = searchParams.get('workflowId');
      if (!workflowId) throw new AppError('run 需要 workflowId 参数', 422);
      const query = searchParams.get('query') || '';
      const result = await executeWorkflow(workflowId, { query });
      return NextResponse.json({ success: true, ...result });
    }

    default:
      throw new AppError(`未知操作: ${action}`, 400);
  }
}));
