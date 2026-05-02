/**
 * Shared date helpers — eliminates repetitive Date → string conversions
 * scattered across services, API routes, and components.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Format a Date as ISO date string (YYYY-MM-DD) in local timezone */
export function toDateString(d: Date): string {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/** Today as YYYY-MM-DD */
export function todayISO(): string {
  return toDateString(new Date());
}

/** N days ago as YYYY-MM-DD */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateString(d);
}

/** N days from now as YYYY-MM-DD */
export function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toDateString(d);
}

/** First day of current month (offset -1 = last month, 1 = next month) */
export function startOfMonth(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  return toDateString(d);
}

/** Last day of current month (offset -1 = last month, 1 = next month) */
export function endOfMonth(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset + 1, 0);
  return toDateString(d);
}

/** Validate YYYY-MM-DD format */
export function isValidDateString(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Parse a YYYY-MM-DD string to a local Date */
export function parseDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
