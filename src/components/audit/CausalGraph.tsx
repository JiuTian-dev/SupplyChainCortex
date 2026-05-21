'use client';

interface CausalGraphProps {
  steps: Array<{
    stepIndex: number;
    state: string;
    nextState: string | null;
    findings: string | null;
    toolCalls: Array<{ toolName: string; success: boolean }>;
    claims: Array<{ claimIndex: number; text: string; confidence: string }>;
  }>;
  expandedStep: number | null;
  onExpand: (stepIndex: number | null) => void;
}

const STATE_COLORS: Record<string, string> = {
  classify: '#8b5cf6', plan: '#3b82f6', execute: '#10b981',
  observe: '#f59e0b', decide: '#ef4444', synthesize: '#06b6d4',
};

const STATE_LABELS: Record<string, string> = {
  classify: '分类', plan: '规划', execute: '执行',
  observe: '观察', decide: '决策', synthesize: '合成',
};

const NODE_RADIUS = 18;
const H_GAP = 120;
const V_OFFSET = 60;

export function CausalGraph({ steps, expandedStep, onExpand }: CausalGraphProps) {
  // Deduplicate steps by state (show each state once, with tool counts)
  const seen = new Set<string>();
  const nodes = steps.filter(s => {
    if (seen.has(s.state)) return false;
    seen.add(s.state);
    return true;
  });

  const totalWidth = Math.max(300, nodes.length * H_GAP + 40);

  return (
    <svg width="100%" height="160" viewBox={`0 0 ${totalWidth} 160`} className="overflow-visible">
      {/* Edges */}
      {nodes.map((node, i) => {
        if (i === nodes.length - 1 || !node.nextState) return null;
        const x1 = 40 + i * H_GAP + NODE_RADIUS;
        const x2 = 40 + (i + 1) * H_GAP - NODE_RADIUS;
        return (
          <line
            key={`edge-${i}`}
            x1={x1} y1={V_OFFSET} x2={x2} y2={V_OFFSET}
            stroke="#d1d5db" strokeWidth={2}
            markerEnd="url(#arrowhead)"
          />
        );
      })}

      {/* Arrow marker */}
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#d1d5db" />
        </marker>
      </defs>

      {/* Nodes */}
      {nodes.map((node, i) => {
        const cx = 40 + i * H_GAP;
        const cy = V_OFFSET;
        const color = STATE_COLORS[node.state] || '#999';
        const isExpanded = expandedStep === node.stepIndex;
        const toolCount = node.toolCalls.length;
        const claimCount = node.claims.length;

        return (
          <g key={node.stepIndex} onClick={() => onExpand(isExpanded ? null : node.stepIndex)} className="cursor-pointer">
            <circle cx={cx} cy={cy} r={NODE_RADIUS} fill={color} opacity={0.2} />
            <circle cx={cx} cy={cy} r={NODE_RADIUS} fill="none" stroke={color} strokeWidth={2} />
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} fontWeight="bold" fill={color}>
              {STATE_LABELS[node.state] || node.state}
            </text>

            {/* Tool count badge */}
            {toolCount > 0 && (
              <g transform={`translate(${cx + NODE_RADIUS - 2}, ${cy - NODE_RADIUS - 2})`}>
                <circle r={8} fill="#10b981" />
                <text y={3} textAnchor="middle" fontSize={8} fill="white">{toolCount}</text>
              </g>
            )}

            {/* Claim count badge */}
            {claimCount > 0 && (
              <g transform={`translate(${cx - NODE_RADIUS + 2}, ${cy - NODE_RADIUS - 2})`}>
                <circle r={8} fill="#f59e0b" />
                <text y={3} textAnchor="middle" fontSize={8} fill="white">{claimCount}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
