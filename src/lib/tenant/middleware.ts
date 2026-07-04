/**
 * Tenant Middleware
 *
 * Wraps a Next.js App Router route handler so that the tenant id is extracted
 * from the request, validated, and propagated through the tenant context for
 * the duration of the request.
 *
 * Tenant id resolution order:
 *   1. `X-Tenant-Id` request header
 *   2. `tenantId` field on a decoded JWT bearer token (optional)
 *   3. The default tenant ("default") when multi-tenant mode is disabled
 */
import { runWithTenant, isMultiTenantEnabled, DEFAULT_TENANT_ID } from './context';
import { db } from '@/lib/db';

export interface TenantRequestContext {
  tenantId: string;
}

type NextApiHandler = (
  _req: Request,
  _ctx: TenantRequestContext,
) => Promise<Response> | Response;

/** Extract the tenant id from the `X-Tenant-Id` header. */
function extractFromHeader(req: Request): string | null {
  const header = req.headers.get('x-tenant-id');
  if (header && header.trim()) {
    return header.trim();
  }
  return null;
}

/** Extract the tenant id from a Bearer JWT token's payload (without verifying). */
function extractFromJwt(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = auth.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf-8'),
    ) as Record<string, unknown>;
    if (typeof payload.tenantId === 'string' && payload.tenantId) {
      return payload.tenantId;
    }
    return null;
  } catch {
    return null;
  }
}

/** Resolve the tenant id for the incoming request. */
export function resolveTenantId(req: Request): string {
  if (!isMultiTenantEnabled()) {
    return DEFAULT_TENANT_ID;
  }
  return extractFromHeader(req) ?? extractFromJwt(req) ?? DEFAULT_TENANT_ID;
}

/**
 * Validate that a tenant exists and is active. Returns true when the tenant is
 * usable, false otherwise. When multi-tenant mode is off the default tenant is
 * always considered valid.
 */
export async function validateTenant(tenantId: string): Promise<boolean> {
  if (!isMultiTenantEnabled()) {
    return true;
  }
  if (tenantId === DEFAULT_TENANT_ID) {
    return true;
  }
  try {
    const tenant = await db.tenants.findUnique({
      where: { id: tenantId },
      select: { id: true, status: true },
    });
    return tenant?.status === 'active';
  } catch {
    // If the tenants table is not yet migrated, fail open for the default tenant.
    return tenantId === DEFAULT_TENANT_ID;
  }
}

/**
 * Higher-order middleware that sets up the tenant context for a route handler.
 *
 * Usage:
 *   export const POST = withTenant(async (req, { tenantId }) => { … });
 */
export function withTenant(handler: NextApiHandler): (_req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const tenantId = resolveTenantId(req);

    const valid = await validateTenant(tenantId);
    if (!valid) {
      return new Response(
        JSON.stringify({ error: 'Invalid or inactive tenant' }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      );
    }

    return runWithTenant(tenantId, async () => {
      const res = await handler(req, { tenantId });
      // Echo the resolved tenant id back on the response for observability.
      res.headers.set('X-Tenant-Id', tenantId);
      return res;
    });
  };
}
