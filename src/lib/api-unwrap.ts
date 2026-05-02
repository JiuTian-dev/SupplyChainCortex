/**
 * Utility to unwrap API response data from TanStack Query results.
 *
 * Many API routes wrap responses as `{ data: T }`. This utility safely extracts
 * the inner `data` property when present, falling back to the raw value.
 *
 * @example
 * const costs = unwrapApiData<CostRecord[]>(costListQuery.data);
 * // instead of: (costListQuery.data as any)?.data ?? costListQuery.data
 */

/** Unwrap API response — if the value has a `.data` property, return it; else return the value as-is */
export function unwrapApiData<T>(raw: unknown): T | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'object' && 'data' in raw && (raw as Record<string, unknown>).data !== undefined) {
    return (raw as Record<string, unknown>).data as T;
  }
  return raw as T;
}

/** Extract a typed array from API response, defaulting to empty array */
export function unwrapApiArray<T>(raw: unknown, key: string): T[] {
  if (raw === null || raw === undefined) return [];
  const obj = raw as Record<string, unknown>;
  const data = obj.data !== undefined ? (obj.data as Record<string, unknown>) : obj;
  return Array.isArray(data[key]) ? (data[key] as T[]) : [];
}

/** Extract a typed object summary from API response */
export function unwrapApiSummary<T extends Record<string, unknown>>(raw: unknown, defaults: T): T {
  if (raw === null || raw === undefined) return defaults;
  const obj = raw as Record<string, unknown>;
  const data = obj.data !== undefined ? (obj.data as Record<string, unknown>) : obj;
  const summary = (data.summary || data) as Record<string, unknown>;
  return { ...defaults, ...summary } as T;
}
