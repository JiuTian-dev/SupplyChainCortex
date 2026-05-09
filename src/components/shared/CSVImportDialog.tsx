'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import Papa from 'papaparse';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

// ==================== Types ====================
type ImportType = 'products' | 'inventory';

interface ImportError {
  row: number;
  field: string;
  message: string;
}

interface ParsedRow {
  row: number;
  data: Record<string, string>;
  errors: string[];
}

// ==================== Template Headers ====================
const PRODUCT_TEMPLATE_HEADERS = ['SKU', '名称', '分类', '子分类', '单位成本', '售价', '重量', '产地'];
const INVENTORY_TEMPLATE_HEADERS = ['SKU', '产品名', '仓库', '数量', '安全库存', '再订购点'];

const PRODUCT_FIELD_MAP: Record<string, string> = {
  'SKU': 'sku',
  '名称': 'name',
  '分类': 'category',
  '子分类': 'subCategory',
  '单位成本': 'unitCost',
  '售价': 'sellingPrice',
  '重量': 'weight',
  '产地': 'origin',
};

const INVENTORY_FIELD_MAP: Record<string, string> = {
  'SKU': 'sku',
  '产品名': 'productName',
  '仓库': 'warehouse',
  '数量': 'quantity',
  '安全库存': 'safetyStock',
  '再订购点': 'reorderPoint',
};

// ==================== CSV Parsing (papaparse) ====================
function parseCSV(text: string): string[][] {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    console.warn('CSV parse warnings:', result.errors);
  }
  return result.data.filter((row) => row.some((cell) => cell.trim() !== ''));
}

// ==================== Validation ====================
function validateProductRow(row: Record<string, string>): string[] {
  const errors: string[] = [];
  if (!row.sku) errors.push('SKU不能为空');
  if (!row.name) errors.push('名称不能为空');
  if (!row.category) errors.push('分类不能为空');
  if (row.unitCost !== undefined && row.unitCost !== '' && isNaN(Number(row.unitCost))) errors.push('单位成本必须是数字');
  if (row.sellingPrice !== undefined && row.sellingPrice !== '' && isNaN(Number(row.sellingPrice))) errors.push('售价必须是数字');
  if (row.weight !== undefined && row.weight !== '' && isNaN(Number(row.weight))) errors.push('重量必须是数字');
  if (row.unitCost !== undefined && Number(row.unitCost) < 0) errors.push('单位成本不能为负');
  if (row.sellingPrice !== undefined && Number(row.sellingPrice) < 0) errors.push('售价不能为负');
  if (row.weight !== undefined && Number(row.weight) < 0) errors.push('重量不能为负');
  return errors;
}

function validateInventoryRow(row: Record<string, string>): string[] {
  const errors: string[] = [];
  if (!row.sku) errors.push('SKU不能为空');
  if (!row.warehouse) errors.push('仓库不能为空');
  if (row.quantity === undefined || row.quantity === '' || isNaN(Number(row.quantity))) errors.push('数量必须是数字');
  if (row.safetyStock !== undefined && row.safetyStock !== '' && isNaN(Number(row.safetyStock))) errors.push('安全库存必须是数字');
  if (row.reorderPoint !== undefined && row.reorderPoint !== '' && isNaN(Number(row.reorderPoint))) errors.push('再订购点必须是数字');
  return errors;
}

// ==================== Template Download ====================
function downloadTemplate(type: ImportType) {
  const headers = type === 'products' ? PRODUCT_TEMPLATE_HEADERS : INVENTORY_TEMPLATE_HEADERS;
  const csvContent = headers.join(',') + '\n';
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = type === 'products' ? '产品导入模板.csv' : '库存导入模板.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success('模板已下载');
}

// ==================== Component Props ====================
export interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ==================== CSVImportDialog ====================
export function CSVImportDialog({ open, onOpenChange }: CSVImportDialogProps) {
  const [importType, setImportType] = useState<ImportType>('products');
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ success: number; errors: ImportError[] } | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      toast.error('请选择 CSV 文件');
      return;
    }
    setFile(selectedFile);
    setResult(null);
    setParsedRows([]);
    setHeaders([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast.error('文件内容为空');
        return;
      }

      const csvHeaders = rows[0];
      setHeaders(csvHeaders);

      const fieldMap = importType === 'products' ? PRODUCT_FIELD_MAP : INVENTORY_FIELD_MAP;
      const validator = importType === 'products' ? validateProductRow : validateInventoryRow;

      const parsed: ParsedRow[] = [];
      for (let i = 1; i < rows.length; i++) {
        const rowData: Record<string, string> = {};
        csvHeaders.forEach((header, idx) => {
          const fieldName = fieldMap[header] || header;
          rowData[fieldName] = rows[i][idx] || '';
        });
        const errors = validator(rowData);
        parsed.push({ row: i + 1, data: rowData, errors });
      }
      setParsedRows(parsed);
    };
    reader.readAsText(selectedFile, 'utf-8');
  }, [importType]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleImport = async () => {
    if (parsedRows.length === 0) return;

    setImporting(true);
    setProgress(0);
    setResult(null);

    let successCount = 0;
    const importErrors: ImportError[] = [];

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      setProgress(Math.round(((i + 1) / parsedRows.length) * 100));

      // Skip rows with validation errors
      if (row.errors.length > 0) {
        row.errors.forEach((err) => {
          importErrors.push({ row: row.row, field: '', message: err });
        });
        continue;
      }

      try {
        if (importType === 'products') {
          const res = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sku: row.data.sku,
              name: row.data.name,
              category: row.data.category,
              subCategory: row.data.subCategory || '',
              unitCost: Number(row.data.unitCost) || 0,
              sellingPrice: Number(row.data.sellingPrice) || 0,
              weight: Number(row.data.weight) || 0,
              origin: row.data.origin || 'CN',
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            importErrors.push({ row: row.row, field: 'sku', message: data.error || '创建失败' });
          } else {
            successCount++;
          }
        } else {
          // Inventory: use adjustment action for positive quantity (inbound)
          const qty = Number(row.data.quantity) || 0;
          const res = await fetch('/api/inventory?action=adjustment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sku: row.data.sku,
              quantity: qty,
              reason: `CSV导入 - ${row.data.warehouse || '默认仓库'}`,
              warehouse: row.data.warehouse || '上海仓库',
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            importErrors.push({ row: row.row, field: 'sku', message: data.error || '调整失败' });
          } else {
            successCount++;
          }
        }
      } catch {
        importErrors.push({ row: row.row, field: '', message: '网络错误' });
      }
    }

    setImporting(false);
    setResult({ success: successCount, errors: importErrors });

    if (importErrors.length === 0) {
      toast.success(`成功导入 ${successCount} 条记录`);
    } else {
      toast.warning(`导入完成: ${successCount} 成功, ${importErrors.length} 失败`);
    }
  };

  const resetState = () => {
    setFile(null);
    setParsedRows([]);
    setHeaders([]);
    setImporting(false);
    setProgress(0);
    setResult(null);
    setShowErrors(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) resetState();
    onOpenChange(open);
  };

  const previewRows = parsedRows.slice(0, 5);
  const displayHeaders = headers.length > 0 ? headers : (importType === 'products' ? PRODUCT_TEMPLATE_HEADERS : INVENTORY_TEMPLATE_HEADERS);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            数据导入
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Import type selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">导入类型</Label>
            <Select value={importType} onValueChange={(v) => { setImportType(v as ImportType); resetState(); }}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="products">产品数据</SelectItem>
                <SelectItem value="inventory">库存数据</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Template download */}
          <button
            onClick={() => downloadTemplate(importType)}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            模板下载
          </button>

          <Separator />

          {/* File upload area */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              file
                ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/20'
                : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                <div className="text-left">
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                    {parsedRows.length > 0 && ` · ${parsedRows.length} 行数据`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetState();
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div>
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">点击或拖拽 CSV 文件到此处</p>
                <p className="text-xs text-muted-foreground/60 mt-1">仅支持 .csv 格式</p>
              </div>
            )}
          </div>

          {/* Preview table */}
          {previewRows.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                数据预览
                <span className="text-muted-foreground font-normal ml-1">
                  (前 {Math.min(5, parsedRows.length)} 行，共 {parsedRows.length} 行)
                </span>
              </Label>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">#</TableHead>
                      {displayHeaders.map((h, i) => (
                        <TableHead key={i} className="text-xs whitespace-nowrap">{h}</TableHead>
                      ))}
                      <TableHead className="w-16 text-center">状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row) => (
                      <TableRow key={row.row}>
                        <TableCell className="text-center text-xs text-muted-foreground">{row.row}</TableCell>
                        {displayHeaders.map((header, i) => (
                          <TableCell key={i} className="text-xs max-w-[120px] truncate">
                            {row.data[PRODUCT_FIELD_MAP[header] || INVENTORY_FIELD_MAP[header] || header] || '-'}
                          </TableCell>
                        ))}
                        <TableCell className="text-center">
                          {row.errors.length > 0 ? (
                            <Badge variant="destructive" className="text-[9px] px-1 py-0">
                              {row.errors.length} 错误
                            </Badge>
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mx-auto" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Import progress */}
          {importing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  导入中...
                </span>
                <span className="text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Result summary */}
          {result && (
            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="font-medium text-green-700 dark:text-green-400">{result.success}</span>
                  <span className="text-muted-foreground">条成功导入</span>
                </div>
                {result.errors.length > 0 && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <span className="font-medium text-red-700 dark:text-red-400">{result.errors.length}</span>
                    <span className="text-muted-foreground">条失败</span>
                  </div>
                )}
              </div>

              {/* Error details */}
              {result.errors.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowErrors(!showErrors)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
                  >
                    {showErrors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    查看错误详情
                  </button>
                  {showErrors && (
                    <div className="mt-2 max-h-40 overflow-y-auto rounded border bg-background p-2 space-y-1">
                      {result.errors.map((err, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                            行{err.row}
                          </Badge>
                          <span className="text-muted-foreground">{err.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} size="sm">
            {result ? '关闭' : '取消'}
          </Button>
          {!result && (
            <Button
              onClick={handleImport}
              disabled={parsedRows.length === 0 || importing}
              size="sm"
            >
              {importing ? '导入中...' : '确认导入'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
