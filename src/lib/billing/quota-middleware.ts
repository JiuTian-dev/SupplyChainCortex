/**
 * Quota middleware — wraps API handlers with per-tenant resource quota checks.
 *
 * When billing is disabled (BILLING_ENABLED != 'true'), all requests pass.
 * When enabled, the middleware checks the tenant's current usage against the
 * plan limit and returns 429 (Too Many Requests) if exceeded, with
 * X-RateLimit-* headers for client visibility.
 *
 * Usage:
 *   export const POST = withQuotaCheck('api_calls')(async (req) => { ... });
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkQuota, recordUsage, getOrgPlan } from '@/lib/services/billing.service';
import { isBillingEnabled, type ResourceType } from '@/lib/billing/config';

// ─── Tenant Resolution ───────────────────────────────────────────────────────

/**
 * Resolve the tenant ID from a request. In a fully multi-tenant system this
 * would come from the session or a header. For the scaffold, we read from
 * a header or fall back to 'default'.
 */
export function resolveTenantId(request: NextRequest): string {
  return request.headers.get('x-tenant-id') || 'default';
}

// ─── Quota Headers ───────────────────────────────────────────────────────────

function setQuotaHeaders(
  response: NextResponse,
  remaining: number,
  limit: number,
  used: number
): void {
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  response.headers.set('X-RateLimit-Limit', String(limit));
  response.headers.set('X-RateLimit-Used', String(used));
}

// ─── Middleware Factory ──────────────────────────────────────────────────────

type ApiHandler = (_request: NextRequest, _context?: unknown) => Promise<NextResponse>;

/**
 * Higher-order middleware that checks quota before allowing the handler to run.
 * After a successful response, usage is recorded.
 */
export function withQuotaCheck(resource: ResourceType) {
  return function quotaMiddleware(handler: ApiHandler): ApiHandler {
    return async (request, context) => {
      // If billing is disabled, skip quota check entirely
      if (!isBillingEnabled()) {
        return handler(request, context);
      }

      const tenantId = resolveTenantId(request);
      const quota = await checkQuota(tenantId, resource);

      // Quota exceeded — return 429
      if (!quota.allowed) {
        const response = NextResponse.json(
          {
            success: false,
            error: '配额已用尽，请升级订阅计划',
            code: 'QUOTA_EXCEEDED',
            resource,
            limit: quota.limit,
            used: quota.used,
          },
          { status: 429 }
        );
        setQuotaHeaders(response, 0, quota.limit, quota.used);
        return response;
      }

      // Execute the handler
      const response = await handler(request, context);

      // Record usage only on successful (2xx) responses
      if (response.status >= 200 && response.status < 300) {
        await recordUsage(tenantId, resource, 1).catch(() => {
          // Usage recording failure should not break the request
        });
      }

      // Attach quota headers to the response
      setQuotaHeaders(response, quota.remaining, quota.limit, quota.used);
      return response;
    };
  };
}

// ─── Direct Quota Guard ──────────────────────────────────────────────────────

/**
 * Imperative quota check for use inside service layers (not as middleware).
 * Returns null if allowed, or a NextResponse with 429 if exceeded.
 */
export async function guardQuota(
  tenantId: string,
  resource: ResourceType
): Promise<NextResponse | null> {
  if (!isBillingEnabled()) return null;

  const quota = await checkQuota(tenantId, resource);
  if (quota.allowed) return null;

  const response = NextResponse.json(
    {
      success: false,
      error: '配额已用尽，请升级订阅计划',
      code: 'QUOTA_EXCEEDED',
      resource,
      limit: quota.limit,
      used: quota.used,
    },
    { status: 429 }
  );
  setQuotaHeaders(response, 0, quota.limit, quota.used);
  return response;
}

// ─── Feature Gate ────────────────────────────────────────────────────────────

/**
 * Check if a tenant's plan includes a specific feature.
 * Returns true if billing is disabled or the feature is available.
 */
export async function hasFeature(
  tenantId: string,
  feature: string
): Promise<boolean> {
  if (!isBillingEnabled()) return true;
  const plan = await getOrgPlan(tenantId);
  const config = (await import('@/lib/billing/config')).PLANS[plan];
  return config.limits.features.includes(feature);
}
