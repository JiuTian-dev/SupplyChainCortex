'use client';

import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// ─── Types ───────────────────────────────────────────────────────────────────────

interface FilterChipsProps {
  /** Currently selected SKU codes */
  selected: string[];
  /** SKU → display name map (fetched from ProductFilter's data) */
  labels: Record<string, string>;
  /** Called when a chip's X is clicked */
  onRemove: (sku: string) => void;
  /** Called when "清除全部" is clicked */
  onClearAll: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────────

export function FilterChips({ selected, labels, onRemove, onClearAll }: FilterChipsProps) {
  if (selected.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {selected.map(sku => (
        <Badge
          key={sku}
          variant="secondary"
          className="h-5 text-[10px] gap-1 pl-2 pr-1 cursor-pointer hover:bg-muted"
        >
          <span className="font-mono text-[9px] text-muted-foreground">{sku}</span>
          <span>{labels[sku] || sku}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(sku); }}
            className="ml-0.5 hover:bg-muted-foreground/20 rounded-full p-0.5"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
      ))}
      {selected.length > 1 && (
        <button
          onClick={onClearAll}
          className="text-[10px] text-muted-foreground hover:text-foreground ml-1"
        >
          清除全部
        </button>
      )}
    </div>
  );
}
