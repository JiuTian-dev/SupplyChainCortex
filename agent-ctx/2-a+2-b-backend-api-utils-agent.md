# Task 2-a+2-b: Backend API Utils Agent

## Task
Create centralized API utilities and Zod validation schemas

## Work Log

### 1. Created `src/lib/validators/common.ts`
- DATE_REGEX: `/^\d{4}-\d{2}-\d{2}$/` shared regex
- dateRangeSchema: `{ startDate?, endDate? }` with YYYY-MM-DD validation
- paginationSchema: `{ page: coerce.int.positive.default(1), pageSize: coerce.int.positive.max(100).default(20) }`
- skuSchema: `z.string().min(1).max(50)`
- platformSchema: `z.enum(['Amazon', 'Shopify', 'Walmart', 'eBay', 'Temu'])`
- stockStatusSchema: `z.enum(['healthy', 'warning', 'critical', 'overstock'])`
- prioritySchema: `z.enum(['normal', 'important', 'urgent'])`
- categorySchema: `z.enum(['general', 'inventory', 'cost', 'logistics', 'sales'])`
- shipmentStatusSchema: `z.enum(['pending', 'in_transit', 'customs', 'delivered', 'delayed', 'exception'])`
- warehouseSchema: `z.enum(['华东仓', '华南仓'])`
- All types exported

### 2. Created `src/lib/validators/inventory.ts`
- inventoryAdjustmentSchema: `{ sku, quantity (nonzero int), reason }`
- inventoryBulkUpdateSchema: `{ updates: array (1-100) of { id?, sku?, warehouse?, quantity?, safetyStock?, reorderPoint?, stockStatus? } }`
- stockTransferSchema: `{ sku, fromWarehouse, toWarehouse, quantity (positive int) }` with `.refine()` ensuring fromWarehouse !== toWarehouse

### 3. Created `src/lib/validators/logistics.ts`
- shipmentStatusUpdateSchema: `{ trackingNumber, status (enum), eta?, progress (0-100)?, notes? }`
- VALID_STATUS_TRANSITIONS map: pending→[in_transit,delayed], in_transit→[customs,delivered,delayed], customs→[delivered,delayed], delayed→[in_transit,customs,delivered], delivered→[], exception→[]
- isValidStatusTransition() helper function

### 4. Created `src/lib/validators/notes.ts`
- createNoteSchema: `{ content (min 1, max 2000), category (default 'general'), priority (default 'normal'), author?, sku? }`
- updateNoteSchema: `{ id, isResolved?, priority? }`

### 5. Created `src/lib/validators/products.ts`
- productSearchSchema: `{ q (min 2), category? }`
- productDetailSchema: `{ id?, sku? }` with `.refine()` ensuring at least one is provided

### 6. Created `src/lib/validators/suppliers.ts`
- supplierRatingSchema: `{ deliveryScore (0-5), qualityScore (0-5), priceScore (0-5), communicationScore (0-5), comments? }`

### 7. Created `src/lib/validators/index.ts`
- Re-exports all schemas and types from all validator modules

### 8. Created `src/lib/api-utils.ts`
- **Response helpers**: apiSuccess(data, status?), apiError(message, status?, code?), apiPaginated(data, pagination)
- **Error classes**: AppError (custom error with status + code), plus factory helpers: NotFoundError, ValidationError, UnauthorizedError, ForbiddenError, ConflictError
- **Error handler wrapper**: withErrorHandler(handler) wraps API route with try/catch, handles AppError, ZodError, and unexpected errors
- **Validation helpers**: validateRequest(schema, data), validateQuery(schema, request), validateBody(schema, request)
- **Pagination helpers**: paginate(items, { page, pageSize }), parsePagination(searchParams)
- **Common query helpers**: parseDateRange(searchParams), re-exported DATE_REGEX

## Stage Summary
- 8 new files created: 1 api-utils.ts + 6 validator files + 1 index
- Centralized API response format: `{ success, data/error, timestamp }`
- Comprehensive Zod v4 schemas covering inventory, logistics, notes, products, suppliers
- All schemas use `.refine()` for cross-field validation where needed
- Lint: 0 errors, 0 warnings
