# Task 5-a: Integrate Supply Chain Score API into Dashboard

## Summary
Successfully integrated the `/api/supply-chain-score` API into the DashboardTab by creating a new shared component and data hook.

## Changes Made

### 1. API Client (`src/lib/api-client.ts`)
- Added `fetchSupplyChainScore(detailed = false)` function

### 2. Data Hook (`src/hooks/use-supply-chain-data.ts`)
- Added `useSupplyChainScore(detailed = false)` hook using React Query
- Added `fetchSupplyChainScore` to imports

### 3. New Component (`src/components/shared/SupplyChainScoreCard.tsx`)
- Animated circular SVG gauge (0→score ease-out animation)
- Grade badge with color coding (A-F)
- 5 sub-scores as horizontal progress bars (库存/成本/物流/销售/风险)
- Top 3 recommendations with priority badges
- Collapsible "详细分析" section
- Loading skeleton, error state, dark mode, responsive layout
- ~180 lines

### 4. Dashboard Integration (`src/components/dashboard/DashboardTab.tsx`)
- Replaced static hardcoded health score card with `<SupplyChainScoreCard />`
- Added import for SupplyChainScoreCard

## Verification
- ✅ Lint: 0 errors, 0 warnings
- ✅ Dev server: `/api/supply-chain-score` returning 200
- ✅ No new dependencies added
