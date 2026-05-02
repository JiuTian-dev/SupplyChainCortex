# Task: fix-notif-warehouse - Bug Fix Agent

## Summary
Fixed two critical bugs:
1. **Notification Center empty** - API data was never loaded into Zustand store
2. **Warehouse Capacity Heatmap no data** - Wrong data access path (extra `.data` wrapper)

## Files Changed
1. `src/components/shared/NotificationCenter.tsx` - Added useNotifications hook + useEffect to sync API data to store
2. `src/components/inventory/InventoryTab.tsx` - Fixed `.data?.capacity` → `?.capacity` (2 occurrences)
3. `src/components/sales/SalesTab.tsx` - Fixed pre-existing lint error (productSummaries accessed before declaration)

## Lint: 0 errors, 6 warnings (pre-existing)
