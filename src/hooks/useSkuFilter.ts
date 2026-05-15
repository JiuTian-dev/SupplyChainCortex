'use client';

import { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

/**
 * Shared hook for SKU filtering with URL persistence.
 * Used by InventoryTab, CostTab, LogisticsTab.
 * Extracted to avoid 3× duplicated 8-line blocks (Code Review I-2).
 */
export function useSkuFilter() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedSkus, setSelectedSkus] = useState<string[]>(() => {
    const fromUrl = searchParams.get('skus');
    return fromUrl ? fromUrl.split(',').filter(Boolean) : [];
  });

  const updateSkus = useCallback((skus: string[]) => {
    setSelectedSkus(skus);
    const params = new URLSearchParams(searchParams.toString());
    if (skus.length > 0) params.set('skus', skus.join(','));
    else params.delete('skus');
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const filterParams = useMemo(() => {
    const p: Record<string, string | number> = {};
    if (selectedSkus.length > 0) p.skus = selectedSkus.join(',');
    return p;
  }, [selectedSkus]);

  return { selectedSkus, updateSkus, filterParams };
}
