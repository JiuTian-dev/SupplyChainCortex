'use client';

export interface CausalGraphNode {
  stepIndex: number;
  state: string;
  nextState: string | null;
  findings: string | null;
  toolCalls: Array<{ toolName: string; params: Record<string, unknown>; success: boolean }>;
  claims: Array<{ claimIndex: number; text: string; confidence: string }>;
}

export interface CausalGraphProps {
  steps: CausalGraphNode[];
  expandedStep: number | null;
  onExpand: (stepIndex: number | null) => void;
  onReplayNode: (node: CausalGraphNode) => void;
  activeReplayNode: number | null;
}

const STATE_COLORS: Record<string, string> = {
  classify: '#8b5cf6', plan: '#3b82f6', execute: '#10b981',
  observe: '#f59e0b', decide: '#ef4444', synthesize: '#06b6d4',
};

const STATE_LABELS: Record<string, string> = {
  classify: '分类', plan: '规划', execute: '执行',
  observe: '观察', decide: '决策', synthesize: '合成',
};

const STATE_ICONS: Record<string, string> = {
  classify: '🔍', plan: '📋', execute: '⚡',
  observe: '👁', decide: '🧠', synthesize: '✨',
};

const NODE_RADIUS = 22;
const H_GAP = 130;
const V_OFFSET = 70;

export function CausalGraph({ steps, expandedStep, onExpand, onReplayNode, activeReplayNode }: CausalGraphProps) {
  // Deduplicate steps by state (show each state once, with tool counts)
  const seen = new Set<string>();
  const nodes = steps.filter(s => {
    if (seen.has(s.state)) return false;
    seen.add(s.state);
    return true;
  });

  const totalWidth = Math.max(300, nodes.length * H_GAP + 40);

  return (
    <div>
      <svg width="100%" height="170" viewBox={`0 0 ${totalWidth} 170`} className="overflow-visible">
        {/* Edges */}
        {nodes.map((node, i) => {
          if (i === nodes.length - 1 || !node.nextState) return null;
          const x1 = 40 + i * H_GAP + NODE_RADIUS;
          const x2 = 40 + (i + 1) * H_GAP - NODE_RADIUS;
          const isActive = activeReplayNode !== null && nodes.findIndex(n => n.stepIndex === activeReplayNode) <= i;
          return (
            <line
              key={`edge-${i}`}
              x1={x1} y1={V_OFFSET} x2={x2} y2={V_OFFSET}
              stroke={isActive ? '#3b82f6' : '#d1d5db'}
              strokeWidth={isActive ? 3 : 2}
              markerEnd={isActive ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
            />
          );
        })}

        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#d1d5db" />
          </marker>
          <marker id="arrowhead-active" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#3b82f6" />
          </marker>
          {/* Glow filter for active replay node */}
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Nodes */}
        {nodes.map((node, i) => {
          const cx = 40 + i * H_GAP;
          const cy = V_OFFSET;
          const color = STATE_COLORS[node.state] || '#999';
          const isExpanded = expandedStep === node.stepIndex;
          const isReplayTarget = activeReplayNode === node.stepIndex;
          const toolCount = node.toolCalls.length;
          const claimCount = node.claims.length;

          return (
            <g key={node.stepIndex} className="cursor-pointer">
              {/* Expand highlight circle */}
              <circle
                cx={cx} cy={cy} r={NODE_RADIUS + 4}
                fill={isReplayTarget ? '#3b82f6' : 'transparent'}
                opacity={isReplayTarget ? 0.15 : 0}
                filter={isReplayTarget ? 'url(#glow)' : undefined}
              />
              {/* Main circle */}
              <circle
                cx={cx} cy={cy} r={NODE_RADIUS}
                fill={color}
                opacity={isExpanded ? 0.4 : 0.2}
                stroke={color}
                strokeWidth={isExpanded ? 3 : 2}
                onClick={() => onExpand(isExpanded ? null : node.stepIndex)}
              />
              {/* State label */}
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} fontWeight="bold" fill={color}
                onClick={() => onExpand(isExpanded ? null : node.stepIndex)}>
                {STATE_LABELS[node.state] || node.state}
              </text>

              {/* Tool count badge */}
              {toolCount > 0 && (
                <g transform={`translate(${cx + NODE_RADIUS - 2}, ${cy - NODE_RADIUS - 2})`}>
                  <circle r={9} fill="#10b981" />
                  <text y={3} textAnchor="middle" fontSize={8} fill="white" fontWeight="bold">{toolCount}</text>
                </g>
              )}

              {/* Claim count badge */}
              {claimCount > 0 && (
                <g transform={`translate(${cx - NODE_RADIUS + 2}, ${cy - NODE_RADIUS - 2})`}>
                  <circle r={9} fill="#f59e0b" />
                  <text y={3} textAnchor="middle" fontSize={8} fill="white" fontWeight="bold">{claimCount}</text>
                </g>
              )}

              {/* Replay trigger — shown when node is expanded */}
              {isExpanded && (
                <g
                  transform={`translate(${cx}, ${cy + NODE_RADIUS + 16})`}
                  onClick={(e) => { e.stopPropagation(); onReplayNode(node); }}
                  className="cursor-pointer"
                >
                  <rect x={-22} y={-10} width={44} height={18} rx={9} fill="#3b82f6" />
                  <text y={3} textAnchor="middle" fontSize={9} fill="white" fontWeight="bold">⏪ 回放</text>
                </g>
              )}

              {/* Replay target indicator */}
              {isReplayTarget && !isExpanded && (
                <text x={cx} y={cy + NODE_RADIUS + 16} textAnchor="middle" fontSize={8} fill="#3b82f6" fontWeight="bold">
                  已选为回放点
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
        <span>🟢 工具调用数</span>
        <span>🟡 声明数量</span>
        <span className="text-blue-500">⏪ 点击展开节点后可回放</span>
      </div>
    </div>
  );
}
