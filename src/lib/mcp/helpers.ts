/**
 * Shared MCP helper utilities.
 */

/**
 * Truncate large result sets to keep MCP tool responses concise.
 * Arrays longer than `maxItems` are sliced; object properties containing
 * oversized arrays are replaced with a summary descriptor.
 */
export function summarize<T>(data: T, maxItems = 20): T {
  if (Array.isArray(data)) {
    if (data.length > maxItems) return data.slice(0, maxItems) as T;
  }
  if (data && typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(value) && value.length > maxItems) {
        result[key] = { items: value.slice(0, maxItems), total: value.length, truncated: true, note: `显示前 ${maxItems} 条，共 ${value.length} 条` };
      } else {
        result[key] = value;
      }
    }
    return result as T;
  }
  return data;
}
