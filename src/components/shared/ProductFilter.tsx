'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, X, Check, ChevronDown, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// ─── Types ───────────────────────────────────────────────────────────────────────

interface SkuInfo {
  sku: string;
  name: string;
  category: string;
}

interface ProductFilterProps {
  /** Currently selected SKUs (empty = all) */
  selected: string[];
  /** Called when selection changes */
  onChange: (skus: string[]) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────────

export function ProductFilter({ selected, onChange }: ProductFilterProps) {
  const [allSkus, setAllSkus] = useState<SkuInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/inventory?action=list')
      .then(r => r.json())
      .then(d => {
        const data = d.data || d;
        const items = Array.isArray(data) ? data : (data.inventory || data.items || []);
        setAllSkus(items.map((i: { sku: string; productName?: string; name?: string; category?: string }) => ({
          sku: i.sku,
          name: i.productName || i.name || i.sku,
          category: i.category || '未分类',
        })));
      }).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (!search) return allSkus;
    const q = search.toLowerCase();
    return allSkus.filter(s => s.sku.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }, [allSkus, search]);

  const toggle = (sku: string) => {
    if (selected.includes(sku)) {
      onChange(selected.filter(s => s !== sku));
    } else {
      onChange([...selected, sku]);
    }
  };

  const selectAll = () => onChange(allSkus.map(s => s.sku));
  const clearAll = () => onChange([]);
  const hasFilter = selected.length > 0 && selected.length < allSkus.length;

  return (
    <div className="relative inline-flex items-center gap-1">
      <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => setOpen(!open)}>
        筛选产品
        {hasFilter && <Badge variant="secondary" className="h-4 text-[9px] px-1">{selected.length}</Badge>}
        {selected.length === 0 && <span className="text-muted-foreground">全部({allSkus.length})</span>}
        <ChevronDown className="h-3 w-3" />
      </Button>
      {hasFilter && (
        <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={clearAll}>
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-9 left-0 z-50 w-72 bg-card border rounded-lg shadow-lg p-2 max-h-80 overflow-y-auto">
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input className="h-7 text-[10px] pl-7" placeholder="搜索..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1 mb-1">
              <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={selectAll}>全选</Button>
              <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={clearAll}>清除</Button>
            </div>
            {/* Grouped by category */}
            {(() => {
              const grouped = new Map<string, SkuInfo[]>();
              for (const s of filtered.slice(0, 100)) {
                const g = grouped.get(s.category) || [];
                g.push(s); grouped.set(s.category, g);
              }
              return [...grouped.entries()].map(([cat, items]) => (
                <div key={cat}>
                  <div className="text-[9px] text-muted-foreground px-2 py-0.5 font-medium sticky top-0 bg-card">{cat}</div>
                  {items.map(s => {
                    const checked = selected.includes(s.sku) || selected.length === 0;
                    return (
                      <button key={s.sku}
                        className={`w-full text-left px-2 py-1 rounded text-[10px] flex items-center gap-1.5 hover:bg-muted/50 ${selected.includes(s.sku) ? 'bg-orange-50 dark:bg-orange-950/20' : ''}`}
                        onClick={() => toggle(s.sku)}>
                        {selected.includes(s.sku) && <Check className="h-2.5 w-2.5 text-orange-500 shrink-0" />}
                        {!selected.includes(s.sku) && <span className="w-2.5 shrink-0" />}
                        <span className="font-mono text-[9px] text-muted-foreground">{s.sku}</span>
                        <span className="truncate">{s.name}</span>
                      </button>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        </>
      )}
    </div>
  );
}
