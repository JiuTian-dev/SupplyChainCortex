# Task 5-b: Warehouse Zones Visualization and Stock Adjustment UI

## Summary
Added warehouse zone visualization panel and stock adjustment dialog to the supply chain dashboard's inventory tab.

## Work Completed

### Data Hooks (use-supply-chain-data.ts)
- Added `useWarehouseZones()` hook - fetches zone data from `/api/warehouse?action=zones`
- Added `useWarehouseTrend()` hook - fetches 7-day utilization trend from `/api/warehouse?action=utilization_trend`

### API Client Functions (api-client.ts)
- `fetchWarehouseZones()` - GET zones data
- `fetchWarehouseTrend()` - GET utilization trend
- `stockAdjustment({ sku, quantity, reason, warehouse? })` - POST stock adjustment
- `stockTransfer({ sku, fromZone, toZone, quantity, reason? })` - POST stock transfer

### WarehouseZonesPanel Component
- Zone cards grid with color-coded utilization bars (green <70%, yellow 70-90%, red >90%)
- Status badges: 正常/拥挤/满仓
- 7-day utilization trend AreaChart with gradient fill and trend direction indicator
- Summary badges (total/critical/warning zones)
- Stock Transfer dialog with warehouse selects, SKU picker, quantity validation
- React Query mutation with query invalidation

### StockAdjustmentDialog Component
- SKU dropdown (pre-fillable via defaultSku prop)
- Quantity input (positive=inbound, negative=outbound)
- Reason dropdown with 6 options and direction icons
- Current stock display and adjustment preview panel
- New status prediction with color coding
- React Query mutation with toast notifications

### InventoryTab Integration
- WarehouseZonesPanel added below warehouse capacity section
- "库存调整" button added to inventory action bar
- StockAdjustmentDialog connected at component root level

## Lint Status
All new/modified files pass lint with 0 errors, 0 warnings.
