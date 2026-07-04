/**
 * Billing system tests — covers config, Stripe client, billing service,
 * webhook processing, and quota middleware.
 *
 * All Stripe API calls and database access are mocked. No real network
 * or database connections are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Hoisted Mocks ───────────────────────────────────────────────────────────
// Defined before vi.mock() factories so they're available at hoist time.

const {
  mockTenantFindUnique,
  mockTenantUpdate,
  mockSubFindUnique,
  mockSubUpsert,
  mockSubUpdate,
  mockUsageFindUnique,
  mockUsageFindMany,
  mockUsageUpsert,
  mockStripeCreateCustomer,
  mockStripeCreateSubscription,
  mockStripeCancelSubscription,
  mockStripeUpdateSubscription,
  mockStripeGetSubscription,
  mockStripeCreateUsageRecord,
  mockStripeCreateCheckoutSession,
  mockStripeCreatePortalSession,
  mockStripeConstructEvent,
} = vi.hoisted(() => ({
  mockTenantFindUnique: vi.fn(),
  mockTenantUpdate: vi.fn(),
  mockSubFindUnique: vi.fn(),
  mockSubUpsert: vi.fn(),
  mockSubUpdate: vi.fn(),
  mockUsageFindUnique: vi.fn(),
  mockUsageFindMany: vi.fn(),
  mockUsageUpsert: vi.fn(),
  mockStripeCreateCustomer: vi.fn(),
  mockStripeCreateSubscription: vi.fn(),
  mockStripeCancelSubscription: vi.fn(),
  mockStripeUpdateSubscription: vi.fn(),
  mockStripeGetSubscription: vi.fn(),
  mockStripeCreateUsageRecord: vi.fn(),
  mockStripeCreateCheckoutSession: vi.fn(),
  mockStripeCreatePortalSession: vi.fn(),
  mockStripeConstructEvent: vi.fn(),
}));

// Mock Prisma db
vi.mock('@/lib/db', () => ({
  db: {
    tenants: {
      findUnique: mockTenantFindUnique,
      update: mockTenantUpdate,
    },
    orgSubscription: {
      findUnique: mockSubFindUnique,
      upsert: mockSubUpsert,
      update: mockSubUpdate,
    },
    usageRecord: {
      findUnique: mockUsageFindUnique,
      findMany: mockUsageFindMany,
      upsert: mockUsageUpsert,
    },
  },
}));

// Mock Stripe client
vi.mock('@/lib/billing/stripe-client', () => ({
  getStripe: vi.fn(() => ({})),
  _resetStripeInstance: vi.fn(),
  createCustomer: mockStripeCreateCustomer,
  createSubscription: mockStripeCreateSubscription,
  cancelSubscription: mockStripeCancelSubscription,
  updateSubscription: mockStripeUpdateSubscription,
  getSubscription: mockStripeGetSubscription,
  createUsageRecord: mockStripeCreateUsageRecord,
  createCheckoutSession: mockStripeCreateCheckoutSession,
  createBillingPortalSession: mockStripeCreatePortalSession,
  constructWebhookEvent: mockStripeConstructEvent,
}));

// ─── Test Imports ────────────────────────────────────────────────────────────

import {
  PLANS,
  isPlanUpgrade,
  isValidPlan,
  getResourceLimit,
  isBillingEnabled,
  getCurrentPeriod,
  getPeriod,
} from './config';
import * as stripeClient from './stripe-client';
import {
  getOrgSubscription,
  getOrgPlan,
  startSubscription,
  cancelSubscription,
  changePlan,
  checkQuota,
  recordUsage,
  getUsageStats,
  processWebhookEvent,
  listPlans,
} from '@/lib/services/billing.service';
import {
  withQuotaCheck,
  guardQuota,
  hasFeature,
  resolveTenantId,
} from './quota-middleware';

// ─── Test Setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: billing disabled
  vi.stubEnv('BILLING_ENABLED', '');
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── 1. Plan Configuration Tests ─────────────────────────────────────────────

describe('Billing Config', () => {
  it('defines all 4 subscription plans', () => {
    expect(Object.keys(PLANS)).toHaveLength(4);
    expect(PLANS.free).toBeDefined();
    expect(PLANS.starter).toBeDefined();
    expect(PLANS.pro).toBeDefined();
    expect(PLANS.enterprise).toBeDefined();
  });

  it('free plan has $0 monthly price and limited features', () => {
    expect(PLANS.free.monthlyPrice).toBe(0);
    expect(PLANS.free.limits.maxUsers).toBe(1);
    expect(PLANS.free.limits.maxApiCallsPerMonth).toBe(1000);
    expect(PLANS.free.limits.features.length).toBeGreaterThan(0);
  });

  it('starter plan costs $49/month with 5 users', () => {
    expect(PLANS.starter.monthlyPrice).toBe(49);
    expect(PLANS.starter.limits.maxUsers).toBe(5);
    expect(PLANS.starter.limits.maxApiCallsPerMonth).toBe(50000);
  });

  it('pro plan costs $199/month with 20 users', () => {
    expect(PLANS.pro.monthlyPrice).toBe(199);
    expect(PLANS.pro.limits.maxUsers).toBe(20);
    expect(PLANS.pro.limits.maxApiCallsPerMonth).toBe(500000);
  });

  it('enterprise plan has unlimited limits (-1)', () => {
    expect(PLANS.enterprise.limits.maxUsers).toBe(-1);
    expect(PLANS.enterprise.limits.maxApiCallsPerMonth).toBe(-1);
    expect(PLANS.enterprise.limits.maxToolsPerDay).toBe(-1);
  });

  it('isPlanUpgrade correctly compares plan tiers', () => {
    expect(isPlanUpgrade('pro', 'starter')).toBe(true);
    expect(isPlanUpgrade('starter', 'pro')).toBe(false);
    expect(isPlanUpgrade('pro', 'pro')).toBe(false);
    expect(isPlanUpgrade('enterprise', 'free')).toBe(true);
  });

  it('isValidPlan validates plan strings', () => {
    expect(isValidPlan('free')).toBe(true);
    expect(isValidPlan('starter')).toBe(true);
    expect(isValidPlan('invalid')).toBe(false);
    expect(isValidPlan('')).toBe(false);
  });

  it('getResourceLimit returns correct limits per resource', () => {
    expect(getResourceLimit('free', 'api_calls')).toBe(1000);
    expect(getResourceLimit('starter', 'tools')).toBe(500);
    expect(getResourceLimit('enterprise', 'api_calls')).toBe(-1);
    expect(getResourceLimit('pro', 'storage')).toBe(365);
  });

  it('isBillingEnabled reads BILLING_ENABLED env var', () => {
    expect(isBillingEnabled()).toBe(false);
    vi.stubEnv('BILLING_ENABLED', 'true');
    expect(isBillingEnabled()).toBe(true);
    vi.stubEnv('BILLING_ENABLED', 'false');
    expect(isBillingEnabled()).toBe(false);
  });

  it('getCurrentPeriod returns YYYY-MM format', () => {
    const period = getCurrentPeriod();
    expect(period).toMatch(/^\d{4}-\d{2}$/);
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    expect(period).toBe(expected);
  });

  it('getPeriod formats a specific date correctly', () => {
    expect(getPeriod(new Date('2026-01-15'))).toBe('2026-01');
    expect(getPeriod(new Date('2026-12-31'))).toBe('2026-12');
  });
});

// ─── 2. Stripe Client Tests ──────────────────────────────────────────────────

describe('Stripe Client', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_mock_key');
  });

  it('createCustomer calls Stripe with correct params', async () => {
    const mockCustomer = { id: 'cus_123', email: 'test@example.com' };
    mockStripeCreateCustomer.mockResolvedValue(mockCustomer);

    const result = await stripeClient.createCustomer({
      orgId: 'org-1',
      email: 'test@example.com',
      name: 'Test Org',
    });

    expect(result).toEqual(mockCustomer);
    expect(mockStripeCreateCustomer).toHaveBeenCalledWith({
      orgId: 'org-1',
      email: 'test@example.com',
      name: 'Test Org',
    });
  });

  it('createSubscription calls Stripe with customer and price', async () => {
    const mockSub = { id: 'sub_123', status: 'active' };
    mockStripeCreateSubscription.mockResolvedValue(mockSub);

    const result = await stripeClient.createSubscription({
      customerId: 'cus_123',
      priceId: 'price_abc',
    });

    expect(result).toEqual(mockSub);
    expect(mockStripeCreateSubscription).toHaveBeenCalledWith({
      customerId: 'cus_123',
      priceId: 'price_abc',
    });
  });

  it('cancelSubscription supports cancel at period end', async () => {
    const mockSub = { id: 'sub_123', cancel_at_period_end: true };
    mockStripeCancelSubscription.mockResolvedValue(mockSub);

    await stripeClient.cancelSubscription('sub_123', true);
    expect(mockStripeCancelSubscription).toHaveBeenCalledWith('sub_123', true);
  });

  it('constructWebhookEvent delegates to Stripe verification', () => {
    mockStripeConstructEvent.mockReturnValue({ type: 'test' });
    const result = stripeClient.constructWebhookEvent('payload', 'sig', 'secret');
    expect(result).toEqual({ type: 'test' });
    expect(mockStripeConstructEvent).toHaveBeenCalledWith('payload', 'sig', 'secret');
  });
});

// ─── 3. Billing Service Tests ────────────────────────────────────────────────

describe('Billing Service', () => {
  describe('getOrgSubscription', () => {
    it('returns subscription info when found', async () => {
      const mockSub = {
        plan: 'pro',
        status: 'active',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_abc',
        currentPeriodStart: new Date('2026-01-01'),
        currentPeriodEnd: new Date('2026-02-01'),
        cancelAtPeriodEnd: false,
      };
      mockSubFindUnique.mockResolvedValue(mockSub);

      const result = await getOrgSubscription('tenant-1');
      expect(result?.plan).toBe('pro');
      expect(result?.status).toBe('active');
      expect(result?.stripeSubscriptionId).toBe('sub_123');
    });

    it('returns null when subscription not found', async () => {
      mockSubFindUnique.mockResolvedValue(null);
      const result = await getOrgSubscription('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getOrgPlan', () => {
    it('defaults to free when no subscription exists', async () => {
      mockSubFindUnique.mockResolvedValue(null);
      const plan = await getOrgPlan('tenant-1');
      expect(plan).toBe('free');
    });

    it('returns the subscription plan when it exists', async () => {
      mockSubFindUnique.mockResolvedValue({ plan: 'pro' });
      const plan = await getOrgPlan('tenant-1');
      expect(plan).toBe('pro');
    });
  });

  describe('startSubscription', () => {
    it('creates Stripe customer when tenant has none, then starts subscription', async () => {
      vi.stubEnv('BILLING_ENABLED', 'true');
      mockTenantFindUnique.mockResolvedValue({
        id: 'tenant-1',
        name: 'Test Org',
        slug: 'test-org',
        stripeCustomerId: null,
        billingEmail: null,
      });
      mockStripeCreateCustomer.mockResolvedValue({ id: 'cus_new' });
      mockStripeCreateSubscription.mockResolvedValue({
        id: 'sub_new',
        current_period_start: 1735689600,
        current_period_end: 1738368000,
      });
      mockSubUpsert.mockResolvedValue({
        plan: 'starter',
        status: 'active',
        stripeSubscriptionId: 'sub_new',
        stripePriceId: 'price_starter',
        currentPeriodStart: new Date('2026-01-01'),
        currentPeriodEnd: new Date('2026-02-01'),
        cancelAtPeriodEnd: false,
      });

      const result = await startSubscription('tenant-1', 'starter');

      expect(mockStripeCreateCustomer).toHaveBeenCalled();
      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: 'tenant-1' },
        data: { stripeCustomerId: 'cus_new' },
      });
      expect(result.plan).toBe('starter');
    });

    it('skips Stripe API for free plan', async () => {
      mockTenantFindUnique.mockResolvedValue({
        id: 'tenant-1',
        name: 'Test Org',
        slug: 'test-org',
        stripeCustomerId: 'cus_123',
        billingEmail: null,
      });
      mockSubUpsert.mockResolvedValue({
        plan: 'free',
        status: 'active',
        stripeSubscriptionId: null,
        stripePriceId: 'price_free',
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });

      await startSubscription('tenant-1', 'free');

      expect(mockStripeCreateSubscription).not.toHaveBeenCalled();
    });
  });

  describe('cancelSubscription', () => {
    it('cancels at period end and keeps status', async () => {
      vi.stubEnv('BILLING_ENABLED', 'true');
      mockSubFindUnique.mockResolvedValue({
        tenantId: 'tenant-1',
        stripeSubscriptionId: 'sub_123',
        status: 'active',
        plan: 'pro',
      });
      mockStripeCancelSubscription.mockResolvedValue({ id: 'sub_123' });
      mockSubUpdate.mockResolvedValue({
        plan: 'pro',
        status: 'active',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_pro',
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: true,
      });

      const result = await cancelSubscription('tenant-1', true);

      expect(mockStripeCancelSubscription).toHaveBeenCalledWith('sub_123', true);
      expect(result!.cancelAtPeriodEnd).toBe(true);
    });

    it('immediately cancels and downgrades to free', async () => {
      vi.stubEnv('BILLING_ENABLED', 'true');
      mockSubFindUnique.mockResolvedValue({
        tenantId: 'tenant-1',
        stripeSubscriptionId: 'sub_123',
        status: 'active',
        plan: 'pro',
      });
      mockStripeCancelSubscription.mockResolvedValue({ id: 'sub_123' });
      mockSubUpdate.mockResolvedValue({
        plan: 'free',
        status: 'canceled',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });

      const result = await cancelSubscription('tenant-1', false);

      expect(mockStripeCancelSubscription).toHaveBeenCalledWith('sub_123', false);
      expect(result!.status).toBe('canceled');
      expect(result!.plan).toBe('free');
    });

    it('returns null when subscription does not exist', async () => {
      mockSubFindUnique.mockResolvedValue(null);
      const result = await cancelSubscription('tenant-1');
      expect(result).toBeNull();
    });
  });

  describe('changePlan', () => {
    it('updates Stripe subscription when upgrading', async () => {
      vi.stubEnv('BILLING_ENABLED', 'true');
      mockSubFindUnique.mockResolvedValue({
        tenantId: 'tenant-1',
        stripeSubscriptionId: 'sub_123',
        plan: 'starter',
        status: 'active',
      });
      mockStripeUpdateSubscription.mockResolvedValue({ id: 'sub_123' });
      mockSubUpdate.mockResolvedValue({
        plan: 'pro',
        status: 'active',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_pro',
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });

      const result = await changePlan('tenant-1', 'pro');

      expect(mockStripeUpdateSubscription).toHaveBeenCalled();
      expect(result.plan).toBe('pro');
    });
  });

  describe('checkQuota', () => {
    it('allows all requests when billing is disabled', async () => {
      const result = await checkQuota('tenant-1', 'api_calls');
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(-1);
    });

    it('allows when usage is under limit', async () => {
      vi.stubEnv('BILLING_ENABLED', 'true');
      mockSubFindUnique.mockResolvedValue({ plan: 'free' });
      mockUsageFindUnique.mockResolvedValue({ amount: 500 });

      const result = await checkQuota('tenant-1', 'api_calls');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(500); // 1000 - 500
    });

    it('blocks when usage exceeds limit', async () => {
      vi.stubEnv('BILLING_ENABLED', 'true');
      mockSubFindUnique.mockResolvedValue({ plan: 'free' });
      mockUsageFindUnique.mockResolvedValue({ amount: 1000 });

      const result = await checkQuota('tenant-1', 'api_calls');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('allows unlimited for enterprise plan', async () => {
      vi.stubEnv('BILLING_ENABLED', 'true');
      mockSubFindUnique.mockResolvedValue({ plan: 'enterprise' });

      const result = await checkQuota('tenant-1', 'api_calls');
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(-1);
    });
  });

  describe('recordUsage', () => {
    it('upserts usage record with increment', async () => {
      mockUsageUpsert.mockResolvedValue({ amount: 6 });

      await recordUsage('tenant-1', 'api_calls', 5);

      expect(mockUsageUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            tenantId: 'tenant-1',
            resource: 'api_calls',
            amount: 5,
          }),
          update: { amount: { increment: 5 } },
        })
      );
    });
  });

  describe('getUsageStats', () => {
    it('returns stats for all resource types', async () => {
      mockSubFindUnique.mockResolvedValue({ plan: 'free' });
      mockUsageFindMany.mockResolvedValue([
        { resource: 'api_calls', amount: 500 },
        { resource: 'tools', amount: 30 },
      ]);

      const stats = await getUsageStats('tenant-1', '2026-01');

      expect(stats).toHaveLength(3); // api_calls, tools, storage
      const apiStats = stats.find((s) => s.resource === 'api_calls');
      expect(apiStats?.used).toBe(500);
      expect(apiStats?.limit).toBe(1000);
      expect(apiStats?.remaining).toBe(500);
      expect(apiStats?.exceeded).toBe(false);
    });

    it('marks exceeded resources correctly', async () => {
      mockSubFindUnique.mockResolvedValue({ plan: 'free' });
      mockUsageFindMany.mockResolvedValue([
        { resource: 'api_calls', amount: 1200 },
      ]);

      const stats = await getUsageStats('tenant-1', '2026-01');
      const apiStats = stats.find((s) => s.resource === 'api_calls');
      expect(apiStats?.exceeded).toBe(true);
      expect(apiStats?.remaining).toBe(0);
    });
  });

  describe('processWebhookEvent', () => {
    it('handles checkout.session.completed event', async () => {
      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cus_123',
            subscription: 'sub_123',
            metadata: { tenantId: 'tenant-1' },
          },
        },
      };
      mockSubUpsert.mockResolvedValue({});

      await processWebhookEvent(event);

      expect(mockSubUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1' },
        })
      );
    });

    it('handles customer.subscription.deleted event', async () => {
      const event = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            metadata: { tenantId: 'tenant-1' },
          },
        },
      };
      mockSubUpdate.mockResolvedValue({});
      mockTenantUpdate.mockResolvedValue({});

      await processWebhookEvent(event);

      expect(mockSubUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1' },
          data: expect.objectContaining({
            status: 'canceled',
            plan: 'free',
          }),
        })
      );
    });

    it('ignores events without tenantId in metadata', async () => {
      const event = {
        type: 'checkout.session.completed',
        data: { object: { metadata: {} } },
      };

      await processWebhookEvent(event);
      expect(mockSubUpsert).not.toHaveBeenCalled();
    });

    it('silently ignores unknown event types', async () => {
      const event = {
        type: 'unknown.event.type',
        data: { object: {} },
      };

      await expect(processWebhookEvent(event)).resolves.not.toThrow();
    });
  });

  describe('listPlans', () => {
    it('returns all plans with their config', () => {
      const plans = listPlans();
      expect(plans).toHaveLength(4);
      expect(plans.find((p) => p.id === 'free')).toBeDefined();
      expect(plans.find((p) => p.id === 'enterprise')).toBeDefined();
    });
  });
});

// ─── 4. Quota Middleware Tests ───────────────────────────────────────────────

describe('Quota Middleware', () => {
  describe('resolveTenantId', () => {
    it('reads tenant ID from x-tenant-id header', () => {
      const request = new NextRequest('http://localhost/api/test', {
        headers: { 'x-tenant-id': 'tenant-abc' },
      });
      expect(resolveTenantId(request)).toBe('tenant-abc');
    });

    it('defaults to "default" when header is absent', () => {
      const request = new NextRequest('http://localhost/api/test');
      expect(resolveTenantId(request)).toBe('default');
    });
  });

  describe('withQuotaCheck', () => {
    it('passes through when billing is disabled', async () => {
      const handler = vi.fn(async () => new Response('OK', { status: 200 }));
      const wrapped = withQuotaCheck('api_calls')(handler as any);

      const request = new NextRequest('http://localhost/api/test');
      await wrapped(request);

      expect(handler).toHaveBeenCalled();
    });

    it('returns 429 when quota is exceeded', async () => {
      vi.stubEnv('BILLING_ENABLED', 'true');
      mockSubFindUnique.mockResolvedValue({ plan: 'free' });
      mockUsageFindUnique.mockResolvedValue({ amount: 1000 });

      const handler = vi.fn(async () => new Response('OK', { status: 200 }));
      const wrapped = withQuotaCheck('api_calls')(handler as any);

      const request = new NextRequest('http://localhost/api/test');
      const response = await wrapped(request);

      expect(response.status).toBe(429);
      expect(handler).not.toHaveBeenCalled();
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    });

    it('records usage after successful handler execution', async () => {
      vi.stubEnv('BILLING_ENABLED', 'true');
      mockSubFindUnique.mockResolvedValue({ plan: 'free' });
      mockUsageFindUnique.mockResolvedValue({ amount: 100 });
      mockUsageUpsert.mockResolvedValue({});

      const handler = vi.fn(async () => new Response('OK', { status: 200 }));
      const wrapped = withQuotaCheck('api_calls')(handler as any);

      const request = new NextRequest('http://localhost/api/test');
      const response = await wrapped(request);

      expect(response.status).toBe(200);
      expect(mockUsageUpsert).toHaveBeenCalled();
    });

    it('does not record usage on error responses', async () => {
      vi.stubEnv('BILLING_ENABLED', 'true');
      mockSubFindUnique.mockResolvedValue({ plan: 'free' });
      mockUsageFindUnique.mockResolvedValue({ amount: 100 });

      const handler = vi.fn(async () => new Response('Error', { status: 500 }));
      const wrapped = withQuotaCheck('api_calls')(handler as any);

      const request = new NextRequest('http://localhost/api/test');
      await wrapped(request);

      expect(mockUsageUpsert).not.toHaveBeenCalled();
    });
  });

  describe('guardQuota', () => {
    it('returns null when allowed', async () => {
      vi.stubEnv('BILLING_ENABLED', 'true');
      mockSubFindUnique.mockResolvedValue({ plan: 'free' });
      mockUsageFindUnique.mockResolvedValue({ amount: 100 });

      const result = await guardQuota('tenant-1', 'api_calls');
      expect(result).toBeNull();
    });

    it('returns 429 response when quota exceeded', async () => {
      vi.stubEnv('BILLING_ENABLED', 'true');
      mockSubFindUnique.mockResolvedValue({ plan: 'free' });
      mockUsageFindUnique.mockResolvedValue({ amount: 1000 });

      const result = await guardQuota('tenant-1', 'api_calls');
      expect(result).not.toBeNull();
      expect(result?.status).toBe(429);
    });

    it('returns null when billing is disabled', async () => {
      const result = await guardQuota('tenant-1', 'api_calls');
      expect(result).toBeNull();
    });
  });

  describe('hasFeature', () => {
    it('returns true when billing is disabled', async () => {
      const result = await hasFeature('tenant-1', 'AI 智能决策引擎');
      expect(result).toBe(true);
    });

    it('returns true when feature is in plan', async () => {
      vi.stubEnv('BILLING_ENABLED', 'true');
      mockSubFindUnique.mockResolvedValue({ plan: 'pro' });

      const result = await hasFeature('tenant-1', 'AI 智能决策引擎');
      expect(result).toBe(true);
    });

    it('returns false when feature is not in plan', async () => {
      vi.stubEnv('BILLING_ENABLED', 'true');
      mockSubFindUnique.mockResolvedValue({ plan: 'free' });

      const result = await hasFeature('tenant-1', 'AI 智能决策引擎');
      expect(result).toBe(false);
    });
  });
});
