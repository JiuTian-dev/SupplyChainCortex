/**
 * Shared hook: filtered data with search + multi-criteria filtering.
 * Eliminates duplicated useMemo filter patterns across all tab components.
 */

import { useMemo } from 'react';

export interface FilterConfig<T> {
  data: T[];
  searchQuery: string;
  searchFields: (keyof T)[];
  filters: Record<string, string>;
  filterFieldMap: Record<string, keyof T>;
}

export function useFilteredData<T extends Record<string, unknown>>(config: FilterConfig<T>): T[] {
  const { data, searchQuery, searchFields, filters, filterFieldMap } = config;

  return useMemo(() => {
    let result = data;

    // Apply dropdown/category filters
    for (const [filterKey, filterValue] of Object.entries(filters)) {
      if (filterValue !== 'all' && filterValue !== '' && filterFieldMap[filterKey]) {
        const field = filterFieldMap[filterKey];
        result = result.filter((item) => item[field] === filterValue);
      }
    }

    // Apply text search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((item) =>
        searchFields.some((field) => {
          const val = item[field];
          return typeof val === 'string' && val.toLowerCase().includes(q);
        })
      );
    }

    return result;
  }, [data, searchQuery, searchFields, filters, filterFieldMap]);
}
