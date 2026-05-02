/**
 * Decision Graph API — Decision Formalization Reasoning
 * GET /api/decision-graph                        → auto-detect domains
 * GET /api/decision-graph?domains=cost,cross_domain
 * GET /api/decision-graph?query=人民币贬值怎么办
 * GET /api/decision-graph?action=domains         → list available domains
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, AppError } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { executeDecisionGraph, getDecisionDomains } from '@/lib/services/decision-graph.service';

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'analyze';

  if (action === 'domains') {
    return NextResponse.json({ domains: getDecisionDomains() });
  }

  const domainsStr = searchParams.get('domains');
  const domains = domainsStr
    ? domainsStr.split(',').map(s => s.trim()) as Array<'inventory' | 'cost' | 'logistics' | 'supplier' | 'cross_domain'>
    : undefined;
  const query = searchParams.get('query') || '';
  const includeAll = searchParams.get('includeAll') === 'true';

  const report = await executeDecisionGraph({ query, domains, includeAll });
  return NextResponse.json({ success: true, ...report });
}));
