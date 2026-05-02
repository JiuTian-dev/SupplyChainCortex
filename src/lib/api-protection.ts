/**
 * API protection utilities - combine rate limiting + auth checks
 */
import { NextRequest, NextResponse } from 'next/server';
import { apiRateLimit, strictRateLimit, authRateLimit, chatRateLimit, exportRateLimit, mcpRateLimit } from '@/lib/rate-limit';
import { optionalRequirePermission } from '@/lib/auth-helpers';
import type { Permission } from '@/lib/rbac';

/** Return type for optionalRequirePermission / optionalRequireAuth */
export type OptionalAuthResult = Awaited<ReturnType<typeof optionalRequirePermission>>;

type RateLimitFn = (request: Request) => {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
};

/**
 * Wrap an API handler with rate limiting
 * Usage: export const GET = withRateLimit(apiRateLimit, withErrorHandler(async (req) => { ... }))
 */
export function withRateLimit(
  rateLimiter: RateLimitFn,
  handler: (request: NextRequest, context?: unknown) => Promise<NextResponse>
) {
  return async (request: NextRequest, context?: unknown) => {
    const result = rateLimiter(request);
    
    if (!result.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: '请求过于频繁，请稍后再试',
          code: 'RATE_LIMITED',
          retryAfter: result.retryAfter,
          timestamp: new Date().toISOString(),
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(result.retryAfter || 60),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
          },
        }
      );
    }
    
    return handler(request, context);
  };
}

/**
 * Combined wrapper that applies both auth check (optional) + rate limiting.
 * Auth is "optional" in bootstrap mode (no users in DB = allow all),
 * but enforced when users exist.
 */
export function withAuthAndRateLimit(
  permission: Permission,
  rateLimiter: RateLimitFn,
  handler: (request: NextRequest, context?: unknown) => Promise<NextResponse>
) {
  return withRateLimit(rateLimiter, async (request, context) => {
    await optionalRequirePermission(permission);
    return handler(request, context);
  });
}

/** Pre-configured rate limit wrappers */
export const withApiRateLimit = (handler: Parameters<typeof withRateLimit>[1]) => 
  withRateLimit(apiRateLimit, handler);

export const withStrictRateLimit = (handler: Parameters<typeof withRateLimit>[1]) => 
  withRateLimit(strictRateLimit, handler);

export const withAuthRateLimit = (handler: Parameters<typeof withRateLimit>[1]) => 
  withRateLimit(authRateLimit, handler);

export const withChatRateLimit = (handler: Parameters<typeof withRateLimit>[1]) => 
  withRateLimit(chatRateLimit, handler);

export const withExportRateLimit = (handler: Parameters<typeof withRateLimit>[1]) => 
  withRateLimit(exportRateLimit, handler);

export const withMCPRateLimit = (handler: Parameters<typeof withRateLimit>[1]) => 
  withRateLimit(mcpRateLimit, handler);

/** Convenience wrappers combining auth + rate limiting for common domains */
export const withInventoryRead = (handler: Parameters<typeof withAuthAndRateLimit>[2]) =>
  withAuthAndRateLimit('inventory:read', apiRateLimit, handler);

export const withInventoryWrite = (handler: Parameters<typeof withAuthAndRateLimit>[2]) =>
  withAuthAndRateLimit('inventory:write', apiRateLimit, handler);

export const withCostRead = (handler: Parameters<typeof withAuthAndRateLimit>[2]) =>
  withAuthAndRateLimit('cost:read', apiRateLimit, handler);

export const withCostWrite = (handler: Parameters<typeof withAuthAndRateLimit>[2]) =>
  withAuthAndRateLimit('cost:write', apiRateLimit, handler);

export const withLogisticsRead = (handler: Parameters<typeof withAuthAndRateLimit>[2]) =>
  withAuthAndRateLimit('logistics:read', apiRateLimit, handler);

export const withLogisticsWrite = (handler: Parameters<typeof withAuthAndRateLimit>[2]) =>
  withAuthAndRateLimit('logistics:write', apiRateLimit, handler);

export const withSalesRead = (handler: Parameters<typeof withAuthAndRateLimit>[2]) =>
  withAuthAndRateLimit('sales:read', apiRateLimit, handler);

export const withSalesWrite = (handler: Parameters<typeof withAuthAndRateLimit>[2]) =>
  withAuthAndRateLimit('sales:write', apiRateLimit, handler);

export const withSupplierRead = (handler: Parameters<typeof withAuthAndRateLimit>[2]) =>
  withAuthAndRateLimit('supplier:read', apiRateLimit, handler);

export const withSupplierWrite = (handler: Parameters<typeof withAuthAndRateLimit>[2]) =>
  withAuthAndRateLimit('supplier:write', apiRateLimit, handler);

export const withReportExport = (handler: Parameters<typeof withAuthAndRateLimit>[2]) =>
  withAuthAndRateLimit('report:export', exportRateLimit, handler);

export const withAuditRead = (handler: Parameters<typeof withAuthAndRateLimit>[2]) =>
  withAuthAndRateLimit('audit:read', apiRateLimit, handler);

export const withMCPExecute = (handler: Parameters<typeof withAuthAndRateLimit>[2]) =>
  withAuthAndRateLimit('mcp:execute', mcpRateLimit, handler);

export const withSystemConfig = (handler: Parameters<typeof withAuthAndRateLimit>[2]) =>
  withAuthAndRateLimit('system:config', strictRateLimit, handler);
