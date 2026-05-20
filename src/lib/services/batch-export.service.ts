/**
 * Batch Export Service
 *
 * Provides frontend CSV and XLSX-compatible export utilities for
 * batch operations on selected data table rows.
 *
 * Uses papaparse for CSV generation (already a project dependency).
 */

import Papa from 'papaparse';

/**
 * Escape a single CSV value, wrapping in quotes if it contains
 * a comma, double-quote, or newline.
 */
function escapeField(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of records to a CSV string using papaparse.
 * Falls back to manual generation if papaparse is unavailable (edge case).
 */
function toCsvString(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';

  try {
    // papaparse handles field escaping, but doesn't add BOM
    return Papa.unparse(data, { quotes: true });
  } catch {
    // Graceful fallback
    const headers = Object.keys(data[0]);
    const headerRow = headers.map(escapeField).join(',');
    const dataRows = data.map((row) =>
      headers.map((h) => escapeField(row[h])).join(','),
    );
    return headerRow + '\n' + dataRows.join('\n');
  }
}

/**
 * Trigger a browser download for the given content.
 */
function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob(['﻿' + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Export an array of records as a CSV file download.
 *
 * @param data  - Array of flat records (keys become CSV headers).
 * @param filename - Base filename (without extension); a date suffix is appended.
 */
export function exportToCSV(data: Record<string, unknown>[], filename: string): void {
  if (data.length === 0) return;

  const csv = toCsvString(data);
  const datePart = new Date().toISOString().slice(0, 10);
  triggerDownload(csv, `${filename}_${datePart}.csv`, 'text/csv;charset=utf-8;');
}

/**
 * Export an array of records as an XLSX-compatible CSV file download.
 *
 * The content is a CSV that Excel can open natively, with UTF-8 BOM
 * for correct character encoding. The file extension is `.xls` so that
 * Excel opens it without needing to go through the text import wizard.
 *
 * @param data  - Array of flat records (keys become column headers).
 * @param filename - Base filename (without extension); a date suffix is appended.
 */
export function exportToExcel(data: Record<string, unknown>[], filename: string): void {
  if (data.length === 0) return;

  const csv = toCsvString(data);
  const datePart = new Date().toISOString().slice(0, 10);
  triggerDownload(
    csv,
    `${filename}_${datePart}.xls`,
    'application/vnd.ms-excel;charset=utf-8',
  );
}

/**
 * Get the selected records from a data array using a set of selected IDs.
 *
 * @param data  - Full data array.
 * @param selectedIds - Set of selected ID strings.
 * @param idFn  - Function that extracts a string ID from a data item.
 * @returns Filtered array of only the selected records.
 */
export function getSelectedRecords<T extends Record<string, unknown>>(
  data: T[],
  selectedIds: Set<string>,
  idFn: (item: T) => string,
): T[] {
  return data.filter((item) => selectedIds.has(idFn(item)));
}
