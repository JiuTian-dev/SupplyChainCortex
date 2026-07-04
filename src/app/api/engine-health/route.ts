/**
 * Engine Health API — lightweight probe + audit export for production.
 *
 * GET /api/engine-health                     → full health check
 * GET /api/engine-health?action=metrics      → cache + breaker + feedback stats
 * GET /api/engine-health?action=audit        → decision + feedback chain (JSON)
 * GET /api/engine-health?action=audit&format=csv → CSV export
 *
 * Zero DB queries for health/metrics. Audit queries Prisma for persistent logs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { runHealthProbe, getEngineMetrics, getFeedbackStats } from '@/lib/engine';
import { detectAnomalies } from '@/lib/engine/anomaly';
import { db } from '@/lib/db';
import type { DecisionLog, FeedbackLog } from '@prisma/client';

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const format = searchParams.get('format');

  if (action === 'metrics') {
    return NextResponse.json({
      ...getEngineMetrics(),
      feedback: getFeedbackStats(),
    });
  }

  if (action === 'quality') {
    const report = await detectAnomalies();
    return NextResponse.json(report);
  }

  if (action === 'audit') {
    const [decisions, feedback] = await Promise.all([
      (db as any).decisionLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }) as Promise<DecisionLog[]>,
      (db as any).feedbackLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }) as Promise<FeedbackLog[]>,
    ]);

    // Join decisions with their feedback by auditId
    const chain = decisions.map(d => {
      const fb = feedback.filter(f => f.auditId === d.auditId);
      return {
        auditId: d.auditId,
        engine: d.engine,
        action: d.action,
        durationMs: d.durationMs,
        cacheHit: d.cacheHit,
        degradedSources: JSON.parse(d.degradedSources || '[]'),
        version: d.version,
        decidedAt: d.createdAt,
        feedback: fb.map(f => ({
          action: f.action,
          userNotes: f.userNotes,
          actedAt: f.actedAt,
        })),
      };
    });

    if (format === 'csv') {
      const csvRows = [
        'auditId,engine,action,durationMs,cacheHit,feedbackAction,userNotes',
        ...chain.flatMap(c =>
          c.feedback.length > 0
            ? c.feedback.map(f => `${c.auditId},${c.engine},${c.action},${c.durationMs},${c.cacheHit},${f.action},"${f.userNotes || ''}"`)
            : [`${c.auditId},${c.engine},${c.action},${c.durationMs},${c.cacheHit},none,`]
        ),
      ];
      return new NextResponse(csvRows.join('\n'), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=audit-export.csv' },
      });
    }

    return NextResponse.json({
      total: chain.length,
      withFeedback: chain.filter(c => c.feedback.length > 0).length,
      chain: chain.slice(0, 50),
    });
  }

  const health = await runHealthProbe();

  return NextResponse.json(health, {
    status: health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503,
  });
}));
