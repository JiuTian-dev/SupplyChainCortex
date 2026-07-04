/**
 * Checkout Session API
 * Creates a Stripe Checkout Session for subscription signup.
 */

import { NextRequest } from 'next/server';
import { withErrorHandler, apiSuccess, apiError, validateBody } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth-helpers';
import { createCheckoutSession } from '@/lib/billing/stripe-client';
import { getPlanConfig, isBillingEnabled, type Plan } from '@/lib/billing/config';
import { db } from '@/lib/db';
import { z } from 'zod';

const checkoutSchema = z.object({
  plan: z.enum(['starter', 'pro', 'enterprise']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireAuth();

  if (!isBillingEnabled()) {
    return apiError('计费系统未启用', 503, 'BILLING_DISABLED');
  }

  const result = await validateBody(checkoutSchema, request);
  if (!result.success) return result.error!;
  const { plan, successUrl, cancelUrl } = result.data!;

  const planConfig = getPlanConfig(plan as Plan);
  if (!planConfig) {
    return apiError('无效的订阅计划', 400, 'INVALID_PLAN');
  }

  // Resolve tenant — in scaffold mode, use 'default' tenant
  const tenantId = request.headers.get('x-tenant-id') || 'default';
  const tenant = await db.tenants.findUnique({ where: { id: tenantId } });

  if (!tenant) {
    return apiError('租户不存在', 404, 'TENANT_NOT_FOUND');
  }

  // Ensure tenant has a Stripe customer ID
  if (!tenant.stripeCustomerId) {
    return apiError('请先创建 Stripe 客户', 400, 'NO_STRIPE_CUSTOMER');
  }

  const session = await createCheckoutSession({
    customerId: tenant.stripeCustomerId,
    priceId: planConfig.priceId,
    successUrl,
    cancelUrl,
    mode: 'subscription',
  });

  return apiSuccess({ sessionId: session.id, url: session.url });
});
