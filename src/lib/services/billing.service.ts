/**
 * Billing service — orchestrates Stripe operations and persists subscription
 * state to the database.
 *
 * In multi-tenant mode, tenantId = orgId = Stripe Customer ID reference.
 * When billing is disabled (BILLING_ENABLED != 'true'), all quota checks
 * pass and subscription operations return stubs.
 */

import { db } from '@/lib/db';
import {
  PLANS,
  getPlanConfig,
  isBillingEnabled,
  isPlanUpgrade,
  isValidPlan,
  getCurrentPeriod,
  getResourceLimit,
  type Plan,
  type ResourceType,
} from '@/lib/billing/config';
import * as stripeClient from '@/lib/billing/stripe-client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SubscriptionInfo {
  plan: Plan;
  status: string;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface UsageStats {
  resource: ResourceType;
  used: number;
  limit: number;
  remaining: number;
  period: string;
  exceeded: boolean;
}

export interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
}

// ─── Subscription Operations ─────────────────────────────────────────────────

/** Get the current subscription for a tenant. */
export async function getOrgSubscription(tenantId: string): Promise<SubscriptionInfo | null> {
  const sub = await db.orgSubscription.findUnique({
    where: { tenantId },
  });
  if (!sub) return null;
  return {
    plan: sub.plan as Plan,
    status: sub.status,
    stripeSubscriptionId: sub.stripeSubscriptionId,
    stripePriceId: sub.stripePriceId,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
}

/** Get the effective plan for a tenant (defaults to 'free'). */
export async function getOrgPlan(tenantId: string): Promise<Plan> {
  const sub = await getOrgSubscription(tenantId);
  if (!sub) return 'free';
  return isValidPlan(sub.plan) ? sub.plan : 'free';
}

/** Start a subscription for a tenant. */
export async function startSubscription(
  tenantId: string,
  plan: Plan
): Promise<SubscriptionInfo> {
  const planConfig = getPlanConfig(plan);

  // Ensure tenant has a Stripe customer
  const tenant = await db.tenants.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  let stripeCustomerId = tenant.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripeClient.createCustomer({
      orgId: tenantId,
      email: tenant.billingEmail || `billing@${tenant.slug}.com`,
      name: tenant.name,
    });
    stripeCustomerId = customer.id;
    await db.tenants.update({
      where: { id: tenantId },
      data: { stripeCustomerId },
    });
  }

  // Create Stripe subscription (skip for free plan)
  let stripeSubId: string | null = null;
  let stripePriceId: string | null = planConfig.priceId;
  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;

  if (plan !== 'free' && isBillingEnabled()) {
    const stripeSub = await stripeClient.createSubscription({
      customerId: stripeCustomerId,
      priceId: planConfig.priceId,
      metadata: { tenantId, plan },
    });
    stripeSubId = stripeSub.id;
    periodStart = (stripeSub as any).current_period_start
      ? new Date((stripeSub as any).current_period_start * 1000)
      : null;
    periodEnd = (stripeSub as any).current_period_end
      ? new Date((stripeSub as any).current_period_end * 1000)
      : null;
  }

  // Upsert subscription record
  const sub = await db.orgSubscription.upsert({
    where: { tenantId },
    create: {
      tenantId,
      stripeSubscriptionId: stripeSubId,
      stripePriceId,
      plan,
      status: 'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
    update: {
      stripeSubscriptionId: stripeSubId,
      stripePriceId,
      plan,
      status: 'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    },
  });

  // Update tenant plan
  await db.tenants.update({
    where: { id: tenantId },
    data: { plan },
  });

  return {
    plan: sub.plan as Plan,
    status: sub.status,
    stripeSubscriptionId: sub.stripeSubscriptionId,
    stripePriceId: sub.stripePriceId,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
}

/** Cancel a tenant's subscription. */
export async function cancelSubscription(
  tenantId: string,
  cancelAtPeriodEnd: boolean = true
): Promise<SubscriptionInfo | null> {
  const sub = await db.orgSubscription.findUnique({ where: { tenantId } });
  if (!sub) return null;

  if (sub.stripeSubscriptionId && isBillingEnabled()) {
    await stripeClient.cancelSubscription(
      sub.stripeSubscriptionId,
      cancelAtPeriodEnd
    );
  }

  const updated = await db.orgSubscription.update({
    where: { tenantId },
    data: {
      status: cancelAtPeriodEnd ? sub.status : 'canceled',
      cancelAtPeriodEnd,
      ...(cancelAtPeriodEnd ? {} : { plan: 'free' }),
    },
  });

  if (!cancelAtPeriodEnd) {
    await db.tenants.update({
      where: { id: tenantId },
      data: { plan: 'free' },
    });
  }

  return {
    plan: updated.plan as Plan,
    status: updated.status,
    stripeSubscriptionId: updated.stripeSubscriptionId,
    stripePriceId: updated.stripePriceId,
    currentPeriodStart: updated.currentPeriodStart,
    currentPeriodEnd: updated.currentPeriodEnd,
    cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
  };
}

/** Change a tenant's plan (upgrade or downgrade). */
export async function changePlan(
  tenantId: string,
  newPlan: Plan
): Promise<SubscriptionInfo> {
  const sub = await db.orgSubscription.findUnique({ where: { tenantId } });
  const currentPlan = sub?.plan as Plan || 'free';
  const planConfig = getPlanConfig(newPlan);

  // If upgrading and we have a Stripe subscription, update it
  if (sub?.stripeSubscriptionId && isBillingEnabled() && newPlan !== 'free') {
    await stripeClient.updateSubscription(
      sub.stripeSubscriptionId,
      planConfig.priceId
    );
  } else if (newPlan === 'free') {
    // Downgrade to free — cancel the Stripe subscription
    return cancelSubscription(tenantId, false) as Promise<SubscriptionInfo>;
  } else if (!sub) {
    // No existing subscription — start a new one
    return startSubscription(tenantId, newPlan);
  }

  const updated = await db.orgSubscription.update({
    where: { tenantId },
    data: {
      plan: newPlan,
      stripePriceId: planConfig.priceId,
    },
  });

  await db.tenants.update({
    where: { id: tenantId },
    data: { plan: newPlan },
  });

  return {
    plan: updated.plan as Plan,
    status: updated.status,
    stripeSubscriptionId: updated.stripeSubscriptionId,
    stripePriceId: updated.stripePriceId,
    currentPeriodStart: updated.currentPeriodStart,
    currentPeriodEnd: updated.currentPeriodEnd,
    cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
  };
}

// ─── Quota & Usage ───────────────────────────────────────────────────────────

/** Check if a tenant can consume more of a resource. */
export async function checkQuota(
  tenantId: string,
  resource: ResourceType
): Promise<QuotaCheckResult> {
  // If billing is disabled, always allow
  if (!isBillingEnabled()) {
    return { allowed: true, remaining: Infinity, limit: -1, used: 0 };
  }

  const plan = await getOrgPlan(tenantId);
  const limit = getResourceLimit(plan, resource);

  // Enterprise or unlimited (-1) — always allowed
  if (limit === -1) {
    return { allowed: true, remaining: Infinity, limit: -1, used: 0 };
  }

  const period = getCurrentPeriod();
  const usage = await db.usageRecord.findUnique({
    where: {
      tenantId_resource_period: { tenantId, resource, period },
    },
  });
  const used = usage?.amount || 0;
  const remaining = Math.max(0, limit - used);
  const allowed = used < limit;

  return { allowed, remaining, limit, used };
}

/** Record usage for a tenant. */
export async function recordUsage(
  tenantId: string,
  resource: ResourceType,
  amount: number = 1
): Promise<void> {
  const period = getCurrentPeriod();
  await db.usageRecord.upsert({
    where: {
      tenantId_resource_period: { tenantId, resource, period },
    },
    create: {
      tenantId,
      resource,
      amount,
      period,
    },
    update: {
      amount: { increment: amount },
    },
  });
}

/** Get usage statistics for a tenant in a given period. */
export async function getUsageStats(
  tenantId: string,
  period: string = getCurrentPeriod()
): Promise<UsageStats[]> {
  const plan = await getOrgPlan(tenantId);
  const records = await db.usageRecord.findMany({
    where: { tenantId, period },
  });

  const resources: ResourceType[] = ['api_calls', 'tools', 'storage'];
  return resources.map((resource) => {
    const record = records.find((r) => r.resource === resource);
    const used = record?.amount || 0;
    const limit = getResourceLimit(plan, resource);
    const remaining = limit === -1 ? Infinity : Math.max(0, limit - used);
    return {
      resource,
      used,
      limit,
      remaining,
      period,
      exceeded: limit !== -1 && used >= limit,
    };
  });
}

// ─── Webhook Event Processing ────────────────────────────────────────────────

/** Process a Stripe webhook event and update database state. */
export async function processWebhookEvent(event: {
  type: string;
  data: { object: Record<string, unknown> };
}): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as {
        customer?: string;
        subscription?: string;
        metadata?: { tenantId?: string };
      };
      const tenantId = session.metadata?.tenantId;
      if (!tenantId) break;
      await db.orgSubscription.upsert({
        where: { tenantId },
        create: {
          tenantId,
          stripeSubscriptionId: session.subscription || null,
          status: 'active',
        },
        update: {
          stripeSubscriptionId: session.subscription || null,
          status: 'active',
        },
      });
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as {
        id: string;
        status: string;
        current_period_start?: number;
        current_period_end?: number;
        cancel_at_period_end?: boolean;
        metadata?: { tenantId?: string };
      };
      const tenantId = sub.metadata?.tenantId;
      if (!tenantId) break;
      await db.orgSubscription.update({
        where: { tenantId },
        data: {
          status: sub.status,
          currentPeriodStart: sub.current_period_start
            ? new Date(sub.current_period_start * 1000)
            : null,
          currentPeriodEnd: sub.current_period_end
            ? new Date(sub.current_period_end * 1000)
            : null,
          cancelAtPeriodEnd: sub.cancel_at_period_end || false,
        },
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as {
        metadata?: { tenantId?: string };
      };
      const tenantId = sub.metadata?.tenantId;
      if (!tenantId) break;
      await db.orgSubscription.update({
        where: { tenantId },
        data: {
          status: 'canceled',
          plan: 'free',
          cancelAtPeriodEnd: false,
        },
      });
      await db.tenants.update({
        where: { id: tenantId },
        data: { plan: 'free' },
      });
      break;
    }

    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed': {
      // Payment events — could trigger notifications or dunning emails.
      // For scaffold, we just acknowledge; no DB change needed.
      break;
    }

    default:
      // Unhandled event type — silently ignore
      break;
  }
}

// ─── Plan Listing (for UI) ───────────────────────────────────────────────────

/** List all available plans for display. */
export function listPlans() {
  return Object.entries(PLANS).map(([key, config]) => ({
    id: key,
    name: config.name,
    priceId: config.priceId,
    monthlyPrice: config.monthlyPrice,
    description: config.description,
    limits: config.limits,
  }));
}
