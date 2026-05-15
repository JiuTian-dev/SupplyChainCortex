'use client';

import { useState, useEffect } from 'react';
import { Search, Boxes, DollarSign, Ship, TrendingUp, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardUIStore } from '@/stores/useDashboardUIStore';
import { useProductSearch } from '@/hooks/use-supply-chain-data';

interface SearchProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  subCategory: string;
  unitCost: number;
  sellingPrice: number;
  abcClass: string;
  fsnClass: string;
  inventory?: { quantity: number; stockStatus: string; turnoverDays: number; warehouse: string } | null;
  cost?: { totalLanded: number; grossMargin: number } | null;
}

export interface GlobalSearchProps {
  onSelectResult?: (tab: string, sku: string) => void;
  onViewDetail?: (sku: string) => void;
}

export function GlobalSearch({ onSelectResult, onViewDetail }: GlobalSearchProps) {
  const globalSearchOpen = useDashboardUIStore((s) => s.globalSearchOpen);
  const setGlobalSearchOpen = useDashboardUIStore((s) => s.setGlobalSearchOpen);
  const globalSearchQuery = useDashboardUIStore((s) => s.globalSearchQuery);
  const setGlobalSearchQuery = useDashboardUIStore((s) => s.setGlobalSearchQuery);
  const setActiveTab = useDashboardUIStore((s) => s.setActiveTab);

  // Debounced query for API search
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(globalSearchQuery), 300);
    return () => clearTimeout(timer);
  }, [globalSearchQuery]);

  const { data: searchResult, isLoading } = useProductSearch(debouncedQ);
  const products: SearchProduct[] = (searchResult as { products?: SearchProduct[] } | undefined)?.products ?? [];

  // Group products by category
  const categoryGroups = products.reduce<Record<string, SearchProduct[]>>((acc, p) => {
    const key = p.category || '其他';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const handleSelect = (tab: string, sku: string) => {
    setGlobalSearchOpen(false);
    setGlobalSearchQuery('');
    setActiveTab(tab);
    onSelectResult?.(tab, sku);
  };

  const handleViewDetail = (sku: string) => {
    setGlobalSearchOpen(false);
    setGlobalSearchQuery('');
    onViewDetail?.(sku);
  };

  const categoryIcon: Record<string, { icon: React.ReactNode; tab: string; color: string }> = {
    '厨房电器': { icon: <Boxes className="h-3.5 w-3.5 text-emerald-500" />, tab: 'inventory', color: 'emerald' },
    '清洁电器': { icon: <DollarSign className="h-3.5 w-3.5 text-orange-500" />, tab: 'cost', color: 'orange' },
    '个人护理': { icon: <TrendingUp className="h-3.5 w-3.5 text-cyan-500" />, tab: 'sales', color: 'cyan' },
  };

  const defaultGroup = { icon: <Ship className="h-3.5 w-3.5 text-violet-500" />, tab: 'inventory', color: 'violet' };

  return (
    <Dialog open={globalSearchOpen} onOpenChange={setGlobalSearchOpen}>
      <DialogContent className="sm:max-w-lg w-[95vw] max-h-[90vh] sm:max-h-auto backdrop-blur-sm border shadow-2xl dialog-scale-in">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            全局搜索
          </DialogTitle>
          <DialogDescription>
            搜索所有产品的 SKU、名称或分类
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="输入关键词搜索..."
            value={globalSearchQuery}
            onChange={(e) => setGlobalSearchQuery(e.target.value)}
            className="h-9"
            autoFocus
          />
          {globalSearchQuery.length >= 2 && isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {globalSearchQuery.length >= 2 && !isLoading && products.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">未找到匹配的产品</p>
            </div>
          )}
          {!isLoading && products.length > 0 && (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {Object.entries(categoryGroups).map(([category, items]) => {
                const cfg = categoryIcon[category] ?? defaultGroup;
                return (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-2">
                      {cfg.icon}
                      <span className="text-xs font-semibold text-muted-foreground">{category}</span>
                      <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                    </div>
                    <div className="space-y-1">
                      {items.map((p) => (
                        <div
                          key={p.sku}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors flex items-center justify-between group"
                        >
                          <button
                            className="flex-1 text-left"
                            onClick={() => handleSelect(cfg.tab, p.sku)}
                          >
                            <span className="text-sm font-medium">{p.name}</span>
                            <span className="text-xs text-muted-foreground ml-2 font-mono">{p.sku}</span>
                            {p.inventory && (
                              <Badge variant="outline" className="text-[10px] ml-1">
                                {p.inventory.stockStatus}
                              </Badge>
                            )}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleViewDetail(p.sku); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-orange-500 hover:text-orange-600 flex items-center gap-0.5 ml-2"
                          >
                            查看详情 <ExternalLink className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {globalSearchQuery.length < 2 && globalSearchQuery.length > 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">请输入至少2个字符开始搜索</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
