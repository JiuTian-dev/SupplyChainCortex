---
Task ID: 2-c+3
Agent: Sales Forecast & Mobile Agent
Task: Sales Forecast Panel + Mobile Responsiveness Enhancement

Work Log:

### Part A: Sales Forecast Panel

#### 1. Created SalesForecastPanel component
- **File**: `/home/z/my-project/src/components/sales/SalesForecastPanel.tsx`
- Area chart showing historical sales (solid area, last 30 days) and forecast projection (dashed area, next 14 days) with confidence interval
- 4 forecast metric cards: projected total revenue, expected growth rate, confidence level, top trending products
- Per-product forecast table: product name, SKU, current daily avg, projected daily avg, trend direction, confidence
- Methodology note explaining the forecast method (linear regression + seasonal adjustment)
- Animated entrance (card-entrance) + dark mode support + responsive layout
- Fixed React Hooks rules violation (useMemo called after early returns)

#### 2. Enhanced Sales API with overall forecast action
- **File**: `/home/z/my-project/src/app/api/sales/route.ts`
- Added overall forecast when no SKU is provided (`?action=forecast&horizon=14`)
- Linear regression (least squares) on daily revenue with slope + intercept
- Seasonal adjustment: weekday multipliers computed from historical data (7-day cycle)
- Confidence intervals: ±1.96 standard deviations from regression residuals
- Per-product forecasts with linear regression, trend direction (up/down/stable), and CV-based confidence
- Returns: dailyProjections, historicalDaily, perProductForecasts, summary (projectedRevenue, growthRate, confidence, method)
- Existing SKU-based forecast preserved (when sku parameter is provided)

#### 3. Added fetchSalesForecast to api-client.ts
- `fetchSalesForecast()` calls `/api/sales?action=forecast&horizon=14`

#### 4. Added useSalesForecast hook to use-supply-chain-data.ts
- `useSalesForecast()` with queryKey `['sales', 'forecast-overall']`

#### 5. Integrated SalesForecastPanel into SalesTab.tsx
- Added import and placed below SalesPlatformAnalytics section
- Passes `productSummaries` as props

### Part B: Mobile Responsiveness Enhancement

#### 6. InventoryTab.tsx
- Metric cards grid: `grid-cols-2 sm:grid-cols-4` with responsive gaps
- ABC/turnover grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- Turnover chart: `sm:col-span-2` for proper span
- Procurement table: Added `overflow-x-auto` wrapper
- Main inventory table: Added `overflow-x-auto`, hidden columns on mobile:
  - 仓库 column: `hidden sm:table-cell`
  - 安全库存: `hidden sm:table-cell`
  - 在途/周转天数: `hidden md:table-cell`
  - 操作: `hidden sm:table-cell`

#### 7. CostTab.tsx
- Metric cards grid: `grid-cols-2 sm:grid-cols-4` with responsive gaps
- Chart grid: `gap-4 sm:gap-6`
- Cost detail table: Added `overflow-x-auto`, hidden columns:
  - 原材料/人工: `hidden sm:table-cell`
  - 物流/关税: `hidden md:table-cell`
  - 平台费: `hidden lg:table-cell`
- CostSimulatorEnhanced: Responsive gaps, `overflow-x-auto` on results table

#### 8. LogisticsTab.tsx
- Metric cards grid: `grid-cols-2 sm:grid-cols-4` with responsive gaps
- Route cards: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`
- ShipmentCard: `flex-col sm:flex-row` layout, `flex-wrap` on action buttons
- Shipment info text: `flex-wrap` for smaller screens
- Card padding: `p-3 sm:p-4`

#### 9. SalesTab.tsx
- Metric cards grid: `grid-cols-2 sm:grid-cols-4` with responsive gaps
- Chart grid: `gap-4 sm:gap-6`
- All charts: Added `minHeight={200}` for consistent rendering on small screens
- Sales detail table: Added `overflow-x-auto`, hidden columns:
  - 分类: `hidden sm:table-cell`
  - 日均: `hidden sm:table-cell`
  - 环比/同比: `hidden md:table-cell`
  - 最佳平台: `hidden lg:table-cell`

#### 10. RiskTab.tsx
- Metric cards grid: `gap-3 sm:gap-4`
- Risk dimensions: `gap-4 sm:gap-6`
- Risk dimension cards grid: `grid-cols-1 sm:grid-cols-2` (removed lg:grid-cols-3 for better mobile)
- Procurement table: Added `overflow-x-auto`
- RiskMatrixHeatmap: Reduced `min-w` from 340px to 300px for better mobile fit

### Lint Status
- Fixed React Hooks violation in SalesForecastPanel (useMemo after early return)
- Final lint: 0 errors, 0 warnings

### API Verification
- `/api/sales?action=forecast&horizon=14` returns correct data with dailyProjections, historicalDaily, perProductForecasts, and summary metrics

Stage Summary:
- Created 1 new component (SalesForecastPanel) with area chart, metrics cards, per-product table, and methodology note
- Enhanced 1 API route (Sales forecast) with overall forecast (no SKU required) using linear regression + seasonal adjustment
- Added 1 API client function (fetchSalesForecast) and 1 React Query hook (useSalesForecast)
- Enhanced mobile responsiveness across 5 Tab components (Inventory, Cost, Logistics, Sales, Risk) with:
  - Responsive grid patterns (grid-cols-2 sm:grid-cols-4)
  - Scrollable tables (overflow-x-auto)
  - Hidden non-essential columns on mobile (hidden sm:table-cell / md:table-cell / lg:table-cell)
  - Chart min-height for consistent rendering
  - Flexible card layouts (flex-col sm:flex-row)
  - Risk matrix scrollability improvements
- Lint: 0 errors, 0 warnings
