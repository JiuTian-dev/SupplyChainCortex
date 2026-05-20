'use client';

import { useCallback } from 'react';
import { Download, FileText, FileSpreadsheet, Printer } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  exportToCSV,
  exportToExcel,
  exportToPDF,
} from '@/lib/services/report-export.service';
import type { ExportColumn } from '@/lib/services/report-export.service';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ExportMenuProps {
  /** Data rows to export */
  data: Record<string, unknown>[];
  /** Column definitions for CSV/PDF */
  columns: ExportColumn[];
  /** Base filename (without extension or date) */
  filename: string;
  /** Optional DOM element ID for PDF export (prints content of that element) */
  elementId?: string;
  /** Optional variant to control button styling */
  variant?: 'default' | 'outline' | 'ghost';
  /** Optional size for the trigger button */
  size?: 'default' | 'sm' | 'lg' | 'icon';
  /** Optional additional CSS classes */
  className?: string;
  /** Pass-through label for the trigger button (default: "导出") */
  label?: string;
  /** Show a "导出成功" toast after export (default: true) */
  showToast?: boolean;
  /** Called after any export completes */
  onExport?: (format: 'csv' | 'excel' | 'pdf') => void;
  /**
   * Additional named sheets for Excel export.
   * If provided, the Excel export will include these sheets alongside the main data.
   * Key = sheet name, value = { rows, columns? }.
   */
  extraExcelSheets?: Record<
    string,
    { rows: Record<string, unknown>[]; columns?: ExportColumn[] }
  >;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ExportMenu({
  data,
  columns,
  filename,
  elementId,
  variant = 'outline',
  size = 'sm',
  className = '',
  label = '导出',
  showToast = true,
  onExport,
  extraExcelSheets,
}: ExportMenuProps) {
  const notify = useCallback(
    (format: string) => {
      if (showToast) {
        toast.success('导出成功', {
          description: `「${filename}」已以 ${format} 格式导出`,
        });
      }
    },
    [showToast, filename],
  );

  const handleCSV = useCallback(() => {
    if (!data.length) {
      toast.error('导出失败', { description: '没有可导出的数据' });
      return;
    }
    exportToCSV(data, columns, filename);
    notify('CSV');
    onExport?.('csv');
  }, [data, columns, filename, notify, onExport]);

  const handleExcel = useCallback(() => {
    if (!data.length && (!extraExcelSheets || !Object.keys(extraExcelSheets).length)) {
      toast.error('导出失败', { description: '没有可导出的数据' });
      return;
    }

    const sheets: Record<
      string,
      { rows: Record<string, unknown>[]; columns?: ExportColumn[] }
    > = {};

    // Main sheet
    if (data.length > 0) {
      sheets[filename.length > 30 ? filename.slice(0, 30) : filename || '数据'] = {
        rows: data,
        columns,
      };
    }

    // Extra sheets
    if (extraExcelSheets) {
      for (const [name, sheet] of Object.entries(extraExcelSheets)) {
        if (sheet.rows.length > 0) {
          sheets[name] = sheet;
        }
      }
    }

    exportToExcel(sheets, filename);
    notify('Excel');
    onExport?.('excel');
  }, [data, columns, filename, extraExcelSheets, notify, onExport]);

  const handlePDF = useCallback(() => {
    if (elementId) {
      exportToPDF(elementId, filename, data, columns);
    } else {
      // Without a specific element, export data as PDF via a print-optimized table
      exportToPDF('export-content', filename, data, columns);
    }
    notify('PDF');
    onExport?.('pdf');
  }, [elementId, filename, data, columns, notify, onExport]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={`gap-1 ${className}`}
          disabled={!data.length}
        >
          <Download className="h-3.5 w-3.5" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          导出格式
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCSV} disabled={!data.length}>
          <FileText className="h-3.5 w-3.5 mr-2" />
          导出 CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleExcel}
          disabled={!data.length && (!extraExcelSheets || !Object.keys(extraExcelSheets).length)}
        >
          <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
          导出 Excel
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handlePDF}>
          <Printer className="h-3.5 w-3.5 mr-2" />
          打印 PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
