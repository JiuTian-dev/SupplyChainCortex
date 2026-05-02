# Task 1-c: Create export.service.ts + Refactor export route

## Work Log

### 1. Created `/home/z/my-project/src/lib/services/export.service.ts`

Extracted all inline data query logic from the export route into a dedicated service file:

**Data Query Functions (return plain arrays, no NextResponse):**
- `exportInventoryData(startDate?, endDate?)` — Inventory with stock status labels, days of supply, ABC/FSN classification
- `exportCostData(startDate?, endDate?)` — Cost records with margin calculations and composition percentages
- `exportLogisticsData(startDate?, endDate?)` — Shipment items with status and risk level labels
- `exportSalesData(startDate?, endDate?)` — Sales records with computed unit price
- `exportSupplierData()` — Supplier list with status labels (extracted from the supplier_report case)

**CSV Utility Functions:**
- `escapeCsvField(field)` — Handles commas, quotes, newlines in CSV fields
- `convertToCsv(records)` — Converts array of records to CSV string

**Type Exports:**
- `ExportModule` — Union type for valid modules (inventory, cost, logistics, sales, all)
- `ReportType` — Union type for valid report types
- `ExportFormat` — Union type for valid formats (csv, json)
- `EXPORT_MODULES`, `REPORT_TYPES`, `EXPORT_FORMATS` — Constant arrays for validation
- `MODULE_NAMES` — Display names for section headers in "all" CSV export

### 2. Refactored `/home/z/my-project/src/app/api/export/route.ts`

Replaced the 438-line monolithic route with a thin handler (~210 lines):

**Route responsibilities (HTTP layer only):**
- Parameter extraction and validation (format, module, dates, report type)
- `withErrorHandler` wrapper for standardized error handling
- `apiError` for error responses instead of raw NextResponse.json
- Format conversion and file download headers (JSON/CSV)
- Report export orchestration

**Kept in route (returns NextResponse):**
- `exportAsJson(data, module)` — JSON attachment response
- `exportAsCsv(data, module)` — CSV attachment response (single module + "all" sections)
- `handleReportExport(reportType, format, startDate?, endDate?)` — Report export with file download

### 3. Updated `/home/z/my-project/src/lib/services/index.ts`

Added: `export * from './export.service';`

### Verification

- ✅ Lint: 0 errors, 0 warnings
- ✅ `GET /api/export?module=inventory` → 200, CSV with BOM + correct headers
- ✅ `GET /api/export?module=inventory&format=json` → 200, JSON attachment
- ✅ `GET /api/export?module=report&type=supplier_report` → 200, CSV attachment
- ✅ `GET /api/export?module=invalid` → 400, standardized apiError response
- ✅ CSV output format identical (same columns, same data, same BOM prefix)
- ✅ Download headers identical (Content-Disposition, Content-Type)
