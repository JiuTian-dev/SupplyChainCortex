/**
 * GET /api/security - Security configuration endpoint for admin dashboard
 * Returns current security settings, rate limits, and audit statistics.
 * Requires admin permission (with bootstrap mode support).
 */

import { NextRequest } from 'next/server';
import { withErrorHandler, apiSuccess } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequirePermission } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { SECURITY_HEADERS } from '@/lib/security-headers';

export const GET = withApiRateLimit(withErrorHandler(async (_request: NextRequest) => {
  // Require admin permission (skipped in bootstrap mode)
  await optionalRequirePermission('system:config');

  // Gather security configuration
  const [auditLogCount, activeSessionCount] = await Promise.all([
    db.auditLog.count(),
    db.session.count({
      where: { expiresAt: { gte: new Date() } },
    }),
  ]);

  // Rate limit configuration (mirrors rate-limit.ts)
  const rateLimits = {
    api: { maxTokens: 100, windowMs: 60_000, authenticatedMaxTokens: 200, description: '通用API' },
    strict: { maxTokens: 20, windowMs: 60_000, authenticatedMaxTokens: 50, description: '严格模式' },
    auth: { maxTokens: 5, windowMs: 60_000, authenticatedMaxTokens: undefined, description: '认证接口' },
    chat: { maxTokens: 10, windowMs: 60_000, authenticatedMaxTokens: 30, description: 'AI对话' },
    export: { maxTokens: 5, windowMs: 300_000, authenticatedMaxTokens: 15, description: '数据导出' },
    mcp: { maxTokens: 30, windowMs: 60_000, authenticatedMaxTokens: 60, description: 'MCP工具调用' },
  };

  // Security headers summary (redact full CSP for readability)
  // Cross-Origin headers are commented out of SECURITY_HEADERS intentionally
  // (too restrictive for the preview panel), so we use a type-safe fallback.
  const secHeaders = SECURITY_HEADERS as Record<string, string>;
  const securityHeaders = {
    'X-Frame-Options': secHeaders['X-Frame-Options'],
    'X-Content-Type-Options': secHeaders['X-Content-Type-Options'],
    'Referrer-Policy': secHeaders['Referrer-Policy'],
    'Cross-Origin-Opener-Policy': secHeaders['Cross-Origin-Opener-Policy'] ?? 'disabled',
    'Cross-Origin-Resource-Policy': secHeaders['Cross-Origin-Resource-Policy'] ?? 'disabled',
    'Cross-Origin-Embedder-Policy': secHeaders['Cross-Origin-Embedder-Policy'] ?? 'credentialless',
    cspDirectives: [
      'default-src', 'script-src', 'style-src', 'img-src',
      'font-src', 'connect-src', 'frame-ancestors', 'worker-src',
    ],
  };

  // Determine CSP mode based on environment
  const cspMode = process.env.NODE_ENV === 'production' ? 'production' : 'development';

  return apiSuccess({
    rateLimits,
    securityHeaders,
    activeSessions: activeSessionCount,
    auditLogCount,
    cspMode,
    features: {
      rateLimiting: true,
      securityHeaders: true,
      corsProtection: true,
      auditLogging: true,
      rbacEnabled: true,
      bootstrapMode: (await db.user.count()) === 0,
    },
    timestamp: new Date().toISOString(),
  });
}));
