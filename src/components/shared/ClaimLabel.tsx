'use client';

import { useState, useCallback } from 'react';
import { Check, X, AlertTriangle, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

// ─── Types ───────────────────────────────────────────────────────────────────────

export type ClaimVerdict = 'accurate' | 'inaccurate' | 'outdated' | 'irrelevant' | 'unverified';

export interface ClaimData {
  id: string;
  text: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
  verdict?: ClaimVerdict;
}

export interface FeedbackClaimsMap {
  [claimId: string]: ClaimVerdict;
}

// ─── Confidence Colors ────────────────────────────────────────────────────────────

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'border-l-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/10',
  medium: 'border-l-amber-400 bg-amber-50/30 dark:bg-amber-950/10',
  low: 'border-l-red-400 bg-red-50/30 dark:bg-red-950/10',
};

const VERDICT_ICONS: Record<ClaimVerdict, React.ReactNode> = {
  accurate: <ThumbsUp className="h-3 w-3" />,
  inaccurate: <ThumbsDown className="h-3 w-3" />,
  outdated: <RotateCcw className="h-3 w-3" />,
  irrelevant: <X className="h-3 w-3" />,
  unverified: <AlertTriangle className="h-3 w-3" />,
};

// ─── ClaimLabel Component ─────────────────────────────────────────────────────────

interface ClaimLabelProps {
  claim: ClaimData;
  onVerdict: (claimId: string, verdict: ClaimVerdict) => void;
  disabled?: boolean;
}

export function ClaimLabel({ claim, onVerdict, disabled }: ClaimLabelProps) {
  const [showActions, setShowActions] = useState(false);
  const [selectedVerdict, setSelectedVerdict] = useState<ClaimVerdict | undefined>(claim.verdict);

  const handleVerdict = useCallback((verdict: ClaimVerdict) => {
    setSelectedVerdict(verdict);
    onVerdict(claim.id, verdict);
    setShowActions(false);
  }, [claim.id, onVerdict]);

  const confidenceLabel = claim.confidence === 'high' ? '高' : claim.confidence === 'medium' ? '中' : '低';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded border-l-2 text-[11px] cursor-pointer transition-all
            ${CONFIDENCE_STYLES[claim.confidence]}
            ${selectedVerdict === 'accurate' ? 'ring-1 ring-emerald-400' : ''}
            ${selectedVerdict === 'inaccurate' || selectedVerdict === 'outdated' ? 'ring-1 ring-red-400 opacity-70' : ''}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-sm'}`}
          onClick={() => !disabled && setShowActions(!showActions)}
        >
          <span className="font-mono text-[10px] text-muted-foreground">{claim.id}</span>
          {selectedVerdict && (
            <span className={selectedVerdict === 'accurate' ? 'text-emerald-500' : 'text-red-500'}>
              {VERDICT_ICONS[selectedVerdict]}
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs p-2 space-y-1">
        <p className="font-medium">{claim.text.slice(0, 100)}</p>
        <p className="text-muted-foreground">来源: {claim.source} · 置信度: {confidenceLabel}</p>
        {selectedVerdict && <p className="text-muted-foreground">已标注: {selectedVerdict}</p>}
      </TooltipContent>

      {showActions && !disabled && (
        <span className="inline-flex gap-0.5 mx-1 align-middle">
          <button
            className="p-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600"
            onClick={(e) => { e.stopPropagation(); handleVerdict('accurate'); }}
            title="准确"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
            onClick={(e) => { e.stopPropagation(); handleVerdict('inaccurate'); }}
            title="不准确"
          >
            <X className="h-3 w-3" />
          </button>
          <button
            className="p-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-500"
            onClick={(e) => { e.stopPropagation(); handleVerdict('outdated'); }}
            title="数据过时"
          >
            <AlertTriangle className="h-3 w-3" />
          </button>
        </span>
      )}
    </Tooltip>
  );
}

// ─── Claim Parser ─────────────────────────────────────────────────────────────────

/**
 * Extract claims from agent response text.
 * Matches: [claim-N] followed by text until the next claim or end of paragraph.
 */
export function parseClaimsFromText(content: string): ClaimData[] {
  const claims: ClaimData[] = [];
  const claimRegex = /\[claim-(\d+)\]\s*([^\[]*?)(?=\[claim-|$)/g;
  let match;
  const seenIds = new Set<string>();

  while ((match = claimRegex.exec(content)) !== null) {
    const claimNum = match[1];
    const body = match[2].trim();

    // Skip duplicates (agent sometimes repeats claim numbers)
    if (seenIds.has(`claim-${claimNum}`)) continue;
    seenIds.add(`claim-${claimNum}`);

    // Skip if body is too short (fragment)
    if (body.length < 5) continue;

    // Extract source
    const sourceMatch = body.match(/数据源[：:]\s*([^,，。.\n]+)/);
    const source = sourceMatch ? sourceMatch[1].trim() : '未标注';

    // Extract confidence
    const confMatch = body.match(/置信度[：:]\s*(高|中|低)/);
    const confidence = confMatch
      ? (confMatch[1] === '高' ? 'high' : confMatch[1] === '中' ? 'medium' : 'low')
      : 'medium';

    claims.push({
      id: `claim-${claimNum}`,
      text: body.replace(/数据源[：:][^,，。.\n]*/, '').replace(/置信度[：:][^,，。.\n]*/, '').trim(),
      source,
      confidence,
    });
  }

  return claims;
}
