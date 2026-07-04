/**
 * Stripe Webhook Handler
 *
 * Receives Stripe webhook events, verifies the signature, and dispatches
 * to the billing service for database updates.
 *
 * Signature verification is mandatory — the raw body must be used.
 * In Next.js, this requires `export const runtime = 'nodejs'` and reading
 * the request body as text.
 */

import { NextRequest, NextResponse } from 'next/server';
import { constructWebhookEvent } from '@/lib/billing/stripe-client';
import { processWebhookEvent } from '@/lib/services/billing.service';
import { getStripeWebhookSecret, isBillingEnabled } from '@/lib/billing/config';
import { apiError } from '@/lib/api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // If billing is disabled, acknowledge but do nothing
  if (!isBillingEnabled()) {
    return NextResponse.json({ received: true, billing: 'disabled' });
  }

  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    return apiError('Webhook secret not configured', 500, 'WEBHOOK_NOT_CONFIGURED');
  }

  // Read raw body for signature verification
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return apiError('Missing stripe-signature header', 400, 'MISSING_SIGNATURE');
  }

  // Verify the webhook signature
  let event;
  try {
    event = constructWebhookEvent(payload, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signature verification failed';
    return apiError(`Webhook signature verification failed: ${message}`, 400, 'INVALID_SIGNATURE');
  }

  // Dispatch the event to the billing service
  try {
    await processWebhookEvent({
      type: event.type,
      data: event.data as unknown as { object: Record<string, unknown> },
    });
  } catch (err) {
    // Log but return 200 to avoid Stripe retries for processing errors
    if (process.env.NODE_ENV === 'development') {
      console.error('Webhook processing error:', err);
    }
  }

  return NextResponse.json({ received: true, type: event.type });
}
