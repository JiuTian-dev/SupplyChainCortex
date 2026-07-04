/**
 * Stripe client wrapper — initializes lazily from environment variables.
 *
 * All methods are thin wrappers around the Stripe SDK. The billing service
 * layer orchestrates these calls and persists state to the database.
 *
 * Keys are read from env vars; never hardcoded. The client throws if
 * accessed before STRIPE_SECRET_KEY is set (unless billing is disabled).
 */

import Stripe from 'stripe';
import { getStripeSecretKey, isStripeConfigured } from './config';

// ─── Lazy Singleton ──────────────────────────────────────────────────────────

let stripeInstance: Stripe | null = null;

/** Get the Stripe client singleton. Throws if not configured. */
export function getStripe(): Stripe {
  if (!isStripeConfigured()) {
    throw new Error(
      'Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.'
    );
  }
  if (!stripeInstance) {
    stripeInstance = new Stripe(getStripeSecretKey(), {
      apiVersion: '2025-08-27.basil' as any,
      typescript: true,
    });
  }
  return stripeInstance;
}

/** Reset the singleton — used in tests. */
export function _resetStripeInstance(): void {
  stripeInstance = null;
}

// ─── Customer Management ─────────────────────────────────────────────────────

export interface CustomerParams {
  orgId: string;
  email: string;
  name?: string;
}

/** Create a Stripe Customer for an organization (tenant). */
export async function createCustomer(params: CustomerParams): Promise<Stripe.Customer> {
  const stripe = getStripe();
  return stripe.customers.create({
    email: params.email,
    name: params.name || params.orgId,
    metadata: {
      orgId: params.orgId,
    },
  });
}

/** Retrieve a customer by ID. */
export async function getCustomer(customerId: string): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
  const stripe = getStripe();
  return stripe.customers.retrieve(customerId);
}

// ─── Subscription Management ─────────────────────────────────────────────────

export interface CreateSubscriptionParams {
  customerId: string;
  priceId: string;
  trialDays?: number;
  metadata?: Record<string, string>;
}

/** Create a subscription for a customer. */
export async function createSubscription(
  params: CreateSubscriptionParams
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.create({
    customer: params.customerId,
    items: [{ price: params.priceId }],
    trial_period_days: params.trialDays,
    metadata: params.metadata,
  });
}

/** Cancel a subscription immediately or at period end. */
export async function cancelSubscription(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean = false
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  if (cancelAtPeriodEnd) {
    return stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }
  return stripe.subscriptions.cancel(subscriptionId);
}

/** Update a subscription to a new price (upgrade/downgrade). */
export async function updateSubscription(
  subscriptionId: string,
  newPriceId: string
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Replace the first subscription item's price
  const itemId = subscription.items.data[0]?.id;
  if (!itemId) {
    throw new Error(`Subscription ${subscriptionId} has no items to update`);
  }

  return stripe.subscriptions.update(subscriptionId, {
    items: [{ id: itemId, price: newPriceId }],
    proration_behavior: 'create_prorations',
  });
}

/** Retrieve a subscription by ID. */
export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.retrieve(subscriptionId);
}

// ─── Usage (Metered Billing) ─────────────────────────────────────────────────

/** Record usage for a metered subscription item. */
export async function createUsageRecord(
  subscriptionItemId: string,
  quantity: number,
  timestamp: number = Math.floor(Date.now() / 1000)
): Promise<any> {
  const stripe = getStripe();
  return (stripe.subscriptionItems as any).createUsageRecord(
    subscriptionItemId,
    {
      quantity,
      timestamp,
      action: 'increment',
    }
  );
}

// ─── Checkout & Billing Portal ───────────────────────────────────────────────

export interface CheckoutSessionParams {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  mode?: 'payment' | 'subscription';
  trialDays?: number;
}

/** Create a Checkout Session for subscription signup. */
export async function createCheckoutSession(
  params: CheckoutSessionParams
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    customer: params.customerId,
    line_items: [{ price: params.priceId, quantity: 1 }],
    mode: params.mode || 'subscription',
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    subscription_data: params.trialDays
      ? { trial_period_days: params.trialDays }
      : undefined,
  });
}

/** Create a Billing Portal session for self-service management. */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

// ─── Webhook Signature Verification ──────────────────────────────────────────

/** Construct a Stripe event from a raw request body, verifying the signature. */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  secret: string
): Stripe.Event {
  return (Stripe as any).webhooks.constructEvent(payload, signature, secret);
}
