'use client';

import { useState, useCallback, useMemo } from 'react';

/**
 * A reusable hook that manages batch selection state for data tables.
 *
 * @param items - The current list of items (typically filtered/displayed items).
 * @param idFn - A function that extracts a unique string ID from an item.
 * @returns Selection state and action callbacks.
 */
export function useBatchSelection<T>(items: T[], idFn: (item: T) => string) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /** True when every item in the list is currently selected. */
  const isAllSelected = useMemo(() => {
    if (items.length === 0) return false;
    return items.every((item) => selectedIds.has(idFn(item)));
  }, [items, selectedIds, idFn]);

  /** True when some (but not all) items are selected — used for indeterminate checkbox state. */
  const isIndeterminate = useMemo(() => {
    if (items.length === 0) return false;
    const someSelected = items.some((item) => selectedIds.has(idFn(item)));
    return someSelected && !isAllSelected;
  }, [items, selectedIds, idFn, isAllSelected]);

  /** Total number of selected items across the entire dataset (not just the filtered view). */
  const selectedCount = selectedIds.size;

  /** Toggle a single item's selection by its ID. */
  const toggleItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  /**
   * Toggle all items in the current list.
   * - If all are selected, deselect all (but leave items outside the list untouched).
   * - Otherwise, add every item in the list to the selection.
   */
  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allItemIds = items.map((item) => idFn(item));
      const everyItemSelected = allItemIds.every((id) => prev.has(id));
      if (everyItemSelected) {
        const next = new Set(prev);
        for (const id of allItemIds) {
          next.delete(id);
        }
        return next;
      }
      const next = new Set(prev);
      for (const id of allItemIds) {
        next.add(id);
      }
      return next;
    });
  }, [items, idFn]);

  /** Clear all selections. */
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    /** The current set of selected IDs. */
    selectedIds,
    /** True when every item in the current list is selected. */
    isAllSelected,
    /** True when some items are selected but not all (indeterminate checkbox). */
    isIndeterminate,
    /** Total count of selected items. */
    selectedCount,
    /** Toggle a single item by its ID. */
    toggleItem,
    /** Toggle all items in the current list (select-all / deselect-all). */
    toggleAll,
    /** Clear the entire selection set. */
    clearSelection,
  } as const;
}
