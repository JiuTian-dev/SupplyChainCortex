import { db } from '@/lib/db';

export async function getTraces(params: {
  intent?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const { intent, from, to, page = 1, limit = 20 } = params;
  const where: Record<string, unknown> = {};

  if (intent) where.intent = intent;
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
    if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to);
  }

  const [traces, total] = await Promise.all([
    db.decisionTrace.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        auditId: true,
        userQuery: true,
        intent: true,
        confidence: true,
        durationMs: true,
        toolsUsed: true,
        claimsCount: true,
        createdAt: true,
      },
    }),
    db.decisionTrace.count({ where }),
  ]);

  return { traces, total, page, limit };
}

export async function getTraceById(id: string) {
  return db.decisionTrace.findUnique({
    where: { id },
    include: {
      steps: {
        orderBy: { stepIndex: 'asc' },
        include: {
          toolCalls: true,
          claims: true,
        },
      },
    },
  });
}

export async function deleteTrace(id: string) {
  return db.decisionTrace.delete({ where: { id } });
}

export async function getTraceStats(params: { from?: string; to?: string }) {
  const { from, to } = params;
  const where: Record<string, unknown> = {};
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
    if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to);
  }

  const [total, avgConfidence, intents, sources] = await Promise.all([
    db.decisionTrace.count({ where }),
    db.decisionTrace.aggregate({ where, _avg: { confidence: true } }),
    db.decisionTrace.groupBy({ by: ['intent'], _count: true, where }),
    db.tracedClaim.groupBy({ by: ['source'], _count: true }),
  ]);

  return {
    totalTraces: total,
    avgConfidence: Math.round((avgConfidence._avg.confidence || 0) * 100) / 100,
    intents: Object.fromEntries(intents.map(i => [i.intent, i._count])),
    claimSources: Object.fromEntries(sources.map(s => [s.source, s._count])),
  };
}
