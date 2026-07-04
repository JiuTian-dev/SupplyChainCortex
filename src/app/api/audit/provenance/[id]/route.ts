/**
 * Provenance API — W3C PROV-O semantic audit trace.
 *
 * GET /api/audit/provenance/[id]
 *   Returns a JSON-LD provenance record for an audit log entry,
 *   enriched with its associated decision trace if available.
 *
 * Supports EU AI Act Article 12 traceability requirements with
 * W3C PROV-O interoperable provenance records.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, NotFoundError } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { db } from '@/lib/db';
import { auditToProvenance, traceToProvenance, combinedProvenance, toJsonLd } from '@/lib/audit/provenance';
import { optionalRequireAuth } from '@/lib/auth-helpers';

export const GET = withApiRateLimit(withErrorHandler(async (
  request: NextRequest,
  context?: unknown,
) => {
  await optionalRequireAuth();
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const format = request.nextUrl.searchParams.get('format') || 'json-ld'; // 'json-ld' | 'nquads'

  // Fetch the audit log
  const auditLog = await db.auditLog.findUnique({
    where: { id },
  });

  if (!auditLog) {
    throw NotFoundError('Audit log not found');
  }

  // Try to find associated decision trace
  const trace = await db.decisionTrace.findFirst({
    where: { auditId: id },
  });

  // Build combined provenance record
  const record = combinedProvenance(
    {
      id: auditLog.id,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      sku: auditLog.sku,
      userId: auditLog.userId,
      userName: auditLog.userName,
      details: auditLog.details,
      severity: auditLog.severity,
      contentHash: auditLog.contentHash,
      previousHash: auditLog.previousHash,
      signature: auditLog.signature,
      createdAt: auditLog.createdAt,
    },
    trace ? {
      id: trace.id,
      auditId: trace.auditId,
      userQuery: trace.userQuery,
      intent: trace.intent,
      confidence: trace.confidence,
      mode: trace.mode,
      tier: trace.tier,
      durationMs: trace.durationMs,
      toolsUsed: trace.toolsUsed as string[],
      claimsCount: trace.claimsCount,
      passport: trace.passport,
      summary: trace.summary,
      contentHash: trace.contentHash,
      previousHash: trace.previousHash,
      signature: trace.signature,
      createdAt: trace.createdAt,
    } : null,
  );

  if (format === 'nquads') {
    // For N-Quads format, return simplified representation
    // (Full N-Quads would require a RDF library like rdfjs-c14n)
    return NextResponse.json({
      format: 'nquads-unsupported',
      message: 'N-Quads serialization requires RDF normalization library. Use json-ld format.',
      jsonLd: record,
    }, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // Default: JSON-LD
  return new NextResponse(toJsonLd(record), {
    status: 200,
    headers: {
      'Content-Type': 'application/ld+json',
      'Link': '<http://www.w3.org/ns/prov#>; rel="http://www.w3.org/ns/prov#"',
    },
  });
}));
