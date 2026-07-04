/**
 * Billing Portal API
 * Creates a Stripe Billing Portal session for self-service subscription management.
 */

import { NextRequest } from 'next/server';
import { withErrorHandler, apiSuccess, apiError } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth-helpers';
import { createBillingPortalSession } from '@/lib/billing/stripe-client';
import { isBillingEnabled } from '@/lib/billing/config';
import { db } from '@/lib/db';
import { z } from 'zod';

const portalSchema = z.object({
  returnUrl: z.string().url(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireAuth();

  if (!isBillingEnabled()) {
    return apiError('计费系统未启用', 503, 'BILLING_DISABLED');
  }

  const body = await request.json();
  const parsed = portalSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('returnUrl 格式无效', 400, 'INVALID_URL');
  }

  const tenantId = request.headers.get('x-tenant-id') || 'default';
  const tenant = await db.tenants.findUnique({ where: { id: tenantId } });

  if (!tenant || !tenant.stripeCustomerId) {
    return apiError('未找到 Stripe 客户', 404, 'NO_STRIPE_CUSTOMER');
  }

  const session = await createBillingPortalSession(
    tenant.stripeCustomerId,
    parsed.data.returnUrl
  );

  return apiSuccess({ url: session.url });
});
