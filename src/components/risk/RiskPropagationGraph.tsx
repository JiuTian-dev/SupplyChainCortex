'use client';

import { useMemo, useState, useCallback } from 'react';

interface GraphNode {
  nodeId: string; label: string; type: string;
  riskScore: number; depth: number; path: string[];
}
interface SourceNode {
  id: string; label: string; riskScore: number; cause: string;
}

interface Props {
  sourceNodes?: SourceNode[];
  propagation?: GraphNode[];
  maxDepth?: number;
}

const TYPE_LABELS: Record<string, string> = {
  PORT: '港', SHIPMENT: '运', WAREHOUSE: '仓',
  PRODUCT: '品', SUPPLIER: '供', SOURCE: '源',
};

const NODE_W = 88, NODE_H = 32, COL_GAP = 150, ROW_GAP = 40;
const DEFAULT_VISIBLE = 24;

function riskStroke(score: number): string {
  if (score >= 70) return '#ef4444';
  if (score >= 40) return '#f97316';
  if (score >= 15) return '#eab308';
  return '#d4d4d8';
}

function riskTextColor(score: number): string {
  if (score >= 70) return '#dc2626';
  if (score >= 40) return '#ea580c';
  if (score >= 15) return '#ca8a04';
  return '#71717a';
}

export function RiskPropagationGraph({ sourceNodes = [], propagation = [], maxDepth = 0 }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visibleNodes = useMemo(() => {
    if (propagation.length === 0) return [];
    if (showAll || propagation.length <= DEFAULT_VISIBLE) return propagation;
    return [...propagation].sort((a, b) => b.riskScore - a.riskScore).slice(0, DEFAULT_VISIBLE);
  }, [propagation, showAll]);

  const layout = useMemo(() => {
    if (visibleNodes.length === 0) {
      return { nodePos: new Map<string, {x:number;y:number;type:string;label:string;riskScore:number}>(), edgeList: [] as {from:string;to:string}[], related: new Map<string, Set<string>>(), svgW: 0, svgH: 0 };
    }

    const byDepth = new Map<number, (GraphNode | SourceNode)[]>();
    for (const src of sourceNodes) {
      if (!byDepth.has(0)) byDepth.set(0, []);
      byDepth.get(0)!.push({ nodeId: src.id, label: src.label, type: 'SOURCE', riskScore: src.riskScore, depth: 0, path: [src.id] } as GraphNode);
    }
    for (const n of visibleNodes) {
      const d = n.depth || 1;
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push(n);
    }

    const depthKeys = Array.from(byDepth.keys()).sort((a, b) => a - b);
    const maxPerCol = Math.max(...Array.from(byDepth.values()).map(a => a.length), 1);
    const nodePos = new Map<string, {x:number;y:number;type:string;label:string;riskScore:number}>();

    for (const depth of depthKeys) {
      const items = byDepth.get(depth)!;
      const colX = 32 + depth * COL_GAP;
      const colH = items.length * ROW_GAP;
      const startY = 32 + (maxPerCol * ROW_GAP - colH) / 2;
      items.forEach((item, i) => {
        const nodeId = 'nodeId' in item ? (item as GraphNode).nodeId : (item as SourceNode).id;
        nodePos.set(nodeId, {
          x: colX, y: startY + i * ROW_GAP,
          type: (item as GraphNode).type || 'SOURCE',
          label: item.label, riskScore: item.riskScore,
        });
      });
    }

    const edgeList: { from: string; to: string }[] = [];
    const related = new Map<string, Set<string>>();
    const addRel = (a: string, b: string) => {
      if (!related.has(a)) related.set(a, new Set());
      related.get(a)!.add(b);
      if (!related.has(b)) related.set(b, new Set());
      related.get(b)!.add(a);
    };

    for (const n of visibleNodes) {
      if (n.path.length >= 2) {
        const fromId = n.path[n.path.length - 2];
        const toId = n.path[n.path.length - 1];
        if (nodePos.has(fromId) && nodePos.has(toId)) {
          edgeList.push({ from: fromId, to: toId });
          addRel(fromId, toId);
        }
      }
    }
    for (const src of sourceNodes) {
      for (const n of visibleNodes) {
        if (n.path[0] === src.id && n.path.length >= 2 && nodePos.has(src.id) && nodePos.has(n.path[1])) {
          const already = edgeList.some(e => e.from === src.id && e.to === n.path[1]);
          if (!already) {
            edgeList.push({ from: src.id, to: n.path[1] });
            addRel(src.id, n.path[1]);
          }
        }
      }
    }

    const svgW = 64 + (Math.max(...depthKeys, 0) + 1) * COL_GAP;
    const svgH = 64 + maxPerCol * ROW_GAP;

    return { nodePos, edgeList, related, svgW, svgH };
  }, [visibleNodes, sourceNodes]);

  const selectedRelated = selectedId ? layout.related.get(selectedId) : null;

  const handleClick = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  }, []);

  if (propagation.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-muted-foreground/60">
        暂无传播数据
      </div>
    );
  }

  const hiddenCount = propagation.length - visibleNodes.length;

  return (
    <div className="space-y-2">
      {hiddenCount > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
          <span>显示 Top {visibleNodes.length}/{propagation.length}</span>
          {selectedId && <span className="text-purple-500">· 点击空白取消高亮</span>}
          <button
            onClick={() => setShowAll(!showAll)}
            className="ml-auto text-[11px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            {showAll ? '收起' : `全部 ${propagation.length}`}
          </button>
        </div>
      )}

      <div className="overflow-auto rounded-lg border bg-white dark:bg-zinc-900/80" style={{ maxHeight: 420 }}>
        <svg
          viewBox={`0 0 ${layout.svgW} ${layout.svgH}`}
          className="block"
          style={{ minWidth: layout.svgW, minHeight: Math.min(layout.svgH, 400) }}
          onClick={() => setSelectedId(null)}
        >
          <defs>
            <marker id="rp-arrow" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
              <polygon points="0 0, 6 2.5, 0 5" fill="#d4d4d8" />
            </marker>
            <marker id="rp-arrow-hl" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
              <polygon points="0 0, 6 2.5, 0 5" fill="#a78bfa" />
            </marker>
          </defs>

          {/* Edges */}
          {layout.edgeList.map((e, i) => {
            const from = layout.nodePos.get(e.from);
            const to = layout.nodePos.get(e.to);
            if (!from || !to) return null;
            const isHL = selectedRelated?.has(e.from) && selectedRelated?.has(e.to);
            const dimmed = selectedId && !isHL;
            return (
              <line
                key={i}
                x1={from.x + NODE_W} y1={from.y + NODE_H / 2}
                x2={to.x} y2={to.y + NODE_H / 2}
                stroke={isHL ? '#a78bfa' : dimmed ? '#f4f4f5' : '#e4e4e7'}
                strokeWidth={isHL ? 1.5 : 0.6}
                markerEnd={isHL ? 'url(#rp-arrow-hl)' : 'url(#rp-arrow)'}
                style={{ transition: 'all 0.25s ease' }}
              />
            );
          })}

          {/* Nodes */}
          {Array.from(layout.nodePos.entries()).map(([id, pos]) => {
            const isSel = id === selectedId;
            const isRel = selectedRelated?.has(id);
            const dimmed = selectedId && !isSel && !isRel;
            const typeTag = TYPE_LABELS[pos.type] || pos.type[0];
            return (
              <g
                key={id}
                onClick={(ev) => { ev.stopPropagation(); handleClick(id); }}
                className="cursor-pointer"
                style={{ transition: 'opacity 0.25s ease', opacity: dimmed ? 0.15 : 1 }}
              >
                {/* Node pill — transparent bg, colored border */}
                <rect
                  x={pos.x} y={pos.y}
                  width={NODE_W} height={NODE_H}
                  rx={NODE_H / 2}
                  fill={isSel ? '#f5f3ff' : 'transparent'}
                  stroke={isSel ? '#8b5cf6' : riskStroke(pos.riskScore)}
                  strokeWidth={isSel ? 2 : 1}
                  className="dark:fill-zinc-800/40"
                />
                {/* Type tag */}
                <text
                  x={pos.x + 12} y={pos.y + NODE_H / 2 + 3.5}
                  textAnchor="middle" fontSize={8}
                  fill={riskTextColor(pos.riskScore)}
                  fontWeight={600}
                >
                  {typeTag}
                </text>
                {/* Label */}
                <text
                  x={pos.x + NODE_W / 2 + 4} y={pos.y + NODE_H / 2 - 2}
                  textAnchor="middle" fontSize={9.5} fontWeight={500}
                  className="fill-zinc-700 dark:fill-zinc-300"
                >
                  {pos.label.length > 7 ? pos.label.slice(0, 7) + '…' : pos.label}
                </text>
                {/* Risk score */}
                <text
                  x={pos.x + NODE_W / 2 + 4} y={pos.y + NODE_H / 2 + 10}
                  textAnchor="middle" fontSize={8}
                  fill={riskTextColor(pos.riskScore)}
                  fontWeight={600}
                >
                  {pos.riskScore}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Minimal legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />高 ≥70</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-400" />中 ≥40</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />低 ≥15</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-zinc-300" />安全</span>
        <span className="hidden sm:inline ml-auto">点击节点查看上下游</span>
      </div>
    </div>
  );
}
