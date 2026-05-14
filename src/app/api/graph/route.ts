/**
 * Supply Chain Graph API.
 *
 * GET /api/graph                   → graph summary
 * GET /api/graph?action=cascade&node=<id> → cascade propagation from node
 * GET /api/graph?action=neighbors&node=<id>&depth=2 → neighbors
 * GET /api/graph?action=upstream&node=<id> → upstream supply chain
 * GET /api/graph?action=path&from=<id>&to=<id> → shortest path
 * GET /api/graph?action=centrality → top centrality nodes
 * GET /api/graph?action=search&q=<query> → search nodes
 * GET /api/graph?action=refresh → force rebuild graph
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, apiSuccess, apiError } from '@/lib/api-utils';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import {
  getGraph, refreshGraph, searchNodes, getNeighbors, getUpstream, summarizeGraph,
} from '@/lib/engine/graph-store';
import {
  cascadePropagation, betweennessCentrality, findPath, impactRadius,
} from '@/lib/engine/graph-algorithms';

export const dynamic = 'force-dynamic';

async function handleGet(request: NextRequest) {
  await optionalRequireAuth();

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'summary';

  try {
    switch (action) {
      case 'summary': {
        const graph = await getGraph();
        return apiSuccess({ summary: summarizeGraph(graph), nodeCount: graph.nodeCount, edgeCount: graph.edgeCount, builtAt: graph.builtAt });
      }

      case 'refresh': {
        const graph = await refreshGraph();
        return apiSuccess({ message: 'Graph rebuilt', nodeCount: graph.nodeCount, edgeCount: graph.edgeCount });
      }

      case 'search': {
        const q = searchParams.get('q');
        if (!q) return apiError('缺少 q 参数');
        const graph = await getGraph();
        const nodes = searchNodes(graph, q);
        return apiSuccess({ query: q, count: nodes.length, nodes: nodes.map(n => ({ id: n.id, type: n.type, label: n.label, properties: n.properties })) });
      }

      case 'neighbors': {
        const nodeId = searchParams.get('node');
        if (!nodeId) return apiError('缺少 node 参数');
        const depth = parseInt(searchParams.get('depth') || '2', 10);
        const graph = await getGraph();
        const result = getNeighbors(graph, nodeId, depth);
        return apiSuccess(result);
      }

      case 'upstream': {
        const nodeId = searchParams.get('node');
        if (!nodeId) return apiError('缺少 node 参数');
        const depth = parseInt(searchParams.get('depth') || '2', 10);
        const graph = await getGraph();
        const result = getUpstream(graph, nodeId, depth);
        return apiSuccess(result);
      }

      case 'cascade': {
        const nodeId = searchParams.get('node');
        if (!nodeId) return apiError('缺少 node 参数');
        const risk = parseFloat(searchParams.get('risk') || '0.8');
        const depth = parseInt(searchParams.get('depth') || '4', 10);
        const graph = await getGraph();
        const result = cascadePropagation(graph, nodeId, risk, depth);
        return apiSuccess(result);
      }

      case 'path': {
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        if (!from || !to) return apiError('缺少 from/to 参数');
        const graph = await getGraph();
        const result = findPath(graph, from, to);
        if (!result) return apiSuccess({ found: false, message: '未找到路径' });
        return apiSuccess({ found: true, ...result });
      }

      case 'centrality': {
        const limit = parseInt(searchParams.get('limit') || '10', 10);
        const graph = await getGraph();
        const results = betweennessCentrality(graph, 30).slice(0, limit);
        return apiSuccess({ topNodes: results });
      }

      case 'impact': {
        const nodeId = searchParams.get('node');
        if (!nodeId) return apiError('缺少 node 参数');
        const radius = parseInt(searchParams.get('radius') || '3', 10);
        const graph = await getGraph();
        const results = impactRadius(graph, nodeId, radius);
        return apiSuccess({ sourceNode: graph.nodes.get(nodeId)?.label, radius, affectedCount: results.length, impacts: results.slice(0, 20).map(r => ({ label: r.node.label, type: r.node.type, distance: r.distance, riskScore: r.riskScore })) });
      }

      default:
        return apiError(`未知操作: ${action}`);
    }
  } catch (err) {
    return apiError(`图谱查询失败: ${(err as Error).message}`);
  }
}

export const GET = withErrorHandler(handleGet);
