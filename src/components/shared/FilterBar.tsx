'use client';

import { useState, useMemo, useEffect } from 'react';
import { Search, X, Filter, RotateCcw, Check, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useFilterStore } from '@/stores/filter-store';

// ─── Component ───────────────────────────────────────────────────────────────────

export function FilterBar() {
  const [allSkus, setAllSkus] = useState<Array<{ sku: string; name: string; category: string }>>([]);
  const [allWarehouses, setAllWarehouses] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch product list once on mount
  useEffect(() => {
    fetch('/api/inventory?action=list')
      .then(r => r.json())
      .then(d => {
        const data = d.data || d;
        const items = Array.isArray(data) ? data : (data.inventory || data.items || []);
        const skus = items.map((i: { sku: string; productName?: string; name?: string; category?: string }) => ({
          sku: i.sku,
          name: i.productName || i.name || i.sku,
          category: i.category || '未分类',
        }));
        const warehouses = [...new Set(items.map((i: { warehouse?: string }) => i.warehouse).filter(Boolean))] as string[];
        const categories = [...new Set(items.map((i: { category?: string }) => i.category).filter(Boolean))] as string[];
        setAllSkus(skus);
        setAllWarehouses(warehouses);
        setAllCategories(categories);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const {
    selectedSkus, toggleSku, selectAllSkus, deselectAllSkus,
    selectedWarehouses, setSelectedWarehouses,
    selectedCategories, setSelectedCategories,
    dateRange, setDateRange,
    riskLevels, setRiskLevels,
    skuSearch, setSkuSearch,
    resetFilters, hasActiveFilters,
  } = useFilterStore();

  const [showSkuDropdown, setShowSkuDropdown] = useState(false);

  // Filter SKUs by search
  const filteredSkus = useMemo(() => {
    if (!skuSearch) return allSkus;
    const q = skuSearch.toLowerCase();
    return allSkus.filter(s =>
      s.sku.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  }, [allSkus, skuSearch]);

  const active = hasActiveFilters();
  const selectedCount = selectedSkus.length;
  const totalCount = allSkus.length;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b text-xs flex-wrap">
      <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-[10px] text-muted-foreground font-medium shrink-0">筛选</span>

      {/* ── SKU Multi-Select Dropdown ────────────────────────────────────────── */}
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] gap-1"
          onClick={() => setShowSkuDropdown(!showSkuDropdown)}
        >
          产品
          {selectedCount > 0 && selectedCount < totalCount && (
            <Badge variant="secondary" className="h-4 text-[9px] px-1">{selectedCount}/{totalCount}</Badge>
          )}
          {selectedCount === 0 && <span className="text-muted-foreground">全部</span>}
          <ChevronDown className="h-2.5 w-2.5" />
        </Button>

        {showSkuDropdown && (
          <div className="absolute top-7 left-0 z-50 w-72 bg-card border rounded-lg shadow-lg p-2 max-h-80 overflow-y-auto">
            {/* Search */}
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                className="h-7 text-[10px] pl-7"
                placeholder="搜索产品..."
                value={skuSearch}
                onChange={(e) => setSkuSearch(e.target.value)}
              />
            </div>

            {/* Quick actions */}
            <div className="flex gap-1 mb-1">
              <Button variant="ghost" size="sm" className="h-5 text-[9px]"
                onClick={() => selectAllSkus(allSkus.map(s => s.sku))}>全选</Button>
              <Button variant="ghost" size="sm" className="h-5 text-[9px]"
                onClick={deselectAllSkus}>清除</Button>
            </div>

            {/* Quick filter: ABC class */}
            <div className="flex gap-1 mb-1">
              <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={() => {
                const aSkus = allSkus.filter(s => s.sku <= 'SKU-020').map(s => s.sku);
                selectAllSkus(aSkus);
              }}>A类产品</Button>
              <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={() => {
                const bSkus = allSkus.filter(s => s.sku > 'SKU-020' && s.sku <= 'SKU-050').map(s => s.sku);
                selectAllSkus(bSkus);
              }}>B类产品</Button>
            </div>

            {/* Category filter chips */}
            {allCategories.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {allCategories.map(cat => (
                  <Badge
                    key={cat}
                    variant={selectedCategories.includes(cat) ? 'default' : 'outline'}
                    className="text-[8px] h-4 px-1 cursor-pointer"
                    onClick={() => {
                      if (selectedCategories.includes(cat)) {
                        setSelectedCategories(selectedCategories.filter(c => c !== cat));
                      } else {
                        setSelectedCategories([...selectedCategories, cat]);
                      }
                    }}
                  >{cat}</Badge>
                ))}
              </div>
            )}

            {/* SKU list — grouped by category */}
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {/* Group by category */}
              {(() => {
                const grouped = new Map<string, typeof filteredSkus>();
                for (const s of filteredSkus.slice(0, 100)) {
                  const g = grouped.get(s.category) || [];
                  g.push(s);
                  grouped.set(s.category, g);
                }
                return [...grouped.entries()].map(([cat, items]) => (
                  <div key={cat}>
                    <div className="text-[9px] text-muted-foreground px-2 py-0.5 font-medium sticky top-0 bg-card">{cat} ({items.length})</div>
                    {items.map(s => {
                      const checked = selectedSkus.includes(s.sku) ||
                        (selectedSkus.length === 0 && selectedCategories.length === 0) ||
                        (selectedCategories.length > 0 && selectedCategories.includes(s.category));
                      return (
                        <button
                          key={s.sku}
                          className={`w-full text-left px-2 py-1 rounded text-[10px] flex items-center gap-1.5 hover:bg-muted/50 ${checked ? 'bg-orange-50 dark:bg-orange-950/20' : ''}`}
                          onClick={() => toggleSku(s.sku)}
                        >
                          {checked && <Check className="h-2.5 w-2.5 text-orange-500 shrink-0" />}
                          {!checked && <span className="w-2.5 shrink-0" />}
                          <span className="font-mono text-[9px] text-muted-foreground">{s.sku}</span>
                          <span className="truncate">{s.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          </div>
        )}
      </div>

      {/* ── Warehouse Filter ────────────────────────────────────────────────── */}
      {allWarehouses.length > 1 && (
        <div className="relative">
          <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1"
            onClick={() => {
              if (selectedWarehouses.length > 0) setSelectedWarehouses([]);
              else setSelectedWarehouses([...allWarehouses]);
            }}>
            仓库 {selectedWarehouses.length > 0 ? `(${selectedWarehouses.length})` : '(全部)'}
          </Button>
        </div>
      )}

      {/* ── Risk Level Filter ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-1">
        {(['critical', 'high', 'medium', 'low'] as const).map(level => {
          const colors: Record<string, string> = { critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-amber-500', low: 'bg-emerald-500' };
          const active = riskLevels.includes(level) || riskLevels.length === 0;
          return (
            <Badge key={level}
              variant={active ? 'default' : 'outline'}
              className={`text-[9px] h-4 px-1 cursor-pointer ${active ? '' : 'opacity-40'}`}
              onClick={() => {
                if (riskLevels.includes(level)) setRiskLevels(riskLevels.filter(l => l !== level));
                else setRiskLevels([...riskLevels, level]);
              }}>
              <span className={`w-1.5 h-1.5 rounded-full ${colors[level]} mr-1`} />
              {level === 'critical' ? '严重' : level === 'high' ? '高' : level === 'medium' ? '中' : '低'}
            </Badge>
          );
        })}
      </div>

      {/* ── Date Range ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1">
        <Input type="date" className="h-6 text-[10px] w-28" value={dateRange.from}
          onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })} />
        <span className="text-[9px] text-muted-foreground">至</span>
        <Input type="date" className="h-6 text-[10px] w-28" value={dateRange.to}
          onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })} />
      </div>

      {/* ── Reset ───────────────────────────────────────────────────────────── */}
      {active && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-5 text-[10px] text-muted-foreground" onClick={resetFilters}>
              <RotateCcw className="h-2.5 w-2.5 mr-1" />重置
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-[10px]">清除所有筛选条件</TooltipContent>
        </Tooltip>
      )}

      {/* ── Active filter summary ────────────────────────────────────────────── */}
      {active && (
        <span className="text-[9px] text-muted-foreground ml-auto">
          {selectedSkus.length > 0
            ? `已选 ${selectedSkus.length} 个产品`
            : `全部 ${totalCount} 个产品`}
          {selectedWarehouses.length > 0 && ` · ${selectedWarehouses.length} 仓`}
        </span>
      )}
    </div>
  );
}
