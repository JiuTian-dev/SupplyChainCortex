'use client';

import type { Permission } from '@/lib/rbac';
import { usePermissions } from '@/hooks/use-permission';

interface PermissionGateProps {
  /** Single permission required to show children */
  permission?: Permission;
  /** Multiple permissions - checked according to mode */
  permissions?: Permission[];
  /** How to check multiple permissions: 'any' = at least one, 'all' = every one. Default 'all' */
  mode?: 'any' | 'all';
  /** What to render when access is denied. Default: null */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Conditionally renders children based on the current user's permissions.
 *
 * - If not authenticated → shows fallback
 * - If no permission match → shows fallback
 * - Otherwise → shows children
 */
export function PermissionGate({
  permission,
  permissions,
  mode = 'all',
  fallback = null,
  children,
}: PermissionGateProps) {
  const { isAuthenticated, has, hasAny, hasAll } = usePermissions();

  // Not authenticated → show fallback
  if (!isAuthenticated) {
    return <>{fallback}</>;
  }

  // Single permission check
  if (permission) {
    if (!has(permission)) {
      return <>{fallback}</>;
    }
    return <>{children}</>;
  }

  // Multiple permissions check
  if (permissions && permissions.length > 0) {
    const permitted = mode === 'any' ? hasAny(permissions) : hasAll(permissions);
    if (!permitted) {
      return <>{fallback}</>;
    }
    return <>{children}</>;
  }

  // No permission specified → just check auth
  return <>{children}</>;
}
