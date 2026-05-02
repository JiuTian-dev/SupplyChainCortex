/**
 * Shared formatting helpers — eliminate repetitive Math.round / toFixed
 * patterns duplicated across services, components, and API routes.
 */

/** Round a number to `decimals` decimal places */
export function roundTo(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Format as CNY currency string */
export function formatCNY(amount: number, symbol = '¥'): string {
  return `${symbol}${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format as percentage string (e.g. 35.6 → "35.6%") */
export function formatPercent(value: number, decimals = 1): string {
  return `${roundTo(value, decimals).toFixed(decimals)}%`;
}

/** Format integer with thousands separator */
export function formatNumber(n: number): string {
  return n.toLocaleString('zh-CN');
}

/** Clamp value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
