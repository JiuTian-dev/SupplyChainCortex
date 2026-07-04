/**
 * Subscription API
 * GET    — Retrieve the current tenant's subscription info
 * POST   — Start a new subscription
 * PATCH  — Change plan
 * DELETE — Cancel subscription
 */

import { NextRequest } from 'next/server';
import { withErrorHandler, apiSuccess, apiError, validateBody } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth-helpers';
import {
  getOrgSubscription,
  startSubscription,
  cancelSubscription,
  changePlan,
  listPlans,
} from '@/lib/services/billing.service';
import { isBillingEnabled, isValidPlan, type Plan } from '@/lib/billing/config';
import { z } from 'zod';

const startSubSchema = z.object({
  plan: z.enum(['free', 'starter', 'pro', 'enterprise']),
});

const changePlanSchema = z.object({
  plan: z.enum(['free', 'starter', 'pro', 'enterprise']),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAuth();
  const tenantId = request.headers.get('x-tenant-id') || 'default';
  const subscription = await getOrgSubscription(tenantId);
  const plans = listPlans();
  return apiSuccess({ subscription, plans });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireAuth();

  if (!isBillingEnabled()) {
    return apiError('计费系统未启用', 503, 'BILLING_DISABLED');
  }

  const result = await validateBody(startSubSchema, request);
  if (!result.success) return result.error!;

  const tenantId = request.headers.get('x-tenant-id') || 'default';
  const { plan } = result.data!;

  if (!isValidPlan(plan)) {
    return apiError('无效的订阅计划', 400, 'INVALID_PLAN');
  }

  const subscription = await startSubscription(tenantId, plan as Plan);
  return apiSuccess(subscription, 201);
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  await requireAuth();

  if (!isBillingEnabled()) {
    return apiError('计费系统未启用', 503, 'BILLING_DISABLED');
  }

  const result = await validateBody(changePlanSchema, request);
  if (!result.success) return result.error!;

  const tenantId = request.headers.get('x-tenant-id') || 'default';
  const { plan } = result.data!;

  if (!isValidPlan(plan)) {
    return apiError('无效的订阅计划', 400, 'INVALID_PLAN');
  }

  const subscription = await changePlan(tenantId, plan as Plan);
  return apiSuccess(subscription);
});

export const DELETE = withErrorHandler(async (request: NextRequest) => {
  await requireAuth();

  if (!isBillingEnabled()) {
    return apiError('计费系统未启用', 503, 'BILLING_DISABLED');
  }

  const tenantId = request.headers.get('x-tenant-id') || 'default';
  const { searchParams } = new URL(request.url);
  const cancelAtPeriodEnd = searchParams.get('atPeriodEnd') !== 'false';

  const subscription = await cancelSubscription(tenantId, cancelAtPeriodEnd);
  if (!subscription) {
    return apiError('未找到订阅', 404, 'SUBSCRIPTION_NOT_FOUND');
  }
  return apiSuccess(subscription);
});
