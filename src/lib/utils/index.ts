import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── CSV 导出工具 ────────────────────────────────────────────────────────────────

export function exportToCSV(data: Record<string, unknown>[], filename: string, columns: { key: string; label: string }[]) {
  const BOM = '﻿';
  const header = columns.map(c => c.label).join(',');
  const rows = data.map(row =>
    columns.map(c => {
      const val = row[c.key];
      const str = val === null || val === undefined ? '' : String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',')
  );
  const csv = BOM + header + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── 相对时间格式化 ──────────────────────────────────────────────────────────────

export function formatRelativeTime(isoTime: string): string {
  const diff = Date.now() - new Date(isoTime).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

// ─── 数字动画工具 ────────────────────────────────────────────────────────────────

export function animateValue(
  from: number,
  to: number,
  duration: number,
  callback: (value: number) => void
) {
  if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') {
    callback(to);
    return;
  }
  const start = performance.now();
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  function update(currentTime: number) {
    const elapsed = currentTime - start;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutCubic(progress);
    const currentValue = from + (to - from) * easedProgress;
    callback(Math.round(currentValue));
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// ─── Re-exports from sub-modules ─────────────────────────────────────────────────

export { toDateString, todayISO, daysAgo, daysFromNow, startOfMonth, endOfMonth, isValidDateString, parseDateString } from './date';
export { roundTo, formatCNY, formatPercent, formatNumber, clamp } from './format';
