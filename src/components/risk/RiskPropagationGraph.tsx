'use client';

import { useMemo, useState, useCallback } from 'react';
import { Network, ChevronDown, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

const TYPE_COLORS: Record<string, string> = {
  PORT: '#7c3aed', SHIPMENT: '#2563eb', WAREHOUSE: '#059669',
  PRODUCT: '#ea580c', SUPPLIER: '#0891b2',
};
const NODE_W = 100, NODE_H = 36, COL_GAP = 180, ROW_GAP = 44;
const DEFAULT_VISIBLE = 30;

function riskBg(score: number): string {
  if (score >= 70) return '#fecaca';
  if (score >= 40) return '#fed7aa';
  if (score >= 15) return '#fef08a';
  return '#dcfce7';
}
function riskBorder(score: number): string {
  if (score >= 70) return '#ef4444';
  if (score >= 40) return '#f97316';
  if (score >= 15) return '#eab308';
  return '#22c55e';
}

export function RiskPropagationGraph({ sourceNodes = [], propagation = [], maxDepth = 0 }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filter top-N by risk
  const visibleNodes = useMemo(() => {
    if (propagation.length === 0) return [];
    if (showAll || propagation.length <= DEFAULT_VISIBLE) return propagation;
    return [...propagation].sort((a, b) => b.riskScore - a.riskScore).slice(0, DEFAULT_VISIBLE);
  }, [propagation, showAll]);

  // Build left-to-right layered layout
  const layout = useMemo(() => {
    if (visibleNodes.length === 0) {
      return { nodePos: new Map<string, {x:number;y:number;type:string;label:string;riskScore:number}>(), edgeList: [] as {from:string;to:string}[], related: new Map<string, Set<string>>(), svgW: 0, svgH: 0 };
    }

    // Group by depth
    const byDepth = new Map<number, (GraphNode | SourceNode)[]>();
    for (const src of sourceNodes) {
      const d = 0;
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push({ nodeId: src.id, label: src.label, type: 'SOURCE', riskScore: src.riskScore, depth: d, path: [src.id] } as GraphNode);
    }
    for (const n of visibleNodes) {
      const d = (n.depth || 1);
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push(n);
    }

    const depthKeys = Array.from(byDepth.keys()).sort((a, b) => a - b);
    const maxPerCol = Math.max(...Array.from(byDepth.values()).map(a => a.length), 1);
    const nodePos = new Map<string, {x:number;y:number;type:string;label:string;riskScore:number}>();

    for (const depth of depthKeys) {
      const items = byDepth.get(depth)!;
      const colX = 40 + depth * COL_GAP;
      const colH = items.length * ROW_GAP;
      const startY = 40 + (maxPerCol * ROW_GAP - colH) / 2;
      items.forEach((item, i) => {
        const nodeId = 'nodeId' in item ? (item as GraphNode).nodeId : (item as SourceNode).id;
        nodePos.set(nodeId, {
          x: colX, y: startY + i * ROW_GAP,
          type: (item as GraphNode).type || 'SOURCE',
          label: item.label, riskScore: item.riskScore,
        });
      });
    }

    // Build edges + adjacency map for highlight
    const edgeList: { from: string; to: string }[] = [];
    const related = new Map<string, Set<string>>();
    const addRel = (a: string, b: string) => {
      if (!related.has(a)) related.set(a, new Set());
      related.get(a)!.add(b);
      if (!related.has(b)) related.set(b, new Set());
      related.get(b)!.add(a);
    };

    // Connect source → first depth → deeper
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
    // Connect source nodes to their first downstream
    for (const src of sourceNodes) {
      for (const n of visibleNodes) {
        if (n.path[0] === src.id && n.path.length >= 2 && nodePos.has(src.id) && nodePos.has(n.path[1])) {
          const alreadyAdded = edgeList.some(e => e.from === src.id && e.to === n.path[1]);
          if (!alreadyAdded) {
            edgeList.push({ from: src.id, to: n.path[1] });
            addRel(src.id, n.path[1]);
          }
        }
      }
    }

    const svgW = 80 + (Math.max(...depthKeys, 0) + 1) * COL_GAP;
    const svgH = 80 + maxPerCol * ROW_GAP;

    return { nodePos, edgeList, related, svgW, svgH };
  }, [visibleNodes, sourceNodes]);

  const selectedRelated = selectedId ? layout.related.get(selectedId) : null;

  const handleNodeClick = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  }, []);

  if (propagation.length === 0) {
    return (
      <div className="flex items-center justify-center h-36 text-muted-foreground text-sm gap-2 bg-muted/20 rounded-lg">
        <Network className="h-4 w-4" />暂无传播数据
      </div>
    );
  }

  const hiddenCount = propagation.length - visibleNodes.length;

  return (
    <div>
      {hiddenCount > 0 && (
        <p className="text-[10px] text-muted-foreground mb-2">
          显示风险最高 {visibleNodes.length}/{propagation.length} 节点
          {selectedId && ' · 点击空白处取消高亮'}
        </p>
      )}
      <div className="overflow-auto rounded-lg border bg-white dark:bg-zinc-900" style={{ maxHeight: 500 }}>
        <svg
          viewBox={`0 0 ${layout.svgW} ${layout.svgH}`}
          className="block"
          style={{ minWidth: layout.svgW, minHeight: Math.min(layout.svgH, 480) }}
          onClick={() => setSelectedId(null)}
        >
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#a1a1aa" />
            </marker>
            <marker id="arrowhead-sel" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#7c3aed" />
            </marker>
          </defs>

          {/* Edges */}
          {layout.edgeList.map((e, i) => {
            const fromPos = layout.nodePos.get(e.from);
            const toPos = layout.nodePos.get(e.to);
            if (!fromPos || !toPos) return null;
            const isSelected = selectedRelated?.has(e.from) && selectedRelated?.has(e.to);
            const dimmed = selectedId && !isSelected;
            return (
              <line
                key={i}
                x1={fromPos.x + NODE_W} y1={fromPos.y + NODE_H / 2}
                x2={toPos.x} y2={toPos.y + NODE_H / 2}
                stroke={dimmed ? '#e4e4e7' : isSelected ? '#7c3aed' : '#d4d4d8'}
                strokeWidth={isSelected ? 2 : 0.8}
                markerEnd={isSelected ? 'url(#arrowhead-sel)' : 'url(#arrowhead)'}
                style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
              />
            );
          })}

          {/* Nodes */}
          {Array.from(layout.nodePos.entries()).map(([id, pos]) => {
            const isSelected = id === selectedId;
            const isRelated = selectedRelated?.has(id);
            const dimmed = selectedId && !isSelected && !isRelated;
            return (
              <g
                key={id}
                onClick={(ev) => { ev.stopPropagation(); handleNodeClick(id); }}
                className="cursor-pointer"
                style={{ transition: 'opacity 0.2s', opacity: dimmed ? 0.25 : 1 }}
              >
                <rect x={pos.x} y={pos.y} width={NODE_W} height={NODE_H}
                  rx={5}
                  fill={riskBg(pos.riskScore)}
                  stroke={isSelected ? '#7c3aed' : riskBorder(pos.riskScore)}
                  strokeWidth={isSelected ? 2.5 : 1.2}
                />
                <text x={pos.x + NODE_W / 2} y={pos.y + 14}
                  textAnchor="middle" fontSize={9} fill="#3f3f46" fontWeight={600}
                >
                  {pos.label.length > 10 ? pos.label.slice(0, 10) + '…' : pos.label}
                </text>
                <text x={pos.x + NODE_W / 2} y={pos.y + 28}
                  textAnchor="middle" fontSize={8} fill="#71717a"
                >
                  {pos.type} · {pos.riskScore}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border" style={{background:'#fecaca',borderColor:'#ef4444'}}/> 高</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border" style={{background:'#fed7aa',borderColor:'#f97316'}}/> 中</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border" style={{background:'#fef08a',borderColor:'#eab308'}}/> 低</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border" style={{background:'#dcfce7',borderColor:'#22c55e'}}/> 安</span>
          <span className="text-[9px] hidden sm:inline">· 点击节点高亮上下游 · 空白处取消</span>
        </div>
        {propagation.length > DEFAULT_VISIBLE && (
          <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowAll(!showAll)}>
            {showAll ? `收起` : `全部 (${propagation.length})`}
            <ChevronDown className={`h-3 w-3 ml-0.5 ${showAll ? 'rotate-180' : ''}`} />
          </Button>
        )}
      </div>
    </div>
  );
}
