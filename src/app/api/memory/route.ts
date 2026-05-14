/**
 * Episodic Memory API.
 *
 * GET /api/memory?action=stats     → memory statistics
 * GET /api/memory?action=episodes  → recent episodes
 * GET /api/memory?action=facts     → active consolidated facts
 * GET /api/memory?action=search&q= → search episodes by query
 * POST /api/memory                 → trigger consolidation
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, apiSuccess, apiError } from '@/lib/api-utils';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { episodeStore, formatEpisodeContext } from '@/lib/engine/episode-store';
import { runConsolidation, formatConsolidatedFactsContext } from '@/lib/engine/memory-consolidation';

export const dynamic = 'force-dynamic';

async function handleGet(request: NextRequest) {
  await optionalRequireAuth();

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'stats';

  switch (action) {
    case 'stats': {
      const stats = episodeStore.getStats();
      const activeFacts = episodeStore.getActiveFacts();
      return apiSuccess({
        ...stats,
        activeFactCount: activeFacts.length,
        factsByTopic: groupBy(activeFacts, f => f.topic),
      });
    }

    case 'episodes': {
      const limit = parseInt(searchParams.get('limit') || '20', 10);
      const episodes = episodeStore.getRecent(limit).map(e => ({
        id: e.id,
        userQuery: e.userQuery.slice(0, 100),
        claimsCount: e.claims.length,
        toolsUsed: e.toolsUsed,
        entities: e.entities.slice(0, 5),
        topics: e.topics,
        timestamp: e.timestamp,
        accessCount: e.accessCount,
      }));
      return apiSuccess({ episodes });
    }

    case 'facts': {
      const topic = searchParams.get('topic');
      const facts = topic
        ? episodeStore.getFactsByTopic(topic)
        : episodeStore.getActiveFacts();
      return apiSuccess({
        facts: facts.slice(0, 50).map(f => ({
          id: f.id,
          text: f.text,
          confidence: f.confidence,
          topic: f.topic,
          supportCount: f.supportCount,
          lastConfirmedAt: f.lastConfirmedAt,
        })),
        context: formatConsolidatedFactsContext(20),
      });
    }

    case 'search': {
      const q = searchParams.get('q');
      if (!q) return apiError('缺少 q 参数');
      const episodes = episodeStore.retrieve(q, 5);
      const context = formatEpisodeContext(episodes);
      return apiSuccess({
        query: q,
        count: episodes.length,
        context,
        episodes: episodes.map(e => ({
          id: e.id,
          userQuery: e.userQuery.slice(0, 120),
          claims: e.claims.slice(0, 3),
          entities: e.entities.slice(0, 5),
          timestamp: e.timestamp,
        })),
      });
    }

    default:
      return apiError(`未知操作: ${action}`);
  }
}

async function handlePost(request: NextRequest) {
  await optionalRequireAuth();

  const body = await request.json().catch(() => ({}));
  const action = body.action || 'consolidate';

  if (action === 'consolidate') {
    const report = runConsolidation();
    return apiSuccess({
      message: '记忆巩固完成',
      report,
    });
  }

  if (action === 'clear') {
    episodeStore._clear();
    return apiSuccess({ message: '记忆已清除' });
  }

  return apiError(`未知操作: ${action}`);
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);

function groupBy<T>(items: T[], fn: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const key = fn(item);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}
