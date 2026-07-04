/**
 * POST /api/engine-feedback/extract-claims
 *   Extract [claim-N] tags from an agent response text.
 *   Useful for the frontend to parse claims before rendering feedback buttons.
 *
 *   Body: { response: string }
 *   Returns: { claims: Array<{ id, text, source, confidence }> }
 */

/**
 * @internal 待评估 — 此路由在前端组件中无直接调用，疑似无运行时引用。
 * 决策：保留以备运维/外部系统/未来用途，但标注待评估。
 * 评估建议：如确认无任何调用方（含外部脚本、Prometheus、运维工具），可考虑删除。
 */

import { NextRequest } from 'next/server';
import { withErrorHandler, apiSuccess, apiError } from '@/lib/api-utils';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { extractClaims } from '@/lib/engine/evidence-feedback';

export const dynamic = 'force-dynamic';

async function handlePost(request: NextRequest) {
  await optionalRequireAuth();

  const body = await request.json();
  const { response } = body;

  if (!response || typeof response !== 'string') {
    return apiError('缺少 response 字段');
  }

  const claims = extractClaims(response);

  return apiSuccess({ claims });
}

export const POST = withErrorHandler(handlePost);
