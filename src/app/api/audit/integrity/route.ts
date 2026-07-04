/**
 * Audit Integrity Verification API
 *
 * Verifies the cryptographic hash chain of audit logs and decision traces.
 * EU AI Act Article 12: supports post-hoc auditing of individual AI decisions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { db } from '@/lib/db';
import { verifyChainIntegrity } from '@/lib/audit/crypto-trail';
import { optionalRequireAuth } from '@/lib/auth-helpers';

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type') || 'all'; // 'audit' | 'trace' | 'all'
  const limit = Math.min(parseInt(searchParams.get('limit') || '1000', 10), 5000);

  const results: Record<string, { valid: boolean; brokenAt: string | null; total: number }> = {};

  if (type === 'audit' || type === 'all') {
    const auditLogs = await db.auditLog.findMany({
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        contentHash: true,
        previousHash: true,
        signature: true,
      },
    });

    results.audit = {
      ...verifyChainIntegrity(auditLogs),
      total: auditLogs.length,
    };
  }

  if (type === 'trace' || type === 'all') {
    const traces = await db.decisionTrace.findMany({
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        contentHash: true,
        previousHash: true,
        signature: true,
      },
    });

    results.trace = {
      ...verifyChainIntegrity(traces),
      total: traces.length,
    };
  }

  const allValid = Object.values(results).every(r => r.valid);

  return NextResponse.json({
    valid: allValid,
    checkedAt: new Date().toISOString(),
    details: results,
  });
}));
