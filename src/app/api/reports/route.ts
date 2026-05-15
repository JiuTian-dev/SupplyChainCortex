// Lightweight re-export: /api/reports now delegates to the unified /api/analytics route.
// All report actions were merged into the analytics handler; this file exists only for
// backward compatibility. Frontend callers should use /api/analytics directly.
export { GET } from '../analytics/route';
