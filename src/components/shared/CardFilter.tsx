'use client';

import { useState, useEffect } from 'react';
import { Filter, Check, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// ─── Types ───────────────────────────────────────────────────────────────────────

interface CardFilterProps {
  /** Type of filter determines what data to show */
  type: 'product' | 'warehouse' | 'status' | 'category';
  /** Currently selected values */
  selected: string[];
  /** Called when selection changes */
  onChange: (values: string[]) => void;
  /** Label for the filter button */
  label?: string;
  /** Pre-defined options (avoids fetch) */
  options?: string[];
}

// ─── Component ───────────────────────────────────────────────────────────────────

export function CardFilter({ type, selected, onChange, label, options: presetOptions }: CardFilterProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<string[]>(presetOptions || []);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (presetOptions && presetOptions.length > 0) {
      setOptions(presetOptions);
      return;
    }
    // Fetch options based on type
    if (type === 'warehouse') {
      fetch('/api/inventory?action=list')
        .then(r => r.json()).then(d => {
          const items = Array.isArray(d.data) ? d.data : (d.data?.inventory || []);
          setOptions([...new Set(items.map((i: { warehouse?: string }) => i.warehouse).filter(Boolean))] as string[]);
        }).catch(() => {});
    }
    if (type === 'status') {
      setOptions(['healthy', 'warning', 'critical', 'overstock']);
    }
  }, [type, presetOptions]);

  const filtered = search
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggle = (v: string) => {
    if (selected.includes(v)) onChange(selected.filter(s => s !== v));
    else onChange([...selected, v]);
  };

  const labels: Record<string, string> = {
    product: label || '产品', warehouse: label || '仓库', status: label || '状态', category: label || '品类',
  };
  const displayLabels: Record<string, string> = {
    healthy: '健康', warning: '预警', critical: '紧急', overstock: '积压',
  };

  return (
    <div className="relative inline-flex">
      <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setOpen(!open)}>
        <Filter className="h-3 w-3" />
        {labels[type]}
        {selected.length > 0 && selected.length < options.length && (
          <Badge variant="secondary" className="h-4 text-[9px] px-1">{selected.length}</Badge>
        )}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-7 right-0 z-50 w-48 bg-card border rounded-lg shadow-lg p-2">
            {options.length > 8 && (
              <div className="relative mb-1">
                <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-muted-foreground" />
                <Input className="h-6 text-[10px] pl-6" placeholder="搜索..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            )}
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {filtered.map(opt => (
                <button key={opt}
                  className={`w-full text-left px-2 py-0.5 rounded text-[10px] flex items-center gap-1 ${selected.includes(opt) ? 'bg-orange-50 dark:bg-orange-950/20' : ''}`}
                  onClick={() => toggle(opt)}>
                  {selected.includes(opt) && <Check className="h-2.5 w-2.5 text-orange-500" />}
                  {!selected.includes(opt) && <span className="w-2.5" />}
                  {displayLabels[opt] || opt}
                </button>
              ))}
            </div>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="w-full text-[9px] text-muted-foreground mt-1 pt-1 border-t">清除</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
