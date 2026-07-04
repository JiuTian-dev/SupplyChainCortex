/**
 * Decision Graph API — Dynamic Decision Formalization (A-phase upgrade)
 *
 * GET /api/decision-graph                        → keyword-based (legacy)
 * GET /api/decision-graph?mode=dynamic            → cascade-risk driven (NEW)
 * GET /api/decision-graph?mode=dynamic&scenario=weather_disruption
 * GET /api/decision-graph?action=domains          → list available domains
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, AppError } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { executeDecisionGraph, getDecisionDomains, DECISION_GRAPH } from '@/lib/services/decision-graph.service';
import { getCascadeRisk } from '@/lib/services/cascade-risk.service';
import { matchDecisions } from '@/lib/engine/decision-matcher';
import type { DecisionDomain } from '@/lib/services/decision-graph.service';

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'analyze';
  const mode = searchParams.get('mode') || 'static';

  if (action === 'domains') {
    return NextResponse.json({ domains: getDecisionDomains() });
  }

  // ── Dynamic Mode: cascade-risk → decision matching ───────────────────
  if (mode === 'dynamic') {
    const scenario = (searchParams.get('scenario') || 'auto') as string;
    const domain = (searchParams.get('domain') || undefined) as DecisionDomain | undefined;

    // Fetch live cascade risk data
    const cascadeReport = await getCascadeRisk({
      scenario: scenario as any,
      includeForwardProjection: false,
      includeCounterfactuals: true,
    });

    // Run dynamic matching
    const { decisions, report } = await matchDecisions(
      DECISION_GRAPH,
      {
        propagation: (cascadeReport as any).propagation || [],
        sourceNodes: (cascadeReport as any).sourceNodes || [],
        summary: {
          totalNodes: (cascadeReport as any).summary?.totalNodes || 0,
          affectedNodes: (cascadeReport as any).summary?.affectedNodes || 0,
          maxDepth: (cascadeReport as any).summary?.maxDepth || 0,
          avgPropagatedRisk: (cascadeReport as any).summary?.avgPropagatedRisk || 0,
          topAffectedProducts: (cascadeReport as any).summary?.topAffectedProducts || [],
        },
      },
      domain,
    );

    return NextResponse.json({
      success: true,
      mode: 'dynamic',
      cascadeContext: {
        scenario,
        sourceNodes: (cascadeReport as any).sourceNodes?.length || 0,
        affectedNodes: (cascadeReport as any).summary?.affectedNodes || 0,
        passport: (cascadeReport as any).passport?.auditId || null,
      },
      ...report,
    });
  }

  // ── Static Mode: legacy keyword-based ────────────────────────────────
  const domainsStr = searchParams.get('domains');
  const domains = domainsStr
    ? domainsStr.split(',').map(s => s.trim()) as DecisionDomain[]
    : undefined;
  const query = searchParams.get('query') || '';
  const includeAll = searchParams.get('includeAll') === 'true';

  const report = await executeDecisionGraph({ query, domains, includeAll });
  return NextResponse.json({ success: true, mode: 'static', ...report });
}));
