# Task 1-d: Migrate cost route inline logic to cost.service.ts

## Summary
Extracted inline "optimization" (~325 lines) and "trend" (~95 lines) business logic from `/api/cost/route.ts` into two new service functions in `cost.service.ts`, with caching added.

## Files Modified
1. **`/home/z/my-project/src/lib/services/cost.service.ts`**
   - Added `import { cachedFetch, cacheKey, CACHE_TTL } from '@/lib/cache'`
   - Added `getCostOptimization(category?: string)` — wrapped with `cachedFetch(key, ..., CACHE_TTL.LONG)`
   - Added `getCostTrend(category?: string, months?: number)` — wrapped with `cachedFetch(key, ..., CACHE_TTL.MEDIUM)`

2. **`/home/z/my-project/src/app/api/cost/route.ts`**
   - Added `getCostOptimization` and `getCostTrend` to imports
   - Replaced ~325-line inline optimization block with 3-line service call
   - Replaced ~95-line inline trend block with 3-line service call
   - Route reduced from ~682 lines to ~271 lines

## API Contract
- **Unchanged** — response shapes remain identical
- `/api/cost?action=optimization` — same JSON structure
- `/api/cost?action=trend&months=N` — same JSON structure
- Category filtering still works identically

## Caching
- `getCostOptimization`: `CACHE_TTL.LONG` (5 min), key = `cost:optimization:{category}`
- `getCostTrend`: `CACHE_TTL.MEDIUM` (60s), key = `cost:trend:{category}:{months}`

## Verification
- Lint: 0 errors, 0 warnings
- Both API endpoints tested and returning 200 with correct data
- Category filter tested and working
