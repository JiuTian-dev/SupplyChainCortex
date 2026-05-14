/**
 * Autonomy Policy API.
 *
 * GET /api/autonomy-policy
 *   Returns the current autonomy policy configuration.
 *
 * GET /api/autonomy-policy?action=stats
 *   Returns daily execution stats.
 *
 * PATCH /api/autonomy-policy
 *   Update policy settings. Body: partial AutonomyPolicy
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, apiSuccess, apiError } from '@/lib/api-utils';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { autonomyPolicy, DEFAULT_POLICY } from '@/lib/engine/autonomy-policy';

export const dynamic = 'force-dynamic';

async function handleGet(request: NextRequest) {
  await optionalRequireAuth();

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'stats') {
    return apiSuccess(autonomyPolicy.getDailyStats());
  }

  return apiSuccess({
    policy: autonomyPolicy.getPolicy(),
    defaults: DEFAULT_POLICY,
  });
}

async function handlePatch(request: NextRequest) {
  await optionalRequireAuth();

  const body = await request.json();

  if (!body || typeof body !== 'object') {
    return apiError('请求体为空');
  }

  autonomyPolicy.updatePolicy(body);

  return apiSuccess({
    message: '策略已更新',
    policy: autonomyPolicy.getPolicy(),
  });
}

export const GET = withErrorHandler(handleGet);
export const PATCH = withErrorHandler(handlePatch);
