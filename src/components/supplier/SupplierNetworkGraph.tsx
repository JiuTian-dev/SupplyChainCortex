'use client';

/**
 * Supplier Network Graph — visualizes the Neo4j supply chain topology.
 *
 * Uses a simplified force-directed layout rendered as an SVG.
 * Each node = company or supplier; each edge = SUPPLIES_TO relationship.
 * Risk-flagged nodes are highlighted in red.
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Share2, AlertTriangle } from 'lucide-react';
import type { NetworkData, GraphNode, GraphEdge } from '@/lib/services/supplier-api.types';

interface Props {
  data: NetworkData | undefined;
  isLoading: boolean;
  className?: string;
}

/** Simple force layout: radial arrangement with limited iterations. */
function simpleLayout(nodes: GraphNode[], edges: GraphEdge[]) {
  const positions = new Map<string, { x: number; y: number }>();

  // Place center node at origin
  if (nodes.length > 0) {
    positions.set(nodes[0].id, { x: 400, y: 250 });
  }

  // Place other nodes in concentric rings
  const ringNodes = nodes.slice(1);
  ringNodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / Math.max(ringNodes.length, 1);
    const radius = 120 + 60 * Math.floor(i / 8);
    positions.set(node.id, {
      x: 400 + radius * Math.cos(angle),
      y: 250 + radius * Math.sin(angle),
    });
  });

  return { positions, width: 800, height: 500 };
}

export function SupplierNetworkGraph({ data, isLoading, className }: Props) {
  const layout = useMemo(() => {
    if (!data?.nodes.length) return null;
    return simpleLayout(data.nodes, data.edges);
  }, [data]);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Share2 className="w-4 h-4" />
            供应商网络图谱
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!layout || !data?.nodes.length) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Share2 className="w-4 h-4" />
            供应商网络图谱
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
          <Share2 className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">暂无图谱数据</p>
          <p className="text-xs mt-1">请确保 Supplier API 已配置并运行</p>
        </CardContent>
      </Card>
    );
  }

  const { positions } = layout;
  const riskyNodes = data.nodes.filter(n => n.risk);
  const tierCount = data.edges.reduce((acc, e) => {
    acc[e.tier] = (acc[e.tier] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Share2 className="w-4 h-4" />
            供应商网络图谱
          </CardTitle>
          <div className="flex gap-2">
            {riskyNodes.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {riskyNodes.length} 个风险节点
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              {data.node_count} 节点 / {data.edge_count} 边
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <svg
          viewBox="0 0 800 500"
          className="w-full h-auto border rounded-md"
        >
          {/* Draw edges */}
          {data.edges.map((edge, i) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            const alpha = 0.15 + edge.confidence * 0.25;
            const strokeWidth = edge.tier === 1 ? 2 : 1;
            return (
              <line
                key={`e-${i}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={`rgba(100,116,139,${alpha})`}
                strokeWidth={strokeWidth}
              />
            );
          })}

          {/* Draw nodes */}
          {data.nodes.map((node) => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const isCompany = node.type === 'company';
            const isRisky = node.risk;
            const r = isCompany ? 22 : 14;
            const fill = isRisky ? '#ef4444' : isCompany ? '#3b82f6' : '#64748b';
            return (
              <g key={node.id}>
                {isRisky && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={r + 4}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={2}
                    opacity={0.4}
                  >
                    <animate
                      attributeName="opacity"
                      values="0.4;0.1;0.4"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={r}
                  fill={fill}
                  opacity={0.85}
                />
                <text
                  x={pos.x}
                  y={pos.y + r + 14}
                  textAnchor="middle"
                  className="text-[10px]"
                  fill="#64748b"
                >
                  {node.label.length > 8
                    ? node.label.slice(0, 8) + '…'
                    : node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tier legend */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground px-2">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
            核心企业
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-slate-500 inline-block" />
            供应商
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
            风险节点
          </span>
          {Object.entries(tierCount).map(([tier, count]) => (
            <span key={tier} className="ml-auto">
              T{tier}: {count} 条边
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
